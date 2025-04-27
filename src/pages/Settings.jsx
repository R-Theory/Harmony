import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  Divider,
  useTheme,
} from '@mui/material';
import {
  MusicNote as MusicNoteIcon,
  VolumeUp as VolumeUpIcon,
} from '@mui/icons-material';
import axios from 'axios';

const Settings = () => {
  const theme = useTheme();
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [highQuality, setHighQuality] = useState(true);

  useEffect(() => {
    // Check if Spotify is connected
    const connected = localStorage.getItem('spotify_connected') === 'true';
    setIsSpotifyConnected(connected);
  }, []);

  const handleSpotifyConnect = async () => {
    if (isSpotifyConnected) {
      // Handle disconnect
      localStorage.removeItem('spotify_access_token');
      localStorage.removeItem('spotify_refresh_token');
      localStorage.removeItem('spotify_connected');
      setIsSpotifyConnected(false);
    } else {
      try {
        const response = await axios.get('/api/login');
        window.location.href = response.data.url;
      } catch (error) {
        console.error('Error initiating Spotify login:', error);
      }
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', mt: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Settings
      </Typography>

      {/* Music Service Settings */}
      <Paper sx={{ mb: 3, backgroundColor: theme.palette.background.paper }}>
        <List>
          <ListItem>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <MusicNoteIcon sx={{ mr: 2, color: theme.palette.primary.main }} />
              <ListItemText
                primary="Spotify Connection"
                secondary={isSpotifyConnected ? 'Connected' : 'Not connected'}
              />
            </Box>
            <ListItemSecondaryAction>
              <Button
                variant="contained"
                onClick={handleSpotifyConnect}
                color={isSpotifyConnected ? 'secondary' : 'primary'}
              >
                {isSpotifyConnected ? 'Disconnect' : 'Connect'}
              </Button>
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Paper>

      {/* Playback Settings */}
      <Paper sx={{ backgroundColor: theme.palette.background.paper }}>
        <List>
          <ListItem>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <VolumeUpIcon sx={{ mr: 2, color: theme.palette.primary.main }} />
              <ListItemText
                primary="Auto-play"
                secondary="Automatically play next song in queue"
              />
            </Box>
            <ListItemSecondaryAction>
              <Switch
                edge="end"
                checked={autoPlay}
                onChange={(e) => setAutoPlay(e.target.checked)}
              />
            </ListItemSecondaryAction>
          </ListItem>
          <Divider />
          <ListItem>
            <ListItemText
              primary="High Quality Audio"
              secondary="Stream in high quality (uses more bandwidth)"
            />
            <ListItemSecondaryAction>
              <Switch
                edge="end"
                checked={highQuality}
                onChange={(e) => setHighQuality(e.target.checked)}
              />
            </ListItemSecondaryAction>
          </ListItem>
        </List>
      </Paper>
    </Box>
  );
};

export default Settings; 