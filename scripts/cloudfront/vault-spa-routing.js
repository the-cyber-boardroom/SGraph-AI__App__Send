// ============================================================================
// CloudFront Function (viewer-request) — vault UI SPA path routing
// Deploy on the dev.vault.sgraph.ai distribution's default behavior, viewer-request.
//
// Problem: /en-gb/app/<public-id> and /en-gb/preview/<public-id> have NO object
// in S3 (only index.html lives under those dirs), so S3 returns 404. This function
// rewrites a single trailing path segment to the directory's index.html, so the
// SPA shell loads and reads location.pathname to extract the <public-id>.
//
// This mirrors the local dev fallback in scripts/vault__run-locally.sh.
//
// NOTE on social-share cards: this serves the static SPA shell to everyone, which
// is correct for human browsers. Non-JS crawlers (WhatsApp/LinkedIn/Slack) will NOT
// see Open Graph tags from this path. To give crawlers real cards, add a second rule
// (Lambda@Edge origin-request, or a dedicated cache behavior) that routes bot
// User-Agents for /en-gb/app/* to the User Lambda's OG route:
//     GET /api/public-preview/og/<public-id>     (returns OG-tagged HTML)
// Humans keep hitting the static shell; only bots are prerendered. See the dev pack
// doc 02 §6 (Public_Preview__Service / Routes__Public_Preview).
// ============================================================================
function handler(event) {
    var request = event.request;
    var uri     = request.uri;

    // /en-gb/app/<seg> or /en-gb/preview/<seg>  (a single segment, no deeper path)
    var m = uri.match(/^\/en-gb\/(app|preview)\/[^\/]+\/?$/);
    if (m) {
        request.uri = '/en-gb/' + m[1] + '/index.html';
    }
    return request;
}
