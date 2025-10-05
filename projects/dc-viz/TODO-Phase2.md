# DC-VIZ Phase 2 Implementation TODO

## ✅ TV013-2: Enhance SceneManager
- [x] Add setScene(index) method with proper scene switching
- [x] Add nextScene() method
- [x] Add previousScene() method  
- [x] Properly dispose previous scene (call exit()) before switching
- [x] Call enter() on new scene when switching
- [x] Update getCurrentScene() to return active scene

## ✅ TV014-2: Auto-cycle timer
- [x] Add cycleInterval property (default 30000ms)
- [x] Add autoCycleEnabled boolean (default true)
- [x] In update(), track elapsed time and call nextScene() when interval passes
- [x] Reset timer on manual scene change

## ✅ TV015-2: Keyboard controls
- [x] Add keyboard event listener in controls.js
- [x] Keys 1-7: call sceneManager.setScene(0-6) for all 7 scenes
- [x] Key C: toggle sceneManager.autoCycleEnabled
- [x] Add GUI display showing current scene and auto-cycle status
- [x] Update GUI when keyboard shortcuts are used
- [x] Arrow keys for next/previous scene
- [x] Space bar to toggle auto-cycle

## Build Status
- [x] TypeScript compilation passes
- [x] Vite build successful
- [x] Production ready

## ✅ TV016-2: Create LogoScene base
- [x] Create src/scenes/LogoScene.js extending BaseScene
- [x] Add plane/sprite with colored geometry (cyan colored plane)
- [x] Bass-reactive: rotation speed increases with bass, scale pulses with bass
- [x] Position centered at (0, 0, 0)

## ✅ TV017-2: Add halo effect
- [x] Create larger sprite behind logo with radial gradient texture
- [x] Use additive blending (THREE.AdditiveBlending)
- [x] Mid-frequency reactive: opacity/scale pulses with mid levels
- [x] Subtle glow effect

## ✅ TV018-2: Add particle field
- [x] Use THREE.Points with 800 particles
- [x] Spherical distribution around logo (radius 4 units)
- [x] Treble-reactive: particle size and color intensity changes with treble
- [x] Gentle rotation animation

## Build Status
- [x] TypeScript compilation passes
- [x] Vite build successful
- [x] Production ready

## ✅ TV021-3 & TV022-3: SoundBars Scene
- [x] Create src/scenes/SoundBarsScene.js extending BaseScene
- [x] Implement 64 bars with FFT frequency analysis
- [x] Exponential smoothing (factor 0.8) to prevent flicker
- [x] Color gradient: bass (red) → mid (green) → treble (blue)
- [x] Emissive materials for neon glow effect
- [x] Linear array layout with proper spacing (0.15 units)
- [x] Register in main.js (scene index 3, keyboard "4")

## Build Status
- [x] TypeScript compilation passes
- [x] Vite build successful
- [x] Production ready

## ✅ TV020-3: ParticleBall Scene
- [x] Create src/scenes/ParticleBallScene.js extending BaseScene
- [x] Implement 1200 particles in spherical shell distribution
- [x] Bass-reactive: radius inflation/deflation (1.0-1.5x multiplier)
- [x] Mid-frequency: particle jitter/displacement (0-0.3 units)
- [x] Treble: color intensity and hue modulation
- [x] Store original positions for animation reference
- [x] Use THREE.Points with BufferGeometry and vertexColors
- [x] Register in main.js (scene index 4, keyboard "5")

## Build Status
- [x] TypeScript compilation passes
- [x] Vite build successful
- [x] Production ready

## ✅ TV025-4: ReactiveGridPlane Scene
- [x] Create src/scenes/ReactiveGridPlaneScene.js extending BaseScene
- [x] Implement 128x128 plane grid (16,384 vertices) as floor effect
- [x] Position below camera (y = -3.5), rotated horizontal
- [x] Bass-reactive: vertex height displacement (0-3 units)
- [x] Mid-frequency: ripple wave propagation from center
- [x] FFT bin mapping to grid positions for frequency visualization
- [x] Height-based color gradient (blue → red via HSL)
- [x] Wireframe material with vertex colors
- [x] Fog effect for depth perception
- [x] Register in main.js (scene index 5, keyboard "6")

## Build Status
- [x] TypeScript compilation passes
- [x] Vite build successful
- [x] Production ready

