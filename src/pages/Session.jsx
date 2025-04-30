import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  Tabs,
  Tab,
  CircularProgress,
  ListItemAvatar,
  Avatar,
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
  QueueMusic as QueueMusicIcon,
} from '@mui/icons-material';
import { QRCodeSVG } from 'qrcode.react';
import { setupWebRTC, startGuestAudioStream, playHostAudioStream } from '../../client/src/services/webrtc';
import Queue from './Queue';
import PlayerBar from '../components/PlayerBar';
import { queueService } from '../utils/queueService';
import { v4 as uuidv4 } from 'uuid';
import socket from '../../client/src/services/socket';
import MusicPlayer from '../components/MusicPlayer';

// TabPanel component for the tabs
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`session-tabpanel-${index}`}
      aria-labelledby={`session-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const APPLE_MUSIC_DEVELOPER_TOKEN = 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IlJXMjJVRDIyQTkifQ.eyJpYXQiOjE3NDU5NjE4NTksImV4cCI6MTc2MTUxMzg1OSwiaXNzIjoiTkxOQVROVDdWVSJ9.mOy9btGm3dGFpi-WRg82rrCAc1XTW-v-IPatLx0Tu_uL93ZSHrcRsB5bn7Y2mxTrZqsOGJn2p52f4AEHAah_Fg'; // <-- Paste your token here

export default function Session() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  
  const [isConnected, setIsConnected] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [error, setError] = useState(null);
  const [guests, setGuests] = useState([]);
  const [peerId, setPeerId] = useState(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [peerConnection, setPeerConnection] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [selectedPlaybackDevice, setSelectedPlaybackDevice] = useState(null);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [appleMusicReady, setAppleMusicReady] = useState(false);
  const [appleMusicUserToken, setAppleMusicUserToken] = useState(null);
  
  const audioRef = React.useRef(null);
  const peerStreamRef = React.useRef(null);
  
  // Generate or get a userId for this device
  const [userId] = useState(() => {
    let id = localStorage.getItem('user_id');
    if (!id) {
      id = uuidv4();
      localStorage.setItem('user_id', id);
    }
    return id;
  });
  // Detect capabilities
  const hasSpotify = localStorage.getItem('spotify_connected') === 'true';
  // TODO: Add real Apple Music detection if available
  const hasAppleMusic = false;
  
  // Get the current URL for the QR code
  const getSessionUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/session/${sessionId}`;
  };
  
  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
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

    // No need to initialize or set up listeners for setupWebRTC (not a class)
    // All WebRTC logic is handled by startWebRTCStreaming when needed

    setIsInitializing(false);

    // Cleanup
    return () => {
      localStorage.removeItem('isHost');
      console.log('[Session] Cleanup: isHost removed from localStorage.');
      if (peerConnection) peerConnection.close();
    };
  }, [sessionId]);
  
  // Toggle mute
  const toggleMute = () => {
    if (setupWebRTC.stream) {
      setupWebRTC.stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };
  
  // Handle volume change
  const handleVolumeChange = (event, newValue) => {
    setVolume(newValue);
    console.log('[PlayerBar] Volume changed:', newValue);
  };
  
  const handleLeave = () => {
    setupWebRTC.destroy();
    navigate('/');
  };
  
  // Improved WebRTC streaming logic
  useEffect(() => {
    if (!queueService.socket) return;
    // Listen for a request to start streaming to a device
    queueService.socket.on('start-stream-to', ({ fromUserId, toUserId }) => {
      if (fromUserId === userId) {
        console.log('[WebRTC] Received request to start streaming to', toUserId);
        startWebRTCStreaming(toUserId);
      }
    });
    return () => {
      if (queueService.socket) {
        queueService.socket.off('start-stream-to');
      }
    };
  }, [queueService.socket, userId]);

  // Update startWebRTCStreaming to accept a targetUserId
  const startWebRTCStreaming = (targetUserId) => {
    setIsStreaming(true);
    console.log('[WebRTC] Streaming started. isHost:', isHost, 'targetUserId:', targetUserId);
    if (isHost) {
      const pc = setupWebRTC(true, sessionId, (stream) => {
        playHostAudioStream(stream);
        console.log('[WebRTC] Host received audio stream');
      });
      setPeerConnection(pc);
    } else {
      const pc = setupWebRTC(false, sessionId, null);
      setPeerConnection(pc);
      startGuestAudioStream(pc, sessionId);
      console.log('[WebRTC] Guest started streaming audio to host');
    }
    // Optionally, emit a debug event
    if (targetUserId) {
      console.log('[WebRTC] Would stream audio to user:', targetUserId);
    }
  };
  window.startWebRTCStreaming = startWebRTCStreaming;
  
  // Clean up peer connection on unmount
  useEffect(() => {
    return () => {
      if (peerConnection) {
        peerConnection.close();
        setIsStreaming(false);
        console.log('[WebRTC] Streaming stopped (peerConnection closed)');
      }
    };
  }, [peerConnection]);
  
  useEffect(() => {
    if (!sessionId) return;
    // Set up queueService callbacks
    queueService.setCallbacks(
      (updatedQueue) => {
        setQueue(updatedQueue || []);
        // Ensure currentTrack is set to the first track in the queue, with title/artist fields for PlayerBar
        if (updatedQueue && updatedQueue.length > 0) {
          const track = updatedQueue[0];
          setCurrentTrack({
            ...track,
            title: track.name || track.title,
            artist: track.artists
              ? (Array.isArray(track.artists)
                  ? track.artists.map(a => a.name).join(', ')
                  : track.artists)
              : track.artist || ''
          });
        } else {
          setCurrentTrack(null);
        }
        // Auto-select the host's device if none is selected
        if (!selectedPlaybackDevice && isHost) {
          setSelectedPlaybackDevice({
            id: userId,
            name: 'This Device (You)',
            isHost: true,
            hasSpotify,
            hasAppleMusic
          });
        }
      },
      (errorMessage) => {
        setError({ message: errorMessage });
      }
    );
    queueService.connect(sessionId);
    // Initial fetch
    queueService.getQueue();
    // Emit device capabilities to backend
    if (queueService.socket) {
      queueService.socket.emit('device-capabilities', {
        sessionId,
        userId,
        hasSpotify,
        hasAppleMusic
      });
    } else {
      // Wait for socket to connect, then emit
      const interval = setInterval(() => {
        if (queueService.socket && queueService.isConnected) {
          queueService.socket.emit('device-capabilities', {
            sessionId,
            userId,
            hasSpotify,
            hasAppleMusic
          });
          clearInterval(interval);
        }
      }, 500);
    }
    // Listen for updated device list from backend
    if (queueService.socket) {
      queueService.socket.on('device-list', (deviceList) => {
        setGuests(deviceList.filter(d => d.userId !== userId));
      });
    }
    // Clean up on unmount
    return () => {
      queueService.disconnect();
    };
  }, [sessionId, userId, hasSpotify, hasAppleMusic, isHost, selectedPlaybackDevice]);

  // Playback control handlers
  const handlePlayPause = () => {
    setIsPlaying((prev) => !prev);
    console.log('[PlayerBar] Play/Pause toggled:', !isPlaying);
    console.log('[PlayerBar] Current track:', currentTrack);
    console.log('[PlayerBar] Selected device:', selectedPlaybackDevice);
  };
  const handleSkipNext = () => {
    // For now, just log and set next track as current
    if (queue && queue.length > 1) {
      // Remove the first track and update currentTrack
      const newQueue = queue.slice(1);
      setQueue(newQueue);
      setCurrentTrack(newQueue[0] || null);
      setIsPlaying(true);
      // Optionally, emit skip event to backend here
    }
    console.log('[PlayerBar] Skip to next track');
  };
  const handleSkipPrevious = () => {
    // For now, just log (implement real logic if you keep track history)
    console.log('[PlayerBar] Skip to previous track');
  };

  // Helper to get all devices (host + guests)
  const getAllDevices = () => {
    const devices = [];
    devices.push({ id: userId, name: 'This Device (You)', isHost: isHost, hasSpotify, hasAppleMusic });
    guests.forEach((guest, idx) => {
      devices.push({
        id: guest.userId,
        name: `Guest ${idx + 1} (${guest.userId})`,
        isHost: guest.isHost,
        hasSpotify: guest.hasSpotify,
        hasAppleMusic: guest.hasAppleMusic
      });
    });
    return devices;
  };

  let spotifyPlayer = null;
  const spotifyPlayerRef = useRef(null);
  const [spotifyReady, setSpotifyReady] = useState(false);

  // Spotify Web Playback SDK loader
  useEffect(() => {
    if (!window.Spotify) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
      script.onload = () => {
        console.log('[Spotify SDK] Script loaded');
      };
    }
    window.onSpotifyWebPlaybackSDKReady = () => {
      setSpotifyReady(true);
      console.log('[Spotify SDK] Ready');
    };
  }, []);

  // Initialize Spotify Player when ready
  useEffect(() => {
    if (spotifyReady && !spotifyPlayerRef.current) {
      const token = localStorage.getItem('spotify_access_token');
      if (!token) return;
      spotifyPlayer = new window.Spotify.Player({
        name: 'Harmony Web Player',
        getOAuthToken: cb => { cb(token); },
        volume: 0.8
      });
      spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('[Spotify SDK] Player ready with device_id', device_id);
        spotifyPlayerRef.current = spotifyPlayer;
      });
      spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.log('[Spotify SDK] Player not ready', device_id);
      });
      spotifyPlayer.addListener('initialization_error', e => console.error('[Spotify SDK] Init error', e));
      spotifyPlayer.addListener('authentication_error', e => console.error('[Spotify SDK] Auth error', e));
      spotifyPlayer.addListener('account_error', e => console.error('[Spotify SDK] Account error', e));
      spotifyPlayer.addListener('playback_error', e => console.error('[Spotify SDK] Playback error', e));
      spotifyPlayer.connect();
    }
  }, [spotifyReady]);

  // Load and initialize MusicKit JS
  useEffect(() => {
    if (!window.MusicKit) {
      const script = document.createElement('script');
      script.src = 'https://js-cdn.music.apple.com/musickit/v1/musickit.js';
      script.async = true;
      document.body.appendChild(script);
      script.onload = () => {
        window.MusicKit.configure({
          developerToken: APPLE_MUSIC_DEVELOPER_TOKEN,
          app: {
            name: 'Harmony',
            build: '1.0.0'
          }
        });
        setAppleMusicReady(true);
        console.log('[MusicKit] Script loaded and configured');
      };
    } else {
      setAppleMusicReady(true);
    }
  }, []);

  // Function to authorize user with Apple Music
  const authorizeAppleMusic = async () => {
    if (!window.MusicKit) return;
    const music = window.MusicKit.getInstance();
    try {
      const userToken = await music.authorize();
      setAppleMusicUserToken(userToken);
      console.log('[MusicKit] User authorized, token:', userToken);
    } catch (err) {
      console.error('[MusicKit] Authorization failed:', err);
    }
  };

  // In playback/streaming effect, add Apple Music playback logic
  useEffect(() => {
    if (!currentTrack || !selectedPlaybackDevice) {
      console.log('[Playback] No current track or selected device:', { currentTrack, selectedPlaybackDevice });
      return;
    }
    const canPlay =
      (currentTrack.source === 'spotify' && selectedPlaybackDevice.hasSpotify) ||
      (currentTrack.source === 'appleMusic' && selectedPlaybackDevice.hasAppleMusic);
    console.log('[Playback] Can play track:', { canPlay, trackSource: currentTrack.source, deviceCapabilities: selectedPlaybackDevice });
    
    if (canPlay) {
      if (selectedPlaybackDevice.id === userId) {
        console.log('[Playback] This device will play the track');
        if (currentTrack.source === 'spotify') {
          // Play Spotify track using SDK
          const token = localStorage.getItem('spotify_access_token');
          if (window.Spotify && spotifyPlayerRef.current && token) {
            console.log('[Playback] Playing Spotify track via SDK:', currentTrack.uri);
            // Transfer playback to web player
            fetch('https://api.spotify.com/v1/me/player', {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ device_ids: [spotifyPlayerRef.current._options.id], play: true })
            }).then(() => {
              console.log('[Playback] Successfully transferred playback to web player');
              // Play the track
              fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyPlayerRef.current._options.id}`, {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris: [currentTrack.uri] })
              }).then(() => {
                console.log('[Playback] Successfully started playing Spotify track');
              }).catch(e => console.error('[Playback] Error playing track:', e));
            }).catch(e => console.error('[Playback] Error transferring playback:', e));
          } else {
            console.warn('[Playback] Spotify SDK not ready or no token:', {
              hasSpotifySDK: !!window.Spotify,
              hasPlayerRef: !!spotifyPlayerRef.current,
              hasToken: !!token
            });
          }
        } else if (currentTrack.source === 'appleMusic' && appleMusicUserToken) {
          console.log('[Playback] Playing Apple Music track:', currentTrack.appleMusicId);
          const music = window.MusicKit.getInstance();
          music.setQueue({ song: currentTrack.appleMusicId }).then(() => {
            music.play();
            console.log('[MusicKit] Successfully started playing Apple Music track');
          }).catch(e => console.error('[MusicKit] Error setting queue:', e));
        }
      } else {
        console.log('[Playback] Another device will play the track:', selectedPlaybackDevice);
      }
    } else {
      // Find a capable device
      const allDevices = getAllDevices();
      const capableDevice = allDevices.find(d =>
        (currentTrack.source === 'spotify' && d.hasSpotify) ||
        (currentTrack.source === 'appleMusic' && d.hasAppleMusic)
      );
      console.log('[Playback] Looking for capable device:', { allDevices, capableDevice });
      
      if (capableDevice) {
        if (capableDevice.id === userId) {
          // This device should stream audio to the selected device
          console.log('[Streaming] This device will stream audio to', selectedPlaybackDevice);
          startWebRTCStreaming(selectedPlaybackDevice.id);
        } else {
          // Request the capable device to start streaming
          if (queueService.socket) {
            queueService.socket.emit('request-stream', {
              sessionId,
              fromUserId: capableDevice.id,
              toUserId: selectedPlaybackDevice.id
            });
            console.log('[WebRTC] Requested device', capableDevice.id, 'to stream to', selectedPlaybackDevice.id);
          }
        }
      } else {
        console.warn('[Playback] No device in session can play this track:', currentTrack);
      }
    }
  }, [currentTrack, selectedPlaybackDevice, userId, spotifyReady, appleMusicUserToken]);

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
      {/* Device Selection Button */}
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button
          variant="outlined"
          onClick={() => setShowDeviceMenu(true)}
          startIcon={<ComputerIcon />}
        >
          Select Playback Device
        </Button>
        <Button 
          variant="outlined"
          onClick={authorizeAppleMusic} 
          disabled={!appleMusicReady || appleMusicUserToken}
          startIcon={<QueueMusicIcon />}
        >
          {appleMusicUserToken ? 'Apple Music Connected' : 'Connect Apple Music'}
        </Button>
        {selectedPlaybackDevice && (
          <Typography variant="body2" color="text.secondary">
            Playing on: {selectedPlaybackDevice.name}
          </Typography>
        )}
      </Box>
      {/* Device Selection Dialog */}
      <Dialog open={showDeviceMenu} onClose={() => setShowDeviceMenu(false)}>
        <DialogTitle>Select Playback Device</DialogTitle>
        <DialogContent>
          <List>
            {getAllDevices().map((device) => (
              <ListItem
                button
                key={device.id}
                selected={selectedPlaybackDevice?.id === device.id}
                onClick={() => {
                  setSelectedPlaybackDevice(device);
                  setShowDeviceMenu(false);
                }}
              >
                <ListItemAvatar>
                  <Avatar>
                    <ComputerIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={device.name}
                  secondary={
                    [
                      device.isHost ? 'Host' : 'Guest',
                      device.hasSpotify ? 'Spotify' : null,
                      device.hasAppleMusic ? 'Apple Music' : null
                    ].filter(Boolean).join(' • ')
                  }
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
      </Dialog>
      {/* Streaming UI Banner */}
      {isStreaming && (
        <Box sx={{ p: 2, mb: 2, background: '#e3f2fd', color: '#1976d2', borderRadius: 2, textAlign: 'center' }}>
          <Typography variant="h6">
            {isHost ? 'Receiving audio stream from guest...' : 'Streaming audio to host...'}
          </Typography>
        </Box>
      )}
      <Paper elevation={3} sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h5">
              {isHost ? 'Host Session' : 'Guest Session'}
            </Typography>
          </Grid>

          <Grid item xs={12}>
            <Typography>
              Session ID: <b>{sessionId}</b>
            </Typography>
            <Button
              variant="outlined"
              startIcon={<QrCodeIcon />}
              sx={{ mt: 1, mb: 1 }}
              onClick={() => setShowQrCode(true)}
            >
              Show QR Code
            </Button>
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
                  max={100}
                  step={1}
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

      {/* Tabs for different sections */}
      <Paper sx={{ mt: 3 }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
        >
          <Tab label="Session Info" />
          <Tab label="Queue" icon={<QueueMusicIcon />} iconPosition="start" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Typography variant="body1">
            This is a collaborative listening session. All participants will hear the same music.
          </Typography>
          <Typography variant="body1" sx={{ mt: 2 }}>
            {isHost 
              ? "As the host, you control the music playback. Guests will hear what you play." 
              : "As a guest, you'll hear the music that the host plays."}
          </Typography>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Queue />
        </TabPanel>
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
            <Typography variant="body2" align="center" color="text.secondary">
              Or share this link: {getSessionUrl()}
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>
      {/* PlayerBar at the bottom */}
      <PlayerBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onSkipNext={handleSkipNext}
        onSkipPrevious={handleSkipPrevious}
        volume={volume}
        onVolumeChange={handleVolumeChange}
      />
      {/* Unified MusicPlayer for actual playback */}
      {isHost && (
        <MusicPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onSkipNext={handleSkipNext}
          onSkipPrevious={handleSkipPrevious}
          volume={volume}
          onVolumeChange={handleVolumeChange}
          spotifyPlayerRef={spotifyPlayerRef}
          appleMusicUserToken={appleMusicUserToken}
        />
      )}
    </Box>
  );
} 