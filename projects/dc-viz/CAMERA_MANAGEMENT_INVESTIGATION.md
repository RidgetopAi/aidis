# Camera Management Architecture Investigation

**Date:** 2025-10-03  
**Project:** dc-viz  
**Purpose:** Enable per-scene camera positioning for optimal framing

---

## 1. Current Camera Architecture Summary

### Camera Initialization
- **Location:** [main.js](file:///home/ridgetop/aidis/projects/dc-viz/src/main.js#L53-L62)
- **Default Configuration:**
  - FOV: 75°
  - Position: `(0, 0, 8)`
  - Look At: `(0, 0, 0)`
  - Near/Far: `0.1 / 1000`

### Camera Reference Distribution
- **Camera created in:** `main.js` (`initCamera()`)
- **Passed to:** `SceneManager` constructor (line 116)
- **Scene initialization:** `SceneManager.addScene()` calls `scene.init(camera, audioEngine)` (line 31)
- **Scene storage:** Each `BaseScene` stores reference as `this.camera` (line 27)

### Resize Handling
- **Location:** [main.js](file:///home/ridgetop/aidis/projects/dc-viz/src/main.js#L92-L104)
- **Updates aspect ratio:** `camera.aspect = width / height`
- **Calls:** `camera.updateProjectionMatrix()`
- **Does NOT affect camera position** - safe for per-scene positioning

---

## 2. BaseScene Architecture

### Available Lifecycle Methods
[BaseScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/BaseScene.js) provides:

1. **`init(camera, audioEngine)`** (line 26)
   - Called once when scene is registered
   - Stores camera reference as `this.camera`
   - Used for initial scene setup

2. **`enter()`** (line 36)
   - Called when scene becomes active
   - Currently empty (base implementation)
   - **IDEAL for setting camera position**

3. **`exit()`** (line 45)
   - Called when scene becomes inactive
   - Currently empty (base implementation)
   - **IDEAL for camera cleanup/restoration**

4. **`update(deltaTime, audioBands)`** (line 55)
   - Called every frame while scene is active
   - Receives audio data

### Scene Switching Flow
[SceneManager.js](file:///home/ridgetop/aidis/projects/dc-viz/src/SceneManager.js#L47-L64) `setScene()` method:

```javascript
1. Call currentScene.exit()    // Clean up old scene
2. Switch currentSceneIndex     // Update index
3. Call newScene.enter()        // Initialize new scene
```

This provides perfect hooks for camera management!

---

## 3. Scene-by-Scene Analysis

### Scene 1: Sanity Check
**File:** [SanityScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/SanityScene.js)

- **Objects:** 1x1x1 wireframe cube at origin
- **Current camera:** `(0, 0, 8)` - default
- **Issues:** None - default camera works fine
- **Recommended camera:** `(0, 0, 5)` for closer view
- **Camera modifications:** None currently

### Scene 2: Logo Scene
**File:** [LogoScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/LogoScene.js)

- **Objects:**
  - Logo sprite: 2x2 at `(0, 0, 0)`
  - Halo: 3.5x3.5 at `(0, 0, -0.1)`
  - Particle sphere: radius 4
- **Current camera:** `(0, 0, 8)` - default
- **Issues:** None - well framed
- **Recommended camera:** `(0, 0, 7)` - keep current, or slightly closer
- **Camera modifications:** None currently

### Scene 3: Sound Bars
**File:** [SoundBarsScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/SoundBarsScene.js)

- **Objects:** 64 bars at `z = -4`, spread ~10 units wide, max height 5
- **Current camera:** `(0, 0, 8)` - default
- **Issues:** Bars are positioned far from camera (`z = -4`), may appear small
- **Recommended camera:** `(0, 2, 5)` - elevated view, closer to bars
- **Camera modifications:** None currently

### Scene 4: Particle Ball
**File:** [ParticleBallScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/ParticleBallScene.js)

- **Objects:** Particle sphere, radius 3.0 at origin
- **Current camera:** `(0, 0, 8)` - default
- **Issues:** None - sphere well framed
- **Recommended camera:** `(0, 0, 8)` - keep current
- **Camera modifications:** None currently

### Scene 5: Reactive Grid Plane
**File:** [ReactiveGridPlaneScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/ReactiveGridPlaneScene.js)

- **Objects:** 20x20 grid plane at `y = -3.5`, rotated to be horizontal floor
- **Current camera:** `(0, 0, 8)` - default
- **Issues:** Camera looking straight at floor from above - poor viewing angle
- **Recommended camera:** `(0, 3, 10)` - elevated and pulled back for better floor view
- **Camera modifications:** None currently

### Scene 6: Waveform Tunnel
**File:** [WaveformTunnelScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/WaveformTunnelScene.js)

- **Objects:** Tunnel starting at `z = -18`, extending backwards
- **Current camera:** `(0, 0, 8)` - INTENTIONAL (see line 35 comment)
- **Issues:** None - tunnel designed to work with default camera
- **Recommended camera:** `(0, 0, 8)` - KEEP CURRENT (tunnel moves, not camera)
- **Camera modifications:** **EXPLICITLY avoids camera modifications** (see lines 35, 101)
- **Special note:** Scene moves tunnel geometry instead of camera - smart approach!

### Scene 7: Abstract Shader
**File:** [AbstractShaderScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/AbstractShaderScene.js)

- **Objects:** Fullscreen 2x2 quad at `z = -1`
- **Current camera:** `(0, 0, 8)` - default
- **Issues:** Shader positioned close to camera to fill screen
- **Recommended camera:** `(0, 0, 1)` - much closer for true fullscreen effect
- **Camera modifications:** None currently

---

## 4. Summary Table: Recommended Camera Positions

| Scene # | Scene Name | Current Pos | Recommended Pos | Priority | Reason |
|---------|------------|-------------|-----------------|----------|--------|
| 1 | Sanity Check | (0,0,8) | (0,0,5) | Low | Closer cube view |
| 2 | Logo Scene | (0,0,8) | (0,0,7) | Low | Current works well |
| 3 | Sound Bars | (0,0,8) | (0,2,5) | **HIGH** | Better bars framing |
| 4 | Particle Ball | (0,0,8) | (0,0,8) | None | Perfect as-is |
| 5 | Grid Plane | (0,0,8) | (0,3,10) | **HIGH** | Floor view angle |
| 6 | Waveform Tunnel | (0,0,8) | (0,0,8) | None | Intentional design |
| 7 | Abstract Shader | (0,0,8) | (0,0,1) | **MEDIUM** | Fullscreen coverage |

**High Priority Scenes:** 3, 5  
**Medium Priority Scenes:** 7  
**No Change Needed:** 1, 2, 4, 6

---

## 5. Implementation Requirements & Strategy

### Option A: Scene-Controlled Camera (RECOMMENDED)

**Approach:** Each scene manages its own camera in `enter()`/`exit()`

**Advantages:**
- ✅ Clear ownership - scenes control their own framing
- ✅ Flexible - scenes can animate camera during `update()`
- ✅ Simple - no manager state tracking needed
- ✅ Follows existing architecture patterns

**Implementation:**
```javascript
// In each scene's enter() method:
enter() {
  super.enter();
  // Store original camera position
  this.originalCameraPosition = this.camera.position.clone();
  // Set scene-specific camera
  this.camera.position.set(0, 2, 5);
  this.camera.lookAt(0, 0, 0);
  this.camera.updateProjectionMatrix();
}

// In each scene's exit() method:
exit() {
  super.exit();
  // Restore original camera position
  if (this.originalCameraPosition) {
    this.camera.position.copy(this.originalCameraPosition);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
  }
}
```

**Concerns:**
- Each scene must remember to restore camera in `exit()`
- No smooth transitions between scenes (camera will "jump")

### Option B: Manager-Controlled Camera

**Approach:** SceneManager stores default camera position and handles restoration

**Advantages:**
- ✅ Centralized camera state management
- ✅ Guaranteed camera restoration
- ✅ Could add smooth camera transitions

**Implementation:**
```javascript
// In SceneManager constructor:
this.defaultCameraPosition = new THREE.Vector3(0, 0, 8);

// In SceneManager.setScene():
setScene(index) {
  // ... existing code ...
  
  // Restore default before scene switch
  this.camera.position.copy(this.defaultCameraPosition);
  this.camera.lookAt(0, 0, 0);
  
  // Now call new scene's enter() which can override
  newScene.enter();
}
```

**Concerns:**
- More complex coordination between manager and scenes
- Scenes still need to set camera in `enter()`
- Double camera positioning (manager → scene)

### Option C: Hybrid Approach (BEST)

**Approach:** Manager stores default, scenes optionally override in `enter()`

**Advantages:**
- ✅ Best of both worlds
- ✅ Automatic fallback to default
- ✅ Scenes can opt-in to custom camera
- ✅ Manager guarantees reset between scenes

**Implementation:**
```javascript
// SceneManager.setScene():
setScene(index) {
  if (currentScene?.exit) currentScene.exit();
  
  // Reset to default camera position
  this.camera.position.set(0, 0, 8);
  this.camera.lookAt(0, 0, 0);
  this.camera.updateProjectionMatrix();
  
  this.currentSceneIndex = index;
  
  // New scene can override in enter()
  if (newScene?.enter) newScene.enter();
}

// Scenes only override if needed:
enter() {
  super.enter();
  this.camera.position.set(0, 2, 5); // Override default
  this.camera.lookAt(0, 0, 0);
}
```

---

## 6. Edge Cases & Considerations

### ✅ Resize Handling
- **Status:** SAFE
- **Reason:** Resize only updates aspect ratio and projection matrix, NOT position
- **Action:** None required

### ⚠️ Auto-Cycle Transitions
- **Status:** POTENTIAL ISSUE
- **Reason:** Camera will "jump" between different positions
- **Impact:** May be jarring for users
- **Solutions:**
  1. Accept instant transitions (simplest)
  2. Add camera animation system (future enhancement)
  3. Use longer cycle intervals to reduce frequency

### ✅ First Scene Initialization
- **Status:** SAFE
- **Current flow:**
  1. Camera initialized in `main.js`
  2. Scenes registered via `addScene()`
  3. First scene index is 0 (SanityScene)
  4. SceneManager doesn't call `enter()` on first scene automatically
- **Issue:** First scene's `enter()` is NEVER called initially!
- **Fix Required:** Call `enter()` on first scene after all scenes registered

### ✅ updateProjectionMatrix() Calls
- **Status:** SAFE (but may be redundant)
- **Required when:** Changing FOV, aspect, near, or far planes
- **NOT required when:** Only changing position/rotation
- **Recommendation:** Can be omitted when only changing camera.position
- **Current practice:** Include for consistency (minimal performance cost)

### ⚠️ Camera.lookAt() Consistency
- **Status:** NEEDS STANDARDIZATION
- **Current:** All scenes look at `(0, 0, 0)`
- **Recommendation:** Standardize or allow per-scene control
- **Action:** Document expected behavior

---

## 7. Files Requiring Modification

### Core Files (Required Changes)

1. **[SceneManager.js](file:///home/ridgetop/aidis/projects/dc-viz/src/SceneManager.js)**
   - Add default camera position storage
   - Modify `setScene()` to reset camera before scene transition
   - Call `enter()` on initial scene (bug fix)

2. **[BaseScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/BaseScene.js)**
   - Add documentation to `enter()`/`exit()` about camera control
   - No code changes required (already has the hooks)

### Scene Files (Per-Scene Camera Positioning)

3. **[SoundBarsScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/SoundBarsScene.js)** - HIGH PRIORITY
   - Add camera positioning in `enter()`: `(0, 2, 5)`

4. **[ReactiveGridPlaneScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/ReactiveGridPlaneScene.js)** - HIGH PRIORITY
   - Add camera positioning in `enter()`: `(0, 3, 10)`

5. **[AbstractShaderScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/AbstractShaderScene.js)** - MEDIUM PRIORITY
   - Add camera positioning in `enter()`: `(0, 0, 1)`

6. **[SanityScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/SanityScene.js)** - OPTIONAL
   - Add camera positioning in `enter()`: `(0, 0, 5)`

7. **[LogoScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/LogoScene.js)** - OPTIONAL
   - No changes needed (current framing is good)

**NO CHANGES NEEDED:**
- [ParticleBallScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/ParticleBallScene.js) - default camera perfect
- [WaveformTunnelScene.js](file:///home/ridgetop/aidis/projects/dc-viz/src/scenes/WaveformTunnelScene.js) - intentionally uses default

---

## 8. Potential Issues to Watch For

### 🔴 Critical Issues

1. **First scene `enter()` not called**
   - SceneManager doesn't call `enter()` on initial scene
   - First scene won't get custom camera position
   - **Fix:** Add explicit call after scene registration

2. **Camera jumps during auto-cycle**
   - Instant position changes may be jarring
   - **Mitigation:** Accept as current behavior, enhance later

### 🟡 Medium Issues

3. **Scenes forgetting to reset camera**
   - If scene sets camera but doesn't have exit(), next scene inherits position
   - **Fix:** Manager resets camera in `setScene()` (Hybrid approach prevents this)

4. **Multiple scenes modifying camera simultaneously**
   - Only current scene should control camera
   - **Prevention:** Clear ownership in architecture

### 🟢 Low-Risk Issues

5. **Performance of updateProjectionMatrix()**
   - Called unnecessarily when only position changes
   - **Impact:** Negligible (camera updates are cheap)

6. **Resize triggering position reset**
   - Current resize handler doesn't touch position
   - **Status:** Not an issue

---

## 9. Recommended Implementation Order

### Phase 1: Core Infrastructure (REQUIRED)
1. ✅ Modify `SceneManager.setScene()` - add camera reset to default position
2. ✅ Fix first scene initialization - call `enter()` on scene 0
3. ✅ Add camera default position constant to SceneManager
4. ✅ Test scene switching preserves camera reset

### Phase 2: High-Priority Scenes
5. ✅ Implement `enter()` camera positioning in SoundBarsScene
6. ✅ Implement `enter()` camera positioning in ReactiveGridPlaneScene
7. ✅ Test both scenes with proper framing

### Phase 3: Medium-Priority Scenes
8. ✅ Implement `enter()` camera positioning in AbstractShaderScene
9. ✅ Test fullscreen shader coverage

### Phase 4: Polish & Optional Scenes
10. ⚠️ Optionally implement SanityScene camera positioning
11. ⚠️ Document camera control patterns in BaseScene
12. ⚠️ Consider camera animation system for smooth transitions (future)

---

## 10. Testing Checklist

After implementation, verify:

- [ ] Default camera position is `(0, 0, 8)` on app start
- [ ] First scene (Sanity) gets `enter()` called and camera position set
- [ ] Manual scene switching (keyboard/GUI) resets camera correctly
- [ ] Auto-cycle scene transitions reset camera correctly
- [ ] Window resize doesn't affect camera position
- [ ] Sound Bars scene shows bars at proper framing
- [ ] Grid Plane scene shows floor from elevated angle
- [ ] Abstract Shader fills screen properly
- [ ] No console errors related to camera
- [ ] Waveform Tunnel still works correctly (doesn't modify camera)

---

## 11. Future Enhancements (Out of Scope)

1. **Smooth Camera Transitions**
   - Animate camera position changes using GSAP or custom tween
   - Add easing for professional feel
   
2. **Per-Scene Camera Animation**
   - Allow scenes to animate camera during `update()`
   - Example: orbital camera, camera shake on bass hits

3. **Camera Presets**
   - Define multiple camera positions per scene
   - Allow runtime switching via GUI

4. **FOV Per Scene**
   - Some scenes may benefit from different field of view
   - Wide FOV for tunnel, narrow for shader

---

## Conclusion

**Recommended Approach:** Hybrid (Option C)

**Core Changes:**
- SceneManager resets camera to default `(0, 0, 8)` before each scene transition
- Scenes optionally override camera in `enter()` method
- Fix: Call first scene's `enter()` after initialization

**Files to Modify:**
- SceneManager.js (core infrastructure)
- SoundBarsScene.js (HIGH)
- ReactiveGridPlaneScene.js (HIGH)
- AbstractShaderScene.js (MEDIUM)

**Risk Level:** LOW
- Changes are isolated to scene lifecycle methods
- Resize handling unaffected
- No breaking changes to existing scenes
- Waveform Tunnel explicitly designed to work with default camera

**Next Step:** Implement Phase 1 core infrastructure changes.
