import React, { useEffect } from 'react';
import Queue from '../pages/Queue';
import { Snackbar, Alert } from '@mui/material';
import DebugLogger from '../utils/debug';

const debug = new DebugLogger('QueueTabPanel');

const QueueTabPanel = ({ queue, loading, onAddToQueue, onRemoveFromQueue, showQueueNotification, queueNotification, setQueueNotification, isSpotifyConnected }) => {
  useEffect(() => {
    debug.log('QueueTabPanel rendered', { queueLength: queue.length });
  }, [queue.length]);

  useEffect(() => {
    if (queueNotification.open) {
      debug.log('Queue notification shown', queueNotification);
    }
  }, [queueNotification]);

  return (
    <>
      <Queue
        queue={queue}
        loading={loading}
        onAddToQueue={onAddToQueue}
        onRemoveFromQueue={onRemoveFromQueue}
        showNotification={showQueueNotification}
      />
      <Snackbar
        open={queueNotification.open}
        autoHideDuration={6000}
        onClose={() => setQueueNotification({ ...queueNotification, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setQueueNotification({ ...queueNotification, open: false })}
          severity={queueNotification.severity}
          sx={{ width: '100%' }}
        >
          {queueNotification.message}
        </Alert>
      </Snackbar>
    </>
  );
};

export default QueueTabPanel; 