/**
 * main.js
 * 
 * Application entry point - bootstraps the WebGL renderer, camera,
 * main animation loop, and post-processing effects composer.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AppLoop } from './AppLoop.js';
import { AudioEngine } from './AudioEngine.js';
import { SceneManager } from './SceneManager.js';
import { initControls } from './controls.js';
import { SanityScene } from './SanityScene.js';
import { LogoScene } from './scenes/LogoScene.js';
import { SoundBarsScene } from './scenes/SoundBarsScene.js';
import { ParticleBallScene } from './scenes/ParticleBallScene.js';
import { ReactiveGridPlaneScene } from './scenes/ReactiveGridPlaneScene.js';
import { MorphingSphereScene } from './scenes/MorphingSphereScene.js';
import { AbstractShaderScene } from './scenes/AbstractShaderScene.js';
import { SpotifyAPI } from './SpotifyAPI.js';
import { SpotifyOverlay } from './SpotifyOverlay.js';
import Stats from 'stats.js';

let renderer;
let camera;
let appLoop;
let audioEngine;
let sceneManager;
let composer;
let spotifyAPI;
let spotifyOverlay;
let stats;

// Aspect ratio control
let aspectRatioLocked = true;
const TARGET_ASPECT = 16 / 9;

/**
 * Calculate 16:9 constrained dimensions that fit within window
 */
function calculate16x9Size(windowWidth, windowHeight) {
  if (!aspectRatioLocked) {
    return { width: windowWidth, height: windowHeight };
  }

  const windowAspect = windowWidth / windowHeight;
  
  let width, height;
  if (windowAspect > TARGET_ASPECT) {
    // Window is wider - use height, letterbox sides
    height = windowHeight;
    width = height * TARGET_ASPECT;
  } else {
    // Window is taller - use width, letterbox top/bottom
    width = windowWidth;
    height = width / TARGET_ASPECT;
  }
  
  return { width: Math.floor(width), height: Math.floor(height) };
}

/**
 * Initialize the WebGL renderer and configure output settings
 */
function initRenderer() {
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: false,
    powerPreference: 'high-performance'
  });
  
  const { width, height } = calculate16x9Size(window.innerWidth, window.innerHeight);
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  
  // Center canvas with CSS
  const canvas = renderer.domElement;
  canvas.style.position = 'fixed';
  canvas.style.top = '50%';
  canvas.style.left = '50%';
  canvas.style.transform = 'translate(-50%, -50%)';
  
  document.body.appendChild(canvas);
}

/**
 * Initialize camera with appropriate FOV and aspect ratio
 */
function initCamera() {
  const fov = 75;
  const aspect = aspectRatioLocked ? TARGET_ASPECT : (window.innerWidth / window.innerHeight);
  const near = 0.1;
  const far = 1000;
  
  camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);
}

/**
 * Initialize post-processing effects composer
 */
function initPostProcessing() {
  composer = new EffectComposer(renderer);
  
  // Create a placeholder scene for initial setup
  const dummyScene = new THREE.Scene();
  const renderPass = new RenderPass(dummyScene, camera);
  composer.addPass(renderPass);
  
  const { width, height } = calculate16x9Size(window.innerWidth, window.innerHeight);
  
  // Add bloom pass with optimized settings for performance
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.5,    // strength (reduced from 0.7)
    0.3,    // radius (reduced from 0.4)
    0.85    // threshold
  );
  composer.addPass(bloomPass);
  
  // Store references for dynamic scene updates
  composer.renderPass = renderPass;
  composer.bloomPass = bloomPass;
}

/**
 * Initialize FPS counter
 */
function initStats() {
  stats = new Stats();
  stats.showPanel(0);
  stats.dom.style.position = 'absolute';
  stats.dom.style.top = '0px';
  stats.dom.style.left = '0px';
  document.body.appendChild(stats.dom);
}

/**
 * Handle window resize events
 */
function onWindowResize() {
  const { width, height } = calculate16x9Size(window.innerWidth, window.innerHeight);

  camera.aspect = aspectRatioLocked ? TARGET_ASPECT : (width / height);
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  
  if (composer) {
    composer.setSize(width, height);
  }
}

/**
 * Main initialization function
 */
