import socket from './socket';

// Store peer connection and socket IDs for signaling
let hostSocketId = null;
let guestSocketId = null;

/**
 * Sets up a WebRTC connection for audio streaming.
 * @param {boolean} isHost - True if this device is the host (speaker), false if guest (streamer).
 * @param {string} sessionId - The session ID for signaling.
 * @param {function} onAudioStream - Callback for host to receive audio stream.
 * @returns {RTCPeerConnection}
 */
export function setupWebRTC(isHost, sessionId, onAudioStream) {
  const pc = new RTCPeerConnection();

  // Debugging
  pc.oniceconnectionstatechange = () => {
    console.log('[WebRTC] ICE state:', pc.iceConnectionState);
  };
  pc.onconnectionstatechange = () => {
    console.log('[WebRTC] Connection state:', pc.connectionState);
  };

  // Handle ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('webrtc-ice-candidate', {
        sessionId,
        candidate: event.candidate,
        to: isHost ? guestSocketId : hostSocketId,
      });
      console.log('[WebRTC] Sent ICE candidate');
    }
  };

  // Host receives audio stream
  if (isHost) {
    pc.ontrack = (event) => {
      console.log('[WebRTC] Host received audio stream');
      if (onAudioStream) onAudioStream(event.streams[0]);
    };
  }

  // Signaling handlers
  socket.on('webrtc-offer', async ({ offer, from }) => {
    if (isHost) {
      hostSocketId = socket.id;
      guestSocketId = from;
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', { sessionId, answer, to: from });
      console.log('[WebRTC] Host sent answer');
    }
  });

  socket.on('webrtc-answer', async ({ answer }) => {
    if (!isHost) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[WebRTC] Guest received answer');
    }
  });

  socket.on('webrtc-ice-candidate', async ({ candidate }) => {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[WebRTC] Added ICE candidate');
    } catch (e) {
      console.error('[WebRTC] Error adding ICE candidate:', e);
    }
  });

  return pc;
}

/**
 * Guest: Start streaming audio (microphone for demo; system audio requires extra permissions/extensions).
 * @param {RTCPeerConnection} pc
 * @param {string} sessionId
 */
export async function startGuestAudioStream(pc, sessionId) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('webrtc-offer', { sessionId, offer });
    console.log('[WebRTC] Guest sent offer');
  } catch (err) {
    console.error('[WebRTC] Error starting guest audio stream:', err);
  }
}

/**
 * Host: Play received audio stream in the browser.
 * @param {MediaStream} audioStream
 */
export function playHostAudioStream(audioStream) {
  const audio = document.createElement('audio');
  audio.srcObject = audioStream;
  audio.autoplay = true;
  audio.controls = true;
  document.body.appendChild(audio);
  console.log('[WebRTC] Host is playing received audio stream');
} 