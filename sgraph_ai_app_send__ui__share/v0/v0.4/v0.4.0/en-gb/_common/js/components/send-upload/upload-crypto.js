/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Crypto Utilities
   v0.3.0 — Friendly key generation and PBKDF2 key derivation

   Shared by: upload-step-confirm (word picker), upload-step-done (display),
              send-upload orchestrator (key derivation during upload)
   ═══════════════════════════════════════════════════════════════════════════════ */

var UploadCrypto = (function() {
    'use strict';

    // ─── Share mode definitions ─────────────────────────────────────────────
    var SHARE_MODES = [
        {
            id:    'token',
            icon:  '\uD83C\uDFAB',       // 🎫
            title: 'Simple token',
            desc:  'A short transfer ID they can enter on the site. Key sent separately.',
            hint:  'Easiest — share verbally or in a message',
            security: 'Recipient needs both the token and the key'
        },
        {
            id:    'combined',
            icon:  '\uD83D\uDD17',       // 🔗
            title: 'Combined link',
            desc:  'One link with the decryption key embedded. Recipient clicks and gets the file.',
            hint:  'Simplest — one click for the recipient',
            security: 'Anyone with this link can decrypt the file'
        },
        {
            id:    'separate',
            icon:  '\uD83D\uDD10',       // 🔐
            title: 'Link + key separate',
            desc:  'Send the link and decryption key through different channels.',
            hint:  'More secure — requires both pieces',
            security: 'Neither piece works alone'
        }
    ];

    // ─── Word list for friendly keys (~256 common words) ────────────────────
    var WORDS = [
        'acorn','agate','alder','amber','anchor','anvil','apple','arrow','aspen','atlas',
        'badge','baker','barn','basin','beach','berry','birch','blade','blank','blaze',
        'bloom','board','bold','bonus','brave','bread','brick','brook','brush','cabin',
        'camel','candy','cargo','cedar','chain','chalk','charm','chess','chief','chill',
        'cider','citrus','civic','claim','clay','cliff','climb','clock','cloud','clover',
        'coach','coast','cobalt','cocoa','coral','craft','crane','crash','creek','crest',
        'crisp','cross','crown','cubic','curve','dance','dawn','delta','depot','diary',
        'dodge','dove','draft','dream','drift','drum','dune','eagle','earth','echo',
        'elder','elite','ember','epoch','equal','fable','faith','falcon','feast','fern',
        'ferry','fiber','field','flame','flash','flint','float','flora','flute','focus',
        'forge','found','frost','fruit','fudge','gaze','giant','glade','glass','gleam',
        'globe','glow','gold','grace','grain','grand','grape','green','grove','guard',
        'guide','guild','halo','harbor','haven','hawk','hazel','heart','hedge','herb',
        'heron','honey','horizon','hound','humor','index','iris','ivory','jasper','jewel','jolly',
        'judge','jungle','karma','kite','knoll','lake','latch','lemon','level','light',
        'lily','linen','lion','lodge','logic','lotus','lucky','lunar','lyre','magic',
        'mango','manor','maple','marsh','match','mayor','medal','melon','mercy','mirth',
        'model','moose','mortar','moss','mount','music','myth','nectar','noble','north','novel',
        'nutmeg','oak','oasis','ocean','olive','onset','onyx','opal','orange','orbit',
        'otter','oxide','palm','panel','patch','peace','pearl','pecan','pepper','petal',
        'pilot','pixel','plant','plaza','plume','plush','polar','pouch','prism','proud',
        'pulse','quail','queen','quest','quick','radar','rain','rapid','raven','reach',
        'realm','reed','reef','relay','ribbon','ridge','river','robin','robot','royal','ruby',
        'rumor','sage','sandy','satin','scale','scene','scout','scroll','shade','shark',
        'shell','shift','shine','silk','slate','smile','solar','solid','sonic','spark',
        'spell','spice','spine','spoke','spruce','staff','stamp','star','steam','steel',
        'stone','storm','sugar','sunny','surge','sweep','swift','table','tango','terra',
        'thistle','thorn','tiger','toast','token','topaz','tower','trace','trail','trend',
        'trout','tulip','twist','ultra','umber','union','unity','urban','valid','valve',
        'vault','velvet','verse','vigor','vine','vinyl','vivid','voice','walnut','water',
        'wave','wheat','whole','wick','willow','wind','wolf','wonder','world','wren',
        'yacht','yarn','yarrow','yield','zenith','zinc','zone'
    ];

    function randomWord() {
        var arr = new Uint32Array(1);
        crypto.getRandomValues(arr);
        return WORDS[arr[0] % WORDS.length];
    }

    function randomSuffix() {
        var arr = new Uint16Array(1);
        crypto.getRandomValues(arr);
        return String(arr[0] % 10000).padStart(4, '0');
    }

    function newFriendlyKey() {
        return { words: [randomWord(), randomWord()], suffix: randomSuffix() };
    }

    function formatFriendly(parts) {
        return parts.words[0] + '-' + parts.words[1] + '-' + parts.suffix;
    }

    function combinationsLabel() {
        var total = WORDS.length * WORDS.length * 10000;
        var label;
        if (total >= 1e9) {
            label = (total / 1e9).toFixed(1).replace(/\.0$/, '') + ' billion';
        } else {
            label = Math.round(total / 1e6) + ' million';
        }
        return WORDS.length + ' words &times; ' + WORDS.length + ' words &times; 10,000 = ~' + label + ' combinations';
    }

    async function deriveKeyFromFriendly(passphrase) {
        var enc = new TextEncoder();
        var material = await crypto.subtle.importKey(
            'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: enc.encode('sgraph-send-v1'), iterations: 600000, hash: 'SHA-256' },
            material,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }

    async function deriveTransferId(friendlyToken) {
        var enc = new TextEncoder();
        var hash = await crypto.subtle.digest('SHA-256', enc.encode(friendlyToken));
        var bytes = new Uint8Array(hash);
        var hex = '';
        for (var i = 0; i < 6; i++) {
            hex += bytes[i].toString(16).padStart(2, '0');
        }
        return hex;
    }

    return {
        SHARE_MODES:          SHARE_MODES,
        WORDS:                WORDS,
        randomWord:           randomWord,
        randomSuffix:         randomSuffix,
        newFriendlyKey:       newFriendlyKey,
        formatFriendly:       formatFriendly,
        combinationsLabel:    combinationsLabel,
        deriveKeyFromFriendly: deriveKeyFromFriendly,
        deriveTransferId:     deriveTransferId
    };
})();
