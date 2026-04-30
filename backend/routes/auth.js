import express from 'express';
import { query } from '../db/connection.js';
import {
  hashPassword,
  comparePassword,
  generateToken,
  logActivity,
  cbcStatus
} from '../utils/auth.js';
import { sendResetEmail } from '../utils/email.js';
import { authMiddleware } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Please enter both username and password' });
    }

    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken(user);

    await logActivity(user.id, user.fullname, 'Logged in', user.role);

    const redirects = {
      admin: '/dashboard/admin',
      teacher: '/dashboard/teacher',
      student: '/dashboard/student',
      parent: '/dashboard/parent'
    };

    res.json({
      message: 'Login successful',
      token,
      role: user.role,
      fullname: user.fullname,
      redirect: redirects[user.role]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { fullname, username, email, password } = req.body;

    if (!fullname || !username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (fullname.length > 32) {
      return res.status(400).json({ error: 'Full name must be 32 characters or less' });
    }

    if (username.length > 32) {
      return res.status(400).json({ error: 'Username must be 32 characters or less' });
    }

    try {
      const hashedPassword = await hashPassword(password);

      await query(
        'INSERT INTO users (fullname, username, email, password, role) VALUES ($1, $2, $3, $4, $5)',
        [fullname, username, email, hashedPassword, 'student']
      );

      await query(
        'INSERT INTO students (name, email) VALUES ($1, $2)',
        [fullname, email]
      );

      res.status(201).json({ message: 'Account created successfully' });
    } catch (dbError) {
      if (dbError.code === '23505') { // Unique violation
        return res.status(409).json({ error: 'Username or email already exists' });
      }
      throw dbError;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out' });
});

// Change password
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    if (!(await comparePassword(currentPassword, user.password))) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (await comparePassword(newPassword, user.password)) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const hashedPassword = await hashPassword(newPassword);
    await query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, user.id]);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await query(
      'SELECT id, fullname, email FROM users WHERE LOWER(email) = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const user = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Invalidate existing tokens
    await query(
      'UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false',
      [user.id]
    );

    // Create new token
    await query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    try {
      await sendResetEmail(user.email, token);
    } catch (emailError) {
      console.error('Email error:', emailError);
      return res.status(500).json({ error: `Email failed: ${emailError.message}` });
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const result = await query(
      'SELECT id, user_id, expires_at, used FROM password_reset_tokens WHERE token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link.' });
    }

    const record = result.rows[0];

    if (record.used) {
      return res.status(400).json({ error: 'This reset link has already been used.' });
    }

    if (new Date() > new Date(record.expires_at)) {
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    const hashedPassword = await hashPassword(password);
    await query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, record.user_id]);
    await query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [record.id]);

    res.json({ message: 'Password reset successfully! You can now log in.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
