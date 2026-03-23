<div align="center">

# Virtual Background Engine

**Real-time person segmentation and background replacement in the browser**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fpradhankukiran%2Fvirtual-background-engine)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![WebGL](https://img.shields.io/badge/WebGL_2-GPU_Accelerated-990000?logo=webgl&logoColor=white)](https://www.khronos.org/webgl/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Live Demo](https://virtual-background-engine.vercel.app) | [Report Bug](https://github.com/pradhankukiran/virtual-background-engine/issues)

---

<img src="https://img.shields.io/badge/Blur_Mode-Background_Blur-blue?style=for-the-badge" alt="Blur Mode" />
<img src="https://img.shields.io/badge/Image_Mode-Custom_Background-green?style=for-the-badge" alt="Image Mode" />
<img src="https://img.shields.io/badge/GPU-WebGL_2_Accelerated-red?style=for-the-badge" alt="GPU Accelerated" />

</div>

---

## Overview

A fully client-side virtual background engine that runs entirely in the browser. No server, no cloud processing — person segmentation and GPU compositing happen on your device using WebGL 2 shaders and MediaPipe's neural network.

### Key Features

- **Real-time person segmentation** using MediaPipe's selfie_segmenter_landscape model (~250KB)
- **5-pass GPU compositor** with edge-aware upsampling, temporal smoothing, and light wrap
- **Background blur** with adjustable Kawase blur strength
- **Custom background images** with cover-mode scaling
- **Zero-copy frame pipeline** via Insertable Streams (Chrome/Edge) with rVFC fallback
- **3-thread architecture** — main thread stays responsive while workers handle segmentation and rendering
- **Auto-start** — camera and pipeline initialize on page load
- **Diagnostics panel** with session logging, error tracking, and log export
- **Performance HUD** with per-pass GPU timings

---

## Architecture

```
Camera (30fps)
    |
    v
[ Frame Capture ]  ──────────────────────────────────────────
    |                    |                                    |
    v                    v                                    |
[ Seg Worker ]     [ Compositor Worker ]                     |
    |                    |                                    |
    | MediaPipe          | WebGL 2 (5 passes)                |
    | GPU Delegate       |                                    |
    |                    |  1. Bilateral Upsample (256->748)  |
    v                    |  2. Temporal Smooth (EMA)          |
[ Mask 256x256 ] -----→ |  3. Kawase Blur / BG Image         |
  via MessageChannel     |  4. Composite (feather + wrap)     |
                         |  5. Exposure Correction            |
                         |                                    |
                         v                                    |
                   [ Output Frame ]                           |
                         |                                    |
                         v                                    |
                   [ MediaStreamTrackGenerator ] ──→ <video>  |
                         or canvas fallback                   |
```

### Worker Communication

```
Main Thread          Seg Worker              Compositor Worker
    |                    |                         |
    |--- frame-port --->|                         |
    |--- frame-port --------------------------->  |
    |                    |--- mask-port -------->  |  (direct, bypasses main)
    |                    |                         |
    |<-- output-port ----------------------------|
    |                    |                         |
```

Workers communicate via **MessageChannel** ports — the segmentation mask flows directly from the seg worker to the compositor worker without touching the main thread.

---

## GPU Shader Pipeline

| Pass | Shader | Input | Output | Purpose |
|------|--------|-------|--------|---------|
| 1 | `bilateral-upsample.frag` | 256x256 mask + camera | 748x420 mask | Edge-preserving upsample using camera luminance as guide |
| 2 | `temporal-smooth.frag` | Current mask + previous | Stable mask | EMA blending with soft snap to reduce flicker |
| 3 | `kawase-blur.frag` | Camera frame | Blurred frame | Multi-pass separable blur (1-7 iterations) |
| 3' | `bg-image.frag` | Uploaded image | Scaled image | Cover-mode scaling for custom backgrounds |
| 4 | `composite.frag` | Camera + blur/image + mask | Composited frame | Feathered alpha blend with light wrap |
| 5 | `exposure-correct.frag` | Composite + mask | Final frame | Foreground luminance correction |

All shaders are **GLSL ES 3.0** running on **WebGL 2** via an OffscreenCanvas in the compositor worker.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Vue 3 (Composition API) |
| **Language** | TypeScript 5.7 |
| **Styling** | Tailwind CSS 4 + PrimeVue 4 |
| **Segmentation** | MediaPipe Tasks Vision (selfie_segmenter_landscape) |
| **GPU Rendering** | WebGL 2 + GLSL ES 3.0 |
| **Frame Capture** | Insertable Streams / requestVideoFrameCallback |
| **Output** | MediaStreamTrackGenerator / canvas captureStream |
| **Build** | Vite 6 |
| **Deploy** | Vercel (with COOP/COEP headers) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A browser with WebGL 2 support (Chrome 88+, Firefox 79+, Edge 88+)

### Install

```bash
git clone https://github.com/pradhankukiran/virtual-background-engine.git
cd virtual-background-engine
npm install
```

`postinstall` automatically downloads the segmentation model and MediaPipe WASM files.

### Development

```bash
npm run dev
```

Opens at `http://localhost:5173`. The browser will ask for camera permission, then the pipeline starts automatically.

### Production Build

```bash
npm run build
npm run preview
```

### Deploy to Vercel

```bash
npx vercel
```

Or connect the repo to Vercel — `vercel.json` is pre-configured with the required COOP/COEP headers for cross-origin isolation.

---

## Project Structure

```
src/
├── App.vue                              # Auto-starts camera + pipeline
├── main.ts                              # Vue + PrimeVue setup
├── components/
│   ├── VirtualBackgroundControls.vue    # Mode, blur, image upload
│   ├── VideoPreview.vue                 # Original + processed video
│   ├── PerformanceHud.vue               # GPU timing overlay
│   └── DiagnosticsPanel.vue             # Session logging
├── composables/
│   ├── useCamera.ts                     # Camera access
│   ├── useVirtualBackground.ts          # Pipeline orchestration
│   └── useDiagnosticsLog.ts             # Error tracking
├── pipeline/
│   ├── types.ts                         # Config, metrics, state types
│   ├── compositor/
│   │   ├── GPUCompositor.ts             # 5-pass WebGL 2 renderer
│   │   ├── ShaderManager.ts             # Shader compilation
│   │   ├── TexturePool.ts              # Texture allocation
│   │   ├── GPUTimer.ts                  # GPU timing queries
│   │   └── shaders/*.glsl              # 7 GLSL shaders
│   ├── mask-buffer/
│   │   ├── DoubleMaskBuffer.ts          # Lock-free double buffer
│   │   └── MaskInterpolator.ts          # Temporal interpolation
│   ├── frame-capture/
│   │   ├── InsertableStreamsCapture.ts   # Chrome zero-copy path
│   │   ├── RvfcFallbackCapture.ts       # Firefox/Safari fallback
│   │   └── createFrameCapture.ts        # Auto-detection factory
│   └── workers/
│       ├── segmentation.worker.ts       # MediaPipe inference
│       ├── compositor.worker.ts         # GPU rendering
│       └── protocol.ts                  # Message types
└── utils/
    ├── feature-detect.ts                # Browser capability detection
    └── memoryWatchdog.ts                # Memory monitoring
```

---

## Configuration

Default pipeline config in `src/pipeline/types.ts`:

```typescript
{
  mode: 'blur',              // 'blur' | 'image' | 'none'
  blurStrength: 0.6,         // 0-1, maps to 1-7 Kawase iterations
  segFps: 20,                // Segmentation target FPS
  outputDims: { width: 748, height: 420 },
  maskDims: { width: 256, height: 256 },
}
```

### Compositor Tuning

Key uniforms in `GPUCompositor.ts`:

| Uniform | Default | Effect |
|---------|---------|--------|
| `u_maskThreshold` | 0.40 | Confidence cutoff for person detection |
| `u_feather` | 0.12 | Edge softness around the person |
| `u_lightWrap` | 0.10 | Background light bleed into foreground edges |
| `u_alpha` (temporal) | 0.85 | Mask responsiveness (higher = faster tracking) |
| `SIGMA_RANGE` (bilateral) | 0.06 | Color sensitivity for edge-aware upsampling |

---

## Browser Support

| Feature | Chrome 88+ | Firefox 79+ | Safari 16+ | Edge 88+ |
|---------|:----------:|:-----------:|:----------:|:--------:|
| WebGL 2 | Yes | Yes | Yes | Yes |
| Insertable Streams | Yes | No | No | Yes |
| rVFC Fallback | Yes | Yes | Yes | Yes |
| MSTG Output | Yes | No | No | Yes |
| SharedArrayBuffer | Yes | Partial | Yes | Yes |

The engine auto-detects capabilities and uses the best available path.

---

## Performance

Typical metrics on a mid-range laptop (Intel integrated GPU):

| Metric | Value |
|--------|-------|
| Segmentation FPS | 15-20 |
| Compositor FPS | 30 |
| Seg Latency | ~15-25ms |
| Model Size | ~250KB |
| WASM Runtime | ~11MB (cached) |

Press **Ctrl+Shift+P** in the app to toggle the Performance HUD with per-pass GPU timings.

---

## License

MIT
