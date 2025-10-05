/**
 * AudioEngine.js - DEBUG VERSION
 * Enhanced with comprehensive tab audio debugging
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
      bpm: 0,
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

    this.bpmSync = new BPMSync();
    
    // DEBUG: Track audio source type
    this._debugSourceType = 'none';
  }

  async ensureRunning() {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
      console.log('🔊 AudioContext resumed, state:', this.audioContext.state);
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
      console.log('✅ AudioEngine initialized');
    } catch (err) {
      console.error('❌ Failed to initialize audio:', err);
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
      console.log('🎤 Mic track:', {
        enabled: track?.enabled,
        muted: track?.muted,
        readyState: track?.readyState,
        label: track?.label
      });
      
      if (track && track.muted) {
        console.warn('⚠️ Microphone track is muted! Check system/browser audio settings.');
        track.enabled = true;
      }
      
      this.currentStream = stream;
      this.source = this.audioContext.createMediaStreamSource(stream);
      this.source.connect(this.analyser);
      this.analyser.connect(this._silentGain);
      
      await this.ensureRunning();
      
      this._debugSourceType = 'microphone';
      console.log('✅ Microphone connected');
      
      return true;
    } catch (err) {
      console.error('❌ Failed to access microphone:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone permission denied');
      }
      throw err;
    }
  }

  async startTabAudio() {
    await this.init();
    this.stopAudio();
    
    console.log('🔊 === TAB AUDIO CAPTURE START ===');
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: true
      });
      
      console.log('📡 Stream obtained:', {
        id: stream.id,
        active: stream.active,
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length
      });
      
      // Stop video tracks
      const videoTracks = stream.getVideoTracks();
      videoTracks.forEach(track => {
        console.log('🎥 Stopping video track:', track.label);
        track.stop();
      });
      
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio track in selected source');
      }
      
      const [track] = audioTracks;
      console.log('🔊 Tab audio track details:', {
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        contentHint: track.contentHint,
        settings: track.getSettings()
      });
      
      // Check if track is actually providing audio
      if (track.muted) {
        console.error('❌ Audio track is MUTED!');
      }
      
      if (track.readyState !== 'live') {
        console.error('❌ Audio track readyState is not "live":', track.readyState);
      }
      
      this.currentStream = stream;
      this.source = this.audioContext.createMediaStreamSource(stream);
      
      console.log('🔌 Audio graph connections:');
      console.log('  1. MediaStreamSource created');
      
      this.source.connect(this.analyser);
      console.log('  2. Source → Analyser (connected)');
      
      this.analyser.connect(this._silentGain);
      console.log('  3. Analyser → Silent Gain (connected)');
      console.log('  4. Silent Gain value:', this._silentGain.gain.value);
      
      await this.ensureRunning();
      console.log('  5. AudioContext state:', this.audioContext.state);
      
      this._debugSourceType = 'tab';
      
      // Test analyser immediately
      console.log('🧪 Testing analyser data...');
      setTimeout(() => {
        this.analyser.getByteFrequencyData(this.dataArray);
        const sum = this.dataArray.reduce((a, b) => a + b, 0);
        const max = Math.max(...this.dataArray);
        const nonZero = this.dataArray.filter(v => v > 0).length;
        
        console.log('🔍 Initial analyser test:', {
          dataArraySum: sum,
          maxValue: max,
          nonZeroBins: nonZero,
          totalBins: this.dataArray.length,
          firstTenValues: Array.from(this.dataArray.slice(0, 10))
        });
        
        if (sum === 0) {
          console.error('❌ PROBLEM: Analyser receiving ZERO data from tab audio!');
          console.error('Possible causes:');
          console.error('  1. Tab audio is silent/paused');
          console.error('  2. "Share audio" checkbox not checked in browser dialog');
          console.error('  3. Audio track is muted or disabled');
          console.error('  4. Browser security restriction');
        } else {
          console.log('✅ Analyser is receiving data!');
        }
      }, 500);
      
      console.log('✅ Tab audio setup complete');
      console.log('🔊 === TAB AUDIO CAPTURE END ===');
      
      return true;
    } catch (err) {
      console.error('❌ Failed to access tab audio:', err);
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
      
      this._debugSourceType = 'file';
      
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
      
      this._debugSourceType = 'element';
      
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
    
    this._disconnectCurrentSource();
    this._debugSourceType = 'none';
    
    console.log('⏹️ All audio sources stopped');
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
    
    this.bpmSync.setBassFallback(this.smoothedBands.bass);
    this.bands.bpm = this.bpmSync.getBPMPulse();
    
    // DEBUG: Enhanced logging every 60 frames
    if (!this._debugFrameCount) this._debugFrameCount = 0;
    this._debugFrameCount++;
    
    if (this._debugFrameCount % 60 === 0) {
      const dataSum = this.dataArray.reduce((a, b) => a + b, 0);
      const dataMax = Math.max(...this.dataArray);
      const nonZero = this.dataArray.filter(v => v > 0).length;
      
      console.log('📊 AudioEngine Update [Frame', this._debugFrameCount, ']:');
      console.log('  Source Type:', this._debugSourceType);
      console.log('  Raw Data Sum:', dataSum);
      console.log('  Raw Data Max:', dataMax);
      console.log('  Non-Zero Bins:', nonZero, '/', this.dataArray.length);
      console.log('  Bands:', {
        bass: this.bands.bass.toFixed(3),
        mid: this.bands.mid.toFixed(3),
        treble: this.bands.treble.toFixed(3),
        overall: this.bands.overall.toFixed(3)
      });
      console.log('  Smoothed:', {
        bass: this.smoothedBands.bass.toFixed(3),
        mid: this.smoothedBands.mid.toFixed(3),
        treble: this.smoothedBands.treble.toFixed(3),
        overall: this.smoothedBands.overall.toFixed(3)
      });
      console.log('  getLevels():', this.getLevels());
      
      if (this._debugSourceType === 'tab' && dataSum === 0) {
        console.error('❌ WARNING: Tab audio active but receiving NO DATA!');
      }
    }
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
