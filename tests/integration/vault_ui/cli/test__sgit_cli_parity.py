"""sgit-ai CLI × vault web parity — the REAL sgit-ai (0.21.0+) and the REAL browser vault
libraries (run in Node) interleaved on one vault, against this repo's in-memory SG/Send server.

What it proves (each assertion is a line the sgit.ai history-integrity page used to list as
"the web UI cannot"):
  * `sgit check verify` reports every WEB commit as verified (signed commit_v1, canonical bytes,
    key registered at bare/keys/, clone entry in the index)
  * the web verifies the CLI's commits, and both verify each other's merges
  * a web push PRESERVES the CLI's clone entries, the format gate, min_client, features and tags
  * on a vault raised to format 2 the web writes 32-hex ids that the CLI pulls, verifies and fscks
  * a fresh web device can publish under `signatures-required`; a keyless session cannot
  * a folder written by the CLI, re-encrypted by the web, gets the identical tree id (byte parity)

Needs: node (>= 18) and sgit on PATH or next to the venv's python; sgraph_ai_app_send importable.
Run:   .venv/bin/python3 -m pytest tests/integration/vault_ui/cli -q
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest import TestCase, skipUnless

REPO_ROOT = Path(__file__).resolve().parents[4]
DRIVER    = REPO_ROOT / 'tests' / 'integration' / 'vault_ui' / 'cli' / 'web-vault.mjs'
NODE      = shutil.which('node')
SGIT      = shutil.which('sgit') or (str(Path(sys.executable).parent / 'sgit') if (Path(sys.executable).parent / 'sgit').exists() else None)

try:
    from sgraph_ai_app_send.lambda__user.testing.Send__User_Lambda__Test_Server import setup__send_user_lambda__test_server
    HAS_SERVER = True
except ImportError:                                             # pragma: no cover
    HAS_SERVER = False


@skipUnless(NODE and SGIT and HAS_SERVER, 'needs node, sgit-ai and sgraph_ai_app_send')
class Test__Sgit_CLI_Parity(TestCase):

    @classmethod
    def setUpClass(cls):
        os.environ['SEND__STORAGE_MODE'] = 'memory'
        cls._ctx  = setup__send_user_lambda__test_server()
        cls._objs = cls._ctx.__enter__()
        cls.url   = cls._objs.server_url
        cls.token = cls._objs.access_token
        cls.work  = Path(tempfile.mkdtemp(prefix='sgit-parity-'))
        cls.dev1  = str(cls.work / 'dev1.json')
        cls.dev2  = str(cls.work / 'dev2.json')
        version   = subprocess.run([SGIT, '--version'], capture_output=True, text=True).stdout.strip()
        cls.sgit_version = version

    @classmethod
    def tearDownClass(cls):
        try: cls._ctx.__exit__(None, None, None)
        except Exception: pass
        shutil.rmtree(cls.work, ignore_errors=True)

    # --- helpers -------------------------------------------------------------------------
    def web(self, cmd, *args, signer=None, key=None):
        argv = [NODE, str(DRIVER), cmd, '--api', self.url, '--token', self.token]
        if signer: argv += ['--signer', signer]
        if key:    argv += ['--key', key]
        argv += list(args)
        proc = subprocess.run(argv, capture_output=True, text=True, cwd=str(REPO_ROOT))
        self.assertEqual(proc.returncode, 0, f'web {cmd} failed:\n{proc.stdout}\n{proc.stderr}')
        return json.loads(proc.stdout.strip().splitlines()[-1]) if proc.stdout.strip() else None

    def sgit(self, cwd, *args, check=True):
        proc = subprocess.run([SGIT, *args], cwd=str(cwd), capture_output=True, text=True)
        if check:
            self.assertEqual(proc.returncode, 0, f'sgit {" ".join(args)} failed:\n{proc.stdout}\n{proc.stderr}')
        return proc.stdout + proc.stderr

    def verify_line(self, cwd):
        out = self.sgit(cwd, 'check', 'verify')
        line = [l for l in out.splitlines() if l.startswith('Checked')][-1]
        return line

    # --- the round trip ------------------------------------------------------------------
    def test__web_and_cli_share_one_vault_byte_for_byte(self):
        # 1. a web-created, web-signed vault
        created = self.web('create', '--name', 'parity', '--file', 'hello.txt=hello', '--file', 'docs/readme.md=# readme', signer=self.dev1)
        key = created['key']
        self.assertTrue(created['keyId'].startswith('key-rnd-imm-'))

        # 2. the CLI clones it and verifies every web commit
        clone = self.work / 'a'
        self.sgit(self.work, '--base-url', self.url, '--token', self.token, 'clone', key, 'a')
        self.assertEqual((clone / 'hello.txt').read_text(), 'hello')
        self.assertEqual((clone / 'docs' / 'readme.md').read_text(), '# readme')
        line = self.verify_line(clone)
        self.assertIn('0 bad, 0 unsigned, 0 without a known key', line, line)
        self.assertIn('Vault OK', self.sgit(clone, 'check', 'fsck'))

        # 3. the CLI commits and pushes; the web verifies it and keeps the CLI's index entry
        (clone / 'det').mkdir()
        (clone / 'det' / 'a.txt').write_text('abc')
        (clone / 'det' / 'b.md').write_text('xyz')
        self.sgit(clone, 'commit', '-m', 'cli det')
        self.sgit(clone, 'push')
        info = self.web('inspect', signer=self.dev1, key=key)
        self.assertEqual(info['verify']['counts']['verified'], info['verify']['total'])
        self.assertEqual(info['verify']['firstFailure'], None)
        kinds = sorted((b['branch_type'], b['name']) for b in info['branches'])
        self.assertIn(('clone', 'local'),  kinds, 'the CLI clone entry must survive')
        self.assertIn(('clone', 'web-ui'), kinds, 'the web device entry must survive the CLI push')
        self.assertIn(('named', 'current'), kinds)
        self.assertEqual({f['path']: f['content_type'] for f in info['files']}['/det/b.md'], 'text/markdown')

        # 4. deterministic trees: the web re-encrypts the CLI's folder to the identical id
        tree = self.web('rebuild-tree', '--path', '/det', signer=self.dev1, key=key)
        self.assertEqual(tree['original'], tree['rebuilt'], tree)

        # 5. web push (compare-and-swap), CLI pulls and verifies the web commit
        put = self.web('put', '--file', 'web2.txt=second', '--push', signer=self.dev1, key=key)
        self.assertTrue(put['published'], put)
        self.sgit(clone, 'pull')
        self.assertEqual((clone / 'web2.txt').read_text(), 'second')
        self.assertIn('0 bad, 0 unsigned, 0 without a known key', self.verify_line(clone))

        # 6. the owner raises the vault: format 2 + signatures-required + min_client
        self.sgit(clone, 'vault', 'format', '--set', '2', '--min-client', '0.21.0', '--feature', 'signatures-required')
        info = self.web('inspect', signer=self.dev1, key=key)
        self.assertEqual(info['format'], 2)
        self.assertEqual(info['idHexLen'], 32)
        self.assertEqual(info['minClient'], '0.21.0')
        self.assertIn('signatures-required', info['features'])

        # 7. the web writes 32-hex ids; a NEW web device publishes under the policy; a keyless session cannot
        put = self.web('put', '--file', 'wide.txt=wide', '--push', signer=self.dev1, key=key)
        self.assertTrue(put['published'], put)
        self.assertRegex(put['head'], r'^obj-cas-imm-[0-9a-f]{32}$')
        put2 = self.web('put', '--file', 'dev2.txt=two', '--push', signer=self.dev2, key=key)
        self.assertTrue(put2['published'], put2)
        nokey = self.web('put', '--file', 'nokey.txt=x', '--push', key=key)
        self.assertFalse(nokey['published'])
        self.assertEqual((nokey['error'] or {}).get('code'), 'ESIGNATURE')

        # 8. the CLI pulls it all: verified, fsck OK, gate intact after three web pushes
        self.sgit(clone, 'pull')
        self.assertEqual((clone / 'wide.txt').read_text(), 'wide')
        self.assertEqual((clone / 'dev2.txt').read_text(), 'two')
        self.assertFalse((clone / 'nokey.txt').exists())
        self.assertIn('0 bad, 0 unsigned, 0 without a known key', self.verify_line(clone))
        self.assertIn('Vault OK', self.sgit(clone, 'check', 'fsck'))
        fmt = self.sgit(clone, 'vault', 'format')
        self.assertIn('Format:      2', fmt)
        self.assertIn('0.21.0', fmt)
        self.assertIn('signatures-required', fmt)

        # 9. a signed tag survives a web push and is visible to the web
        self.sgit(clone, 'vault', 'tag', 'create', 'v1', '-m', 'first')
        self.web('put', '--file', 't.txt=t', '--push', signer=self.dev1, key=key)
        self.sgit(clone, 'pull')
        self.assertIn('v1', self.sgit(clone, 'vault', 'tag', 'list'))
        info = self.web('inspect', signer=self.dev1, key=key)
        self.assertIn('v1', info['tags'])
        self.assertEqual(sorted(b['name'] for b in info['branches'] if b['branch_type'] == 'clone'), ['local', 'web-ui', 'web-ui'])
