import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import {
  Paper,
  IconButton,
  Typography,
  Box,
  Slider,
  useTheme,
  Grid,
  Avatar,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  SkipNext,
  SkipPrevious,
  VolumeUp,
  VolumeDown,
} from '@mui/icons-material';
import DebugLogger from '../utils/debug';
import { NormalizedTrack } from '../types/track';

const debug = new DebugLogger('PlayerBar');
const SEEK_RATE_LIMIT = 1000; // 1 second between seeks
const VOLUME_RATE_LIMIT = 500; // 500ms between volume changes

const PlayerBar = ({
  currentTrack,
  selectedPlaybackDevice,
  isPlaying,
  onPlayPause,
  onSkipNext,
  onSkipPrevious,
  volume,
  onVolumeChange,
  onSeek,
  progress,
  duration
}) => {
  const theme = useTheme();
  const [isSeeking, setIsSeeking] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const progressInterval = useRef(null);
  const [lastSeekTime, setLastSeekTime] = useState(0);
  const [lastVolumeChange, setLastVolumeChange] = useState(0);

  // Update local progress when not seeking
  useEffect(() => {
    if (!isSeeking) {
      setLocalProgress(progress);
    }
  }, [progress, isSeeking]);

  // Update progress every second when playing
  useEffect(() => {
    if (isPlaying && currentTrack && !isSeeking) {
      progressInterval.current = setInterval(() => {
        setLocalProgress(prev => {
          const newProgress = prev + 1; // Add 1 second
          // Remove the manual track ending logic and let Spotify handle it
          return newProgress <= duration ? newProgress : duration;
        });
      }, 1000);
    } else {
      clearInterval(progressInterval.current);
    }

    return () => {
      clearInterval(progressInterval.current);
    };
  }, [isPlaying, currentTrack, duration, isSeeking]);

  const handleProgressChange = (event, newValue) => {
    if (!currentTrack) return;
    const now = Date.now();
    if (now - lastSeekTime < SEEK_RATE_LIMIT) {
      return;
    }
    setLastSeekTime(now);
    onSeek(newValue);
  };

  const handleVolumeChange = (event, newValue) => {
    if (!currentTrack) return;
    const now = Date.now();
    if (now - lastVolumeChange < VOLUME_RATE_LIMIT) {
      return;
    }
    setLastVolumeChange(now);
    onVolumeChange(newValue);
  };

  // Ensure isPlaying is false when there's no track
  useEffect(() => {
    if (!currentTrack && isPlaying) {
      onPlayPause();
    }
  }, [currentTrack, isPlaying, onPlayPause]);

  const formatTime = (seconds) => {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
    clearInterval(progressInterval.current);
  };

  const handleSeekEnd = (event, newValue) => {
    setIsSeeking(false);
    if (onSeek) {
      onSeek(newValue);
    }
  };

  const handlePlayPauseClick = () => {
    debug.log('Play/Pause button clicked', { currentTrack, isPlaying });
    if (typeof onPlayPause === 'function') {
      onPlayPause();
    } else {
      debug.logError('onPlayPause is not a function', { currentTrack, isPlaying });
    }
  };

  const handleSkipNextClick = () => {
    debug.log('Skip Next button clicked', { currentTrack });
    onSkipNext();
  };

  const handleSkipPreviousClick = () => {
    debug.log('Skip Previous button clicked', { currentTrack });
    onSkipPrevious();
  };

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 2,
        backgroundColor: theme.palette.background.paper,
        zIndex: theme.zIndex.appBar
      }}
    >
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={4}>
          <Box display="flex" alignItems="center">
            {currentTrack?.albumArt && (
              <Avatar
                src={currentTrack.albumArt}
                alt={currentTrack.name}
                sx={{ width: 56, height: 56, marginRight: 2 }}
              />
            )}
            <Box>
              <Typography variant="subtitle1" noWrap>
                {currentTrack?.name || 'No track selected'}
              </Typography>
              <Typography variant="body2" color="textSecondary" noWrap>
                {currentTrack?.artists?.map(artist => artist.name).join(', ') || 'No artist'}
              </Typography>
            </Box>
          </Box>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Box display="flex" alignItems="center" justifyContent="center">
            <IconButton
              onClick={handleSkipPreviousClick}
              size="large"
            >
              <SkipPrevious />
            </IconButton>
            <IconButton
              onClick={handlePlayPauseClick}
              size="large"
              color="primary"
            >
              {isPlaying ? <Pause /> : <PlayArrow />}
            </IconButton>
            <IconButton
              onClick={handleSkipNextClick}
              size="large"
            >
              <SkipNext />
            </IconButton>
          </Box>
          <Box display="flex" alignItems="center" sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ minWidth: 45 }}>
              {formatTime(localProgress)}
            </Typography>
            <Slider
              value={localProgress}
              onChange={handleProgressChange}
              onMouseDown={handleSeekStart}
              onChangeCommitted={handleSeekEnd}
              min={0}
              max={duration}
              sx={{ mx: 2 }}
            />
            <Typography variant="caption" sx={{ minWidth: 45 }}>
              {formatTime(duration)}
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Box display="flex" alignItems="center" justifyContent="flex-end">
            <VolumeDown />
            <Slider
              value={volume}
              onChange={handleVolumeChange}
              min={0}
              max={100}
              sx={{ width: 100 }}
            />
            <VolumeUp />
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
};

PlayerBar.propTypes = {
  currentTrack: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    artists: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired
    })).isRequired,
    album: PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      images: PropTypes.arrayOf(PropTypes.shape({
        url: PropTypes.string.isRequired,
        height: PropTypes.number,
        width: PropTypes.number
      }))
    }).isRequired,
    duration_ms: PropTypes.number.isRequired,
    uri: PropTypes.string.isRequired,
    source: PropTypes.oneOf(['spotify', 'appleMusic']).isRequired,
    preview_url: PropTypes.string,
    is_playable: PropTypes.bool.isRequired
  }),
  selectedPlaybackDevice: PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    isHost: PropTypes.bool.isRequired,
    hasSpotify: PropTypes.bool.isRequired,
    hasAppleMusic: PropTypes.bool.isRequired
  }),
  isPlaying: PropTypes.bool.isRequired,
  onPlayPause: PropTypes.func.isRequired,
  onSkipNext: PropTypes.func.isRequired,
  onSkipPrevious: PropTypes.func.isRequired,
  volume: PropTypes.number.isRequired,
  onVolumeChange: PropTypes.func.isRequired,
  onSeek: PropTypes.func.isRequired,
  progress: PropTypes.number,
  duration: PropTypes.number
};

export default PlayerBar; 