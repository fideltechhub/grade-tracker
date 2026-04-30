import express from 'express';
import { query } from '../db/connection.js';
import { cbcStatus, logActivity } from '../utils/auth.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get all students (for admin/teacher)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM students ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Add student
router.post('/', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { name, email, grade_level = 'Grade 7', stream = '' } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Student name is required' });
    }

    try {
      let userId = null;

      if (email) {
        const username = email.split('@')[0];
        const userCheckResult = await query(
          'SELECT id FROM users WHERE email = $1 OR username = $2',
          [email, username]
        );

        if (userCheckResult.rows.length === 0) {
          const { hashPassword } = await import('../utils/auth.js');
          const hashedPassword = await hashPassword(username);
          const userRes = await query(
            'INSERT INTO users (fullname, username, email, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, username, email, hashedPassword, 'student']
          );
          userId = userRes.rows[0].id;
        } else {
          userId = userCheckResult.rows[0].id;
        }
      }

      const studentResult = await query(
        'INSERT INTO students (name, email, grade_level, stream, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [name, email || null, grade_level, stream || null, userId]
      );

      const student = studentResult.rows[0];
      res.status(201).json({ message: 'Student added', student });
    } catch (dbError) {
      if (dbError.code === '23505') {
        return res.status(409).json({ error: 'Email already exists' });
      }
      throw dbError;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add student' });
  }
});

// Delete student
router.delete('/:studentId', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { studentId } = req.params;

    await query('DELETE FROM grades WHERE student_id = $1', [studentId]);
    await query('DELETE FROM students WHERE id = $1', [studentId]);

    await logActivity(req.user.id, req.user.fullname, 'Deleted student', `Student #${studentId}`);

    res.json({ message: 'Student deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete student' });
  }
});

// Search students
router.get('/search', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const query_str = req.query.q?.trim() || '';

    if (!query_str) {
      return res.json([]);
    }

    const result = await query(
      'SELECT * FROM students WHERE LOWER(name) LIKE $1 OR LOWER(email) LIKE $2 ORDER BY name',
      [`%${query_str.toLowerCase()}%`, `%${query_str.toLowerCase()}%`]
    );

    const students = result.rows;
    const studentData = [];

    for (const s of students) {
      const gradesResult = await query('SELECT * FROM grades WHERE student_id = $1', [s.id]);
      const grades = gradesResult.rows;
      const avgGrade = grades.length > 0 ? parseFloat((grades.reduce((a, b) => a + b.grade) / grades.length).toFixed(2)) : null;
      const status = cbcStatus(avgGrade);

      studentData.push({
        id: s.id,
        name: s.name,
        email: s.email,
        grades,
        average: avgGrade,
        status
      });
    }

    res.json(studentData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to search students' });
  }
});

// Get my grades (for logged in student)
router.get('/my-grades', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studentResult = await query('SELECT * FROM students WHERE email = $1', [req.user.email]);

    if (studentResult.rows.length === 0) {
      return res.json({ grades: [], average: null, status: 'No Grades' });
    }

    const student = studentResult.rows[0];
    const termFilter = req.query.term?.trim() || '';

    let gradesResult;
    if (termFilter) {
      gradesResult = await query(
        'SELECT * FROM grades WHERE student_id = $1 AND term = $2',
        [student.id, termFilter]
      );
    } else {
      gradesResult = await query('SELECT * FROM grades WHERE student_id = $1', [student.id]);
    }

    const grades = gradesResult.rows;
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
    res.status(500).json({ error: 'Failed to fetch grades' });
  }
});

// Get my report (detailed report for student)
router.get('/my-report', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const studentResult = await query('SELECT * FROM students WHERE email = $1', [req.user.email]);

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Student record not found' });
    }

    const student = studentResult.rows[0];

    const gradesResult = await query(
      `SELECT g.*, u.fullname as teacher_name
       FROM grades g
       LEFT JOIN users u ON g.teacher_id = u.id
       WHERE g.student_id = $1
       ORDER BY g.created_at DESC`,
      [student.id]
    );

    const grades = gradesResult.rows.map(g => ({
      ...g,
      date_added: g.created_at ? new Date(g.created_at).toLocaleDateString('en-GB') : '—'
    }));

    const avgGrade = grades.length > 0 ? parseFloat((grades.reduce((a, b) => a + b.grade) / grades.length).toFixed(2)) : null;
    const status = cbcStatus(avgGrade);

    // Subject averages
    const subjectAvgs = {};
    const subjectsMap = {};
    for (const g of grades) {
      if (!subjectsMap[g.subject]) {
        subjectsMap[g.subject] = [];
      }
      subjectsMap[g.subject].push(g.grade);
    }

    for (const [subject, gradeList] of Object.entries(subjectsMap)) {
      subjectAvgs[subject] = parseFloat((gradeList.reduce((a, b) => a + b) / gradeList.length).toFixed(2));
    }

    res.json({
      student,
      fullname: req.user.fullname,
      email: req.user.email,
      grades,
      average: avgGrade,
      status,
      subject_avgs: subjectAvgs,
      total_grades: grades.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// Get stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const totalStudentsResult = await query('SELECT COUNT(*) as c FROM students');
    const totalStudents = totalStudentsResult.rows[0].c;

    const teacherSubjects = req.user.subject ? req.user.subject.split(',').map(s => s.trim()) : [];

    let gradesResult;
    if (req.user.role === 'teacher' && teacherSubjects.length > 0) {
      const placeholders = teacherSubjects.map((_, i) => `$${i + 1}`).join(',');
      gradesResult = await query(
        `SELECT grade FROM grades WHERE subject IN (${placeholders})`,
        teacherSubjects
      );
    } else {
      gradesResult = await query('SELECT grade FROM grades');
    }

    const grades = gradesResult.rows.map(g => g.grade);
    const overallAvg = grades.length > 0 ? parseFloat((grades.reduce((a, b) => a + b) / grades.length).toFixed(2)) : 0;

    // Count meeting expectation
    let meetingResult;
    if (req.user.role === 'teacher' && teacherSubjects.length > 0) {
      const placeholders = teacherSubjects.map((_, i) => `$${i + 1}`).join(',');
      meetingResult = await query(
        `SELECT COUNT(*) as c FROM (
          SELECT student_id, AVG(grade) as avg FROM grades
          WHERE subject IN (${placeholders})
          GROUP BY student_id HAVING AVG(grade) >= 50
        ) sub`,
        teacherSubjects
      );
    } else {
      meetingResult = await query(
        `SELECT COUNT(*) as c FROM (
          SELECT student_id, AVG(grade) as avg FROM grades
          GROUP BY student_id HAVING AVG(grade) >= 50
        ) sub`
      );
    }

    const meeting = meetingResult.rows[0].c;

    res.json({
      total_students: totalStudents,
      overall_average: overallAvg,
      meeting_students: meeting,
      below_students: totalStudents - meeting
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
