# Phase 5 BPM Sync - Architecture Diagram

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SPOTIFY API                                 │
│  ┌────────────────┐              ┌─────────────────────────┐       │
│  │ Now Playing    │              │ Audio Features          │       │
│  │ /currently-    │──────────────▶│ /audio-features/{id}   │       │
│  │  playing       │   track_id   │                         │       │
│  └────────────────┘              └─────────────────────────┘       │
│         │                                    │                      │
└─────────┼────────────────────────────────────┼──────────────────────┘
          │                                    │
          │ track metadata                     │ BPM, energy, etc.
          ▼                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SpotifyAPI.js                                │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  getCurrentlyPlaying()                                        │  │
│  │    ├── Fetch track metadata                                  │  │
│  │    ├── Extract track ID                                      │  │
│  │    └── Auto-call getAudioFeatures(trackId)                   │  │
│  │                                                               │  │
│  │  getAudioFeatures(trackId)                                   │  │
│  │    ├── Fetch BPM, energy, danceability, etc.                │  │
│  │    └── Return feature object                                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
          │                                    │
          │ track object                       │
          ▼                                    │
┌─────────────────────────────────┐            │
│     SpotifyOverlay.js           │            │
│  ┌──────────────────────────┐   │            │
│  │ Poll every 5s            │   │            │
│  │ Update UI:               │   │            │
│  │  - Track name            │   │            │
│  │  - Artist                │   │            │
│  │  - Artwork               │   │            │
│  │  - BPM display           │   │            │
│  │ Auto-hide after 10s      │   │            │
│  └──────────────────────────┘   │            │
│           │                      │            │
│           ▼                      │            │
│  ┌──────────────────────────┐   │            │
│  │  DOM Overlay              │   │            │
│  │  (bottom-left corner)     │   │            │
│  └──────────────────────────┘   │            │
└─────────────────────────────────┘            │
                                                │ BPM value
                                                ▼
                              ┌─────────────────────────────────────┐
                              │        main.js                      │
                              │  setupSpotifyBPMSync()              │
                              │    Poll every 10s                   │
                              │    Update audioEngine.bpmSync       │
                              └─────────────────────────────────────┘
                                                │
                                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        AudioEngine.js                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Properties:                                                  │  │
│  │    bpmSync: BPMSync instance                                  │  │
│  │    bands: { bass, mid, treble, overall, bpm }                │  │
│  │                                                               │  │
│  │  update() - called every frame:                              │  │
│  │    1. Analyze audio (FFT)                                    │  │
│  │    2. Calculate bass/mid/treble                              │  │
│  │    3. bpmSync.setBassFallback(bass)                          │  │
│  │    4. bands.bpm = bpmSync.getBPMPulse()                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
          │                                    │
          │ audioBands object                  │
          ▼                                    ▼
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│        BPMSync.js               │  │      controls.js (GUI)          │
│  ┌──────────────────────────┐   │  │  ┌──────────────────────────┐  │
│  │ Properties:              │   │  │  │ BPM Controls:            │  │
│  │  - bpm: 120              │   │  │  │  - Current BPM display   │  │
│  │  - enabled: true         │   │  │  │  - Enable/Disable toggle │  │
│  │  - beatDuration: calc    │   │  │  │  - Sync mode indicator   │  │
│  │                          │   │  │  │                          │  │
│  │ Methods:                 │   │  │  │ Updates every 1 second   │  │
│  │  getBPMPulse()           │   │  │  └──────────────────────────┘  │
│  │    ├── Sine wave (0-1)   │   │  └─────────────────────────────────┘
│  │  getBeatTrigger()        │   │
│  │    ├── Sharp attack      │   │
│  │  getAlternatingBeat()    │   │
│  │    └── 0.5/1.0 alternating│  │
│  └──────────────────────────┘   │
└─────────────────────────────────┘
          │
          │ bpm pulse (0-1)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SceneManager & Scenes                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  update(deltaTime, audioBands)                               │  │
