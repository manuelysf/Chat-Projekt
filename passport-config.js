const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

// Open the database connection
const dbPromise = open({
  filename: 'chat.db',
  driver: sqlite3.Database
});

function initialize(passport) {
  const authenticateUser = async (email, password, done) => {
    const db = await dbPromise;
    try {
      const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

      if (!user) {
        return done(null, false, { message: 'No user with that email' });
      }

      const passwordMatches = await bcrypt.compare(password, user.password);
      if (passwordMatches) {
        return done(null, user);
      } else {
        return done(null, false, { message: 'Password incorrect' });
      }
    } catch (error) {
      return done(error);
    }
  };

  passport.use(new LocalStrategy({ usernameField: 'email' }, authenticateUser));
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id, done) => {
    const db = await dbPromise;
    try {
      const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  });
}

module.exports = initialize;
