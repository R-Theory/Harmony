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
import { normalizeSpotifyTrack } from '../types/track';

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
  const [isQueueSyncing, setIsQueueSyncing] = useState(false);
  const [isInitialQueueSetup, setIsInitialQueueSetup] = useState(true);
  const [hasInitialTrackLoaded, setHasInitialTrackLoaded] = useState(false);
  const [isQueueProcessing, setIsQueueProcessing] = useState(false);

  // Refs
  const audioRef = useRef(null);
  const spotifyPlayerRef = useRef(null);

  // Constants
  const QUEUE_UPDATE_INTERVAL = 3000; // 3 seconds between queue updates
  const PROGRESS_UPDATE_INTERVAL = 1000; // 1 second between progress updates
  const PROGRESS_SYNC_THRESHOLD = 2000; // 2 seconds difference threshold for syncing
  const TRACK_END_THRESHOLD = 1000; // 1 second before end to check if track is actually ending
  const MID_TRACK_SYNC_THRESHOLD = 0.5; // Sync when track is halfway through
  const SYNC_CHECK_INTERVAL = 30000; // Check sync every 30 seconds

  // State for progress tracking
  const [lastProgressUpdate, setLastProgressUpdate] = useState(0);
  const [lastSyncCheck, setLastSyncCheck] = useState(0);

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

    // Reset playback state
    setCurrentTrack(null);
    setIsPlaying(false);
    setProgress(0);
    setDuration(0);

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
  
  // Update the syncQueueWithSpotify function
  const syncQueueWithSpotify = async (queue) => {
    if (!queue || queue.length === 0) return;

    // Prevent multiple syncs from happening at once
    if (isQueueSyncing) {
      console.log('[DEBUG][Session] Queue sync already in progress, skipping');
      return;
    }

    // Check if we're syncing too frequently
    const now = Date.now();
    if (now - lastQueueUpdate < QUEUE_UPDATE_INTERVAL) {
      console.log('[DEBUG][Session] Queue sync too soon, skipping');
      return;
    }

    if (!spotifyPlayerRef.current) {
      console.error('[DEBUG][Session] Invalid Spotify player instance');
      return;
    }

    setIsQueueSyncing(true);
    setLastQueueUpdate(now);

    try {
      // Get current Spotify state
      const state = await spotifyPlayerRef.current.getCurrentState();
      const currentUri = state?.track_window?.current_track?.uri;
      console.log('[DEBUG][Session] Current Spotify state:', { currentUri, state });

      // Only sync Spotify tracks
      const spotifyTracks = queue.filter(track => track.source === 'spotify');
      
      // If this is the first Spotify track in our queue, handle it specially
      if (spotifyTracks.length === 1) {
        const firstTrack = spotifyTracks[0];
        const shouldLoad = currentUri !== firstTrack.uri;
        console.log('[DEBUG][Session] Processing first track:', {
          firstTrackUri: firstTrack.uri,
          firstTrackName: firstTrack.name,
          currentUri,
          shouldLoad
        });

        if (shouldLoad) {
          console.log('[DEBUG][Session] Loading new track', {
            currentUri,
            newUri: firstTrack.uri,
            isInitialQueueSetup,
            hasInitialTrackLoaded,
            trackName: firstTrack.name
          });

          // Store current playback state
          const wasPlaying = !state?.paused;

          // Play the new track
          await spotifyPlayerRef.current.load(firstTrack.uri);
          if (wasPlaying) {
            await spotifyPlayerRef.current.resume();
          }

          // Update state
          setHasInitialTrackLoaded(true);
          setIsInitialQueueSetup(false);
        }
      }

      console.log('[DEBUG][Session] Queue sync completed successfully');
    } catch (error) {
      console.error('[DEBUG][Session] Error syncing queue:', error);
    } finally {
      setIsQueueSyncing(false);
    }
  };

  // Update the queue callback useEffect
  const [lastQueueUpdate, setLastQueueUpdate] = useState(0);

  useEffect(() => {
    if (!queueService.socket) {
      debug.log('[DEBUG][Session] No socket connection, skipping queue callback setup');
      return;
    }

    debug.log('[DEBUG][Session] Setting up queue callbacks');
    
    queueService.setCallbacks(
      async (updatedQueue) => {
        const now = Date.now();
        debug.log('[DEBUG][Session] Queue update received:', {
          timeSinceLastUpdate: now - lastQueueUpdate,
          requiredInterval: QUEUE_UPDATE_INTERVAL,
          isQueueSyncing,
          isQueueProcessing,
          isInitialQueueSetup,
          hasInitialTrackLoaded,
          queueLength: updatedQueue?.length,
          queueContents: updatedQueue?.map(t => ({ uri: t.uri, name: t.name }))
        });

        if (now - lastQueueUpdate < QUEUE_UPDATE_INTERVAL || isQueueSyncing || isQueueProcessing) {
          debug.log('[DEBUG][Session] Queue update rate limited or sync in progress', {
            timeSinceLastUpdate: now - lastQueueUpdate,
            requiredInterval: QUEUE_UPDATE_INTERVAL,
            isQueueSyncing,
            isQueueProcessing,
            isInitialQueueSetup,
            hasInitialTrackLoaded
          });
          return;
        }

        setLastQueueUpdate(now);
        setQueue(updatedQueue || []);
        
        // Sync the queue with Spotify
        await syncQueueWithSpotify(updatedQueue);
      },
      (errorMessage) => {
        debug.logError('[DEBUG][Session] Queue service error:', errorMessage);
        setError({ message: errorMessage });
      }
    );
  }, [queueService.socket, lastQueueUpdate, isQueueSyncing, isQueueProcessing, isInitialQueueSetup, hasInitialTrackLoaded]);

  // Update the handleSkipNext function to include safety checks
  const handleSkipNext = async () => {
    if (!queue || queue.length <= 1) return;
    
    debug.log('Skipping to next track', {
      currentTrack,
      nextTrack: queue[1]
    });
    
    try {
      // Get the next track
      const nextTrack = queue[1];
      
      // Double check with Spotify if the current track is actually ending
      if (spotifyPlayerRef.current) {
        const state = await spotifyPlayerRef.current.getCurrentState();
        if (state && state.track_window.current_track) {
          const timeUntilEnd = state.duration - state.position;
          if (timeUntilEnd > TRACK_END_THRESHOLD) {
            debug.log('Track not actually ending, skipping manually');
          }
        }
      }
      
      // Update the queue in the service
      await queueService.removeFromQueue(queue[0]);
      
      // The queue update callback will handle syncing with Spotify
    } catch (error) {
      debug.logError('[DEBUG][Session] Error skipping to next track:', error);
      showQueueNotification('Failed to skip to next track', 'error');
    }
  };

  // Update handleAddToQueue with more logging
  const handleAddToQueue = async (track) => {
    try {
      // Format the track based on its source
      const formattedTrack = {
        ...track,
        source: track.source || (track.uri?.startsWith('spotify:') ? 'spotify' : 'appleMusic'),
        uri: track.uri || track.appleMusicId, // Use appleMusicId as URI for Apple Music tracks
        name: track.name || track.title,
        artists: track.artists || track.artist?.split(',').map(a => ({ name: a.trim() })),
        album: track.album || { name: track.albumName },
        duration_ms: track.duration_ms || (track.duration * 1000),
        albumArt: track.albumArt || track.artwork?.url
      };

      debug.log('Adding new track to queue', { formattedTrack });

      // Add to queue service
      await queueService.addToQueue(formattedTrack);
      
      // Show success notification
      showQueueNotification(`Added ${formattedTrack.name} to queue`);
    } catch (error) {
      debug.logError(error, 'Error adding track to queue');
      showQueueNotification('Failed to add track to queue', 'error');
    }
  };

  // Playback control handlers
  const handlePlayPause = async () => {
    if (!currentTrack) return;
    debug.log('[DEBUG][Session][PlayerBar] User clicked play/pause button', {
      currentTrack,
      wasPlaying: isPlaying,
      willPlay: !isPlaying
    });

    try {
      const player = spotifyPlayerRef.current;
      if (!player) {
        debug.logError('No Spotify player instance found');
        throw new Error('No Spotify player instance');
      }

      // Get current state
      debug.log('[DEBUG][Session] Getting current player state');
      const state = await player.getCurrentState();
      debug.log('[DEBUG][Session] Current player state:', state);
      
      // If we have a track but it's not loaded, load it first
      if (currentTrack && (!state || state.track_window?.current_track?.uri !== currentTrack.uri)) {
        debug.log('[DEBUG][Session] Loading track before playing', { 
          currentTrackUri: currentTrack.uri,
          currentStateUri: state?.track_window?.current_track?.uri 
        });
        try {
          await player.load(currentTrack.uri);
          debug.log('[DEBUG][Session] Track loaded successfully');
          // Wait a bit for the track to load
          await new Promise(resolve => setTimeout(resolve, 1000));
          debug.log('[DEBUG][Session] Finished waiting for track load');
        } catch (loadError) {
          debug.logError('[DEBUG][Session] Error loading track:', loadError);
          throw loadError;
        }
      }

      if (!state || state.paused) {
        debug.log('[DEBUG][Session] Attempting to resume playback');
        try {
          await player.resume();
          debug.log('[DEBUG][Session] Playback resumed successfully');
        } catch (resumeError) {
          debug.logError('[DEBUG][Session] Error resuming playback:', resumeError);
          throw resumeError;
        }
      } else {
        debug.log('[DEBUG][Session] Attempting to pause playback');
        try {
          await player.pause();
          debug.log('[DEBUG][Session] Playback paused successfully');
        } catch (pauseError) {
          debug.logError('[DEBUG][Session] Error pausing playback:', pauseError);
          throw pauseError;
        }
      }

      // Update UI state
      setIsPlaying(prev => !prev);
      debug.log('[DEBUG][Session] UI state updated', { newIsPlaying: !isPlaying });
    } catch (error) {
      debug.logError('[DEBUG][Session] Error in play/pause:', error);
      // If we get a 404, try to refresh the token
      if (error.message?.includes('404')) {
        const accessToken = localStorage.getItem('spotify_access_token');
        if (accessToken) {
          debug.log('[DEBUG][Session] Refreshing Spotify token due to 404 error');
          // Force token refresh by clearing it
          localStorage.removeItem('spotify_access_token');
          window.location.reload();
          return;
        }
      }
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

    return response.text().then(text => {
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch (e) {
        debug.log('[Spotify] Empty or invalid JSON response - this is expected');
        return null;
      }
    });
  };

  // Spotify Web Playback SDK loader
  useEffect(() => {
    if (!window.Spotify) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      
      // Define the callback before loading the script
      window.onSpotifyWebPlaybackSDKReady = () => {
        console.log('[Spotify SDK] Ready callback triggered');
        setSpotifyReady(true);
      };
      
      document.body.appendChild(script);
      script.onload = () => {
        console.log('[Spotify SDK] Script loaded');
      };
    } else {
      // SDK already loaded
      setSpotifyReady(true);
    }
  }, []);

  // Initialize Spotify Player when ready
  useEffect(() => {
    const token = localStorage.getItem('spotify_access_token');
    if (token && !spotifyPlayerRef.current && spotifyReady && window.Spotify) {
      debug.log('Initializing Spotify player');
      initializeSpotifyPlayer(token);
    }
  }, [spotifyReady]);

  const initializeSpotifyPlayer = (token) => {
    try {
      if (!window.Spotify) {
        throw new Error('Spotify SDK not loaded');
      }

      spotifyPlayer = new window.Spotify.Player({
        name: 'Harmony Web Player',
        getOAuthToken: cb => { cb(token); },
        volume: 0.8,
        enableMediaSession: true
      });

      spotifyPlayer.addListener('ready', ({ device_id }) => {
        debug.log('[Spotify SDK] Player ready with device_id', device_id);
        spotifyPlayerRef.current = spotifyPlayer;
        setSpotifyDeviceId(device_id);
        
        // Transfer playback to this device
        makeSpotifyApiCall('/v1/me/player', {
          method: 'PUT',
          body: JSON.stringify({ device_ids: [device_id], play: false })
        }).catch(error => {
          if (error.message.includes('404')) {
            debug.log('[Spotify] Cloud Playback API endpoint not found - this is expected');
          } else {
            debug.logError('[Spotify] Error transferring playback:', error);
          }
        });
      });

      // Handle Cloud Playback API errors
      spotifyPlayer.addListener('initialization_error', e => {
        if (e.message.includes('404') || e.message.includes('CloudPlaybackClientError')) {
          debug.log('[Spotify] Cloud Playback API error - this is expected:', e);
        } else {
          debug.logError('[Spotify SDK] Init error', e);
        }
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
      spotifyPlayer.addListener('playback_error', e => {
        debug.logError('[Spotify SDK] Playback error', e);
        // If we get a 404, try to refresh the token
        if (e.message?.includes('404')) {
          const accessToken = localStorage.getItem('spotify_access_token');
          if (accessToken) {
            debug.log('[Spotify] Refreshing token due to 404 error');
            localStorage.removeItem('spotify_access_token');
            window.location.reload();
          }
        }
      });
      
      // Helper function to convert ms to seconds
      const msToSeconds = (ms) => Math.floor(ms / 1000);

      // Update the player state change handler
      spotifyPlayer.addListener('player_state_changed', async state => {
        if (state) {
          debug.log('[Spotify SDK] Player state changed:', state);
          
          // Handle track changes
          if (state.track_window.current_track) {
            const newTrack = {
              ...state.track_window.current_track,
              title: state.track_window.current_track.name,
              artist: state.track_window.current_track.artists.map(a => a.name).join(', '),
              albumArt: state.track_window.current_track.album?.images?.[0]?.url,
              source: 'spotify',
              uri: state.track_window.current_track.uri,
              duration: Math.floor(state.track_window.current_track.duration_ms / 1000)
            };
            
            // Only update track if it's different
            if (!currentTrack || currentTrack.uri !== newTrack.uri) {
              debug.log('[Spotify] Track changed:', {
                from: currentTrack?.name,
                to: newTrack.name
              });
              setCurrentTrack(newTrack);
            }
            
            const now = Date.now();
            const timeUntilEnd = state.duration - state.position;
            
            // Update progress
            if (now - lastProgressUpdate > PROGRESS_UPDATE_INTERVAL) {
              setProgress(msToSeconds(state.position));
              setDuration(Math.floor(state.duration / 1000));
              setLastProgressUpdate(now);
            }
            
            // Sync with Spotify if needed
            if (state.paused || timeUntilEnd < TRACK_END_THRESHOLD) {
              try {
                const spotifyState = await spotifyPlayerRef.current.getCurrentState();
                if (spotifyState && spotifyState.track_window.current_track) {
                  const spotifyPosition = msToSeconds(spotifyState.position);
                  const currentPosition = msToSeconds(state.position);
                  
                  if (Math.abs(spotifyPosition - currentPosition) > 1) {
                    debug.log('[Spotify] Syncing progress:', {
                      current: currentPosition,
                      spotify: spotifyPosition
                    });
                    setProgress(spotifyPosition);
                  }
                }
              } catch (error) {
                debug.logError('[Spotify] Error syncing progress:', error);
              }
            }
            
            // Update playing state
            if (state.paused !== !isPlaying) {
              setIsPlaying(!state.paused);
            }
          } else {
            // No track playing
            setCurrentTrack(null);
            setIsPlaying(false);
          }
        } else {
          // No state
          setCurrentTrack(null);
          setIsPlaying(false);
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
      
      // Check if user has an active subscription
      const subscription = await music.api.me();
      if (!subscription || !subscription.attributes?.canPlay) {
        throw new Error('Apple Music subscription required');
      }
      
      setAppleMusicUserToken(userToken);
      console.log('[MusicKit] User authorized, token:', userToken);
    } catch (err) {
      console.error('[MusicKit] Authorization failed:', err);
      if (err.message === 'Apple Music subscription required') {
        showQueueNotification('Apple Music subscription required to play tracks', 'error');
      }
    }
  };

  // Handle playback state
  useEffect(() => {
    // Don't proceed if session is not fully initialized
    if (!spotifyReady || !selectedPlaybackDevice) {
      return;
    }

    // Don't proceed if there's no track or device
    if (!currentTrack || !selectedPlaybackDevice) {
      return;
    }

    // Check if the selected device can play the track
    const canPlay = currentTrack.uri?.startsWith('spotify:') ? selectedPlaybackDevice.hasSpotify : selectedPlaybackDevice.hasAppleMusic;
    
    // Only log if there's a meaningful change in playback state
    if (canPlay && (isPlaying !== undefined)) {
      debug.log('[Playback] Playback state updated', {
        track: currentTrack.uri,
        isPlaying,
        device: selectedPlaybackDevice.name
      });
    }
  }, [currentTrack, selectedPlaybackDevice, isPlaying, spotifyReady]);

  // Add Spotify player state change handler
  useEffect(() => {
    if (!spotifyPlayerRef.current) return;

    const handlePlayerStateChange = (state) => {
      if (!state) return;
      
      // Only update if the state actually changed
      const newIsPlaying = !state.paused;
      if (newIsPlaying !== isPlaying) {
        setIsPlaying(newIsPlaying);
      }

      // Update track info if needed
      if (state.track_window?.current_track) {
        const currentTrack = {
          ...state.track_window.current_track,
          title: state.track_window.current_track.name,
          artist: state.track_window.current_track.artists.map(a => a.name).join(', '),
          albumArt: state.track_window.current_track.album?.images?.[0]?.url,
          source: 'spotify',
          uri: state.track_window.current_track.uri,
          duration: Math.floor(state.track_window.current_track.duration_ms / 1000) // Convert to seconds
        };
        setCurrentTrack(currentTrack);
        setProgress(state.position);
        setDuration(Math.floor(state.duration / 1000)); // Convert to seconds
      }
    };

    spotifyPlayerRef.current.addListener('player_state_changed', handlePlayerStateChange);

    return () => {
      if (spotifyPlayerRef.current) {
        spotifyPlayerRef.current.removeListener('player_state_changed', handlePlayerStateChange);
      }
    };
  }, [spotifyPlayerRef.current, isPlaying]);

  // Handle queue updates
  const handleQueueUpdate = (newQueue) => {
    setQueue(newQueue);
  };

  const showQueueNotification = (message, severity = 'success') => {
    setQueueNotification({ open: true, message, severity });
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
        selectedPlaybackDevice={selectedPlaybackDevice}
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
        progress={progress}
        duration={duration}
        onSeek={handleSeek}
      />
      <Search
        onAddTrack={handleAddToQueue}
        isSpotifyConnected={hasSpotify}
      />
    </Box>
  );
} 