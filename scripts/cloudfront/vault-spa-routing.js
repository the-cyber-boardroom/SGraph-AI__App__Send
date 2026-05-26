// ============================================================================
// CloudFront Function (viewer-request) for dev.vault.sgraph.ai
//
// This is the UPDATED body for the EXISTING function already associated with the
// distribution's viewer-request (named "url-rewrite-index-html"). A cache behavior
// can only have ONE viewer-request function, so replace the existing function's
// code with this and re-publish.
//
// Two SPA concerns, in order:
//   1. CRAWLERS (WhatsApp/LinkedIn/Slack/…) requesting /en-gb/app|preview/<id>
//      are 302'd to the User Lambda's server-rendered Open Graph card, so the
//      link unfurls with the real title/description/thumbnail. Bots follow 302s;
//      humans never match this branch.
//   2. HUMANS requesting /en-gb/app|preview/<id> get the static SPA shell
//      (the dir's index.html); the browser URL is unchanged, so the app reads
//      location.pathname to extract the <public-id>.
//
// Then the original behaviour (trailing-slash → index.html; extensionless → 302
// add-trailing-slash) is preserved for everything else.
//
// SET FOR YOUR STAGE: OG_ORIGIN is the SG/Send API host that serves the OG route
// (Routes__Public_Preview). dev = https://dev.send.sgraph.ai ; prod = https://send.sgraph.ai
// The OG route sets og:url back to the canonical vault app URL (env
// PUBLIC_VAULT_APP_HOST on the Lambda), so the card still links to the app page.
// ============================================================================
var OG_ORIGIN = 'https://dev.send.sgraph.ai';

function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // /en-gb/app/<seg> or /en-gb/preview/<seg> — capture the section + the <public-id>
    var spa = uri.match(/^\/en-gb\/(app|preview)\/([^\/]+)\/?$/);
    if (spa) {
        var ua = (request.headers['user-agent'] && request.headers['user-agent'].value || '').toLowerCase();
        var isBot = /whatsapp|facebookexternalhit|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|googlebot|bingbot|embedly|redditbot|pinterest|skypeuripreview|vkshare|w3c_validator/.test(ua);
        if (isBot) {
            // Crawlers → server-rendered Open Graph card (the Lambda fetches + decrypts
            // the deliberately-public preview only; never touches vault contents).
            return {
                statusCode: 302, statusDescription: 'Found',
                headers: { location: { value: OG_ORIGIN + '/api/public-preview/og/' + spa[2] } }
            };
        }
        // Humans → the static SPA shell.
        request.uri = '/en-gb/' + spa[1] + '/index.html';
        return request;
    }

    // --- existing behaviour (unchanged) ---
    if (uri.endsWith('/')) {
        request.uri += 'index.html';
    } else if (!uri.includes('.')) {
        return {
            statusCode: 302,
            statusDescription: 'Found',
            headers: { location: { value: uri + '/' } }
        };
    }
    return request;
}
