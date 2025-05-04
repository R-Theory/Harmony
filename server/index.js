import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import SpotifyWebApi from 'spotify-web-api-node';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

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

// Set up Socket.IO with enhanced configuration
const io = new Server(httpServer, {
  cors: {
    origin: getAllowedOrigins(),
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
  cookie: false,
  // Add more robust configuration
  connectTimeout: 45000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e8,
  path: '/api/socket.io/',
  serveClient: false,
  // Add more detailed error handling
  allowUpgrades: true,
  perMessageDeflate: {
    threshold: 1024
  }
});

// Add Socket.IO middleware
io.use((socket, next) => {
  console.log('Socket.IO connection attempt:', {
    id: socket.id,
    handshake: {
      address: socket.handshake.address,
      headers: socket.handshake.headers,
      query: socket.handshake.query,
      url: socket.handshake.url,
      time: new Date().toISOString()
    }
  });
  
  // Add error handling
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
  
  next();
});

// Add error handling for the Socket.IO server
io.engine.on('connection_error', (err) => {
  console.error('Socket.IO connection error:', {
    error: err.message,
    code: err.code,
    context: err.context,
    time: new Date().toISOString()
  });
});

// Add connection state monitoring
io.engine.on('connection', (socket) => {
  console.log('New Socket.IO connection established:', {
    id: socket.id,
    time: new Date().toISOString()
  });
});

// Add disconnection monitoring
io.engine.on('disconnect', (socket) => {
  console.log('Socket.IO connection closed:', {
    id: socket.id,
    time: new Date().toISOString()
  });
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

// Add Socket.IO route handler
app.use('/api/socket.io', (req, res, next) => {
  console.log('Socket.IO request received:', {
    method: req.method,
    url: req.url,
    headers: req.headers
  });
  res.status(200).end();
});

// Spotify API configuration
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI
});

// Debugging: Log version and check for .request method
const tempSpotifyApi = new SpotifyWebApi();
console.log('Spotify Web API Node version:', SpotifyWebApi.version || (SpotifyWebApi.prototype.request ? '5.x or later' : 'Unknown/Old'));
console.log('Does spotifyApi.request exist?', typeof tempSpotifyApi.request);

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
    
    // Use node-fetch to get the queue
    const response = await fetch('https://api.spotify.com/v1/me/player/queue', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`Spotify queue fetch failed: ${response.status}`);
    }
    const queueData = await response.json();
    console.log('Spotify queue data:', {
      hasQueue: !!queueData.queue,
      queueLength: queueData.queue ? queueData.queue.length : 0,
      currentlyPlaying: queueData.currently_playing ? queueData.currently_playing.name : 'None'
    });
    return queueData.queue || [];
  } catch (error) {
    console.error('Error getting Spotify queue:', error);
    return [];
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    console.log('Client joining session:', sessionId);
    socket.join(sessionId);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

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

  // Add track to queue (app-managed queue)
  socket.on('add-to-queue', async ({ sessionId, track }) => {
    console.log(`App-managed: Adding track to queue for session ${sessionId}:`, {
      trackName: track.name,
      trackUri: track.uri,
    });
    try {
      // Add to app-managed queue
      if (!sessionQueues.has(sessionId)) sessionQueues.set(sessionId, []);
      const queue = sessionQueues.get(sessionId);
      queue.push(track);
      sessionQueues.set(sessionId, queue);
      console.log(`App-managed: Track added. Queue now has ${queue.length} tracks.`);
      // Broadcast queue update to all clients in the session
      io.to(sessionId).emit('queue-update', { queue });
    } catch (error) {
      console.error('App-managed: Error adding to queue:', error);
      socket.emit('queue-error', { message: error.message || 'Failed to add track to queue.' });
    }
  });

  // Remove track from queue (app-managed queue)
  socket.on('remove-from-queue', async ({ sessionId, trackUri }) => {
    console.log(`App-managed: Removing track from queue for session ${sessionId}:`, { trackUri });
    try {
      if (!sessionQueues.has(sessionId)) sessionQueues.set(sessionId, []);
      let queue = sessionQueues.get(sessionId);
      const originalLength = queue.length;
      queue = queue.filter(track => track.uri !== trackUri);
      sessionQueues.set(sessionId, queue);
      console.log(`App-managed: Track removed. Queue now has ${queue.length} tracks (was ${originalLength}).`);
      // Broadcast queue update to all clients in the session
      io.to(sessionId).emit('queue-update', { queue });
    } catch (error) {
      console.error('App-managed: Error removing from queue:', error);
      socket.emit('queue-error', { message: error.message || 'Failed to remove track from queue.' });
    }
  });

  // Get current queue (app-managed queue)
  socket.on('get-queue', async ({ sessionId }) => {
    console.log(`App-managed: Getting queue for session ${sessionId}`);
    try {
      if (!sessionQueues.has(sessionId)) sessionQueues.set(sessionId, []);
      const queue = sessionQueues.get(sessionId);
      socket.emit('queue-update', { queue });
    } catch (error) {
      console.error('App-managed: Error getting queue:', error);
      socket.emit('queue-error', { message: error.message || 'Failed to get queue.' });
    }
  });

  // --- WebRTC Signaling Events ---
  // Guest initiates: send offer to host
  socket.on('webrtc-offer', ({ sessionId, offer }) => {
    console.log(`[WebRTC] Offer from ${socket.id} for session ${sessionId}`);
    socket.to(sessionId).emit('webrtc-offer', { offer, from: socket.id });
  });

  // Host sends answer back to guest
  socket.on('webrtc-answer', ({ sessionId, answer, to }) => {
    console.log(`[WebRTC] Answer from host to ${to} in session ${sessionId}`);
    io.to(to).emit('webrtc-answer', { answer });
  });

  // Both sides exchange ICE candidates
  socket.on('webrtc-ice-candidate', ({ sessionId, candidate, to }) => {
    console.log(`[WebRTC] ICE candidate from ${socket.id} to ${to} in session ${sessionId}`);
    io.to(to).emit('webrtc-ice-candidate', { candidate });
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
      'streaming',
      'playlist-read-private',
      'playlist-modify-public',
      'playlist-modify-private',
      'playlist-read-collaborative',
      'user-library-read' // liked songs
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

// Start the server
const port = process.env.PORT || 3001;
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

export default app; 