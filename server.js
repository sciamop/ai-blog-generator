const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const bcrypt = require('bcrypt');
const axios = require('axios');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.authenticated) {
    next();
  } else {
    // For API routes, return JSON error instead of redirecting
    if (req.path.startsWith('/api/')) {
      res.status(401).json({ error: 'Authentication required', redirect: '/login' });
    } else {
      res.redirect('/login');
    }
  }
};

// Login route
app.get('/login', (req, res) => {
  if (req.session.authenticated) {
    res.redirect('/');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const expectedUsername = process.env.AUTH_USERNAME || 'admin';
  const expectedPassword = process.env.AUTH_PASSWORD || 'admin';

  if (username === expectedUsername && password === expectedPassword) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.redirect('/login?error=invalid');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Serve static files (protected)
app.use('/static', requireAuth, express.static(path.join(__dirname, 'public')));

// Serve CSS and JS files directly (protected)
app.get('/styles.css', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'styles.css'));
});

app.get('/script.js', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'script.js'));
});

// Import routes
const aiRoutes = require('./routes/ai');
const wordpressRoutes = require('./routes/wordpress');

// Use routes (protected)
app.use('/api', requireAuth, aiRoutes);
app.use('/api', requireAuth, wordpressRoutes);

// Main application route (protected)
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint - lightweight, doesn't hit Python server on every request
app.get('/api/health', async (req, res) => {
  // Only check Python server occasionally, not on every health check
  const shouldCheckPython = Math.random() < 0.1; // 10% chance
  
  if (shouldCheckPython) {
    try {
      const response = await axios.get(`${process.env.REMOTE_SERVER_URL || 'http://localhost:8000'}/health`, {
        timeout: 2000 // 2 second timeout
      });
      res.json({ status: 'ok', python_server: 'connected' });
    } catch (err) {
      res.json({ status: 'ok', python_server: 'disconnected' });
    }
  } else {
    // Most of the time, just return Node.js status without checking Python
    res.json({ status: 'ok', python_server: 'unknown' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Remote server URL: ${process.env.REMOTE_SERVER_URL || 'http://localhost:8000'}`);
}); 