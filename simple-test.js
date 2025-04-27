import { createServer } from 'http';

const server = createServer((req, res) => {
  console.log('\nIncoming request:');
  console.log('From:', req.socket.remoteAddress);
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  
  res.writeHead(200, { 
    'Content-Type': 'text/plain',
    'Access-Control-Allow-Origin': '*'
  });
  res.end('Test server is working!\n');
});

const port = 8080;
server.listen(port, '0.0.0.0', () => {
  console.log('Test server running at:');
  console.log(`- http://10.100.11.132:${port}`);
  console.log(`- http://localhost:${port}`);
  console.log('\nPress Ctrl+C to stop the server');
  console.log('\nWaiting for connections...');
}); 