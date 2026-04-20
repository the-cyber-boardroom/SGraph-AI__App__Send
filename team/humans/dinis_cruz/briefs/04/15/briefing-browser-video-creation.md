# Briefing: Browser-Based Video Creation from Slide Decks

*Slide narration with text animation, voiceover, and avatar — all client-side*

## The Goal

Take a set of infographic slides (PNGs) and automatically produce a video with:
1. **Text animation** — slide transitions with animated captions/explanations
2. **Voiceover** — natural-sounding TTS narration of each slide's content
3. **Avatar** — a talking head or animated character lip-synced to the audio

All running in the browser. No server. No subscription. Zero marginal cost per video.

## The Stack (Recommended)

| Layer | Technology | Runs in browser? | Cost | Maturity |
|-------|-----------|-----------------|------|----------|
| **TTS** | Kokoro.js (82M ONNX) | Yes (WebGPU/WASM) | Free | Production-ready |
| **Text animation** | Canvas 2D + CSS/GSAP | Yes (native) | Free | Mature |
| **Avatar** | TalkingHead (Three.js) | Yes (WebGL) | Free | Production-ready |
| **Video capture** | MediaRecorder API | Yes (native) | Free | Mature |
| **Video encoding** | FFmpeg.wasm (WebM→MP4) | Yes (WASM) | Free | Production-ready |
| **Orchestration** | Custom JS pipeline | Yes | Free | You build this |

**Total cost: $0 per video. Everything client-side.**

## Layer 1: Text-to-Speech — Kokoro.js

Kokoro is an 82M parameter TTS model that runs entirely in the browser via ONNX Runtime (WebGPU with WASM fallback). It produces natural, human-like speech comparable to cloud services.

### Key Facts
- 82M parameters, ~160MB model download (cached after first load)
- Generates 10 seconds of speech in ~1 second on WebGPU
- Multiple voices: American English, British English (French, Japanese, Korean, Mandarin also supported)
- Apache 2.0 licence
- Zero API cost, unlimited generation

### Usage

```javascript
import { KokoroTTS } from "kokoro-js";

const tts = await KokoroTTS.from_pretrained(
  "onnx-community/Kokoro-82M-v1.0-ONNX",
  { dtype: "q8" }  // q8 for WASM, fp32 for WebGPU
);

// List available voices
const voices = tts.list_voices();
// e.g. af_bella, af_sky, am_adam, bf_emma, bm_george...

// Generate audio
const audio = await tts.generate(
  "This slide shows the five company concepts we developed for OWASP members.",
  { voice: "af_bella", speed: 1.0 }
);

// Play it
const audioCtx = new AudioContext();
const buffer = audioCtx.createBuffer(1, audio.length, audio.sampleRate);
buffer.getChannelData(0).set(audio.data);
const source = audioCtx.createBufferSource();
source.buffer = buffer;
source.connect(audioCtx.destination);
source.start();
```

### Streaming (for long narrations)

```javascript
const chunks = [
  "This is slide one. The thesis.",
  "This is slide two. The principles.",
];

const stream = tts.stream(chunks, { voice: "af_bella", speed: 1.0 });
for await (const { text, audio } of stream) {
  // Play or record each chunk as it's generated
}
```

### Voice Recommendations for Presentations
- `af_bella` — clear, professional female American
- `am_adam` — clear, professional male American
- `bf_emma` — British female (good for UK audiences)
- `bm_george` — British male

## Layer 2: Text Animation — Canvas 2D

Animate slide transitions and overlay text using the Canvas API. The Canvas feeds into MediaRecorder for video capture.

### Approach

```javascript
const canvas = document.createElement('canvas');
canvas.width = 1920;
canvas.height = 1080;
const ctx = canvas.getContext('2d');

// Draw slide
const slideImg = new Image();
slideImg.src = 'slide-01.png';
await new Promise(r => slideImg.onload = r);

// Animation loop
function drawFrame(t) {
  ctx.clearRect(0, 0, 1920, 1080);

  // Draw slide (with optional zoom/pan)
  ctx.drawImage(slideImg, 0, 0, 1920, 1080);

  // Animated caption overlay
  const alpha = Math.min(1, t / 1000); // fade in over 1 second
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 900, 1920, 180); // caption bar
  ctx.fillStyle = '#ffffff';
  ctx.font = '36px system-ui';
  ctx.fillText(captionText, 60, 960);
  ctx.globalAlpha = 1;

  requestAnimationFrame(() => drawFrame(t + 16));
}
```

### Animation Ideas
- **Slide transitions**: crossfade, slide-in, zoom
- **Caption bar**: animated lower-third with speaker name and topic
- **Progress bar**: thin teal line at bottom showing position in deck
- **Section headers**: full-screen title cards between acts
- **Bullet reveal**: text appearing word-by-word in sync with TTS