async function init() {
  initRenderer();
  initCamera();
  initPostProcessing();
  initStats();

  // Initialize subsystems
  audioEngine = new AudioEngine();
  sceneManager = new SceneManager(camera, audioEngine);
  appLoop = new AppLoop(render);
  spotifyAPI = new SpotifyAPI();
  spotifyOverlay = new SpotifyOverlay(spotifyAPI);

  // Check for Spotify OAuth callback
  await handleSpotifyCallback();

  // Setup Spotify track change listener for BPM sync
  setupSpotifyBPMSync();

  // Add sanity check scene
  const sanityScene = new SanityScene();
  sceneManager.addScene(sanityScene);

  // Add logo scene
  const logoScene = new LogoScene();
  sceneManager.addScene(logoScene);

  // Add sound bars scene
  const soundBarsScene = new SoundBarsScene();
  sceneManager.addScene(soundBarsScene);

  // Add particle ball scene
  const particleBallScene = new ParticleBallScene();
  sceneManager.addScene(particleBallScene);

  // Add reactive grid plane scene
  const reactiveGridPlaneScene = new ReactiveGridPlaneScene();
  sceneManager.addScene(reactiveGridPlaneScene);

  // Add waveform tunnel scene
  const morphingSphereScene = new MorphingSphereScene();
sceneManager.addScene(morphingSphereScene);

  // Add abstract shader scene
  const abstractShaderScene = new AbstractShaderScene();
  sceneManager.addScene(abstractShaderScene);

  // Initialize first scene (fixes bug where first scene's enter() is never called)
  sceneManager.init();

  // Initialize UI controls
  initControls(sceneManager, audioEngine, composer, spotifyAPI, () => aspectRatioLocked, (value) => {
    aspectRatioLocked = value;
    onWindowResize();
  }, stats);

  window.addEventListener('resize', onWindowResize);

  appLoop.start();
}

/**
 * Main render function called each frame
 * @param {number} deltaTime - Time elapsed since last frame (seconds)
 */
function render(deltaTime) {
  stats.begin();

  // Update audio analysis
  audioEngine.update();

  // Update current scene
  sceneManager.update(deltaTime);

  // Render with post-processing or direct
  if (composer) {
    // Update render pass with current scene dynamically
    composer.renderPass.scene = sceneManager.getCurrentScene();
    composer.render();
  } else {
    renderer.render(sceneManager.getCurrentScene(), camera);
  }

  stats.end();
}

/**
 * Handle Spotify OAuth callback
 */
async function handleSpotifyCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const hasCode = urlParams.has('code');
  
  if (hasCode) {
    console.log('Handling Spotify OAuth callback...');
    const success = await spotifyAPI.handleCallback();
    
    if (success) {
      console.log('Spotify authentication successful!');
      if (window.updateSpotifyStatus) {
        window.updateSpotifyStatus();
      }
    } else {
      console.error('Spotify authentication failed');
      alert('Spotify authentication failed. Please try again.');
    }
  }
}

/**
 * Setup Spotify BPM synchronization
 * Polls for track changes and updates BPM sync
 */
function setupSpotifyBPMSync() {
  setInterval(async () => {
    if (!spotifyAPI.isAuthenticated()) return;

    try {
      const track = await spotifyAPI.getCurrentlyPlaying();
      if (track?.audioFeatures?.bpm) {
        audioEngine.bpmSync.setBPM(track.audioFeatures.bpm);
      }
    } catch (error) {
      // Silently fail - track polling might fail occasionally
    }
  }, 10000); // Check every 10 seconds
}

/**
 * Handle Start button click
 */
async function handleStart() {
  const startButton = document.getElementById('start-button');
  const startOverlay = document.getElementById('start-overlay');
  
  try {
    startButton.textContent = 'Starting...';
    startButton.disabled = true;

    await audioEngine.startMicrophone();
    
    startOverlay.style.display = 'none';
    console.log('Audio initialized successfully');
  } catch (err) {
    console.error('Failed to start audio:', err);
    startButton.textContent = 'Error - Try Again';
    startButton.disabled = false;
    alert('Failed to start microphone: ' + err.message);
  }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    init();
    document.getElementById('start-button').addEventListener('click', handleStart);
  });
} else {
  init();
  document.getElementById('start-button').addEventListener('click', handleStart);
}
