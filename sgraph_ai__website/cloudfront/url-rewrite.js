// CloudFront Function: URL Rewrite for S3 Static Site
//
// Purpose: Rewrite directory-style URIs to serve index.html
// Association: Viewer Request event on CloudFront distribution E2YZA5CZTJE62H
//
// What it does:
//   /                          → /index.html                    (no change needed)
//   /websites/sgraph-ai/latest/product/  → /websites/sgraph-ai/latest/product/index.html
//   /websites/sgraph-ai/latest/agents/   → /websites/sgraph-ai/latest/agents/index.html
//   /favicon.ico               → /favicon.ico                   (no change)
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
    // If URI has no file extension, assume directory and append /index.html
    else if (!uri.includes('.')) {
        request.uri += '/index.html';
    }

    return request;
}
