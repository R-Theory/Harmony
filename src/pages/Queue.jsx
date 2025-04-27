import { useState } from 'react';
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
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';

const Queue = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const theme = useTheme();

  // Placeholder queue data - will be replaced with actual state management
  const [queue] = useState([
    { id: 1, title: 'Song 1', artist: 'Artist 1', duration: '3:45' },
    { id: 2, title: 'Song 2', artist: 'Artist 2', duration: '4:20' },
  ]);

  const handleSearch = () => {
    // TODO: Implement Spotify search
    console.log('Searching for:', searchQuery);
  };

  const handleRemoveFromQueue = (id) => {
    // TODO: Implement remove from queue
    console.log('Removing song:', id);
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', mt: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Queue
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
            startIcon={<AddIcon />}
          >
            Add
          </Button>
        </Box>
      </Paper>

      {/* Queue List */}
      <Paper sx={{ backgroundColor: theme.palette.background.paper }}>
        <List>
          {queue.map((song) => (
            <ListItem
              key={song.id}
              divider
              sx={{
                '&:last-child': {
                  borderBottom: 0,
                },
              }}
            >
              <ListItemText
                primary={song.title}
                secondary={song.artist}
              />
              <ListItemSecondaryAction>
                <Typography variant="body2" color="text.secondary" sx={{ mr: 2 }}>
                  {song.duration}
                </Typography>
                <IconButton
                  edge="end"
                  aria-label="delete"
                  onClick={() => handleRemoveFromQueue(song.id)}
                >
                  <DeleteIcon />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
          {queue.length === 0 && (
            <ListItem>
              <ListItemText
                primary="No songs in queue"
                secondary="Search and add songs to get started"
              />
            </ListItem>
          )}
        </List>
      </Paper>
    </Box>
  );
};

export default Queue; 