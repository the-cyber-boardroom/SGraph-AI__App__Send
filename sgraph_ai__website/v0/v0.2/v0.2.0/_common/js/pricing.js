/* ═══════════════════════════════════════════════════════════════════════════
   SGraph AI Website v0.2.0 — Pricing page behaviour
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    function initFaq() {
        document.querySelectorAll('.faq-item__q').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var item = btn.closest('.faq-item');
                if (item) item.classList.toggle('is-open');
            });
        });
    }

    function initRegisterInterest() {
        var form = document.getElementById('register-interest-form');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var input = form.querySelector('.register-interest__input');
            if (!input || !input.value.trim()) return;
            var btn = form.querySelector('button[type="submit"]');
            if (btn) {
                btn.textContent = 'Registered ✓';
                btn.disabled = true;
            }
            input.disabled = true;
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        initFaq();
        initRegisterInterest();
    });
}());
