import { useState, useCallback, useRef, useEffect } from 'react';
import DebugLogger from '../utils/debug';

const debug = new DebugLogger('usePlaybackController');

export default function usePlaybackController({
  initialTrack = null,
  initialIsPlaying = false,
  initialVolume = 100,
  spotifyPlayerRef,
  appleMusicUserToken
}) {
  const [currentTrack, setCurrentTrack] = useState(initialTrack);
  const [isPlaying, setIsPlaying] = useState(initialIsPlaying);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialVolume);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const stateUpdateTimeout = useRef(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const isStateUpdateInProgress = useRef(false);
  const lastStateUpdate = useRef(Date.now());
  const [sdkStatus, setSdkStatus] = useState('initializing');

  // Initialize Spotify SDK
  useEffect(() => {
    const initializeSpotifySDK = async () => {
      try {
        if (!window.Spotify) {
          setSdkStatus('loading');
          // Wait for Spotify SDK to load
          await new Promise((resolve, reject) => {
            const checkSDK = setInterval(() => {
              if (window.Spotify) {
                clearInterval(checkSDK);
                resolve();
              }
            }, 100);
            // Timeout after 10 seconds
            setTimeout(() => {
              clearInterval(checkSDK);
              reject(new Error('Spotify SDK failed to load'));
            }, 10000);
          });
        }
        setSdkStatus('ready');
      } catch (error) {
        debug.logError(error, 'Failed to initialize Spotify SDK');
        setSdkStatus('error');
        setError('Failed to initialize Spotify player. Please refresh the page.');
      }
    };

    initializeSpotifySDK();
  }, []);

  // Update currentTrack when initialTrack changes
  useEffect(() => {
    if (initialTrack?.uri !== currentTrack?.uri) {
      debug.log('Track changed', { previousTrack: currentTrack, newTrack: initialTrack });
      setCurrentTrack(initialTrack);
      if (initialTrack) {
        setProgress(0);
        setDuration(initialTrack.duration_ms || 0);
      } else {
        setProgress(0);
        setDuration(0);
        setIsPlaying(false);
      }
    }
  }, [initialTrack]);

  // Update isPlaying when initialIsPlaying changes
  useEffect(() => {
    if (initialIsPlaying !== isPlaying && !isStateUpdateInProgress.current) {
      debug.log('Playback state changed', { previousState: isPlaying, newState: initialIsPlaying });
      setIsPlaying(initialIsPlaying);
    }
  }, [initialIsPlaying]);

  // Debounced state update logging
  useEffect(() => {
    const now = Date.now();
    if (now - lastStateUpdate.current < 100) {
      return;
    }
    lastStateUpdate.current = now;

    if (stateUpdateTimeout.current) {
      clearTimeout(stateUpdateTimeout.current);
    }
    stateUpdateTimeout.current = setTimeout(() => {
      debug.log('Playback state changed', {
        currentTrack,
        isPlaying,
        progress,
        duration,
        volume,
        error,
        isLoading,
        sdkStatus
      });
    }, 100);

    return () => {
      if (stateUpdateTimeout.current) {
        clearTimeout(stateUpdateTimeout.current);
      }
    };
  }, [currentTrack, isPlaying, progress, duration, volume, error, isLoading, sdkStatus]);

  // Progress update handler
  const handleProgressUpdate = useCallback((position, totalDuration) => {
    if (!isSeeking) {
      setProgress(position);
      setDuration(totalDuration);
    }
  }, [isSeeking]);

  // Play/pause handler
  const handlePlayPause = useCallback(async () => {
    if (!currentTrack) {
      debug.log('No track to play/pause');
      return;
    }

    if (isStateUpdateInProgress.current) {
      debug.log('State update already in progress, ignoring play/pause request');
      return;
    }

    if (sdkStatus !== 'ready') {
      setError('Spotify player is not ready. Please wait or refresh the page.');
      return;
    }

    try {
      isStateUpdateInProgress.current = true;
      setIsLoading(true);
      const player = spotifyPlayerRef?.current;
      if (player) {
        if (isPlaying) {
          debug.log('Pausing track');
          await player.pause();
          setIsPlaying(false);
        } else {
          debug.log('Resuming track');
          await player.resume();
          setIsPlaying(true);
        }
      } else {
        debug.log('No player available');
        setError('Playback device not available. Please select a device.');
      }
    } catch (error) {
      debug.logError(error, 'handlePlayPause');
      if (error.message.includes('404')) {
        setError('Failed to load track. Please try again.');
      } else {
        setError(error.message || 'Failed to control playback. Please try again.');
      }
    } finally {
      setIsLoading(false);
      isStateUpdateInProgress.current = false;
    }
  }, [currentTrack, isPlaying, spotifyPlayerRef, sdkStatus]);

  // Seek handler
  const handleSeek = useCallback(async (position) => {
    if (!currentTrack) {
      debug.log('No track to seek');
      return;
    }

    if (isStateUpdateInProgress.current) {
      debug.log('State update already in progress, ignoring seek request');
      return;
    }

    if (sdkStatus !== 'ready') {
      setError('Spotify player is not ready. Please wait or refresh the page.');
      return;
    }

    try {
      isStateUpdateInProgress.current = true;
      setIsLoading(true);
      const player = spotifyPlayerRef?.current;
      if (player) {
        debug.log('Seeking to position', { position });
        await player.seek(position);
        setProgress(position);
      } else {
        debug.log('No player available for seek');
        setError('Playback device not available. Please select a device.');
      }
    } catch (error) {
      debug.logError(error, 'handleSeek');
      setError('Failed to seek. Please try again.');
    } finally {
      setIsLoading(false);
      isStateUpdateInProgress.current = false;
    }
  }, [currentTrack, spotifyPlayerRef, sdkStatus]);

  // Skip next/previous handlers
  const handleSkipNext = useCallback(() => {
    debug.log('Skip next called');
    // Implement skip next logic
  }, []);
  const handleSkipPrevious = useCallback(() => {
    debug.log('Skip previous called');
    // Implement skip previous logic
  }, []);

  // Volume change handler
  const handleVolumeChange = useCallback(async (newVolume) => {
    if (!currentTrack) {
      debug.log('No track to adjust volume');
      return;
    }

    if (isStateUpdateInProgress.current) {
      debug.log('State update already in progress, ignoring volume change request');
      return;
    }

    if (sdkStatus !== 'ready') {
      setError('Spotify player is not ready. Please wait or refresh the page.');
      return;
    }

    try {
      isStateUpdateInProgress.current = true;
      setIsLoading(true);
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
      setIsLoading(false);
      isStateUpdateInProgress.current = false;
    }
  }, [currentTrack, spotifyPlayerRef, sdkStatus]);

  return {
    currentTrack,
    setCurrentTrack,
    isPlaying,
    setIsPlaying,
    progress,
    setProgress,
    duration,
    setDuration,
    volume,
    setVolume: handleVolumeChange,
    error,
    setError,
    isLoading,
    setIsLoading,
    handlePlayPause,
    handleSeek,
    handleSkipNext,
    handleSkipPrevious,
    handleProgressUpdate,
    sdkStatus
  };
} 