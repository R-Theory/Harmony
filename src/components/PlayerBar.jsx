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

const PlayerBar = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const theme = useTheme();

  // Placeholder for now - will be connected to actual player state later
  const currentTrack = {
    title: 'No track playing',
    artist: '',
    duration: 0,
    currentTime: 0,
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleVolumeChange = (event, newValue) => {
    setVolume(newValue);
  };

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
            {currentTrack.title}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {currentTrack.artist}
          </Typography>
        </Box>

        {/* Playback Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton size="small">
            <SkipPrevious />
          </IconButton>
          <IconButton onClick={handlePlayPause}>
            {isPlaying ? <Pause /> : <PlayArrow />}
          </IconButton>
          <IconButton size="small">
            <SkipNext />
          </IconButton>
        </Box>

        {/* Progress Bar */}
        <Box sx={{ flexGrow: 2, mx: 2, display: { xs: 'none', sm: 'block' } }}>
          <Slider
            size="small"
            value={currentTrack.currentTime}
            max={currentTrack.duration}
            sx={{
              color: theme.palette.primary.main,
              '& .MuiSlider-thumb': {
                width: 8,
                height: 8,
              },
            }}
          />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">
              {formatTime(currentTrack.currentTime)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatTime(currentTrack.duration)}
            </Typography>
          </Box>
        </Box>

        {/* Volume Control */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: 100 }}>
          <VolumeUp />
          <Slider
            size="small"
            value={volume}
            onChange={handleVolumeChange}
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

export default PlayerBar; 