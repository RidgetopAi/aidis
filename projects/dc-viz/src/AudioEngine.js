/**
 * AudioEngine.js
 * 
 * Manages Web Audio API setup, audio sources (microphone or file),
 * FFT analysis, and frequency band extraction for visualizations.
 */

import { BPMSync } from './BPMSync.js';

export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.dataArray = null;
    this.waveformArray = null;
    this.source = null;
    this.isInitialized = false;
    this.currentStream = null;
    this.currentAudioElement = null;

    this.bands = {
      bass: 0,
      mid: 0,
      treble: 0,
      overall: 0,
      bpm: 0, // BPM pulse value
    };

    this.smoothedBands = {
      bass: 0,
      mid: 0,
      treble: 0,
      overall: 0,
    };

    this.smoothingFactor = 0.8;
    this.sensitivity = 1.0;

    this.FFT_SIZE = 2048;
    
    this.FREQ_RANGES = {
      bass: { min: 20, max: 150 },
      mid: { min: 150, max: 2000 },
      treble: { min: 2000, max: 8000 },
    };

    // BPM synchronization
    this.bpmSync = new BPMSync();
    
    // DRM detection
    this.silentFrameCount = 0;
    this.SILENCE_THRESHOLD = 180; // 3 seconds at 60fps
    this.isDRMDetected = false;
  }

  async ensureRunning() {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
      console.log('AudioContext resumed, state:', this.audioContext.state);
    }
  }

  async init() {
    if (this.isInitialized) return;

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.FFT_SIZE;
      
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      this.waveformArray = new Uint8Array(this.analyser.fftSize);
      
      this._silentGain = this.audioContext.createGain();
      this._silentGain.gain.value = 0.0;
      this._silentGain.connect(this.audioContext.destination);
      
      this.isInitialized = true;
    } catch (err) {
      console.error('Failed to initialize audio:', err);
      throw err;
    }
  }

  async startMicrophone() {
    await this.init();
    this.stopAudio();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        } 
      });
      
      const [track] = stream.getAudioTracks();
      console.log('Mic track:', {
        enabled: track?.enabled,
        muted: track?.muted,
        readyState: track?.readyState
      });
      
      if (track && track.muted) {
        console.warn('⚠️ Microphone track is muted! Check system/browser audio settings.');
        console.warn('Attempting to enable track...');
        track.enabled = true;
      }
      
      this.currentStream = stream;
      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      this.analyser.connect(this._silentGain);
      
      await this.ensureRunning();
      console.log('AudioContext state:', this.audioContext.state);
      
      return true;
    } catch (err) {
      console.error('Failed to access microphone:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone permission denied');
      }
      throw err;
    }
  }

  async startTabAudio() {
    await this.init();
    this.stopAudio();
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: true
      });
      
      // KEEP video tracks alive to prevent MediaStream invalidation
      // Store reference so they don't get garbage collected
      this.videoTracks = stream.getVideoTracks();
      
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio track in selected source');
      }
      
      const audioTrack = audioTracks[0];
      
      if (audioTrack.muted) {
        console.warn('⚠️ Audio track is muted!');
      }
      
      // FIX: Resume AudioContext BEFORE creating source (Fix 2)
      await this.ensureRunning();
      
      // FIX: Create MediaStreamSource from audio-only stream (Fix 1)
      const audioOnlyStream = new MediaStream([audioTrack]);
      
      this.currentStream = stream;
      this.source = this.audioContext.createMediaStreamSource(audioOnlyStream);
      this.source.connect(this.analyser);
      this.analyser.connect(this._silentGain);
      
      // User troubleshooting warnings
      console.warn('⚠️ If dataArray sum stays 0:');
      console.warn('1. Make sure Spotify is PLAYING (not paused)');
      console.warn('2. Try unmuting the Spotify tab');
      console.warn('3. Try refreshing the Spotify tab');
      
      return true;
    } catch (err) {
      console.error('Failed to access tab audio:', err);
      console.error('Error name:', err.name);
      console.error('Error message:', err.message);
      
      if (err.name === 'NotAllowedError') {
        throw new Error('Permission denied. Click "Start Tab Audio" again and allow access.');
      } else if (err.name === 'NotFoundError') {
        throw new Error('No audio source selected or audio sharing not enabled. Make sure to check "Share audio" checkbox.');
      } else {
        throw new Error(`Tab audio capture failed: ${err.message}`);
      }
    }
  }

  async loadAudioFile(file) {
    await this.init();

    try {
      this._disconnectCurrentSource();
      
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.crossOrigin = 'anonymous';
      
      this.currentAudioElement = audio;
      this.source = this.audioContext.createMediaElementSource(audio);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
      audio.play();
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      return audio;
    } catch (err) {
      console.error('Failed to load audio file:', err);
      throw err;
    }
  }

  async connectAudioElement(audioElement) {
    await this.init();

    try {
      this._disconnectCurrentSource();
      
      this.currentAudioElement = audioElement;
      this.source = this.audioContext.createMediaElementSource(audioElement);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      return true;
    } catch (err) {
      console.error('Failed to connect audio element:', err);
      throw err;
    }
  }

  stopAudio() {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }
    
    if (this.videoTracks) {
      this.videoTracks.forEach(track => track.stop());
      this.videoTracks = null;
    }
    
    this._disconnectCurrentSource();
    
    // Reset DRM detection on source switch
    this.silentFrameCount = 0;
    this.isDRMDetected = false;
  }

  _disconnectCurrentSource() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement = null;
    }
  }

  _frequencyToIndex(frequency) {
    const nyquist = this.audioContext.sampleRate / 2;
    const index = Math.round(frequency / nyquist * this.analyser.frequencyBinCount);
    return Math.min(index, this.analyser.frequencyBinCount - 1);
  }

  _getFrequencyRangeLevel(minFreq, maxFreq) {
    if (!this.analyser || !this.dataArray) return 0;
    
    const minIndex = this._frequencyToIndex(minFreq);
    const maxIndex = this._frequencyToIndex(maxFreq);
    
    let sum = 0;
    let count = 0;
    
    for (let i = minIndex; i <= maxIndex; i++) {
      sum += this.dataArray[i];
      count++;
    }
    
    const average = count > 0 ? sum / count : 0;
    return average / 255;
  }

  update() {
    if (!this.analyser || !this.dataArray) return;
    
    this.analyser.getByteFrequencyData(this.dataArray);
    this.analyser.getByteTimeDomainData(this.waveformArray);
    
    // Detect DRM/silent capture
    const freqSum = this.dataArray.reduce((a, b) => a + b, 0);
    const timeIsFlat = this.waveformArray.every(v => v >= 126 && v <= 130);

    if (freqSum === 0 && timeIsFlat && this.currentStream) {
      this.silentFrameCount++;
      if (this.silentFrameCount === this.SILENCE_THRESHOLD && !this.isDRMDetected) {
        this.isDRMDetected = true;
        console.warn('⚠️ DRM DETECTED: Captured tab audio is silenced (protected content)');
        console.warn('Solutions:');
        console.warn('1. Use YouTube or non-DRM source instead');
        console.warn('2. Use Spotify Desktop App + system loopback');
        console.warn('3. Use microphone (increase sensitivity in GUI)');
        // Fire event for UI notification
        if (window.onDRMDetected) window.onDRMDetected();
      }
    } else {
      this.silentFrameCount = 0;
      this.isDRMDetected = false;
    }
    
    this.bands.bass = this._getFrequencyRangeLevel(
      this.FREQ_RANGES.bass.min,
      this.FREQ_RANGES.bass.max
    );
    
    this.bands.mid = this._getFrequencyRangeLevel(
      this.FREQ_RANGES.mid.min,
      this.FREQ_RANGES.mid.max
    );
    
    this.bands.treble = this._getFrequencyRangeLevel(
      this.FREQ_RANGES.treble.min,
      this.FREQ_RANGES.treble.max
    );
    
    this.bands.overall = (this.bands.bass + this.bands.mid + this.bands.treble) / 3;

    this.smoothedBands.bass = this.smoothedBands.bass * this.smoothingFactor + this.bands.bass * (1 - this.smoothingFactor);
    this.smoothedBands.mid = this.smoothedBands.mid * this.smoothingFactor + this.bands.mid * (1 - this.smoothingFactor);
    this.smoothedBands.treble = this.smoothedBands.treble * this.smoothingFactor + this.bands.treble * (1 - this.smoothingFactor);
    this.smoothedBands.overall = this.smoothedBands.overall * this.smoothingFactor + this.bands.overall * (1 - this.smoothingFactor);
    
    // Update BPM pulse value
    this.bpmSync.setBassFallback(this.smoothedBands.bass);
    this.bands.bpm = this.bpmSync.getBPMPulse();
  }

  getLevels() {
    return {
      bass: Math.min(this.smoothedBands.bass * this.sensitivity, 1.0),
      mid: Math.min(this.smoothedBands.mid * this.sensitivity, 1.0),
      treble: Math.min(this.smoothedBands.treble * this.sensitivity, 1.0),
      overall: Math.min(this.smoothedBands.overall * this.sensitivity, 1.0),
    };
  }

  setSensitivity(value) {
    this.sensitivity = Math.max(0.1, Math.min(5.0, value));
  }

  getSensitivity() {
    return this.sensitivity;
  }

  setSmoothing(value) {
    this.smoothingFactor = Math.max(0, Math.min(1.0, value));
  }

  getSmoothing() {
    return this.smoothingFactor;
  }

  getBands() {
    return { ...this.bands };
  }

  getFrequencyData() {
    return this.dataArray;
  }

  getWaveform() {
    if (!this.analyser || !this.waveformArray) return null;
    this.analyser.getByteTimeDomainData(this.waveformArray);
    return this.waveformArray;
  }

  dispose() {
    this._disconnectCurrentSource();
    
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.isInitialized = false;
  }
}
