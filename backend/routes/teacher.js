import express from 'express';
import { query } from '../db/connection.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// Search teachers (admin only)
router.get('/search', requireRole('admin'), async (req, res) => {
  try {
    const queryStr = req.query.q?.trim() || '';

    if (!queryStr) {
      return res.json([]);
    }

    const result = await query(
      `SELECT * FROM users
       WHERE role = 'teacher' AND (
         LOWER(fullname) LIKE $1 OR
         LOWER(username) LIKE $2 OR
         LOWER(subject) LIKE $3
       )
       ORDER BY fullname`,
      [
        `%${queryStr.toLowerCase()}%`,
        `%${queryStr.toLowerCase()}%`,
        `%${queryStr.toLowerCase()}%`
      ]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to search teachers' });
  }
});

export default router;
