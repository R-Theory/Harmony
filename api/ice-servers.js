export default function handler(req, res) {
  res.status(200).json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'turn:a.relay.metered.ca:80', username: 'e8e9a6e62f8b9c228f1a5a6d', credential: 'uGpa0qKe+bVE' },
      { urls: 'turn:a.relay.metered.ca:80?transport=tcp', username: 'e8e9a6e62f8b9c228f1a5a6d', credential: 'uGpa0qKe+bVE' }
    ]
  });
} 