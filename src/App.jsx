import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box } from '@mui/material';

// Pages
import Home from './pages/Home';
import Queue from './pages/Queue';
import Settings from './pages/Settings';
import Callback from './pages/Callback';
import Session from './pages/Session';

// Components
import Navigation from './components/Navigation';
import PlayerBar from './components/PlayerBar';

// Theme configuration
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#1DB954', // Spotify green
    },
    secondary: {
      main: '#FC3C44', // Apple Music pink
    },
    background: {
      default: '#121212',
      paper: '#1E1E1E',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: "#1DB954 #121212",
          "&::-webkit-scrollbar, & *::-webkit-scrollbar": {
            width: 8,
          },
          "&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb": {
            borderRadius: 8,
            backgroundColor: "#1DB954",
          },
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          <Navigation />
          <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/queue" element={<Queue />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/callback" element={<Callback />} />
              <Route path="/session/:sessionId" element={<Session />} />
            </Routes>
          </Box>
          <PlayerBar />
        </Box>
      </Router>
    </ThemeProvider>
  );
}

export default App; 