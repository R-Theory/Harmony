import express from 'express';
import SpotifyWebApi from 'spotify-web-api-node';
import fetch from 'node-fetch';

const router = express.Router();

// Initialize Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI
});

// Get current queue
router.get('/queue', async (req, res) => {
  const { access_token } = req.query;
  
  if (!access_token) {
    return res.status(401).json({ error: 'Access token is required' });
  }

  try {
    spotifyApi.setAccessToken(access_token);
    // Use node-fetch to get the queue
    const response = await fetch('https://api.spotify.com/v1/me/player/queue', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`Spotify queue fetch failed: ${response.status}`);
    }
    const queueData = await response.json();
    res.json({
      queue: queueData.queue || [],
      currently_playing: queueData.currently_playing || null
    });
  } catch (error) {
    console.error('Error getting queue:', error);
    res.status(500).json({ error: 'Failed to get queue' });
  }
});

// Add track to queue
router.post('/queue/add', async (req, res) => {
  const { access_token, uri } = req.body;
  
  if (!access_token || !uri) {
    return res.status(400).json({ error: 'Access token and track URI are required' });
  }

  try {
    spotifyApi.setAccessToken(access_token);
    await spotifyApi.addToQueue(uri);
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding to queue:', error);
    res.status(500).json({ error: 'Failed to add track to queue' });
  }
});

// Remove track from queue (Note: This is a workaround since Spotify doesn't support direct removal)
router.post('/queue/remove', async (req, res) => {
  const { access_token, uri } = req.body;
  
  if (!access_token || !uri) {
    return res.status(400).json({ error: 'Access token and track URI are required' });
  }

  try {
    spotifyApi.setAccessToken(access_token);
    
    // Since we can't remove directly, we'll skip to the next track
    await spotifyApi.skipToNext();
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing from queue:', error);
    res.status(500).json({ error: 'Failed to remove track from queue' });
  }
});

export default router; 