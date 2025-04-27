import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  IconButton,
  Slider,
  useTheme,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  Alert,
  AlertTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Mic as MicIcon,
  MicOff as MicOffIcon,
  VolumeUp as VolumeUpIcon,
  VolumeOff as VolumeOffIcon,
  ExitToApp as ExitToAppIcon,
  QrCode as QrCodeIcon,
  Close as CloseIcon,
  Error as ErrorIcon,
  WifiOff as WifiOffIcon,
  Computer as ComputerIcon,
  Help as HelpIcon,
} from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';
import webrtc from '../utils/webrtc';

export default function Session() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  
  const [isConnected, setIsConnected] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState(null);
  const [guests, setGuests] = useState([]);
  const [peerId, setPeerId] = useState(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const audioRef = React.useRef(null);
  const peerStreamRef = React.useRef(null);
  
  // Get the current URL for the QR code
  const getSessionUrl = () => {
    const baseUrl = window.location.origin;
    return peerId ? `${baseUrl}/session/${peerId}` : '';
  };
  
  useEffect(() => {
    // Determine if this user is the host
    let userIsHost = false;
    if (sessionId === 'new') {
      userIsHost = true;
      localStorage.setItem('isHost', 'true');
      console.log('[Session] sessionId is "new". Setting isHost to true.');
    } else if (localStorage.getItem('isHost') === 'true') {
      userIsHost = true;
      console.log('[Session] isHost found in localStorage. Setting isHost to true.');
    } else {
      userIsHost = false;
      localStorage.removeItem('isHost');
      console.log('[Session] isHost not found. Setting isHost to false and removing from localStorage.');
    }
    setIsHost(userIsHost);
    console.log('[Session] useEffect: userIsHost:', userIsHost, 'sessionId:', sessionId);

    const initializeSession = async () => {
      try {
        setIsInitializing(true);
        setError(null);

        // Initialize WebRTC
        await webrtc.initialize();
        
        // Set up connection listeners
        webrtc.addConnectionListener((event, data) => {
          switch (event) {
            case 'connected':
              console.log('[Session] setPeerId called with:', data);
              setPeerId(data);
              setIsConnected(true);
              break;
            case 'error':
              console.error('WebRTC error:', data);
              
              // If it's a peer connection error, show a more specific message
              if (data.type === 'PEER_CONNECTION') {
                // Check if we're on a potentially restricted network
                const isRestrictedNetwork = window.location.hostname.includes('edu') || 
                                           window.location.hostname.includes('school') ||
                                           /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(window.location.hostname);
                
                if (isRestrictedNetwork) {
                  setError(
                    `Unable to connect to the host. This may be due to network restrictions on your school/work WiFi. ` +
                    `Try using a different network or a mobile hotspot. If you're the host, make sure to wait a few seconds ` +
                    `after creating the session before sharing the link.`
                  );
                } else {
                  setError(
                    `Unable to connect to the host. The host may be offline or the session ID may be incorrect. ` +
                    `If you're the host, make sure to wait a few seconds after creating the session before sharing the link.`
                  );
                }
              } else {
                setError(data.message || 'Connection error occurred');
              }
              break;
            case 'disconnected':
              setIsConnected(false);
              setError('Connection to the server was lost. Attempting to reconnect...');
              break;
          }
        });

        // Only connect if this user is a guest
        if (!userIsHost && sessionId && sessionId !== 'new') {
          try {
            console.log('[Session] Guest detected. Attempting to connect to host with ID:', sessionId);
            await webrtc.connect(sessionId);
            console.log('[Session] Successfully connected to host:', sessionId);
          } catch (error) {
            console.error(`Failed to connect to host: ${sessionId}`, error);
            
            // Check if we're on a potentially restricted network
            const isRestrictedNetwork = window.location.hostname.includes('edu') || 
                                       window.location.hostname.includes('school') ||
                                       /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(window.location.hostname);
            
            if (isRestrictedNetwork) {
              setError(
                `Failed to connect to the host. This may be due to network restrictions on your school/work WiFi. ` +
                `Try using a different network or a mobile hotspot.`
              );
            } else {
              setError(
                `Failed to connect to the host. The host may be offline or the session ID may be incorrect.`
              );
            }
          }
        } else {
          console.log('[Session] Host detected. Not connecting to any peer.');
        }

        // Set up data callback
        webrtc.setOnDataCallback((peerId, data) => {
          if (data.type === 'guest-joined') {
            setGuests(prev => [...prev, data.guestId]);
          } else if (data.type === 'guest-left') {
            setGuests(prev => prev.filter(id => id !== data.guestId));
          }
        });

      } catch (err) {
        console.error('Session initialization error:', err);
        setError(err.message || 'Failed to initialize session');
      } finally {
        setIsInitializing(false);
      }
    };

    initializeSession();

    // Cleanup
    return () => {
      webrtc.destroy();
      localStorage.removeItem('isHost');
      console.log('[Session] Cleanup: webrtc destroyed and isHost removed from localStorage.');
    };
  }, [sessionId]);
  
  // Toggle mute
  const toggleMute = () => {
    if (webrtc.stream) {
      webrtc.stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };
  
  // Handle volume change
  const handleVolumeChange = (event, newValue) => {
    setVolume(newValue);
    if (audioRef.current) {
      audioRef.current.volume = newValue;
    }
  };
  
  const handleLeave = () => {
    webrtc.destroy();
    navigate('/');
  };
  
  if (isInitializing) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <Typography variant="h6">
          Initializing session...
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" gap={2} p={3}>
        <Alert 
          severity="error" 
          sx={{ width: '100%', maxWidth: 600 }}
          icon={<ErrorIcon />}
        >
          <AlertTitle>Connection Error</AlertTitle>
          <Typography variant="body1" gutterBottom>
            {error.message}
          </Typography>
          {error.details && (
            <>
              <Typography variant="subtitle2" color="error" sx={{ mt: 2 }}>
                Suggested Solution:
              </Typography>
              <Typography variant="body2" color="error">
                {error.details.suggestion}
              </Typography>
              <List dense sx={{ mt: 1 }}>
                {error.details.host && (
                  <ListItem>
                    <ListItemIcon>
                      <ComputerIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Server Details" 
                      secondary={`Host: ${error.details.host}, Port: ${error.details.port}`}
                    />
                  </ListItem>
                )}
                {error.details.peerId && (
                  <ListItem>
                    <ListItemIcon>
                      <HelpIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Peer ID" 
                      secondary={error.details.peerId}
                    />
                  </ListItem>
                )}
                {error.type === 'NETWORK' && (
                  <ListItem>
                    <ListItemIcon>
                      <WifiOffIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText 
                      primary="Network Status" 
                      secondary="Check your internet connection and firewall settings"
                    />
                  </ListItem>
                )}
              </List>
            </>
          )}
        </Alert>
        <Button 
          variant="contained" 
          onClick={handleLeave}
          startIcon={<ExitToAppIcon />}
        >
          Leave Session
        </Button>
      </Box>
    );
  }

  console.log('[Session] Rendering with peerId:', peerId);

  return (
    <Box p={3}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h5">
              {isHost ? 'Host Session' : 'Guest Session'}
            </Typography>
          </Grid>

          <Grid item xs={12}>
            <Typography>
              Your ID: {peerId}
            </Typography>
            {isHost && peerId && (
              <Typography>
                Share this ID with guests to join: {peerId}
                <IconButton onClick={() => setShowQrCode(true)}>
                  <QrCodeIcon />
                </IconButton>
              </Typography>
            )}
            {!peerId && isHost && (
              <Typography color="text.secondary">
                Waiting for PeerJS connection...
              </Typography>
            )}
            {!isHost && (
              <Typography>
                Connected to host: {sessionId}
              </Typography>
            )}
          </Grid>

          <Grid item xs={12}>
            <Box display="flex" gap={2}>
              <IconButton onClick={toggleMute}>
                {isMuted ? <MicOffIcon /> : <MicIcon />}
              </IconButton>
              <Box display="flex" alignItems="center" gap={1} flex={1}>
                <VolumeUpIcon />
                <Slider
                  value={volume}
                  onChange={handleVolumeChange}
                  min={0}
                  max={1}
                  step={0.1}
                />
              </Box>
              <Button
                variant="contained"
                color="error"
                onClick={handleLeave}
                startIcon={<ExitToAppIcon />}
              >
                Leave
              </Button>
            </Box>
          </Grid>

          {isHost && (
            <Grid item xs={12}>
              <Typography variant="h6">
                Connected Guests ({guests.length})
              </Typography>
              <Box component="ul" sx={{ listStyle: 'none', p: 0 }}>
                {guests.map(guestId => (
                  <Box
                    component="li"
                    key={guestId}
                    sx={{
                      p: 1,
                      mb: 1,
                      bgcolor: 'background.paper',
                      borderRadius: 1,
                    }}
                  >
                    {guestId}
                  </Box>
                ))}
              </Box>
            </Grid>
          )}
        </Grid>
      </Paper>

      <Dialog 
        open={showQrCode} 
        onClose={() => setShowQrCode(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Scan to Join Session
          <IconButton
            onClick={() => setShowQrCode(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" alignItems="center" gap={2} p={2}>
            <Typography variant="body1" align="center" color="text.secondary">
              Scan this QR code with your mobile device to join the session
            </Typography>
            {peerId ? (
              <Box 
                sx={{ 
                  p: 2, 
                  bgcolor: 'white', 
                  borderRadius: 1,
                  boxShadow: 1
                }}
              >
                <QRCodeSVG 
                  value={getSessionUrl()} 
                  size={256}
                  level="H"
                  includeMargin={true}
                />
              </Box>
            ) : (
              <Typography color="text.secondary">
                Waiting for PeerJS connection...
              </Typography>
            )}
            {peerId && (
              <Typography variant="body2" align="center" color="text.secondary">
                Or share this link: {getSessionUrl()}
              </Typography>
            )}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
} 