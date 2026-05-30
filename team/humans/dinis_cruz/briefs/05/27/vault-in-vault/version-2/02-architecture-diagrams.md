# 02 — Architecture & Flow Diagrams (ASCII)

**Pack version** v0.28.7 · Companion to `01-architecture-review.md` (normative).
All diagrams below are illustrative renderings of §01. Where a label says "**broker**" it is the per-kernel sidecar on the inter-kernel edge (Edge 2); it is never on the server edge (Edge 1).

---

## 2.1 The unit — one kernel, one app, one port

```
        ┌──────────────────────────────────────────────────────────┐
        │  KERNEL  (trusted shell code, bound to ONE vault)          │
        │                                                            │
        │   secrets:   vaultKey + accessToken   (never leave here)   │
        │   data src:  this vault                                    │
        │   policy:    permission checks (fs.read / fs.write / …)    │
        │   broker:    sidecar — logs/authorises this kernel's       │
        │              invocations on the children IT mounted        │
        │   SG/API:    direct client (x-sgraph-access-token)  ───────┼──▶ SG/API
        │                                                            │   (Edge 1, direct)
        │            exposes sg.* over a MessagePort                 │
        └───────────────────────────┬────────────────────────────────┘
                                     │  port = capability (no secrets)
                                     ▼
        ┌──────────────────────────────────────────────────────────┐
        │  APP   null-origin iframe   sandbox="allow-scripts"        │
        │        app.json HTML · no secrets · no storage             │
        │        no ambient fetch to the vault · sg.* port only      │
        └──────────────────────────────────────────────────────────┘
```

## 2.2 The frame tree — one real origin, everything below is `null`

```
  BROWSER TAB
  │
  ├─ Kernel-A  ◀══ THE ONLY REAL ORIGIN (https://vault.sgraph.ai/…#hash)
  │    │            reads #hash + localStorage  ──▶ vaultKey_A, token_A   (bootstrap, once)
  │    │
  │    ├─ App-A            null-origin  ·  sg.* port to Kernel-A
  │    │
  │    └─ Kernel-B         null-origin  ·  message-booted (no hash, no storage)
  │         │                            ·  secrets_B delivered by A over PKI
  │         │
  │         ├─ App-B       null-origin  ·  sg.* port to Kernel-B
  │         │
  │         └─ Kernel-C    null-origin  ·  message-booted by B
  │              │
  │              └─ App-C  null-origin  ·  sg.* port to Kernel-C
  │
  └─ … (siblings, more mounts — each its own null kernel)

  Reach:   A holds a port to B.   B holds a port to C.   A has NO port to C.
           No child holds a port that lets it INITIATE against its parent.
           Capability flows ▼ only.  Not transitive: A cannot reach C.
```

## 2.3 The two edges — keep them apart

```
                         ┌──────────────┐
                         │   SG / API   │   (dev.send.sgraph.ai)
                         └──────────────┘
            EDGE 1 (server) ▲      ▲      ▲   direct · per-kernel · bearer header
            direct, never    │      │      │   · UNBROKERED · identical at every level
            relayed ─────────┼──────┼──────┼───────────────────────────────────
                             │      │      │
                       ┌─────┴─┐ ┌──┴───┐ ┌┴──────┐
                       │Kernel │ │Kernel│ │Kernel │
                       │   A   │ │  B   │ │  C    │
                       └─┬───┬─┘ └──┬───┘ └───┬───┘
            EDGE 2        │   │      │         │
            (inter-kernel)│   └──────┘         │   parent→child capability invocations
            BROKERED,     │   A▶B relay        │   · the ONLY relayed traffic
            the only relay │                   │   · carries verb+path+maybe-creds, NOT bytes
                          (A's broker)    (B's broker)   · each kernel brokers ITS children
```

Read this twice: **server traffic does not relay** (each kernel goes straight to SG/API). **Only capability invocations relay** (A→B→C), and each parent's broker watches its own children.

## 2.4 Spawn + PKI handshake (parent A mounts child B)

```
  Kernel-A                                              (new iframe) Kernel-B
     │                                                                  │
     │ 1. create iframe  sandbox="allow-scripts"  srcdoc=<self-contained shell>
     │───────────────────────────────────────────────────────────────▶│  boots, null-origin,
     │                                                                  │  no storage, no secrets
     │ 2. new MessageChannel(); keep port1, transfer port2             │
     │    iframe.contentWindow.postMessage(initMsg, '*', [port2])      │  ◀── the ONE window touch
     │───────────────────────────────────────────────────────────────▶│  grabs port2 = its inbound
     │                                                                  │
     │ 3. mint one-use K1 (sign-only); send K1 over port1             │
     │─────────────────────────────────  (authenticated by the port) ─▶│
     │                                                                  │ 4. mint OWN keypair K2
     │                                                                  │    (non-extractable)
     │ 5.        { K2.pub , sign(K2.pub, K1) }                         │
     │◀─────────────────────────────────────────────────────────────── │
     │ 6. verify sig with K1.pub → trust K2.pub ; retire K1            │
     │                                                                  │
     │ 7. encrypt { vaultKey_B, accessToken_B } to K2.pub ; send       │
     │───────────────────────────────────────────────────────────────▶│ 8. decrypt with K2.priv
     │                                                                  │    kernel.boot(secrets_B)
     │                                                                  │    ── now talks to SG/API
     │                                                                  │       directly (Edge 1) ──▶
     │ 9. ready                                                         │
     │◀─────────────────────────────────────────────────────────────── │
     ▼                                                                  ▼
  A now holds port1 = its capability to B.   B never holds a handle to initiate against A.
  ISOLATION MODE (default): A does NOT keep K2.priv → cannot read B↔C traffic.
```

