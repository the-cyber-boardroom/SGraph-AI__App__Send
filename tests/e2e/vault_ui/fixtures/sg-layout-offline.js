/* =================================================================================
   sg-layout-offline.js — minimal stand-in for the sg-layout window manager

   The App UI page (en-gb/app/index.html) loads `sg-layout` from dev.tools.sgraph.ai.
   Sandboxed / offline CI cannot reach that CDN, and the page waits forever for the
   element to be defined — nothing under test ever mounts. This file is what the e2e
   spec serves in its place (page.route). It is NOT part of the system under test:
   it only lays out the two stacks the page asks for (app + debug pane) side by side,
   with the sizes the page passes, and reuses already-mounted tab elements on a
   re-layout so `app-shell` is never re-created (a re-create would re-open the vault).

   API subset used by the page: setLayout(cfg). addPanel is deliberately absent so the
   page's optional AI panels stay parked (LlmPanels checks `typeof addPanel`).
   ================================================================================= */

class SgLayoutOffline extends HTMLElement {
    constructor() {
        super();
        this._byTag = new Map();
        this.style.display = 'block';
        this.style.width   = '100%';
        this.style.height  = '100%';
    }

    setLayout(cfg) {
        cfg = cfg || {};
        const stacks = Array.isArray(cfg.children) ? cfg.children : [];
        const sizes  = Array.isArray(cfg.sizes) ? cfg.sizes : stacks.map(() => 1 / Math.max(1, stacks.length));
        let row = this.querySelector(':scope > .sgl-row');
        if (!row) {
            row = document.createElement('div');
            row.className = 'sgl-row';
            row.style.cssText = 'display:flex; flex-direction:row; width:100%; height:100%; overflow:hidden;';
            this.appendChild(row);
        }
        const wanted = new Set();
        stacks.forEach((stack, i) => {
            const size = Number(sizes[i] || 0);
            let col = row.querySelector(':scope > [data-stack="' + stack.id + '"]');
            if (!col) {
                col = document.createElement('div');
                col.dataset.stack = stack.id;
                col.style.cssText = 'display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; height:100%;';
                row.appendChild(col);
            }
            col.style.flex    = '0 0 ' + (size * 100) + '%';
            col.style.display = size > 0 ? 'flex' : 'none';
            (stack.tabs || []).forEach((tab) => {
                wanted.add(tab.tag);
                let el = this._byTag.get(tab.tag);
                if (!el) { el = document.createElement(tab.tag); this._byTag.set(tab.tag, el); }
                el.style.flex      = '1 1 auto';
                el.style.minHeight = '0';
                if (el.parentNode !== col) col.appendChild(el);
            });
        });
        for (const [tag, el] of this._byTag) {
            if (!wanted.has(tag) && el.parentNode) el.parentNode.removeChild(el);
        }
    }
}

if (!customElements.get('sg-layout')) customElements.define('sg-layout', SgLayoutOffline);
