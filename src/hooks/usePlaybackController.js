import { useState, useCallback, useRef, useEffect } from 'react';
import DebugLogger from '../utils/debug';

const debug = new DebugLogger('usePlaybackController');

// Constants for state management
const PLAYBACK_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  ERROR: 'error'
};

const SDK_STATES = {
  INITIALIZING: 'initializing',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error'
};

const COOLDOWNS = {
  PLAY_PAUSE: 1000, // 1 second
  SEEK: 500,        // 500ms
  VOLUME: 200       // 200ms
};

export default function usePlaybackController({
  initialTrack = null,
  initialIsPlaying = false,
  initialVolume = 100,
  spotifyPlayerRef,
  appleMusicUserToken
}) {
  // Core playback state
  const [playbackState, setPlaybackState] = useState(PLAYBACK_STATES.IDLE);
  const [currentTrack, setCurrentTrack] = useState(initialTrack);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialVolume);
  const [error, setError] = useState(null);
  const stateUpdateTimeout = useRef(null);

  // SDK state
  const [sdkStatus, setSdkStatus] = useState(SDK_STATES.INITIALIZING);

  // Refs for state management
  const isStateUpdateInProgress = useRef(false);
  const lastStateUpdate = useRef(Date.now());
  const lastActionTimes = useRef({
    playPause: 0,
    seek: 0,
    volume: 0
  });

  // Initialize Spotify SDK
  useEffect(() => {
    const initializeSpotifySDK = async () => {
      try {
        if (!window.Spotify) {
          setSdkStatus(SDK_STATES.LOADING);
          await new Promise((resolve, reject) => {
            const checkSDK = setInterval(() => {
              if (window.Spotify) {
                clearInterval(checkSDK);
                resolve();
              }
            }, 100);
            setTimeout(() => {
              clearInterval(checkSDK);
              reject(new Error('Spotify SDK failed to load'));
            }, 10000);
          });
        }
        setSdkStatus(SDK_STATES.READY);
      } catch (error) {
        debug.logError(error, 'Failed to initialize Spotify SDK');
        setSdkStatus(SDK_STATES.ERROR);
        setError('Failed to initialize Spotify player. Please refresh the page.');
      }
    };

    initializeSpotifySDK();
  }, []);

  // Track change handler
  useEffect(() => {
    if (initialTrack?.uri !== currentTrack?.uri) {
      debug.log('Track changed', { previousTrack: currentTrack, newTrack: initialTrack });
      setCurrentTrack(initialTrack);
      if (initialTrack) {
        setProgress(0);
        setDuration(initialTrack.duration_ms || 0);
        setPlaybackState(initialIsPlaying ? PLAYBACK_STATES.PLAYING : PLAYBACK_STATES.PAUSED);
      } else {
        setProgress(0);
        setDuration(0);
        setPlaybackState(PLAYBACK_STATES.IDLE);
      }
    }
  }, [initialTrack, initialIsPlaying]);

  // Debounced state update logging
  useEffect(() => {
    const now = Date.now();
    if (now - lastStateUpdate.current < 100) return;
    lastStateUpdate.current = now;

    if (stateUpdateTimeout.current) {
      clearTimeout(stateUpdateTimeout.current);
    }
    stateUpdateTimeout.current = setTimeout(() => {
      debug.log('Playback state changed', {
        playbackState,
        currentTrack,
        progress,
        duration,
        volume,
        error,
        sdkStatus
      });
    }, 100);

    return () => {
      if (stateUpdateTimeout.current) {
        clearTimeout(stateUpdateTimeout.current);
      }
    };
  }, [playbackState, currentTrack, progress, duration, volume, error, sdkStatus]);

  // Check if action is allowed based on cooldown
  const isActionAllowed = useCallback((actionType) => {
    const now = Date.now();
    const lastActionTime = lastActionTimes.current[actionType];
    const cooldown = COOLDOWNS[actionType.toUpperCase()];
    
    if (now - lastActionTime < cooldown) {
      debug.log(`${actionType} cooldown active, ignoring request`);
      return false;
    }
    
    lastActionTimes.current[actionType] = now;
    return true;
  }, []);

  // Progress update handler
  const handleProgressUpdate = useCallback((position, totalDuration) => {
    if (playbackState !== PLAYBACK_STATES.SEEKING) {
      setProgress(position);
      setDuration(totalDuration);
    }
  }, [playbackState]);

  // Play/pause handler
  const handlePlayPause = useCallback(async () => {
    if (!currentTrack) {
      debug.log('No track to play/pause');
      return;
    }

    if (!isActionAllowed('playPause')) return;
    if (isStateUpdateInProgress.current) {
      debug.log('State update already in progress, ignoring play/pause request');
      return;
    }
    if (sdkStatus !== SDK_STATES.READY) {
      setError('Spotify player is not ready. Please wait or refresh the page.');
      return;
    }

    try {
      isStateUpdateInProgress.current = true;
      setPlaybackState(PLAYBACK_STATES.LOADING);
      
      const player = spotifyPlayerRef?.current;
      if (player) {
        if (playbackState === PLAYBACK_STATES.PLAYING) {
          debug.log('Pausing track');
          await player.pause();
          setPlaybackState(PLAYBACK_STATES.PAUSED);
        } else {
          debug.log('Resuming track');
          await player.resume();
          setPlaybackState(PLAYBACK_STATES.PLAYING);
        }
      } else {
        debug.log('No player available');
        setError('Playback device not available. Please select a device.');
        setPlaybackState(PLAYBACK_STATES.ERROR);
      }
    } catch (error) {
      debug.logError(error, 'handlePlayPause');
      setError(error.message.includes('404') 
        ? 'Failed to load track. Please try again.'
        : 'Failed to control playback. Please try again.');
      setPlaybackState(PLAYBACK_STATES.ERROR);
    } finally {
      isStateUpdateInProgress.current = false;
    }
  }, [currentTrack, playbackState, spotifyPlayerRef, sdkStatus, isActionAllowed]);

  // Seek handler
  const handleSeek = useCallback(async (position) => {
    if (!currentTrack) {
      debug.log('No track to seek');
      return;
    }

    if (!isActionAllowed('seek')) return;
    if (isStateUpdateInProgress.current) {
      debug.log('State update already in progress, ignoring seek request');
      return;
    }
    if (sdkStatus !== SDK_STATES.READY) {
      setError('Spotify player is not ready. Please wait or refresh the page.');
      return;
    }

    try {
      isStateUpdateInProgress.current = true;
      setPlaybackState(PLAYBACK_STATES.SEEKING);
      
      const player = spotifyPlayerRef?.current;
      if (player) {
        debug.log('Seeking to position', { position });
        await player.seek(position);
        setProgress(position);
        setPlaybackState(PLAYBACK_STATES.PLAYING);
      } else {
        debug.log('No player available for seek');
        setError('Playback device not available. Please select a device.');
        setPlaybackState(PLAYBACK_STATES.ERROR);
      }
    } catch (error) {
      debug.logError(error, 'handleSeek');
      setError('Failed to seek. Please try again.');
      setPlaybackState(PLAYBACK_STATES.ERROR);
    } finally {
      isStateUpdateInProgress.current = false;
    }
  }, [currentTrack, spotifyPlayerRef, sdkStatus, isActionAllowed]);

  // Volume change handler
  const handleVolumeChange = useCallback(async (newVolume) => {
    if (!currentTrack) {
      debug.log('No track to adjust volume');
      return;
    }

    if (!isActionAllowed('volume')) return;
    if (isStateUpdateInProgress.current) {
      debug.log('State update already in progress, ignoring volume change request');
      return;
    }
    if (sdkStatus !== SDK_STATES.READY) {
      setError('Spotify player is not ready. Please wait or refresh the page.');
      return;
    }

    try {
      isStateUpdateInProgress.current = true;
      const player = spotifyPlayerRef?.current;
      if (player) {
        debug.log('Setting volume', { newVolume });
        await player.setVolume(newVolume / 100);
        setVolume(newVolume);
      } else {
        debug.log('No player available for volume change');
        setError('Playback device not available. Please select a device.');
      }
    } catch (error) {
      debug.logError(error, 'handleVolumeChange');
      setError('Failed to adjust volume. Please try again.');
    } finally {
      isStateUpdateInProgress.current = false;
    }
  }, [currentTrack, spotifyPlayerRef, sdkStatus, isActionAllowed]);

  // Skip handlers
  const handleSkipNext = useCallback(() => {
    debug.log('Skip next called');
    // Implement skip next logic
  }, []);
  
  const handleSkipPrevious = useCallback(() => {
    debug.log('Skip previous called');
    // Implement skip previous logic
  }, []);

  return {
    // State
    playbackState,
    currentTrack,
    progress,
    duration,
    volume,
    error,
    sdkStatus,
    
    // Setters
    setCurrentTrack,
    setProgress,
    setDuration,
    setVolume: handleVolumeChange,
    setError,
    
    // Handlers
    handlePlayPause,
    handleSeek,
    handleSkipNext,
    handleSkipPrevious,
    handleProgressUpdate,
    
    // Constants
    PLAYBACK_STATES,
    SDK_STATES
  };
} 