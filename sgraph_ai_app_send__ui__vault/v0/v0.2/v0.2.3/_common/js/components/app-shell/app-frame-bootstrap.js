/* =================================================================================
   AppFrameBootstrap — pure, DOM-free builder for the app-frame `srcdoc` HTML.

   ViV Phase 4 (pack §4): the four iframe-context mount paths in app-shell.js
   (_mountApp, _mountVaultFile HTML, _mountPageLayout, _mountVaultFile markdown)
   used to each assemble their own bootstrap HTML inline. They diverged in subtle
   ways (resource block only in _mountApp; bespoke template concat duplicated in
   page-layout and markdown). This module collapses the four onto ONE builder.

   `build(descriptor)` returns the HTML string to drop into `iframe.srcdoc`. It is
   pure: no DOM, no `fetch`, no `this`. The caller (app-shell.js) does the fetching
   (deps, CSS, file bytes) and the iframe wiring; this function only assembles the
   string. That split is exactly what makes it unit-testable from Node against
   in-memory inputs (see tests/unit/vault_ui/loader/test__app_frame_bootstrap.js).

   The four kinds:
     'app'         — entry HTML + bridge + pre-fetched resource block, head-injected
     'html'        — single vault .html/.htm + bridge, head-injected
     'page-layout' — _page.json rendered via PageLayoutRenderer (deps inlined)
     'markdown'    — .md/.markdown rendered via MarkdownParser (deps inlined)

   Channel: all four keep the postMessage `sg.*` bridge (Phase 4 Option A — unify
   the bootstrap, not the channel). The `bridgeScript` is built by app-shell.js's
   _buildVfsBridgeScript() and passed in, so this module stays free of `this`.
   ================================================================================= */

