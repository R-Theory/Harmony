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

  // Get the API base URL based on environment
  const getApiBaseUrl = () => {
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:3000';
    }
    // For production, use the same domain
    return window.location.origin;
  };

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
      localStorage.removeItem('spotify_user_profile');
      setIsSpotifyConnected(false);
    } else {
      try {
        const apiBaseUrl = getApiBaseUrl();
        console.log('Attempting to connect to:', `${apiBaseUrl}/api/login`);
        const response = await axios.get(`${apiBaseUrl}/api/login`);
        console.log('Login response:', response.data);
        
        // Add a delay to see the response
        if (response.data && response.data.url) {
          console.log('Spotify auth URL:', response.data.url);
          // Wait 2 seconds before redirecting
          setTimeout(() => {
            window.location.href = response.data.url;
          }, 2000);
        } else {
          console.error('Invalid response format:', response.data);
        }
      } catch (error) {
        console.error('Error initiating Spotify login:', error);
        // Add more detailed error logging
        if (error.response) {
          console.error('Error response:', error.response.data);
          console.error('Error status:', error.response.status);
        }
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