### Libraries (optional)

- **GSAP** (GreenSock): professional-grade animation with timeline sequencing. CDN available.
- **Motion** (formerly Framer Motion): React-based, great for component animations.
- **Anime.js**: lightweight, good for SVG and DOM animations.
- **Fabric.js**: Canvas object model, good for compositing slides + overlays.

For a vanilla JS approach, Canvas 2D + requestAnimationFrame is sufficient.

## Layer 3: Avatar — TalkingHead

TalkingHead is an open-source JavaScript class that renders a 3D avatar in the browser using Three.js, with real-time lip-sync from audio input.

### Key Facts
- Full 3D avatars with lip-sync, expressions, gestures, head movement
- Runs in WebGL via Three.js (works in all modern browsers)
- Takes audio input and generates visemes (mouth shapes) in real-time
- Supports ReadyPlayerMe avatars, VRM models, and custom rigged models
- MIT licence
- Featured at AI Film Awards, Cannes 2025

### Repository
`https://github.com/met4citizen/TalkingHead`

### Basic Integration

```javascript
import { TalkingHead } from 'talkinghead';

const avatar = new TalkingHead(containerElement, {
  modelUrl: 'avatar-model.glb',  // ReadyPlayerMe or VRM
  cameraView: 'upper'            // head-and-shoulders framing
});

// Feed audio for lip-sync
await avatar.speakAudio(audioBuffer);

// Or speak with built-in TTS
await avatar.speakText("Hello, welcome to the presentation.");
```

### Avatar Options (from simple to complex)

| Option | Complexity | Visual quality | Browser load |
|--------|-----------|---------------|-------------|
| **CSS animated icon** | Trivial | Low (pulsing circle) | Minimal |
| **2D sprite animation** | Low | Medium (animated face) | Low |
| **Lottie animation** | Low | Good (vector avatar) | Low |
| **TalkingHead 3D** | Medium | High (full 3D avatar) | Medium (WebGL) |
| **Custom Three.js** | High | Highest | High |

**Recommendation**: Start with a simple 2D animated avatar (a stylised face that moves its mouth in sync with audio amplitude). Graduate to TalkingHead 3D when the pipeline is working.

### Simple Audio-Reactive Avatar (no 3D needed)

```javascript
// Analyse audio amplitude to drive mouth animation
const analyser = audioCtx.createAnalyser();
source.connect(analyser);
const data = new Uint8Array(analyser.frequencyBinCount);

function drawAvatar() {
  analyser.getByteFrequencyData(data);
  const amplitude = data.reduce((a, b) => a + b) / data.length;
  const mouthOpen = amplitude / 255; // 0.0 to 1.0

  // Draw simple avatar face on canvas
  ctx.beginPath();
  ctx.arc(160, 160, 100, 0, Math.PI * 2); // head
  ctx.fillStyle = '#4ECDC4';
  ctx.fill();

  // Mouth (opens based on audio)
  ctx.beginPath();
  ctx.ellipse(160, 200, 30, 10 + mouthOpen * 20, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();

  requestAnimationFrame(drawAvatar);
}
```

## Layer 4: Video Capture — MediaRecorder API

The browser's MediaRecorder API captures a Canvas stream as WebM video.

### Pipeline

```javascript
// Combine canvas video stream + audio stream
const canvasStream = canvas.captureStream(30); // 30 FPS
const audioStream = audioDestination.stream;   // from Web Audio API

// Merge streams
const combined = new MediaStream([
  ...canvasStream.getVideoTracks(),
  ...audioStream.getAudioTracks()
]);

// Record
const recorder = new MediaRecorder(combined, {
  mimeType: 'video/webm;codecs=vp9,opus',
  videoBitsPerSecond: 2500000  // 2.5 Mbps
});

const chunks = [];
recorder.ondataavailable = e => chunks.push(e.data);
recorder.onstop = () => {
  const blob = new Blob(chunks, { type: 'video/webm' });
  // Download or convert to MP4
};

recorder.start();
```

### Audio Routing for Recording

To capture both the TTS audio and the canvas video:

```javascript
const audioCtx = new AudioContext();
const destination = audioCtx.createMediaStreamDestination();

// Connect TTS audio to both speakers and recorder
const source = audioCtx.createBufferSource();
source.buffer = ttsAudioBuffer;
source.connect(audioCtx.destination);  // speakers
source.connect(destination);            // recorder
source.start();
```

## Layer 5: WebM → MP4 — FFmpeg.wasm

MediaRecorder outputs WebM. For LinkedIn, YouTube, and most platforms, you need MP4. FFmpeg.wasm runs the full FFmpeg toolkit in the browser.

