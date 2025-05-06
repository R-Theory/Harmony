import React from 'react';
import PlayerBar from './PlayerBar';
import MusicPlayer from './MusicPlayer';
import usePlaybackController from '../hooks/usePlaybackController';
import DebugLogger from '../utils/debug';

const debug = new DebugLogger('PlayerContainer');

const PlayerContainer = ({
  currentTrack: initialTrack,
  selectedPlaybackDevice,
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
    initialVolume,
    spotifyPlayerRef,
    appleMusicUserToken
  });

  React.useEffect(() => {
    debug.log('PlayerContainer rendered', {
      track: playback.currentTrack,
      playbackState: playback.playbackState,
      volume: playback.volume,
      selectedPlaybackDevice
    });
  }, [playback.currentTrack, playback.playbackState, playback.volume, selectedPlaybackDevice]);

  React.useEffect(() => {
    if (parentSetVolume) parentSetVolume(playback.volume);
  }, [playback.volume, parentSetVolume]);

  // Update playback state when track changes
  React.useEffect(() => {
    if (initialTrack) {
      playback.setCurrentTrack(initialTrack);
    }
  }, [initialTrack]);

  return (
    <>
      <PlayerBar
        currentTrack={playback.currentTrack}
        selectedPlaybackDevice={selectedPlaybackDevice}
        isPlaying={playback.playbackState === playback.PLAYBACK_STATES.PLAYING}
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
        isPlaying={playback.playbackState === playback.PLAYBACK_STATES.PLAYING}
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