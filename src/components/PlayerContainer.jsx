import React from 'react';
import PlayerBar from './PlayerBar';
import MusicPlayer from './MusicPlayer';
import usePlaybackController from '../hooks/usePlaybackController';
import DebugLogger from '../utils/debug';

const debug = new DebugLogger('PlayerContainer');

const PlayerContainer = ({
  currentTrack: initialTrack,
  selectedPlaybackDevice,
  isPlaying: initialIsPlaying,
  setIsPlaying: parentSetIsPlaying,
  onSkipNext,
  onSkipPrevious,
  volume: initialVolume,
  setVolume: parentSetVolume,
  spotifyPlayerRef,
  appleMusicUserToken,
  hasSpotify,
  hasAppleMusic
}) => {
  const playback = usePlaybackController({
    initialTrack,
    initialIsPlaying,
    initialVolume,
    spotifyPlayerRef,
    appleMusicUserToken
  });

  React.useEffect(() => {
    debug.log('PlayerContainer rendered', {
      track: playback.currentTrack,
      isPlaying: playback.isPlaying,
      volume: playback.volume,
      selectedPlaybackDevice
    });
  }, [playback.currentTrack, playback.isPlaying, playback.volume, selectedPlaybackDevice]);

  // Sync with parent state
  React.useEffect(() => {
    if (parentSetIsPlaying) parentSetIsPlaying(playback.isPlaying);
  }, [playback.isPlaying, parentSetIsPlaying]);

  React.useEffect(() => {
    if (parentSetVolume) parentSetVolume(playback.volume);
  }, [playback.volume, parentSetVolume]);

  // Update playback state when track changes
  React.useEffect(() => {
    if (initialTrack) {
      playback.setCurrentTrack(initialTrack);
    }
  }, [initialTrack]);

  // Update playback state when isPlaying changes
  React.useEffect(() => {
    if (initialIsPlaying !== undefined) {
      playback.setIsPlaying(initialIsPlaying);
    }
  }, [initialIsPlaying]);

  return (
    <>
      <PlayerBar
        currentTrack={playback.currentTrack}
        selectedPlaybackDevice={selectedPlaybackDevice}
        isPlaying={playback.isPlaying}
        onPlayPause={playback.handlePlayPause}
        onSkipNext={onSkipNext}
        onSkipPrevious={onSkipPrevious}
        volume={playback.volume}
        onVolumeChange={(e, v) => playback.setVolume(v)}
        onSeek={playback.handleSeek}
        progress={playback.progress}
        duration={playback.duration}
      />
      <MusicPlayer
        track={playback.currentTrack}
        isPlaying={playback.isPlaying}
        onPlayPause={playback.handlePlayPause}
        onSkipNext={onSkipNext}
        onSkipPrevious={onSkipPrevious}
        volume={playback.volume}
        onVolumeChange={(e, v) => playback.setVolume(v)}
        spotifyPlayerRef={spotifyPlayerRef}
        appleMusicUserToken={appleMusicUserToken}
        onProgressUpdate={playback.handleProgressUpdate}
        progress={playback.progress}
        duration={playback.duration}
      />
    </>
  );
};

export default PlayerContainer; 