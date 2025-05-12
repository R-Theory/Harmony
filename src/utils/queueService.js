import { io } from 'socket.io-client';
import { addToQueue as spotifyAddToQueue, skipToNext, getQueue } from './spotify';

class QueueService {
  constructor() {
    this.socket = null;
    this.sessionId = null;
    this.onQueueUpdate = null;
    this.onError = null;
    this.isConnected = false;
    this.isSyncing = false;
    this.lastSyncTime = 0;
    this.SYNC_COOLDOWN = 2000; // 2 seconds between syncs
    this.lastQueueState = null; // Track the last known queue state
    this.debug = new DebugLogger('QueueService');
    this.queue = [];
    this.spotifyDeviceId = null;
    this.spotifyToken = null;
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
        // Only sync if there are meaningful changes to the queue
        if (this.shouldSyncQueue(queue)) {
          await this.syncQueueWithSpotify(queue);
        }
        onQueueUpdate(queue);
      }
    };
    this.onError = onError;
  }

  shouldSyncQueue(newQueue) {
    if (!this.lastQueueState) {
      this.lastQueueState = newQueue;
      return true; // First sync
    }

    // Check if a track was added
    const newTracks = newQueue.filter(track => 
      !this.lastQueueState.some(oldTrack => oldTrack.uri === track.uri)
    );
    if (newTracks.length > 0) {
      console.log('Spotify: New tracks added to queue, syncing');
      this.lastQueueState = newQueue;
      return true;
    }

    // Check if a track was removed
    const removedTracks = this.lastQueueState.filter(track =>
      !newQueue.some(newTrack => newTrack.uri === track.uri)
    );
    if (removedTracks.length > 0) {
      console.log('Spotify: Tracks removed from queue, syncing');
      this.lastQueueState = newQueue;
      return true;
    }

    // No meaningful changes
    return false;
  }

  async verifyQueueSync(sessionQueue, spotifyQueue, appleMusicQueue) {
    if (!sessionQueue || !spotifyQueue || !appleMusicQueue) {
      this.debug.log('Cannot verify queue sync - missing queue data', {
        hasSessionQueue: !!sessionQueue,
        hasSpotifyQueue: !!spotifyQueue,
        hasAppleMusicQueue: !!appleMusicQueue
      });
      return false;
    }

    // Filter session queue by source
    const sessionSpotifyTracks = sessionQueue.filter(track => track.source === 'spotify');
    const sessionAppleMusicTracks = sessionQueue.filter(track => track.source === 'appleMusic');
    
    // Create arrays of IDs for comparison
    const sessionSpotifyIds = sessionSpotifyTracks.map(track => track.uri);
    const sessionAppleMusicIds = sessionAppleMusicTracks.map(track => track.appleMusicId);
    const spotifyIds = spotifyQueue.map(track => track.uri);
    const appleMusicIds = appleMusicQueue.map(track => track.id);

    // Verify Spotify queue
    const missingSpotifyTracks = sessionSpotifyIds.filter(id => !spotifyIds.includes(id));
    if (missingSpotifyTracks.length > 0) {
      this.debug.error('Spotify queue verification failed - missing tracks', {
        missingTracks: missingSpotifyTracks,
        sessionQueueLength: sessionQueue.length,
        spotifyQueueLength: spotifyQueue.length
      });
      return false;
    }

    // Verify Apple Music queue
    const missingAppleMusicTracks = sessionAppleMusicIds.filter(id => !appleMusicIds.includes(id));
    if (missingAppleMusicTracks.length > 0) {
      this.debug.error('Apple Music queue verification failed - missing tracks', {
        missingTracks: missingAppleMusicTracks,
        sessionQueueLength: sessionQueue.length,
        appleMusicQueueLength: appleMusicQueue.length
      });
      return false;
    }

    // Verify order for both queues
    const orderedSpotifyIds = spotifyIds.filter(id => sessionSpotifyIds.includes(id));
    const orderedSessionSpotifyIds = sessionSpotifyIds.filter(id => spotifyIds.includes(id));
    const orderedAppleMusicIds = appleMusicIds.filter(id => sessionAppleMusicIds.includes(id));
    const orderedSessionAppleMusicIds = sessionAppleMusicIds.filter(id => appleMusicIds.includes(id));

    const spotifyOrderMatches = orderedSpotifyIds.every((id, index) => id === orderedSessionSpotifyIds[index]);
    const appleMusicOrderMatches = orderedAppleMusicIds.every((id, index) => id === orderedSessionAppleMusicIds[index]);

    if (!spotifyOrderMatches || !appleMusicOrderMatches) {
      this.debug.error('Queue verification failed - order mismatch', {
        spotifyOrderMatches,
        appleMusicOrderMatches,
        sessionSpotifyOrder: orderedSessionSpotifyIds,
        spotifyOrder: orderedSpotifyIds,
        sessionAppleMusicOrder: orderedSessionAppleMusicIds,
        appleMusicOrder: orderedAppleMusicIds
      });
      return false;
    }

    this.debug.log('Queue verification passed', {
      sessionQueueLength: sessionQueue.length,
      spotifyQueueLength: spotifyQueue.length,
      appleMusicQueueLength: appleMusicQueue.length,
      spotifyTracksInSession: sessionSpotifyTracks.length,
      appleMusicTracksInSession: sessionAppleMusicTracks.length
    });
    return true;
  }

  async syncQueueWithSpotify(sessionQueue) {
    try {
      // Only sync Spotify tracks
      const spotifyTracks = sessionQueue.filter(track => track.source === 'spotify');
      
      if (spotifyTracks.length === 0) {
        this.debug.log('No Spotify tracks to sync');
        return;
      }

      const accessToken = localStorage.getItem('spotify_access_token');
      if (!accessToken) {
        this.debug.log('No Spotify access token available');
        return;
      }

      // Get current Spotify queue
      const { queue: currentSpotifyQueue } = await getQueue(accessToken);
      
      // Handle first track in queue
      if (spotifyTracks.length > 0) {
        const firstTrack = spotifyTracks[0];
        this.debug.log('Handling first track in queue', {
          trackUri: firstTrack.uri,
          trackName: firstTrack.name,
          currentSpotifyQueue
        });

        // Only add to Spotify queue if it's a Spotify track and not already in queue
        if (firstTrack.source === 'spotify') {
          const isAlreadyInQueue = currentSpotifyQueue.some(track => track.uri === firstTrack.uri);
          if (!isAlreadyInQueue) {
            this.debug.log('Adding new track to queue first');
            await spotifyAddToQueue(firstTrack.uri, accessToken);
          } else {
            this.debug.log('First track already in queue, skipping');
          }
        }
      }

      // Sync remaining tracks
      for (let i = 1; i < spotifyTracks.length; i++) {
        const track = spotifyTracks[i];
        if (track.source === 'spotify') {
          const isAlreadyInQueue = currentSpotifyQueue.some(qTrack => qTrack.uri === track.uri);
          if (!isAlreadyInQueue) {
            await spotifyAddToQueue(track.uri, accessToken);
          }
        }
      }

      this.debug.log('Spotify queue sync complete');
    } catch (error) {
      this.debug.error('Error syncing Spotify queue:', error);
      throw error;
    }
  }

  async syncQueueWithAppleMusic(sessionQueue) {
    try {
      // Only sync Apple Music tracks
      const appleMusicTracks = sessionQueue.filter(track => track.source === 'appleMusic');
      
      if (appleMusicTracks.length === 0) {
        this.debug.log('No Apple Music tracks to sync');
        return;
      }

      if (!window.MusicKit) {
        this.debug.log('MusicKit not available');
        return;
      }

      const music = window.MusicKit.getInstance();
      
      // Ensure user is authorized
      if (!music.isAuthorized) {
        this.debug.log('Authorizing Apple Music user');
        await music.authorize();
      }

      // Set up the queue with all Apple Music tracks
      await music.setQueue({
        items: appleMusicTracks.map(track => ({
          id: track.appleMusicId,
          type: 'songs'
        }))
      });

      this.debug.log('Apple Music queue sync complete', {
        trackCount: appleMusicTracks.length
      });
    } catch (error) {
      this.debug.error('Error syncing Apple Music queue:', error);
      throw error;
    }
  }

  async addToQueue(track) {
    try {
      this.debug.log('[QueueService] Adding track to queue:', track);

      // Add to local queue first
      this.queue.push(track);
      if (this.socket) {
        this.socket.emit('queue-update', { queue: this.queue });
      }

      // Add to Spotify queue if it's a Spotify track
      if (track.source === 'spotify') {
        try {
          // Ensure we have a valid device ID
          if (!this.spotifyDeviceId) {
            throw new Error('No Spotify device ID available');
          }

          // Transfer playback to our device first
          await this.transferPlayback();
          
          // Add to queue
          await this.addToSpotifyQueue(track.uri);
          this.debug.log('[QueueService] Track added to Spotify queue');
        } catch (error) {
          this.debug.error('[QueueService] Error adding to Spotify queue:', error);
          // Don't throw here - we still want to keep the track in our local queue
        }
      }

      // Add to Apple Music queue if it's an Apple Music track
      if (track.source === 'appleMusic') {
        try {
          await this.addToAppleMusicQueue(track);
          this.debug.log('[QueueService] Track added to Apple Music queue');
        } catch (error) {
          this.debug.error('[QueueService] Error adding to Apple Music queue:', error);
          // Don't throw here - we still want to keep the track in our local queue
        }
      }

      // Emit add-to-queue event to server
      if (this.socket) {
        this.socket.emit('add-to-queue', {
          track,
          sessionId: this.sessionId
        });
      }

      return true;
    } catch (error) {
      this.debug.error('[QueueService] ERROR:', error);
      throw error;
    }
  }

  async getCurrentPlayback() {
    try {
      if (!this.spotifyToken) {
        this.debug.error('[QueueService] No Spotify token available');
        throw new Error('No Spotify token available');
      }

      this.debug.log('[QueueService] Getting current playback state', {
        token: this.spotifyToken.substring(0, 10) + '...',
        deviceId: this.spotifyDeviceId
      });

      const response = await fetch('https://api.spotify.com/v1/me/player', {
        headers: {
          'Authorization': `Bearer ${this.spotifyToken}`
        }
      });

      this.debug.log('[QueueService] Spotify API response status:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        if (response.status === 204) {
          this.debug.log('[QueueService] No active device');
          return null;
        }
        if (response.status === 401) {
          this.debug.error('[QueueService] Token expired or invalid');
          throw new Error('Token expired or invalid');
        }
        const errorText = await response.text();
        this.debug.error('[QueueService] Spotify API error response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error(`Failed to get playback state: ${response.statusText}`);
      }

      const responseText = await response.text();
      this.debug.log('[QueueService] Raw API response:', responseText);

      if (!responseText) {
        this.debug.log('[QueueService] Empty response from Spotify API');
        return null;
      }

      try {
        const data = JSON.parse(responseText);
        this.debug.log('[QueueService] Parsed playback state:', {
          device: data.device,
          isPlaying: !data.is_playing,
          currentTrack: data.item
        });
        return data;
      } catch (parseError) {
        this.debug.error('[QueueService] Failed to parse Spotify API response:', {
          error: parseError,
          responseText
        });
        throw new Error('Invalid JSON response from Spotify API');
      }
    } catch (error) {
      this.debug.error('[QueueService] Error getting current playback:', error);
      throw error;
    }
  }

  async transferPlayback() {
    try {
      if (!this.spotifyDeviceId) {
        throw new Error('No Spotify device ID available');
      }

      // First check if we need to transfer playback
      const currentPlayback = await this.getCurrentPlayback();
      if (currentPlayback?.device?.id === this.spotifyDeviceId) {
        this.debug.log('[QueueService] Already playing on correct device');
        return;
      }

      // Transfer playback to our device
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.spotifyToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          device_ids: [this.spotifyDeviceId],
          play: false
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to transfer playback: ${error.error?.message || response.statusText}`);
      }

      this.debug.log('[QueueService] Successfully transferred playback');
    } catch (error) {
      this.debug.error('[QueueService] Error transferring playback:', error);
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
            // Skip to next track to remove the current one
            await skipToNext(accessToken);
            console.log('Spotify: Skipped current track');
            // Wait a moment for the skip to take effect
            await new Promise(resolve => setTimeout(resolve, 500));
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

  async addToAppleMusicQueue(track) {
    try {
      this.debug.log('[QueueService] Starting Apple Music queue addition:', {
        trackId: track.appleMusicId,
        trackName: track.name,
        trackSource: track.source,
        timestamp: new Date().toISOString()
      });

      if (!window.MusicKit) {
        this.debug.error('[QueueService] MusicKit not available');
        throw new Error('MusicKit not available');
      }

      const music = window.MusicKit.getInstance();
      
      // Log MusicKit instance state
      this.debug.log('[QueueService] MusicKit instance state:', {
        isAuthorized: music.isAuthorized,
        isPlaying: music.player.isPlaying,
        currentTrack: music.player.nowPlayingItem,
        queueLength: music.player.queue.items.length,
        canPlay: music.player.canPlay
      });
      
      // Ensure user is authorized
      if (!music.isAuthorized) {
        this.debug.log('[QueueService] Starting Apple Music authorization');
        try {
          await music.authorize();
          this.debug.log('[QueueService] Apple Music authorization successful');
        } catch (authError) {
          this.debug.error('[QueueService] Apple Music authorization failed:', {
            error: authError.message,
            stack: authError.stack
          });
          throw new Error('Failed to authorize Apple Music');
        }
      }

      // Check if we have a valid track ID
      if (!track.appleMusicId) {
        this.debug.error('[QueueService] Invalid Apple Music track ID');
        throw new Error('Invalid Apple Music track ID');
      }

      // Get current queue state
      const currentQueue = music.player.queue.items;
      this.debug.log('[QueueService] Current Apple Music queue state:', {
        queueLength: currentQueue.length,
        currentTrack: music.player.nowPlayingItem,
        isPlaying: music.player.isPlaying,
        playbackState: music.player.playbackState,
        queueItems: currentQueue.map(item => ({
          id: item.id,
          type: item.type
        }))
      });

      // Add track to queue
      try {
        // First check if the track is playable
        this.debug.log('[QueueService] Checking if track is playable:', track.appleMusicId);
        const catalogTrack = await music.api.song(track.appleMusicId);
        this.debug.log('[QueueService] Track catalog info:', {
          hasCatalogTrack: !!catalogTrack,
          hasPlayParams: !!catalogTrack?.attributes?.playParams,
          trackAttributes: catalogTrack?.attributes
        });

        if (!catalogTrack || !catalogTrack.attributes?.playParams) {
          throw new Error('Track is not playable');
        }

        // Stop current playback if any
        if (music.player.isPlaying) {
          this.debug.log('[QueueService] Stopping current playback');
          await music.player.stop();
          this.debug.log('[QueueService] Current playback stopped');
        }

        // Get the current queue items
        const existingQueueItems = music.player.queue.items.map(item => ({
          id: item.id,
          type: 'songs'
        }));

        // Add the new track to the queue
        this.debug.log('[QueueService] Adding track to existing queue:', {
          newTrackId: track.appleMusicId,
          existingQueueLength: existingQueueItems.length
        });

        // Set the queue with all items
        await music.setQueue({
          items: [...existingQueueItems, {
            id: track.appleMusicId,
            type: 'songs'
          }]
        });

        // Verify track was added
        const newQueue = music.player.queue.items;
        const trackAdded = newQueue.some(item => item.id === track.appleMusicId);
        
        this.debug.log('[QueueService] Queue verification:', {
          trackAdded,
          newQueueLength: newQueue.length,
          queueItems: newQueue.map(item => ({
            id: item.id,
            type: item.type
          }))
        });
        
        if (!trackAdded) {
          this.debug.error('[QueueService] Failed to verify track addition to queue');
          throw new Error('Failed to add track to Apple Music queue');
        }

        // Start playback if this is the first track
        if (newQueue.length === 1) {
          this.debug.log('[QueueService] This is the first track, starting playback');
          try {
            // Wait for MusicKit to be ready
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Check if we need to reauthorize
            if (!music.isAuthorized) {
              this.debug.log('[QueueService] Reauthorizing Apple Music');
              await music.authorize();
            }

            // Set up playback state change listener
            music.addEventListener('playbackStateDidChange', (event) => {
              this.debug.log('[QueueService] Apple Music playback state changed:', {
                isPlaying: !event.player.paused,
                currentTrack: event.player.nowPlayingItem,
                playbackState: event.player.playbackState,
                timestamp: new Date().toISOString()
              });
            });

            // Initialize playback
            this.debug.log('[QueueService] Initializing playback');
            await music.player.play();
            
            // Verify playback started
            setTimeout(() => {
              this.debug.log('[QueueService] Playback status after start:', {
                isPlaying: music.player.isPlaying,
                currentTrack: music.player.nowPlayingItem,
                playbackState: music.player.playbackState,
                timestamp: new Date().toISOString()
              });
            }, 1000);

            this.debug.log('[QueueService] Apple Music playback started successfully');
          } catch (playError) {
            this.debug.error('[QueueService] Failed to start playback:', {
              error: playError?.message || 'Unknown error',
              stack: playError?.stack,
              playbackState: music.player.playbackState,
              isPlaying: music.player.isPlaying
            });

            // Try to reauthorize and retry playback
            try {
              this.debug.log('[QueueService] Attempting to reauthorize and retry playback');
              await music.authorize();
              await music.player.play();
              this.debug.log('[QueueService] Playback started after reauthorization');
            } catch (retryError) {
              this.debug.error('[QueueService] Failed to start playback after retry:', retryError);
              throw new Error('Failed to start Apple Music playback after retry');
            }
          }
        } else {
          this.debug.log('[QueueService] Track added to queue, no playback needed');
        }

      } catch (queueError) {
        this.debug.error('[QueueService] Error adding to Apple Music queue:', {
          error: queueError?.message || 'Unknown error',
          stack: queueError?.stack,
          playbackState: music.player.playbackState
        });
        throw new Error('Failed to add track to Apple Music queue');
      }

    } catch (error) {
      this.debug.error('[QueueService] Error in addToAppleMusicQueue:', {
        error: error?.message || 'Unknown error',
        stack: error?.stack,
        track: {
          id: track?.appleMusicId,
          name: track?.name
        }
      });
      throw error;
    }
  }

  async addToSpotifyQueue(trackUri) {
    try {
      const accessToken = localStorage.getItem('spotify_access_token');
      if (!accessToken) {
        throw new Error('No Spotify access token available');
      }

      await spotifyAddToQueue(trackUri, accessToken);
      this.debug.log('[QueueService] Track added to Spotify queue:', trackUri);
    } catch (error) {
      this.debug.error('[QueueService] Error adding to Spotify queue:', error);
      throw error;
    }
  }
}

// Debug Logger class
class DebugLogger {
  constructor(component) {
    this.component = component;
    this.logs = [];
    this.maxLogs = 1000;
  }

  log(message, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      component: this.component,
      message,
      data
    };
    
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    console.log(`[${this.component}] ${message}`, data);
  }

  error(message, error) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      component: this.component,
      message: `ERROR: ${message}`,
      error: error.message,
      stack: error.stack
    };
    
    this.logs.push(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    console.error(`[${this.component}] ERROR: ${message}`, error);
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
  }
}

// Export a singleton instance
export const queueService = new QueueService(); 