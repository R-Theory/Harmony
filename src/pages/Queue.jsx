import { useState, useEffect, useContext } from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Button,
  TextField,
  Paper,
  useTheme,
  CircularProgress,
  Divider,
  ListItemAvatar,
  Avatar,
  Alert,
  Snackbar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Search as SearchIcon,
  Apple as AppleIcon,
  MusicNote as MusicNoteIcon,
} from '@mui/icons-material';
import { searchTracks } from '../utils/spotify';
import { queueService } from '../utils/queueService';
import { useParams } from 'react-router-dom';

const Queue = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [notification, setNotification] = useState({ open: false, message: '', severity: 'success' });
  const [isSpotifyConnected, setIsSpotifyConnected] = useState(false);
  const [isAppleMusicConnected, setIsAppleMusicConnected] = useState(false);
  const [selectedService, setSelectedService] = useState('spotify');
  const theme = useTheme();
  const { sessionId } = useParams();

  // Detect connected services on mount
  useEffect(() => {
    const spotify = localStorage.getItem('spotify_connected') === 'true';
    const appleMusic = localStorage.getItem('apple_music_connected') === 'true';
    setIsSpotifyConnected(spotify);
    setIsAppleMusicConnected(appleMusic);
    if (appleMusic) setSelectedService('appleMusic');
    else if (spotify) setSelectedService('spotify');
  }, []);

  // Get access token from URL or localStorage
  const getAccessToken = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('access_token') || localStorage.getItem('spotify_access_token');
    return token;
  };

  // Initialize queue service connection
  useEffect(() => {
    if (sessionId) {
      console.log('Initializing queue service for session:', sessionId);
      
      // Set up callbacks
      queueService.setCallbacks(
        // Queue update callback
        (updatedQueue) => {
          console.log('Queue update received in component:', updatedQueue);
          setQueue(updatedQueue || []);
          setLoading(false);
        },
        // Error callback
        (errorMessage) => {
          console.error('Queue error received in component:', errorMessage);
          showNotification(errorMessage, 'error');
          setLoading(false);
        }
      );

      // Connect to the session
      queueService.connect(sessionId);

      // Set up periodic queue refresh with error handling
      const refreshInterval = setInterval(() => {
        const accessToken = getAccessToken();
        if (accessToken && queueService.isConnected) {
          console.log('Periodic queue refresh');
          try {
            queueService.getQueue(accessToken);
          } catch (error) {
            console.error('Error during periodic queue refresh:', error);
            if (error.message.includes('Socket connection is not active')) {
              // Try to reconnect
              queueService.connect(sessionId);
            }
          }
        }
      }, 5000); // Refresh every 5 seconds

      // Clean up on unmount
      return () => {
        console.log('Cleaning up queue service');
        clearInterval(refreshInterval);
        queueService.disconnect();
      };
    }
  }, [sessionId]);

  // Load initial queue
  useEffect(() => {
    const loadQueue = async () => {
      const accessToken = getAccessToken();
      if (!accessToken) {
        console.log('No access token available for initial queue load');
        return;
      }

      try {
        console.log('Loading initial queue');
        setLoading(true);
        
        if (sessionId && queueService.isConnected) {
          queueService.getQueue(accessToken);
        } else {
          console.log('Queue service not connected, attempting to connect...');
          queueService.connect(sessionId);
        }
      } catch (error) {
        console.error('Error loading queue:', error);
        showNotification('Failed to load queue. Please try refreshing the page.', 'error');
        setLoading(false);
      }
    };

    loadQueue();
  }, [sessionId]);

  // Trigger WebRTC streaming when the next song is an Apple Music track
  useEffect(() => {
    if (queue.length > 0) {
      const nextTrack = queue[0];
      if (nextTrack.source === 'appleMusic') {
        // For demo: call global function (replace with context/props in real app)
        if (typeof window.startWebRTCStreaming === 'function') {
          window.startWebRTCStreaming();
        }
      }
    }
  }, [queue]);

  const showNotification = (message, severity = 'success') => {
    setNotification({ open: true, message, severity });
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      if (selectedService === 'spotify') {
        const accessToken = getAccessToken();
        if (!accessToken) {
          showNotification('Please log in to Spotify first', 'error');
          return;
        }
        const results = await searchTracks(searchQuery, accessToken);
        setSearchResults(results.map(track => ({ ...track, source: 'spotify' })));
      } else if (selectedService === 'appleMusic') {
        if (!window.MusicKit) {
          showNotification('Apple MusicKit is not loaded', 'error');
          return;
        }
        const music = window.MusicKit.getInstance();
        const results = await music.api.search(searchQuery, { types: ['songs'], limit: 10 });
        if (results.songs && results.songs.data) {
          setSearchResults(results.songs.data.map(song => ({
            id: song.id,
            name: song.attributes.name,
            artists: [{ name: song.attributes.artistName }],
            album: { images: [{ url: song.attributes.artwork?.url?.replace('{w}x{h}bb', '100x100bb') }] },
            duration_ms: song.attributes.durationInMillis,
            source: 'appleMusic',
            appleMusicId: song.id,
          })));
        } else {
          setSearchResults([]);
        }
      }
    } catch (error) {
      console.error('Error searching tracks:', error);
      showNotification('Failed to search tracks', 'error');
    } finally {
      setSearching(false);
    }
  };

  const handleAddToQueue = async (track) => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      showNotification('Please log in to Spotify first', 'error');
      return;
    }

    try {
      console.log('Adding track to queue:', track.name);
      setLoading(true);
      await queueService.addToQueue(track, accessToken);
      showNotification(`Added "${track.name}" to queue`);
      
      // Refresh queue after adding
      console.log('Refreshing queue after adding track');
      queueService.getQueue(accessToken);
    } catch (error) {
      console.error('Error adding to queue:', error);
      // Show more specific error message
      const errorMessage = error.message.includes('No available Spotify devices found') 
        ? 'No Spotify devices found. Please open Spotify and start playing on any device.'
        : error.message.includes('Failed to add track to queue') 
          ? 'Failed to add track. Please ensure Spotify is open and playing.'
          : 'Failed to add track to queue';
      showNotification(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromQueue = async (track) => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      showNotification('Please log in to Spotify first', 'error');
      return;
    }

    try {
      console.log('Removing track from queue:', track.name);
      setLoading(true);
      await queueService.removeFromQueue(track, accessToken);
      showNotification('Removed track from queue');
      
      // Refresh queue after removing
      console.log('Refreshing queue after removing track');
      queueService.getQueue(accessToken);
    } catch (error) {
      console.error('Error removing from queue:', error);
      showNotification('Failed to remove track from queue', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Format duration from milliseconds to MM:SS
  const formatDuration = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', mt: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {sessionId ? `Session Queue` : 'My Queue'}
      </Typography>

      {/* Search Section */}
      <Paper sx={{ p: 2, mb: 3, backgroundColor: theme.palette.background.paper }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl sx={{ minWidth: 140 }}>
            <InputLabel>Service</InputLabel>
            <Select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              label="Service"
            >
              {isSpotifyConnected && <MenuItem value="spotify">Spotify</MenuItem>}
              {isAppleMusicConnected && <MenuItem value="appleMusic">Apple Music</MenuItem>}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Search songs"
            variant="outlined"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button
            variant="contained"
            onClick={handleSearch}
            startIcon={searching ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
            disabled={searching}
          >
            Search
          </Button>
        </Box>
      </Paper>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Paper sx={{ mb: 3, backgroundColor: theme.palette.background.paper }}>
          <Typography variant="h6" sx={{ p: 2 }}>
            Search Results
          </Typography>
          <List>
            {searchResults.map((track) => (
              <ListItem
                key={track.id}
                divider
                sx={{
                  '&:last-child': {
                    borderBottom: 0,
                  },
                }}
              >
                <ListItemAvatar>
                  <Avatar 
                    alt={track.name} 
                    src={track.album.images[0]?.url} 
                    variant="rounded"
                  />
                </ListItemAvatar>
                <ListItemText
                  primary={track.name}
                  secondary={`${track.artists.map(artist => artist.name).join(', ')} • ${formatDuration(track.duration_ms)}`}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    aria-label="add"
                    onClick={() => handleAddToQueue(track)}
                  >
                    <AddIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* Queue */}
      <Paper sx={{ backgroundColor: theme.palette.background.paper }}>
        <Typography variant="h6" sx={{ p: 2 }}>
          {loading ? 'Loading Queue...' : 'Current Queue'}
        </Typography>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : queue.length === 0 ? (
          <Typography sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
            Queue is empty. Search for songs to add them to the queue.
          </Typography>
        ) : (
          <List>
            {queue.map((track) => (
              <ListItem
                key={track.id}
                divider
                sx={{
                  '&:last-child': {
                    borderBottom: 0,
                  },
                }}
              >
                <ListItemAvatar>
                  <Avatar 
                    alt={track.name} 
                    src={track.album.images[0]?.url} 
                    variant="rounded"
                  />
                </ListItemAvatar>
                <ListItemText
                  primary={track.name}
                  secondary={`${track.artists.map(artist => artist.name).join(', ')} • ${formatDuration(track.duration_ms)}`}
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => handleRemoveFromQueue(track)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* Notification */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={handleCloseNotification}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Queue; 