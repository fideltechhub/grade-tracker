import express from 'express';
import { query } from '../db/connection.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get announcements
router.get('/', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM announcements ORDER BY created_at DESC LIMIT 20'
    );

    const announcements = result.rows.map(a => ({
      id: a.id,
      title: a.title,
      message: a.message || '',
      author_name: a.author_name,
      created_at: a.created_at ? new Date(a.created_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '—'
    }));

    res.json(announcements);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Post announcement (admin only)
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const { title, message } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    await query(
      'INSERT INTO announcements (title, message, author_name, created_by) VALUES ($1, $2, $3, $4)',
      [title.trim(), message?.trim() || null, req.user.fullname, req.user.id]
    );

    res.status(201).json({ message: 'Announcement posted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to post announcement' });
  }
});

// Delete announcement (admin only)
router.delete('/:announcementId', requireRole('admin'), async (req, res) => {
  try {
    const { announcementId } = req.params;

    await query('DELETE FROM announcements WHERE id = $1', [announcementId]);

    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

export default router;
