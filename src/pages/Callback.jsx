import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import axios from 'axios';

const Callback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const error = urlParams.get('error');

      if (error) {
        console.error('Spotify auth error:', error);
        navigate('/settings');
        return;
      }

      if (code) {
        try {
          // Exchange the code for tokens
          const apiBaseUrl = window.location.origin;
          const response = await axios.get(`${apiBaseUrl}/api/callback?code=${code}`);
          
          // The server should redirect with tokens in the URL
          const redirectUrl = response.request.responseURL;
          const redirectParams = new URLSearchParams(new URL(redirectUrl).search);
          const access_token = redirectParams.get('access_token');
          const refresh_token = redirectParams.get('refresh_token');

          if (access_token && refresh_token) {
            // Store tokens in localStorage
            localStorage.setItem('spotify_access_token', access_token);
            localStorage.setItem('spotify_refresh_token', refresh_token);
            localStorage.setItem('spotify_connected', 'true');
            
            // Fetch user profile to verify token works
            const profileResponse = await axios.get('https://api.spotify.com/v1/me', {
              headers: {
                'Authorization': `Bearer ${access_token}`
              }
            });
            
            // Store user profile in localStorage for immediate access
            localStorage.setItem('spotify_user_profile', JSON.stringify(profileResponse.data));
            
            // After successful authentication, redirect to home
            navigate('/');
          } else {
            console.error('No tokens received from callback');
            navigate('/settings');
          }
        } catch (error) {
          console.error('Error during callback:', error);
          if (error.response) {
            console.error('Error response:', error.response.data);
            console.error('Error status:', error.response.status);
          }
          navigate('/settings');
        }
      } else {
        console.error('No code received from Spotify');
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