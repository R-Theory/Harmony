import { io } from 'socket.io-client';
import { addToQueue as spotifyAddToQueue, skipToNext, getQueue } from './spotify';

class QueueService {
  constructor() {
    this.socket = null;
    this.sessionId = null;
    this.onQueueUpdate = null;
    this.onError = null;
    this.isConnected = false;
  }

  connect(sessionId) {
    if (this.socket) {
      this.disconnect();
    }

    this.sessionId = sessionId;
    console.log('Connecting to Socket.IO server...');
    
    // Get the current hostname and determine the API URL
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    // Determine the Socket.IO server URL
    const socketUrl = isLocalhost 
      ? 'http://localhost:3001'
      : 'https://harmony-backend-nxqv.onrender.com';
    
    console.log('Connecting to Socket.IO server at:', socketUrl);
    
    // Update Socket.IO configuration
    this.socket = io(socketUrl, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      withCredentials: true,
      path: '/api/socket.io/',
      forceNew: true,
      upgrade: true,
      rememberUpgrade: true,
      rejectUnauthorized: false,
      // Add more robust configuration
      connectTimeout: 45000,
      upgradeTimeout: 30000,
      maxHttpBufferSize: 1e8,
      // Add more detailed error handling
      perMessageDeflate: {
        threshold: 1024
      },
      // Add query parameters for debugging
      query: {
        clientType: 'web',
        version: '1.0.0',
        timestamp: Date.now()
      }
    });

    // Set up event listeners
    this.socket.on('connect', () => {
      console.log('Connected to queue service:', {
        id: this.socket.id,
        url: socketUrl,
        time: new Date().toISOString()
      });
      this.isConnected = true;
      this.socket.emit('join-session', sessionId);
    });

    this.socket.on('queue-update', (data) => {
      console.log('Received queue update from server:', data);
      if (this.onQueueUpdate) {
        this.onQueueUpdate(data.queue);
      }
    });

