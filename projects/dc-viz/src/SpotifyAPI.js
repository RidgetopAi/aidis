/**
 * SpotifyAPI.js
 * 
 * Client-side Spotify OAuth PKCE flow and API integration.
 * Handles authentication, token management, and fetching currently playing track.
 */

export class SpotifyAPI {
  constructor() {
    this.clientId = '02aab5bf1c6242e287ff81b4d70ea43b';
    this.redirectUri = 'http://127.0.0.1:5173';
    this.scopes = 'user-read-currently-playing user-read-playback-state user-read-playback-position';
    this.authEndpoint = 'https://accounts.spotify.com/authorize';
    this.tokenEndpoint = 'https://accounts.spotify.com/api/token';
    
    this.storageKeys = {
      accessToken: 'spotify_access_token',
      refreshToken: 'spotify_refresh_token',
      expiresAt: 'spotify_expires_at',
      codeVerifier: 'spotify_code_verifier'
    };
  }

  /**
   * Generate a random code verifier for PKCE
   * @returns {string} Base64-encoded random string
   */
  generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this._base64URLEncode(array);
  }

  /**
   * Generate code challenge from verifier using SHA-256
   * @param {string} verifier - Code verifier
   * @returns {Promise<string>} Base64-encoded SHA-256 hash
   */
  async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this._base64URLEncode(new Uint8Array(digest));
  }

  /**
   * Base64 URL encode (without padding)
   * @param {Uint8Array} buffer - Buffer to encode
   * @returns {string} Base64 URL-encoded string
   */
  _base64URLEncode(buffer) {
    const base64 = btoa(String.fromCharCode(...buffer));
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Initiate Spotify OAuth authorization flow
   */
  async authorize() {
    const verifier = this.generateCodeVerifier();
    const challenge = await this.generateCodeChallenge(verifier);
    
    localStorage.setItem(this.storageKeys.codeVerifier, verifier);

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: this.scopes,
      code_challenge_method: 'S256',
      code_challenge: challenge
    });

    window.location.href = `${this.authEndpoint}?${params.toString()}`;
  }

  /**
   * Handle OAuth callback and exchange code for access token
   * @returns {Promise<boolean>} True if successful, false otherwise
   */
  async handleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
      console.error('Spotify auth error:', error);
      return false;
    }

    if (!code) {
      return false;
    }

    const verifier = localStorage.getItem(this.storageKeys.codeVerifier);
    if (!verifier) {
      console.error('Code verifier not found');
      return false;
    }

    try {
      const response = await fetch(this.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: this.redirectUri,
          code_verifier: verifier
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Token exchange failed:', errorData);
        return false;
      }

      const data = await response.json();
      
      localStorage.setItem(this.storageKeys.accessToken, data.access_token);
      if (data.refresh_token) {
        localStorage.setItem(this.storageKeys.refreshToken, data.refresh_token);
      }
      
      const expiresAt = Date.now() + (data.expires_in * 1000);
      localStorage.setItem(this.storageKeys.expiresAt, expiresAt.toString());
      
      localStorage.removeItem(this.storageKeys.codeVerifier);

      window.history.replaceState({}, document.title, window.location.pathname);

      return true;
    } catch (error) {
      console.error('Error during token exchange:', error);
      return false;
    }
  }

  /**
   * Get stored access token
   * @returns {string|null} Access token or null
   */
  getAccessToken() {
    const token = localStorage.getItem(this.storageKeys.accessToken);
    const expiresAt = localStorage.getItem(this.storageKeys.expiresAt);

    if (!token || !expiresAt) {
      return null;
    }

    if (Date.now() >= parseInt(expiresAt)) {
      this.clearTokens();
      return null;
    }

    return token;
  }

  /**
   * Check if user is authenticated with valid token
   * @returns {boolean} True if authenticated
   */
  isAuthenticated() {
    return this.getAccessToken() !== null;
  }

  /**
   * Clear all stored tokens
   */
  clearTokens() {
    localStorage.removeItem(this.storageKeys.accessToken);
    localStorage.removeItem(this.storageKeys.refreshToken);
    localStorage.removeItem(this.storageKeys.expiresAt);
    localStorage.removeItem(this.storageKeys.codeVerifier);
  }

  /**
   * Logout user
   */
  logout() {
    this.clearTokens();
  }

  /**
   * Fetch currently playing track from Spotify
   * @returns {Promise<Object|null>} Track data or null
   */
  async getCurrentlyPlaying() {
    const token = this.getAccessToken();
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 204) {
        return null;
      }

      if (response.status === 401) {
        this.clearTokens();
        throw new Error('Token expired, please re-authenticate');
      }

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.item) {
        return null;
      }

      const trackData = {
        id: data.item.id,
        name: data.item.name,
        artist: data.item.artists.map(a => a.name).join(', '),
        album: data.item.album.name,
        artworkUrl: data.item.album.images[0]?.url || null,
        isPlaying: data.is_playing,
        progressMs: data.progress_ms,
        durationMs: data.item.duration_ms
      };

      // Auto-fetch audio features (optional - may fail with 403 on free tier)
      if (trackData.id) {
        try {
          const features = await this.getAudioFeatures(trackData.id);
          if (features) {
            trackData.audioFeatures = features;
            trackData.bpm = features.tempo;
          }
        } catch (err) {
          console.warn('Could not fetch audio features (BPM sync disabled):', err.message);
          trackData.audioFeatures = null;
          trackData.bpm = null;
        }
      }

      return trackData;
    } catch (error) {
      if (error.message.includes('Token expired')) {
        throw error;
      }
      console.error('Error fetching currently playing:', error);
      throw new Error('Failed to fetch currently playing track');
    }
  }

  /**
   * Get audio features for a track (BPM, energy, etc.)
   * @param {string} trackId - Spotify track ID
   * @returns {Promise<Object|null>} Audio features or null
   */
  async getAudioFeatures(trackId) {
    const token = this.getAccessToken();
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}?market=US`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 401) {
        this.clearTokens();
        throw new Error('Token expired, please re-authenticate');
      }

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Spotify audio-features error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorBody,
          trackId: trackId
        });
        throw new Error(`Spotify API error: ${response.status} - ${errorBody}`);
      }

      const data = await response.json();
      console.log('Audio features SUCCESS:', data);

      return {
        bpm: Math.round(data.tempo),
        energy: data.energy,
        danceability: data.danceability,
        valence: data.valence,
        acousticness: data.acousticness,
        instrumentalness: data.instrumentalness,
        liveness: data.liveness,
        speechiness: data.speechiness,
        key: data.key,
        mode: data.mode,
        timeSignature: data.time_signature
      };
    } catch (error) {
      console.error('Error fetching audio features:', error);
      return null;
    }
  }

  /**
   * Get playback state with more details
   * @returns {Promise<Object|null>} Playback state or null
   */
  async getPlaybackState() {
    const token = this.getAccessToken();
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 204) {
        return null;
      }

      if (response.status === 401) {
        this.clearTokens();
        throw new Error('Token expired, please re-authenticate');
      }

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching playback state:', error);
      throw error;
    }
  }
}
