import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3000;
const jwtSecret = process.env.JWT_SECRET;

if (!process.env.DATABASE_URL || !jwtSecret) {
  console.error('DATABASE_URL and JWT_SECRET must be set. Copy .env.example to .env.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initialiseDatabase() {
  const schema = await readFile(new URL('./database.sql', import.meta.url), 'utf8');
  await pool.query(schema);
}

app.use(express.json());
app.use(express.static('public'));
app.set('trust proxy', 1);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

const normaliseEmail = (email) => String(email || '').trim().toLowerCase();
const publicUser = (user) => ({
  id: user.id,
  fullName: user.full_name,
  email: user.email,
  createdAt: user.created_at,
  lastLoginAt: user.last_login_at
});

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
  try {
    req.auth = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
}

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const fullName = String(req.body.fullName || '').trim();
    const email = normaliseEmail(req.body.email);
    const password = String(req.body.password || '');
    if (fullName.length < 2 || fullName.length > 120) return res.status(400).json({ message: 'Enter a name between 2 and 120 characters.' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ message: 'Use at least 8 characters for your password.' });

    const passwordHash = await bcrypt.hash(password, 12);
    const id = randomUUID();
    const result = await pool.query(
      `INSERT INTO users (id, full_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, created_at, last_login_at`,
      [id, fullName, email, passwordHash]
    );
    const user = result.rows[0];
    res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'An account with this email already exists.' });
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = normaliseEmail(req.body.email);
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Email or password is incorrect.' });
    }
    const now = new Date();
    await pool.query('UPDATE users SET last_login_at = $1, updated_at = $1 WHERE id = $2', [now, user.id]);
    await pool.query('INSERT INTO login_events (id, user_id, logged_in_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), user.id, now, req.ip, req.get('user-agent') || null]);
    user.last_login_at = now;
    res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) { next(error); }
});

app.get('/api/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, full_name, email, created_at, last_login_at FROM users WHERE id = $1', [req.auth.sub]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Account not found.' });
    res.json({ user: publicUser(result.rows[0]) });
  } catch (error) { next(error); }
});

app.get('/api/uploads/me', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, file_name, mime_type, file_size_bytes, uploaded_at FROM user_uploads WHERE user_id = $1', [req.auth.sub]);
    res.json({ upload: result.rows[0] || null });
  } catch (error) { next(error); }
});

app.post('/api/uploads', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a file before uploading.' });
    const result = await pool.query(
      'INSERT INTO user_uploads (id, user_id, file_name, mime_type, file_size_bytes, file_data) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, file_name, mime_type, file_size_bytes, uploaded_at',
      [randomUUID(), req.auth.sub, req.file.originalname, req.file.mimetype || 'application/octet-stream', req.file.size, req.file.buffer]
    );
    res.status(201).json({ upload: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'You have already uploaded your one allowed file.' });
    next(error);
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ message: 'Files must be 10 MB or smaller.' });
  console.error(error);
  res.status(500).json({ message: 'Something went wrong. Please try again.' });
});

initialiseDatabase().then(() => app.listen(port, () => console.log(`DataLens running on http://localhost:${port}`)))
  .catch((error) => { console.error('Database setup failed:', error); process.exit(1); });
