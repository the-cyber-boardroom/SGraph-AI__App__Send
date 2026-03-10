# v0.3.13 — Research: WebRTC Data Channels for Peer-to-Peer File Transfer

**Date:** 2026-02-15
**Role:** Architect
**Version:** v0.3.13
**Status:** Research complete — recommendation is Phase 3 transport adapter

---

## 1. Executive Summary

This document evaluates WebRTC data channels as an alternative peer-to-peer transport for SGraph Send's file transfer engine. WebRTC enables direct browser-to-browser data transfer without routing file content through a server, using DTLS encryption over SCTP/UDP. The technology is mature, supported in all modern browsers, and provides built-in end-to-end encryption that aligns with SGraph Send's zero-knowledge model.

**Verdict:** WebRTC is a viable Phase 3 transport adapter. It should not replace the S3-based transport but rather complement it as an optional optimisation when both sender and receiver are online simultaneously. The architecture's existing chunk-based transfer manifest protocol maps cleanly onto WebRTC data channels — only the transport layer changes.

---

## 2. WebRTC Data Channels Overview

### 2.1 What They Are

WebRTC (Web Real-Time Communication) data channels provide a browser-native API for arbitrary bidirectional data transfer between two peers. Unlike WebRTC's media tracks (audio/video), data channels carry arbitrary binary or text data.

**Protocol stack:**
```
Application Data (ArrayBuffer / Blob / String)
        |
    SCTP (Stream Control Transmission Protocol)
        |
    DTLS 1.2 (Datagram Transport Layer Security)
        |
    ICE / UDP (or TCP fallback via TURN)
```

