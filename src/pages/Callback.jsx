import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';

const Callback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const access_token = urlParams.get('access_token');
      const refresh_token = urlParams.get('refresh_token');
      const error = urlParams.get('error');

      if (error) {
        console.error('Spotify auth error:', error);
        navigate('/settings');
        return;
      }

      if (access_token && refresh_token) {
        // Store tokens in localStorage
        localStorage.setItem('spotify_access_token', access_token);
        localStorage.setItem('spotify_refresh_token', refresh_token);
        
        // Update connection status
        localStorage.setItem('spotify_connected', 'true');
        
        // After successful authentication, redirect to home
        navigate('/');
      } else {
        navigate('/settings');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
      }}
    >
      <CircularProgress />
      <Typography variant="h6">Connecting to Spotify...</Typography>
    </Box>
  );
};

export default Callback; 