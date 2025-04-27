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
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Search as SearchIcon,
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
  const theme = useTheme();
  const { sessionId } = useParams();

  // Get access token from URL or localStorage
  const getAccessToken = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('access_token') || localStorage.getItem('spotify_access_token');
    return token;
  };

  // Initialize queue service connection
  useEffect(() => {
    if (sessionId) {
      // Set up callbacks
      queueService.setCallbacks(
        // Queue update callback
        (updatedQueue) => {
          setQueue(updatedQueue || []);
        },
        // Error callback
        (errorMessage) => {
          showNotification(errorMessage, 'error');
        }
      );

      // Connect to the session
      queueService.connect(sessionId);

      // Clean up on unmount
      return () => {
        queueService.disconnect();
      };
    }
  }, [sessionId]);

  // Load initial queue
  useEffect(() => {
    const loadQueue = async () => {
      const accessToken = getAccessToken();
      if (!accessToken) return;

      try {
        setLoading(true);
        
        if (sessionId) {
          queueService.getQueue(accessToken);
        }
      } catch (error) {
        console.error('Error loading queue:', error);
        showNotification('Failed to load queue', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadQueue();
  }, [sessionId]);

  const showNotification = (message, severity = 'success') => {
    setNotification({ open: true, message, severity });
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    const accessToken = getAccessToken();
    if (!accessToken) {
      showNotification('Please log in to Spotify first', 'error');
      return;
    }

    try {
      setSearching(true);
      const results = await searchTracks(searchQuery, accessToken);
      setSearchResults(results);
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
      await queueService.addToQueue(track, accessToken);
      showNotification(`Added "${track.name}" to queue`);
    } catch (error) {
      console.error('Error adding to queue:', error);
      showNotification('Failed to add track to queue', 'error');
    }
  };

  const handleRemoveFromQueue = async (track) => {
    const accessToken = getAccessToken();
    if (!accessToken) {
      showNotification('Please log in to Spotify first', 'error');
      return;
    }

    try {
      await queueService.removeFromQueue(track, accessToken);
      showNotification('Removed track from queue');
    } catch (error) {
      console.error('Error removing from queue:', error);
      showNotification('Failed to remove track from queue', 'error');
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