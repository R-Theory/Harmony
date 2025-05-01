import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaVolumeUp, FaVolumeMute } from 'react-icons/fa';
import DebugLogger from '../utils/debug';

const debug = new DebugLogger('MusicPlayer');

/**
 * Unified MusicPlayer component for Spotify and Apple Music playback.
 *
 * Props:
 * - track: { source: 'spotify'|'appleMusic', uri, appleMusicId, ... }
 * - isPlaying: boolean
 * - onPlayPause: function
 * - onSkipNext: function
 * - onSkipPrevious: function
 * - volume: number (0-100)
 * - onVolumeChange: function
 * - onProgressUpdate: function(position, duration) - Callback for progress updates
 */
const MusicPlayer = ({
  track,
  isPlaying,
  onPlayPause,
  onSkipNext,
  onSkipPrevious,
  volume,
  onVolumeChange,
  spotifyPlayerRef,
  appleMusicUserToken,
  onProgressUpdate
}) => {
  const musicKitRef = useRef(null);
  const [isDeviceActive, setIsDeviceActive] = useState(false);
  const [lastApiCall, setLastApiCall] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Rate limiting configuration based on Spotify API limits
  const RATE_LIMIT = {
    // Player endpoints (play, pause, seek, etc.) - 50 requests per second
    playerControl: 20, // 20ms between requests (50 requests per second)
    
    // Device endpoints (transfer playback, get devices) - 20 requests per second
    deviceControl: 50, // 50ms between requests (20 requests per second)
    
    // Volume control - 20 requests per second
    volumeControl: 50, // 50ms between requests (20 requests per second)
    
    // Queue endpoints - 20 requests per second
    queueControl: 50, // 50ms between requests (20 requests per second)
    
    // General endpoints (get player state, etc.) - 20 requests per second
    general: 50, // 50ms between requests (20 requests per second)
  };

  const checkRateLimit = (endpoint) => {
    const now = Date.now();
    const lastCall = lastApiCall[endpoint] || 0;
    const timeSinceLastCall = now - lastCall;
    const limit = RATE_LIMIT[endpoint] || RATE_LIMIT.general;

    if (timeSinceLastCall < limit) {
      debug.log(`Rate limit hit for ${endpoint}`, {
        timeSinceLastCall,
        limit,
        waitTime: limit - timeSinceLastCall,
        endpoint
      });
      return false;
    }
    return true;
  };

  const updateLastApiCall = (endpoint) => {
    setLastApiCall(prev => ({
      ...prev,
      [endpoint]: Date.now()
    }));
  };

  const makeApiCall = async (url, options) => {
    // Extract endpoint from URL for rate limiting
    const endpoint = url.split('/').pop().split('?')[0];
    let rateLimitCategory = 'general';
    
    // Categorize endpoints for rate limiting
    if (endpoint.includes('play') || endpoint.includes('pause') || endpoint.includes('seek')) {
      rateLimitCategory = 'playerControl';
    } else if (endpoint.includes('device')) {
      rateLimitCategory = 'deviceControl';
    } else if (endpoint.includes('volume')) {
      rateLimitCategory = 'volumeControl';
    } else if (endpoint.includes('queue')) {
      rateLimitCategory = 'queueControl';
    }

    if (!checkRateLimit(rateLimitCategory)) {
      throw new Error(`Rate limit exceeded for ${endpoint} (${rateLimitCategory})`);
    }

    debug.logApiCall(url, options.method);
    const response = await fetch(url, options);
    updateLastApiCall(rateLimitCategory);

    // Handle Spotify's rate limit headers
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After')) || 1;
      debug.log('Spotify rate limit hit', {
        retryAfter,
        endpoint,
        rateLimitCategory
      });
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      return makeApiCall(url, options); // Retry the call
    }

    if (!response.ok) {
      const error = await response.json();
      debug.logError(error, `API call to ${url}`);
      throw new Error(error.error?.message || 'API call failed');
    }

    return response;
  };

  const checkActiveDevice = async () => {
    try {
      const accessToken = localStorage.getItem('spotify_access_token');
      if (!accessToken) {
        debug.logError('No access token found');
        return false;
      }

      const response = await makeApiCall('https://api.spotify.com/v1/me/player/devices', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const data = await response.json();
      const activeDevice = data.devices.find(device => device.is_active);
      
      debug.log('Device check result', {
        activeDevice,
        totalDevices: data.devices.length
      });

      return activeDevice?.id === spotifyPlayerRef.current?._options.id;
    } catch (error) {
      debug.logError(error, 'checkActiveDevice');
      return false;
    }
  };

  const activateDevice = async () => {
    if (!checkRateLimit('deviceControl')) {
      return false;
    }

    try {
      const accessToken = localStorage.getItem('spotify_access_token');
      if (!accessToken) {
        debug.logError('No access token found');
        return false;
      }

      const player = spotifyPlayerRef.current;
      if (!player) {
        debug.logError('No Spotify player instance');
        return false;
      }

      const isActive = await checkActiveDevice();
      if (isActive) {
        debug.log('Device already active');
        return true;
      }

      debug.log('Activating device...');
      const response = await makeApiCall('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          device_ids: [player._options.id],
          play: false
        })
      });

      // Wait for device to be fully activated
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const activationVerified = await checkActiveDevice();
      debug.log('Device activation result', { success: activationVerified });
      
      return activationVerified;
    } catch (error) {
      debug.logError(error, 'activateDevice');
      return false;
    }
  };

  // Handle Spotify playback
  useEffect(() => {
    if (track?.source === 'spotify' && window.Spotify && spotifyPlayerRef?.current) {
      const player = spotifyPlayerRef.current;
      const accessToken = localStorage.getItem('spotify_access_token');

      if (!accessToken) {
        debug.logError('No access token found');
        return;
      }

      const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      };

      const handlePlayPause = async () => {
        if (isLoading) {
          debug.log('Playback operation already in progress');
          return;
        }

        setIsLoading(true);
        setError(null);

        try {
          const activated = await activateDevice();
          if (!activated) {
            throw new Error('Failed to activate device for playback');
          }

          if (isPlaying) {
            debug.log('Initiating playback');
            const playResponse = await makeApiCall(
              `https://api.spotify.com/v1/me/player/play?device_id=${player._options.id}`,
              {
                method: 'PUT',
                headers,
                body: JSON.stringify({ uris: [track.uri] })
              }
            );

            if (!playResponse.ok) {
              const error = await playResponse.json();
              throw new Error(error.error?.message || 'Failed to start playback');
            }
          } else {
            debug.log('Pausing playback');
            const pauseResponse = await makeApiCall(
              `https://api.spotify.com/v1/me/player/pause?device_id=${player._options.id}`,
              {
                method: 'PUT',
                headers
              }
            );

            if (!pauseResponse.ok) {
              const error = await pauseResponse.json();
              throw new Error(error.error?.message || 'Failed to pause playback');
            }
          }
        } catch (error) {
          debug.logError(error, 'handlePlayPause');
          setError(error.message);
        } finally {
          setIsLoading(false);
        }
      };

      // Set volume with rate limiting
      const setVolume = async () => {
        if (!checkRateLimit('volumeControl')) return;
        
        try {
          debug.log('Setting volume', { volume });
          await makeApiCall(
            `https://api.spotify.com/v1/me/player/volume?volume_percent=${volume}&device_id=${player._options.id}`,
            {
              method: 'PUT',
              headers
            }
          );
        } catch (error) {
          debug.logError(error, 'setVolume');
        }
      };

      // Handle track changes and playback state
      if (track.uri) {
        handlePlayPause();
      }

      // Add playback state listener for progress updates
      const handlePlayerStateChanged = (state) => {
        if (!state) return;

        debug.log('Player state changed', {
          position: state.position,
          duration: state.duration,
          isPlaying: !state.paused,
          track: state.track_window?.current_track
        });
        
        if (onProgressUpdate) {
          onProgressUpdate(state.position, state.duration);
        }
      };

      player.addListener('player_state_changed', handlePlayerStateChanged);

      // Add error listeners
      player.addListener('initialization_error', (error) => {
        debug.logError(error, 'Spotify player initialization error');
        setError('Failed to initialize Spotify player');
      });

      player.addListener('authentication_error', (error) => {
        debug.logError(error, 'Spotify authentication error');
        setError('Spotify authentication failed');
      });

      player.addListener('account_error', (error) => {
        debug.logError(error, 'Spotify account error');
        setError('Spotify account error');
      });

      player.addListener('playback_error', (error) => {
        debug.logError(error, 'Spotify playback error');
        setError('Playback error occurred');
      });

      return () => {
        player.removeListener('player_state_changed', handlePlayerStateChanged);
        player.removeListener('initialization_error');
        player.removeListener('authentication_error');
        player.removeListener('account_error');
        player.removeListener('playback_error');
      };
    }
  }, [track, isPlaying, volume, spotifyPlayerRef, onProgressUpdate]);

  // Handle Apple Music playback
  useEffect(() => {
    if (track?.source === 'appleMusic' && window.MusicKit && appleMusicUserToken) {
      const music = window.MusicKit.getInstance();
      musicKitRef.current = music;
      if (track.appleMusicId) {
        music.setQueue({ song: track.appleMusicId }).then(() => {
          if (isPlaying) music.play();
        });
      }
      if (isPlaying) {
        music.play();
      } else {
        music.pause();
      }
      music.volume = volume / 100;

      // Add playback time observer for progress updates
      const handlePlaybackTimeDidChange = (event) => {
        if (onProgressUpdate) {
          onProgressUpdate(event.currentPlaybackTime * 1000, event.duration * 1000);
        }
      };

      music.addEventListener('playbackTimeDidChange', handlePlaybackTimeDidChange);

      // Cleanup
      return () => {
        music.removeEventListener('playbackTimeDidChange', handlePlaybackTimeDidChange);
      };
    }
  }, [track, isPlaying, volume, appleMusicUserToken, onProgressUpdate]);

  // Unified controls (for UI, not actual playback logic)
  return null; // This component does not render UI directly
};

MusicPlayer.propTypes = {
  track: PropTypes.object,
  isPlaying: PropTypes.bool.isRequired,
  onPlayPause: PropTypes.func,
  onSkipNext: PropTypes.func,
  onSkipPrevious: PropTypes.func,
  volume: PropTypes.number.isRequired,
  onVolumeChange: PropTypes.func,
  spotifyPlayerRef: PropTypes.object,
  appleMusicUserToken: PropTypes.string,
  onProgressUpdate: PropTypes.func
};

export default MusicPlayer; 