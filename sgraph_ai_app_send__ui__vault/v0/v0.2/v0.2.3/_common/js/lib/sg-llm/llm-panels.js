/* =================================================================================
   LlmPanels — mount the AI Chat / AI Requests panels into an sg-layout, park them
   when they close, and bring them back with their state intact.

   TWO PAGES NEED THIS, WHICH IS WHY IT IS A MODULE:
     /vault  (vault-shell)  — the file browser's layout
     /app    (SG/App)       — the app host's layout (#app-layout)

   It is a dozen lines of bookkeeping that are wrong in a way you cannot see, so a
   second copy is a second bug waiting:

   sg-layout DETACHES A PANEL'S ELEMENT BEFORE IT ANNOUNCES THE CLOSE.

       if (tab.el && tab.el.parentNode === this) this.removeChild(tab.el);   // first
       …
       this._events.emit(SGL_EVENTS.PANEL_CLOSED, { id: tab.id });          // then

   So a `panel:closed` handler that re-queries the DOM for its element finds NOTHING,
   parks nothing, and orphans it — after which the button that reopens the panel is
   dead for the rest of the session. That shipped once. `el()` below therefore holds a
   HARD REFERENCE, and a live element in the host's subtree only replaces it (so a host
   that re-renders its markup gets the new element rather than a resurrected corpse).

   Parking matters for the same reason it exists at /vault: the chat element carries the
   transcript, the attached files and the cost pills. Closing a panel must move it out of
   sight, never destroy it.

   Usage:
       var panels = LlmPanels.create({
           host     : someElement,                    // subtree that owns the elements
           sidebar  : () => host.querySelector('.x'), // fallback container (element or fn)
           getLayout: async () => layoutOrNull
       });
       await panels.show('chat', 'AI Chat');
       panels.close('chat');
   ================================================================================= */

(function () {
    'use strict';

    var TAGS = { chat: 'vault-llm-chat', requests: 'vault-llm-requests' };

    function create(opts) {
        opts = opts || {};
        var host      = opts.host || null;
        var tags      = opts.tags || TAGS;
        var getLayout = opts.getLayout || function () { return Promise.resolve(null); };

        // Resolved per call, not captured: a host that rebuilds its markup would otherwise
        // keep parking elements into a container that is no longer in the document.
        function sidebar() {
            var s = opts.sidebar;
            if (typeof s === 'function') { try { return s() || null; } catch (_) { return null; } }
            return s || null;
        }

        var open = {};      // kind -> { id, layout }
        var refs = {};      // kind -> element  (the hard reference; see the header)

        function el(kind) {
            var tag  = tags[kind] || tags.chat;
            var live = host ? host.querySelector(tag) : null;
            if (live) { refs[kind] = live; return live; }
            return refs[kind] || null;
        }

        // Return an element to the fallback container, out of sight but alive.
        function park(kind) {
            var element = el(kind);
            var bar     = sidebar();
            if (!element || !bar) return;
            if (element.parentNode !== bar) bar.appendChild(element);
            element.hidden = true;
            var kids = Array.prototype.slice.call(bar.children);
            if (kids.length && kids.every(function (c) { return c.hidden; })) bar.hidden = true;
        }

        // Bound ONCE per layout: sg-layout's bus has no off-by-handler for our closure, so
        // re-binding on every open would leak a listener per open/close cycle.
        function watch(layout) {
            if (!layout || layout.__sgLlmCloseBound) return;
            try {
                layout.events.on('panel:closed', function (d) {
                    if (!d) return;
                    Object.keys(open).forEach(function (kind) {
                        if (open[kind].id === d.id) { delete open[kind]; park(kind); }
                    });
                });
                layout.__sgLlmCloseBound = true;
            } catch (_) { /* no bus → the panel's own ✕ still works */ }
        }

        // Idempotent: an already-mounted panel is focused rather than mounted twice.
        function show(kind, title) {
            var element = el(kind);
            if (!element) return Promise.resolve(null);

            var already = open[kind];
            if (already && already.layout && already.layout.isConnected && element.isConnected) {
                try { already.layout.focusPanel && already.layout.focusPanel(already.id); } catch (_) {}
                return Promise.resolve(element);
            }

            return Promise.resolve(getLayout()).then(function (layout) {
                if (layout) {
                    element.hidden = false;
                    // addPanel only assigns el.slot — the element must ALREADY be a light-DOM
                    // child of the layout for that slot to project anything.
                    layout.appendChild(element);
                    open[kind] = { id: layout.addPanel({ el: element, title: title }), layout: layout };
                    watch(layout);
                } else {
                    var bar = sidebar();
                    if (!bar) return null;
                    if (element.parentNode !== bar) bar.appendChild(element);
                    element.hidden = false;
                    bar.hidden = false;
                    open[kind] = { id: null, layout: null };
                }
                return element;
            });
        }

        function close(kind) {
            var rec = open[kind];
            if (rec && rec.layout && rec.id) {
                try { rec.layout.removePanel(rec.id); } catch (_) {}
            }
            delete open[kind];
            park(kind);
        }

        // A host remount destroys the layout and every panel in it. Park FIRST so the
        // elements are not collected with it; the caller re-shows whichever were open.
        function detachAll() {
            var kinds = Object.keys(open);
            kinds.forEach(function (k) { delete open[k]; });
            kinds.forEach(park);
            return kinds;
        }

        return {
            el: el, show: show, close: close, park: park, watch: watch,
            detachAll: detachAll,
            isOpen: function (kind) { return !!open[kind]; },
            panels: open                       // live object — mutated in place, never replaced
        };
    }

    var API = { create: create, TAGS: TAGS };
    globalThis.LlmPanels = API;
    if (typeof module !== 'undefined' && module.exports) module.exports = { LlmPanels: API };
})();
