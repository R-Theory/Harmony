import { io } from 'socket.io-client';
import DebugLogger from '../utils/debug';

const debug = new DebugLogger('Socket');

let socket = null;
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

const getSocketUrl = () => {
  // In development, use localhost:3001
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3001';
  }
  // Use Render backend in production
  return 'https://harmony-backend-nxqv.onrender.com';
};

const createSocket = () => {
  if (socket?.connected) {
    debug.log('Socket already connected, returning existing instance');
    return socket;
  }

  if (isConnecting) {
    debug.log('Socket connection already in progress');
    return socket;
  }

  isConnecting = true;
  debug.log('Creating new socket connection');

  const url = getSocketUrl();
  const options = {
    transports: ['websocket'],
    upgrade: false,
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    forceNew: true,
    secure: true,
    rejectUnauthorized: false
  };

  socket = io(url, options);

  socket.on('connect_error', (error) => {
    debug.logError(error, 'Socket connection error');
    isConnecting = false;
    reconnectAttempts++;
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      debug.log('Max reconnection attempts reached, falling back to polling');
      socket.io.opts.transports = ['polling'];
    }
  });

  socket.on('connect', () => {
    debug.log('Socket connected successfully');
    isConnecting = false;
    reconnectAttempts = 0;
  });

  socket.on('disconnect', (reason) => {
    debug.log('Socket disconnected', { reason });
    isConnecting = false;
  });

  socket.on('error', (error) => {
    debug.logError(error, 'Socket error');
  });

  socket.io.on('reconnect_attempt', (attempt) => {
    debug.log('Attempting to reconnect', { attempt });
  });

  socket.io.on('reconnect', (attempt) => {
    debug.log('Reconnected successfully', { attempt });
    reconnectAttempts = 0;
  });

  socket.io.on('reconnect_error', (error) => {
    debug.logError(error, 'Reconnection error');
  });

  socket.io.on('reconnect_failed', () => {
    debug.log('Failed to reconnect after all attempts');
  });

  socket.io.engine.on('upgrade', () => {
    debug.log('Transport upgraded to WebSocket');
  });

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    return createSocket();
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    debug.log('Disconnecting socket');
    socket.disconnect();
    socket = null;
    isConnecting = false;
    reconnectAttempts = 0;
  }
};

export default getSocket; 