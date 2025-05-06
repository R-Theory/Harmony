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

  // Update currentTrack when initialTrack changes
  useEffect(() => {
    debug.log('Track changed', { previousTrack: currentTrack, newTrack: initialTrack });
    if (initialTrack?.uri !== currentTrack?.uri) {
      setCurrentTrack(initialTrack);
      // Reset playback state when track changes
      if (initialTrack) {
        setProgress(0);
        setDuration(initialTrack.duration_ms || 0);
        // Don't automatically set isPlaying - let the Spotify player state handle it
      } else {
        setProgress(0);
        setDuration(0);
        setIsPlaying(false);
      }
    }
  }, [initialTrack]);

  // Update isPlaying when initialIsPlaying changes
  useEffect(() => {
    debug.log('Playback state changed', { previousState: isPlaying, newState: initialIsPlaying });
    if (initialIsPlaying !== isPlaying && !isStateUpdateInProgress.current) {
      setIsPlaying(initialIsPlaying);
    }
  }, [initialIsPlaying]);

  // Debounced state update logging
  useEffect(() => {
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
        isLoading
      });
    }, 100);

    return () => {
      if (stateUpdateTimeout.current) {
        clearTimeout(stateUpdateTimeout.current);
      }
    };
  }, [currentTrack, isPlaying, progress, duration, volume, error, isLoading]);

  // Progress update handler
  const handleProgressUpdate = useCallback((position, totalDuration) => {
    debug.log('Progress updated', { position, totalDuration });
    if (!isSeeking) {
      setProgress(position);
      setDuration(totalDuration);
    }
  }, [isSeeking]);

  // Play/pause handler
  const handlePlayPause = useCallback(async () => {
    debug.log('Play/Pause toggled', { currentTrack, isPlaying });
    if (!currentTrack) {
      debug.log('No track to play/pause, setting isPlaying to false');
      setIsPlaying(false);
      return;
    }

    if (isStateUpdateInProgress.current) {
      debug.log('State update already in progress, ignoring play/pause request');
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
        setError('Playback device not available');
      }
    } catch (error) {
      debug.logError(error, 'handlePlayPause');
      setError(error.message);
      // Don't update isPlaying state on error
    } finally {
      setIsLoading(false);
      isStateUpdateInProgress.current = false;
    }
  }, [currentTrack, isPlaying, spotifyPlayerRef]);

  // Seek handler
  const handleSeek = useCallback(async (position) => {
    debug.log('Seek called', { position });
    if (!currentTrack) {
      debug.log('No track to seek');
      return;
    }

    if (isStateUpdateInProgress.current) {
      debug.log('State update already in progress, ignoring seek request');
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
        setError('Playback device not available');
      }
    } catch (error) {
      debug.logError(error, 'handleSeek');
      setError(error.message);
    } finally {
      setIsLoading(false);
      isStateUpdateInProgress.current = false;
    }
  }, [currentTrack, spotifyPlayerRef]);

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
    debug.log('Volume changed', { newVolume });
    if (!currentTrack) {
      debug.log('No track to adjust volume');
      return;
    }

    if (isStateUpdateInProgress.current) {
      debug.log('State update already in progress, ignoring volume change request');
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
        setError('Playback device not available');
      }
    } catch (error) {
      debug.logError(error, 'handleVolumeChange');
      setError(error.message);
    } finally {
      setIsLoading(false);
      isStateUpdateInProgress.current = false;
    }
  }, [currentTrack, spotifyPlayerRef]);

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
    handleProgressUpdate
  };
} 