```javascript
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();
await ffmpeg.load();

await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob));
await ffmpeg.exec([
  '-i', 'input.webm',
  '-c:v', 'libx264',
  '-c:a', 'aac',
  '-movflags', 'faststart',
  'output.mp4'
]);

const mp4Data = await ffmpeg.readFile('output.mp4');
const mp4Blob = new Blob([mp4Data], { type: 'video/mp4' });
```

Note: FFmpeg.wasm is ~30MB download. The conversion can be slow for long videos (~1x realtime). For short videos (under 5 min) it works well.

## The Full Pipeline

```
For each slide:
  1. Load slide image onto Canvas
  2. Get narration text (from manifest or article)
  3. Generate TTS audio via Kokoro.js
  4. Calculate audio duration
  5. Start recording (MediaRecorder)
  6. Animate: slide appears → caption fades in → avatar speaks
  7. Wait for audio duration + padding
  8. Transition to next slide
After all slides:
  9. Stop recording → WebM blob
  10. Convert WebM → MP4 via FFmpeg.wasm
  11. Download
```

### Estimated Performance (modern laptop)

| Step | Time per slide |
|------|---------------|
| Kokoro TTS generation | ~1s per 10s of audio |
| Canvas rendering | Real-time (30 FPS) |
| MediaRecorder capture | Real-time |
| FFmpeg conversion | ~1x realtime |

A 30-slide video with 20 seconds per slide (10 min total) would take approximately 12-15 minutes to produce in the browser.

## Alternative: Hybrid Approach (Browser + API)

If browser-only is too slow or you want higher quality:

| Component | Browser-only | Hybrid (browser + API) |
|-----------|-------------|----------------------|
| TTS | Kokoro.js (free) | OpenAI TTS API (~$0.015/1K chars, best quality) or ElevenLabs (~$5/mo) |
| Avatar | TalkingHead / Canvas | D-ID API (~$5/video) or HeyGen |
| Encoding | FFmpeg.wasm | Server-side FFmpeg |
| Text animation | Canvas (same) | Remotion (React video framework, Node.js) |

### Cost Comparison (for a 10-minute, 30-slide video)

| Approach | Cost | Quality | Speed |
|----------|------|---------|-------|
| Full browser (Kokoro + Canvas + MediaRecorder) | $0 | Good | ~15 min |
| Browser + OpenAI TTS | ~$0.10 | Very good audio | ~12 min |
| Browser + ElevenLabs | ~$0.50 | Excellent audio | ~12 min |
| Full cloud (D-ID + ElevenLabs) | ~$10-20 | Professional | ~5 min |
| Synthesia/HeyGen | ~$25-30/video | Studio quality | ~5 min |

## Recommended MVP Path

### MVP 1: Slide Slideshow with TTS Audio
- Load slides onto Canvas with crossfade transitions
- Generate narration per slide using Kokoro.js
- Record Canvas + audio with MediaRecorder
- Output: WebM video with slide narration
- **This is achievable in a weekend**

### MVP 2: Add Text Animation
- Animated captions synced to TTS timing
- Lower-third speaker bar
- Section title cards between acts
- Progress bar

### MVP 3: Add Simple Avatar
- Audio-reactive 2D avatar (amplitude → mouth movement)
- Picture-in-picture layout (slides full screen, avatar in corner)
- Or: side-by-side layout (slides left, avatar right)

### MVP 4: 3D Avatar + Polish
- TalkingHead integration with ReadyPlayerMe avatar
- Proper lip-sync from audio
- Eye movement, blinking, idle animations
- MP4 export via FFmpeg.wasm

### MVP 5: Full Automation
- Take a manifest.json + slides + articles
- Automatically generate narration scripts from articles
- Produce complete video with zero manual input
- One-click "Generate presentation video" button

## Key Libraries and CDN Links

```html
<!-- Kokoro TTS -->
<script type="module">
  import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@latest";
</script>

<!-- FFmpeg.wasm -->
<script type="module">
  import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@latest/dist/esm/index.js";
  import { fetchFile } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@latest/dist/esm/index.js";
</script>

<!-- TalkingHead (clone repo or use CDN) -->
<!-- https://github.com/met4citizen/TalkingHead -->

<!-- GSAP (animation) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
```

## Security and Privacy

This entire stack runs client-side. No data leaves the browser. No API keys needed for the core pipeline. This aligns perfectly with SG/Send's zero-knowledge principles:
- Slides stay local
- Narration text stays local
- Generated audio stays local
- Video output stays local

The only network activity is the initial library/model download (cached after first load).

---

*This briefing documents a $0-per-video browser-based production pipeline. The same slides that were generated for the OWASP London presentation can be turned into narrated videos using this stack, with the entire pipeline running in a single browser tab.*
