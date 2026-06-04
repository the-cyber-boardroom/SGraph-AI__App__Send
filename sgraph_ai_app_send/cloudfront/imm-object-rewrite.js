// CloudFront Function: Immutable Vault Object Rewrite
//
// Purpose: Bypass Lambda for content-addressed immutable vault objects (obj-cas-imm-*)
//          by rewriting the API-style URI to the S3 key path.
//
// Association: Viewer Request event on the send.sgraph.ai CloudFront distribution,
//              attached to the behavior: /api/vault/read/*/bare/data/obj-cas-imm-*
//
// What it does:
//   /api/vault/read/{vault_id}/bare/data/obj-cas-imm-{hash}
//     → /sg-send__data/sg-send-api__v1.0/shared/vault/{vault_id[:2]}/{vault_id}/bare/data/obj-cas-imm-{hash}/payload
//
// Security:
//   - Strict regex: vault_id must be lowercase alphanumeric 8-24 chars
//   - Strict regex: hash must be exactly 12 hex characters
//   - No path traversal possible (character classes reject dots, slashes, etc.)
//   - Anything that doesn't match returns 403
//   - Only fires on the behavior for /api/vault/read/*/bare/data/obj-cas-imm-*
//
// S3 path structure mirrors Storage__Paths.path__vault_payload():
//   {STORAGE__BASE}/{STORAGE__VERSION}/{STORAGE__DEPLOYMENT}/vault/{vault_id[:2]}/{vault_id}/{file_id}/payload
//
// Deploy via AWS CLI:
//   aws cloudfront create-function \
//     --name imm-object-rewrite-for__send-sgraph-ai \
//     --function-config '{"Comment":"Rewrite immutable vault object reads to S3 key","Runtime":"cloudfront-js-2.0"}' \
//     --function-code fileb://imm-object-rewrite.js
//
//   aws cloudfront publish-function \
//     --name imm-object-rewrite-for__send-sgraph-ai \
//     --if-match <ETag>
//
//   Then associate with the immutable-objects behavior on the send.sgraph.ai distribution.

var S3_PREFIX = '/sg-send__data/sg-send-api__v1.0/shared/vault/';

// vault_id: lowercase alphanumeric, 8-24 chars (matches VAULT_ID_PATTERN in Service__Vault__Pointer.py)
// hash:     exactly 12 lowercase hex chars (matches SGVaultObjectStore.computeObjectId: hex(SHA256)[:12])
var STRICT_PATTERN = /^\/api\/vault\/read\/([a-z0-9]{8,24})\/bare\/data\/(obj-cas-imm-[a-f0-9]{12})$/;

function handler(event) {
    var uri   = event.request.uri;
    var match = uri.match(STRICT_PATTERN);

    if (!match) {
        return {
            statusCode: 403,
            statusDescription: 'Forbidden',
            headers: {
                'content-type': { value: 'text/plain' }
            },
            body: 'Invalid request'
        };
    }

    var vault_id = match[1];
    var object_id = match[2];

    event.request.uri = S3_PREFIX
                      + vault_id.substring(0, 2) + '/'
                      + vault_id + '/'
                      + 'bare/data/' + object_id + '/payload';

    return event.request;
}
