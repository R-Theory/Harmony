import { useState, useRef, useCallback, useEffect } from 'react';
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

  useEffect(() => {
    debug.log('Playback state changed', {
      currentTrack,
      isPlaying,
      progress,
      duration,
      volume,
      error,
      isLoading
    });
  }, [currentTrack, isPlaying, progress, duration, volume, error, isLoading]);

  // Progress update handler
  const handleProgressUpdate = useCallback((position, totalDuration) => {
    debug.log('Progress updated', { position, totalDuration });
    setProgress(position);
    setDuration(totalDuration);
  }, []);

  // Play/pause handler
  const handlePlayPause = useCallback(() => {
    debug.log('Play/Pause toggled');
    setIsPlaying((prev) => !prev);
  }, []);

  // Seek handler
  const handleSeek = useCallback(async (position) => {
    debug.log('Seek called', { position });
    setProgress(position);
    // Add Spotify/Apple seek logic here if needed
  }, []);

  // Skip next/previous handlers (to be implemented as needed)
  const handleSkipNext = useCallback(() => {
    debug.log('Skip next called');
    // Implement skip next logic
  }, []);
  const handleSkipPrevious = useCallback(() => {
    debug.log('Skip previous called');
    // Implement skip previous logic
  }, []);

  // Volume change handler
  const handleVolumeChange = useCallback((newVolume) => {
    debug.log('Volume changed', { newVolume });
    setVolume(newVolume);
    // Add Spotify/Apple volume logic here if needed
  }, []);

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