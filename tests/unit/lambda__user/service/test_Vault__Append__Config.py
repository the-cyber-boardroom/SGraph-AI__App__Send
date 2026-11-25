# ===============================================================================
# Tests — append lane config rules (v2 Phase 2: 2.4, 2.5/2.10, 2.7, 2.8, 2.11)
# Pure validation + merge; no storage.
# ===============================================================================

import hashlib
from   unittest                                                                    import TestCase
from   sgraph_ai_app_send.lambda__user.service.Vault__Append__Config               import (Vault__Append__Config, Vault__Append__Config__Error,
                                                                                          APPEND_DEFAULT_HARD_PENDING, LANE_BYTES_FLOOR, TOKEN_LANE_HARD_CEILING)

def _h(value):
    return hashlib.sha256(value.encode()).hexdigest()

LANE_A, LANE_B = _h('token-a'), _h('token-b')
BASE           = dict(append_anchors=[LANE_A, LANE_B], enum_key_hash=_h('legacy-enum'))


class test_Vault__Append__Config(TestCase):

    def setUp(self):
        self.rules = Vault__Append__Config()

    def _merge(self, request, config=None):
        return self.rules.merge(dict(BASE) if config is None else config, request)

    def _refused(self, request, config=None):
        with self.assertRaises(Vault__Append__Config__Error):
            self._merge(request, config)

    # --- defaults and layering ---------------------------------------------------------

    def test__a_lane_with_no_settings_behaves_as_before(self):
        settings = self.rules.lane_settings(BASE, LANE_A)
        assert settings == dict(soft_pending=APPEND_DEFAULT_HARD_PENDING, hard_pending=APPEND_DEFAULT_HARD_PENDING,
                                max_pending_bytes=None, retention_days=None, mode=None)

    def test__layering__lane_overrides_defaults(self):
        config, _ = self._merge(dict(lane_defaults=dict(hard_pending=3000, retention_days=30),
                                     lanes={LANE_A: dict(hard_pending=4000, soft_pending=1000)}))
        assert self.rules.lane_settings(config, LANE_A) == dict(soft_pending=1000, hard_pending=4000, max_pending_bytes=None, retention_days=30, mode=None)
        assert self.rules.lane_settings(config, LANE_B) == dict(soft_pending=3000, hard_pending=3000, max_pending_bytes=None, retention_days=30, mode=None)

    # --- 2.7: typed, bounded ---------------------------------------------------------------

    def test__unknown_fields_are_refused(self):
        self._refused(dict(webhook_url='https://example.com/hook'))                  # the webhook is out of scope: never stored
        self._refused(dict(lanes={LANE_A: dict(label='Dinis CRM')}))                 # no plaintext labels
        self._refused(dict(lane_defaults=dict(mode='signed')))                       # Phase 4 field: not settable here

    def test__wrong_types_are_refused(self):
        for value in (float('nan'), float('inf'), True, 5.5, '5000', [10]):
            self._refused(dict(lanes={LANE_A: dict(hard_pending=value)}))

    def test__ranges_and_classes(self):
        self._refused(dict(lanes={LANE_A: dict(hard_pending=0)}))
        self._refused(dict(lanes={LANE_A: dict(hard_pending=TOKEN_LANE_HARD_CEILING + 1)}))
        self._refused(dict(lanes={LANE_A: dict(max_pending_bytes=LANE_BYTES_FLOOR - 1)}))
        self._refused(dict(lanes={LANE_A: dict(retention_days=2)}))
        self._merge  (dict(lanes={LANE_A: dict(hard_pending=TOKEN_LANE_HARD_CEILING, retention_days=1)}))

    def test__soft_cannot_exceed_hard__on_the_merged_result(self):
        self._refused(dict(lanes={LANE_A: dict(soft_pending=2000)}))                 # default hard is 1000
        config, _ = self._merge(dict(lane_defaults=dict(hard_pending=3000)))
        self._merge(dict(lanes={LANE_A: dict(soft_pending=2000)}), config)           # fine once the stored default hard is 3000

    def test__lane_settings_must_name_an_anchor(self):
        self._refused(dict(lanes={_h('not-an-anchor'): dict(hard_pending=10)}))
        self._refused(dict(append_anchors=[LANE_A], lanes={LANE_B: dict(hard_pending=10)}))    # named in the same request: still a typo guard

    def test__removing_an_anchor_drops_its_settings(self):                      # sg-append.js re-sends the whole anchor list: a rotation must not 400
        config, _ = self._merge(dict(lanes={LANE_A: dict(hard_pending=10), LANE_B: dict(hard_pending=20)}))
        config, _ = self._merge(dict(append_anchors=[LANE_A]), config)
        assert config['append_anchors'] == [LANE_A] and config['lanes'] == {LANE_A: dict(hard_pending=10)}
        config, _ = self._merge(dict(append_anchors=[_h('token-c')]), config)
        assert 'lanes' not in config

    def test__caps(self):
        self._refused(dict(append_anchors=[_h(f'a{i}') for i in range(257)]))
        self._refused(dict(add_enum_keys={_h(f'k{i}'): dict(lanes='*') for i in range(17)}))
        self._refused(dict(append_anchors=['not-hex']))

    # --- 2.8: merge, never replace -------------------------------------------------------

    def test__a_partial_update_keeps_every_other_field(self):
        config, _ = self._merge(dict(lanes={LANE_A: dict(hard_pending=4000, soft_pending=2000)}))
        config['lanes'][LANE_A]['mode'] = 'signed'                                   # written by a later version
        config, _ = self._merge(dict(lanes={LANE_A: dict(retention_days=90)}), config)
        assert config['lanes'][LANE_A] == dict(hard_pending=4000, soft_pending=2000, mode='signed', retention_days=90)

    def test__null_removes_a_field_or_a_lane(self):
        config, _ = self._merge(dict(lanes={LANE_A: dict(hard_pending=4000, retention_days=30)}))
        config, _ = self._merge(dict(lanes={LANE_A: dict(retention_days=None)}), config)
        assert config['lanes'][LANE_A] == dict(hard_pending=4000)
        config, _ = self._merge(dict(lanes={LANE_A: None}), config)
        assert 'lanes' not in config

    # --- 2.5 / 2.10: scoped read keys ------------------------------------------------------

    def test__scoped_read_keys(self):
        config, _ = self._merge(dict(add_enum_keys={_h('feedback-key'): dict(lanes=[LANE_A]), _h('maestro-key'): dict(lanes='*')}))
        assert self.rules.enum_scope(config, _h('feedback-key')) == {LANE_A}
        assert self.rules.enum_scope(config, _h('maestro-key'))  == '*'
        assert self.rules.enum_scope(config, _h('legacy-enum'))  == '*'
        assert self.rules.enum_scope(config, _h('stranger'))     is None
        config, _ = self._merge(dict(remove_enum_keys=[_h('feedback-key')]), config)
        assert self.rules.enum_scope(config, _h('feedback-key')) is None

    def test__the_legacy_key_is_never_silently_restored(self):                   # sg-append.js re-sends enum_key_hash on every configure
        config, _       = self._merge(dict(add_enum_keys={_h('feedback-key'): dict(lanes=[LANE_A])}, remove_legacy_enum_key=True))
        assert 'enum_key_hash' not in config
        config, ignored = self._merge(dict(enum_key_hash=_h('legacy-enum')), config)
        assert ignored == ['enum_key_hash'] and 'enum_key_hash' not in config
        config, ignored = self._merge(dict(enum_key_hash=_h('legacy-enum'), legacy_enum_key=True), config)
        assert ignored == [] and config['enum_key_hash'] == _h('legacy-enum')

    def test__re_sending_the_current_legacy_key_is_a_no_op(self):
        config, _       = self._merge(dict(add_enum_keys={_h('feedback-key'): dict(lanes=[LANE_A])}))
        config, ignored = self._merge(dict(enum_key_hash=_h('legacy-enum')), config)
        assert ignored == [] and config['enum_key_hash'] == _h('legacy-enum')

    def test__request_only_validation_skips_stored_state_checks(self):
        self.rules.merge({}, dict(lanes={LANE_A: dict(soft_pending=2000)}), cross_checks=False)   # needs the stored default hard: checked later
        with self.assertRaises(Vault__Append__Config__Error):
            self.rules.merge({}, dict(lanes={LANE_A: dict(soft_pending=True)}), cross_checks=False)
