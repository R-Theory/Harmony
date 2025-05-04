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

const debug = new DebugLogger('PlayerBar');
const SEEK_RATE_LIMIT = 1000; // 1 second between seeks
const VOLUME_RATE_LIMIT = 500; // 500ms between volume changes

const PlayerBar = ({
  currentTrack,
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
    debug.log('Progress update received', { progress, isSeeking });
    if (!isSeeking) {
      setLocalProgress(progress);
    }
  }, [progress, isSeeking]);

  // Update progress every second when playing
  useEffect(() => {
    debug.log('Playback state changed', { isPlaying, currentTrack, isSeeking });
    if (isPlaying && currentTrack && !isSeeking) {
      progressInterval.current = setInterval(() => {
        setLocalProgress(prev => {
          const newProgress = prev + 1000; // Add 1 second in milliseconds
          if (newProgress >= duration) {
            debug.log('Track ended, skipping to next');
            clearInterval(progressInterval.current);
            onSkipNext(); // Automatically skip to next track when current one ends
            return 0;
          }
          return newProgress;
        });
      }, 1000);
    } else {
      clearInterval(progressInterval.current);
    }

    return () => {
      clearInterval(progressInterval.current);
    };
  }, [isPlaying, currentTrack, duration, onSkipNext, isSeeking]);

  const handleProgressChange = (event, newValue) => {
    if (!currentTrack) return;
    
    const now = Date.now();
    if (now - lastSeekTime < SEEK_RATE_LIMIT) {
      debug.log('Seek rate limited', {
        timeSinceLastSeek: now - lastSeekTime,
        requiredInterval: SEEK_RATE_LIMIT
      });
      return;
    }
    
    setLastSeekTime(now);
    debug.log('Seeking to position', { newValue });
    onSeek(newValue);
  };

  const handleVolumeChange = (event, newValue) => {
    if (!currentTrack) return;
    
    const now = Date.now();
    if (now - lastVolumeChange < VOLUME_RATE_LIMIT) {
      debug.log('Volume change rate limited', {
        timeSinceLastChange: now - lastVolumeChange,
        requiredInterval: VOLUME_RATE_LIMIT
      });
      return;
    }
    
    setLastVolumeChange(now);
    debug.log('Volume changed', { newValue });
    onVolumeChange(newValue);
  };

  // Update progress bar smoothly
  useEffect(() => {
    debug.log('Progress bar effect triggered', { isPlaying, currentTrack, duration });
    if (!isPlaying || !currentTrack) return;
    
    const interval = setInterval(() => {
      setLocalProgress(prev => {
        const newProgress = prev + 1000; // Update every second
        return newProgress <= duration ? newProgress : duration;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isPlaying, currentTrack, duration]);

  const formatTime = (ms) => {
    if (!ms) return '0:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
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

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        p: 2,
        backgroundColor: theme.palette.background.paper,
        borderTop: `1px solid ${theme.palette.divider}`,
      }}
    >
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={4}>
          {currentTrack && (
            <Box display="flex" alignItems="center">
              <Avatar
                src={currentTrack.albumArt}
                alt={currentTrack.title}
                sx={{ width: 56, height: 56, mr: 2 }}
              />
              <Box>
                <Typography variant="subtitle1" noWrap>
                  {currentTrack.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {currentTrack.artist}
                </Typography>
              </Box>
            </Box>
          )}
        </Grid>
        <Grid item xs={12} sm={4}>
          <Box display="flex" flexDirection="column" alignItems="center">
            <Box display="flex" alignItems="center" mb={1}>
              <IconButton onClick={onSkipPrevious} disabled={!currentTrack}>
                <SkipPrevious />
              </IconButton>
              <IconButton
                onClick={onPlayPause}
                disabled={!currentTrack}
                sx={{ mx: 2 }}
              >
                {isPlaying ? <Pause /> : <PlayArrow />}
              </IconButton>
              <IconButton onClick={onSkipNext} disabled={!currentTrack}>
                <SkipNext />
              </IconButton>
            </Box>
            <Box display="flex" alignItems="center" width="100%">
              <Typography variant="body2" sx={{ minWidth: 40 }}>
                {formatTime(localProgress)}
              </Typography>
              <Slider
                value={localProgress}
                onChange={handleProgressChange}
                max={duration}
                disabled={!currentTrack}
                sx={{ mx: 2 }}
              />
              <Typography variant="body2" sx={{ minWidth: 40 }}>
                {formatTime(duration)}
              </Typography>
            </Box>
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
              disabled={!currentTrack}
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
  currentTrack: PropTypes.object,
  isPlaying: PropTypes.bool.isRequired,
  onPlayPause: PropTypes.func,
  onSkipNext: PropTypes.func,
  onSkipPrevious: PropTypes.func,
  volume: PropTypes.number.isRequired,
  onVolumeChange: PropTypes.func,
  onSeek: PropTypes.func,
  progress: PropTypes.number,
  duration: PropTypes.number
};

export default PlayerBar; 