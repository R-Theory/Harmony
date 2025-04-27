const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000', {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
}); 