import express from 'express';
const app = express();

app.get('/', (req, res) => {
  res.send('Test server is working!');
});

const port = 5174;
app.listen(port, '0.0.0.0', () => {
  console.log(`Test server running on port ${port}`);
}); 