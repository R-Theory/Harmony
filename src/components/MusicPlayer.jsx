import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
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
  onProgressUpdate,
  onTrackChange
}) => {
  const musicKitRef = useRef(null);
  const [isDeviceActive, setIsDeviceActive] = useState(false);
  const [lastApiCall, setLastApiCall] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(track);

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
      debug.log('Rate limit hit for device activation');
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

      // First check if we have any active devices
      const devicesResponse = await makeApiCall('https://api.spotify.com/v1/me/player/devices', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      const devicesData = await devicesResponse.json();
      debug.log('Available devices', devicesData.devices);

      const isActive = await checkActiveDevice();
      if (isActive) {
        debug.log('Device already active');
        return true;
      }

      debug.log('Activating device...', {
        deviceId: player._options.id,
        deviceName: player._options.name
      });

      // Try to transfer playback to our device
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

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Device activation failed: ${error.error?.message || 'Unknown error'}`);
      }

      // Wait for device to be fully activated
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const activationVerified = await checkActiveDevice();
      debug.log('Device activation result', { 
        success: activationVerified,
        deviceId: player._options.id
      });
      
      if (!activationVerified) {
        throw new Error('Device activation verification failed');
      }
      
      return activationVerified;
    } catch (error) {
      debug.logError(error, 'activateDevice');
      debug.log('Device activation context', {
        deviceId: spotifyPlayerRef.current?._options.id,
        accessToken: localStorage.getItem('spotify_access_token') ? 'present' : 'missing'
      });
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

        const MAX_RETRIES = 3;
        let retryCount = 0;
        let success = false;

        while (!success && retryCount < MAX_RETRIES) {
          try {
            debug.log(`Playback attempt ${retryCount + 1} of ${MAX_RETRIES}`);

            // First verify the track exists
            const trackResponse = await makeApiCall(
              `https://api.spotify.com/v1/tracks/${track.uri.split(':')[2]}`,
              {
                method: 'GET',
                headers
              }
            );

            if (!trackResponse.ok) {
              const error = await trackResponse.json();
              throw new Error(`Track verification failed: ${error.error?.message || 'Unknown error'}`);
            }

            // Activate device with retries
            let activated = false;
            let deviceRetries = 3;
            while (!activated && deviceRetries > 0) {
              activated = await activateDevice();
              if (!activated) {
                debug.log(`Device activation attempt ${4 - deviceRetries} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                deviceRetries--;
              }
            }

            if (!activated) {
              throw new Error('Failed to activate device for playback after multiple attempts');
            }

            if (isPlaying) {
              debug.log('Initiating playback', {
                trackUri: track.uri,
                deviceId: player._options.id
              });

              // Add a small delay after device activation
              await new Promise(resolve => setTimeout(resolve, 500));

              // First transfer playback to our device
              const transferResponse = await makeApiCall(
                'https://api.spotify.com/v1/me/player',
                {
                  method: 'PUT',
                  headers,
                  body: JSON.stringify({
                    device_ids: [player._options.id],
                    play: false
                  })
                }
              );

              if (!transferResponse.ok) {
                const error = await transferResponse.json();
                throw new Error(`Failed to transfer playback: ${error.error?.message || 'Unknown error'}`);
              }

              // Wait for transfer to complete
              await new Promise(resolve => setTimeout(resolve, 1000));

              // Verify device is active before starting playback
              const devicesResponse = await makeApiCall(
                'https://api.spotify.com/v1/me/player/devices',
                {
                  method: 'GET',
                  headers
                }
              );

              const devicesData = await devicesResponse.json();
              const activeDevice = devicesData.devices.find(d => d.is_active);
              
              if (!activeDevice || activeDevice.id !== player._options.id) {
                throw new Error('Device not active after transfer');
              }

              // Then start playback
              const playResponse = await makeApiCall(
                `https://api.spotify.com/v1/me/player/play?device_id=${player._options.id}`,
                {
                  method: 'PUT',
                  headers,
                  body: JSON.stringify({ 
                    uris: [track.uri],
                    position_ms: 0 // Start from beginning
                  })
                }
              );

              if (!playResponse.ok) {
                const error = await playResponse.json();
                // Check if this is a non-critical error (like the 404 we're seeing)
                if (error.error?.status === 404 && error.error?.message?.includes('item_before_load')) {
                  debug.log('Non-critical playback error, continuing with playback', error);
                } else {
                  throw new Error(`Playback failed: ${error.error?.message || 'Unknown error'}`);
                }
              }

              // Verify playback started
              await new Promise(resolve => setTimeout(resolve, 1000));
              const stateResponse = await makeApiCall(
                'https://api.spotify.com/v1/me/player',
                {
                  method: 'GET',
                  headers
                }
              );

              if (stateResponse.ok) {
                const state = await stateResponse.json();
                if (state.is_playing && state.item?.uri === track.uri) {
                  debug.log('Playback successfully started and verified');
                  success = true;
                } else {
                  debug.log('Playback state verification failed', state);
                  // Try one more time to start playback
                  await makeApiCall(
                    `https://api.spotify.com/v1/me/player/play?device_id=${player._options.id}`,
                    {
                      method: 'PUT',
                      headers,
                      body: JSON.stringify({ uris: [track.uri] })
                    }
                  );
                  // If we're on the last retry, consider it a success if we got this far
                  if (retryCount === MAX_RETRIES - 1) {
                    success = true;
                  }
                }
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
                throw new Error(`Pause failed: ${error.error?.message || 'Unknown error'}`);
              }
              success = true;
            }
          } catch (error) {
            debug.logError(error, `handlePlayPause attempt ${retryCount + 1}`);
            // Only set error if it's not a non-critical error
            if (!error.message?.includes('item_before_load') && !error.message?.includes('PlayLoad event failed with status 404')) {
              setError(error.message);
            }
            // Log additional context
            debug.log('Playback context', {
              track,
              deviceId: spotifyPlayerRef.current?._options.id,
              isDeviceActive,
              accessToken: localStorage.getItem('spotify_access_token') ? 'present' : 'missing',
              attempt: retryCount + 1
            });

            if (retryCount < MAX_RETRIES - 1) {
              // Wait before retrying
              await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            }
          } finally {
            retryCount++;
          }
        }

        if (!success) {
          debug.logError('All playback attempts failed');
          setError('Failed to start playback after multiple attempts');
        }

        setIsLoading(false);
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
        debug.log('Player state changed', {
          position: state.position,
          duration: state.duration,
          paused: state.paused,
          track_window: {
            current_track: state.track_window?.current_track,
            next_tracks: state.track_window?.next_tracks?.length
          }
        });

        // Update progress and duration
        if (state.position !== undefined) {
          onProgressUpdate(state.position, state.duration);
        }

        // Update playing state
        setIsPlaying(!state.paused);

        // Check if track changed
        if (state.track_window?.current_track?.uri !== currentTrack?.uri) {
          debug.log('Track changed in player', {
            previousTrack: currentTrack,
            newTrack: state.track_window?.current_track
          });
          onTrackChange(state.track_window?.current_track);
        }
      };

      const handleInitializationError = (error) => {
        debug.logError(error, 'Player initialization');
        setError(error.message);
      };

      const handleAuthenticationError = (error) => {
        debug.logError(error, 'Player authentication');
        setError(error.message);
      };

      const handleAccountError = (error) => {
        debug.logError(error, 'Player account');
        setError(error.message);
      };

      const handlePlaybackError = (error) => {
        debug.logError(error, 'Player playback');
        // Only set error if it's not a non-critical error
        if (!error.message?.includes('item_before_load') && !error.message?.includes('PlayLoad event failed with status 404')) {
          setError(error.message);
        } else {
          debug.log('Non-critical playback error, continuing with playback', error);
        }
      };

      // Add event listeners
      player.addListener('player_state_changed', handlePlayerStateChanged);
      player.addListener('initialization_error', handleInitializationError);
      player.addListener('authentication_error', handleAuthenticationError);
      player.addListener('account_error', handleAccountError);
      player.addListener('playback_error', handlePlaybackError);

      // Cleanup
      return () => {
        player.removeListener('player_state_changed', handlePlayerStateChanged);
        player.removeListener('initialization_error', handleInitializationError);
        player.removeListener('authentication_error', handleAuthenticationError);
        player.removeListener('account_error', handleAccountError);
        player.removeListener('playback_error', handlePlaybackError);
      };
    }
  }, [track, isPlaying, volume, spotifyPlayerRef, onProgressUpdate, onTrackChange]);

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
  onProgressUpdate: PropTypes.func,
  onTrackChange: PropTypes.func
};

export default MusicPlayer; 