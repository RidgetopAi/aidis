# Tab Audio Capture - Usage Guide

## Overview
DC-VIZ now supports direct system/tab audio capture, providing superior audio quality compared to microphone input.

## Implementation Details

### AudioEngine.js
Added `startTabAudio()` method:
- Uses `navigator.mediaDevices.getDisplayMedia()` API
- Requests audio-only stream (no video)
- Disables audio processing (echo cancellation, noise suppression, auto-gain)
- Validates audio track presence and state
- Connects to existing analyser pipeline via silent gain node

### controls.js
Added GUI controls in Audio folder:
- **"🔊 Start Tab Audio"** button
- Status display showing "Tab Audio Active" or "Tab Audio Failed"
- Help text: "Chrome/Edge: Select tab + check 'Share audio'"
- Error alerts with clear user guidance

## User Flow

1. Click **"🔊 Start Tab Audio"** button in GUI
2. Browser shows tab/window picker dialog
3. Select the tab playing audio (e.g., Spotify Web Player, YouTube)
4. **CRITICAL:** Check the **"Share audio"** checkbox in the picker
5. Click "Share" to start capturing
6. Visualizer receives direct audio stream

## Advantages

✅ **Direct audio capture** - No room acoustics or ambient noise  
✅ **Higher signal strength** - No dependency on speaker volume  
✅ **Works with any tab** - Spotify, YouTube, SoundCloud, etc.  
✅ **Better frequency response** - Pure digital audio signal  
✅ **Consistent levels** - Not affected by microphone positioning  

## Limitations

⚠️ **Browser Support:** Chrome/Edge only (Firefox doesn't support audio in getDisplayMedia yet)  
⚠️ **User Action Required:** Must check "Share audio" checkbox in picker dialog  
⚠️ **Tab Selection:** Only captures audio from selected tab (not system-wide)  

## Troubleshooting

### No audio visualizing after selecting tab
- Make sure you checked the **"Share audio"** checkbox
- Verify the selected tab is actually playing audio
- Check browser console for error messages

### "Tab Audio Failed" status
- Browser may not support getDisplayMedia audio (use Chrome/Edge)
- User may have cancelled the tab picker dialog
- Selected source may not have audio capability

### Audio cuts out
- User may have closed or muted the source tab
- Tab may have navigated to a different page
- Browser may have suspended the tab

## Recommended Usage

**For live performances/events:**
- Use Tab Audio with Spotify Web Player for reliable, high-quality music
- No need for external speakers or microphone
- Cleaner setup, better audio quality

**For testing/development:**
- Use Tab Audio with YouTube music videos
- Easy to switch between tracks
- Consistent audio levels

**For DJ/VJ sets:**
- Run DJ software in browser tab
- Capture output directly without audio routing
- Lower latency, simpler setup

## Technical Notes

- Audio is routed through silent gain node (gain = 0)
- Only analyser receives signal, no audio playback from visualizer
- Works with existing FFT analysis and frequency band extraction
- Compatible with BPM sync and Spotify integration
- No changes to existing microphone or file input methods

## Files Modified

1. `/src/AudioEngine.js` - Added `startTabAudio()` method
2. `/src/controls.js` - Added GUI button, status display, and help text
3. `/TODO-Phase6.md` - Updated with tab audio feature completion

## Build Status
✅ TypeScript compilation passes  
✅ Vite build successful  
✅ Production ready  

---

**Feature Status:** ✅ COMPLETE  
**Date Implemented:** 2025-10-03  
**Browser Compatibility:** Chrome 94+, Edge 94+
