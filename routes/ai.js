const express = require('express');
const axios = require('axios');
const router = express.Router();

const REMOTE_SERVER_URL = process.env.REMOTE_SERVER_URL || 'http://localhost:8000';

router.post('/generate', async (req, res) => {
  try {
    console.log('Forwarding request to:', `${REMOTE_SERVER_URL}/generate`);
    console.log('Request body:', req.body);
    
    const response = await axios.post(`${REMOTE_SERVER_URL}/generate`, req.body, {
      timeout: 120000 // 2 minutes timeout for content generation
    });
    console.log('Response received:', response.data);
    res.json(response.data);
  } catch (err) {
    console.error('Error generating content:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
      console.error('Response headers:', err.response.headers);
      
      // Check if response is JSON
      const contentType = err.response.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        // Forward the original error status and data
        res.status(err.response.status).json(err.response.data);
      } else {
        // Handle non-JSON responses (like HTML error pages)
        console.error('Non-JSON response received:', typeof err.response.data);
        res.status(err.response.status).json({ 
          error: 'Server returned non-JSON response',
          original_status: err.response.status,
          content_type: contentType
        });
      }
    } else if (err.code === 'ECONNABORTED') {
      console.error('Request timeout - Python server took too long to respond');
      res.status(408).json({ error: 'Request timeout - the AI server is taking too long to respond. Please try again.' });
    } else {
      res.status(500).json({ error: 'Failed to generate content' });
    }
  }
});

router.post('/regenerate-title', async (req, res) => {
  try {
    console.log('Forwarding regenerate title request to:', `${REMOTE_SERVER_URL}/regenerate-title`);
    console.log('Request body:', req.body);
    
    const response = await axios.post(`${REMOTE_SERVER_URL}/regenerate-title`, req.body, {
      timeout: 60000 // 1 minute timeout for title regeneration
    });
    console.log('Title regeneration response:', response.data);
    res.json(response.data);
  } catch (err) {
    console.error('Error regenerating title:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
      
      const contentType = err.response.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        res.status(err.response.status).json(err.response.data);
      } else {
        res.status(err.response.status).json({ 
          error: 'Server returned non-JSON response',
          original_status: err.response.status,
          content_type: contentType
        });
      }
    } else if (err.code === 'ECONNABORTED') {
      console.error('Title regeneration timeout - Python server took too long to respond');
      res.status(408).json({ error: 'Request timeout - the AI server is taking too long to respond. Please try again.' });
    } else {
      res.status(500).json({ error: 'Failed to regenerate title' });
    }
  }
});

router.post('/regenerate-category', async (req, res) => {
  try {
    console.log('Forwarding regenerate category request to:', `${REMOTE_SERVER_URL}/regenerate-category`);
    console.log('Request body:', req.body);
    
    const response = await axios.post(`${REMOTE_SERVER_URL}/regenerate-category`, req.body, {
      timeout: 60000 // 1 minute timeout for category regeneration
    });
    console.log('Category regeneration response:', response.data);
    res.json(response.data);
  } catch (err) {
    console.error('Error regenerating category:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
      
      const contentType = err.response.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        res.status(err.response.status).json(err.response.data);
      } else {
        res.status(err.response.status).json({ 
          error: 'Server returned non-JSON response',
          original_status: err.response.status,
          content_type: contentType
        });
      }
    } else if (err.code === 'ECONNABORTED') {
      console.error('Category regeneration timeout - Python server took too long to respond');
      res.status(408).json({ error: 'Request timeout - the AI server is taking too long to respond. Please try again.' });
    } else {
      res.status(500).json({ error: 'Failed to regenerate category' });
    }
  }
});

router.get('/debug', async (req, res) => {
  try {
    console.log('Forwarding debug request to:', `${REMOTE_SERVER_URL}/debug`);
    
    const response = await axios.get(`${REMOTE_SERVER_URL}/debug`, {
      timeout: 10000 // 10 seconds timeout for debug requests
    });
    console.log('Debug response:', response.data);
    res.json(response.data);
  } catch (err) {
    console.error('Error in debug endpoint:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
      
      const contentType = err.response.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        res.status(err.response.status).json(err.response.data);
      } else {
        res.status(err.response.status).json({ 
          error: 'Server returned non-JSON response',
          original_status: err.response.status,
          content_type: contentType
        });
      }
    } else if (err.code === 'ECONNABORTED') {
      console.error('Debug request timeout - Python server took too long to respond');
      res.status(408).json({ error: 'Request timeout - the AI server is taking too long to respond. Please try again.' });
    } else {
      res.status(500).json({ error: 'Failed to get debug info' });
    }
  }
});

module.exports = router; 