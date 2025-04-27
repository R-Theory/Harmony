import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import axios from 'axios';

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
        try {
          // Store tokens in localStorage
          localStorage.setItem('spotify_access_token', access_token);
          localStorage.setItem('spotify_refresh_token', refresh_token);
          localStorage.setItem('spotify_connected', 'true');
          
          // Fetch user profile to verify token works
          const response = await axios.get('https://api.spotify.com/v1/me', {
            headers: {
              'Authorization': `Bearer ${access_token}`
            }
          });
          
          // Store user profile in localStorage for immediate access
          localStorage.setItem('spotify_user_profile', JSON.stringify(response.data));
          
          // After successful authentication, redirect to home
          navigate('/');
        } catch (error) {
          console.error('Error fetching user profile:', error);
          // If we get a 401, the token is invalid
          if (error.response?.status === 401) {
            localStorage.removeItem('spotify_access_token');
            localStorage.removeItem('spotify_refresh_token');
            localStorage.removeItem('spotify_connected');
            localStorage.removeItem('spotify_user_profile');
            navigate('/settings');
          }
        }
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