import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  TextField,
  Grid,
  useTheme,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  MusicNote as MusicNoteIcon,
  Group as GroupIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';

const Home = () => {
  const [sessionId, setSessionId] = useState('');
  const [userProfile, setUserProfile] = useState(null);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });
  const theme = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    // Handle tokens if they're in the URL
    const handleTokens = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const access_token = urlParams.get('access_token');
      const refresh_token = urlParams.get('refresh_token');
      const error = urlParams.get('error');

      if (error) {
        console.error('Authentication error:', error);
        navigate('/settings');
        return;
      }

      if (access_token && refresh_token) {
        // Store tokens in localStorage
        localStorage.setItem('spotify_access_token', access_token);
        localStorage.setItem('spotify_refresh_token', refresh_token);
        localStorage.setItem('spotify_connected', 'true');
        
        // Clear the URL parameters
        window.history.replaceState({}, document.title, '/');
      }
    };

    handleTokens();
  }, [navigate]);

  useEffect(() => {
    const testSpotifyConnection = async () => {
      const accessToken = localStorage.getItem('spotify_access_token');
      if (accessToken) {
        try {
          const response = await axios.get('https://api.spotify.com/v1/me', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });
          setUserProfile(response.data);
          console.log('Spotify connection successful:', response.data);
        } catch (error) {
          console.error('Error testing Spotify connection:', error);
          // If we get a 401, the token is invalid - clear it
          if (error.response?.status === 401) {
            localStorage.removeItem('spotify_access_token');
            localStorage.removeItem('spotify_refresh_token');
            localStorage.removeItem('spotify_connected');
            navigate('/settings');
          }
        }
      }
    };

    testSpotifyConnection();
  }, [navigate]);

  const handleJoinSession = () => {
    if (!sessionId.trim()) {
      setNotification({
        open: true,
        message: 'Please enter a session ID',
        severity: 'error'
      });
      return;
    }
    
    // Navigate to the session page
    navigate(`/session/${sessionId}`);
  };

  const handleCreateSession = () => {
    // Generate a unique session ID
    const newSessionId = uuidv4();
    
    // Navigate to the session page
    navigate(`/session/${newSessionId}`);
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', mt: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Welcome to Harmony
      </Typography>
      {userProfile && (
        <Typography variant="subtitle1" color="text.secondary" align="center" gutterBottom>
          Connected as: {userProfile.display_name}
        </Typography>
      )}
      <Typography variant="subtitle1" color="text.secondary" align="center" gutterBottom>
        Create or join a music session to get started
      </Typography>

      <Grid container spacing={4} sx={{ mt: 2 }}>
        {/* Join Session Card */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: theme.palette.background.paper,
            }}
          >
            <CardContent sx={{ flexGrow: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <GroupIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
                <Typography variant="h6">Join a Session</Typography>
              </Box>
              <TextField
                fullWidth
                label="Session ID"
                variant="outlined"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                sx={{ mb: 2 }}
              />
              <Button
                fullWidth
                variant="contained"
                onClick={handleJoinSession}
                disabled={!sessionId}
              >
                Join Session
              </Button>
            </CardContent>
          </Card>
        </Grid>

        {/* Create Session Card */}
        <Grid item xs={12} md={6}>
          <Card
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: theme.palette.background.paper,
            }}
          >
            <CardContent sx={{ flexGrow: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <MusicNoteIcon sx={{ mr: 1, color: theme.palette.primary.main }} />
                <Typography variant="h6">Create a Session</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" paragraph>
                Start a new music session and become the host. You'll be able to control playback
                and manage the queue.
              </Typography>
              <Button
                fullWidth
                variant="contained"
                onClick={handleCreateSession}
                sx={{ mt: 'auto' }}
              >
                Create New Session
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseNotification} severity={notification.severity} sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Home; 