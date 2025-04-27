import { ExpressPeerServer } from 'peer';

export function setupPeerServer(server) {
  const isProd = process.env.NODE_ENV === 'production';
  
  const peerServer = ExpressPeerServer(server, {
    debug: isProd ? false : true,
    path: '/peerjs',
    allow_discovery: true,
    proxied: true,
    pingInterval: 5000,
    pingTimeout: 3000,
    ssl: isProd ? {
      key: process.env.SSL_KEY,
      cert: process.env.SSL_CERT
    } : undefined,
    generateClientId: () => {
      // Generate a random string of 16 characters
      return Math.random().toString(36).substring(2, 15) + 
             Math.random().toString(36).substring(2, 15);
    }
  });

  peerServer.on('connection', (client) => {
    console.log('Peer connected:', client.getId());
  });

  peerServer.on('disconnect', (client) => {
    console.log('Peer disconnected:', client.getId());
  });

  peerServer.on('error', (error) => {
    console.error('PeerJS server error:', error);
  });

  return peerServer;
} 