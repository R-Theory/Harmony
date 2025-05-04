import React from 'react';
import { Box, Typography } from '@mui/material';
import DebugLogger from '../utils/debug';

const debug = new DebugLogger('StreamingBanner');

const StreamingBanner = ({ isHost }) => {
  React.useEffect(() => {
    debug.log('Banner rendered', { isHost });
  }, [isHost]);

  return (
    <Box sx={{ p: 2, mb: 2, background: '#e3f2fd', color: '#1976d2', borderRadius: 2, textAlign: 'center' }}>
      <Typography variant="h6">
        {isHost ? 'Receiving audio stream from guest...' : 'Streaming audio to host...'}
      </Typography>
    </Box>
  );
};

export default StreamingBanner; 