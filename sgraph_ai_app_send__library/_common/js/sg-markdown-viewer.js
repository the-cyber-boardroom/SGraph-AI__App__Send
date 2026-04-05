/**
 * sg-markdown-viewer — renders a markdown file fetched from a URL
 * Uses marked.js (CDN, pinned) for parsing + DOMPurify for sanitisation.
 *
 * Usage:
 *   <sg-markdown-viewer src="/roles/librarian.md"></sg-markdown-viewer>
 *   <sg-markdown-viewer src="/roles/librarian.md" base-url="/roles/"></sg-markdown-viewer>
 */
(function () {
  'use strict';

  // Dynamically load marked + DOMPurify from CDN (pinned versions)
  function loadScript(src, cb) {
    if (document.querySelector('script[src="' + src + '"]')) { cb(); return; }
    var s = document.createElement('script');
    s.src = src;
    s.onload = cb;
    s.onerror = function () { console.error('Failed to load', src); cb(); };
    document.head.appendChild(s);
  }

  var MARKED_CDN    = 'https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js';
  var PURIFY_CDN    = 'https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js';

  class SgMarkdownViewer extends HTMLElement {
    connectedCallback() {
      var src = this.getAttribute('src');
      if (!src) { this._error('No src attribute.'); return; }
      this.innerHTML = '<p class="sg-md-loading">Loading…</p>';

      // Load deps then fetch
      loadScript(MARKED_CDN, function () {
        loadScript(PURIFY_CDN, function () {
          this._fetchAndRender(src);
        }.bind(this));
      }.bind(this));
    }

    _fetchAndRender(src) {
      fetch(src)
        .then(function (r) {
          if (!r.ok) throw new Error(r.status + ' ' + r.statusText);
          return r.text();
        })
        .then(function (md) {
          var html = (typeof marked !== 'undefined')
            ? marked.parse(md)
            : '<pre>' + md.replace(/</g,'&lt;') + '</pre>';
          var safe = (typeof DOMPurify !== 'undefined')
            ? DOMPurify.sanitize(html)
            : html;
          this.innerHTML = '<article class="sg-md-content">' + safe + '</article>';
          // Mark active nav link
          this._highlightNav();
          // Dispatch loaded event
          this.dispatchEvent(new CustomEvent('sg-md-loaded', { bubbles: true }));
        }.bind(this))
        .catch(function (err) {
          this._error('Could not load document: ' + err.message);
        }.bind(this));
    }

    _error(msg) {
      this.innerHTML = '<p class="sg-md-error">' + msg + '</p>';
    }

    _highlightNav() {
      var src = this.getAttribute('src');
      if (!src) return;
      var links = document.querySelectorAll('.lib-nav-link');
      links.forEach(function (a) {
        if (a.getAttribute('href') && src.includes(a.getAttribute('data-doc') || '')) {
          a.classList.add('active');
        }
      });
    }
  }

  customElements.define('sg-markdown-viewer', SgMarkdownViewer);
})();
