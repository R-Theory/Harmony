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

// Get available devices
export const getDevices = async (accessToken) => {
  const response = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get devices');
  }

  const data = await response.json();
  return data.devices;
};

// Transfer playback to device
export const transferPlayback = async (deviceId, accessToken) => {
  const response = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      device_ids: [deviceId],
      play: false
    })
  });

  if (!response.ok) {
    throw new Error('Failed to transfer playback');
  }
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
  // First check if there's an active device
  const devices = await getDevices(accessToken);
  if (!devices || devices.length === 0) {
    throw new Error('No available Spotify devices found. Please open Spotify and start playing on any device.');
  }

  // Find active device or use the first available one
  let activeDevice = devices.find(device => device.is_active);
  if (!activeDevice) {
    activeDevice = devices[0];
    await transferPlayback(activeDevice.id, accessToken);
    // Wait a bit for the transfer to take effect
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Now try to add to queue
  const response = await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to add track to queue. Please ensure Spotify is open and playing.');
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