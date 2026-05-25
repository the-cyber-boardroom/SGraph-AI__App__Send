/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Shared Icons v0.3.0

   Centralised icon definitions used by send-download, send-gallery,
   send-browse, and send-viewer components. Edit icons here once —
   all components pick them up.

   Each icon is an inline SVG string. Size variants use suffixes:
     ICON_FOLDER    (18×18)
     ICON_FOLDER_SM (14×14)
   ═══════════════════════════════════════════════════════════════════════════════ */

const SendIcons = {

    // ─── Action Icons ────────────────────────────────────────────────────

    DOWNLOAD:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2v9M4 8l4 4 4-4"/><path d="M2 13h12"/></svg>',
    DOWNLOAD_SM: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2v9M4 8l4 4 4-4"/><path d="M2 13h12"/></svg>',
    LINK:        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6.5 8.5a3 3 0 004.2.4l2-2a3 3 0 00-4.2-4.2L7.3 3.9"/><path d="M9.5 7.5a3 3 0 00-4.2-.4l-2 2a3 3 0 004.2 4.2l1.2-1.2"/></svg>',
    LINK_SM:     '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6.5 8.5a3 3 0 004.2.4l2-2a3 3 0 00-4.2-4.2L7.3 3.9"/><path d="M9.5 7.5a3 3 0 00-4.2-.4l-2 2a3 3 0 004.2 4.2l1.2-1.2"/></svg>',
    MAIL:        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="2" y="3.5" width="12" height="9" rx="1.5"/><path d="M2 5l6 4 6-4"/></svg>',
    PRINT:       '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><rect x="4" y="1" width="8" height="4"/><rect x="1" y="5" width="14" height="7" rx="1"/><rect x="4" y="10" width="8" height="5"/></svg>',
    INFO:        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="6.5"/><path d="M8 7v4"/><circle cx="8" cy="5" r="0.5" fill="currentColor"/></svg>',

    // ─── Navigation Icons ────────────────────────────────────────────────

    FOLDER:    '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 3h4l2 2h6v8H2z"/></svg>',
    FOLDER_SM: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--accent, #4ECDC4)" stroke-width="1.5"><path d="M2 3h4l2 2h6v8H2z"/></svg>',
    FOLDER_MD: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 3h4l2 2h6v8H2z"/></svg>',

    // ─── View Mode Icons (gallery) ───────────────────────────────────────

    GRID:      '<svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>',
    COMPACT:   '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="4" height="4" rx="0.5"/><rect x="6" y="1" width="4" height="4" rx="0.5"/><rect x="11" y="1" width="4" height="4" rx="0.5"/><rect x="1" y="6" width="4" height="4" rx="0.5"/><rect x="6" y="6" width="4" height="4" rx="0.5"/><rect x="11" y="6" width="4" height="4" rx="0.5"/><rect x="1" y="11" width="4" height="4" rx="0.5"/><rect x="6" y="11" width="4" height="4" rx="0.5"/><rect x="11" y="11" width="4" height="4" rx="0.5"/></svg>',
    GRID_SM:   '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="0.5"/><rect x="9" y="1" width="6" height="6" rx="0.5"/><rect x="1" y="9" width="6" height="6" rx="0.5"/><rect x="9" y="9" width="6" height="6" rx="0.5"/></svg>',
    LARGE:     '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="6" rx="0.5"/><rect x="1" y="9" width="14" height="6" rx="0.5"/></svg>',

    // ─── Brand ───────────────────────────────────────────────────────────

    LOGO:      '<svg width="16" height="16" viewBox="0 0 16 16" fill="var(--accent, #4ECDC4)"><circle cx="8" cy="8" r="7"/></svg>',

    // ─── File Type Badges ────────────────────────────────────────────────

    BADGE_COLORS: {
        image:    '#2d7d46',
        pdf:      '#c0392b',
        markdown: '#2980b9',
        code:     '#8e44ad',
        text:     '#7f8c8d',
        audio:    '#e67e22',
        video:    '#d35400',
    },

    // ─── Large File Type Icons (gallery placeholders) ────────────────────

    TYPE_ICONS: {
        image:    '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="#4ECDC4" stroke-width="2"><rect x="6" y="6" width="36" height="36" rx="4"/><circle cx="18" cy="18" r="4"/><path d="M6 34l10-10 8 8 6-6 12 12"/></svg>',
        pdf:      '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="#e74c3c" stroke-width="2"><rect x="8" y="4" width="28" height="40" rx="3"/><path d="M14 16h16M14 22h16M14 28h10"/><path d="M36 14V4h-4l4 10z" fill="#e74c3c" opacity="0.3"/></svg>',
        markdown: '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="#3498db" stroke-width="2"><rect x="4" y="8" width="40" height="32" rx="3"/><path d="M12 30V18l6 7 6-7v12M32 24l5 5 5-5M37 29v-11"/></svg>',
        code:     '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="#9b59b6" stroke-width="2"><path d="M16 14l-8 10 8 10M32 14l8 10-8 10M22 36l4-24"/></svg>',
        text:     '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="#95a5a6" stroke-width="2"><rect x="8" y="4" width="32" height="40" rx="3"/><path d="M14 14h20M14 22h20M14 30h12"/></svg>',
        audio:    '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="#e67e22" stroke-width="2"><path d="M20 12v24l-8-8H6v-8h6l8-8z"/><path d="M28 16a8 8 0 010 16M32 12a14 14 0 010 24"/></svg>',
        video:    '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="#d35400" stroke-width="2"><rect x="4" y="10" width="30" height="28" rx="3"/><path d="M34 20l10-6v20l-10-6z"/></svg>',
        other:    '<svg width="40" height="40" viewBox="0 0 48 48" fill="none" stroke="#7f8c8d" stroke-width="2"><rect x="8" y="4" width="28" height="40" rx="3"/><path d="M28 4v10h8"/></svg>',
    },
};
