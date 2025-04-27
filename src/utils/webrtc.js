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

      // Use a public PeerJS server with more resilient configuration
      const config = {
        host: '0.peerjs.com', // Public PeerJS server
        port: 443,
        path: '/',
        secure: true,
        debug: !isProd,
        config: {
          iceServers: [
            // Add more STUN servers for better connectivity
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            // Add TURN servers if available (these would come from your API)
            ...iceServers.filter(server => server.urls.startsWith('turn:'))
          ],
          iceCandidatePoolSize: 10,
          // Add more ICE configuration options for better connectivity
          iceTransportPolicy: 'all', // Try both UDP and TCP
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require',
          // Increase timeouts for slower networks
          iceConnectionTimeout: 10000,
          iceCheckingTimeout: 5000
        },
        pingInterval: PING_INTERVAL
      };

      console.log('Initializing PeerJS with config:', {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        iceServers: config.config.iceServers
      });
      
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
          peerId: error.peer || 'unknown',
          errorType: error.type || 'unknown',
          // Add more specific error messages based on the error type
          specificError: error.type === 'peer-unavailable' 
            ? 'The peer you are trying to connect to is not available. They may be offline or have disconnected.'
            : error.type === 'network'
              ? 'There was a network error while trying to connect to the peer.'
              : 'There was an error connecting to the peer.'
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

  async setupEventListeners() {
    return new Promise((resolve, reject) => {
      if (!this.peer) {
        reject(new Error('Peer not initialized'));
        return;
      }

      this.peer.on('open', (id) => {
        console.log('Connected to PeerJS server with ID:', id);
        this.peerId = id;
        this.reconnectAttempts = 0;
        this.notifyListeners('connected', { id });
        resolve();
      });

      this.peer.on('error', (error) => {
        console.error('PeerJS error:', error);
        const enhancedError = this.enhanceError(error, WebRTCErrorTypes.PEER_CONNECTION);
        this.notifyListeners('error', enhancedError);
        
        // Handle specific error types
        if (error.type === 'peer-unavailable') {
          console.log('Peer is unavailable, retrying connection...');
          this.retryConnection();
        }
      });

      this.peer.on('close', () => {
        console.log('Connection to PeerJS server closed');
        this.notifyListeners('disconnected');
        this.retryConnection();
      });

      this.peer.on('disconnected', () => {
        console.log('Disconnected from PeerJS server');
        this.notifyListeners('disconnected');
        this.retryConnection();
      });

      this.peer.on('connection', (conn) => {
        console.log('Received connection from peer:', conn.peer);
        this.handleIncomingConnection(conn);
      });
    });
  }

  async retryConnection() {
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      console.log(`Retrying connection (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      
      try {
        await this.initialize();
      } catch (error) {
        console.error('Failed to reconnect:', error);
        if (this.reconnectAttempts === MAX_RECONNECT_ATTEMPTS) {
          this.notifyListeners('error', this.enhanceError(error, WebRTCErrorTypes.SERVER_CONNECTION));
        }
      }
    } else {
      console.error('Max reconnection attempts reached');
      this.notifyListeners('error', this.enhanceError(
        new Error('Max reconnection attempts reached'),
        WebRTCErrorTypes.SERVER_CONNECTION
      ));
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
        console.log(`Attempting to connect to peer: ${peerId}`);
        
        // Check if we already have a connection to this peer
        if (this.connections.has(peerId)) {
          console.log(`Already connected to peer: ${peerId}`);
          resolve(this.connections.get(peerId));
          return;
        }
        
        // Set a timeout for the connection attempt
        const connectionTimeout = setTimeout(() => {
          console.error(`Connection timeout to peer: ${peerId}`);
          reject(new Error(`Connection timeout to peer: ${peerId}`));
        }, 10000); // 10 second timeout
        
        const conn = this.peer.connect(peerId);
        
        conn.on('open', () => {
          console.log(`Connected to peer: ${peerId}`);
          clearTimeout(connectionTimeout);
          this.handleConnection(conn);
          resolve(conn);
        });

        conn.on('error', (error) => {
          console.error(`Connection error with peer ${peerId}:`, error);
          clearTimeout(connectionTimeout);
          
          // If the peer is unavailable, try to reconnect after a delay
          if (error.type === 'peer-unavailable') {
            console.log(`Peer ${peerId} is unavailable, will retry in 3 seconds...`);
            setTimeout(() => {
              this.connect(peerId)
                .then(resolve)
                .catch(reject);
            }, 3000);
          } else {
            reject(error);
          }
        });
      } catch (error) {
        console.error(`Failed to connect to peer ${peerId}:`, error);
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