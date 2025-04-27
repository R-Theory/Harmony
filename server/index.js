import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import SpotifyWebApi from 'spotify-web-api-node';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupPeerServer } from './peerServer.js';

dotenv.config();

// Determine if we're in production
const isProd = process.env.NODE_ENV === 'production';
const vercelDomain = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
const frontendUrl = process.env.FRONTEND_URL || (isProd ? vercelDomain : 'http://localhost:5173');

console.log('Server environment:', {
  isProd,
  vercelDomain,
  frontendUrl,
  nodeEnv: process.env.NODE_ENV
});

// Log environment variables (without sensitive data)
console.log('Environment check:', {
  hasClientId: !!process.env.SPOTIFY_CLIENT_ID,
  hasClientSecret: !!process.env.SPOTIFY_CLIENT_SECRET,
  hasRedirectUri: !!process.env.SPOTIFY_REDIRECT_URI,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
  nodeEnv: process.env.NODE_ENV,
  isProd,
  vercelDomain
});

const app = express();
const httpServer = createServer(app);

// Set up Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.VERCEL_URL 
      : ['http://localhost:5173', 'http://localhost:8080'],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Set up PeerJS server
const peerServer = setupPeerServer(httpServer);
app.use('/', peerServer);

// Middleware
app.use(cors({
  origin: isProd 
    ? [vercelDomain, 'https://harmony-v0-1.vercel.app'] 
    : ['http://localhost:5173', 'http://172.20.10.2:5173', 'http://10.100.11.132:8080'],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`, {
    query: req.query,
    headers: {
      origin: req.headers.origin,
      host: req.headers.host,
      referer: req.headers.referer
    }
  });
  
  // Add CORS headers for all responses
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  next();
});

// Spotify API configuration
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI
});

// WebRTC signaling
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Add any additional socket event handlers here
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Authentication routes
app.get('/api/login', (req, res) => {
  try {
    const scopes = [
      'user-read-private',
      'user-read-email',
      'user-read-playback-state',
      'user-modify-playback-state',
      'playlist-read-private',
      'playlist-modify-public',
      'playlist-modify-private'
    ];
    
    const authorizeURL = spotifyApi.createAuthorizeURL(scopes);
    console.log('Generated authorize URL:', authorizeURL);
    res.json({ url: authorizeURL });
  } catch (error) {
    console.error('Error in /api/login:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

app.get('/api/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    console.log('Received callback with code:', code ? 'code present' : 'no code');
    const data = await spotifyApi.authorizationCodeGrant(code);
    const { access_token, refresh_token } = data.body;
    
    spotifyApi.setAccessToken(access_token);
    spotifyApi.setRefreshToken(refresh_token);
    
    // Redirect to frontend with tokens
    const redirectUrl = `${frontendUrl}/?access_token=${access_token}&refresh_token=${refresh_token}`;
    console.log('Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Error during authentication:', error);
    res.redirect(`${frontendUrl}/?error=${encodeURIComponent(error.message)}`);
  }
});

// Refresh token endpoint
app.post('/api/refresh', async (req, res) => {
  try {
    const data = await spotifyApi.refreshAccessToken();
    const { access_token } = data.body;
    
    spotifyApi.setAccessToken(access_token);
    res.json({ access_token });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Token refresh failed', details: error.message });
  }
});

// ICE servers endpoint for WebRTC
app.get('/api/ice-servers', (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  try {
    // Using free public STUN servers
    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      // Free TURN server from Metered
      {
        urls: 'turn:a.relay.metered.ca:80',
        username: 'e8e9a6e62f8b9c228f1a5a6d',
        credential: 'uGpa0qKe+bVE'
      },
      {
        urls: 'turn:a.relay.metered.ca:80?transport=tcp',
        username: 'e8e9a6e62f8b9c228f1a5a6d',
        credential: 'uGpa0qKe+bVE'
      }
    ];

    res.status(200).json({ iceServers });
  } catch (error) {
    console.error('Error providing ICE servers:', error);
    res.status(500).json({ error: 'Failed to provide ICE servers' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Only start the server if we're not in a serverless environment
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3001;
  httpServer.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

export default app; 