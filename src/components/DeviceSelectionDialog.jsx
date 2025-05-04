import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  IconButton,
  Computer as ComputerIcon
} from '@mui/material';
import DebugLogger from '../utils/debug';

const debug = new DebugLogger('DeviceSelectionDialog');

const DeviceSelectionDialog = ({ open, onClose, devices, selectedDevice, onSelectDevice }) => {
  React.useEffect(() => {
    debug.log(open ? 'Dialog opened' : 'Dialog closed');
  }, [open]);

  const handleSelect = (device) => {
    debug.log('Device selected', device);
    onSelectDevice(device);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Select Playback Device</DialogTitle>
      <DialogContent>
        <List>
          {devices.map((device) => (
            <ListItem
              button
              key={device.id}
              selected={selectedDevice?.id === device.id}
              onClick={() => handleSelect(device)}
            >
              <ListItemAvatar>
                <Avatar>
                  <ComputerIcon />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={device.name}
                secondary={[
                  device.isHost ? 'Host' : 'Guest',
                  device.hasSpotify ? 'Spotify' : null,
                  device.hasAppleMusic ? 'Apple Music' : null
                ].filter(Boolean).join(' • ')}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
    </Dialog>
  );
};

export default DeviceSelectionDialog; 