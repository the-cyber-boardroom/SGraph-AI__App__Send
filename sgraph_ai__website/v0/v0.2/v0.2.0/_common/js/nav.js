/* ═══════════════════════════════════════════════════════════════════════════
   SGraph AI Website v0.2.0 — Common page initialisation
   Handles: mobile nav toggle, i18n init, token bar init
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    function initNav() {
        const toggle = document.getElementById('nav-toggle');
        const nav    = document.getElementById('main-nav');
        if (toggle && nav) {
            toggle.addEventListener('click', function () {
                nav.classList.toggle('is-open');
            });
            // Close nav on outside click (mobile)
            document.addEventListener('click', function (e) {
                if (!nav.contains(e.target) && !toggle.contains(e.target)) {
                    nav.classList.remove('is-open');
                }
            });
        }
    }

    function initHeroTokenButton() {
        const heroTokenBtn = document.getElementById('hero-token-btn');
        const bar          = document.getElementById('token-bar');
        const input        = bar && bar.querySelector('.token-inline-bar__input');
        if (heroTokenBtn && bar && input) {
            heroTokenBtn.addEventListener('click', function () {
                bar.classList.add('is-open');
                input.focus();
            });
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        initNav();
        initHeroTokenButton();

        if (typeof TokenBar !== 'undefined') {
            TokenBar.init();
        }

        if (typeof SgI18n !== 'undefined') {
            SgI18n.init().then(function () {
                document.body.classList.remove('i18n-loading');
                SgI18n.renderLocaleSelector();
            });
        }
    });
}());
