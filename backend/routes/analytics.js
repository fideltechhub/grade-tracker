import express from 'express';
import { query } from '../db/connection.js';
import { requireRole, authMiddleware } from '../middleware/auth.js';
import { cbcStatus } from '../utils/auth.js';

const router = express.Router();

// GET /api/analytics/at-risk-students — admin/teacher only
router.get('/at-risk-students', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    // Get all students with their teacher's subjects (teacher sees only their students)
    let studentRows;
    if (req.user.role === 'teacher') {
      const subjectsResult = await query(
        'SELECT subject FROM users WHERE id = $1',
        [req.user.id]
      );
      const teacherSubjects = subjectsResult.rows
        .map(r => r.subject)
        .filter(Boolean);

      if (teacherSubjects.length === 0) {
        return res.json([]);
      }

      const placeholders = teacherSubjects.map((_, i) => `$${i + 1}`).join(', ');
      const result = await query(
        `SELECT DISTINCT s.id, s.name, s.grade_level, s.stream
         FROM students s
         JOIN grades g ON g.student_id = s.id
         WHERE g.subject IN (${placeholders})
         ORDER BY s.name`,
        teacherSubjects
      );
      studentRows = result.rows;
    } else {
      const result = await query(
        'SELECT id, name, grade_level, stream FROM students ORDER BY name'
      );
      studentRows = result.rows;
    }

    const atRisk = [];

    for (const student of studentRows) {
      const gradesResult = await query(
        `SELECT term, AVG(grade) as avg
         FROM grades
         WHERE student_id = $1
         GROUP BY term
         ORDER BY term`,
        [student.id]
      );

      const termAverages = gradesResult.rows;
      if (termAverages.length === 0) continue;

      const avgVals = termAverages.map(r => parseFloat(r.avg));
      const latestAvg = avgVals[avgVals.length - 1];

      const reasons = [];

      if (latestAvg < 25) {
        reasons.push('Below Expectation (BE)');
      }

      if (avgVals.length >= 2) {
        const declining = avgVals.every((v, i) => i === 0 || v < avgVals[i - 1]);
        if (declining && latestAvg < 50) {
          reasons.push('Consistently declining');
        }
      }

      if (avgVals.length >= 2) {
        const best = Math.max(...avgVals.slice(0, -1));
        const drop = parseFloat((best - latestAvg).toFixed(1));
        if (drop >= 15) {
          reasons.push(`Dropped ${drop} pts from best term`);
        }
      }

      if (reasons.length > 0) {
        atRisk.push({
          id: student.id,
          name: student.name,
          grade_level: student.grade_level,
          stream: student.stream,
          average: parseFloat(latestAvg.toFixed(1)),
          cbc_status: cbcStatus(latestAvg),
          reasons
        });
      }
    }

    res.json(atRisk);
  } catch (error) {
    console.error('at-risk-students error:', error);
    res.status(500).json({ error: 'Failed to fetch at-risk students' });
  }
});

