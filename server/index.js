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

// Determine allowed origins based on environment
const getAllowedOrigins = () => {
  if (process.env.NODE_ENV === 'production') {
    const origins = [
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      'https://harmony-v0-1.vercel.app',
      'https://harmony-vert.vercel.app'
    ].filter(Boolean);
    console.log('Production allowed origins:', origins);
    return origins;
  }
  return ['http://localhost:5173', 'http://localhost:8080'];
};

const allowedOrigins = getAllowedOrigins();

// Set up Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  path: '/socket.io'
});

// Middleware
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
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
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
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

// Helper function to get current Spotify queue
async function getSpotifyQueue(accessToken) {
  try {
    console.log('Getting Spotify queue with token:', accessToken ? 'Token present' : 'No token');
    spotifyApi.setAccessToken(accessToken);
    
    // First check if there's an active device
    const devicesResponse = await spotifyApi.getMyDevices();
    const devices = devicesResponse.body.devices || [];
    
    if (devices.length === 0) {
      console.log('No Spotify devices found');
      return [];
    }
    
    // Find active device or use the first available one
    let activeDevice = devices.find(device => device.is_active);
    if (!activeDevice) {
      console.log('No active device found, using first available device');
      activeDevice = devices[0];
      
      // Transfer playback to this device
      await spotifyApi.transferMyPlayback({
        device_ids: [activeDevice.id],
        play: false
      });
      
      // Wait a bit for the transfer to take effect
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Now get the queue
    const queueData = await spotifyApi.getMyCurrentQueue();
    console.log('Spotify queue data:', {
      hasQueue: !!queueData.body.queue,
      queueLength: queueData.body.queue ? queueData.body.queue.length : 0,
      currentlyPlaying: queueData.body.currently_playing ? queueData.body.currently_playing.name : 'None'
    });
    return queueData.body.queue || [];
  } catch (error) {
    console.error('Error getting Spotify queue:', error);
    return [];
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join a session
  socket.on('join-session', async (sessionId) => {
    socket.join(sessionId);
    console.log(`Client ${socket.id} joined session ${sessionId}`);
    
    // Initialize queue for this session if it doesn't exist
    if (!sessionQueues.has(sessionId)) {
      sessionQueues.set(sessionId, []);
    }
    
    // Send current queue to the client
    const currentQueue = sessionQueues.get(sessionId);
    console.log(`Sending initial queue to client ${socket.id} for session ${sessionId}:`, {
      queueLength: currentQueue.length
    });
    socket.emit('queue-update', { queue: currentQueue });
  });

  // Leave a session
  socket.on('leave-session', (sessionId) => {
    socket.leave(sessionId);
    console.log(`Client ${socket.id} left session ${sessionId}`);
  });

  // Add track to queue
  socket.on('add-to-queue', async ({ sessionId, track, accessToken }) => {
    console.log(`Adding track to queue for session ${sessionId}:`, {
      trackName: track.name,
      trackUri: track.uri,
      hasAccessToken: !!accessToken
    });
    
    try {
      // Add to Spotify queue
      spotifyApi.setAccessToken(accessToken);
      await spotifyApi.addToQueue(track.uri);
      console.log(`Successfully added track ${track.name} to Spotify queue`);
      
      // Wait a moment for Spotify to update
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get updated queue from Spotify
      const spotifyQueue = await getSpotifyQueue(accessToken);
      console.log(`Retrieved updated Spotify queue:`, {
        queueLength: spotifyQueue.length
      });
      
      // Update session queue with Spotify's queue
      sessionQueues.set(sessionId, spotifyQueue);
      
      // Broadcast queue update to all clients in the session
      console.log(`Broadcasting queue update to session ${sessionId}:`, {
        queueLength: spotifyQueue.length
      });
      io.to(sessionId).emit('queue-update', { queue: spotifyQueue });
      
      console.log(`Added track ${track.name} to queue for session ${sessionId}`);
    } catch (error) {
      console.error('Error adding to queue:', error);
      socket.emit('queue-error', { 
        message: error.message || 'Failed to add track to queue. Please ensure Spotify is open and playing.'
      });
    }
  });

  // Remove track from queue
  socket.on('remove-from-queue', async ({ sessionId, trackUri, accessToken }) => {
    console.log(`Removing track from queue for session ${sessionId}:`, {
      trackUri,
      hasAccessToken: !!accessToken
    });
    
    try {
      // Skip to next track in Spotify (workaround since direct queue removal isn't supported)
      spotifyApi.setAccessToken(accessToken);
      await spotifyApi.skipToNext();
      console.log(`Successfully skipped to next track in Spotify`);
      
      // Wait a moment for Spotify to update
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get updated queue from Spotify
      const spotifyQueue = await getSpotifyQueue(accessToken);
      console.log(`Retrieved updated Spotify queue after removal:`, {
        queueLength: spotifyQueue.length
      });
      
      // Update session queue with Spotify's queue
      sessionQueues.set(sessionId, spotifyQueue);
      
      // Broadcast queue update to all clients in the session
      console.log(`Broadcasting queue update to session ${sessionId}:`, {
        queueLength: spotifyQueue.length
      });
      io.to(sessionId).emit('queue-update', { queue: spotifyQueue });
      
      console.log(`Removed track ${trackUri} from queue for session ${sessionId}`);
    } catch (error) {
      console.error('Error removing from queue:', error);
      socket.emit('queue-error', { 
        message: error.message || 'Failed to remove track from queue'
      });
    }
  });

  // Get current queue
  socket.on('get-queue', async ({ sessionId, accessToken }) => {
    console.log(`Getting queue for session ${sessionId}:`, {
      hasAccessToken: !!accessToken
    });
    
    try {
      // Get Spotify queue
      const spotifyQueue = await getSpotifyQueue(accessToken);
      console.log(`Retrieved Spotify queue:`, {
        queueLength: spotifyQueue.length
      });
      
      // Update session queue
      sessionQueues.set(sessionId, spotifyQueue);
      
      // Send queue to the client
      console.log(`Sending queue to client ${socket.id}:`, {
        queueLength: spotifyQueue.length
      });
      socket.emit('queue-update', { queue: spotifyQueue });
    } catch (error) {
      console.error('Error getting queue:', error);
      socket.emit('queue-error', { 
        message: error.message || 'Failed to get queue'
      });
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