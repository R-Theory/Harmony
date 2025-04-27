import { io } from 'socket.io-client';
import { addToQueue as spotifyAddToQueue, skipToNext } from './spotify';

class QueueService {
  constructor() {
    this.socket = null;
    this.sessionId = null;
    this.onQueueUpdate = null;
    this.onError = null;
  }

  connect(sessionId) {
    if (this.socket) {
      this.disconnect();
    }

    this.sessionId = sessionId;
    this.socket = io();

    // Set up event listeners
    this.socket.on('connect', () => {
      console.log('Connected to queue service');
      this.socket.emit('join-session', sessionId);
    });

    this.socket.on('queue-update', (data) => {
      if (this.onQueueUpdate) {
        this.onQueueUpdate(data.queue);
      }
    });

    this.socket.on('queue-error', (data) => {
      if (this.onError) {
        this.onError(data.message);
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from queue service');
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

    try {
      // First add to Spotify queue
      await spotifyAddToQueue(track.uri, accessToken);
      
      // Then notify other users through Socket.IO
      this.socket.emit('add-to-queue', {
        sessionId: this.sessionId,
        track,
        accessToken
      });
    } catch (error) {
      console.error('Error adding to queue:', error);
      throw error;
    }
  }

  async removeFromQueue(track, accessToken) {
    if (!this.socket || !this.sessionId) {
      throw new Error('Not connected to a session');
    }

    try {
      // Since Spotify doesn't support direct queue removal,
      // we'll handle it through our Socket.IO implementation
      this.socket.emit('remove-from-queue', {
        sessionId: this.sessionId,
        trackUri: track.uri,
        accessToken
      });

      // Skip to next track as a workaround
      await skipToNext(accessToken);
    } catch (error) {
      console.error('Error removing from queue:', error);
      throw error;
    }
  }

  getQueue(accessToken) {
    if (!this.socket || !this.sessionId) {
      throw new Error('Not connected to a session');
    }

    this.socket.emit('get-queue', {
      sessionId: this.sessionId,
      accessToken
    });
  }
}

// Export a singleton instance
export const queueService = new QueueService(); 