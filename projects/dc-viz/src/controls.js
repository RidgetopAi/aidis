/**
 * controls.js
 * 
 * Initializes lil-gui control panel and keyboard bindings.
 * Provides UI for scene switching, audio source selection, and parameters.
 */

import { GUI } from 'lil-gui';

let gui;

/**
 * Initialize GUI controls
 * @param {SceneManager} sceneManager - Scene manager instance
 * @param {AudioEngine} audioEngine - Audio engine instance
 * @param {EffectComposer} composer - Post-processing composer instance
 * @param {SpotifyAPI} spotifyAPI - Spotify API instance
 * @param {Function} getAspectRatioLocked - Getter for aspect ratio lock state
 * @param {Function} setAspectRatioLocked - Setter for aspect ratio lock state
 * @param {Object} stats - Stats.js instance for FPS counter
 */
export function initControls(sceneManager, audioEngine, composer, spotifyAPI, getAspectRatioLocked, setAspectRatioLocked, stats) {
  gui = new GUI();
  gui.domElement.style.position = 'fixed';
  gui.domElement.style.top = '10px';
  gui.domElement.style.right = '10px';

  // Audio controls folder (collapsed by default)
  const audioFolder = gui.addFolder('Audio');
  
  const audioControls = {
    source: 'None',
    startMic: async () => {
      try {
        await audioEngine.startMicrophone();
        audioControls.source = 'Microphone Active';
        sourceController.updateDisplay();
      } catch (err) {
        audioControls.source = 'Microphone Failed';
        sourceController.updateDisplay();
        console.error('Microphone error:', err);
      }
    },
    startTab: async () => {
      try {
        await audioEngine.startTabAudio();
        audioControls.source = 'Tab Audio Active';
        sourceController.updateDisplay();
      } catch (err) {
        audioControls.source = 'Tab Audio Failed';
        sourceController.updateDisplay();
        console.error('Tab audio error:', err);
        alert(err.message);
      }
    },
    stopAudio: () => {
      audioEngine.stopAudio();
      audioControls.source = 'None';
      sourceController.updateDisplay();
    }
  };
  
  const sourceController = audioFolder.add(audioControls, 'source').name('Source').disable();
  audioFolder.add(audioControls, 'startMic').name('🎤 Microphone');
  audioFolder.add(audioControls, 'startTab').name('🔊 Tab Audio');
  audioFolder.add(audioControls, 'stopAudio').name('⏹️ Stop');
  audioFolder.add(audioEngine, 'sensitivity', 0.1, 5.0, 0.1).name('Sensitivity');
  
  const helpText = audioFolder.add({ 
    help: 'Chrome/Edge: Select tab + check "Share audio"' 
  }, 'help').name('ℹ️ Tab Audio Help').disable();
  
  // DRM detection callback
  window.onDRMDetected = () => {
    alert('⚠️ DRM-Protected Audio Detected\n\n' +
          'Spotify uses DRM protection. Chrome blocks audio capture from protected tabs.\n\n' +
          'Solutions:\n' +
          '• Use YouTube or other non-DRM tabs\n' +
          '• Switch to microphone input (increase sensitivity)\n' +
          '• Use Spotify Desktop App with system audio loopback');
  };
  
  audioFolder.close(); // Collapsed by default for cleaner UI

  // Spotify controls folder (collapsed by default)
  const spotifyFolder = gui.addFolder('🎵 Spotify & BPM');
  
  const spotifyStatus = { 
    status: spotifyAPI.isAuthenticated() ? 'Connected' : 'Not Connected',
    track: 'No track playing'
  };
  
  const spotifyStatusController = spotifyFolder.add(spotifyStatus, 'status').name('Status').disable();
  const spotifyTrackController = spotifyFolder.add(spotifyStatus, 'track').name('Current Track').disable();
  
  const loginButton = spotifyFolder.add({ 
    login: async () => {
      try {
        await spotifyAPI.authorize();
      } catch (err) {
        console.error('Spotify login error:', err);
        alert('Failed to login to Spotify: ' + err.message);
      }
    }
  }, 'login').name('Login to Spotify');
  
  const logoutButton = spotifyFolder.add({ 
    logout: () => {
      spotifyAPI.logout();
      spotifyStatus.status = 'Not Connected';
      spotifyStatus.track = 'No track playing';
      spotifyStatusController.updateDisplay();
      spotifyTrackController.updateDisplay();
    }
  }, 'logout').name('Logout');
  
  const fetchTrackButton = spotifyFolder.add({ 
    fetch: async () => {
      if (!spotifyAPI.isAuthenticated()) {
        alert('Please login to Spotify first');
        return;
      }
      
      try {
        const track = await spotifyAPI.getCurrentlyPlaying();
        if (track) {
          spotifyStatus.track = `${track.name} - ${track.artist}`;
          console.log('Currently playing:', track);
        } else {
          spotifyStatus.track = 'Nothing playing';
        }
        spotifyTrackController.updateDisplay();
      } catch (err) {
        console.error('Failed to fetch track:', err);
        if (err.message.includes('Token expired')) {
          spotifyStatus.status = 'Not Connected';
          spotifyStatusController.updateDisplay();
          alert('Session expired. Please login again.');
        } else {
          alert('Failed to fetch track: ' + err.message);
        }
      }
    }
  }, 'fetch').name('Fetch Now Playing');
  
  // BPM Sync controls
  const bpmParams = {
    enabled: true,
    bpm: 120,
    syncMode: 'Spotify BPM'
  };
  
  const bpmController = spotifyFolder.add(bpmParams, 'bpm').name('Current BPM').disable();
  
  spotifyFolder.add(bpmParams, 'enabled')
    .name('BPM Sync Enabled')
    .onChange((value) => {
      audioEngine.bpmSync.setEnabled(value);
    });
  
  spotifyFolder.add(bpmParams, 'syncMode').name('Sync Mode').disable();
  
  // Update BPM display periodically
  setInterval(() => {
    bpmParams.bpm = audioEngine.bpmSync.getBPM();
    bpmController.updateDisplay();
  }, 1000);
  
  spotifyFolder.close(); // Collapsed by default for cleaner UI

  // Update function for external use
  window.updateSpotifyStatus = () => {
    spotifyStatus.status = spotifyAPI.isAuthenticated() ? 'Connected' : 'Not Connected';
    spotifyStatusController.updateDisplay();
    
    if (spotifyAPI.isAuthenticated()) {
      spotifyAPI.getCurrentlyPlaying().then(track => {
        if (track) {
          spotifyStatus.track = `${track.name} - ${track.artist}`;
          if (track.audioFeatures?.bpm) {
            bpmParams.bpm = track.audioFeatures.bpm;
            bpmController.updateDisplay();
          }
        } else {
          spotifyStatus.track = 'Nothing playing';
        }
        spotifyTrackController.updateDisplay();
      }).catch(err => {
        console.error('Error fetching track on status update:', err);
      });
    }
  };

  // Scene controls folder (open by default - most frequently used)
  const sceneFolder = gui.addFolder('🎬 Scenes');
  
  const sceneInfo = {
    current: sceneManager.getSceneNames()[sceneManager.currentSceneIndex] || 'None',
    autoCycle: sceneManager.autoCycleEnabled
  };
  
  const sceneController = sceneFolder.add(sceneInfo, 'current').name('Current Scene').disable();
  const autoCycleController = sceneFolder.add(sceneInfo, 'autoCycle')
    .name('Auto-Cycle')
    .onChange((value) => {
      sceneManager.autoCycleEnabled = value;
    });
  
  const cycleParams = { intervalSeconds: sceneManager.cycleInterval / 1000 };
  sceneFolder.add(cycleParams, 'intervalSeconds', 10, 120, 1)
    .name('⏱️ Cycle Interval (sec)')
    .onChange((value) => {
      sceneManager.cycleInterval = value * 1000;
    });
  
  sceneFolder.add({
    previous: () => {
      sceneManager.previousScene();
      sceneInfo.current = sceneManager.getSceneNames()[sceneManager.currentSceneIndex];
      sceneController.updateDisplay();
    }
  }, 'previous').name('◀ Previous');
  
  sceneFolder.add({
    next: () => {
      sceneManager.nextScene();
      sceneInfo.current = sceneManager.getSceneNames()[sceneManager.currentSceneIndex];
      sceneController.updateDisplay();
    }
  }, 'next').name('Next ▶');
  
  const sceneNames = sceneManager.getSceneNames();
  sceneNames.forEach((name, index) => {
    const visibilityParam = { enabled: sceneManager.getSceneEnabled(index) };
    sceneFolder.add(visibilityParam, 'enabled')
      .name(`☑ ${name}`)
      .onChange((value) => {
        sceneManager.setSceneEnabled(index, value);
      });
  });
  
  sceneFolder.open();

  // Display controls folder (open by default - most frequently used)
  if (getAspectRatioLocked && setAspectRatioLocked) {
    const displayFolder = gui.addFolder('⚙️ Display');
    
    const displayParams = {
      aspectRatio: getAspectRatioLocked() ? '16:9 Locked' : 'Fill Window',
      locked: getAspectRatioLocked(),
      fullscreenState: 'Windowed'
    };
    
    displayFolder.add(displayParams, 'locked')
      .name('📐 Lock 16:9 Aspect')
      .onChange((value) => {
        setAspectRatioLocked(value);
        displayParams.aspectRatio = value ? '16:9 Locked' : 'Fill Window';
      });
    
    displayFolder.add(displayParams, 'aspectRatio').name('Mode').disable();
    
    displayFolder.add({
      toggleFullscreen: () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
        } else {
          document.exitFullscreen();
        }
      }
    }, 'toggleFullscreen').name('🖥️ Fullscreen (F)');
    
    const fullscreenController = displayFolder.add(displayParams, 'fullscreenState').name('State').disable();
    
    // Listen to fullscreen change events
    document.addEventListener('fullscreenchange', () => {
      displayParams.fullscreenState = document.fullscreenElement ? 'Fullscreen' : 'Windowed';
      fullscreenController.updateDisplay();
    });
    
    // FPS counter toggle
    if (stats) {
      const fpsParams = { showFPS: true };
      displayFolder.add(fpsParams, 'showFPS')
        .name('📊 Show FPS Counter')
        .onChange((value) => {
          stats.dom.style.display = value ? 'block' : 'none';
        });
    }
    
    displayFolder.open();
  }

  // Post-processing controls folder (collapsed by default)
  if (composer && composer.bloomPass) {
    const postFolder = gui.addFolder('✨ Post-Processing');
    
    const bloomParams = {
      enabled: true,
      strength: composer.bloomPass.strength,
      threshold: composer.bloomPass.threshold,
      radius: composer.bloomPass.radius
    };
    
    postFolder.add(bloomParams, 'enabled')
      .name('Bloom Enabled')
      .onChange((value) => {
        composer.bloomPass.enabled = value;
      });
    
    postFolder.add(bloomParams, 'strength', 0, 2, 0.1)
      .name('Bloom Strength')
      .onChange((value) => {
        composer.bloomPass.strength = value;
      });
    
    postFolder.add(bloomParams, 'threshold', 0, 1, 0.05)
      .name('Bloom Threshold')
      .onChange((value) => {
        composer.bloomPass.threshold = value;
      });
    
    postFolder.add(bloomParams, 'radius', 0, 1, 0.05)
      .name('Bloom Radius')
      .onChange((value) => {
        composer.bloomPass.radius = value;
      });
    
    postFolder.close(); // Collapsed by default for cleaner UI
  }

  window.updateSceneDisplay = () => {
    sceneInfo.current = sceneManager.getSceneNames()[sceneManager.currentSceneIndex];
    sceneInfo.autoCycle = sceneManager.autoCycleEnabled;
    sceneController.updateDisplay();
    autoCycleController.updateDisplay();
  };

  // Keyboard bindings
  setupKeyboardControls(sceneManager, audioEngine);
}

