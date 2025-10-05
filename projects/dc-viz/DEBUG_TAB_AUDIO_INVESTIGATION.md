# Tab Audio Investigation Report

## Symptoms
- User clicks "Start Tab Audio"
- Browser shows "Sharing Spotify to viz tab"  
- GUI shows "Tab Audio" as active source
- **Visuals don't react at all**

## Investigation Steps

### 1. Replace AudioEngine with Debug Version
```bash
cd ~/aidis/projects/dc-viz
cp src/AudioEngine.js src/AudioEngine-backup.js
cp src/AudioEngine-debug.js src/AudioEngine.js
npm run dev
```

### 2. Test Procedure
1. Open dev console (F12)
2. Start playing audio in a tab (e.g., Spotify, YouTube)
3. Click "Start Tab Audio" in viz
4. Select the tab with audio
5. **IMPORTANT: Check "Share audio" checkbox in browser dialog**
6. Click Share

### 3. What to Look For in Console

#### Expected Success Pattern:
```
🔊 === TAB AUDIO CAPTURE START ===
📡 Stream obtained: { audioTracks: 1, videoTracks: 1, active: true }
🔊 Tab audio track details: { enabled: true, muted: false, readyState: 'live' }
🔌 Audio graph connections:
  1. MediaStreamSource created
  2. Source → Analyser (connected)
  3. Analyser → Silent Gain (connected)
  5. AudioContext state: running
🧪 Testing analyser data...
🔍 Initial analyser test: { dataArraySum: >0, maxValue: >0, nonZeroBins: >0 }
✅ Analyser is receiving data!
✅ Tab audio setup complete

📊 AudioEngine Update [Frame 60]:
  Source Type: tab
  Raw Data Sum: >0
  Raw Data Max: >0
  Non-Zero Bins: >0
  Bands: { bass: >0, mid: >0, treble: >0, overall: >0 }
```

#### Failure Patterns to Check:

**Pattern 1: No audio track**
```
📡 Stream obtained: { audioTracks: 0 }
❌ No audio track in selected source
```
**Cause:** "Share audio" checkbox not checked
**Fix:** User must check the checkbox in browser dialog

**Pattern 2: Audio track muted**
```
🔊 Tab audio track details: { enabled: true, muted: true, readyState: 'live' }
❌ Audio track is MUTED!
```
**Cause:** Browser/system audio muted
**Fix:** Unmute audio in source tab or system

**Pattern 3: Track not live**
```
🔊 Tab audio track details: { enabled: true, muted: false, readyState: 'ended' }
❌ Audio track readyState is not "live"
```
**Cause:** Audio source stopped/paused
**Fix:** Start playing audio in source tab

**Pattern 4: Analyser receiving zero data**
```
🔍 Initial analyser test: { dataArraySum: 0, maxValue: 0, nonZeroBins: 0 }
❌ PROBLEM: Analyser receiving ZERO data from tab audio!

📊 AudioEngine Update [Frame 60]:
  Source Type: tab
  Raw Data Sum: 0
  Raw Data Max: 0
  Non-Zero Bins: 0
❌ WARNING: Tab audio active but receiving NO DATA!
```
**Potential causes:**
1. Tab audio is silent/paused
2. "Share audio" checkbox not checked in browser dialog
3. Audio track is muted or disabled
4. Browser security restriction
5. **Audio graph connection issue**

### 4. Root Cause Hypotheses

Based on code review of [AudioEngine.js](file:///home/ridgetop/aidis/projects/dc-viz/src/AudioEngine.js):

#### Hypothesis A: "Share audio" checkbox not checked
**Likelihood:** HIGH
- Most common user error with `getDisplayMedia()`
- Browser dialog has checkbox that's easy to miss
- Results in stream with video track but no audio track

**Test:** Check console for `audioTracks: 0` in stream log

#### Hypothesis B: Audio graph connection issue
**Likelihood:** MEDIUM
- Code looks correct (lines 168-170):
  ```javascript
  this.source = this.audioContext.createMediaStreamSource(stream);
  this.source.connect(this.analyser);
  this.analyser.connect(this._silentGain);
  ```
- Same pattern as microphone (which works)
- **Difference:** Microphone doesn't stop video tracks first

**Test:** Check if stopping video tracks affects audio stream

#### Hypothesis C: AudioContext suspended
**Likelihood:** LOW
- Code calls `ensureRunning()` which resumes context
- Should log "AudioContext resumed" if it was suspended

**Test:** Check console for AudioContext state logs

#### Hypothesis D: Tab audio actually silent
**Likelihood:** MEDIUM
- User may think audio is playing but it's paused/muted
- Spotify could be paused when dialog appears

**Test:** Verify audio is audibly playing in source tab

### 5. Diagnostic Commands

Add to browser console while tab audio is "active":

```javascript
// Check if stream is still active
audioEngine.currentStream?.active

// Check audio tracks
audioEngine.currentStream?.getAudioTracks().map(t => ({
  enabled: t.enabled,
  muted: t.muted,
  readyState: t.readyState,
  label: t.label
}))

// Force analyser data check
audioEngine.analyser?.getByteFrequencyData(audioEngine.dataArray);
audioEngine.dataArray?.reduce((a,b) => a+b, 0)

// Check AudioContext
audioEngine.audioContext?.state
```

### 6. Comparison: Microphone vs Tab Audio

**Microphone (WORKS):**
```javascript
// Lines 87-111
const stream = await navigator.mediaDevices.getUserMedia({ 
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } 
});
this.source = this.audioContext.createMediaStreamSource(stream);
this.source.connect(this.analyser);
this.analyser.connect(this._silentGain);
```

**Tab Audio (DOESN'T WORK):**
```javascript
// Lines 138-170
const stream = await navigator.mediaDevices.getDisplayMedia({ 
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  video: true
});

// Stop video tracks
const videoTracks = stream.getVideoTracks();
videoTracks.forEach(track => track.stop());

this.source = this.audioContext.createMediaStreamSource(stream);
this.source.connect(this.analyser);
this.analyser.connect(this._silentGain);
```

**Key difference:** Tab audio stops video tracks after getting stream.

**Question:** Does stopping video tracks affect the MediaStream's audio?

### 7. Next Steps

1. **Replace AudioEngine** with debug version
2. **Run test** with console open
3. **Capture console output** for all patterns
4. **Test hypothesis:** Does stopping video tracks break audio?
   - Try commenting out lines 148-149 (video track stopping)
   - See if audio data flows with video still active
5. **Report findings** with specific error pattern observed

## Expected Findings

Most likely outcomes (in order of probability):

1. **User Error (70%):** "Share audio" checkbox not checked
   - Console shows `audioTracks: 0`
   - Fix: User education, add prominent warning in UI

2. **Silent Audio (20%):** Source tab audio paused/muted
   - Console shows zero data but track exists
   - Fix: Detect and warn user that source is silent

3. **Browser Bug (5%):** Stopping video breaks audio
   - Console shows track exists but zero data
   - Fix: Keep one video track alive or use workaround

4. **WebAudio API Issue (5%):** MediaStreamSource not working with display media
   - Console shows connections but zero data
   - Fix: Research browser compatibility or alternative approach

---

## Test Results

*(To be filled in after running debug version)*

### Console Output:
```
[Paste full console output here]
```

### Root Cause:
[Identified cause]

### Recommended Fix:
[Specific code changes needed]
