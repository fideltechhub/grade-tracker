import express from 'express';
import { query } from '../db/connection.js';
import { hashPassword, logActivity, CBC_SUBJECTS } from '../utils/auth.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

// Get CBC subjects
router.get('/subjects', (req, res) => {
  res.json(CBC_SUBJECTS);
});

// Get all teachers
router.get('/teachers', requireRole('admin'), async (req, res) => {
  try {
    const result = await query("SELECT * FROM users WHERE role = 'teacher' ORDER BY fullname");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

// Add teacher
router.post('/teachers', requireRole('admin'), async (req, res) => {
  try {
    const { fullname, username, email, password, subject } = req.body;

    if (!fullname || !username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const subjectList = subject.split(',').map(s => s.trim()).filter(s => s);
    if (subjectList.length === 0) {
      return res.status(400).json({ error: 'Please select at least one subject' });
    }

    if (fullname.length > 32) {
      return res.status(400).json({ error: 'Full name must be 32 characters or less' });
    }

    if (username.length > 32) {
      return res.status(400).json({ error: 'Username must be 32 characters or less' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    try {
      const hashedPassword = await hashPassword(password);
      await query(
        'INSERT INTO users (fullname, username, email, password, role, subject) VALUES ($1, $2, $3, $4, $5, $6)',
        [fullname, username, email, hashedPassword, 'teacher', subjectList.join(', ')]
      );

      await logActivity(req.user.id, req.user.fullname, 'Added teacher', `${fullname} (${username})`);

      res.status(201).json({ message: 'Teacher added' });
    } catch (dbError) {
      if (dbError.code === '23505') {
        return res.status(409).json({ error: 'Username or email already exists' });
      }
      throw dbError;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add teacher' });
  }
});

// Update teacher subjects
router.patch('/teachers/:teacherId/subjects', requireRole('admin'), async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { subject } = req.body;

    const subjectList = subject.split(',').map(s => s.trim()).filter(s => s);
    if (subjectList.length === 0) {
      return res.status(400).json({ error: 'Please select at least one subject' });
    }

    const result = await query("SELECT id FROM users WHERE id = $1 AND role = 'teacher'", [teacherId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    await query(
      'UPDATE users SET subject = $1 WHERE id = $2 AND role = $3',
      [subjectList.join(', '), teacherId, 'teacher']
    );

    res.json({ message: 'Subjects updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update subjects' });
  }
});

// Delete teacher
router.delete('/teachers/:teacherId', requireRole('admin'), async (req, res) => {
  try {
    const { teacherId } = req.params;

    await query("DELETE FROM users WHERE id = $1 AND role = 'teacher'", [teacherId]);

    await logActivity(req.user.id, req.user.fullname, 'Deleted teacher', `Teacher #${teacherId}`);

    res.json({ message: 'Teacher deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete teacher' });
  }
});

// Admin stats
router.get('/stats', requireRole('admin'), async (req, res) => {
  try {
    const totalStudentsResult = await query('SELECT COUNT(*) as c FROM students');
    const totalTeachersResult = await query("SELECT COUNT(*) as c FROM users WHERE role='teacher'");
    const totalGradesResult = await query('SELECT COUNT(*) as c FROM grades');
    const gradesResult = await query('SELECT grade FROM grades');

    const totalStudents = totalStudentsResult.rows[0].c;
    const totalTeachers = totalTeachersResult.rows[0].c;
    const totalGrades = totalGradesResult.rows[0].c;
    const grades = gradesResult.rows.map(g => g.grade);
    const overallAvg = grades.length > 0 ? parseFloat((grades.reduce((a, b) => a + b) / grades.length).toFixed(2)) : 0;

    res.json({
      total_students: totalStudents,
      total_teachers: totalTeachers,
      total_grades: totalGrades,
      overall_average: overallAvg
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Reset user password (admin)
router.post('/users/:userId/reset-password', requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const newPassword = user.username;
    const hashedPassword = await hashPassword(newPassword);

    await query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

    res.json({
      message: 'Password reset successfully',
      new_password: newPassword
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Reset student password by email
router.post('/reset-student-password', requireRole('admin'), async (req, res) => {
  try {
    const { email } = req.body;

    const result = await query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const newPassword = user.username;
    const hashedPassword = await hashPassword(newPassword);

    await query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, email]);

    res.json({
      message: 'Password reset successfully',
      new_password: newPassword
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// School report
router.get('/school-report', requireRole('admin'), async (req, res) => {
  try {
    const studentsResult = await query('SELECT * FROM students ORDER BY name');
    const students = studentsResult.rows;

    const studentData = [];
    for (const s of students) {
      const gradesResult = await query('SELECT grade FROM grades WHERE student_id = $1', [s.id]);
      const grades = gradesResult.rows.map(g => g.grade);
      const avg = grades.length > 0 ? parseFloat((grades.reduce((a, b) => a + b) / grades.length).toFixed(2)) : null;

      let cbcStatus = 'No Grades';
      if (avg !== null) {
        if (avg >= 75) cbcStatus = 'EE';
        else if (avg >= 50) cbcStatus = 'ME';
        else if (avg >= 25) cbcStatus = 'AE';
        else cbcStatus = 'BE';
      }

      studentData.push({
        name: s.name,
        email: s.email,
        average: avg,
        status: cbcStatus,
        total_grades: grades.length
      });
    }

    const teachersResult = await query("SELECT COUNT(*) as c FROM users WHERE role='teacher'");
    const gradesResult = await query('SELECT grade FROM grades');

    const totalTeachers = teachersResult.rows[0].c;
    const allGrades = gradesResult.rows.map(g => g.grade);
    const overallAvg = allGrades.length > 0 ? parseFloat((allGrades.reduce((a, b) => a + b) / allGrades.length).toFixed(2)) : 0;
    const passing = studentData.filter(s => ['EE', 'ME'].includes(s.status)).length;
    const failing = studentData.filter(s => ['AE', 'BE'].includes(s.status)).length;

    res.json({
      students: studentData,
      total_students: students.length,
      total_teachers: totalTeachers,
      total_grades: allGrades.length,
      overall_average: overallAvg,
      passing,
      failing
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch school report' });
  }
});

// Activity log
router.get('/activity-log', requireRole('admin'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const result = await query('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT $1', [limit]);

    const logs = result.rows.map(l => ({
      id: l.id,
      user_name: l.user_name,
      action: l.action,
      details: l.details || '',
      created_at: l.created_at ? new Date(l.created_at).toLocaleString() : '—'
    }));

    res.json(logs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch activity log' });
  }
});

export default router;