/**
 * Setup keyboard shortcuts
 * @param {SceneManager} sceneManager - Scene manager instance
 * @param {AudioEngine} audioEngine - Audio engine instance
 */
function setupKeyboardControls(sceneManager, audioEngine) {
  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case '1':
        sceneManager.setScene(0);
        if (window.updateSceneDisplay) window.updateSceneDisplay();
        break;
      
      case '2':
        sceneManager.setScene(1);
        if (window.updateSceneDisplay) window.updateSceneDisplay();
        break;
      
      case '3':
        sceneManager.setScene(2);
        if (window.updateSceneDisplay) window.updateSceneDisplay();
        break;
      
      case '4':
        sceneManager.setScene(3);
        if (window.updateSceneDisplay) window.updateSceneDisplay();
        break;
      
      case '5':
        sceneManager.setScene(4);
        if (window.updateSceneDisplay) window.updateSceneDisplay();
        break;
      
      case '6':
        sceneManager.setScene(5);
        if (window.updateSceneDisplay) window.updateSceneDisplay();
        break;
      
      case '7':
        sceneManager.setScene(6);
        if (window.updateSceneDisplay) window.updateSceneDisplay();
        break;
      
      case 'c':
      case 'C':
        sceneManager.autoCycleEnabled = !sceneManager.autoCycleEnabled;
        if (window.updateSceneDisplay) window.updateSceneDisplay();
        break;
      
      case 'ArrowRight':
        sceneManager.nextScene();
        if (window.updateSceneDisplay) window.updateSceneDisplay();
        break;
      
      case 'ArrowLeft':
        sceneManager.previousScene();
        if (window.updateSceneDisplay) window.updateSceneDisplay();
        break;
      
      case ' ':
        e.preventDefault();
        sceneManager.autoCycleEnabled = !sceneManager.autoCycleEnabled;
        if (window.updateSceneDisplay) window.updateSceneDisplay();
        break;
      
      case 'm':
      case 'M':
        audioEngine.startMicrophone();
        break;
      
      case 'f':
      case 'F':
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
        } else {
          document.exitFullscreen();
        }
        break;
    }
  });
}

/**
 * Cleanup GUI
 */
export function disposeControls() {
  if (gui) {
    gui.destroy();
    gui = null;
  }
}
