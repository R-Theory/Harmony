import Peer from 'peerjs';
import { v4 as uuidv4 } from 'uuid';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;
const PING_INTERVAL = 5000;

// Error types for better error handling
export const WebRTCErrorTypes = {
  SERVER_CONNECTION: 'SERVER_CONNECTION',
  PEER_CONNECTION: 'PEER_CONNECTION',
  MEDIA: 'MEDIA',
  NETWORK: 'NETWORK',
  UNKNOWN: 'UNKNOWN'
};

export class WebRTCManager {
  constructor() {
    this.peer = null;
    this.connections = new Map();
    this.onDataCallback = null;
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this.connectionListeners = new Set();
    this.lastError = null;
  }

  async initialize() {
    const isProd = process.env.NODE_ENV === 'production';

    try {
      // Fetch ICE servers from our API
      const iceResponse = await fetch('/api/ice-servers');
      const { iceServers } = await iceResponse.json();

      // Use a public PeerJS server instead of our own
      const config = {
        host: '0.peerjs.com', // Public PeerJS server
        port: 443,
        path: '/',
        secure: true,
        debug: !isProd,
        config: {
          iceServers,
          iceCandidatePoolSize: 10
        },
        pingInterval: PING_INTERVAL
      };

      console.log('Initializing PeerJS with config:', config);
      
      this.peer = new Peer(null, config); // Let PeerJS generate the ID
      await this.setupEventListeners();
    } catch (error) {
      const enhancedError = this.enhanceError(error, WebRTCErrorTypes.SERVER_CONNECTION);
      console.error('Failed to initialize PeerJS:', enhancedError);
      this.notifyListeners('error', enhancedError);
      throw enhancedError;
    }
  }

  enhanceError(error, type) {
    const enhancedError = {
      type,
      message: error.message || 'Unknown error occurred',
      originalError: error,
      timestamp: new Date().toISOString(),
      details: this.getErrorDetails(error, type)
    };
    this.lastError = enhancedError;
    return enhancedError;
  }

  getErrorDetails(error, type) {
    switch (type) {
      case WebRTCErrorTypes.SERVER_CONNECTION:
        return {
          suggestion: 'Make sure the PeerJS server is running. Run "npm run server" in development.',
          code: error.code || 'CONNECTION_ERROR',
          host: this.peer?.options?.host,
          port: this.peer?.options?.port
        };
      case WebRTCErrorTypes.PEER_CONNECTION:
        return {
          suggestion: 'Check if the peer ID is correct and the peer is online.',
          peerId: error.peer || 'unknown'
        };
      case WebRTCErrorTypes.MEDIA:
        return {
          suggestion: 'Check if your microphone is properly connected and permissions are granted.',
          constraints: error.constraints
        };
      case WebRTCErrorTypes.NETWORK:
        return {
          suggestion: 'Check your internet connection and firewall settings.',
          iceServers: this.peer?.options?.config?.iceServers
        };
      default:
        return {
          suggestion: 'An unexpected error occurred. Check the console for more details.',
          errorType: error.type || 'unknown'
        };
    }
  }

  setupEventListeners() {
    return new Promise((resolve, reject) => {
      this.peer.on('open', (id) => {
        console.log('Connected to PeerJS server with ID:', id);
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.lastError = null;
        this.notifyListeners('connected', id);
        resolve(id);
      });

      this.peer.on('disconnected', () => {
        console.log('Disconnected from PeerJS server');
        this.handleDisconnection();
      });

      this.peer.on('close', () => {
        console.log('Connection closed');
        this.handleDisconnection();
      });

      this.peer.on('error', (error) => {
        console.error('PeerJS error:', error);
        const enhancedError = this.enhanceError(error, 
          error.type === 'network' ? WebRTCErrorTypes.NETWORK : 
          error.type === 'peer-unavailable' ? WebRTCErrorTypes.PEER_CONNECTION :
          WebRTCErrorTypes.UNKNOWN
        );
        
        if (error.type === 'network' || error.type === 'disconnected') {
          this.handleDisconnection();
        }
        this.notifyListeners('error', enhancedError);
        if (!this.peer.open) {
          reject(enhancedError);
        }
      });
    });
  }

  handleDisconnection() {
    if (this.isConnecting) return;

    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.isConnecting = true;
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

      setTimeout(async () => {
        try {
          if (this.peer && !this.peer.destroyed) {
            this.peer.reconnect();
          } else {
            await this.initialize();
          }
        } catch (error) {
          console.error('Reconnection failed:', error);
        } finally {
          this.isConnecting = false;
        }
      }, RECONNECT_DELAY);
    } else {
      console.error('Max reconnection attempts reached');
      this.notifyListeners('maxReconnectAttempts');
    }
  }

  handleConnection(conn) {
    this.connections.set(conn.peer, conn);

    conn.on('data', (data) => {
      console.log('Received data from:', conn.peer, data);
      if (this.onDataCallback) {
        this.onDataCallback(conn.peer, data);
      }
    });

    conn.on('close', () => {
      console.log('Connection closed with:', conn.peer);
      this.connections.delete(conn.peer);
    });

    conn.on('error', (error) => {
      console.error('Connection error with:', conn.peer, error);
      this.connections.delete(conn.peer);
    });
  }

  async connect(peerId) {
    if (!this.peer) {
      throw new Error('Peer not initialized');
    }

    return new Promise((resolve, reject) => {
      try {
        const conn = this.peer.connect(peerId);
        
        conn.on('open', () => {
          console.log('Connected to peer:', peerId);
          this.handleConnection(conn);
          resolve(conn);
        });

        conn.on('error', (error) => {
          console.error('Connection error:', error);
          reject(error);
        });
      } catch (error) {
        console.error('Failed to connect to peer:', error);
        reject(error);
      }
    });
  }

  sendData(peerId, data) {
    const conn = this.connections.get(peerId);
    if (conn) {
      conn.send(data);
    } else {
      console.error('No connection found for peer:', peerId);
    }
  }

  broadcast(data) {
    this.connections.forEach((conn) => {
      conn.send(data);
    });
  }

  setOnDataCallback(callback) {
    this.onDataCallback = callback;
  }

  addConnectionListener(listener) {
    this.connectionListeners.add(listener);
  }

  removeConnectionListener(listener) {
    this.connectionListeners.delete(listener);
  }

  notifyListeners(event, data) {
    this.connectionListeners.forEach(listener => {
      if (typeof listener === 'function') {
        listener(event, data);
      }
    });
  }

  destroy() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.connections.clear();
    this.connectionListeners.clear();
    this.reconnectAttempts = 0;
    this.isConnecting = false;
  }
}

export default new WebRTCManager(); 