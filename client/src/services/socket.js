const getSocketUrl = () => {
  // In development, use localhost:3001
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3001';
  }
  // Use Render backend in production
  return 'https://harmony-backend-nxqv.onrender.com';
};

const socket = io(getSocketUrl(), {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  withCredentials: true
});

// Add connection event listeners for debugging
socket.on('connect_error', (error) => {
  console.error('Socket connection error:', error);
});

socket.on('connect', () => {
  console.log('Socket connected successfully to:', getSocketUrl());
});

socket.on('disconnect', (reason) => {
  console.log('Socket disconnected:', reason);
}); 