## 2.5 Cross-vault READ (tokenless, public ciphertext)

```
  App-A: sg.vfs.read('mounts/patient-acme/notes.md')
     │
     ▼
  Kernel-A  ── resolve path: prefix 'mounts/patient-acme/' = mounted child B
     │        ── broker_A.log(A▶B read notes.md)            [auto | ask]
     │        ── relay over port1 (signed; read = no secret, so sign-only)
     ▼
  Kernel-B  ── policy check: is 'read notes.md' allowed for this caller? 
     │        ── YES → fetch ciphertext from SG/API  (Edge 1, direct, tokenless)
     │        ── decrypt locally with vaultKey_B
     │        ── return plaintext bytes (encrypted to A on the wire if sensitive)
     ▼
  Kernel-A  ── hand bytes to App-A.   App-A cannot tell this came from B vs local.
```

## 2.6 Cross-vault WRITE — the KneeScore driving case (Scenario 1, Edge 2)

```
  App-A (clinician console): sg.vfs.write('mounts/patient-acme/data/reviews.json', review)
     │
     ▼
  Kernel-A  ── resolve: 'mounts/patient-acme/' = child B
     │        ── broker_A: "App-A asked to WRITE data/reviews.json in vault B"
     │              policy = ask → prompt user → [authorise]      (or auto by policy)
     │        ── log the (now authorised) invocation
     │        ── relay write over port1   (PKI: review payload ENCRYPTED to B)
     │        ── credential: standing rw, OR per-request write token inline (then gone)
     ▼
  Kernel-B  ── authority = (A granted write) ∩ (B policy: fs.write ⊇ ["data/"])  → permit
     │        ── write data/reviews.json into B's working tree
     │        ── commit + push on B's OWN server edge (Edge 1, direct, token_B)
     │             reuses B's existing commit/three-way-merge/publish machinery
     ▼
  Kernel-A  ── result ok ▶ App-A.   Parent vault A untouched. No patient UI mounted.
                                     No app-to-app message. No window.top.
```

## 2.7 Fractal nesting — the same stamp at depth N

```
  A ─mounts▶ B ─mounts▶ C ─mounts▶ D …

  • Isolation scales for free: each null frame = its own opaque context;
    no storage shared, no DOM shared, no sibling/ancestor reach.
  • Each parent↔child handshake (2.4) is independent and port-anchored.
  • Server I/O does NOT chain: D talks to SG/API directly (Edge 1), like everyone.
  • Brokers are local: broker_C watches C▶D; broker_B watches B▶C; etc.
    No tree-wide coordinator (that would need cross-tree visibility → forbidden).
  • Capability is NOT transitive: A reaches B; A does NOT reach C or D.

  cost: +1 iframe per level, +1 boot hop per level. Realistic depths (≤ ~3–4) are fine.
```

## 2.8 The three iframe contexts unify onto the one primitive

```
                         BEFORE (today)                  AFTER (this design)
  standalone /app   same-origin + full bridge      null kernel + null app (sg.* port)
  /vault view       send-browse renderer            null kernel, read-only capability
  /vault edit prev  sandbox w/o same-origin         null kernel, read-only,
                    (the SecurityError MVP hit)      data source = DIRTY EDITOR BUFFER

  Only per-context difference = which DATA SOURCE capability the kernel was handed.
  Win: edit-preview == real runtime (both null, both via the bridge) → "preview ≠ runtime" gone.
```

## 2.9 Authority resolution (the two-sided gate)

```
   request op on vault B
          │
          ▼
   ┌─────────────────────────┐   no    ┌──────────────────────────┐
   │ Did the PARENT grant a   │────────▶│ EPERM (no capability)     │
   │ capability covering op?  │         └──────────────────────────┘
   └───────────┬─────────────┘
               │ yes (standing or per-request elevation)
               ▼
   ┌─────────────────────────┐   no    ┌──────────────────────────┐
   │ Does B's OWN policy      │────────▶│ EPERM (child refuses,     │
   │ permit op for this caller│         │ regardless of credential) │
   │ class (cred vs uncred)?  │         └──────────────────────────┘
   └───────────┬─────────────┘
               │ yes
               ▼
   ┌─────────────────────────┐   ask   ┌──────────────────────────┐
   │ broker policy: auto/ask? │────────▶│ user prompt → y/n         │
   └───────────┬─────────────┘         └──────────────────────────┘
               │ auto / authorised
               ▼
        perform op (B acts on its own vault, Edge 1)
```
