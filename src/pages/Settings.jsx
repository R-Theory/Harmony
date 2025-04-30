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
  QueueMusic as QueueMusicIcon,
} from '@mui/icons-material';
import axios from 'axios';

const APPLE_MUSIC_DEVELOPER_TOKEN = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IlJXMjJVRDIyQTkifQ.eyJpYXQiOjE3NDU5NjE4NTksImV4cCI6MTc2MTUxMzg1OSwiaXNzIjoiTkxOQVROVDdWVSJ9.mOy9btGm3dGFpi-WRg82rrCAc1XTW-v-IPatLx0Tu_uL93ZSHrcRsB5bn7Y2mxTrZqsOGJn2p52f4AEHAah_Fg'; // Replace with your token

const Settings = () => {
  const theme = useTheme();
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [isAppleMusicConnected, setIsAppleMusicConnected] = useState(false);
  const [appleMusicReady, setAppleMusicReady] = useState(false);
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

  // Initialize Apple Music
  useEffect(() => {
    const loadMusicKit = async () => {
      try {
        // Set global MusicKitConfig before loading the script
        window.MusicKitConfig = {
          developerToken: APPLE_MUSIC_DEVELOPER_TOKEN,
          app: {
            name: 'Harmony',
            build: '1.0.0'
          }
        };

        const script = document.createElement('script');
        script.src = 'https://js-cdn.music.apple.com/musickit/v1/musickit.js';
        script.async = true;

        const scriptLoadPromise = new Promise((resolve, reject) => {
          script.onload = () => {
            console.log('[MusicKit] Script loaded');
            resolve();
          };
          script.onerror = (error) => {
            console.error('[MusicKit] Script load failed:', error);
            reject(error);
          };
        });

        document.body.appendChild(script);
        await scriptLoadPromise;

        // Debug: Log the MusicKit object and its properties
        console.log('[MusicKit] window.MusicKit:', window.MusicKit);
        if (window.MusicKit) {
          console.log('[MusicKit] typeof window.MusicKit:', typeof window.MusicKit);
          console.log('[MusicKit] window.MusicKit keys:', Object.keys(window.MusicKit));
          console.log('[MusicKit] typeof window.MusicKit.getInstance:', typeof window.MusicKit.getInstance);
        }

        // Wait for MusicKit to be available
        let attempts = 0;
        const maxAttempts = 10;
        while ((!window.MusicKit || typeof window.MusicKit.getInstance !== 'function') && attempts < maxAttempts) {
          console.log(`[MusicKit] Waiting for MusicKit.getInstance to be available... attempt ${attempts + 1}`);
          await new Promise(resolve => setTimeout(resolve, 500));
          attempts++;
        }
        if (!window.MusicKit || typeof window.MusicKit.getInstance !== 'function') {
          throw new Error('MusicKit.getInstance not available after loading script');
        }

        // Now get the instance
        let music;
        try {
          music = window.MusicKit.getInstance();
          if (!music) {
            throw new Error('MusicKit.getInstance() returned undefined');
          }
          console.log('[MusicKit] getInstance() succeeded:', music);
        } catch (instErr) {
          console.error('[MusicKit] Error getting instance:', instErr);
          throw instErr;
        }

        setAppleMusicReady(true);
        // Check if user was previously connected
        const connected = localStorage.getItem('apple_music_connected') === 'true';
        setIsAppleMusicConnected(connected);
      } catch (error) {
        console.error('[MusicKit] Error during initialization:', error);
        if (error && error.stack) {
          console.error('[MusicKit] Stack trace:', error.stack);
        }
        setAppleMusicReady(false);
      }
    };

    loadMusicKit();
  }, []);

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

  const handleAppleMusicConnect = async () => {
    if (isAppleMusicConnected) {
      // Handle disconnect
      localStorage.removeItem('apple_music_user_token');
      localStorage.removeItem('apple_music_connected');
      setIsAppleMusicConnected(false);
    } else {
      try {
        if (!window.MusicKit) {
          throw new Error('MusicKit not available');
        }
        
        const music = window.MusicKit.getInstance();
        if (!music) {
          throw new Error('Failed to get MusicKit instance');
        }
        
        const userToken = await music.authorize();
        localStorage.setItem('apple_music_user_token', userToken);
        localStorage.setItem('apple_music_connected', 'true');
        setIsAppleMusicConnected(true);
        console.log('[MusicKit] User authorized successfully');
      } catch (err) {
        console.error('[MusicKit] Authorization failed:', err);
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
          <Divider />
          <ListItem>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <QueueMusicIcon sx={{ mr: 2, color: theme.palette.primary.main }} />
              <ListItemText
                primary="Apple Music Connection"
                secondary={isAppleMusicConnected ? 'Connected' : 'Not connected'}
              />
            </Box>
            <ListItemSecondaryAction>
              <Button
                variant="contained"
                onClick={handleAppleMusicConnect}
                disabled={!appleMusicReady}
                color={isAppleMusicConnected ? 'secondary' : 'primary'}
              >
                {isAppleMusicConnected ? 'Disconnect' : 'Connect'}
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