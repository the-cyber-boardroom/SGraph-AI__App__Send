/* SGraph Vault — Tool API Event Constants
   v0.2.3 — Frozen vault-domain event names for SgToolApi layer.
   Domain extensions on top of the sg-tool-api standard (tool:ready, tool:state-changed). */

export const VAULT_EVENTS = Object.freeze({
    OPENED:              'vault:opened',
    LOCKED:              'vault:locked',
    NAVIGATION_COMPLETE: 'vault:navigation-complete',
    FILE_SAVED:          'vault:file-saved',        // Phase 3 (broadcast bus, Ticket 08)
});
