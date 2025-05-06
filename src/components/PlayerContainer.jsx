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
  const handlePlayPause = useCallback(async () => {
    if (!currentTrack) {
      debug.log('[PlayerContainer] No track to play/pause');
      return;
    }
    debug.log('[PlayerContainer] Play/pause clicked', { currentTrack, isPlaying });
    
    try {
      const player = spotifyPlayerRef?.current;
      if (!player) {
        debug.logError('[PlayerContainer] No Spotify player instance found');
        throw new Error('No Spotify player instance');
      }

      // Get current state
      debug.log('[PlayerContainer] Getting current player state');
      const state = await player.getCurrentState();
      debug.log('[PlayerContainer] Current player state:', state);

      if (!state || state.paused) {
        debug.log('[PlayerContainer] Attempting to resume playback');
        await player.resume();
        debug.log('[PlayerContainer] Playback resumed successfully');
      } else {
        debug.log('[PlayerContainer] Attempting to pause playback');
        await player.pause();
        debug.log('[PlayerContainer] Playback paused successfully');
      }

      // Update UI state
      setIsPlaying(!isPlaying);
      debug.log('[PlayerContainer] UI state updated', { newIsPlaying: !isPlaying });
    } catch (error) {
      debug.logError('[PlayerContainer] Error in play/pause:', error);
      // If we get a 404, try to refresh the token
      if (error.message?.includes('404')) {
        const accessToken = localStorage.getItem('spotify_access_token');
        if (accessToken) {
          debug.log('[PlayerContainer] Refreshing Spotify token due to 404 error');
          // Force token refresh by clearing it
          localStorage.removeItem('spotify_access_token');
          window.location.reload();
          return;
        }
      }
    }
  }, [currentTrack, isPlaying, setIsPlaying, spotifyPlayerRef]);

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
        progress={0}
        duration={currentTrack?.duration_ms || 0}
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