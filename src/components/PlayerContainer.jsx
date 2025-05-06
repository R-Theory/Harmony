import React, { useMemo, useCallback, useEffect } from 'react';
import PlayerBar from './PlayerBar';
import MusicPlayer from './MusicPlayer';
import usePlaybackController from '../hooks/usePlaybackController';
import DebugLogger from '../utils/debug';
import { Box } from '@mui/material';

const debug = new DebugLogger('PlayerContainer');

export default function PlayerContainer({
  currentTrack,
  selectedPlaybackDevice,
  isPlaying,
  setIsPlaying,
  onSkipNext,
  onSkipPrevious,
  volume,
  setVolume,
  spotifyPlayerRef,
  appleMusicUserToken,
  hasSpotify,
  hasAppleMusic
}) {
  // Memoize the player state to prevent unnecessary re-renders
  const playerState = useMemo(() => {
    if (!currentTrack) return 'idle';
    return isPlaying ? 'playing' : 'paused';
  }, [currentTrack, isPlaying]);

  // Memoize the play/pause handler
  const handlePlayPause = useCallback(() => {
    if (!currentTrack) return;
    debug.log('[PlayerContainer] Play/pause clicked', { currentTrack, isPlaying });
    setIsPlaying(!isPlaying);
  }, [currentTrack, isPlaying, setIsPlaying]);

  // Memoize the volume handler
  const handleVolumeChange = useCallback((newVolume) => {
    setVolume(newVolume);
  }, [setVolume]);

  // Memoize the skip handlers
  const handleSkipNext = useCallback(() => {
    if (onSkipNext) onSkipNext();
  }, [onSkipNext]);

  const handleSkipPrevious = useCallback(() => {
    if (onSkipPrevious) onSkipPrevious();
  }, [onSkipPrevious]);

  // Only log render when state actually changes
  useEffect(() => {
    debug.log('[PlayerContainer] State changed', {
      track: currentTrack?.uri,
      playbackState: playerState,
      volume,
      selectedPlaybackDevice: selectedPlaybackDevice?.name
    });
  }, [currentTrack?.uri, playerState, volume, selectedPlaybackDevice?.name]);

  return (
    <Box sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
      <PlayerBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onSkipNext={handleSkipNext}
        onSkipPrevious={handleSkipPrevious}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        selectedPlaybackDevice={selectedPlaybackDevice}
      />
      <MusicPlayer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        volume={volume}
        setVolume={setVolume}
        spotifyPlayerRef={spotifyPlayerRef}
        appleMusicUserToken={appleMusicUserToken}
        hasSpotify={hasSpotify}
        hasAppleMusic={hasAppleMusic}
      />
    </Box>
  );
} 