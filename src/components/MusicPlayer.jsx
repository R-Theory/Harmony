import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

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
  appleMusicUserToken
}) => {
  const musicKitRef = useRef(null);

  // Handle Spotify playback
  useEffect(() => {
    if (track?.source === 'spotify' && window.Spotify && spotifyPlayerRef?.current) {
      const player = spotifyPlayerRef.current;
      const token = localStorage.getItem('spotify_access_token');
      if (!token) return;
      if (track.uri) {
        // Transfer playback to web player and play the track
        fetch('https://api.spotify.com/v1/me/player', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ device_ids: [player._options.id], play: true })
        }).then(() => {
          fetch(`https://api.spotify.com/v1/me/player/play?device_id=${player._options.id}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ uris: [track.uri] })
          });
        });
      }
      // Play/pause
      if (isPlaying) {
        player.resume();
      } else {
        player.pause();
      }
      // Set volume
      player.setVolume(volume / 100);
    }
  }, [track, isPlaying, volume, spotifyPlayerRef]);

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
    }
  }, [track, isPlaying, volume, appleMusicUserToken]);

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
  appleMusicUserToken: PropTypes.string
};

export default MusicPlayer; 