# Harmony - Real-time Music Collaboration App

A web application for real-time music collaboration using WebRTC and Spotify integration.

## Features

- Real-time audio streaming between users
- Spotify integration for music playback
- Session-based collaboration rooms
- QR code sharing for easy joining

## Deployment on Vercel

This application is designed to be deployed on Vercel as a fully serverless application. No local servers are required.

### Prerequisites

- A Vercel account
- A GitHub repository with this code
- Spotify Developer account (for Spotify integration)

### Environment Variables

Set the following environment variables in your Vercel project:

```
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=https://your-vercel-domain.vercel.app/callback
```

### Deployment Steps

1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Configure the environment variables in Vercel
4. Deploy!

### Local Development

For local development, you can run:

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Start the backend server (only needed for local development)
npm run server
```

## Architecture

- Frontend: React with Vite
- Backend: Express.js (serverless on Vercel)
- Real-time communication: WebRTC with PeerJS
- Music integration: Spotify Web API

## License

MIT 