**Key specification:** [RFC 8831 — WebRTC Data Channels](https://datatracker.ietf.org/doc/html/rfc8831)

### 2.2 Data Channel Modes

| Mode | `ordered` | `maxRetransmits` / `maxPacketLifeTime` | Use Case |
|------|-----------|----------------------------------------|----------|
| Reliable ordered (default) | `true` | unset (infinite) | File transfer — guaranteed delivery in order |
| Reliable unordered | `false` | unset (infinite) | Parallel chunk download — guaranteed delivery, any order |
| Unreliable ordered | `true` | set (limited) | Not useful for file transfer |
| Unreliable unordered | `false` | set (limited) | Not useful for file transfer |

For file transfer, **reliable ordered** (the default) is the correct choice. Reliable unordered could enable parallel chunk reassembly but adds application-level complexity for marginal gain.

### 2.3 Maximum Message Size

The maximum message size varies by browser and configuration:

| Scenario | Max Message Size | Source |
|----------|-----------------|--------|
| Safe cross-browser baseline (no SCTP interleaving) | **16 KiB** | [RFC 8831](https://datatracker.ietf.org/doc/html/rfc8831) recommendation |
| SDP default (no `max-message-size` attribute) | **64 KiB** | SDP specification |
| Modern browsers (minimum guarantee) | **256 KiB** | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels) |
| Firefox with EOR (end-of-record) support | **Up to 1 GiB** | [Mozilla blog](https://blog.mozilla.org/webrtc/large-data-channel-messages/) |
| With SCTP ndata interleaving (theoretical) | **Unlimited** (memory-bound) | RFC 8260 |
| Avoid all network-level fragmentation | **~1,192 bytes** | SCTP MTU analysis |

**Recommendation for SGraph Send:** Use **16 KiB chunks** for maximum cross-browser interoperability. This is smaller than the S3 multipart upload chunk size but well-suited to data channel flow control. The 16 KiB baseline from [Lennart Grahl's analysis](https://lgrahl.de/articles/demystifying-webrtc-dc-size-limit.html) ensures no issues with head-of-line blocking or interoperability between Chrome, Firefox, and Safari.

### 2.4 Built-in Encryption

All WebRTC data channels are encrypted with **DTLS 1.2** using at minimum `TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256` with the P-256 curve. This is mandatory and cannot be disabled. DTLS provides:

- Confidentiality (AES-128-GCM or AES-256-GCM)
- Integrity (GCM authentication tag)
- Perfect Forward Secrecy (ECDHE key exchange)
- Peer authentication (self-signed certificate fingerprints exchanged via signalling)

### 2.5 Browser Support

| Browser | RTCDataChannel | Binary (ArrayBuffer) | Notes |
|---------|---------------|---------------------|-------|
| Chrome 26+ | Yes | Yes | Full support, largest market share |
| Firefox 22+ | Yes | Yes | Best large-message support (EOR) |
| Safari 11+ (macOS) | Yes | Yes | Full support |
| Safari 11+ (iOS) | Yes | Yes | **Requires TURN** — host ICE candidates not exposed by default |
| Edge 79+ (Chromium) | Yes | Yes | Same as Chrome |
| Brave | Yes | Yes | Chromium-based, includes native WebRTC controls |
| All iOS browsers | Yes | Yes | WebKit engine lock-in — same capabilities as Safari |

**Critical Safari/iOS caveat:** Safari on iOS does not expose host ICE candidates by default for security reasons. This means data-only channel connections (no getUserMedia call) will likely fail without a TURN server. Calling `getUserMedia()` first can unlock host ICE candidates, but this is a poor UX for a file transfer app. **A TURN server is effectively required for reliable iOS support.**

Source: [WebRTC Safari Developer's Guide 2025](https://www.videosdk.live/developer-hub/webrtc/webrtc-safari)

---

## 3. Connection Establishment (Signalling)

### 3.1 How It Works

WebRTC does not define a signalling protocol — it only requires that peers exchange three types of messages before a direct connection can be established:

1. **SDP Offer** — the initiator's session description (codecs, data channels, ICE credentials)
2. **SDP Answer** — the responder's session description
3. **ICE Candidates** — network address candidates discovered by each peer

The exchange mechanism is application-defined. Common approaches:

| Method | Latency | Complexity | Fits SGraph Send? |
|--------|---------|------------|-------------------|
| WebSocket | Low (real-time) | Medium | Yes — requires persistent connection |
| HTTP long-polling | Medium | Low | Yes — works with existing Lambda infrastructure |
| HTTP POST/GET polling | High | Lowest | Possible but slow (5-10s connection time) |
| Server-Sent Events (SSE) | Low | Low | Partial — unidirectional, needs POST for uplink |

### 3.2 Signalling Server Requirements for SGraph Send

The signalling server is **lightweight** — it only relays SDP and ICE metadata, never file data. Total signalling payload per connection is typically 2-5 KB.

**Implementation options for our stack:**

1. **WebSocket via API Gateway** — AWS API Gateway supports WebSocket APIs that invoke Lambda functions. Serverless, scales to zero, ~$1/million messages. This is the cleanest fit for our Lambda architecture.

2. **HTTP polling via existing Lambda** — The sender and receiver poll an endpoint. Simpler but adds 2-10 seconds of latency to connection setup. Could use DynamoDB or in-memory storage for the ephemeral signalling state.

3. **Dedicated WebSocket server** — A small persistent process (e.g., on Fargate or EC2). More operational overhead but lowest latency.

**Recommendation:** AWS API Gateway WebSocket API invoking Lambda functions. Reference: [AWS WebSocket API for WebRTC Signaling](https://webrtchacks.com/leverage-aws-websocket-api-for-webrtc-signaling/).

### 3.3 Connection Timeline

```
Sender                    Signalling Server                 Receiver
  |                              |                              |
  |--- Create offer (SDP) ----->|                              |
  |                              |--- Forward offer ---------->|
  |                              |                              |
  |                              |<-- Answer (SDP) ------------|
  |<-- Forward answer -----------|                              |
  |                              |                              |
  |--- ICE candidates --------->|--- Forward candidates ------>|
  |<-- ICE candidates -----------|<-- Forward candidates -------|
  |                              |                              |
  |============= DTLS Handshake (direct P2P) =================|
  |                              |                              |
  |=============== Data Channel Open (direct P2P) =============|
  |                              |                              |
  |--- File chunks (direct, no server) ----------------------->|
```

**Typical timing:**
- STUN (direct connection): 1-5 seconds
- TURN fallback: 2-10 seconds
- Signalling exchange: <1 second (WebSocket) or 2-5 seconds (HTTP polling)

---

## 4. NAT Traversal Deep Dive

### 4.1 ICE (Interactive Connectivity Establishment)

ICE is the framework WebRTC uses to find the best path between peers. It gathers "candidates" (IP:port pairs) and tests them in priority order:

1. **Host candidates** — local IP addresses (fastest, only works on same network)
2. **Server-reflexive candidates (STUN)** — public IP discovered via STUN server
3. **Relay candidates (TURN)** — traffic relayed through a TURN server

### 4.2 NAT Types and Traversal Success

| NAT Type | Prevalence | STUN Success | Notes |
|----------|------------|-------------|-------|
| Full Cone | ~15% residential | Yes | Easiest — any external host can reach the mapped port |
| Restricted Cone | ~20% residential | Yes | External host must be contacted first |
| Port Restricted Cone | ~25% residential | Yes (more fragile) | Both IP and port must match |
| Symmetric | ~40% residential, ~60% corporate | **No** | Port mapping changes per destination — requires TURN |

Source: [WebRTC NAT Traversal Guide](https://www.nihardaily.com/168-webrtc-nat-traversal-understanding-stun-turn-and-ice)

### 4.3 Real-World Success Rates

| Configuration | Connection Success Rate | Source |
|--------------|------------------------|--------|
| STUN only | **70-85%** | Industry data, callstats.io |
| STUN + TURN | **~99%** | With TURN fallback |
| No STUN/TURN | <50% | Only host candidates |

Key statistics:
- **~30% of WebRTC video conferences** require TURN relay (callstats.io)
- **80% of real-time communication failures** are linked to inadequate NAT traversal
- **TURN overhead** is approximately 20% higher latency than direct connections
- Corporate networks often block UDP entirely, requiring **TURN over TCP/TLS** as fallback

### 4.4 STUN Server Options (Free)

STUN is lightweight (only used during connection setup) and several free servers are available:

| Provider | URL | Notes |
|----------|-----|-------|
| Google | `stun:stun.l.google.com:19302` | Most widely used |
| Google (backup) | `stun:stun1.l.google.com:19302` | Redundancy |
| Cloudflare | `stun:stun.cloudflare.com:3478` | Part of Realtime offering |
| Mozilla | `stun:stun.services.mozilla.com` | Used by Firefox |

---

## 5. TURN Server Options and Pricing

TURN is the expensive component — it relays actual data traffic when direct connections fail.

### 5.1 Managed Services

| Provider | Pricing | Free Tier | Regions | Uptime SLA |
|----------|---------|-----------|---------|------------|
| **Cloudflare Realtime** | **$0.05/GB** (standalone) or **Free** (with SFU) | 10 GB/month (via Hugging Face) | 330+ PoPs | Enterprise SLA available |
| **Twilio** | $0.40/GB (US/EU), $0.60/GB (Asia), $0.80/GB (AU/BR) | STUN free, no TURN free tier | 9 regions (AWS) | Pay-as-you-go |
| **Xirsys** | Tiered plans | 5 GB free (Starter) | 7 data centres | 99.9% |
| **Metered.ca** | From $99/month | 500 MB free | 100+ PoPs, 31 regions | 99.999% |

Sources: [Twilio Pricing](https://www.twilio.com/en-us/stun-turn/pricing), [Xirsys Pricing](https://xirsys.com/pricing/), [Cloudflare TURN Docs](https://developers.cloudflare.com/realtime/turn/)

### 5.2 Self-Hosted: coturn

[coturn](https://github.com/coturn/coturn) is the industry-standard open-source TURN server, written in C.

- **Cost:** Infrastructure only (compute + bandwidth). On AWS, a t3.medium (~$30/month) can handle moderate TURN traffic. Bandwidth is the main cost ($0.09/GB on AWS).
- **Operational burden:** OS updates, security patches, TLS certificate renewal, capacity planning, monitoring.
- **Deployment:** Docker image available, can run on EC2, GCP, or bare metal.

### 5.3 Recommendation for SGraph Send

**Cloudflare Realtime TURN** at $0.05/GB is the best fit:
- Lowest per-GB cost among managed providers
- 330+ global PoPs (anycast routing to nearest)
- DTLS encryption means Cloudflare cannot inspect relayed data (aligns with zero-knowledge model)
- No operational overhead
- Free tier available via Hugging Face partnership

**Cost projection:** If 20% of transfers fall back to TURN, and average transfer is 50 MB:
- 1,000 transfers/month = 200 TURN transfers = 10 GB = **$0.50/month**
- 10,000 transfers/month = 2,000 TURN transfers = 100 GB = **$5.00/month**
- 100,000 transfers/month = 20,000 TURN transfers = 1 TB = **$50.00/month**

Compare with S3 egress for the same 100,000 transfers: 100,000 x 50 MB = 5 TB x $0.09/GB = **$450/month**. WebRTC P2P eliminates 80% of this, saving ~$360/month at that scale.

---

## 6. Performance Benchmarks

### 6.1 Native WebRTC Implementations (December 2025)

Benchmark from [Miuda.ai](https://miuda.ai/blog/webrtc-datachannel-benchmark/) — loopback, Apple Silicon, 10 concurrent connections, 1 KB packets:

| Implementation | Throughput | Messages/sec | Setup Latency | Memory |
|---------------|-----------|-------------|---------------|--------|
| RustRTC (pure Rust) | **213 MB/s** | 218,498 | 0.69 ms | 10 MB |
| Pion (Go) | **178 MB/s** | 182,191 | 1.80 ms | 41 MB |
| webrtc-rs (Rust port of Pion) | **135 MB/s** | 138,697 | 1.14 ms | 28 MB |

These represent the theoretical ceiling for WebRTC data channel throughput.

### 6.2 Browser-Based Performance (Real-World)

| Scenario | Throughput | Notes |
|----------|-----------|-------|
| Same device, Chrome tabs ([ShareDrop](https://github.com/ShareDropio/sharedrop)) | **~30 MB/s** | 10 GB file transfer between local tabs |
| Same LAN, Chrome to Chrome | **10-30 MB/s** | Varies by hardware and network |
| Same LAN, Android to Laptop | **~1.5 MB/s** | Mobile browser significantly slower |
| 50ms RTT, Firefox | **~1.9 MB/s** | SCTP window size becomes the bottleneck |
| Cross-continent (~100ms RTT) | **~0.5-2 MB/s** | Heavily RTT-dependent |
| Via TURN relay | **~1-5 MB/s** | Limited by TURN server bandwidth |

### 6.3 Why Browser Throughput is Lower Than Native

The primary bottleneck is the **SCTP congestion window size**. Browser WebRTC implementations use a small default SCTP window that does not adapt well to high-bandwidth, high-latency links. Throughput approximately halves when RTT doubles.

Secondary factors:
- JavaScript single-threaded execution (encryption, chunking, reassembly on main thread)
- `bufferedAmount` back-pressure limiting send rate
- No browser API to tune SCTP parameters
- Message interleaving (RFC 8260) not widely supported

### 6.4 Comparison: WebRTC P2P vs S3 Direct Upload

| Aspect | WebRTC P2P | S3 Direct (Presigned URLs) |
|--------|------------|---------------------------|
| **Server bandwidth cost** | Zero (direct) or TURN ($0.05/GB) | S3 egress $0.09/GB |
| **Upload throughput** | 1.5-30 MB/s (browser) | 6-25+ MB/s (S3 multipart) |
| **Download throughput** | Same as upload (symmetric) | 25-100+ MB/s (S3 CDN) |
| **Latency to start** | 2-10 sec (signalling + ICE) | <1 sec (presigned URL) |
| **Reliability** | Depends on NAT/network | 99.99% (S3 SLA) |
| **Works when offline** | No (both must be online) | Yes (async upload/download) |
| **Resume after disconnect** | Possible (application logic) | Simple (re-upload chunk) |
| **Max file size** | Memory-limited in browser | 5 TB (S3 limit) |
| **Browser support** | All modern browsers | All browsers (HTTP) |
| **Implementation complexity** | Medium-High | Low-Medium |
| **iOS Safari** | Requires TURN server | Works natively |

---

## 7. Existing Libraries

### 7.1 simple-peer

| Attribute | Value |
|-----------|-------|
| **npm package** | [`simple-peer`](https://www.npmjs.com/package/simple-peer) |
| **Latest version** | 9.11.1 |
| **Last published** | ~4 years ago (2022) |
| **Weekly downloads** | ~35,000 |
| **GitHub stars** | ~6,800 |
| **License** | MIT |
| **Bundle size** | ~6 KB minified |
| **Maintenance status** | **Inactive / Effectively unmaintained** |

**API style:**
```javascript
const peer = new SimplePeer({ initiator: true })

peer.on('signal', data => {
  // Send this to the remote peer via signalling server
  signalingServer.send(JSON.stringify(data))
})

peer.on('connect', () => {
  peer.send(chunk) // ArrayBuffer, Buffer, or string
})

peer.on('data', data => {
  // Received chunk from remote peer
  receivedChunks.push(data)
})
```

**Verdict:** Despite being the most popular WebRTC wrapper, simple-peer is **unmaintained since 2022**. No recent PRs merged, no issue triage. The API is elegant and well-designed, but relying on an unmaintained dependency for a security-sensitive file transfer product is not advisable. Community forks exist (`@nichoth/simple-peer`, `@ffgflash/simple-peer`) but none have established themselves as the successor.

Source: [Snyk package health analysis](https://snyk.io/advisor/npm-package/simple-peer)

### 7.2 PeerJS

| Attribute | Value |
|-----------|-------|
| **npm package** | [`peerjs`](https://www.npmjs.com/package/peerjs) |
| **Latest version** | 1.5.5 |
| **Last published** | ~8 months ago (mid-2025) |
| **Weekly downloads** | ~34,000-46,000 |
| **GitHub stars** | ~13,200 |
| **License** | MIT |
| **Maintenance status** | **Active** |
| **Companion server** | [PeerServer](https://www.npmjs.com/package/peer) (self-hostable) |

**API style:**
```javascript
// Sender
const peer = new Peer('sender-id', { host: 'our-server.com', port: 9000 })
const conn = peer.connect('receiver-id')
conn.on('open', () => {
  conn.send(chunk) // ArrayBuffer supported
})

// Receiver
const peer = new Peer('receiver-id', { host: 'our-server.com', port: 9000 })
peer.on('connection', conn => {
  conn.on('data', data => {
    receivedChunks.push(data)
  })
})
```

**Features:**
- Includes signalling server (PeerServer) — can self-host or use free cloud instance
- Binary data support (ArrayBuffer)
- Automatic reconnection handling
- Tested against Chrome, Edge, Firefox, Safari (with BrowserStack)
- CBOR/MessagePack support (Firefox 102+)
- Active Discord community for roadmap discussion

**Verdict:** PeerJS is the **best current library choice**. Actively maintained, includes a signalling server, and has a simpler API than raw WebRTC. The bundled PeerServer could be deployed alongside our Lambda architecture, or we could use PeerJS's client-side library with our own signalling server.

Source: [PeerJS website](https://peerjs.com/), [GitHub](https://github.com/peers/peerjs)

### 7.3 WebTorrent

| Attribute | Value |
|-----------|-------|
| **npm package** | [`webtorrent`](https://www.npmjs.com/package/webtorrent) |
| **Latest version** | 2.8.4 (August 2025) |
| **GitHub stars** | ~30,000+ |
| **License** | MIT |
| **Maintenance status** | **Active** |
| **Created by** | Feross Aboukhadijeh |

**What it does:** Implements the BitTorrent protocol over WebRTC data channels. Files are split into pieces, verified with SHA-1 hashes, and can be downloaded from multiple peers simultaneously (swarm).

**Relevance to SGraph Send:**
- Demonstrates proven large-file transfer over WebRTC at scale
- Chunked transfer with integrity verification is directly applicable
- Multi-peer (swarm) download could enable multi-source transfer in future
- **Too heavy** for 1-to-1 transfer — brings the entire BitTorrent protocol stack
- Streaming while downloading is an interesting pattern

**Verdict:** Good reference implementation but overkill for SGraph Send's 1-to-1 transfer model. Study its chunking and flow control patterns rather than adopting it as a dependency.

Source: [WebTorrent FAQ](https://webtorrent.io/faq), [GitHub](https://github.com/webtorrent/webtorrent)

### 7.4 Raw WebRTC API (No Library)

The native `RTCPeerConnection` and `RTCDataChannel` APIs are well-documented and stable. Given that SGraph Send only needs data channels (no media), the raw API surface is small:

- `RTCPeerConnection` — manage the peer connection
- `RTCPeerConnection.createDataChannel()` — create a data channel
- `RTCDataChannel.send()` — send data
- `RTCDataChannel.onmessage` — receive data
- `RTCDataChannel.bufferedAmount` — flow control
- `RTCDataChannel.bufferedAmountLowThreshold` + `onbufferedamountlow` — back-pressure

**Verdict:** For a security-sensitive product, using the raw API with a thin wrapper gives maximum control and eliminates third-party dependency risk. The signalling layer needs its own implementation regardless of which data channel library is used.

### 7.5 Library Comparison Summary

| Library | Active? | Bundle Size | Signalling Included | Binary Support | Recommendation |
|---------|---------|-------------|--------------------|--------------|----|
| simple-peer | No | ~6 KB | No | Yes | Do not use (unmaintained) |
| PeerJS | Yes | ~40 KB | Yes (PeerServer) | Yes | Best choice if using a library |
| WebTorrent | Yes | ~200 KB+ | Yes (tracker) | Yes | Too heavy for 1-to-1 |
| Raw API | N/A | 0 KB | No | Yes | Best choice for full control |

---

## 8. Existing P2P File Sharing Apps (Reference Implementations)

### 8.1 ShareDrop

- **URL:** [sharedrop.io](https://sharedrop.io/)
- **GitHub:** [ShareDropio/sharedrop](https://github.com/ShareDropio/sharedrop)
- **How it works:** WebRTC for P2P transfer, Firebase for presence management and signalling
- **Notable:** Same-network discovery without configuration (devices with same public IP see each other automatically)
- **Performance:** ~30 MB/s between browser tabs on same device
- **Concern (2025):** Originally acquired by LimeWire crypto company. Community fork at [sharedrop.stream](https://github.com/alexgoryushkin/sharedrop.stream) preserves the original open-source vision.

### 8.2 FilePizza

- **GitHub:** [kern/filepizza](https://github.com/kern/filepizza)
- **v2 (2025):** Major update — dark mode, mobile browser compatibility, transfer progress monitoring, password protection, multi-file uploads, streaming downloads via Service Worker, Redis-based server state
- **Design:** Files never pass through the server. Sender must keep browser window open until transfer completes.
- **Relevant pattern:** Optional password protection adds an extra encryption layer on top of DTLS.

### 8.3 PeerTransfer

- **GitHub:** [perguth/peertransfer](https://github.com/perguth/peertransfer)
- **Design:** P2P and E2E encrypted file transfer in the browser using WebRTC
- **Notable:** Explicitly adds application-level encryption on top of DTLS — similar to SGraph Send's zero-knowledge model.

---

## 9. File Transfer Protocol Design

### 9.1 Chunking Strategy

```
File (N bytes)
  |
  |-- Chunk 0: [header (32 bytes)] + [encrypted data (16,352 bytes)] = 16,384 bytes (16 KiB)
  |-- Chunk 1: [header (32 bytes)] + [encrypted data (16,352 bytes)] = 16,384 bytes
  |-- ...
  |-- Chunk N: [header (32 bytes)] + [encrypted data (remaining)]    = <= 16,384 bytes
```

**Chunk header format (32 bytes):**
```
Bytes 0-3:   chunk_index (uint32, big-endian)
Bytes 4-7:   total_chunks (uint32, big-endian)
Bytes 8-11:  payload_length (uint32, big-endian)
Bytes 12-15: flags (uint32) — bit 0: is_last_chunk, bit 1: is_manifest
Bytes 16-31: reserved (future: checksum, transfer_id fragment)
```

**Why 16 KiB:** This is the safe cross-browser maximum from [RFC 8831](https://datatracker.ietf.org/doc/html/rfc8831) without SCTP message interleaving. Larger chunks risk head-of-line blocking and interoperability issues. The overhead of 32-byte headers on 16 KiB chunks is 0.2% — negligible.

### 9.2 Flow Control Pattern

The critical pattern for avoiding buffer overflow. Without flow control, sending chunks as fast as possible will exceed the data channel's internal buffer and cause errors or crashes.

```javascript
// Constants
const CHUNK_SIZE       = 16384          // 16 KiB — safe cross-browser maximum
const BUFFER_THRESHOLD = 65536          // 64 KiB — pause sending above this
const HEADER_SIZE      = 32             // Chunk header size in bytes

class WebRTC_File_Sender {

    constructor(dataChannel, file, encryptionKey) {
        this.dc           = dataChannel
        this.file         = file
        this.key          = encryptionKey
        this.chunkIndex   = 0
        this.totalChunks  = Math.ceil(file.size / (CHUNK_SIZE - HEADER_SIZE))
        this.paused       = false

        // Configure back-pressure threshold
        this.dc.bufferedAmountLowThreshold = BUFFER_THRESHOLD

        // Resume sending when buffer drains
        this.dc.onbufferedamountlow = () => {
            if (this.paused) {
                this.paused = false
                this._sendNextChunk()
            }
        }
    }

    async start() {
        this._sendNextChunk()
    }

    async _sendNextChunk() {
        while (this.chunkIndex < this.totalChunks) {
            // Check back-pressure
            if (this.dc.bufferedAmount > BUFFER_THRESHOLD) {
                this.paused = true
                return // Will resume via onbufferedamountlow
            }

            // Read chunk from file
            const offset    = this.chunkIndex * (CHUNK_SIZE - HEADER_SIZE)
            const end       = Math.min(offset + (CHUNK_SIZE - HEADER_SIZE), this.file.size)
            const rawData   = await this._readSlice(offset, end)

            // Encrypt chunk (AES-256-GCM, application-level)
            const encrypted = await this._encrypt(rawData)

            // Build chunk with header
            const chunk     = this._buildChunk(this.chunkIndex, encrypted)

            // Send
            this.dc.send(chunk)
            this.chunkIndex++

            // Report progress
            this.onProgress?.(this.chunkIndex / this.totalChunks)
        }

        this.onComplete?.()
    }

    _buildChunk(index, payload) {
        const buffer = new ArrayBuffer(HEADER_SIZE + payload.byteLength)
        const view   = new DataView(buffer)
        view.setUint32(0, index)
        view.setUint32(4, this.totalChunks)
        view.setUint32(8, payload.byteLength)
        view.setUint32(12, index === this.totalChunks - 1 ? 1 : 0)
        new Uint8Array(buffer, HEADER_SIZE).set(new Uint8Array(payload))
        return buffer
    }

    async _readSlice(start, end) {
        const blob = this.file.slice(start, end)
        return blob.arrayBuffer()
    }

    async _encrypt(data) {
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            this.key,
            data
        )
        // Prepend IV to ciphertext (12 + ciphertext + 16 tag)
        const result = new Uint8Array(12 + ciphertext.byteLength)
        result.set(iv)
        result.set(new Uint8Array(ciphertext), 12)
        return result.buffer
    }
}
```

**Receiver side:**
```javascript
class WebRTC_File_Receiver {

    constructor(dataChannel, encryptionKey) {
        this.dc       = dataChannel
        this.key      = encryptionKey
        this.chunks   = new Map()  // index -> decrypted data
        this.received = 0
        this.total    = null

        this.dc.binaryType = 'arraybuffer'
        this.dc.onmessage  = (event) => this._onChunk(event.data)
    }

    async _onChunk(buffer) {
        const view    = new DataView(buffer)
        const index   = view.getUint32(0)
        const total   = view.getUint32(4)
        const length  = view.getUint32(8)
        const flags   = view.getUint32(12)
        const isLast  = (flags & 1) === 1

        this.total = total

        // Extract and decrypt payload
        const payload   = buffer.slice(HEADER_SIZE, HEADER_SIZE + length)
        const decrypted = await this._decrypt(payload)

        this.chunks.set(index, decrypted)
        this.received++

        // Report progress
        this.onProgress?.(this.received / this.total)

        // If all chunks received, reassemble
        if (this.received === this.total) {
            this._reassemble()
        }
    }

    async _decrypt(data) {
        const iv         = data.slice(0, 12)
        const ciphertext = data.slice(12)
        return crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(iv) },
            this.key,
            ciphertext
        )
    }

    _reassemble() {
        const parts = []
        for (let i = 0; i < this.total; i++) {
            parts.push(this.chunks.get(i))
        }
        const blob = new Blob(parts)
        this.onComplete?.(blob)
    }
}
```

Sources: [MDN bufferedAmount](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount), [MDN bufferedAmountLowThreshold](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmountLowThreshold), [RTCDataChannel Guide](https://webrtc.link/en/articles/rtcdatachannel-usage-and-message-size-limits/)

### 9.3 Connection Setup (Minimal Signalling)

```javascript
// Sender side — initiates the connection
async function createSenderConnection(signalingChannel) {
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            {
                urls: 'turn:turn.example.com:3478',
                username: 'sgraph',
                credential: 'token-from-server'
            }
        ]
    })

    // Create data channel BEFORE creating offer
    const dc = pc.createDataChannel('file-transfer', {
        ordered: true,   // Reliable ordered — default, explicit for clarity
    })
    dc.binaryType = 'arraybuffer'

    // Gather ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            signalingChannel.send({
                type: 'ice-candidate',
                candidate: event.candidate
            })
        }
    }

    // Create and send offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    signalingChannel.send({ type: 'offer', sdp: offer })

    // Wait for answer from receiver
    signalingChannel.onMessage((msg) => {
        if (msg.type === 'answer') {
            pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        } else if (msg.type === 'ice-candidate') {
            pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
        }
    })

    return { pc, dc }
}

// Receiver side — accepts the connection
async function createReceiverConnection(signalingChannel) {
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' },
            {
                urls: 'turn:turn.example.com:3478',
                username: 'sgraph',
                credential: 'token-from-server'
            }
        ]
    })

    // Listen for data channel from sender
    const dcPromise = new Promise((resolve) => {
        pc.ondatachannel = (event) => {
            const dc = event.channel
            dc.binaryType = 'arraybuffer'
            resolve(dc)
        }
    })

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            signalingChannel.send({
                type: 'ice-candidate',
                candidate: event.candidate
            })
        }
    }

    signalingChannel.onMessage(async (msg) => {
        if (msg.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            signalingChannel.send({ type: 'answer', sdp: answer })
        } else if (msg.type === 'ice-candidate') {
            pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
        }
    })

    return { pc, dc: await dcPromise }
}
```

### 9.4 Resumable Transfer Protocol

WebRTC connections can drop. The resume protocol requires application-level logic:

```
Sender                                          Receiver
  |                                                |
  | [Connection drops at chunk 1,847 of 5,000]    |
  |                                                |
  | [Re-establish WebRTC via signalling server]    |
  |============= New Data Channel =================|
  |                                                |
  |<--- RESUME_REQUEST { received: [0..1846] } ----|
  |                                                |
  |--- Chunk 1847 -------------------------------->|
  |--- Chunk 1848 -------------------------------->|
  |--- ...                                         |
```

The receiver maintains a **bitmap** of received chunks. On reconnection, it sends the bitmap to the sender, who resumes from the first missing chunk. This is identical to the existing transfer manifest's chunk tracking — the same data structure works for both S3 and WebRTC transports.

---

## 10. Security Considerations

### 10.1 Encryption Layering

SGraph Send's zero-knowledge model requires that the server never sees plaintext. With WebRTC P2P, there is no server in the data path, but we still apply application-level encryption for defence-in-depth:

| Layer | Protocol | Purpose | Overhead per chunk |
|-------|----------|---------|-------------------|
| Transport | DTLS 1.2 (AES-128-GCM) | Encrypts the data channel | Negligible (hardware-accelerated) |
| Application | AES-256-GCM (Web Crypto API) | Zero-knowledge guarantee | +28 bytes (12-byte IV + 16-byte auth tag) |

**Why double encryption is acceptable:**
- AES-256 has only marginal CPU overhead versus AES-128 — the DTLS handshake (2.3M CPU cycles) dominates, not per-byte encryption
- Application-level encryption ensures the file data is protected even if DTLS is compromised
- The same encrypted chunks can be sent over either WebRTC or S3 — the transport is transparent
- Per-chunk overhead is 28 bytes on 16,384-byte chunks = 0.17%

Source: [DTLS Performance Study (arXiv)](https://arxiv.org/pdf/1904.11423)

### 10.2 IP Address Exposure

WebRTC connections inherently expose IP addresses to the peer:

| Scenario | Sender IP visible to | Receiver IP visible to |
|----------|---------------------|----------------------|
| Direct (STUN) | Receiver | Sender |
| Via TURN | TURN server only | TURN server only |

**Mitigations:**
1. **mDNS ICE candidates** — modern browsers replace local IP addresses with randomly generated `.local` mDNS names, preventing local network topology leakage. Supported in Chrome, Firefox, Safari. Source: [IETF mDNS ICE Candidates Draft](https://datatracker.ietf.org/doc/html/draft-ietf-mmusic-mdns-ice-candidates-03)
2. **TURN-only mode** — force all traffic through TURN to hide peer IPs from each other. This defeats the P2P bandwidth advantage but preserves privacy.
3. **Accept the trade-off** — for SGraph Send, both parties are willingly sharing a file. Knowing each other's public IP is a reasonable trade-off for direct transfer speed.

**SGraph Send's existing `ip_hash` model:** The server stores SHA-256 hashed IPs with daily salt. With WebRTC P2P, the server never sees either party's IP in the data path. The signalling server could still hash IPs for rate limiting.

### 10.3 Signalling Server Security

The signalling server handles SDP and ICE candidates. These contain:
- Public IP addresses and ports
- DTLS certificate fingerprints
- ICE credentials (ufrag/pwd)

None of this is sufficient to decrypt the data channel. However, a compromised signalling server could perform a man-in-the-middle attack by substituting certificate fingerprints. Mitigation: verify DTLS fingerprints out-of-band (e.g., display a short authentication string to both users).

### 10.4 Threat Model Comparison

| Threat | S3 Transport | WebRTC P2P | WebRTC via TURN |
|--------|-------------|------------|-----------------|
| Server sees plaintext | No (client-side encryption) | N/A (no server) | No (DTLS + app encryption) |
| Server sees metadata (file size, timing) | Yes | Signalling only | TURN sees encrypted traffic volume |
| IP exposure to peer | No | Yes (public IP) | No (TURN hides) |
| Man-in-the-middle | TLS to S3 | DTLS (signalling trust) | DTLS (signalling trust) |
| Replay attack | S3 presigned URL expiry | DTLS nonce | DTLS nonce |

---

## 11. Implementation Complexity Assessment

| Component | Complexity | Effort | Notes |
|-----------|-----------|--------|-------|
| Signalling server (WebSocket) | Medium | 2-3 days | AWS API Gateway WebSocket + Lambda, or FastAPI WebSocket |
| ICE/STUN configuration | Low | 0.5 day | Config only, browser handles ICE agent |
| TURN server setup | Low | 0.5 day | Managed service (Cloudflare), config only |
| Data channel wrapper | Low | 1 day | Thin wrapper over RTCDataChannel API |
| Chunking + flow control | Medium | 2 days | bufferedAmount pattern, chunk headers |
| Application-level encryption | Low | 0.5 day | Already implemented for S3 path |
| Resume/reconnection logic | Medium-High | 2-3 days | Chunk bitmap, reconnection state machine |
| Transport adapter interface | Medium | 1-2 days | Abstract S3 and WebRTC behind common API |
| Progress tracking + UI | Low | 1 day | Reuse existing progress UI |
| Testing (unit + integration) | Medium | 2-3 days | Need two browser contexts for E2E |
| Safari/iOS compatibility | Medium | 1-2 days | TURN fallback, ICE candidate handling |
| **Total** | | **~14-18 days** | |

---

## 12. Hybrid Architecture (Recommended)

The recommended architecture treats WebRTC as an optional transport adapter alongside the existing S3 transport. The transfer manifest and chunk protocol remain identical — only the transport changes.

```
                                    ┌──────────────────┐
                                    │  Transfer Engine  │
                                    │  (chunk protocol, │
                                    │   encryption,     │
                                    │   manifest)       │
                                    └────────┬─────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              │                             │
                    ┌─────────┴─────────┐       ┌──────────┴──────────┐
                    │  S3 Transport     │       │  WebRTC Transport   │
                    │  Adapter          │       │  Adapter            │
                    │                   │       │                     │
                    │  - Presigned URLs │       │  - Data channels    │
                    │  - Multipart      │       │  - Flow control     │
                    │  - Always works   │       │  - Signalling       │
                    │  - Async          │       │  - ICE/TURN         │
                    └───────────────────┘       └─────────────────────┘
```

### Decision Logic

```
When sender initiates transfer:
  1. Create transfer manifest (same for both transports)
  2. If receiver is currently online AND WebRTC is available:
     a. Attempt WebRTC connection (signalling + ICE)
     b. If connection established within 10 seconds:
        → Transfer via WebRTC data channel (zero server cost)
     c. If connection fails (NAT/firewall/timeout):
        → Fall back to S3 upload (receiver downloads later)
  3. If receiver is offline:
     → Upload to S3 (standard async path)
  4. If WebRTC transfer fails mid-way:
     → Resume remaining chunks via S3
```

### Why This Architecture Works for SGraph Send

1. **Same chunk protocol** — encrypted chunks are identical regardless of transport
2. **Same manifest** — tracks which chunks are delivered, by which transport
3. **Graceful degradation** — S3 is always available as fallback
4. **Zero server cost for P2P** — 80% of connections succeed directly
5. **Preserves zero-knowledge** — application-level encryption is transport-independent
6. **No UX change needed** — transport selection is automatic, transparent to user

---

## 13. Recommendations for SGraph Send

### Phase 1 (Current — v0.3.x): Do Not Implement WebRTC

- Focus on S3 direct upload with presigned URLs
- The S3 path is simpler, more reliable, works when parties are offline, and covers 100% of use cases
- WebRTC adds significant complexity for an optimisation that only applies when both parties are online

### Phase 2 (v0.4.x): Lay the Transport Adapter Foundation

- Refactor the transfer engine to have a pluggable transport interface
- Ensure the chunk protocol and manifest are transport-agnostic
- This makes Phase 3 implementation straightforward

### Phase 3 (v0.5.x or later): Add WebRTC Transport Adapter

- Implement signalling server (AWS API Gateway WebSocket)
- Add WebRTC transport adapter behind the existing chunk protocol
- Use **PeerJS** client library or a thin wrapper over the raw WebRTC API
- Use **Cloudflare Realtime TURN** ($0.05/GB) as the managed TURN fallback
- Use **Google STUN** (`stun:stun.l.google.com:19302`) for free NAT traversal
- Implement hybrid decision logic (WebRTC first, S3 fallback)

### Library Recommendation

| Option | Recommendation | Reason |
|--------|---------------|--------|
| PeerJS | Good if speed of implementation matters | Active, includes signalling server, good API |
| Raw WebRTC API | Best for long-term control | No third-party dependency, full control, smaller bundle |
| simple-peer | Do not use | Unmaintained since 2022 |
| WebTorrent | Do not use | Overkill for 1-to-1 transfer |

### TURN Recommendation

**Cloudflare Realtime TURN** at $0.05/GB:
- Cheapest managed option (8x cheaper than Twilio)
- 330+ global PoPs with anycast routing
- Cannot inspect relayed data (DTLS encryption)
- No operational overhead

---

## 14. Sources

### Specifications and Standards
- [RFC 8831 — WebRTC Data Channels](https://datatracker.ietf.org/doc/html/rfc8831)
- [IETF mDNS ICE Candidates Draft](https://datatracker.ietf.org/doc/html/draft-ietf-mmusic-mdns-ice-candidates-03)
- [RFC 8260 — SCTP Stream Schedulers and User Message Interleaving](https://datatracker.ietf.org/doc/html/rfc8260)

### MDN Documentation
- [Using WebRTC Data Channels](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels)
- [RTCDataChannel.bufferedAmount](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount)
- [RTCDataChannel.bufferedAmountLowThreshold](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmountLowThreshold)
- [RTCSctpTransport.maxMessageSize](https://developer.mozilla.org/en-US/docs/Web/API/RTCSctpTransport/maxMessageSize)
- [RTCPeerConnection.createDataChannel()](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel)

### Libraries
- [simple-peer on npm](https://www.npmjs.com/package/simple-peer) — [GitHub](https://github.com/feross/simple-peer) — [Snyk Health](https://snyk.io/advisor/npm-package/simple-peer)
- [PeerJS on npm](https://www.npmjs.com/package/peerjs) — [GitHub](https://github.com/peers/peerjs) — [Website](https://peerjs.com/)
- [WebTorrent on npm](https://www.npmjs.com/package/webtorrent) — [GitHub](https://github.com/webtorrent/webtorrent) — [Website](https://webtorrent.io/)

### TURN Providers
- [Cloudflare Realtime TURN Docs](https://developers.cloudflare.com/realtime/turn/)
- [Twilio Network Traversal Pricing](https://www.twilio.com/en-us/stun-turn/pricing)
- [Xirsys Pricing](https://xirsys.com/pricing/)
- [Selecting Managed STUN/TURN Servers (WebRTC.ventures)](https://webrtc.ventures/2024/11/selecting-and-deploying-managed-stun-turn-servers/)

### Performance
- [Miuda.ai WebRTC Data Channel Benchmark (Dec 2025)](https://miuda.ai/blog/webrtc-datachannel-benchmark/)
- [DTLS Performance Study (arXiv)](https://arxiv.org/pdf/1904.11423)
- [ShareDrop Max Transfer Speed Discussion](https://github.com/szimek/sharedrop/issues/154)
- [Mozilla Large Data Channel Messages](https://blog.mozilla.org/webrtc/large-data-channel-messages/)
- [Lennart Grahl — Demystifying DC Message Size Limits](https://lgrahl.de/articles/demystifying-webrtc-dc-size-limit.html)

### NAT Traversal
- [WebRTC NAT Traversal Guide](https://www.nihardaily.com/168-webrtc-nat-traversal-understanding-stun-turn-and-ice)
- [LiveSwitch — NAT Traversal Methods](https://www.liveswitch.io/blog/webrtc-nat-traversal-methods-a-case-for-embedded-turn)
- [WebRTC TURN Servers — When You NEED It (BlogGeek.me)](https://bloggeek.me/webrtc-turn/)

### Browser Compatibility
- [WebRTC Safari Developer's Guide 2025 (VideoSDK)](https://www.videosdk.live/developer-hub/webrtc/webrtc-safari)
- [WebRTC IP Leaks — Should You Still Worry? (GetStream)](https://getstream.io/blog/webrtc-ip-leaks/)
- [RTCDataChannel on Can I Use](https://caniuse.com/mdn-api_rtcdatachannel)

### Reference Implementations
- [ShareDrop](https://github.com/ShareDropio/sharedrop) — [Community Fork](https://github.com/alexgoryushkin/sharedrop.stream)
- [FilePizza](https://github.com/kern/filepizza)
- [PeerTransfer](https://github.com/perguth/peertransfer)
- [WebRTC Official File Transfer Sample](https://webrtc.github.io/samples/src/content/datachannel/filetransfer/)
- [Pion Data Channel Flow Control Example (Go)](https://github.com/pion/webrtc/blob/master/examples/data-channels-flow-control/README.md)

### Signalling
- [AWS WebSocket API for WebRTC Signaling (webrtcHacks)](https://webrtchacks.com/leverage-aws-websocket-api-for-webrtc-signaling/)
- [WebRTC Signaling with WebSocket (LogRocket)](https://blog.logrocket.com/webrtc-signaling-websocket-node-js/)
- [web.dev — Send Data Between Browsers with WebRTC Data Channels](https://web.dev/webrtc-datachannels/)
