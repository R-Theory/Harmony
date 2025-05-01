import React, { useEffect, useRef, useState } from 'react';
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
  const [lastApiCall, setLastApiCall] = useState(0);
  const [retryAfter, setRetryAfter] = useState(0);

  // Helper function to handle rate limiting
  const handleRateLimit = async (response) => {
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After')) || 5;
      setRetryAfter(retryAfter);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      setRetryAfter(0);
      return true;
    }
    return false;
  };

  // Helper function to make API calls with rate limiting
  const makeApiCall = async (url, options) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;
    
    // Wait if we're being rate limited
    if (retryAfter > 0) {
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    }
    
    // Ensure minimum time between calls
    if (timeSinceLastCall < 1000) {
      await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLastCall));
    }

    const response = await fetch(url, options);
    setLastApiCall(Date.now());

    if (await handleRateLimit(response)) {
      return makeApiCall(url, options); // Retry the call
    }

    return response;
  };

  // Handle Spotify playback
  useEffect(() => {
    if (track?.source === 'spotify' && window.Spotify && spotifyPlayerRef?.current) {
      const player = spotifyPlayerRef.current;
      const token = localStorage.getItem('spotify_access_token');
      if (!token) return;
      
      // Handle play/pause
      if (isPlaying) {
        player.resume();
      } else {
        player.pause();
      }
      
      // Set volume
      player.setVolume(volume / 100);
      
      // Handle track changes
      if (track.uri) {
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };

        // Batch the API calls
        const transferPlayback = async () => {
          try {
            const response = await makeApiCall('https://api.spotify.com/v1/me/player', {
              method: 'PUT',
              headers,
              body: JSON.stringify({ device_ids: [player._options.id], play: true })
            });

            if (!response.ok) {
              throw new Error('Failed to transfer playback');
            }

            const playResponse = await makeApiCall(`https://api.spotify.com/v1/me/player/play?device_id=${player._options.id}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify({ uris: [track.uri] })
            });

            if (!playResponse.ok) {
              throw new Error('Failed to play track');
            }
          } catch (e) {
            console.error('[Playback] Error:', e);
            // Try to reconnect the player if there's an error
            if (spotifyPlayerRef.current) {
              spotifyPlayerRef.current.connect();
            }
          }
        };

        transferPlayback();
      }
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