// GET /api/analytics/my-rank — student only
router.get('/my-rank', requireRole('student'), async (req, res) => {
  try {
    const studentResult = await query(
      'SELECT id FROM students WHERE user_id = $1',
      [req.user.id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const studentId = studentResult.rows[0].id;

    // Get all students' averages ordered descending
    const rankResult = await query(
      `SELECT s.id, AVG(g.grade)::numeric(6,2) AS avg
       FROM students s
       JOIN grades g ON g.student_id = s.id
       GROUP BY s.id
       ORDER BY avg DESC`
    );

    const rows = rankResult.rows;
    const total = rows.length;

    if (total === 0) {
      return res.json({ rank: null, total: 0, percentile: null });
    }

    const rank = rows.findIndex(r => r.id === studentId) + 1;

    if (rank === 0) {
      return res.json({ rank: null, total, percentile: null });
    }

    const percentile = total > 1
      ? parseFloat((((total - rank) / total) * 100).toFixed(1))
      : 100.0;

    res.json({ rank, total, percentile });
  } catch (error) {
    console.error('my-rank error:', error);
    res.status(500).json({ error: 'Failed to fetch rank' });
  }
});

// GET /api/analytics/attendance-grade-correlation — admin/teacher only
router.get('/attendance-grade-correlation', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    let rows;

    if (req.user.role === 'teacher') {
      const subjectsResult = await query(
        'SELECT subject FROM users WHERE id = $1',
        [req.user.id]
      );
      const teacherSubjects = subjectsResult.rows
        .map(r => r.subject)
        .filter(Boolean);

      if (teacherSubjects.length === 0) {
        return res.json([]);
      }

      const placeholders = teacherSubjects.map((_, i) => `$${i + 1}`).join(', ');
      const result = await query(
        `SELECT
           s.name,
           AVG(g.grade)::numeric(6,2) AS avg_grade,
           COUNT(a.id) FILTER (WHERE a.status = 'present') AS present_count,
           COUNT(a.id) AS total_count
         FROM students s
         JOIN grades g ON g.student_id = s.id
         LEFT JOIN attendance a ON a.student_id = s.id
         WHERE g.subject IN (${placeholders})
         GROUP BY s.id, s.name
         HAVING COUNT(a.id) > 0`,
        teacherSubjects
      );
      rows = result.rows;
    } else {
      const result = await query(
        `SELECT
           s.name,
           AVG(g.grade)::numeric(6,2) AS avg_grade,
           COUNT(a.id) FILTER (WHERE a.status = 'present') AS present_count,
           COUNT(a.id) AS total_count
         FROM students s
         JOIN grades g ON g.student_id = s.id
         LEFT JOIN attendance a ON a.student_id = s.id
         GROUP BY s.id, s.name
         HAVING COUNT(a.id) > 0`
      );
      rows = result.rows;
    }

    const data = rows.map(r => ({
      name: r.name,
      avg_grade: parseFloat(r.avg_grade),
      attendance_pct: parseFloat(
        ((r.present_count / r.total_count) * 100).toFixed(1)
      )
    }));

    res.json(data);
  } catch (error) {
    console.error('attendance-grade-correlation error:', error);
    res.status(500).json({ error: 'Failed to fetch correlation data' });
  }
});

// GET /api/analytics/my-prediction — student only
router.get('/my-prediction', requireRole('student'), async (req, res) => {
  try {
    const studentResult = await query(
      'SELECT id FROM students WHERE user_id = $1',
      [req.user.id]
    );

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const studentId = studentResult.rows[0].id;

    // Get per-term averages
    const termsResult = await query(
      `SELECT term, AVG(grade)::numeric(6,2) AS avg
       FROM grades
       WHERE student_id = $1
       GROUP BY term
       ORDER BY term`,
      [studentId]
    );

    const termRows = termsResult.rows;
    const TERMS = ['Term 1', 'Term 2', 'Term 3'];

    // Map term names to indices 0,1,2
    const known = termRows
      .map(r => {
        const idx = TERMS.indexOf(r.term);
        return idx >= 0 ? [idx, parseFloat(r.avg)] : null;
      })
      .filter(Boolean);

    if (known.length < 2) {
      return res.json({
        predicted: null,
        trend: null,
        message: 'Not enough data to predict — need at least 2 terms of grades.'
      });
    }

    if (known.length === 3) {
      return res.json({
        predicted: null,
        trend: null,
        message: 'All 3 terms are complete — no prediction needed.'
      });
    }

    const [x1, y1] = known[known.length - 2];
    const [x2, y2] = known[known.length - 1];
    const slope = y2 - y1;
    let predicted = y2 + slope * (2 - x2);
    predicted = Math.max(0, Math.min(100, parseFloat(predicted.toFixed(2))));

    const trend = slope > 2 ? 'improving' : slope < -2 ? 'declining' : 'stable';
    const cbcPredicted = cbcStatus(predicted);

    const messages = {
      improving: 'Great progress! Keep it up to maintain your trajectory.',
      declining: 'Warning: your grades are trending downward. Seek help early.',
      stable: 'Your grades are consistent. Push for improvement in Term 3.'
    };

    res.json({
      predicted,
      trend,
      cbc_status: cbcPredicted,
      message: messages[trend]
    });
  } catch (error) {
    console.error('my-prediction error:', error);
    res.status(500).json({ error: 'Failed to compute prediction' });
  }
});

export default router;
