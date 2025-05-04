import React from 'react';
import { Typography } from '@mui/material';
import DebugLogger from '../utils/debug';

const debug = new DebugLogger('SessionInfoPanel');

const SessionInfoPanel = ({ isHost }) => {
  React.useEffect(() => {
    debug.log('SessionInfoPanel rendered', { isHost });
  }, [isHost]);

  return (
    <>
      <Typography variant="body1">
        This is a collaborative listening session. All participants will hear the same music.
      </Typography>
      <Typography variant="body1" sx={{ mt: 2 }}>
        {isHost
          ? "As the host, you control the music playback. Guests will hear what you play."
          : "As a guest, you'll hear the music that the host plays."}
      </Typography>
    </>
  );
};

export default SessionInfoPanel; 