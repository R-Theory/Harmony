import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import SpotifyWebApi from 'spotify-web-api-node';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Import queue API routes
import queueRoutes from './api/queue.js';

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

// Queue management
const sessionQueues = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join a session
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`Client ${socket.id} joined session ${sessionId}`);
    
    // Initialize queue for this session if it doesn't exist
    if (!sessionQueues.has(sessionId)) {
      sessionQueues.set(sessionId, []);
    }
    
    // Send current queue to the client
    socket.emit('queue-update', { queue: sessionQueues.get(sessionId) });
  });

  // Leave a session
  socket.on('leave-session', (sessionId) => {
    socket.leave(sessionId);
    console.log(`Client ${socket.id} left session ${sessionId}`);
  });

  // Add track to queue
  socket.on('add-to-queue', async ({ sessionId, track, accessToken }) => {
    try {
      // Add to Spotify queue
      spotifyApi.setAccessToken(accessToken);
      await spotifyApi.addToQueue(track.uri);
      
      // Add to session queue
      const queue = sessionQueues.get(sessionId) || [];
      queue.push(track);
      sessionQueues.set(sessionId, queue);
      
      // Broadcast queue update to all clients in the session
      io.to(sessionId).emit('queue-update', { queue });
      
      console.log(`Added track ${track.name} to queue for session ${sessionId}`);
    } catch (error) {
      console.error('Error adding to queue:', error);
      socket.emit('queue-error', { message: 'Failed to add track to queue' });
    }
  });

  // Remove track from queue
  socket.on('remove-from-queue', async ({ sessionId, trackUri, accessToken }) => {
    try {
      // Skip to next track in Spotify (workaround since direct queue removal isn't supported)
      spotifyApi.setAccessToken(accessToken);
      await spotifyApi.skipToNext();
      
      // Remove from session queue
      const queue = sessionQueues.get(sessionId) || [];
      const updatedQueue = queue.filter(track => track.uri !== trackUri);
      sessionQueues.set(sessionId, updatedQueue);
      
      // Broadcast queue update to all clients in the session
      io.to(sessionId).emit('queue-update', { queue: updatedQueue });
      
      console.log(`Removed track ${trackUri} from queue for session ${sessionId}`);
    } catch (error) {
      console.error('Error removing from queue:', error);
      socket.emit('queue-error', { message: 'Failed to remove track from queue' });
    }
  });

  // Get current queue
  socket.on('get-queue', async ({ sessionId, accessToken }) => {
    try {
      // Get Spotify queue
      spotifyApi.setAccessToken(accessToken);
      const queueData = await spotifyApi.getMyCurrentQueue();
      
      // Update session queue
      sessionQueues.set(sessionId, queueData.body.queue || []);
      
      // Send queue to the client
      socket.emit('queue-update', { queue: queueData.body.queue || [] });
    } catch (error) {
      console.error('Error getting queue:', error);
      socket.emit('queue-error', { message: 'Failed to get queue' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Use queue API routes
app.use('/api', queueRoutes);

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