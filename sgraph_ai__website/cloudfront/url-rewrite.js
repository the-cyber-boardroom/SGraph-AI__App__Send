// CloudFront Function: URL Rewrite for S3 Static Site
//
// Purpose: Rewrite directory-style URIs to serve index.html
// Association: Viewer Request event on CloudFront distribution E2YZA5CZTJE62H
//
// What it does:
//   /                          → /index.html                    (append index.html)
//   /websites/sgraph-ai/latest/product/  → .../product/index.html (append index.html)
//   /websites/sgraph-ai/latest/product   → 302 → .../product/    (redirect to add slash)
//   /favicon.ico               → /favicon.ico                   (no change)
//
// The redirect for bare paths (no trailing slash, no extension) is essential:
// without it the browser treats "product" as a file, and relative paths like
// ../fonts/fonts.css resolve one directory too high.
//
// Deploy via AWS Console or CLI:
//   aws cloudfront create-function \
//     --name url-rewrite-index-html \
//     --function-config '{"Comment":"Append index.html to directory URIs","Runtime":"cloudfront-js-2.0"}' \
//     --function-code fileb://url-rewrite.js
//
//   aws cloudfront publish-function \
//     --name url-rewrite-index-html \
//     --if-match <ETag>
//
//   Then associate with distribution E2YZA5CZTJE62H as Viewer Request.

function handler(event) {
    var request = event.request;
    var uri = request.uri;

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
