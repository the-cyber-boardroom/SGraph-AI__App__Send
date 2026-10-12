/* =================================================================================
   SGraph Vault — sgit-ai interop layer
   v0.1.0 — the byte-level contract shared with the sgit-ai CLI (0.19.0 → 0.21.0)

   Everything the browser must reproduce EXACTLY as the Python CLI does, in one place:

     SGVaultPyJson        Python `json.dumps` default output (", " / ": " separators, ensure_ascii)
                          — the tree plaintext the CLI hashes, and the legacy commit signing bytes
     SGVaultJcs           RFC 8785 (JCS) — the canonical commit / tag signing bytes
     SGVaultPyMimetypes   Python's built-in `mimetypes.guess_type` table — `content_type_enc`
     SGVaultSigning       ECDSA P-256 / SHA-256, raw r||s, SPKI PEM, fingerprints, commit
                          normalisation (what `Schema__Object_Commit.from_json(raw).json()` yields)
     SGVaultSigner        a per-device signing key (non-extractable, IndexedDB) + its branch id
     SGVaultBranchIndex   the format gate (`format`, `min_client`, `features`) and the CLI's
                          index merge rules (`Vault__Index_Sync.merge`, `Vault__Index_Reader`)

   Pinned by tests/unit/vault_ui/loader/test__sgit_interop_vectors.js against the CLI's own
   fixture (tests/_fixtures/interop_vectors.json in SGit-AI__CLI).

   Depends on: Web Crypto API only. Must load after sg-send-crypto.js, before sg-vault-*.js.
   ================================================================================= */