│  │                                                               │  │
│  │  Available in all scenes:                                    │  │
│  │    audioBands.bass    - Bass frequency (0-1)                │  │
│  │    audioBands.mid     - Mid frequency (0-1)                 │  │
│  │    audioBands.treble  - Treble frequency (0-1)              │  │
│  │    audioBands.overall - Overall level (0-1)                 │  │
│  │    audioBands.bpm     - BPM pulse (0-1) ⭐ NEW              │  │
│  │                                                               │  │
│  │  Example Usage:                                              │  │
│  │    this.logo.scale.setScalar(1 + audioBands.bpm * 0.3)     │  │
│  │    this.halo.opacity = 0.2 + audioBands.bpm * 0.5          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Scenes:                                                            │
│    - LogoScene           - SoundBarsScene                          │
│    - ParticleBallScene   - ReactiveGridPlane                       │
│    - WaveformTunnel      - AbstractShader                          │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      THREE.js Renderer                              │
│                      (60fps render loop)                            │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Relationships

### Data Flow Chain:
1. **Spotify API** → Track metadata + audio features (BPM)
2. **SpotifyAPI.js** → Fetches and processes data
3. **SpotifyOverlay.js** → Displays track info (UI)
4. **main.js** → Routes BPM to AudioEngine
5. **AudioEngine.js** → Integrates BPM with audio analysis
6. **BPMSync.js** → Generates beat-synchronized pulses
7. **Scenes** → Use `audioBands.bpm` for visual effects

### Polling Intervals:
- **SpotifyOverlay:** 5 seconds (track metadata)
- **main.js BPM sync:** 10 seconds (BPM updates)
- **GUI controls:** 1 second (display updates)
- **BPM pulse:** Per-frame calculation (~60 fps)

### Fallback System:
```
BPM Sync Enabled?
    ├── YES → Use Spotify BPM pulse (sine wave)
    └── NO  → Use bass reactivity (FFT analysis)
```

## Key Interactions

### 1. Track Change Detection:
```
Spotify → SpotifyAPI.getCurrentlyPlaying()
       → Check track.id vs currentTrackId
       → If different: Update overlay + fetch BPM
       → Update audioEngine.bpmSync.setBPM()
```

### 2. BPM Pulse Generation:
```
BPMSync.getBPMPulse():
  1. Calculate elapsed time since start
  2. phase = (elapsed % beatDuration) / beatDuration
  3. pulse = (sin(phase * 2π - π/2) + 1) / 2
  4. Return pulse (0-1 range)
```

### 3. Scene Integration:
```
Scene.update(deltaTime, audioBands):
  1. Extract audioBands.bpm (0-1 pulse)
  2. Apply to visual properties:
     - Scale: base + pulse * amplitude
     - Opacity: min + pulse * range
     - Color: HSL hue shift with pulse
```

## File Dependencies

```
main.js
  ├── SpotifyAPI.js
  │   └── (Spotify Web API)
  ├── SpotifyOverlay.js
  │   └── SpotifyAPI.js
  ├── AudioEngine.js
  │   └── BPMSync.js
  ├── SceneManager.js
  │   └── BaseScene.js (all scenes)
  └── controls.js
      ├── SpotifyAPI.js
      └── AudioEngine.js
```

## Signal Flow Summary

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Spotify  │────▶│  Track   │────▶│   BPM    │────▶│  Visual  │
│   API    │     │   Data   │     │  Pulse   │     │ Effects  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                                    │               │
     │                                    │               │
     ▼                                    ▼               ▼
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Metadata │     │   BPM    │     │   Audio  │     │   3D     │
│ Overlay  │     │   Sync   │     │  Engine  │     │  Scene   │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

---

## Performance Characteristics

### Computational Costs:
- **Spotify API calls:** ~200-500ms latency, async (non-blocking)
- **BPM pulse calculation:** <0.1ms per frame (negligible)
- **DOM overlay updates:** ~2-5ms per update (throttled)
- **Audio FFT analysis:** ~1-2ms per frame (existing)

### Memory Usage:
- **SpotifyAPI:** ~100KB (OAuth tokens + cache)
- **SpotifyOverlay:** ~50KB (DOM + artwork)
- **BPMSync:** ~1KB (state variables)
- **Total overhead:** ~150KB

### Network Traffic:
- **Track metadata:** ~5KB per request
- **Audio features:** ~2KB per request
- **Album artwork:** ~50-200KB (cached by browser)
- **Total per track:** ~7-207KB (one-time per track)

---

**Architecture Status:** Optimized & Production Ready ✅