    this.socket.on('queue-error', (data) => {
      console.error('Received queue error from server:', data);
      if (this.onError) {
        this.onError(data.message);
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', {
        error: error.message,
        code: error.code,
        time: new Date().toISOString()
      });
      this.isConnected = false;
      if (this.onError) {
        this.onError('Failed to connect to queue service. Please try refreshing the page.');
      }
      // Attempt to reconnect with exponential backoff
      setTimeout(() => {
        if (!this.isConnected) {
          console.log('Attempting to reconnect...');
          this.socket.connect();
        }
      }, 5000);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', {
        error: error.message,
        time: new Date().toISOString()
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from queue service:', {
        reason,
        time: new Date().toISOString()
      });
      this.isConnected = false;
      if (reason === 'io server disconnect') {
        // The server has forcefully disconnected the socket
        setTimeout(() => {
          console.log('Attempting to reconnect after server disconnect...');
          this.socket.connect();
        }, 5000);
      }
    });

    // Handle reconnection
    this.socket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected to queue service:', {
        attemptNumber,
        time: new Date().toISOString()
      });
      this.isConnected = true;
      if (this.sessionId) {
        this.socket.emit('join-session', this.sessionId);
      }
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('Socket reconnection error:', {
        error: error.message,
        time: new Date().toISOString()
      });
      // Implement exponential backoff for reconnection attempts
      const delay = Math.min(1000 * Math.pow(2, this.socket.io.reconnectionAttempts), 30000);
      setTimeout(() => {
        if (!this.isConnected) {
          console.log('Retrying reconnection after error...');
          this.socket.connect();
        }
      }, delay);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed');
      if (this.onError) {
        this.onError('Failed to reconnect to queue service. Please try refreshing the page.');
      }
      // Final attempt to reconnect after a longer delay
      setTimeout(() => {
        if (!this.isConnected) {
          console.log('Making final reconnection attempt...');
          this.socket.connect();
        }
      }, 10000);
    });

    // Add more detailed logging
    this.socket.on('connect_timeout', (timeout) => {
      console.error('Socket connection timeout:', {
        timeout,
        time: new Date().toISOString()
      });
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('Reconnection attempt:', {
        attemptNumber,
        time: new Date().toISOString()
      });
    });

    this.socket.on('reconnecting', (attemptNumber) => {
      console.log('Reconnecting to queue service:', {
        attemptNumber,
        time: new Date().toISOString()
      });
    });

    this.socket.on('ping', () => {
      console.log('Socket ping');
    });

    this.socket.on('pong', (latency) => {
      console.log('Socket pong:', {
        latency,
        time: new Date().toISOString()
      });
    });
  }

  disconnect() {
    if (this.socket) {
      if (this.sessionId) {
        this.socket.emit('leave-session', this.sessionId);
      }
      this.socket.disconnect();
      this.socket = null;
      this.sessionId = null;
      this.isConnected = false;
    }
  }

  setCallbacks(onQueueUpdate, onError) {
    this.onQueueUpdate = async (queue) => {
      if (onQueueUpdate) {
        await this.syncQueueWithSpotify(queue);
        onQueueUpdate(queue);
      }
    };
    this.onError = onError;
  }

  async addToQueue(track) {
    if (!this.socket || !this.sessionId) {
      throw new Error('Not connected to a session');
    }
    if (!this.isConnected) {
      throw new Error('Socket connection is not active');
    }
    console.log('App-managed: Adding track to queue:', {
      trackName: track.name,
      trackUri: track.uri,
      sessionId: this.sessionId
    });
    try {
      // Add to Spotify queue if it's a Spotify track
      if (track.source === 'spotify') {
        const accessToken = localStorage.getItem('spotify_access_token');
        if (accessToken) {
          try {
            await spotifyAddToQueue(track.uri, accessToken);
            console.log('Spotify: Track added to Spotify queue');
          } catch (spotifyError) {
            console.error('Spotify: Error adding to queue:', spotifyError);
            // Continue with app-managed queue even if Spotify queue fails
          }
        }
      }

      // Add to app-managed queue
      this.socket.emit('add-to-queue', {
        sessionId: this.sessionId,
        track
      });
      console.log('App-managed: Emitted add-to-queue event to server');
    } catch (error) {
      console.error('App-managed: Error adding to queue:', error);
      throw error;
    }
  }

  async removeFromQueue(track) {
    if (!this.socket || !this.sessionId) {
      throw new Error('Not connected to a session');
    }
    if (!this.isConnected) {
      throw new Error('Socket connection is not active');
    }
    console.log('App-managed: Removing track from queue:', {
      trackName: track.name,
      trackUri: track.uri,
      sessionId: this.sessionId
    });
    try {
      // Remove from Spotify queue if it's a Spotify track
      if (track.source === 'spotify') {
        const accessToken = localStorage.getItem('spotify_access_token');
        if (accessToken) {
          try {
            // Since Spotify doesn't support direct queue removal,
            // we'll skip to the next track if this is the current track
            const state = await spotifyPlayerRef?.current?.getCurrentState();
            if (state?.track_window?.current_track?.uri === track.uri) {
              await skipToNext(accessToken);
              console.log('Spotify: Skipped current track');
            }
          } catch (spotifyError) {
            console.error('Spotify: Error removing from queue:', spotifyError);
            // Continue with app-managed queue even if Spotify queue fails
          }
        }
      }

      // Remove from app-managed queue
      this.socket.emit('remove-from-queue', {
        sessionId: this.sessionId,
        trackUri: track.uri
      });
      console.log('App-managed: Emitted remove-from-queue event to server');
    } catch (error) {
      console.error('App-managed: Error removing from queue:', error);
      throw error;
    }
  }

  getQueue() {
    if (!this.socket || !this.sessionId) {
      throw new Error('Not connected to a session');
    }
    // No accessToken needed for app-managed queue
    this.socket.emit('get-queue', {
      sessionId: this.sessionId
    });
  }

  async syncQueueWithSpotify(queue) {
    if (!queue || queue.length === 0) return;

    const accessToken = localStorage.getItem('spotify_access_token');
    if (!accessToken) {
      console.log('Spotify: No access token available for queue sync');
      return;
    }

    try {
      // Get current Spotify queue
      const { queue: spotifyQueue } = await getQueue(accessToken);
      
      // If this is the first track in our queue, handle it specially
      if (queue.length === 1) {
        console.log('Spotify: Handling first track in queue');
        try {
          // First, clear the current queue by skipping through all tracks
          if (spotifyQueue.length > 0) {
            console.log('Spotify: Clearing existing queue');
            for (let i = 0; i < spotifyQueue.length; i++) {
              await skipToNext(accessToken);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }

          // Then add our track
          await spotifyAddToQueue(queue[0].uri, accessToken);
          console.log('Spotify: Added first track to queue:', queue[0].name);
          await new Promise(resolve => setTimeout(resolve, 500));
          return;
        } catch (error) {
          console.error('Spotify: Error handling first track:', error);
          if (error.message?.includes('404')) {
            localStorage.removeItem('spotify_access_token');
            window.location.reload();
            return;
          }
        }
      }

      // For subsequent tracks, just add them to the queue
      // Create a map of URIs for faster lookup
      const spotifyUriMap = new Map(spotifyQueue.map(track => [track.uri, track]));
      const sessionUriMap = new Map(queue.map(track => [track.uri, track]));

      // Add any missing tracks to Spotify's queue
      for (const track of queue) {
        if (track.source === 'spotify' && !spotifyUriMap.has(track.uri)) {
          try {
            await spotifyAddToQueue(track.uri, accessToken);
            console.log('Spotify: Added track to queue:', track.name);
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
            console.error('Spotify: Error adding track to queue:', error);
            if (error.message?.includes('404')) {
              localStorage.removeItem('spotify_access_token');
              window.location.reload();
              return;
            }
          }
        }
      }

      console.log('Spotify: Queue sync complete');
    } catch (error) {
      console.error('Spotify: Error syncing queue:', error);
      if (error.message?.includes('404')) {
        localStorage.removeItem('spotify_access_token');
        window.location.reload();
      }
    }
  }
}

// Export a singleton instance
export const queueService = new QueueService(); 