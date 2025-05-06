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
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlayingState, setIsPlaying] = useState(isPlaying);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const lastCommandTime = useRef(0);
  const COMMAND_IGNORE_WINDOW = 1200; // ms

  // Rate limiting configuration based on Spotify API limits
  const RATE_LIMIT = 1000; // 1 second between API calls

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
        debug.log('No Spotify access token found');
        return;
      }

      const handlePlayerStateChanged = async (state) => {
        if (!state) return;

        // Feedback loop protection: ignore SDK state changes caused by our own command
        if (Date.now() - lastCommandTime.current < COMMAND_IGNORE_WINDOW) {
          return;
        }

        // Update playback state
        const isPlaying = !state.paused;
        setIsPlaying(isPlaying);

        // Update progress
        setProgress(state.position);
        setDuration(state.duration);

        // Handle track changes
        if (state.track_window?.current_track) {
          const newTrack = {
            ...state.track_window.current_track,
            title: state.track_window.current_track.name,
            artist: state.track_window.current_track.artists.map(a => a.name).join(', '),
            albumArt: state.track_window.current_track.album?.images?.[0]?.url,
            uri: state.track_window.current_track.uri,
            duration: state.track_window.current_track.duration_ms
          };

          if (newTrack.uri !== currentTrack?.uri) {
            debug.log('Track changed in player', {
              previousTrack: currentTrack?.uri,
              newTrack: newTrack.uri
            });

            setCurrentTrack(newTrack);
            if (onTrackChange) {
              onTrackChange(newTrack);
            }
          }
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
        // Only log non-critical errors
        if (!error.message?.includes('item_before_load') && !error.message?.includes('PlayLoad event failed with status 404')) {
          debug.logError(error, 'Player playback');
          setError(error.message);
        }
      };

      // Add event listeners
      player.addListener('player_state_changed', handlePlayerStateChanged);
      player.addListener('initialization_error', handleInitializationError);
      player.addListener('authentication_error', handleAuthenticationError);
      player.addListener('account_error', handleAccountError);
      player.addListener('playback_error', handlePlaybackError);

      // Get initial state
      player.getCurrentState().then(state => {
        if (state) {
          handlePlayerStateChanged(state);
        }
      });

      // Cleanup
      return () => {
        player.removeListener('player_state_changed', handlePlayerStateChanged);
        player.removeListener('initialization_error', handleInitializationError);
        player.removeListener('authentication_error', handleAuthenticationError);
        player.removeListener('account_error', handleAccountError);
        player.removeListener('playback_error', handlePlaybackError);
      };
    }
  }, [track, spotifyPlayerRef, onTrackChange]);

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

  // Handle track changes
  useEffect(() => {
    const loadTrack = async () => {
      if (!track || !spotifyPlayerRef.current) return;

      try {
        setIsLoading(true);
        setError(null);

        // Ensure device is active
        const isActive = await checkActiveDevice();
        if (!isActive) {
          debug.log('Device not active, activating...');
          const activated = await activateDevice();
          if (!activated) {
            throw new Error('Failed to activate device');
          }
        }

        debug.log('Loading new track', { track });
        await spotifyPlayerRef.current.load(track.uri);
        
        // If we should be playing, start playback
        if (isPlaying) {
          debug.log('Starting playback for new track');
          await spotifyPlayerRef.current.resume();
        }
      } catch (error) {
        debug.logError(error, 'Error loading track');
        setError(error.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadTrack();
  }, [track?.uri]); // Only reload when the track URI changes

  // Handle play/pause
  const handlePlayPause = async () => {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const player = spotifyPlayerRef.current;
      if (!player) {
        throw new Error('No Spotify player instance');
      }

      // Ensure device is active
      const isActive = await checkActiveDevice();
      if (!isActive) {
        debug.log('Device not active, activating...');
        const activated = await activateDevice();
        if (!activated) {
          throw new Error('Failed to activate device');
        }
      }

      // Get current state
      const state = await player.getCurrentState();
      
      // If we have a track but it's not loaded, load it first
      if (track && (!state || state.track_window?.current_track?.uri !== track.uri)) {
        debug.log('Loading track before playing', { track });
        try {
          await player.load(track.uri);
          // Wait a bit for the track to load
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          debug.logError(error, 'Error loading track');
          // If we get a 404, try to refresh the token
          if (error.message?.includes('404')) {
            const accessToken = localStorage.getItem('spotify_access_token');
            if (accessToken) {
              debug.log('Refreshing Spotify token');
              // Force token refresh by clearing it
              localStorage.removeItem('spotify_access_token');
              window.location.reload();
              return;
            }
          }
          throw error;
        }
      }

      lastCommandTime.current = Date.now();

      if (!state || state.paused) {
        debug.log('Resuming playback');
        try {
          await player.resume();
          // Wait a bit for playback to start
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          debug.logError(error, 'Error resuming playback');
          // If we get a 404, try to refresh the token
          if (error.message?.includes('404')) {
            const accessToken = localStorage.getItem('spotify_access_token');
            if (accessToken) {
              debug.log('Refreshing Spotify token');
              // Force token refresh by clearing it
              localStorage.removeItem('spotify_access_token');
              window.location.reload();
              return;
            }
          }
          throw error;
        }
      } else {
        debug.log('Pausing playback');
        await player.pause();
      }

      // Update local state
      onPlayPause(!state?.paused);
    } catch (error) {
      debug.logError(error, 'Error in play/pause');
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle skip next
  const handleSkipNext = async () => {
    if (isLoading) {
      debug.log('Skip operation already in progress');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const player = spotifyPlayerRef.current;
      if (!player) {
        throw new Error('No Spotify player instance');
      }

      debug.log('Skipping to next track');
      await player.nextTrack();
    } catch (error) {
      debug.logError(error, 'handleSkipNext');
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle skip previous
  const handleSkipPrevious = async () => {
    if (isLoading) {
      debug.log('Skip operation already in progress');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const player = spotifyPlayerRef.current;
      if (!player) {
        throw new Error('No Spotify player instance');
      }

      debug.log('Skipping to previous track');
      await player.previousTrack();
    } catch (error) {
      debug.logError(error, 'handleSkipPrevious');
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Expose controls to parent component
  useEffect(() => {
    if (onPlayPause) {
      onPlayPause(handlePlayPause);
    }
    if (onSkipNext) {
      onSkipNext(handleSkipNext);
    }
    if (onSkipPrevious) {
      onSkipPrevious(handleSkipPrevious);
    }
  }, [onPlayPause, onSkipNext, onSkipPrevious]);

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

MusicPlayer.defaultProps = {
  onTrackChange: () => {},
};

export default MusicPlayer; 