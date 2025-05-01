import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Avatar,
  Typography,
  CircularProgress,
  Paper,
  IconButton
} from '@mui/material';
import { Search as SearchIcon, Add as AddIcon } from '@mui/icons-material';
import { searchTracks } from '../utils/spotify';
import DebugLogger from '../utils/debug';

const debug = new DebugLogger('Search');

const Search = ({ onAddTrack, isSpotifyConnected }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  // Perform search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim() || !isSpotifyConnected) {
      setResults([]);
      return;
    }

    const performSearch = async () => {
      setLoading(true);
      setError(null);

      try {
        const accessToken = localStorage.getItem('spotify_access_token');
        if (!accessToken) {
          throw new Error('No access token found');
        }

        const searchResults = await searchTracks(debouncedQuery, accessToken);
        debug.log('Search results:', searchResults);
        setResults(searchResults);
      } catch (error) {
        debug.logError(error, 'Search failed');
        setError('Failed to search tracks. Please ensure you are connected to Spotify.');
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    performSearch();
  }, [debouncedQuery, isSpotifyConnected]);

  const handleAdd = (track) => {
    if (onAddTrack) {
      onAddTrack(track);
      setQuery('');
      setResults([]);
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 600, mx: 'auto', mt: 2 }}>
      <Paper elevation={2} sx={{ p: 2 }}>
        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search for tracks..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
          }}
          disabled={!isSpotifyConnected}
          helperText={!isSpotifyConnected ? 'Connect to Spotify to search' : ''}
        />

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <CircularProgress size={24} />
          </Box>
        )}

        {error && (
          <Typography color="error" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}

        {results.length > 0 && (
          <List sx={{ mt: 2 }}>
            {results.map((track) => (
              <ListItem
                key={track.id}
                secondaryAction={
                  <IconButton edge="end" onClick={() => handleAdd(track)}>
                    <AddIcon />
                  </IconButton>
                }
              >
                <ListItemAvatar>
                  <Avatar
                    variant="square"
                    src={track.album?.images?.[0]?.url}
                    alt={track.name}
                  />
                </ListItemAvatar>
                <ListItemText
                  primary={track.name}
                  secondary={`${track.artists.map(a => a.name).join(', ')} • ${track.album?.name}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
};

Search.propTypes = {
  onAddTrack: PropTypes.func.isRequired,
  isSpotifyConnected: PropTypes.bool.isRequired
};

export default Search; 