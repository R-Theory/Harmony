import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import {
  Paper,
  IconButton,
  Typography,
  Box,
  Slider,
  useTheme,
} from '@mui/material';
import {
  PlayArrow,
  Pause,
  SkipNext,
  SkipPrevious,
  VolumeUp,
} from '@mui/icons-material';

const PlayerBar = ({
  currentTrack,
  isPlaying,
  onPlayPause,
  onSkipNext,
  onSkipPrevious,
  volume,
  onVolumeChange,
  onSeek
}) => {
  const theme = useTheme();
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const progressInterval = useRef(null);

  // Update progress every second when playing
  useEffect(() => {
    if (isPlaying && currentTrack && !isSeeking) {
      progressInterval.current = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + 1;
          if (newProgress >= duration) {
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

  // Reset progress and update duration when track changes
  useEffect(() => {
    if (currentTrack) {
      setDuration(Math.floor(currentTrack.duration_ms / 1000));
      setProgress(0);
    }
  }, [currentTrack]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleProgressChange = (event, newValue) => {
    setProgress(newValue);
    if (onSeek) {
      onSeek(newValue * 1000); // Convert to milliseconds
    }
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
    clearInterval(progressInterval.current);
  };

  const handleSeekEnd = () => {
    setIsSeeking(false);
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* Track Info */}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap>
            {currentTrack?.title || 'No track playing'}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {currentTrack?.artist || ''}
          </Typography>
        </Box>

        {/* Playback Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton 
            size="small" 
            onClick={onSkipPrevious}
            disabled={!currentTrack}
          >
            <SkipPrevious />
          </IconButton>
          <IconButton 
            onClick={onPlayPause}
            disabled={!currentTrack}
          >
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton 
            size="small" 
            onClick={onSkipNext}
            disabled={!currentTrack}
          >
            <SkipNext />
          </IconButton>
        </Box>

        {/* Progress Bar */}
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {formatTime(progress)}
          </Typography>
          <Slider
            value={progress}
            max={duration}
            onChange={handleProgressChange}
            onChangeCommitted={handleSeekEnd}
            onChangeStart={handleSeekStart}
            sx={{ mx: 2 }}
            disabled={!currentTrack}
          />
          <Typography variant="body2" color="text.secondary">
            {formatTime(duration)}
          </Typography>
        </Box>

        {/* Volume Control */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <VolumeUp />
          <Slider
            value={volume}
            onChange={onVolumeChange}
            sx={{ width: 100 }}
          />
        </Box>
      </Box>
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
  onSeek: PropTypes.func
};

export default PlayerBar; 