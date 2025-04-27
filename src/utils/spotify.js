// Spotify API utility functions

// Search for tracks
export const searchTracks = async (query, accessToken) => {
  const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to search tracks');
  }
  
  const data = await response.json();
  return data.tracks.items;
};

// Get current queue
export const getQueue = async (accessToken) => {
  const response = await fetch('https://api.spotify.com/v1/me/player/queue', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get queue');
  }
  
  const data = await response.json();
  return {
    queue: data.queue || []
  };
};

// Add track to queue
export const addToQueue = async (uri, accessToken) => {
  const response = await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to add track to queue');
  }
};

// Remove track from queue (Note: Spotify API doesn't support direct queue removal)
export const removeFromQueue = async (uri, accessToken) => {
  // Since Spotify doesn't support direct queue removal,
  // we'll need to handle this through our Socket.IO implementation
  throw new Error('Queue removal must be handled through session management');
};

// Get current playback state
export const getPlaybackState = async (accessToken) => {
  const response = await fetch('https://api.spotify.com/v1/me/player', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to get playback state');
  }
  
  const data = await response.json();
  return data;
};

// Skip to next track
export const skipToNext = async (accessToken) => {
  const response = await fetch('https://api.spotify.com/v1/me/player/next', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to skip to next track');
  }
}; 