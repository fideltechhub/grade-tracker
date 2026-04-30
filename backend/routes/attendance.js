import express from 'express';
import { query } from '../db/connection.js';
import { logActivity } from '../utils/auth.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// Mark attendance
router.post('/', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { records, date, term } = req.body;

    if (!date || !records || records.length === 0) {
      return res.status(400).json({ error: 'date and records are required' });
    }

    let saved = 0;
    for (const record of records) {
      const { student_id, status } = record;

      if (!student_id || !['Present', 'Absent', 'Late'].includes(status)) {
        continue;
      }

      await query(
        `INSERT INTO attendance (student_id, date, status, term, marked_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (student_id, date)
         DO UPDATE SET status = EXCLUDED.status, term = EXCLUDED.term, marked_by = EXCLUDED.marked_by`,
        [student_id, date, status, term || 'Term 1', req.user.id]
      );

      saved++;
    }

    await logActivity(req.user.id, req.user.fullname, 'Marked attendance', `${saved} records for ${date} (${term || 'Term 1'})`);

    res.json({ saved, message: `Attendance saved for ${date}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});

// Get attendance
router.get('/', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const dateFilter = req.query.date?.trim() || '';
    const studentFilter = req.query.student_id?.trim() || '';
    const termFilter = req.query.term?.trim() || '';

    const conditions = [];
    const params = [];

    if (dateFilter) {
      conditions.push('a.date = $' + (params.length + 1));
      params.push(dateFilter);
    }

    if (studentFilter) {
      conditions.push('a.student_id = $' + (params.length + 1));
      params.push(studentFilter);
    }

    if (termFilter) {
      conditions.push('a.term = $' + (params.length + 1));
      params.push(termFilter);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const result = await query(
      `SELECT a.*, s.name as student_name, s.email as student_email
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       ${whereClause}
       ORDER BY a.date DESC, s.name ASC`,
      params
    );

    const attendance = result.rows.map(r => ({
      id: r.id,
      student_id: r.student_id,
      student_name: r.student_name,
      student_email: r.student_email,
      date: r.date,
      status: r.status,
      term: r.term || 'Term 1'
    }));

    res.json(attendance);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Get my attendance (student)
router.get('/my-attendance', async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studentResult = await query('SELECT id FROM students WHERE email = $1', [req.user.email]);

    if (studentResult.rows.length === 0) {
      return res.json({
        records: [],
        summary: { total: 0, present: 0, absent: 0, late: 0, pct: 0 }
      });
    }

    const studentId = studentResult.rows[0].id;
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
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Attendance stats
router.get('/admin/stats', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const totalResult = await query('SELECT COUNT(*) as c FROM attendance');
    const presentResult = await query("SELECT COUNT(*) as c FROM attendance WHERE status='Present'");
    const absentResult = await query("SELECT COUNT(*) as c FROM attendance WHERE status='Absent'");
    const lateResult = await query("SELECT COUNT(*) as c FROM attendance WHERE status='Late'");

    const total = totalResult.rows[0].c;
    const present = presentResult.rows[0].c;
    const absent = absentResult.rows[0].c;
    const late = lateResult.rows[0].c;
    const pct = total > 0 ? parseFloat(((present / total) * 100).toFixed(1)) : 0;

    res.json({ total, present, absent, late, pct });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch attendance stats' });
  }
});

export default router;
