import PropTypes from 'prop-types';
import { useState } from 'react';
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
  onVolumeChange
}) => {
  const theme = useTheme();

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
          <IconButton size="small" onClick={onSkipPrevious}>
            <SkipPrevious />
          </IconButton>
          <IconButton onClick={onPlayPause}>
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton size="small" onClick={onSkipNext}>
            <SkipNext />
          </IconButton>
        </Box>

        {/* Progress Bar */}
        <Box sx={{ flexGrow: 2, mx: 2, display: { xs: 'none', sm: 'block' } }}>
          <Slider
            size="small"
            value={currentTrack?.currentTime || 0}
            max={currentTrack?.duration || 0}
            sx={{
              color: theme.palette.primary.main,
              '& .MuiSlider-thumb': {
                width: 8,
                height: 8,
              },
            }}
            disabled={!currentTrack}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">
              {formatTime(currentTrack?.currentTime || 0)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatTime(currentTrack?.duration || 0)}
            </Typography>
          </Box>
        </Box>

        {/* Volume Control */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 100 }}>
          <VolumeUp />
          <Slider
            size="small"
            value={volume}
            onChange={onVolumeChange}
            sx={{
              color: theme.palette.primary.main,
              '& .MuiSlider-thumb': {
                width: 8,
                height: 8,
              },
            }}
          />
        </Box>
      </Box>
    </Paper>
  );
};

PlayerBar.propTypes = {
  currentTrack: PropTypes.shape({
    title: PropTypes.string,
    artist: PropTypes.string,
    duration: PropTypes.number,
    currentTime: PropTypes.number,
  }),
  isPlaying: PropTypes.bool.isRequired,
  onPlayPause: PropTypes.func.isRequired,
  onSkipNext: PropTypes.func.isRequired,
  onSkipPrevious: PropTypes.func.isRequired,
  volume: PropTypes.number.isRequired,
  onVolumeChange: PropTypes.func.isRequired,
};

export default PlayerBar; 