## ✅ TV024-4: WaveformTunnel Scene
- [x] Create src/scenes/WaveformTunnelScene.js extending BaseScene
- [x] Add getWaveform() method to AudioEngine (getByteTimeDomainData)
- [x] Implement cylindrical tunnel with 20 radial segments (64 points each)
- [x] Waveform data drives radial displacement (0.5-2.0x base radius)
- [x] Camera flies through tunnel (z-axis movement at 2 units/sec)
- [x] Bass drives camera z-position oscillation
- [x] Overall level controls tunnel rotation speed
- [x] Wireframe/line material with additive blending
- [x] Color cycling based on treble frequency
- [x] Infinite tunnel loop effect
- [x] Register in main.js (scene index 6, keyboard "7")

## Build Status
- [x] TypeScript compilation passes
- [x] Vite build successful
- [x] Production ready

## ✅ TV027-4: Post-Processing Effects
- [x] Import EffectComposer, RenderPass, UnrealBloomPass from three/examples/jsm
- [x] Implement initPostProcessing() with EffectComposer setup
- [x] Add RenderPass with dynamic scene switching support
- [x] Add UnrealBloomPass with moderate settings (strength: 0.7, radius: 0.4, threshold: 0.85)
- [x] Update render() to dynamically update RenderPass scene each frame
- [x] Handle composer resize in onWindowResize()
- [x] Add GUI controls for bloom (enable/disable, strength, threshold, radius)
- [x] Store bloom pass reference for runtime control

## Build Status
- [x] TypeScript compilation passes
- [x] Vite build successful
- [x] Production ready

## ✅ TV026-4: AbstractShader Scene
- [x] Create src/scenes/AbstractShaderScene.js extending BaseScene
- [x] Implement fullscreen quad with custom GLSL shaders
- [x] Vertex shader: pass UV coordinates
- [x] Fragment shader: psychedelic kaleidoscope with fractal patterns
- [x] Audio uniforms: uBass, uMid, uTreble, uTime, uResolution
- [x] Bass → kaleidoscope segments (4-12) and distortion intensity
- [x] Mid → rotation speed and color shift speed
- [x] Treble → pattern complexity and brightness pulses
- [x] Simplex noise for fractal distortions
- [x] Radial waves and color cycling effects
- [x] Vignette effect for depth
- [x] Register in main.js (scene index 7, keyboard "8")

## Build Status
- [x] TypeScript compilation passes
- [x] Vite build successful
- [x] Production ready

## ✅ TV029-5: Spotify OAuth PKCE Flow
- [x] Create src/SpotifyAPI.js class
- [x] Implement generateCodeVerifier() with crypto.getRandomValues()
- [x] Implement generateCodeChallenge() with SHA-256 hash
- [x] Add authorize() method with PKCE parameters (S256 challenge)
- [x] Add handleCallback() for token exchange
- [x] Implement token storage in localStorage
- [x] Add getAccessToken() with expiry validation
- [x] Add isAuthenticated() method
- [x] Add clearTokens() and logout() methods

## ✅ TV030-5: Fetch Currently Playing Track
- [x] Add getCurrentlyPlaying() method to SpotifyAPI
- [x] Endpoint: https://api.spotify.com/v1/me/player/currently-playing
- [x] Return track metadata: name, artist, album, artwork URL, playback state
- [x] Handle 401 (token expired), 204 (nothing playing), network errors
- [x] Add getPlaybackState() for extended player info

## ✅ Integration Complete
- [x] Import SpotifyAPI in main.js
- [x] Add Spotify folder to GUI controls
- [x] Add "Login to Spotify" button
- [x] Add "Logout" button
- [x] Add "Fetch Now Playing" button
- [x] Display connection status in GUI
- [x] Display current track in GUI
- [x] Auto-detect OAuth callback on page load
- [x] Update GUI status after successful authentication

## Build Status
- [x] TypeScript compilation passes
- [x] Vite build successful
- [x] Production ready

## Notes
- All keyboard controls update the GUI display automatically
- Auto-cycle now defaults to enabled (true) with 30s interval
- Scene switching includes proper enter()/exit() lifecycle methods
- Manual scene changes reset the auto-cycle timer
- LogoScene registered in main.js and accessible via keyboard shortcuts
- SoundBarsScene: 64 bars, smoothing factor 0.8, max height 5 units, emissive neon glow
- ParticleBallScene: 1200 particles, base radius 3.0 units, HSL color modulation, additive blending
- ReactiveGridPlaneScene: 128x128 grid, FFT-driven heights, radial ripple waves, blue-to-red gradient, fog depth
- Post-processing: UnrealBloom with real-time GUI controls, dynamic scene switching via renderPass.scene update
- AbstractShaderScene: fullscreen GLSL shader, kaleidoscope fractals, simplex noise, radial waves, psychedelic colors
- SpotifyAPI: PKCE flow (no client secret), localStorage token persistence, auto-callback detection, error handling