(function () {
    'use strict';

    // <head> injection: insert `inject` right after the opening <head> tag; if the
    // document has no <head>, prepend `inject` to the whole document. Mirrors the
    // exact behaviour the four mount methods used inline (Phase 3 / pre-Phase-4).
    function _injectHead(htmlText, inject) {
        var out = htmlText.replace(/(<head[^>]*>)/i, '$1' + inject);
        if (out === htmlText) out = inject + htmlText;
        return out;
    }

    // Path-resolution helpers PageLayoutRenderer expects as bare globals (from
    // send-browse-v031.js / send-browse--v0.3.2.js). Inlined as a string literal so
    // the page-layout frame has them without loading the full send-browse component.
    var _PATH_HELPERS =
        'function _resolvePath(base,relative){' +
          'if(relative.startsWith("/"))return relative.substring(1);' +
          'var combined=base+relative,parts=combined.split("/"),resolved=[];' +
          'for(var i=0;i<parts.length;i++){' +
            'if(parts[i]==="..")resolved.pop();' +
            'else if(parts[i]!=="."&&parts[i]!=="")resolved.push(parts[i]);}' +
          'return resolved.join("/");}' +
        'function _findEntry(fileList,resolved){' +
          'try{resolved=decodeURIComponent(resolved);}catch(_){}' +
          'var match=fileList.find(function(e){return !e.dir&&e.path===resolved;});if(match)return match;' +
          'match=fileList.find(function(e){return !e.dir&&e.path.endsWith("/"+resolved);});if(match)return match;' +
          'if(resolved.indexOf(".")===-1){' +
            'var exts=[".md",".pdf",".txt",".html",".jpg",".jpeg",".png",".webp"];' +
            'for(var i=0;i<exts.length;i++){' +
              'match=fileList.find(function(e){return !e.dir&&e.path===resolved+exts[i];});if(match)return match;' +
              'match=fileList.find(function(e){return !e.dir&&e.path.endsWith("/"+resolved+exts[i]);});if(match)return match;}}' +
          'var filename=resolved.split("/").pop();' +
          'if(filename){match=fileList.find(function(e){return !e.dir&&e.path.split("/").pop()===filename;});}' +
          'return match||null;}';

    // ── 'app' / 'html' — head-injected entry HTML ────────────────────────────────
    function _buildApp(d) {
        // _mountApp: bridge + pre-fetched resource block injected into <head>.
        return _injectHead(d.htmlText, d.bridgeScript + (d.resBlock || ''));
    }

    function _buildHtml(d) {
        // _mountVaultFile HTML branch: bridge only (no resource block).
        return _injectHead(d.htmlText, d.bridgeScript);
    }

    // ── 'page-layout' — _page.json via PageLayoutRenderer ────────────────────────
    function _buildPageLayout(d) {
        var deps = d.deps || {};
        // Files carrying a `.vault` path segment are inner-vault metadata, not page
        // content — filter them out exactly as the mount method did inline.
        var fileList = (d.fileList || []).filter(function (f) {
            return !(typeof AppPermissions !== 'undefined' && AppPermissions.hasVaultSegment(f.path));
        });
        return '<!DOCTYPE html><html><head>' +
            '<meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            d.bridgeScript +
            '<style>' + deps.css1 + '\n' + deps.css2 + '\n' + deps.css3 + '</style>' +
            '<style>html,body{margin:0;padding:0;height:100%;overflow-x:hidden;}' +
            'body{background:#0d1117;}#plr-root{min-height:100vh;}</style>' +
            '</head><body>' +
            '<div id="plr-root"></div>' +
            '<script>' + deps.sendHelpersJs + '<\/script>' +
            '<script>' + deps.fileTypeJs    + '<\/script>' +
            '<script>' + deps.mdParserJs    + '<\/script>' +
            '<script>' + deps.mdRendererJs  + '<\/script>' +
            '<script>' + _PATH_HELPERS      + '<\/script>' +
            '<script>' + deps.plrJs         + '<\/script>' +
            '<script>(function(){' +
              'var fileList=' + JSON.stringify(fileList) + ';' +
              'var folderPath=' + JSON.stringify(d.folderPath) + ';' +
              'var entryPath=' + JSON.stringify(d.entryPath) + ';' +
              'var objectUrls=[];' +
              'var browseInstance={' +
                '_objectUrls:objectUrls,' +
                'dataSource:{' +
                  'getFileList:function(){return fileList;},' +
                  'getFileBytes:function(p){return sg.vfs.read(p);}' +
                '}' +
              '};' +
              'sg.vfs.read(entryPath).then(function(buf){' +
                'var json=new TextDecoder().decode(buf);' +
                'var container=document.getElementById("plr-root");' +
                'PageLayoutRenderer.render(container,json,folderPath,null,browseInstance);' +
              '}).catch(function(err){' +
                'document.getElementById("plr-root").innerHTML=' +
                  '"<div style=\\"padding:2rem;color:#ff6b6b\\">Error: "+err.message+"</div>";' +
              '});' +
            '}());<\/script>' +
            '</body></html>';
    }

    // ── 'markdown' — .md/.markdown via MarkdownParser ────────────────────────────
    function _buildMarkdown(d) {
        var deps = d.deps || {};
        var mdEscaped = JSON.stringify(d.mdText);
        return '<!DOCTYPE html><html><head>' +
            '<meta charset="utf-8">' +
            '<meta name="viewport" content="width=device-width,initial-scale=1">' +
            d.bridgeScript +
            '<style>' + deps.css1 + '\n' + deps.css2 + '</style>' +
            '<style>' +
                'html,body{margin:0;padding:0;background:#0d1117;color:#e2e8f0;' +
                    'font-family:var(--font-sans,system-ui,sans-serif);}' +
                '#md-root{max-width:860px;margin:0 auto;padding:2rem 1.5rem;}' +
                'img{max-width:100%;height:auto;}' +
                'pre,code{background:#1a1f2e;border-radius:4px;}' +
                'pre{padding:1rem;overflow-x:auto;}' +
                'code{padding:0.15em 0.35em;}' +
            '</style>' +
            '</head><body>' +
            '<div id="md-root"></div>' +
            '<script>' + deps.mdParserJs + '<\/script>' +
            '<script>' + deps.mdRendererJs + '<\/script>' +
            '<script>(function(){' +
                'var md=' + mdEscaped + ';' +
                'var html=MarkdownParser.parse(md);' +
                'var root=document.getElementById("md-root");' +
                'root.innerHTML=html;' +
                'var imgs=root.querySelectorAll("img[data-md-src]");' +
                'var pending=imgs.length;' +
                'function _done(){' +
                    'if(--pending<=0){' +
                        'window.parent.postMessage({type:"sg-app-ready"},"*");' +
                    '}' +
                '}' +
                'if(!pending){window.parent.postMessage({type:"sg-app-ready"},"*");}' +
                'for(var i=0;i<imgs.length;i++){' +
                    '(function(img){' +
                        'var src=img.getAttribute("data-md-src");' +
                        'sg.vfs.read(src).then(function(buf){' +
                            'var blob=new Blob([buf]);' +
                            'img.src=URL.createObjectURL(blob);' +
                            '_done();' +
                        '}).catch(function(){_done();});' +
                    '})(imgs[i]);' +
                '}' +
            '}());<\/script>' +
            '</body></html>';
    }

    function build(descriptor) {
        var d = descriptor || {};
        switch (d.kind) {
            case 'app':         return _buildApp(d);
            case 'html':        return _buildHtml(d);
            case 'page-layout': return _buildPageLayout(d);
            case 'markdown':    return _buildMarkdown(d);
            default: throw new Error('AppFrameBootstrap: unknown kind ' + JSON.stringify(d.kind));
        }
    }

    globalThis.AppFrameBootstrap = {
        build:       build,
        injectHead:  _injectHead,
        PATH_HELPERS: _PATH_HELPERS
    };
})();
