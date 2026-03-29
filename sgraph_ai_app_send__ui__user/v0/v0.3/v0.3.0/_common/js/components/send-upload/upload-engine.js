/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Engine
   v0.3.0 — Encryption and upload pipeline

   Handles: read file → SGMETA wrap → encrypt → create transfer → upload
   (direct or presigned multipart) → complete transfer → build result URLs.

   All methods are static — no instance state. The orchestrator calls these
   and manages state transitions.
   ═══════════════════════════════════════════════════════════════════════════════ */

var UploadEngine = (function() {
    'use strict';

    // ─── Read file as ArrayBuffer ───────────────────────────────────────
    function readFile(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload  = function() { resolve(reader.result); };
            reader.onerror = function() { reject(new Error('Failed to read file')); };
            reader.readAsArrayBuffer(file);
        });
    }

    // ─── Full upload pipeline ───────────────────────────────────────────
    // Returns { transferId, combinedUrl, linkOnlyUrl, keyString, friendlyKey,
    //           delivery, transparency }
    //
    // onStage(stageName) is called before each stage so the orchestrator
    // can update the UI.

    async function run(opts) {
        var file        = opts.file;
        var shareMode   = opts.shareMode   || 'token';
        var friendlyKey = opts.friendlyKey || null;
        var delivery    = opts.delivery    || 'download';
        var capabilities= opts.capabilities;
        var onStage     = opts.onStage     || function() {};

        // ── Read ────────────────────────────────────────────────────────
        onStage('reading');
        var rawContent  = await readFile(file);
        var contentType = file.type || 'application/octet-stream';
        var plaintext   = UploadConstants.packageWithMetadata(rawContent, { filename: file.name });
        var fileSizeBytes = plaintext.byteLength;

        // ── Encrypt ─────────────────────────────────────────────────────
        onStage('encrypting');
        var key, keyString;
        if (shareMode === 'token' && friendlyKey) {
            key       = await UploadCrypto.deriveKeyFromFriendly(friendlyKey);
            keyString = await SendCrypto.exportKey(key);
        } else {
            key       = await SendCrypto.generateKey();
            keyString = await SendCrypto.exportKey(key);
        }
        var encrypted = await SendCrypto.encryptFile(key, plaintext);

        // ── Create transfer ─────────────────────────────────────────────
        onStage('creating');
        var createResult;
        if (shareMode === 'token' && friendlyKey) {
            var derivedId = await UploadCrypto.deriveTransferId(friendlyKey);
            createResult  = await _createTransferWithId(fileSizeBytes, contentType, derivedId);
        } else {
            createResult = await ApiClient.createTransfer(fileSizeBytes, contentType);
        }

        // ── Upload ──────────────────────────────────────────────────────
        onStage('uploading');
        var usePresigned = encrypted.byteLength > UploadConstants.MAX_FILE_SIZE_DIRECT
                        && capabilities && capabilities.multipart_upload;
        if (usePresigned) {
            await _uploadViaPresigned(createResult.transfer_id, encrypted, capabilities);
        } else {
            await ApiClient.uploadPayload(createResult.transfer_id, encrypted);
        }

        // ── Complete ────────────────────────────────────────────────────
        onStage('completing');
        var completeResult = await ApiClient.completeTransfer(createResult.transfer_id);

        // ── Build result ────────────────────────────────────────────────
        var combinedUrl = buildUrl(createResult.transfer_id, keyString, delivery);
        var linkOnlyUrl = buildLinkOnlyUrl(createResult.transfer_id);

        return {
            transferId:   createResult.transfer_id,
            combinedUrl:  combinedUrl,
            linkOnlyUrl:  linkOnlyUrl,
            keyString:    keyString,
            friendlyKey:  (shareMode === 'token') ? friendlyKey : null,
            delivery:     delivery,
            isText:       false,
            transparency: completeResult.transparency || null
        };
    }

    // ─── Create transfer with deterministic ID (token mode) ─────────────

    async function _createTransferWithId(fileSize, contentType, transferId) {
        var fetchFn = typeof ApiClient._fetch === 'function'
            ? ApiClient._fetch.bind(ApiClient)
            : function(path, opts) { return fetch(path, opts); };
        var res = await fetchFn('/api/transfers/create', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, ApiClient._authHeaders()),
            body: JSON.stringify({
                file_size_bytes:   fileSize,
                content_type_hint: contentType || 'application/octet-stream',
                transfer_id:       transferId
            })
        });
        if (!res.ok) {
            if (res.status === 401) throw new Error('ACCESS_TOKEN_INVALID');
            if (res.status === 409) throw new Error('Transfer ID collision — please retry');
            throw new Error('Create transfer failed: ' + res.status);
        }
        return res.json();
    }

    // ─── Presigned multipart upload ─────────────────────────────────────

    async function _uploadViaPresigned(transferId, encrypted, capabilities) {
        var partSize = (capabilities && capabilities.max_part_size) || (10 * 1024 * 1024);
        var numParts = Math.ceil(encrypted.byteLength / partSize);
        var initResult = await ApiClient.initiateMultipart(transferId, encrypted.byteLength, numParts);
        var uploadId   = initResult.upload_id;
        var partUrls   = initResult.part_urls;

        try {
            var completedParts = new Array(partUrls.length);
            var partsCompleted = 0;

            var uploadOnePart = async function(i) {
                var start  = i * partSize;
                var end    = Math.min(start + partSize, encrypted.byteLength);
                var partBuf= encrypted.slice(start, end);
                var etag   = await ApiClient.uploadPart(partUrls[i].upload_url, partBuf);
                completedParts[i] = { part_number: partUrls[i].part_number, etag: etag };
                partsCompleted++;
            };

            var active  = new Set();
            var maxPool = UploadConstants.PARALLEL_UPLOADS;
            for (var i = 0; i < partUrls.length; i++) {
                var p = uploadOnePart(i).then(function() { active.delete(p); });
                active.add(p);
                if (active.size >= maxPool) await Promise.race(active);
            }
            await Promise.all(active);
            await ApiClient.completeMultipart(transferId, uploadId, completedParts);
        } catch (err) {
            try { await ApiClient.cancelMultipart(transferId, uploadId); } catch (e) { /* ignore */ }
            throw err;
        }
    }

    // ─── URL builders ───────────────────────────────────────────────────

    function detectLocalePrefix() {
        var match = window.location.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//);
        return match ? match[1] : 'en-gb';
    }

    function buildUrl(transferId, keyString, delivery) {
        var locale = detectLocalePrefix();
        var route  = delivery === 'download' ? 'download' : delivery;
        return window.location.origin + '/' + locale + '/' + route + '/#' + transferId + '/' + keyString;
    }

    function buildLinkOnlyUrl(transferId) {
        var locale = detectLocalePrefix();
        return window.location.origin + '/' + locale + '/download/#' + transferId;
    }

    // ─── Public API ─────────────────────────────────────────────────────
    return {
        run:                run,
        readFile:           readFile,
        buildUrl:           buildUrl,
        buildLinkOnlyUrl:   buildLinkOnlyUrl,
        detectLocalePrefix: detectLocalePrefix
    };
})();
