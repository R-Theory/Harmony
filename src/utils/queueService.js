import { io } from 'socket.io-client';
import { addToQueue as spotifyAddToQueue, skipToNext } from './spotify';

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
    this.socket = io();

    // Set up event listeners
    this.socket.on('connect', () => {
      console.log('Connected to queue service');
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

    this.socket.on('disconnect', () => {
      console.log('Disconnected from queue service');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.isConnected = false;
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
    this.onQueueUpdate = onQueueUpdate;
    this.onError = onError;
  }

  async addToQueue(track, accessToken) {
    if (!this.socket || !this.sessionId) {
      throw new Error('Not connected to a session');
    }

    if (!this.isConnected) {
      throw new Error('Socket connection is not active');
    }

    console.log('Adding track to queue:', {
      trackName: track.name,
      trackUri: track.uri,
      sessionId: this.sessionId
    });

    try {
      // First add to Spotify queue
      await spotifyAddToQueue(track.uri, accessToken);
      console.log('Successfully added track to Spotify queue');
      
      // Then notify other users through Socket.IO
      this.socket.emit('add-to-queue', {
        sessionId: this.sessionId,
        track,
        accessToken
      });
      console.log('Emitted add-to-queue event to server');
    } catch (error) {
      console.error('Error adding to queue:', error);
      throw error;
    }
  }

  async removeFromQueue(track, accessToken) {
    if (!this.socket || !this.sessionId) {
      throw new Error('Not connected to a session');
    }

    if (!this.isConnected) {
      throw new Error('Socket connection is not active');
    }

    console.log('Removing track from queue:', {
      trackName: track.name,
      trackUri: track.uri,
      sessionId: this.sessionId
    });

    try {
      // Since Spotify doesn't support direct queue removal,
      // we'll handle it through our Socket.IO implementation
      this.socket.emit('remove-from-queue', {
        sessionId: this.sessionId,
        trackUri: track.uri,
        accessToken
      });
      console.log('Emitted remove-from-queue event to server');

      // Skip to next track as a workaround
      await skipToNext(accessToken);
      console.log('Successfully skipped to next track in Spotify');
    } catch (error) {
      console.error('Error removing from queue:', error);
      throw error;
    }
  }

  getQueue(accessToken) {
    if (!this.socket || !this.sessionId) {
      throw new Error('Not connected to a session');
    }

    if (!this.isConnected) {
      throw new Error('Socket connection is not active');
    }

    console.log('Getting queue for session:', this.sessionId);
    this.socket.emit('get-queue', {
      sessionId: this.sessionId,
      accessToken
    });
    console.log('Emitted get-queue event to server');
  }
}

// Export a singleton instance
export const queueService = new QueueService(); 