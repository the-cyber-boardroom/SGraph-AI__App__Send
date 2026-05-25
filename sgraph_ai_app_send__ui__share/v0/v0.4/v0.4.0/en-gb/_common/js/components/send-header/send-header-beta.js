/* =============================================================================
   SGraph Send — Header Beta Badge
   Adds a "Beta" badge next to the SG/Send logo on all pages.

   This is a surgical overlay — patches SendHeader.render to inject
   the badge after the logo text. Does not modify the original file.
   ============================================================================= */

(function() {

'use strict';

if (typeof SendHeader === 'undefined') {
    console.warn('[send-header-beta] SendHeader not found — skipping');
    return;
}

var _origRender = SendHeader.prototype.render;

SendHeader.prototype.render = function() {
    _origRender.call(this);

    // Inject Beta badge after the logo
    var logo = this.querySelector('.sg-header__logo');
    if (logo && !logo.querySelector('.sg-header__beta')) {
        var badge = document.createElement('span');
        badge.className = 'sg-header__beta';
        badge.textContent = 'Beta';
        logo.appendChild(badge);
    }
};

// Style the badge
var s = document.createElement('style');
s.id = 'sg-header-beta-styles';
s.textContent = '\
    .sg-header__beta {\
        display: inline-block;\
        font-size: 0.55rem;\
        font-weight: 700;\
        letter-spacing: 0.08em;\
        text-transform: uppercase;\
        color: #1A1A2E;\
        background: var(--accent, #4ECDC4);\
        padding: 1px 6px;\
        border-radius: 3px;\
        margin-left: 8px;\
        vertical-align: middle;\
        line-height: 1.6;\
        position: relative;\
        top: -1px;\
    }\
';
document.head.appendChild(s);

// Re-render any existing headers to pick up the badge
document.querySelectorAll('send-header').forEach(function(el) {
    if (el.render) el.render();
});

console.log('[send-header-beta] Beta badge added');

})();