(function () {
    'use strict';

    // --- Python json.dumps (default arguments) ------------------------------------------
    // json.dumps(obj): separators (', ', ': '), ensure_ascii=True (every char > 0x7e becomes
    // \uXXXX with lowercase hex, astral chars as a surrogate pair), key order = insertion
    // order, ints as digits, True/False/None as true/false/null. Floats never occur in vault
    // objects (every number is an integer), so they are refused rather than approximated.

    function pyString(s) {
        let out = '"';
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            if      (c === 0x22) out += '\\"';
            else if (c === 0x5c) out += '\\\\';
            else if (c === 0x0a) out += '\\n';
            else if (c === 0x0d) out += '\\r';
            else if (c === 0x09) out += '\\t';
            else if (c === 0x08) out += '\\b';
            else if (c === 0x0c) out += '\\f';
            else if (c < 0x20 || c > 0x7e) out += '\\u' + c.toString(16).padStart(4, '0');
            else out += s[i];
        }
        return out + '"';
    }

    function pyDumps(v) {
        if (v === null || v === undefined) return 'null';
        if (v === true)  return 'true';
        if (v === false) return 'false';
        if (typeof v === 'number') {
            if (!Number.isInteger(v)) throw new Error('SGVaultPyJson: floats are not allowed in vault objects');
            return String(v);
        }
        if (typeof v === 'string') return pyString(v);
        if (Array.isArray(v)) return '[' + v.map(pyDumps).join(', ') + ']';
        if (typeof v === 'object') {
            return '{' + Object.keys(v).map(k => pyString(k) + ': ' + pyDumps(v[k])).join(', ') + '}';
        }
        throw new Error('SGVaultPyJson: unsupported value');
    }

    // --- RFC 8785 (JCS) for the value types a commit or tag holds ------------------------
    // Members sorted by code point, no whitespace, UTF-8 with non-ASCII unescaped (which is
    // what JSON.stringify emits for a string), integers as digits.

    function jcs(v) {
        if (v === null || v === undefined) return 'null';
        if (typeof v === 'number') {
            if (!Number.isInteger(v)) throw new Error('SGVaultJcs: floats are not allowed in vault objects');
            return String(v);
        }
        if (typeof v !== 'object') return JSON.stringify(v);
        if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
        const keys = Object.keys(v).sort(cmpCodePoints);
        return '{' + keys.map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
    }

    // Python sorts str by code point; JS's default sort compares UTF-16 code units (differs
    // only for astral characters). One comparator for every place the CLI sorts names.
    function cmpCodePoints(a, b) {
        const ia = a[Symbol.iterator](), ib = b[Symbol.iterator]();
        for (;;) {
            const x = ia.next(), y = ib.next();
            if (x.done && y.done) return 0;
            if (x.done) return -1;
            if (y.done) return 1;
            const cx = x.value.codePointAt(0), cy = y.value.codePointAt(0);
            if (cx !== cy) return cx < cy ? -1 : 1;
        }
    }

    globalThis.SGVaultPyJson = { dumps: pyDumps, string: pyString };
    globalThis.SGVaultJcs    = { serialize: jcs, cmpCodePoints };

    // --- Python mimetypes.guess_type, strict table (mimetypes.init(files=[])) -------------
    // The CLI writes content_type_enc = mimetypes.guess_type(filename)[0] or
    // 'application/octet-stream'. Same folder content must give the same tree id in both
    // clients, so the web uses the same table. Generated from CPython 3.12's mimetypes module;
    // a user's /etc/mime.types additions are deliberately not reproduced (not portable).
    const PY_TYPES_MAP = {".%":"application/x-trash",".123":"application/vnd.lotus-1-2-3",".1905.1":"application/vnd.ieee.1905",".1clr":"application/clr",".1km":"application/vnd.1000minds.decision-model+xml",".210":"application/p21",".3dm":"text/vnd.in3d.3dml",".3dml":"text/vnd.in3d.3dml",".3g2":"audio/3gpp2",".3gp":"audio/3gpp",".3gpp":"audio/3gpp",".3gpp2":"audio/3gpp2",".3mf":"application/vnd.ms-3mfdocument",".3tz":"application/vnd.maxar.archive.3tz+zip",".726":"audio/32kadpcm",".7z":"application/x-7z-compressed",".AMR":"audio/AMR",".AWB":"audio/AMR-WB",".CQL":"text/cql",".ELN":"application/vnd.eln+zip",".J2C":"image/j2c",".J2K":"image/j2c",".PGB":"image/vnd.globalgraphics.pgb",".QCP":"audio/EVRC-QCP",".SAR":"application/vnd.sar",".VES":"application/vnd.ves.encrypted",".VFK":"text/vnd.exchangeable",".a":"text/vnd.a",".a2l":"application/A2L",".aa3":"audio/ATRAC3",".aac":"audio/aac",".aal":"audio/ATRAC-ADVANCED-LOSSLESS",".abc":"text/vnd.abc",".abw":"application/x-abiword",".ac":"application/pkix-attr-cert",".ac2":"application/vnd.banana-accounting",".ac3":"audio/ac3",".acc":"application/vnd.americandynamics.acc",".acn":"audio/asc",".acu":"application/vnd.acucobol",".acutc":"application/vnd.acucorp",".adts":"audio/aac",".aep":"application/vnd.audiograph",".afp":"application/vnd.afpc.modca",".age":"application/vnd.age",".ahead":"application/vnd.ahead.space",".ai":"application/postscript",".aif":"audio/x-aiff",".aifc":"audio/x-aiff",".aiff":"audio/x-aiff",".aion":"application/vnd.veritone.aion+json",".ait":"application/vnd.dvb.ait",".alc":"chemical/x-alchemy",".ami":"application/vnd.amiga.ami",".aml":"application/AML",".amlx":"application/automationml-amlx+zip",".amr":"audio/AMR",".anx":"application/annodex",".apex":"application/vnd.apexlang",".apexlang":"application/vnd.apexlang",".apk":"application/vnd.android.package-archive",".apkg":"application/vnd.anki",".apng":"image/apng",".appcache":"text/cache-manifest",".apr":"application/vnd.lotus-approach",".apxml":"application/auth-policy+xml",".arrow":"application/vnd.apache.arrow.file",".arrows":"application/vnd.apache.arrow.stream",".art":"message/rfc822",".artisan":"application/vnd.artisan+json",".asc":"application/pgp-keys",".ascii":"text/vnd.ascii-art",".asf":"application/vnd.ms-asf",".asice":"application/vnd.etsi.asic-e+zip",".asics":"application/vnd.etsi.asic-s+zip",".asn":"chemical/x-ncbi-asn1-spec",".aso":"chemical/x-ncbi-asn1-binary",".ass":"audio/aac",".at3":"audio/ATRAC3",".atc":"application/vnd.acucorp",".atf":"application/ATF",".atfx":"application/ATFX",".atom":"application/atom+xml",".atomcat":"application/atomcat+xml",".atomdeleted":"application/atomdeleted+xml",".atomsrv":"application/atomserv+xml",".atomsvc":"application/atomsvc+xml",".atx":"audio/ATRAC-X",".atxml":"application/ATXML",".au":"audio/basic",".auc":"application/tamp-apex-update-confirm",".avci":"image/avci",".avcs":"image/avcs",".avi":"video/x-msvideo",".avif":"image/avif",".awb":"audio/AMR-WB",".axa":"audio/annodex",".axv":"video/annodex",".azf":"application/vnd.airzip.filesecure.azf",".azs":"application/vnd.airzip.filesecure.azs",".azv":"image/vnd.airzip.accelerator.azv",".azw3":"application/vnd.amazon.mobi8-ebook",".b":"chemical/x-molconn-Z",".b16":"image/vnd.pco.b16",".bak":"application/x-trash",".bar":"application/vnd.qualcomm.brew-app-res",".bary":"model/vnd.bary",".bat":"application/x-msdos-program",".bcpio":"application/x-bcpio",".bdm":"application/vnd.syncml.dm+wbxml",".bed":"application/vnd.realvnc.bed",".bh2":"application/vnd.fujitsu.oasysprs",".bib":"text/x-bibtex",".bik":"video/vnd.radgamettools.bink",".bin":"application/octet-stream",".bk2":"video/vnd.radgamettools.bink",".bkm":"application/vnd.nervana",".bmed":"multipart/vnd.bint.med-plus",".bmi":"application/vnd.bmi",".bmml":"application/vnd.balsamiq.bmml+xml",".bmp":"image/bmp",".bmpr":"application/vnd.balsamiq.bmpr",".boo":"text/x-boo",".book":"application/x-maker",".box":"application/vnd.previewsystems.box",".bpd":"application/vnd.hbci",".brf":"text/plain",".bsd":"chemical/x-crossfire",".bsp":"model/vnd.valve.source.compiled-map",".btf":"image/prs.btif",".btif":"image/prs.btif",".c":"text/x-csrc",".c++":"text/x-c++src",".c11amc":"application/vnd.cluetrust.cartomobile-config",".c11amz":"application/vnd.cluetrust.cartomobile-config-pkg",".c3d":"chemical/x-chem3d",".c3ex":"application/cccex",".c4d":"application/vnd.clonk.c4group",".c4f":"application/vnd.clonk.c4group",".c4g":"application/vnd.clonk.c4group",".c4p":"application/vnd.clonk.c4group",".c4u":"application/vnd.clonk.c4group",".c9r":"application/vnd.cryptomator.encrypted",".c9s":"application/vnd.cryptomator.encrypted",".cab":"application/vnd.ms-cab-compressed",".cac":"chemical/x-cache",".cache":"chemical/x-cache",".cap":"application/vnd.tcpdump.pcap",".car":"application/vnd.ipld.car",".carjson":"application/vnd.eu.kasparian.car+json",".cascii":"chemical/x-cactvs-binary",".cat":"application/vnd.ms-pki.seccat",".cbin":"chemical/x-cactvs-binary",".cbor":"application/cbor",".cbr":"application/vnd.comicbook-rar",".cbz":"application/vnd.comicbook+zip",".cc":"text/x-c++src",".ccc":"text/vnd.net2phone.commcenter.command",".ccmp":"application/ccmp+xml",".ccxml":"application/ccxml+xml",".cda":"application/x-cdf",".cdbcmsg":"application/vnd.contact.cmsg",".cdf":"application/x-cdf",".cdfx":"application/CDFX+XML",".cdkey":"application/vnd.mediastation.cdkey",".cdmia":"application/cdmi-capability",".cdmic":"application/cdmi-container",".cdmid":"application/cdmi-domain",".cdmio":"application/cdmi-object",".cdmiq":"application/cdmi-queue",".cdr":"image/x-coreldraw",".cdt":"image/x-coreldrawtemplate",".cdx":"chemical/x-cdx",".cdxml":"application/vnd.chemdraw+xml",".cdy":"application/vnd.cinderella",".cea":"application/CEA",".cef":"chemical/x-cxf",".cellml":"application/cellml+xml",".cer":"application/pkix-cert",".cgm":"image/cgm",".chm":"chemical/x-chemdraw",".chrt":"application/vnd.kde.kchart",".cif":"chemical/x-cif",".cii":"application/vnd.anser-web-certificate-issue-initiation",".cil":"application/vnd.ms-artgalry",".cl":"application/simple-filter+xml",".cla":"application/vnd.claymore",".class":"application/java-vm",".cld":"model/vnd.cld",".clkk":"application/vnd.crick.clicker.keyboard",".clkp":"application/vnd.crick.clicker.palette",".clkt":"application/vnd.crick.clicker.template",".clkw":"application/vnd.crick.clicker.wordbank",".clkx":"application/vnd.crick.clicker",".cls":"text/x-tex",".clue":"application/clue_info+xml",".cmc":"application/vnd.cosmocaller",".cmdf":"chemical/x-cmdf",".cml":"chemical/x-cml",".cmp":"application/vnd.yellowriver-custom-menu",".cmsc":"application/cms",".cnd":"text/jcr-cnd",".cod":"application/vnd.rim.cod",".coffee":"application/vnd.coffeescript",".com":"application/x-msdos-program",".copyright":"text/vnd.debian.copyright",".coswid":"application/swid+cbor",".cpa":"chemical/x-compass",".cpio":"application/x-cpio",".cpkg":"application/vnd.xmpie.cpkg",".cpl":"application/cpl+xml",".cpp":"text/x-c++src",".cpt":"image/x-corelphotopaint",".cr2":"image/x-canon-cr2",".crl":"application/pkix-crl",".crt":"application/x-x509-ca-cert",".crtr":"application/vnd.multiad.creator",".crw":"image/x-canon-crw",".cryptomator":"application/vnd.cryptomator.vault",".cryptonote":"application/vnd.rig.cryptonote",".csd":"audio/csound",".csf":"chemical/x-cache-csf",".csh":"text/x-csh",".csl":"application/vnd.citationstyles.style+xml",".csm":"chemical/x-csml",".csml":"chemical/x-csml",".csp":"application/vnd.commonspace",".csrattrs":"application/csrattrs",".css":"text/css",".cst":"application/vnd.commonspace",".csv":"text/csv",".csvs":"text/csv-schema",".ctab":"chemical/x-cactvs-binary",".ctx":"chemical/x-ctx",".cu":"application/cu-seeme",".cub":"chemical/x-gaussian-cube",".cuc":"application/tamp-community-update-confirm",".curl":"text/vnd.curl",".cw":"application/prs.cww",".cwl":"application/cwl",".cwl.json":"application/cwl+json",".cww":"application/prs.cww",".cxf":"chemical/x-cxf",".cxx":"text/x-c++src",".d":"text/x-dsrc",".dae":"model/vnd.collada+xml",".daf":"application/vnd.Mobius.DAF",".dart":"application/vnd.dart",".dataless":"application/vnd.fdsn.seed",".davmount":"application/davmount+xml",".dbf":"application/vnd.dbf",".dcd":"application/DCD",".dcm":"application/dicom",".dcr":"application/x-director",".dd2":"application/vnd.oma.dd2+xml",".ddd":"application/vnd.fujixerox.ddd",".ddeb":"application/vnd.debian.binary-package",".ddf":"application/vnd.syncml.dmddf+xml",".deb":"application/vnd.debian.binary-package",".deploy":"application/octet-stream",".dfac":"application/vnd.dreamfactory",".dif":"video/dv",".diff":"text/x-diff",".dii":"application/DII",".dim":"application/vnd.fastcopy-disk-image",".dir":"application/x-director",".dis":"application/vnd.Mobius.DIS",".dist":"application/vnd.apple.installer+xml",".distz":"application/vnd.apple.installer+xml",".dit":"application/DIT",".dive":"application/vnd.patentdive",".djv":"image/vnd.djvu",".djvu":"image/vnd.djvu",".dl":"application/vnd.datalog",".dll":"application/x-msdos-program",".dls":"audio/dls",".dmg":"application/x-apple-diskimage",".dmp":"application/vnd.tcpdump.pcap",".dms":"text/vnd.DMClientScript",".dna":"application/vnd.dna",".doc":"application/msword",".docjson":"application/vnd.document+json",".docm":"application/vnd.ms-word.document.macroEnabled.12",".docx":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",".dor":"model/vnd.gdl",".dot":"text/vnd.graphviz",".dotm":"application/vnd.ms-word.template.macroEnabled.12",".dotx":"application/vnd.openxmlformats-officedocument.wordprocessingml.template",".dp":"application/vnd.osgi.dp",".dpg":"application/vnd.dpgraph",".dpgraph":"application/vnd.dpgraph",".dpkg":"application/vnd.xmpie.dpkg",".dpx":"image/dpx",".drle":"image/dicom-rle",".dsc":"text/prs.lines.tag",".dsm":"application/vnd.desmume.movie",".dssc":"application/dssc+der",".dtd":"application/xml-dtd",".dts":"audio/vnd.dts",".dtshd":"audio/vnd.dts.hd",".dv":"video/dv",".dvb":"video/vnd.dvb.file",".dvc":"application/dvcs",".dvi":"application/x-dvi",".dwd":"application/atsc-dwd+xml",".dwf":"model/vnd.dwf",".dwg":"image/vnd.dwg",".dx":"chemical/x-jcamp-dx",".dxf":"image/vnd.dxf",".dxp":"application/vnd.spotfire.dxp",".dxr":"application/x-director",".dzr":"application/vnd.dzr",".ebuild":"application/vnd.gentoo.ebuild",".ecelp4800":"audio/vnd.nuera.ecelp4800",".ecelp7470":"audio/vnd.nuera.ecelp7470",".ecelp9600":"audio/vnd.nuera.ecelp9600",".ecig":"application/vnd.evolv.ecig.settings",".ecigprofile":"application/vnd.evolv.ecig.profile",".ecigtheme":"application/vnd.evolv.ecig.theme",".eclass":"application/vnd.gentoo.eclass",".edm":"application/vnd.novadigm.EDM",".edx":"application/vnd.novadigm.EDX",".efi":"application/efi",".efif":"application/vnd.picsel",".ei6":"application/vnd.pg.osasli",".emb":"chemical/x-embl-dl-nucleotide",".embl":"chemical/x-embl-dl-nucleotide",".emf":"image/emf",".eml":"message/rfc822",".emm":"application/vnd.ibm.electronic-media",".emma":"application/emma+xml",".emotionml":"application/emotionml+xml",".ent":"application/xml-external-parsed-entity",".entity":"application/vnd.nervana",".enw":"audio/EVRCNW",".eol":"audio/vnd.digital-winds",".eot":"application/vnd.ms-fontobject",".ep":"application/vnd.bluetooth.ep.oob",".eps":"application/postscript",".eps2":"application/postscript",".eps3":"application/postscript",".epsf":"application/postscript",".epsi":"application/postscript",".epub":"application/epub+zip",".erf":"image/x-epson-erf",".es":"text/javascript",".es3":"application/vnd.eszigno3+xml",".esa":"application/vnd.osgi.subsystem",".esf":"application/vnd.epson.esf",".espass":"application/vnd.espass-espass+zip",".et3":"application/vnd.eszigno3+xml",".etx":"text/x-setext",".evb":"audio/EVRCB",".evc":"audio/EVRC",".evw":"audio/EVRCWB",".exe":"application/x-msdos-program",".exi":"application/exi",".exp":"application/express",".exr":"image/aces",".ext":"application/vnd.novadigm.EXT",".ez":"application/andrew-inset",".ez2":"application/vnd.ezpix-album",".ez3":"application/vnd.ezpix-package",".fb":"application/x-maker",".fbdoc":"application/x-maker",".fbs":"image/vnd.fastbidsheet",".fcdt":"application/vnd.adobe.formscentral.fcdt",".fch":"chemical/x-gaussian-checkpoint",".fchk":"chemical/x-gaussian-checkpoint",".fcs":"application/vnd.isac.fcs",".fdf":"application/fdf",".fdt":"application/fdt+xml",".fe_launch":"application/vnd.denovo.fcselayout-link",".fg5":"application/vnd.fujitsu.oasysgp",".fig":"application/x-xfig",".finf":"application/fastinfoset",".fit":"image/fits",".fits":"image/fits",".fla":"application/vnd.dtg.local.flash",".flac":"audio/flac",".flb":"application/vnd.ficlab.flb+zip",".fli":"video/fli",".flo":"application/vnd.micrografx.flo",".flt":"text/vnd.ficlab.flt",".flv":"video/x-flv",".flw":"application/vnd.kde.kivio",".flx":"text/vnd.fmi.flexstor",".fly":"text/vnd.fly",".fm":"application/x-maker",".fo":"application/vnd.software602.filler.form+xml",".fpx":"image/vnd.fpx",".frame":"application/x-maker",".frm":"application/x-maker",".fsc":"application/vnd.fsc.weblaunch",".fst":"image/vnd.fst",".ftc":"application/vnd.fluxtime.clip",".fti":"application/vnd.anser-web-funds-transfer-initiation",".fts":"image/fits",".fvt":"video/vnd.fvt",".fxp":"application/vnd.adobe.fxp",".fxpl":"application/vnd.adobe.fxp",".fzs":"application/vnd.fuzzysheet",".g2w":"application/vnd.geoplan",".g3w":"application/vnd.geospace",".gac":"application/vnd.groove-account",".gal":"chemical/x-gaussian-log",".gam":"chemical/x-gamess-input",".gamin":"chemical/x-gamess-input",".gan":"application/x-ganttproject",".gau":"chemical/x-gaussian-input",".gbr":"application/rpki-ghostbusters",".gcd":"text/x-pcs-gcd",".gcf":"application/x-graphing-calculator",".gcg":"chemical/x-gcg8-sequence",".gdl":"model/vnd.gdl",".gdz":"application/vnd.familysearch.gedcom+zip",".ged":"text/vnd.familysearch.gedcom",".gen":"chemical/x-genbank",".genozip":"application/vnd.genozip",".geo":"application/vnd.dynageo",".geojson":"application/geo+json",".gex":"application/vnd.geometry-explorer",".gf":"application/x-tex-gf",".gff3":"text/gff3",".ggb":"application/vnd.geogebra.file",".ggs":"application/vnd.geogebra.slides",".ggt":"application/vnd.geogebra.tool",".ghf":"application/vnd.groove-help",".gif":"image/gif",".gim":"application/vnd.groove-identity-message",".gjc":"chemical/x-gaussian-input",".gjf":"chemical/x-gaussian-input",".gl":"video/gl",".glb":"model/gltf-binary",".glbin":"application/gltf-buffer",".glbuf":"application/gltf-buffer",".gltf":"model/gltf+json",".gml":"application/gml+xml",".gnumeric":"application/x-gnumeric",".gph":"application/vnd.FloGraphIt",".gpkg":"application/geopackage+sqlite3",".gpkg.tar":"application/vnd.gentoo.gpkg",".gpt":"chemical/x-mopac-graph",".gqf":"application/vnd.grafeq",".gqs":"application/vnd.grafeq",".gram":"application/srgs",".grd":"application/vnd.gentics.grd+json",".gre":"application/vnd.geometry-explorer",".grv":"application/vnd.groove-injector",".grxml":"application/srgs+xml",".gsf":"application/x-font",".gsheet":"application/urc-grpsheet+xml",".gsm":"model/vnd.gdl",".gtar":"application/x-gtar",".gtm":"application/vnd.groove-tool-message",".gtw":"model/vnd.gtw",".gv":"text/vnd.graphviz",".gxt":"application/vnd.geonext",".gz":"application/gzip",".h":"text/x-chdr",".h++":"text/x-c++hdr",".h5":"application/x-hdf5",".hal":"application/vnd.hal+xml",".hans":"text/vnd.hans",".hbc":"application/vnd.hbci",".hbci":"application/vnd.hbci",".hdf":"application/x-hdf",".hdr":"image/vnd.radiance",".hdt":"application/vnd.hdt",".heic":"image/heic",".heics":"image/heic-sequence",".heif":"image/heif",".heifs":"image/heif-sequence",".hej2":"image/hej2k",".held":"application/atsc-held+xml",".hgl":"text/vnd.hgl",".hh":"text/x-c++hdr",".hif":"image/avif",".hin":"chemical/x-hin",".hpgl":"application/vnd.hp-HPGL",".hpi":"application/vnd.hp-hpid",".hpid":"application/vnd.hp-hpid",".hpp":"text/x-c++hdr",".hps":"application/vnd.hp-hps",".hpub":"application/prs.hpub+zip",".hqx":"application/mac-binhex40",".hs":"text/x-haskell",".hsj2":"image/hsj2",".hsl":"application/vnd.hsl",".hta":"application/hta",".htc":"text/x-component",".htke":"application/vnd.kenameaapp",".htm":"text/html",".html":"text/html",".hvd":"application/vnd.yamaha.hv-dic",".hvp":"application/vnd.yamaha.hv-voice",".hvs":"application/vnd.yamaha.hv-script",".hwp":"application/x-hwp",".hxx":"text/x-c++hdr",".i2g":"application/vnd.intergeo",".ic0":"application/vnd.commerce-battelle",".ic1":"application/vnd.commerce-battelle",".ic2":"application/vnd.commerce-battelle",".ic3":"application/vnd.commerce-battelle",".ic4":"application/vnd.commerce-battelle",".ic5":"application/vnd.commerce-battelle",".ic6":"application/vnd.commerce-battelle",".ic7":"application/vnd.commerce-battelle",".ic8":"application/vnd.commerce-battelle",".ica":"application/x-ica",".icc":"application/vnd.iccprofile",".icd":"application/vnd.commerce-battelle",".icf":"application/vnd.commerce-battelle",".icm":"application/vnd.iccprofile",".ico":"image/vnd.microsoft.icon",".ics":"text/calendar",".ief":"image/ief",".ifb":"text/calendar",".ifc":"application/p21",".ifm":"application/vnd.shana.informed.formdata",".iges":"model/iges",".igl":"application/vnd.igloader",".igm":"application/vnd.insors.igm",".ign":"application/vnd.coreos.ignition+json",".ignition":"application/vnd.coreos.ignition+json",".igs":"model/iges",".igx":"application/vnd.micrografx.igx",".iif":"application/vnd.shana.informed.interchange",".iii":"application/x-iphone",".imf":"application/vnd.imagemeter.folder+zip",".imgcal":"application/vnd.3lightssoftware.imagescal",".imi":"application/vnd.imagemeter.image+zip",".imp":"application/vnd.accpac.simply.imp",".ims":"application/vnd.ms-ims",".imscc":"application/vnd.ims.imsccv1p1",".info":"application/x-info",".ink":"application/inkml+xml",".inkml":"application/inkml+xml",".inp":"chemical/x-gamess-input",".ins":"application/x-internet-signup",".iota":"application/vnd.astraea-software.iota",".ipfix":"application/ipfix",".ipk":"application/vnd.shana.informed.package",".ipns-record":"application/vnd.ipfs.ipns-record",".irm":"application/vnd.ibm.rights-management",".irp":"application/vnd.irepository.package+xml",".ism":"model/vnd.gdl",".iso":"application/x-iso9660-image",".isp":"application/x-internet-signup",".ist":"chemical/x-isostar",".istc":"application/vnd.veryant.thin",".istr":"chemical/x-isostar",".isws":"application/vnd.veryant.thin",".itp":"application/vnd.shana.informed.formtemplate",".its":"application/its+xml",".ivp":"application/vnd.immervision-ivp",".ivu":"application/vnd.immervision-ivu",".j2c":"image/j2c",".j2k":"image/j2c",".jad":"text/vnd.sun.j2me.app-descriptor",".jam":"application/vnd.jam",".jar":"application/java-archive",".java":"text/x-java",".jdx":"chemical/x-jcamp-dx",".jfif":"image/jpeg",".jhc":"image/jphc",".jisp":"application/vnd.jisp",".jls":"image/jls",".jlt":"application/vnd.hp-jlyt",".jmz":"application/x-jmol",".jng":"image/x-jng",".jnlp":"application/x-java-jnlp-file",".joda":"application/vnd.joost.joda-archive",".jp2":"image/jp2",".jpe":"image/jpeg",".jpeg":"image/jpeg",".jpf":"image/jpx",".jpg":"image/jpeg",".jpg2":"image/jp2",".jpgm":"image/jpm",".jph":"image/jph",".jphc":"image/jphc",".jpm":"image/jpm",".jpx":"image/jpx",".jrd":"application/jrd+json",".js":"text/javascript",".json":"application/json",".json-patch":"application/json-patch+json",".jsonld":"application/ld+json",".jsontd":"application/td+json",".jsontm":"application/tm+json",".jt":"model/JT",".jtd":"text/vnd.esmertec.theme-descriptor",".jxl":"image/jxl",".jxr":"image/jxr",".jxra":"image/jxrA",".jxrs":"image/jxrS",".jxs":"image/jxs",".jxsc":"image/jxsc",".jxsi":"image/jxsi",".jxss":"image/jxss",".karbon":"application/vnd.kde.karbon",".kcm":"application/vnd.nervana",".key":"application/pgp-keys",".keynote":"application/vnd.apple.keynote",".kfo":"application/vnd.kde.kformula",".kia":"application/vnd.kidspiration",".kil":"application/x-killustrator",".kin":"chemical/x-kinemage",".kml":"application/vnd.google-earth.kml+xml",".kmz":"application/vnd.google-earth.kmz",".kne":"application/vnd.Kinar",".knp":"application/vnd.Kinar",".kom":"application/vnd.hbci",".kon":"application/vnd.kde.kontour",".koz":"audio/vnd.audiokoz",".kpr":"application/vnd.kde.kpresenter",".kpt":"application/vnd.kde.kpresenter",".ksh":"text/plain",".ksp":"application/vnd.kde.kspread",".ktr":"application/vnd.kahootz",".ktx":"image/ktx",".ktx2":"image/ktx2",".ktz":"application/vnd.kahootz",".kwd":"application/vnd.kde.kword",".kwt":"application/vnd.kde.kword",".l16":"audio/L16",".las":"application/vnd.las",".lasjson":"application/vnd.las.las+json",".lasxml":"application/vnd.las.las+xml",".latex":"application/x-latex",".lbc":"audio/iLBC",".lbd":"application/vnd.llamagraphics.life-balance.desktop",".lbe":"application/vnd.llamagraphics.life-balance.exchange+xml",".lca":"application/vnd.logipipe.circuit+zip",".lcs":"application/vnd.logipipe.circuit+zip",".le":"application/vnd.bluetooth.le.oob",".les":"application/vnd.hhe.lesson-player",".lgr":"application/lgr+xml",".lha":"application/x-lha",".lhs":"text/x-literate-haskell",".lhzd":"application/vnd.belightsoft.lhzd+zip",".lhzl":"application/vnd.belightsoft.lhzl+zip",".lin":"application/bbolin",".line":"application/vnd.nebumind.line",".link66":"application/vnd.route66.link66+xml",".list3820":"application/vnd.afpc.modca",".listafp":"application/vnd.afpc.modca",".lmp":"model/vnd.gdl",".loas":"audio/usac",".loom":"application/vnd.loom",".lostsyncxml":"application/lostsync+xml",".lostxml":"application/lost+xml",".lpf":"application/lpf+zip",".lrm":"application/vnd.ms-lrm",".lsf":"video/x-la-asf",".lsx":"video/x-la-asf",".ltx":"text/x-tex",".lvp":"audio/vnd.lucent.voice",".lwp":"application/vnd.lotus-wordpro",".lxf":"application/LXF",".ly":"text/x-lilypond",".lyx":"application/x-lyx",".lzh":"application/x-lzh",".lzx":"application/x-lzx",".m":"application/vnd.wolfram.mathematica.package",".m1v":"video/mpeg",".m21":"application/mp21",".m2v":"video/mpeg",".m3g":"application/m3g",".m3u":"audio/mpegurl",".m3u8":"application/vnd.apple.mpegurl",".m4a":"audio/mp4",".m4s":"video/iso.segment",".m4u":"video/vnd.mpegurl",".m4v":"video/mp4",".ma":"application/mathematica",".mads":"application/mads+xml",".maei":"application/mmt-aei+xml",".mag":"application/vnd.ecowin.chart",".mail":"message/rfc822",".maker":"application/x-maker",".man":"application/x-troff-man",".manifest":"text/cache-manifest",".markdown":"text/markdown",".mb":"application/mathematica",".mbk":"application/vnd.Mobius.MBK",".mbox":"application/mbox",".mbsdf":"application/vnd.mdl-mbsdf",".mc1":"application/vnd.medcalcdata",".mc2":"text/vnd.senx.warpscript",".mcd":"application/vnd.mcd",".mcif":"chemical/x-mmcif",".mcm":"chemical/x-macmolecule",".md":"text/markdown",".mdb":"application/msaccess",".mdc":"application/vnd.marlin.drm.mdcf",".mdi":"image/vnd.ms-modi",".mdl":"application/vnd.mdl",".me":"application/x-troff-me",".mesh":"model/mesh",".meta4":"application/metalink4+xml",".mets":"application/mets+xml",".mf4":"application/MF4",".mfm":"application/vnd.mfmp",".mft":"application/rpki-manifest",".mgp":"application/vnd.osgeo.mapguide.package",".mgz":"application/vnd.proteus.magazine",".mhas":"audio/mhas",".mht":"message/rfc822",".mhtml":"message/rfc822",".mid":"audio/sp-midi",".mif":"application/vnd.mif",".miz":"text/mizar",".mj2":"video/mj2",".mjp2":"video/mj2",".mjs":"text/javascript",".mkv":"video/x-matroska",".ml2":"application/vnd.sybyl.mol2",".mlp":"audio/vnd.dolby.mlp",".mm":"application/x-freemind",".mmd":"application/vnd.chipnuts.karaoke-mmd",".mmdb":"application/vnd.maxmind.maxmind-db",".mmf":"application/vnd.smaf",".mml":"application/mathml+xml",".mmod":"chemical/x-macromodel-input",".mmr":"image/vnd.fujixerox.edmics-mmr",".mng":"video/x-mng",".moc":"text/x-moc",".mod":"application/xml-dtd",".model-inter":"application/vnd.vd-study",".modl":"application/vnd.modl",".mods":"application/mods+xml",".mol":"chemical/x-mdl-molfile",".mol2":"application/vnd.sybyl.mol2",".moml":"model/vnd.moml+xml",".moo":"chemical/x-mopac-out",".mop":"chemical/x-mopac-input",".mopcrt":"chemical/x-mopac-input",".mov":"video/quicktime",".movie":"video/x-sgi-movie",".mp1":"audio/mpeg",".mp2":"audio/mpeg",".mp21":"application/mp21",".mp3":"audio/mpeg",".mp4":"video/mp4",".mpa":"video/mpeg",".mpc":"chemical/x-mopac-input",".mpd":"application/dash+xml",".mpdd":"application/dashdelta",".mpe":"video/mpeg",".mpeg":"video/mpeg",".mpega":"audio/mpeg",".mpf":"text/vnd.ms-mediapackage",".mpg":"video/mpeg",".mpg4":"video/mp4",".mpga":"audio/mpeg",".mph":"application/x-comsol",".mpkg":"application/vnd.apple.installer+xml",".mpm":"application/vnd.blueice.multipass",".mpn":"application/vnd.mophun.application",".mpp":"application/vnd.ms-project",".mpt":"application/vnd.ms-project",".mpv":"video/x-matroska",".mpw":"application/vnd.exstream-empower+zip",".mpy":"application/vnd.ibm.MiniPay",".mqy":"application/vnd.Mobius.MQY",".mrc":"application/marc",".mrcx":"application/marcxml+xml",".ms":"application/x-troff-ms",".msa":"application/vnd.msa-disk-image",".msd":"application/vnd.fdsn.mseed",".mseed":"application/vnd.fdsn.mseed",".mseq":"application/vnd.mseq",".msf":"application/vnd.epson.msf",".msh":"model/mesh",".msi":"application/x-msi",".msl":"application/vnd.Mobius.MSL",".msm":"model/vnd.gdl",".msp":"application/octet-stream",".msty":"application/vnd.muvee.style",".msu":"application/octet-stream",".mtl":"model/mtl",".mts":"model/vnd.mts",".multitrack":"audio/vnd.presonus.multitrack",".mus":"application/vnd.musician",".musd":"application/mmt-usd+xml",".mvb":"chemical/x-mopac-vib",".mvt":"application/vnd.mapbox-vector-tile",".mwc":"application/vnd.dpgraph",".mwf":"application/vnd.MFER",".mxf":"application/mxf",".mxi":"application/vnd.vd-study",".mxl":"application/vnd.recordare.musicxml",".mxmf":"audio/mobile-xmf",".mxml":"application/xv+xml",".mxs":"application/vnd.triscape.mxs",".mxu":"video/vnd.mpegurl",".n3":"text/n3",".nb":"application/vnd.wolfram.mathematica",".nbp":"application/vnd.wolfram.player",".nc":"application/x-netcdf",".ndc":"application/vnd.osa.netdeploy",".ndl":"application/vnd.lotus-notes",".nds":"application/vnd.nintendo.nitro.rom",".nebul":"application/vnd.nebumind.line",".nef":"image/x-nikon-nef",".ngdat":"application/vnd.nokia.n-gage.data",".nim":"video/vnd.nokia.interleaved-multimedia",".nimn":"application/vnd.nimn",".nitf":"application/vnd.nitf",".nlu":"application/vnd.neurolanguage.nlu",".nml":"application/vnd.enliven",".nnd":"application/vnd.noblenet-directory",".nns":"application/vnd.noblenet-sealer",".nnw":"application/vnd.noblenet-web",".notebook":"application/vnd.smart.notebook",".nq":"application/n-quads",".ns2":"application/vnd.lotus-notes",".ns3":"application/vnd.lotus-notes",".ns4":"application/vnd.lotus-notes",".nsf":"application/vnd.lotus-notes",".nsg":"application/vnd.lotus-notes",".nsh":"application/vnd.lotus-notes",".nt":"application/n-triples",".ntf":"application/vnd.lotus-notes",".numbers":"application/vnd.apple.numbers",".nwc":"application/x-nwc",".nws":"message/rfc822",".o":"application/x-object",".oa2":"application/vnd.fujitsu.oasys2",".oa3":"application/vnd.fujitsu.oasys3",".oas":"application/vnd.fujitsu.oasys",".ob":"application/vnd.1ob",".obg":"application/vnd.openblox.game-binary",".obgx":"application/vnd.openblox.game+xml",".obj":"model/obj",".oda":"application/ODA",".odb":"application/vnd.oasis.opendocument.base",".odc":"application/vnd.oasis.opendocument.chart",".odd":"application/tei+xml",".odf":"application/vnd.oasis.opendocument.formula",".odg":"application/vnd.oasis.opendocument.graphics",".odi":"application/vnd.oasis.opendocument.image",".odm":"application/vnd.oasis.opendocument.text-master",".odp":"application/vnd.oasis.opendocument.presentation",".ods":"application/vnd.oasis.opendocument.spreadsheet",".odt":"application/vnd.oasis.opendocument.text",".odx":"application/ODX",".oeb":"application/vnd.openeye.oeb",".oga":"audio/ogg",".ogex":"model/vnd.opengex",".ogg":"audio/ogg",".ogv":"video/ogg",".ogx":"application/ogg",".old":"application/x-trash",".omg":"audio/ATRAC3",".one":"application/onenote",".onepkg":"application/onenote",".onetmp":"application/onenote",".onetoc2":"application/onenote",".opf":"application/oebps-package+xml",".oprc":"application/vnd.palm",".opus":"audio/ogg",".or2":"application/vnd.lotus-organizer",".or3":"application/vnd.lotus-organizer",".orc":"audio/csound",".orf":"image/x-olympus-orf",".org":"application/vnd.lotus-organizer",".orq":"application/ocsp-request",".ors":"application/ocsp-response",".osf":"application/vnd.yamaha.openscoreformat",".osm":"application/vnd.openstreetmap.data+xml",".ota":"application/vnd.android.ota",".otc":"application/vnd.oasis.opendocument.chart-template",".otf":"font/otf",".otg":"application/vnd.oasis.opendocument.graphics-template",".oth":"application/vnd.oasis.opendocument.text-web",".oti":"application/vnd.oasis.opendocument.image-template",".otm":"application/vnd.oasis.opendocument.text-master-template",".otp":"application/vnd.oasis.opendocument.presentation-template",".ots":"application/vnd.oasis.opendocument.spreadsheet-template",".ott":"application/vnd.oasis.opendocument.text-template",".ovl":"application/vnd.afpc.modca-overlay",".oxlicg":"application/vnd.oxli.countgraph",".oxps":"application/oxps",".oxt":"application/vnd.openofficeorg.extension",".oza":"application/x-oz-application",".p":"text/x-pascal",".p10":"application/pkcs10",".p12":"application/pkcs12",".p21":"application/p21",".p2p":"application/vnd.wfa.p2p",".p7c":"application/pkcs7-mime",".p7m":"application/pkcs7-mime",".p7r":"application/x-pkcs7-certreqresp",".p7s":"application/pkcs7-signature",".p7z":"application/pkcs7-mime",".p8":"application/pkcs8",".p8e":"application/pkcs8-encrypted",".pac":"application/x-ns-proxy-autoconfig",".package":"application/vnd.autopackage",".pages":"application/vnd.apple.pages",".pas":"text/x-pascal",".pat":"image/x-coreldrawpattern",".patch":"text/x-diff",".paw":"application/vnd.pawaafile",".pbd":"application/vnd.powerbuilder6",".pbm":"image/x-portable-bitmap",".pcap":"application/vnd.tcpdump.pcap",".pcf":"application/x-font-pcf",".pcf.Z":"application/x-font-pcf",".pcl":"application/vnd.hp-PCL",".pcx":"image/vnd.zbrush.pcx",".pdb":"chemical/x-pdb",".pdf":"application/pdf",".pdx":"application/PDX",".pem":"application/pem-certificate-chain",".pfa":"application/x-font",".pfb":"application/x-font",".pfr":"application/font-tdpfr",".pfx":"application/pkcs12",".pgb":"image/vnd.globalgraphics.pgb",".pgm":"image/x-portable-graymap",".pgn":"application/vnd.chess-pgn",".pgp":"application/pgp-encrypted",".pil":"application/vnd.piaccess.application-licence",".pk":"application/x-tex-pk",".pkd":"application/vnd.hbci",".pkg":"application/vnd.apple.installer+xml",".pki":"application/pkixcmp",".pkipath":"application/pkix-pkipath",".pl":"text/x-perl",".plb":"application/vnd.3gpp.pic-bw-large",".plc":"application/vnd.Mobius.PLC",".plf":"application/vnd.pocketlearn",".plj":"audio/vnd.everad.plj",".plp":"application/vnd.panoply",".pls":"audio/x-scpls",".pm":"text/x-perl",".pml":"application/vnd.ctc-posml",".png":"image/png",".pnm":"image/x-portable-anymap",".portpkg":"application/vnd.macports.portpkg",".pot":"text/plain",".potm":"application/vnd.ms-powerpoint.template.macroEnabled.12",".potx":"application/vnd.openxmlformats-officedocument.presentationml.template",".ppa":"application/vnd.ms-powerpoint",".ppam":"application/vnd.ms-powerpoint.addin.macroEnabled.12",".ppd":"application/vnd.cups-ppd",".ppkg":"application/vnd.xmpie.ppkg",".ppm":"image/x-portable-pixmap",".pps":"application/vnd.ms-powerpoint",".ppsm":"application/vnd.ms-powerpoint.slideshow.macroEnabled.12",".ppsx":"application/vnd.openxmlformats-officedocument.presentationml.slideshow",".ppt":"application/vnd.ms-powerpoint",".pptm":"application/vnd.ms-powerpoint.presentation.macroEnabled.12",".ppttc":"application/vnd.think-cell.ppttc+json",".pptx":"application/vnd.openxmlformats-officedocument.presentationml.presentation",".pqa":"application/vnd.palm",".prc":"model/prc",".pre":"application/vnd.lotus-freelance",".preminet":"application/vnd.preminet",".prf":"application/pics-rules",".provn":"text/provenance-notation",".provx":"application/provenance+xml",".prt":"chemical/x-ncbi-asn1-ascii",".prz":"application/vnd.lotus-freelance",".ps":"application/postscript",".psb":"application/vnd.3gpp.pic-bw-small",".psd":"image/vnd.adobe.photoshop",".pseg3820":"application/vnd.afpc.modca",".psfs":"application/vnd.psfs",".psg":"application/vnd.afpc.modca-pagesegment",".psid":"audio/prs.sid",".pskcxml":"application/pskc+xml",".pt":"application/vnd.snesdev-page-table",".pti":"image/prs.pti",".ptid":"application/vnd.pvi.ptid1",".ptrom":"application/vnd.snesdev-page-table",".pub":"application/vnd.exstream-package",".pvb":"application/vnd.3gpp.pic-bw-var",".pwn":"application/vnd.3M.Post-it-Notes",".pwz":"application/vnd.ms-powerpoint",".py":"text/x-python",".pya":"audio/vnd.ms-playready.media.pya",".pyc":"application/x-python-code",".pyo":"application/x-python-code",".pyox":"model/vnd.pytha.pyox",".pyv":"video/vnd.ms-playready.media.pyv",".qam":"application/vnd.epson.quickanime",".qbo":"application/vnd.intu.qbo",".qca":"application/vnd.ericsson.quickcall",".qcall":"application/vnd.ericsson.quickcall",".qcp":"audio/EVRC-QCP",".qfx":"application/vnd.intu.qfx",".qgs":"application/x-qgis",".qps":"application/vnd.publishare-delta-tree",".qt":"video/quicktime",".qtl":"application/x-quicktimeplayer",".quiz":"application/vnd.quobject-quoxdocument",".quox":"application/vnd.quobject-quoxdocument",".qvd":"application/vnd.theqvd",".qwd":"application/vnd.Quark.QuarkXPress",".qwt":"application/vnd.Quark.QuarkXPress",".qxb":"application/vnd.Quark.QuarkXPress",".qxd":"application/vnd.Quark.QuarkXPress",".qxl":"application/vnd.Quark.QuarkXPress",".qxt":"application/vnd.Quark.QuarkXPress",".ra":"audio/x-pn-realaudio",".ram":"audio/x-pn-realaudio",".rapd":"application/route-apd+xml",".rar":"application/vnd.rar",".ras":"image/x-cmu-raster",".rb":"application/x-ruby",".rcprofile":"application/vnd.ipunplugged.rcprofile",".rct":"application/prs.nprend",".rd":"chemical/x-mdl-rdfile",".rdf":"application/rdf+xml",".rdf-crypt":"application/prs.rdf-xml-crypt",".rdp":"application/x-rdp",".rdz":"application/vnd.data-vision.rdz",".relo":"application/p2p-overlay+xml",".reload":"application/vnd.resilient.logic",".rep":"application/vnd.businessobjects",".request":"application/vnd.nervana",".rfcxml":"application/rfc+xml",".rgb":"image/x-rgb",".rgbe":"image/vnd.radiance",".rif":"application/reginfo+xml",".rip":"audio/vnd.rip",".rl":"application/resource-lists+xml",".rlc":"image/vnd.fujixerox.edmics-rlc",".rld":"application/resource-lists-diff+xml",".rlm":"application/vnd.resilient.logic",".rm":"audio/x-pn-realaudio",".rms":"application/vnd.jcp.javame.midlet-rms",".rnc":"application/relax-ng-compact-syntax",".rnd":"application/prs.nprend",".roa":"application/rpki-roa",".roff":"text/troff",".ros":"chemical/x-rosdal",".rp9":"application/vnd.cloanto.rp9",".rpm":"application/x-redhat-package-manager",".rpss":"application/vnd.nokia.radio-presets",".rpst":"application/vnd.nokia.radio-preset",".rq":"application/sparql-query",".rs":"application/rls-services+xml",".rsat":"application/atsc-rsat+xml",".rsheet":"application/urc-ressheet+xml",".rsm":"model/vnd.gdl",".rss":"application/x-rss+xml",".rst":"text/prs.fallenstein.rst",".rtf":"application/rtf",".rtx":"text/richtext",".rusd":"application/route-usd+xml",".rxn":"chemical/x-mdl-rxnfile",".rxt":"application/vnd.medicalholodeck.recordxr",".s11":"video/vnd.sealed.mpeg1",".s14":"video/vnd.sealed.mpeg4",".s1a":"application/vnd.sealedmedia.softseal.pdf",".s1e":"application/vnd.sealed.xls",".s1g":"image/vnd.sealedmedia.softseal.gif",".s1h":"application/vnd.sealedmedia.softseal.html",".s1j":"image/vnd.sealedmedia.softseal.jpg",".s1m":"audio/vnd.sealedmedia.softseal.mpeg",".s1n":"image/vnd.sealed.png",".s1p":"application/vnd.sealed.ppt",".s1q":"video/vnd.sealedmedia.softseal.mov",".s1w":"application/vnd.sealed.doc",".s3df":"application/vnd.sealed.3df",".sac":"application/tamp-sequence-adjust-confirm",".saf":"application/vnd.yamaha.smaf-audio",".sam":"application/vnd.lotus-wordpro",".sarif":"application/sarif+json",".sarif-external-properties":"application/sarif-external-properties+json",".sarif-external-properties.json":"application/sarif-external-properties+json",".sarif.json":"application/sarif+json",".sc":"application/vnd.ibm.secure-container",".scala":"text/x-scala",".scd":"application/vnd.scribus",".sce":"application/x-scilab",".sci":"application/x-scilab",".scim":"application/scim+json",".scl":"application/vnd.sycle+xml",".scld":"application/vnd.doremir.scorecloud-binary-document",".scm":"application/vnd.lotus-screencam",".sco":"audio/csound",".scq":"application/scvp-cv-request",".scr":"application/x-silverlight",".scs":"application/scvp-cv-response",".scsf":"application/vnd.sealed.csf",".sd":"chemical/x-mdl-sdfile",".sd2":"audio/x-sd2",".sda":"application/vnd.stardivision.draw",".sdc":"application/vnd.stardivision.calc",".sdd":"application/vnd.stardivision.impress",".sdf":"chemical/x-mdl-sdfile",".sdkd":"application/vnd.solent.sdkm+xml",".sdkm":"application/vnd.solent.sdkm+xml",".sdo":"application/vnd.sealed.doc",".sdoc":"application/vnd.sealed.doc",".sdp":"application/sdp",".sds":"application/vnd.stardivision.chart",".sdw":"application/vnd.stardivision.writer",".see":"application/vnd.seemail",".seed":"application/vnd.fdsn.seed",".sem":"application/vnd.sealed.eml",".sema":"application/vnd.sema",".semd":"application/vnd.semd",".semf":"application/vnd.semf",".seml":"application/vnd.sealed.eml",".senml":"application/senml+json",".senml-etchc":"application/senml-etch+cbor",".senml-etchj":"application/senml-etch+json",".senmlc":"application/senml+cbor",".senmle":"application/senml-exi",".senmlx":"application/senml+xml",".sensml":"application/sensml+json",".sensmlc":"application/sensml+cbor",".sensmle":"application/sensml-exi",".sensmlx":"application/sensml+xml",".ser":"application/java-serialized-object",".sfc":"application/vnd.nintendo.snes.rom",".sfd":"application/vnd.font-fontforge-sfd",".sfd-hdstx":"application/vnd.hydrostatix.sof-data",".sfs":"application/vnd.spotfire.sfs",".sfv":"text/x-sfv",".sgf":"application/x-go-sgf",".sgi":"image/vnd.sealedmedia.softseal.gif",".sgif":"image/vnd.sealedmedia.softseal.gif",".sgl":"application/vnd.stardivision.writer-global",".sgm":"text/SGML",".sgml":"text/SGML",".sh":"text/x-sh",".shaclc":"text/shaclc",".shar":"application/x-shar",".shc":"text/shaclc",".shex":"text/shex",".shf":"application/shf+xml",".shp":"application/x-qgis",".shtml":"text/html",".shx":"application/x-qgis",".si":"text/vnd.wap.si",".sic":"application/vnd.wap.sic",".sid":"audio/prs.sid",".sieve":"application/sieve",".sig":"application/pgp-signature",".sik":"application/x-trash",".silo":"model/mesh",".sipa":"application/vnd.smintio.portals.archive",".sis":"application/vnd.symbian.install",".sit":"application/x-stuffit",".sitx":"application/x-stuffit",".siv":"application/sieve",".sjp":"image/vnd.sealedmedia.softseal.jpg",".sjpg":"image/vnd.sealedmedia.softseal.jpg",".skd":"application/vnd.koan",".skm":"application/vnd.koan",".skp":"application/vnd.koan",".skt":"application/vnd.koan",".sl":"text/vnd.wap.sl",".sla":"application/vnd.scribus",".slaz":"application/vnd.scribus",".slc":"application/vnd.wap.slc",".sldm":"application/vnd.ms-powerpoint.slide.macroEnabled.12",".sldx":"application/vnd.openxmlformats-officedocument.presentationml.slide",".sls":"application/route-s-tsid+xml",".slt":"application/vnd.epson.salt",".sm":"application/vnd.stepmania.stepchart",".smc":"application/vnd.nintendo.snes.rom",".smf":"application/vnd.stardivision.math",".smh":"application/vnd.sealed.mht",".smht":"application/vnd.sealed.mht",".smi":"application/smil+xml",".smil":"application/smil+xml",".smk":"video/vnd.radgamettools.smacker",".sml":"application/smil+xml",".smo":"video/vnd.sealedmedia.softseal.mov",".smov":"video/vnd.sealedmedia.softseal.mov",".smp":"audio/vnd.sealedmedia.softseal.mpeg",".smp3":"audio/vnd.sealedmedia.softseal.mpeg",".smpg":"video/vnd.sealed.mpeg1",".sms":"application/vnd.3gpp2.sms",".smv":"audio/SMV",".smzip":"application/vnd.stepmania.package",".snd":"audio/basic",".so":"application/octet-stream",".soa":"text/dns",".soc":"application/sgml-open-catalog",".sofa":"audio/sofa",".sos":"text/vnd.sosi",".spc":"chemical/x-galactic-spc",".spd":"application/vnd.sealedmedia.softseal.pdf",".spdf":"application/vnd.sealedmedia.softseal.pdf",".spdx":"text/spdx",".spdx.json":"application/spdx+json",".spf":"application/vnd.yamaha.smaf-phrase",".spl":"application/futuresplash",".spn":"image/vnd.sealed.png",".spng":"image/vnd.sealed.png",".spo":"text/vnd.in3d.spot",".spot":"text/vnd.in3d.spot",".spp":"application/scvp-vp-response",".sppt":"application/vnd.sealed.ppt",".spq":"application/scvp-vp-request",".spx":"audio/ogg",".sql":"application/sql",".sqlite":"application/vnd.sqlite3",".sqlite3":"application/vnd.sqlite3",".sr":"application/vnd.sigrok.session",".src":"application/x-wais-source",".srt":"text/plain",".sru":"application/sru+xml",".srx":"application/sparql-results+xml",".sse":"application/vnd.kodak-descriptor",".ssf":"application/vnd.epson.ssf",".ssml":"application/ssml+xml",".ssv":"application/vnd.shade-save-file",".ssvc":"application/vnd.crypto-shade-file",".ssw":"video/vnd.sealed.swf",".sswf":"video/vnd.sealed.swf",".st":"application/vnd.sailingtracker.track",".stc":"application/vnd.sun.xml.calc.template",".std":"application/vnd.sun.xml.draw.template",".step":"model/step",".stf":"application/vnd.wt.stf",".sti":"application/vnd.sun.xml.impress.template",".stif":"application/vnd.sealed.tiff",".stix":"application/stix+json",".stk":"application/hyperstudio",".stl":"model/stl",".stml":"application/vnd.sealedmedia.softseal.html",".stp":"model/step",".stpnc":"application/p21",".stpx":"model/step+xml",".stpxz":"model/step-xml+zip",".stpz":"model/step+zip",".str":"application/vnd.pg.format",".study-inter":"application/vnd.vd-study",".stw":"application/vnd.sun.xml.writer.template",".sty":"text/x-tex",".sus":"application/vnd.sus-calendar",".susp":"application/vnd.sus-calendar",".sv4cpio":"application/x-sv4cpio",".sv4crc":"application/x-sv4crc",".svc":"application/vnd.dvb.service",".svg":"image/svg+xml",".svgz":"image/svg+xml",".sw":"chemical/x-swissprot",".swf":"application/vnd.adobe.flash.movie",".swi":"application/vnd.aristanetworks.swi",".swidtag":"application/swid+xml",".sxc":"application/vnd.sun.xml.calc",".sxd":"application/vnd.sun.xml.draw",".sxg":"application/vnd.sun.xml.writer.global",".sxi":"application/vnd.sun.xml.impress",".sxl":"application/vnd.sealed.xls",".sxls":"application/vnd.sealed.xls",".sxm":"application/vnd.sun.xml.math",".sxw":"application/vnd.sun.xml.writer",".sy2":"application/vnd.sybyl.mol2",".syft.json":"application/vnd.syft+json",".t":"text/troff",".tag":"text/prs.lines.tag",".taglet":"application/vnd.mynfc",".tam":"application/vnd.onepager",".tamp":"application/vnd.onepagertamp",".tamx":"application/vnd.onepagertamx",".tao":"application/vnd.tao.intent-module-archive",".tap":"image/vnd.tencent.tap",".tar":"application/x-tar",".tat":"application/vnd.onepagertat",".tatp":"application/vnd.onepagertatp",".tatx":"application/vnd.onepagertatx",".tau":"application/tamp-apex-update",".taz":"application/x-gtar-compressed",".tcap":"application/vnd.3gpp2.tcap",".tcl":"text/x-tcl",".tcu":"application/tamp-community-update",".td":"application/urc-targetdesc+xml",".teacher":"application/vnd.smart.teacher",".tei":"application/tei+xml",".teiCorpus":"application/tei+xml",".ter":"application/tamp-error",".tex":"text/x-tex",".texi":"application/x-texinfo",".texinfo":"application/x-texinfo",".text":"text/plain",".tfi":"application/thraud+xml",".tfx":"image/tiff-fx",".tgf":"chemical/x-mdl-tgf",".tgz":"application/x-gtar-compressed",".thmx":"application/vnd.ms-officetheme",".tif":"image/tiff",".tiff":"image/tiff",".tk":"text/x-tcl",".tlclient":"application/vnd.cendio.thinlinc.clientconf",".tm":"text/texmacs",".tm.json":"application/tm+json",".tm.jsonld":"application/tm+json",".tmo":"application/vnd.tmobile-livetv",".tnef":"application/vnd.ms-tnef",".tnf":"application/vnd.ms-tnef",".torrent":"application/x-bittorrent",".tpl":"application/vnd.groove-tool-template",".tpt":"application/vnd.trid.tpt",".tr":"text/troff",".tra":"application/vnd.trueapp",".tree":"application/vnd.rainstor.data",".trig":"application/trig",".ts":"text/vnd.trolltech.linguist",".tsa":"application/tamp-sequence-adjust",".tsd":"application/timestamped-data",".tsp":"application/dsptype",".tsq":"application/timestamp-query",".tsr":"application/timestamp-reply",".tst":"application/vnd.etsi.timestamp-token",".tsv":"text/tab-separated-values",".ttc":"font/collection",".ttf":"font/ttf",".ttl":"text/turtle",".ttml":"application/ttml+xml",".tuc":"application/tamp-update-confirm",".tur":"application/tamp-update",".twd":"application/vnd.SimTech-MindMapper",".twds":"application/vnd.SimTech-MindMapper",".txd":"application/vnd.genomatix.tuxedo",".txf":"application/vnd.Mobius.TXF",".txt":"text/plain",".u3d":"model/u3d",".u8dsn":"message/global-delivery-status",".u8hdr":"message/global-headers",".u8mdn":"message/global-disposition-notification",".u8msg":"message/global",".udeb":"application/vnd.debian.binary-package",".ufd":"application/vnd.ufdl",".ufdl":"application/vnd.ufdl",".uis":"application/urc-uisocketdesc+xml",".umj":"application/vnd.umajin",".unityweb":"application/vnd.unity",".uo":"application/vnd.uoml+xml",".uoml":"application/vnd.uoml+xml",".upa":"application/vnd.hbci",".uri":"text/uri-list",".urim":"application/vnd.uri-map",".urimap":"application/vnd.uri-map",".uris":"text/uri-list",".usda":"model/vnd.usda",".usdz":"model/vnd.usdz+zip",".ustar":"application/x-ustar",".utz":"application/vnd.uiq.theme",".uva":"audio/vnd.dece.audio",".uvd":"application/vnd.dece.data",".uvf":"application/vnd.dece.data",".uvg":"image/vnd.dece.graphic",".uvh":"video/vnd.dece.hd",".uvi":"image/vnd.dece.graphic",".uvm":"video/vnd.dece.mobile",".uvp":"video/vnd.dece.pd",".uvs":"video/vnd.dece.sd",".uvt":"application/vnd.dece.ttml+xml",".uvu":"video/vnd.dece.mp4",".uvv":"video/vnd.dece.video",".uvva":"audio/vnd.dece.audio",".uvvd":"application/vnd.dece.data",".uvvf":"application/vnd.dece.data",".uvvg":"image/vnd.dece.graphic",".uvvh":"video/vnd.dece.hd",".uvvi":"image/vnd.dece.graphic",".uvvm":"video/vnd.dece.mobile",".uvvp":"video/vnd.dece.pd",".uvvs":"video/vnd.dece.sd",".uvvt":"application/vnd.dece.ttml+xml",".uvvu":"video/vnd.dece.mp4",".uvvv":"video/vnd.dece.video",".uvvx":"application/vnd.dece.unspecified",".uvvz":"application/vnd.dece.zip",".uvx":"application/vnd.dece.unspecified",".uvz":"application/vnd.dece.zip",".val":"chemical/x-ncbi-asn1-binary",".vbk":"audio/vnd.nortel.vbk",".vbox":"application/vnd.previewsystems.box",".vcard":"text/vcard",".vcd":"application/x-cdlink",".vcf":"text/vcard",".vcg":"application/vnd.groove-vcard",".vcj":"application/voucher-cms+json",".vcs":"text/x-vcalendar",".vcx":"application/vnd.vcx",".vds":"model/vnd.sap.vds",".vew":"application/vnd.lotus-approach",".vfr":"application/vnd.tml",".viaframe":"application/vnd.tml",".vis":"application/vnd.visionary",".viv":"video/vnd.vivo",".vmd":"chemical/x-vmd",".vms":"chemical/x-vamas-iso14976",".vmt":"application/vnd.valve.source.material",".vpm":"multipart/voice-message",".vrm":"model/vrml",".vrml":"model/vrml",".vsc":"application/vnd.vidsoft.vidconference",".vsd":"application/vnd.visio",".vsf":"application/vnd.vsf",".vss":"application/vnd.visio",".vst":"application/vnd.visio",".vsw":"application/vnd.visio",".vtf":"image/vnd.valve.source.texture",".vtnstd":"application/vnd.veritone.aion+json",".vtt":"text/vtt",".vtu":"model/vnd.vtu",".vwx":"application/vnd.vectorworks",".vxml":"application/voicexml+xml",".wad":"application/x-doom",".wadl":"application/vnd.sun.wadl+xml",".wafl":"application/vnd.wasmflow.wafl",".wasm":"application/wasm",".wav":"audio/x-wav",".wax":"audio/x-ms-wax",".wbmp":"image/vnd.wap.wbmp",".wbs":"application/vnd.criticaltools.wbs+xml",".wbxml":"application/vnd.wap.wbxml",".wcm":"application/vnd.ms-works",".wdb":"application/vnd.ms-works",".webm":"video/webm",".webmanifest":"application/manifest+json",".webp":"image/webp",".wg":"application/vnd.pmi.widget",".wgsl":"text/wgsl",".wgt":"application/widget",".wif":"application/watcherinfo+xml",".win":"model/vnd.gdl",".wiz":"application/msword",".wk":"application/x-123",".wk1":"application/vnd.lotus-1-2-3",".wk3":"application/vnd.lotus-1-2-3",".wk4":"application/vnd.lotus-1-2-3",".wks":"application/vnd.ms-works",".wlnk":"application/link-format",".wm":"video/x-ms-wm",".wma":"audio/x-ms-wma",".wmc":"application/vnd.wmc",".wmd":"application/x-ms-wmd",".wmf":"image/wmf",".wml":"text/vnd.wap.wml",".wmlc":"application/vnd.wap.wmlc",".wmls":"text/vnd.wap.wmlscript",".wmlsc":"application/vnd.wap.wmlscriptc",".wmv":"video/x-ms-wmv",".wmx":"video/x-ms-wmx",".wmz":"application/x-ms-wmz",".woff":"font/woff",".woff2":"font/woff2",".wpd":"application/vnd.wordperfect",".wpl":"application/vnd.ms-wpl",".wps":"application/vnd.ms-works",".wqd":"application/vnd.wqd",".wrl":"model/vrml",".wsc":"application/vnd.wfa.wsc",".wsdl":"application/wsdl+xml",".wspolicy":"application/wspolicy+xml",".wtb":"application/vnd.webturbo",".wv":"application/vnd.wv.csp+wbxml",".wvx":"video/x-ms-wvx",".wz":"application/x-wingz",".x3d":"model/x3d+xml",".x3db":"model/x3d+fastinfoset",".x3dv":"model/x3d-vrml",".x3dvz":"model/x3d-vrml",".x3dz":"model/x3d+xml",".x_b":"model/vnd.parasolid.transmit.binary",".x_t":"model/vnd.parasolid.transmit.text",".xar":"application/vnd.xara",".xav":"application/xcap-att+xml",".xbd":"application/vnd.fujixerox.docuworks.binder",".xbm":"image/x-xbitmap",".xca":"application/xcap-caps+xml",".xcf":"image/x-xcf",".xcos":"application/x-scilab-xcos",".xcs":"application/calendar+xml",".xct":"application/vnd.fujixerox.docuworks.container",".xdd":"application/bacnet-xdd+zip",".xdf":"application/xcap-diff+xml",".xdm":"application/vnd.syncml.dm+xml",".xdp":"application/vnd.adobe.xdp+xml",".xdssc":"application/dssc+xml",".xdw":"application/vnd.fujixerox.docuworks",".xel":"application/xcap-el+xml",".xer":"application/xcap-error+xml",".xfd":"application/vnd.xfdl",".xfdf":"application/xfdf",".xfdl":"application/vnd.xfdl",".xhe":"audio/usac",".xht":"application/xhtml+xml",".xhtm":"application/xhtml+xml",".xhtml":"application/xhtml+xml",".xhvml":"application/xv+xml",".xif":"image/vnd.xiff",".xla":"application/vnd.ms-excel",".xlam":"application/vnd.ms-excel.addin.macroEnabled.12",".xlb":"application/vnd.ms-excel",".xlc":"application/vnd.ms-excel",".xlf":"application/xliff+xml",".xlim":"application/vnd.xmpie.xlim",".xlm":"application/vnd.ms-excel",".xls":"application/vnd.ms-excel",".xlsb":"application/vnd.ms-excel.sheet.binary.macroEnabled.12",".xlsm":"application/vnd.ms-excel.sheet.macroEnabled.12",".xlsx":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",".xlt":"application/vnd.ms-excel",".xltm":"application/vnd.ms-excel.template.macroEnabled.12",".xltx":"application/vnd.openxmlformats-officedocument.spreadsheetml.template",".xlw":"application/vnd.ms-excel",".xml":"application/xml",".xmls":"application/dskpp+xml",".xmt_bin":"model/vnd.parasolid.transmit.binary",".xmt_txt":"model/vnd.parasolid.transmit.text",".xns":"application/xcap-ns+xml",".xo":"application/vnd.olpc-sugar",".xodp":"application/vnd.collabio.xodocuments.presentation",".xods":"application/vnd.collabio.xodocuments.spreadsheet",".xodt":"application/vnd.collabio.xodocuments.document",".xop":"application/xop+xml",".xotp":"application/vnd.collabio.xodocuments.presentation-template",".xots":"application/vnd.collabio.xodocuments.spreadsheet-template",".xott":"application/vnd.collabio.xodocuments.document-template",".xpak":"application/vnd.gentoo.xpak",".xpdl":"application/xml",".xpi":"application/x-xpinstall",".xpm":"image/x-xpixmap",".xpr":"application/vnd.is-xpr",".xps":"application/vnd.ms-xpsdocument",".xpw":"application/vnd.intercon.formnet",".xpx":"application/vnd.intercon.formnet",".xsf":"application/prs.xsf+xml",".xsl":"application/xslt+xml",".xslt":"application/xslt+xml",".xsm":"application/vnd.syncml+xml",".xspf":"application/xspf+xml",".xtel":"chemical/x-xtel",".xul":"application/vnd.mozilla.xul+xml",".xvm":"application/xv+xml",".xvml":"application/xv+xml",".xwd":"image/x-xwindowdump",".xyz":"chemical/x-xyz",".xyze":"image/vnd.radiance",".xz":"application/x-xz",".yaml":"application/yaml",".yang":"application/yang",".yin":"application/yin+xml",".yme":"application/vnd.yaoweme",".yml":"application/yaml",".yt":"video/vnd.youtube.yt",".zaz":"application/vnd.zzazz.deck+xml",".zfc":"application/vnd.filmit.zfc",".zfo":"application/vnd.software602.filler.form-xml-zip",".zip":"application/zip",".zir":"application/vnd.zul",".zirz":"application/vnd.zul",".zmm":"application/vnd.HandHeld-Entertainment+xml",".zmt":"chemical/x-mopac-input",".zone":"text/dns",".zst":"application/zstd",".~":"application/x-trash"};
    const PY_SUFFIX_MAP = {".svgz":".svg.gz",".taz":".tar.gz",".tbz2":".tar.bz2",".tgz":".tar.gz",".txz":".tar.xz",".tz":".tar.gz"};
    const PY_ENCODINGS_MAP = {".Z":"compress",".br":"br",".bz2":"bzip2",".gz":"gzip",".xz":"xz"};

    function pySplitExt(name) {                    // posixpath.splitext: last dot, not a leading one
        const slash = name.lastIndexOf('/');
        const dot   = name.lastIndexOf('.');
        if (dot <= slash + 0 || dot === -1) return [name, ''];
        // leading dots of the basename are not an extension ('.bashrc' -> ('.bashrc', ''))
        let i = slash + 1; while (i < dot && name[i] === '.') i++;
        if (i === dot) return [name, ''];
        return [name.slice(0, dot), name.slice(dot)];
    }

    // mimetypes.MimeTypes.guess_type(url, strict=True) -> (type, encoding); we return the type.
    function pyGuessType(filename) {
        let base = String(filename || '');
        let [stem, ext] = pySplitExt(base);
        while (Object.prototype.hasOwnProperty.call(PY_SUFFIX_MAP, ext)) {
            base = stem + PY_SUFFIX_MAP[ext];
            [stem, ext] = pySplitExt(base);
        }
        if (Object.prototype.hasOwnProperty.call(PY_ENCODINGS_MAP, ext)) {
            base = stem;
            [stem, ext] = pySplitExt(base);
        }
        if (Object.prototype.hasOwnProperty.call(PY_TYPES_MAP, ext)) return PY_TYPES_MAP[ext];
        const lower = ext.toLowerCase();
        if (Object.prototype.hasOwnProperty.call(PY_TYPES_MAP, lower)) return PY_TYPES_MAP[lower];
        return null;
    }

    globalThis.SGVaultPyMimetypes = {
        guessType: pyGuessType,
        contentTypeFor(filename) { return pyGuessType(filename) || 'application/octet-stream'; }
    };

    // --- Signing primitives --------------------------------------------------------------

    const COMMIT_MEMBERS = ['schema', 'tree_id', 'message_enc', 'branch_id', 'signature',
                            'author_key_id', 'author_signature', 'parents', 'timestamp_ms', 'attestations'];
    const BRANCH_ID_RE   = /^branch-(named|clone)-[0-9a-f]{8,64}$/;
    const KEY_ID_RE      = /^key-rnd-imm-[0-9a-f]{8,64}$/;

    function b64encode(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
    function b64decode(s)  { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
    function hex(u8)       { return Array.from(new Uint8Array(u8)).map(b => b.toString(16).padStart(2, '0')).join(''); }
    function randomHex(nBytes) { return hex(crypto.getRandomValues(new Uint8Array(nBytes))); }

    function pemBody(pem)  { return b64decode(String(pem).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')); }
    function pemWrap(label, der) {
        const b = b64encode(new Uint8Array(der)).match(/.{1,64}/g).join('\n');
        return `-----BEGIN ${label}-----\n${b}\n-----END ${label}-----\n`;
    }

    // The commit as the CLI's schema re-serialises it (Schema__Object_Commit.from_json(raw).json()):
    // every member present, missing ones null (lists []), a branch_id the CLI pattern rejects
    // becomes '' (Vault__Commit.load_commit strips it), ids lower-cased.
    function normalizeCommit(raw) {
        const c = {};
        for (const k of COMMIT_MEMBERS) {
            let v = (raw && Object.prototype.hasOwnProperty.call(raw, k)) ? raw[k] : null;
            if (k === 'parents' || k === 'attestations') v = Array.isArray(v) ? v.slice() : [];
            if (k === 'branch_id') {
                if (v === '' || v === null || v === undefined) v = (v === '' ? '' : null);
                else { v = String(v).trim().toLowerCase(); if (!BRANCH_ID_RE.test(v)) v = ''; }
            }
            if (k === 'timestamp_ms' && v !== null) v = Number(v);
            c[k] = v;
        }
        return c;
    }

    function signingBytes(raw) {                      // canonical form (author_key_id non-null)
        const c = normalizeCommit(raw); delete c.signature;
        return new TextEncoder().encode(jcs(c));
    }

    function legacySigningBytes(raw) {                // pre-0.19 commits: json.dumps(commit.json()) with signature None
        const c = normalizeCommit(raw); c.signature = null;
        const ordered = {}; for (const k of COMMIT_MEMBERS) ordered[k] = c[k];
        return new TextEncoder().encode(pyDumps(ordered));
    }

    async function importPublicKeyPem(pem) {
        return crypto.subtle.importKey('spki', pemBody(pem), { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
    }
    async function exportPublicKeyPem(publicKey) {
        return pemWrap('PUBLIC KEY', await crypto.subtle.exportKey('spki', publicKey));
    }
    async function fingerprintPem(pem) {               // PKI__Crypto.compute_fingerprint: 'sha256:' + sha256(DER SPKI)[:16]
        return 'sha256:' + hex(await crypto.subtle.digest('SHA-256', pemBody(pem))).slice(0, 16);
    }
    async function sign(privateKey, bytes) {           // Web Crypto emits raw r||s (IEEE P1363), the CLI's wire form
        return b64encode(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes)));
    }
    async function verify(publicKey, signatureB64, bytes) {
        try {
            const sig = b64decode(signatureB64);
            if (sig.length !== 64) return false;
            return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, sig, bytes);
        } catch (_) { return false; }
    }
    // Vault__Commit.verify_commit_signature: canonical bytes; for a commit without
    // author_key_id also the legacy bytes.
    async function verifyCommit(raw, publicKey) {
        if (!raw || !raw.signature) return false;
        if (await verify(publicKey, raw.signature, signingBytes(raw))) return true;
        if (!raw.author_key_id) return verify(publicKey, raw.signature, legacySigningBytes(raw));
        return false;
    }

    globalThis.SGVaultSigning = {
        COMMIT_MEMBERS, BRANCH_ID_RE, KEY_ID_RE,
        normalizeCommit, signingBytes, legacySigningBytes,
        importPublicKeyPem, exportPublicKeyPem, fingerprintPem, pemBody, pemWrap,
        sign, verify, verifyCommit, b64encode, b64decode, hex, randomHex
    };

    // --- Per-device signer ----------------------------------------------------------------
    // One P-256 key pair per (origin, vault). The private key is a NON-EXTRACTABLE CryptoKey
    // stored in IndexedDB by structured clone: the scalar never exists in JS. Its public half is
    // published at bare/keys/<keyId> (read_key-encrypted {"type":"public","pem":…}) on first push,
    // where the CLI's _register_pending_branch puts a clone's key. branchId names this device's
    // clone branch in the index (branch-clone-<16 hex>, the CLI's own pattern).
    // Null-origin sandboxes (child kernels, embedded apps) have no IndexedDB: forVault() resolves
    // null there and commits stay unsigned, exactly as before.

    const DB_NAME = 'sg-vault-signing', DB_STORE = 'keys';

    function idbOpen() {
        return new Promise((resolve, reject) => {
            let req;
            try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return reject(e); }
            req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE); };
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
            req.onblocked = () => reject(new Error('indexedDB blocked'));
        });
    }
    function idbGet(db, key) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readonly'), req = tx.objectStore(DB_STORE).get(key);
            req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
        });
    }
    function idbPut(db, key, value) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).put(value, key);
            tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
        });
    }

    class SGVaultSigner {
        constructor(rec) {
            this.branchId   = rec.branchId;
            this.keyId      = rec.keyId;
            this.publicPem  = rec.publicPem;
            this.createdAt  = rec.createdAt;
            this._private   = rec.privateKey;
            this._public    = rec.publicKey;
        }
        get fingerprintPromise() { return fingerprintPem(this.publicPem); }

        static async generateRecord() {
            const kp  = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
            const pem = await exportPublicKeyPem(kp.publicKey);
            return { branchId: 'branch-clone-' + randomHex(8), keyId: 'key-rnd-imm-' + randomHex(8),
                     publicPem: pem, createdAt: Date.now(), privateKey: kp.privateKey, publicKey: kp.publicKey };
        }

        // The device's signer for a vault, created on first use; null where no durable key
        // store exists (null-origin iframe, private mode with storage disabled, Node).
        static async forVault(vaultId) {
            if (!vaultId) return null;
            try {
                // Inside the try on purpose: in a sandboxed (null-origin) iframe `indexedDB` is a
                // defined accessor that THROWS a SecurityError on read, and `typeof` does not
                // swallow that (the same trap the object store documents for `caches`).
                if (typeof indexedDB === 'undefined' || !indexedDB) return null;
                const db = await idbOpen();
                try {
                    let rec = await idbGet(db, vaultId);
                    if (!rec || !rec.privateKey || !rec.keyId) {
                        rec = await SGVaultSigner.generateRecord();
                        await idbPut(db, vaultId, rec);
                    }
                    return new SGVaultSigner(rec);
                } finally { db.close(); }
            } catch (_) { return null; }
        }

        // A signer from an explicit key pair (tests, parent-held keys handed to a kernel).
        static async fromKeyPair(privateKey, publicKey, opts) {
            opts = opts || {};
            return new SGVaultSigner({ branchId: opts.branchId || ('branch-clone-' + randomHex(8)),
                                       keyId:    opts.keyId    || ('key-rnd-imm-' + randomHex(8)),
                                       publicPem: await exportPublicKeyPem(publicKey), createdAt: opts.createdAt || Date.now(),
                                       privateKey, publicKey });
        }

        async sign(bytes) { return sign(this._private, bytes); }

        // bare/keys/<keyId> plaintext: exactly what Vault__Key_Manager.store_public_key writes.
        publicKeyFilePlain() { return new TextEncoder().encode(JSON.stringify({ type: 'public', pem: this.publicPem })); }
    }

    globalThis.SGVaultSigner = SGVaultSigner;

    // --- Branch index: format gate + merge rules ------------------------------------------

    const FORMAT_1 = 1, FORMAT_2 = 2;
    const ID_HEX_LEN = { 1: 12, 2: 32 };
    const FEATURE_IDS_128      = 'ids-128';
    const FEATURE_SIG_REQUIRED = 'signatures-required';
    const SIG_SINCE_PREFIX     = 'signed-since-';
    const TAG_CLOCK_SKEW_MS    = 24 * 60 * 60 * 1000;      // Vault__Index_Reader.TAG_CLOCK_SKEW_MS: a day

    const SGVaultBranchIndex = {
        FORMAT_1, FORMAT_2, FEATURE_IDS_128, FEATURE_SIG_REQUIRED, SIG_SINCE_PREFIX,

        formatOf(index) {
            const v = index && index.format != null ? Number(index.format) : FORMAT_1;
            return ID_HEX_LEN[v] ? v : FORMAT_1;
        },
        idHexLen(index)     { return ID_HEX_LEN[this.formatOf(index)]; },
        features(index)     { return Array.isArray(index && index.features) ? index.features.map(String) : []; },
        hasFeature(index, name) { return this.features(index).includes(name); },
        minClient(index)    { return index && index.min_client ? String(index.min_client) : ''; },
        hasGate(index)      { return !!index && (index.format != null || !!index.min_client || this.features(index).length > 0); },
        // The hex prefix recorded by `signed-since-<hex>` (12–24 hex), or ''.
        sigAnchor(index) {
            for (const f of this.features(index)) {
                if (f.startsWith(SIG_SINCE_PREFIX)) {
                    const v = f.slice(SIG_SINCE_PREFIX.length);
                    return /^[0-9a-f]{12,24}$/.test(v) ? v : '';
                }
            }
            return '';
        },
        parseVersion(text) {
            const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(text || '').trim());
            if (!m) return null;
            const v = [Number(m[1]), Number(m[2]), Number(m[3])];
            return (v[0] === 0 && v[1] === 0 && v[2] === 0) ? null : v;
        },
        // The web does not compare `min_client` (a sgit-ai version) against its own version; the
        // only thing it cannot read is a format it does not know. Message shape mirrors the CLI's.
        checkFormat(index) {
            const raw = index && index.format != null ? Number(index.format) : FORMAT_1;
            if (!ID_HEX_LEN[raw]) {
                const e = new Error(`this vault uses format ${raw}, which this version of SG/Vault does not know: reload to get the latest version, then try again`);
                e.code = 'EFORMAT'; throw e;
            }
        },

        // Tag entries: one live entry per name, the later (timestamp_ms, tag_id) wins, tombstones
        // included; an entry dated beyond now + a day of skew loses to every entry that is not.
        // Entries this client cannot read are carried as-is and still compete by name (B1).
        resolveTags(entries, nowMs) {
            nowMs = nowMs || Date.now();
            const byName = new Map();
            for (const e of entries || []) {
                if (!e || typeof e !== 'object' || typeof e.name !== 'string') continue;
                const ts     = Number(e.timestamp_ms || 0);
                const future = ts > nowMs + TAG_CLOCK_SKEW_MS ? 1 : 0;
                const key    = [future, ts, String(e.tag_id || '')];
                const cur    = byName.get(e.name);
                if (!cur || this._tagLess(cur.key, key)) byName.set(e.name, { key, entry: e });
            }
            return Array.from(byName.values()).map(x => x.entry);
        },
        _tagLess(a, b) {                               // a < b: (future ASC → non-future wins), then ts, then tag_id
            if (a[0] !== b[0]) return a[0] > b[0];     // future entries lose
            if (a[1] !== b[1]) return a[1] < b[1];
            return a[2] < b[2];
        },
        liveTags(index) {
            const out = {};
            for (const t of (index && index.tags) || []) if (t && !t.deleted && t.name) out[t.name] = t.tag_id;
            return out;
        },

        // Vault__Index_Sync.merge: union of branches by id (remote's entry wins per field, local
        // fills what remote lacks); the gate from the server copy unless it has none (dropped by
        // a writer that does not know it); the format never lowered; tags per name. Unknown
        // top-level members of either copy are kept (remote wins).
        merge(local, remote, gate) {
            gate = gate || 'remote';
            if (!local)  return remote ? this._clone(remote) : null;
            if (!remote) return this._clone(local);
            const byId = new Map();
            for (const b of [].concat(local.branches || [], remote.branches || [])) {
                if (!b || !b.branch_id) continue;
                const id = String(b.branch_id);
                if (byId.has(id)) {
                    const cur = byId.get(id);
                    for (const [k, v] of Object.entries(b)) {
                        const empty = v === null || v === undefined || v === '' || v === 0 || (Array.isArray(v) && !v.length);
                        if (!empty || !(k in cur)) cur[k] = v;
                    }
                } else byId.set(id, Object.assign({}, b));
            }
            const out = Object.assign({}, local, remote);          // unknown members: remote wins, local fills
            out.schema   = remote.schema || local.schema || 'branch_index_v1';
            out.branches = Array.from(byId.values());
            let fmt, min, feats;
            if (gate === 'local' || !this.hasGate(remote)) {
                fmt = local.format != null ? Number(local.format) : null; min = this.minClient(local) || null; feats = this.features(local).slice();
            } else {
                fmt   = Math.max(this.formatOf(local), this.formatOf(remote));
                min   = this.minClient(remote) || null;
                feats = this.features(remote).slice();
                if (fmt === FORMAT_1 && local.format == null && remote.format == null) fmt = null;
            }
            if (fmt != null && fmt >= FORMAT_2 && !feats.includes(FEATURE_IDS_128)) feats.push(FEATURE_IDS_128);
            feats.sort(cmpCodePoints);
            if (fmt != null) out.format = fmt; else delete out.format;
            if (min)         out.min_client = min; else delete out.min_client;
            out.features = feats;
            const tags = this.resolveTags([].concat(local.tags || [], remote.tags || []));
            if (tags.length || local.tags || remote.tags) out.tags = tags; else delete out.tags;
            return out;
        },
        _clone(idx) { return JSON.parse(JSON.stringify(idx)); },

        // Does `index` already say everything `candidate` says? (so a write can be skipped)
        same(a, b) {
            const key = (idx) => JSON.stringify({
                b: (idx.branches || []).map(x => [String(x.branch_id), jcs(x)]).sort(),
                f: this.formatOf(idx), m: this.minClient(idx), ft: this.features(idx).slice().sort(),
                t: ((idx.tags || []).map(t => jcs(t))).sort()
            });
            return !!a && !!b && key(a) === key(b);
        }
    };

    globalThis.SGVaultBranchIndex = SGVaultBranchIndex;
})();
