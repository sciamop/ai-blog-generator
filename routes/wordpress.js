const express = require('express');
const axios = require('axios');
const router = express.Router();

const REMOTE_SERVER_URL = process.env.REMOTE_SERVER_URL || 'http://localhost:8000';

router.post('/confirm-post', async (req, res) => {
  try {
    console.log('Forwarding request to:', `${REMOTE_SERVER_URL}/confirm-post`);
    console.log('Request body:', req.body);
    
    const response = await axios.post(`${REMOTE_SERVER_URL}/confirm-post`, req.body);
    console.log('Response received:', response.data);
    res.json(response.data);
  } catch (err) {
    console.error('Error posting to WordPress:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
    res.status(500).json({ error: 'Failed to post to WordPress' });
  }
});

module.exports = router; 