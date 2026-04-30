import express from 'express';
import { query } from '../db/connection.js';
import { logActivity, cbcStatus } from '../utils/auth.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// Admin: Get all parents
router.get('/admin/parents', requireRole('admin'), async (req, res) => {
  try {
    const result = await query(
      "SELECT id, fullname, username, email, created_at FROM users WHERE role='parent' ORDER BY fullname"
    );

    const parents = [];
    for (const p of result.rows) {
      const childrenResult = await query(
        `SELECT s.id, s.name, s.email FROM parent_students ps
         JOIN students s ON ps.student_id = s.id
         WHERE ps.parent_id = $1`,
        [p.id]
      );

      parents.push({
        ...p,
        children: childrenResult.rows,
        created_at: p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB') : '—'
      });
    }

    res.json(parents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch parents' });
  }
});

// Admin: Add parent
router.post('/admin/parents', requireRole('admin'), async (req, res) => {
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

    try {
      const { hashPassword } = await import('../utils/auth.js');
      const hashedPassword = await hashPassword(password);

      await query(
        'INSERT INTO users (fullname, username, email, password, role) VALUES ($1, $2, $3, $4, $5)',
        [fullname, username, email, hashedPassword, 'parent']
      );

      await logActivity(req.user.id, req.user.fullname, 'Added parent', `${fullname} (${username})`);

      res.status(201).json({ message: 'Parent added' });
    } catch (dbError) {
      if (dbError.code === '23505') {
        return res.status(409).json({ error: 'Username or email already exists' });
      }
      throw dbError;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add parent' });
  }
});

// Admin: Delete parent
router.delete('/admin/parents/:parentId', requireRole('admin'), async (req, res) => {
  try {
    const { parentId } = req.params;

    await query("DELETE FROM users WHERE id = $1 AND role = 'parent'", [parentId]);

    await logActivity(req.user.id, req.user.fullname, 'Deleted parent', `Parent #${parentId}`);

    res.json({ message: 'Parent deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete parent' });
  }
});

// Admin: Link parent to student
router.post('/admin/parents/:parentId/link', requireRole('admin'), async (req, res) => {
  try {
    const { parentId } = req.params;
    const { student_id } = req.body;

    if (!student_id) {
      return res.status(400).json({ error: 'student_id is required' });
    }

    try {
      await query(
        'INSERT INTO parent_students (parent_id, student_id) VALUES ($1, $2)',
        [parentId, student_id]
      );

      res.json({ message: 'Linked' });
    } catch (dbError) {
      if (dbError.code === '23505') {
        return res.status(409).json({ error: 'Already linked' });
      }
      throw dbError;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to link parent' });
  }
});

// Admin: Unlink parent from student
router.delete('/admin/parents/:parentId/unlink/:studentId', requireRole('admin'), async (req, res) => {
  try {
    const { parentId, studentId } = req.params;

    await query(
      'DELETE FROM parent_students WHERE parent_id = $1 AND student_id = $2',
      [parentId, studentId]
    );

    res.json({ message: 'Unlinked' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to unlink parent' });
  }
});

// Parent: Get my children
router.get('/children', requireRole('parent'), async (req, res) => {
  try {
    const result = await query(
      `SELECT s.id, s.name, s.email FROM parent_students ps
       JOIN students s ON ps.student_id = s.id
       WHERE ps.parent_id = $1`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch children' });
  }
});

// Parent: Get child's grades
router.get('/child/:studentId/grades', requireRole('parent'), async (req, res) => {
  try {
    const { studentId } = req.params;

    // Verify parent is linked to this student
    const linkResult = await query(
      'SELECT id FROM parent_students WHERE parent_id = $1 AND student_id = $2',
      [req.user.id, studentId]
    );

    if (linkResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized for this student' });
    }

    const studentResult = await query('SELECT * FROM students WHERE id = $1', [studentId]);
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const student = studentResult.rows[0];
    const termFilter = req.query.term?.trim() || '';

    let gradesResult;
    if (termFilter) {
      gradesResult = await query(
        'SELECT * FROM grades WHERE student_id = $1 AND term = $2 ORDER BY created_at DESC',
        [studentId, termFilter]
      );
    } else {
      gradesResult = await query(
        'SELECT * FROM grades WHERE student_id = $1 ORDER BY created_at DESC',
        [studentId]
      );
    }

    const grades = gradesResult.rows.map(g => ({
      ...g,
      date_added: g.created_at ? new Date(g.created_at).toLocaleDateString('en-GB') : '—'
    }));

    const avgGrade = grades.length > 0 ? parseFloat((grades.reduce((a, b) => a + b.grade) / grades.length).toFixed(2)) : null;
    const status = cbcStatus(avgGrade);

    res.json({
      student,
      grades,
      average: avgGrade,
      status
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch child grades' });
  }
});

// Parent: Get child's attendance
router.get('/child/:studentId/attendance', requireRole('parent'), async (req, res) => {
  try {
    const { studentId } = req.params;

    // Verify parent is linked to this student
    const linkResult = await query(
      'SELECT id FROM parent_students WHERE parent_id = $1 AND student_id = $2',
      [req.user.id, studentId]
    );

    if (linkResult.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized for this student' });
    }

    const termFilter = req.query.term?.trim() || '';

    let attendanceResult;
    if (termFilter) {
      attendanceResult = await query(
        'SELECT * FROM attendance WHERE student_id = $1 AND term = $2 ORDER BY date DESC',
        [studentId, termFilter]
      );
    } else {
      attendanceResult = await query(
        'SELECT * FROM attendance WHERE student_id = $1 ORDER BY date DESC',
        [studentId]
      );
    }

    const records = attendanceResult.rows;
    const total = records.length;
    const present = records.filter(r => r.status === 'Present').length;
    const absent = records.filter(r => r.status === 'Absent').length;
    const late = records.filter(r => r.status === 'Late').length;
    const pct = total > 0 ? parseFloat(((present / total) * 100).toFixed(1)) : 0;

    res.json({
      records: records.map(r => ({
        date: r.date,
        status: r.status,
        term: r.term || 'Term 1'
      })),
      summary: { total, present, absent, late, pct }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch child attendance' });
  }
});

export default router;
