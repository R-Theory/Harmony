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
  Snackbar,
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
import Search from '../components/Search';
import DebugLogger from '../utils/debug';
import DeviceSelectionDialog from '../components/DeviceSelectionDialog';
import StreamingBanner from '../components/StreamingBanner';
import SessionInfoPanel from '../components/SessionInfoPanel';
import PlayerContainer from '../components/PlayerContainer';

const debug = new DebugLogger('Session');

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
  
  // State declarations
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
  const [loading, setLoading] = useState(false);
  const [lastQueueUpdate, setLastQueueUpdate] = useState(0);
  const [queueNotification, setQueueNotification] = useState({ open: false, message: '', severity: 'success' });
  const [devices, setDevices] = useState([]);
  const [isDeviceDialogOpen, setIsDeviceDialogOpen] = useState(false);
  const [spotifyReady, setSpotifyReady] = useState(false);
  const [spotifyDeviceId, setSpotifyDeviceId] = useState(null);
  const [appleMusicUserToken, setAppleMusicUserToken] = useState(null);
  const [appleMusicReady, setAppleMusicReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedPlaybackDevice, setSelectedPlaybackDevice] = useState(null);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);

  // Refs
  const audioRef = useRef(null);
  const spotifyPlayerRef = useRef(null);

  // Constants
  const QUEUE_UPDATE_INTERVAL = 1000; // 1 second between queue updates

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
    if (!sessionId) {
      const newSessionId = uuidv4();
      navigate(`/session/${newSessionId}`);
      return;
    }

    debug.log('Initializing session', { sessionId });

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

    // Initialize queue service
    queueService.connect(sessionId);
    queueService.getQueue();

    // Emit device capabilities
    if (queueService.socket) {
      queueService.socket.emit('device-capabilities', {
        sessionId,
        userId,
        hasSpotify,
        hasAppleMusic
      });
    }

    // Listen for device list updates
    if (queueService.socket) {
      queueService.socket.on('device-list', (deviceList) => {
        setGuests(deviceList.filter(d => d.userId !== userId));
      });
    }

    // Auto-select this device if host
    if (userIsHost && !selectedPlaybackDevice) {
      setSelectedPlaybackDevice({
        id: userId,
        name: 'This Device (You)',
        isHost: true,
        hasSpotify,
        hasAppleMusic
      });
    }

    setIsInitializing(false);

    // Cleanup
    return () => {
      debug.log('Cleaning up session', { sessionId });
      localStorage.removeItem('isHost');
      queueService.disconnect();
      setCurrentTrack(null);
      setIsPlaying(false);
      setProgress(0);
      setDuration(0);
      setQueue([]);
      setLastQueueUpdate(0);
      setSelectedPlaybackDevice(null);
      console.log('[Session] Cleanup: isHost removed from localStorage and state reset.');
    };
  }, [sessionId, navigate, userId, hasSpotify, hasAppleMusic]);
  
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
    if (!queueService.socket) return;

    queueService.setCallbacks(
      (updatedQueue) => {
        const now = Date.now();
        if (now - lastQueueUpdate < QUEUE_UPDATE_INTERVAL) {
          debug.log('Queue update rate limited', {
            timeSinceLastUpdate: now - lastQueueUpdate,
            requiredInterval: QUEUE_UPDATE_INTERVAL
          });
          return;
        }

        setLastQueueUpdate(now);
        setQueue(updatedQueue || []);
        
        if (updatedQueue && updatedQueue.length > 0) {
          const track = updatedQueue[0];
          const mappedTrack = {
            ...track,
            title: track.name || track.title,
            artist: track.artists
              ? (Array.isArray(track.artists)
                  ? track.artists.map(a => a.name).join(', ')
                  : track.artists)
              : track.artist || ''
          };
          
          debug.log('Queue update received', {
            queueLength: updatedQueue.length,
            currentTrack: mappedTrack,
            previousTrack: currentTrack,
            isPlaying
          });
          
          // Only update current track if it's different
          if (!currentTrack || currentTrack.uri !== mappedTrack.uri) {
            debug.log('Updating current track', {
              previousTrack: currentTrack,
              newTrack: mappedTrack
            });
            setCurrentTrack(mappedTrack);
            
            // If we're not playing, start playback
            if (!isPlaying) {
              debug.log('Starting playback for new track');
              setIsPlaying(true);
            } else {
              // If we're already playing but the track changed, force a restart
              debug.log('Restarting playback for new track');
              setIsPlaying(false);
              setTimeout(() => setIsPlaying(true), 100);
            }
          }
        } else {
          debug.log('Queue empty, clearing current track');
          setCurrentTrack(null);
          setIsPlaying(false);
        }
      },
      (errorMessage) => {
        debug.logError(errorMessage, 'queueService');
        setError({ message: errorMessage });
      }
    );
  }, [queueService.socket, currentTrack, isPlaying]);

  // Playback control handlers
  const handlePlayPause = () => {
    if (!currentTrack) return;
    
    debug.log('Play/Pause triggered', {
      currentTrack,
      wasPlaying: isPlaying,
      willPlay: !isPlaying
    });
    
    setIsPlaying(prev => !prev);
  };

  const handleSkipNext = () => {
    if (!queue || queue.length <= 1) return;
    
    debug.log('Skipping to next track', {
      currentTrack,
      nextTrack: queue[1]
    });
    
    const newQueue = queue.slice(1);
    setQueue(newQueue);
    if (newQueue.length > 0) {
      const nextTrack = newQueue[0];
      const mappedTrack = {
        ...nextTrack,
        title: nextTrack.name || nextTrack.title,
        artist: nextTrack.artists
          ? (Array.isArray(nextTrack.artists)
              ? nextTrack.artists.map(a => a.name).join(', ')
              : nextTrack.artists)
          : nextTrack.artist || ''
      };
      setCurrentTrack(mappedTrack);
      setIsPlaying(true);
    } else {
      setCurrentTrack(null);
      setIsPlaying(false);
    }
  };

  const handleSkipPrevious = () => {
    // For now, just restart the current track
    if (currentTrack) {
      setProgress(0);
      setIsPlaying(true);
    }
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

  // Add rate limiting for Spotify API calls
  const [lastApiCall, setLastApiCall] = useState(0);
  const API_RATE_LIMIT = 1000; // 1 second between API calls

  const makeSpotifyApiCall = async (endpoint, options = {}) => {
    const now = Date.now();
    if (now - lastApiCall < API_RATE_LIMIT) {
      debug.log('[Spotify] Rate limited API call', {
        timeSinceLastCall: now - lastApiCall,
        requiredInterval: API_RATE_LIMIT
      });
      return new Promise(resolve => setTimeout(resolve, API_RATE_LIMIT - (now - lastApiCall)))
        .then(() => makeSpotifyApiCall(endpoint, options));
    }

    setLastApiCall(now);
    const token = localStorage.getItem('spotify_access_token');
    if (!token) {
      throw new Error('No Spotify access token found');
    }

    const response = await fetch(`https://api.spotify.com${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5') * 1000;
      debug.log('[Spotify] Rate limited, retrying after', retryAfter, 'ms');
      return new Promise(resolve => setTimeout(resolve, retryAfter))
        .then(() => makeSpotifyApiCall(endpoint, options));
    }

    if (!response.ok) {
      throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  };

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
      if (!token) {
        debug.logError('[Spotify] No access token found');
        return;
      }

      // Check if token is expired
      const tokenExpiry = localStorage.getItem('spotify_token_expiry');
      if (tokenExpiry && Date.now() > parseInt(tokenExpiry)) {
        debug.log('[Spotify] Token expired, attempting to refresh...');
        const refreshToken = localStorage.getItem('spotify_refresh_token');
        if (refreshToken) {
          fetch(`${window.location.origin}/api/refresh_token?refresh_token=${refreshToken}`)
            .then(response => response.json())
            .then(data => {
              if (data.access_token) {
                localStorage.setItem('spotify_access_token', data.access_token);
                localStorage.setItem('spotify_token_expiry', (Date.now() + 3600000).toString());
                initializeSpotifyPlayer(data.access_token);
              } else {
                debug.logError('[Spotify] Failed to refresh token');
                localStorage.removeItem('spotify_access_token');
                localStorage.removeItem('spotify_refresh_token');
                localStorage.removeItem('spotify_connected');
              }
            })
            .catch(error => {
              debug.logError('[Spotify] Error refreshing token:', error);
              localStorage.removeItem('spotify_access_token');
              localStorage.removeItem('spotify_refresh_token');
              localStorage.removeItem('spotify_connected');
            });
        } else {
          debug.logError('[Spotify] No refresh token found');
          localStorage.removeItem('spotify_access_token');
          localStorage.removeItem('spotify_connected');
        }
        return;
      }

      initializeSpotifyPlayer(token);
    }
  }, [spotifyReady]);

  const initializeSpotifyPlayer = (token) => {
    try {
      spotifyPlayer = new window.Spotify.Player({
        name: 'Harmony Web Player',
        getOAuthToken: cb => { cb(token); },
        volume: 0.8
      });

      spotifyPlayer.addListener('ready', ({ device_id }) => {
        debug.log('[Spotify SDK] Player ready with device_id', device_id);
        spotifyPlayerRef.current = spotifyPlayer;
        setSpotifyDeviceId(device_id);
        
        // Transfer playback to this device with rate limiting
        makeSpotifyApiCall('/v1/me/player', {
          method: 'PUT',
          body: JSON.stringify({ device_ids: [device_id], play: true })
        }).catch(error => {
          if (error.message.includes('404')) {
            debug.log('[Spotify] Cloud Playback API endpoint not found - this is expected');
          } else {
            debug.logError('[Spotify] Error transferring playback:', error);
          }
        });
      });

      spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        debug.log('[Spotify SDK] Player not ready', device_id);
        // Try to reconnect with exponential backoff
        let retryCount = 0;
        const maxRetries = 5;
        const retry = () => {
          if (retryCount < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
            debug.log(`[Spotify] Retrying connection in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
            setTimeout(() => {
              retryCount++;
              spotifyPlayer.connect();
            }, delay);
          }
        };
        retry();
      });

      spotifyPlayer.addListener('initialization_error', e => {
        debug.logError('[Spotify SDK] Init error', e);
        // Try to reconnect with exponential backoff
        let retryCount = 0;
        const maxRetries = 5;
        const retry = () => {
          if (retryCount < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
            debug.log(`[Spotify] Retrying initialization in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
            setTimeout(() => {
              retryCount++;
              spotifyPlayer.connect();
            }, delay);
          }
        };
        retry();
      });

      spotifyPlayer.addListener('authentication_error', e => {
        debug.logError('[Spotify SDK] Auth error', e);
        // Try to refresh the token
        const refreshToken = localStorage.getItem('spotify_refresh_token');
        if (refreshToken) {
          makeSpotifyApiCall('/api/refresh_token', {
            method: 'POST',
            body: JSON.stringify({ refresh_token: refreshToken })
          })
            .then(data => {
              if (data.access_token) {
                localStorage.setItem('spotify_access_token', data.access_token);
                localStorage.setItem('spotify_token_expiry', (Date.now() + 3600000).toString());
                spotifyPlayer.connect();
              }
            })
            .catch(error => debug.logError('[Spotify] Error refreshing token:', error));
        }
      });

      spotifyPlayer.addListener('account_error', e => debug.logError('[Spotify SDK] Account error', e));
      spotifyPlayer.addListener('playback_error', e => debug.logError('[Spotify SDK] Playback error', e));
      
      // Add playback state listeners
      spotifyPlayer.addListener('player_state_changed', state => {
        if (state) {
          debug.log('[Spotify SDK] Player state changed:', state);
          setIsPlaying(!state.paused);
          setProgress(state.position);
          setDuration(state.duration);
          
          // Update current track if it's different
          if (state.track_window.current_track) {
            const currentTrack = {
              ...state.track_window.current_track,
              title: state.track_window.current_track.name,
              artist: state.track_window.current_track.artists.map(a => a.name).join(', '),
              source: 'spotify'
            };
            setCurrentTrack(currentTrack);
          }
        }
      });
      
      spotifyPlayer.connect();
    } catch (error) {
      debug.logError('[Spotify] Error initializing player:', error);
    }
  };

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

  // Update the playback effect to use the stored device ID
  useEffect(() => {
    debug.log('[DEBUG] Playback effect triggered');
    debug.log('[DEBUG] currentTrack:', currentTrack);
    debug.log('[DEBUG] selectedPlaybackDevice:', selectedPlaybackDevice);
    debug.log('[DEBUG] isPlaying:', isPlaying);
    debug.log('[DEBUG] spotifyDeviceId:', spotifyDeviceId);
    debug.log('[DEBUG] progress:', progress);
    debug.log('[DEBUG] duration:', duration);

    if (!currentTrack || !selectedPlaybackDevice) {
      debug.log('[Playback] No current track or selected device:', { currentTrack, selectedPlaybackDevice });
      return;
    }

    const canPlay =
      (currentTrack.source === 'spotify' && selectedPlaybackDevice.hasSpotify) ||
      (currentTrack.source === 'appleMusic' && selectedPlaybackDevice.hasAppleMusic);
    
    debug.log('[Playback] Can play track:', { canPlay, trackSource: currentTrack.source, deviceCapabilities: selectedPlaybackDevice });
    
    if (canPlay) {
      if (selectedPlaybackDevice.id === userId) {
        debug.log('[Playback] This device will play the track');
        if (currentTrack.source === 'spotify' && spotifyDeviceId) {
          // Play Spotify track using SDK
          const token = localStorage.getItem('spotify_access_token');
          if (window.Spotify && spotifyPlayerRef.current && token) {
            debug.log('[Playback] Playing Spotify track via SDK:', currentTrack.uri);
            // Transfer playback to web player
            fetch('https://api.spotify.com/v1/me/player', {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ device_ids: [spotifyDeviceId], play: true })
            }).then(() => {
              debug.log('[Playback] Successfully transferred playback to web player');
              // Play the track
              fetch(`https://api.spotify.com/v1/me/player/play?device_id=${spotifyDeviceId}`, {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uris: [currentTrack.uri] })
              }).then(() => {
                debug.log('[Playback] Successfully started playing Spotify track');
                // Start progress updates
                const progressInterval = setInterval(() => {
                  if (spotifyPlayerRef.current) {
                    spotifyPlayerRef.current.getCurrentState().then(state => {
                      if (state) {
                        handleProgressUpdate(state.position, state.duration);
                      }
                    });
                  }
                }, 1000);
                return () => clearInterval(progressInterval);
              }).catch(e => {
                debug.logError('[Playback] Error playing track:', e);
                // Try to reconnect the player if there's an error
                if (spotifyPlayerRef.current) {
                  spotifyPlayerRef.current.connect();
                }
              });
            }).catch(e => debug.logError('[Playback] Error transferring playback:', e));
          } else {
            debug.log('[Playback] Spotify SDK not ready or no token:', {
              hasSpotifySDK: !!window.Spotify,
              hasPlayerRef: !!spotifyPlayerRef.current,
              hasToken: !!token,
              deviceId: spotifyDeviceId
            });
          }
        } else if (currentTrack.source === 'appleMusic' && appleMusicUserToken) {
          debug.log('[Playback] Playing Apple Music track:', currentTrack.appleMusicId);
          const music = window.MusicKit.getInstance();
          music.setQueue({ song: currentTrack.appleMusicId }).then(() => {
            music.play();
            debug.log('[MusicKit] Successfully started playing Apple Music track');
            // Start progress updates
            const progressInterval = setInterval(() => {
              handleProgressUpdate(music.currentPlaybackTime * 1000, music.duration * 1000);
            }, 1000);
            return () => clearInterval(progressInterval);
          }).catch(e => debug.logError('[MusicKit] Error setting queue:', e));
        }
      } else {
        debug.log('[Playback] Another device will play the track:', selectedPlaybackDevice);
      }
    } else {
      // Find a capable device
      const allDevices = getAllDevices();
      const capableDevice = allDevices.find(d =>
        (currentTrack.source === 'spotify' && d.hasSpotify) ||
        (currentTrack.source === 'appleMusic' && d.hasAppleMusic)
      );
      debug.log('[Playback] Looking for capable device:', { allDevices, capableDevice });
      if (capableDevice) {
        if (capableDevice.id === userId) {
          // This device should stream audio to the selected device
          debug.log('[Streaming] This device will stream audio to', selectedPlaybackDevice);
          startWebRTCStreaming(selectedPlaybackDevice.id);
        } else {
          // Request the capable device to start streaming
          if (queueService.socket) {
            queueService.socket.emit('request-stream', {
              sessionId,
              fromUserId: capableDevice.id,
              toUserId: selectedPlaybackDevice.id
            });
            debug.log('[WebRTC] Requested device', capableDevice.id, 'to stream to', selectedPlaybackDevice.id);
          }
        }
      } else {
        debug.log('[Playback] No device in session can play this track:', currentTrack);
      }
    }
  }, [currentTrack, selectedPlaybackDevice, userId, spotifyReady, appleMusicUserToken, isPlaying, spotifyDeviceId, progress, duration]);

  // Handle queue updates
  const handleQueueUpdate = (newQueue) => {
    setQueue(newQueue);
  };

  const showQueueNotification = (message, severity = 'success') => {
    setQueueNotification({ open: true, message, severity });
  };

  const handleAddToQueue = async (track) => {
    try {
      await queueService.addToQueue(track);
      showQueueNotification(`Added "${track.name}" to session queue`);
    } catch (error) {
      showQueueNotification(error.message, 'error');
    }
  };

  const handleRemoveFromQueue = async (trackId) => {
    try {
      await queueService.removeFromQueue(trackId);
      showQueueNotification('Removed track from session queue');
    } catch (error) {
      showQueueNotification(error.message, 'error');
    }
  };

  // Handle progress updates from MusicPlayer
  const handleProgressUpdate = (position, totalDuration) => {
    setProgress(position);
    setDuration(totalDuration);
  };

  // Handle seeking in the track
  const handleSeek = async (position) => {
    if (!currentTrack) return;
    
    try {
      if (currentTrack.source === 'spotify' && spotifyPlayerRef.current) {
        await spotifyPlayerRef.current.seek(position);
      } else if (currentTrack.source === 'appleMusic' && appleMusicUserToken) {
        const music = window.MusicKit.getInstance();
        await music.seekToTime(position / 1000);
      }
    } catch (error) {
      debug.logError(error, 'handleSeek');
      showQueueNotification('Failed to seek in track', 'error');
    }
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
      <DeviceSelectionDialog
        open={showDeviceMenu}
        onClose={() => setShowDeviceMenu(false)}
        devices={getAllDevices()}
        selectedDevice={selectedPlaybackDevice}
        onSelectDevice={setSelectedPlaybackDevice}
      />
      {/* Streaming UI Banner */}
      {isStreaming && (
        <StreamingBanner isHost={isHost} />
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
          <SessionInfoPanel isHost={isHost} />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Queue
            queue={queue}
            loading={false}
            onAddToQueue={handleAddToQueue}
            onRemoveFromQueue={handleRemoveFromQueue}
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
      {console.log('[DEBUG] Rendering PlayerBar with currentTrack:', currentTrack)}
      <PlayerContainer
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        onSkipNext={handleSkipNext}
        onSkipPrevious={handleSkipPrevious}
        volume={volume}
        setVolume={setVolume}
        spotifyPlayerRef={spotifyPlayerRef}
        appleMusicUserToken={appleMusicUserToken}
        hasSpotify={hasSpotify}
        hasAppleMusic={hasAppleMusic}
      />
      <Search
        onAddTrack={handleAddToQueue}
        isSpotifyConnected={hasSpotify}
      />
    </Box>
  );
} 