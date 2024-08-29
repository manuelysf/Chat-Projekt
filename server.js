if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const { createServer } = require('node:http');
const { join } = require('node:path');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcrypt');
const passport = require('passport');
const flash = require('express-flash');
const session = require('express-session');
const methodOverride = require('method-override');
const initializePassport = require('./passport-config');

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {}
});

// Setup Passport
initializePassport(
  passport,
  email => users.find(user => user.email === email),
  id => users.find(user => user.id === id)
);

const users = [];

// Open the database connection
const dbPromise = open({
  filename: 'chat.db',
  driver: sqlite3.Database
});

// Create 'messages' and 'users' tables if they don't exist
dbPromise.then(db => {
  return Promise.all([
    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        content TEXT
      );
    `),
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT
      );
    `)
  ]);
}).catch(err => console.error(err));

// Setup middlewares
app.set('view-engine', 'ejs');
app.use(express.urlencoded({ extended: false }));
app.use(flash());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(methodOverride('_method'));

// Serve static files for chat front-end (e.g., socket.io)
app.use(express.static(join(__dirname, 'public')));

// Define Routes
app.get('/', checkAuthenticated, (req, res) => {
  res.render('index.ejs', { name: req.user.name });
});

app.get('/login', checkNotAuthenticated, (req, res) => {
  res.render('login.ejs');
});

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}));

app.get('/register', checkNotAuthenticated, (req, res) => {
  res.render('register.ejs');
});

app.post('/register', checkNotAuthenticated, async (req, res) => {
  try {
    const db = await dbPromise;
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    await db.run('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [
      req.body.name,
      req.body.email,
      hashedPassword
    ]);

    res.redirect('/login');
  } catch (error) {
    console.error("Error during registration:", error);
    res.redirect('/register');
  }
});


app.delete('/logout', (req, res) => {
  req.logOut();
  res.redirect('/login');
});

// Setup Socket.IO for chat functionality
io.on('connection', (socket) => {
  socket.on('chat message', async (msg) => {
    let result;
    const db = await dbPromise;
    try {
      // Store the message in the database
      result = await db.run('INSERT INTO messages (content) VALUES (?)', msg);
    } catch (e) {
      console.error("Failed to store message:", e);
      return;
    }
    // Include the offset with the message
    io.emit('chat message', msg, result.lastID);
  });
});

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  next();
}

// Start the server
server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
