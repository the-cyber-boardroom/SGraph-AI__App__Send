// ============================================================================
// CloudFront Function (viewer-request) for dev.vault.sgraph.ai
//
// This is the UPDATED body for the EXISTING function already associated with the
// distribution's viewer-request (named "url-rewrite-index-html"). A cache behavior
// can only have ONE viewer-request function, so do NOT add a second one — replace
// the existing function's code with this and re-publish + re-associate.
//
// What's new: the two leading lines handle the SPA path routes
//   /en-gb/app/<public-id>      (public vault previews)
//   /en-gb/preview/<public-id>  (the card-tester page)
// These have NO object in S3 (only index.html lives in those dirs). We rewrite the
// origin URI to the dir's index.html so the SPA shell loads; the browser URL is
// unchanged, so the app reads location.pathname to extract the <public-id>.
//
// IMPORTANT: the SPA check must run BEFORE the trailing-slash / extensionless logic.
// Otherwise /en-gb/app/<id> would 302 → /en-gb/app/<id>/ → /en-gb/app/<id>/index.html
// (which does not exist) → 404.
//
// (Unchanged below the SPA block: the original trailing-slash → index.html behaviour
//  and the extensionless → add-trailing-slash 302 that keeps relative paths resolving.)
//
// Crawler social cards (separate, optional): to give non-JS bots real Open Graph
// tags, route bot User-Agents for /en-gb/app/* to the User Lambda OG route
// (GET /api/public-preview/og/<public-id>) via a dedicated cache behavior or
// Lambda@Edge origin-request. Humans keep hitting the static shell above.
// ============================================================================
function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // --- SPA path routes (must come first) ---
    // /en-gb/app/<seg> or /en-gb/preview/<seg> → serve that dir's index.html.
    var spa = uri.match(/^\/en-gb\/(app|preview)\/[^\/]+\/?$/);
    if (spa) {
        request.uri = '/en-gb/' + spa[1] + '/index.html';
        return request;
    }

    // --- existing behaviour (unchanged) ---
    // If URI ends with '/', append index.html
    if (uri.endsWith('/')) {
        request.uri += 'index.html';
    }
    // If URI has no file extension, redirect to add trailing slash.
    // This ensures the browser URL updates so relative paths resolve correctly.
    // Without this, /product loads index.html but ../fonts/ resolves one level too high.
    else if (!uri.includes('.')) {
        return {
            statusCode: 302,
            statusDescription: 'Found',
            headers: { location: { value: uri + '/' } }
        };
    }

    return request;
}
