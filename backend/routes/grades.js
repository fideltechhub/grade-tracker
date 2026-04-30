import express from 'express';
import { query } from '../db/connection.js';
import { logActivity, cbcStatus } from '../utils/auth.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import multer from 'multer';
import { parse } from 'csv-parse/sync';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Get all grades (with filters by student, term, subject)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    const result = await query('SELECT * FROM students ORDER BY name');
    const students = result.rows;

    const teacherSubjects = user.subject ? user.subject.split(',').map(s => s.trim()) : [];
    const termFilter = req.query.term?.trim() || '';

    const studentData = [];
    for (const s of students) {
      let gradesResult;
      const params = [s.id];
      let whereClause = 'WHERE student_id = $1';

      if (user.role === 'teacher' && teacherSubjects.length > 0) {
        whereClause += ` AND subject IN (${teacherSubjects.map((_, i) => `$${i + 2}`).join(',')})`;
        params.push(...teacherSubjects);
      }

      if (termFilter) {
        whereClause += ` AND term = $${params.length + 1}`;
        params.push(termFilter);
      }

      gradesResult = await query(`SELECT * FROM grades ${whereClause}`, params);

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
    res.status(500).json({ error: 'Failed to fetch grades' });
  }
});

// Add grade
router.post('/', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { student_id, subject, grade, max_grade, comment, term } = req.body;

    if (!student_id || !subject || grade === undefined) {
      return res.status(400).json({ error: 'student_id, subject, and grade are required' });
    }

    if (comment && comment.length > 500) {
      return res.status(400).json({ error: 'Comment must be 500 characters or less' });
    }

    const maxGradeVal = max_grade || 100;
    if (!(grade >= 0 && grade <= maxGradeVal)) {
      return res.status(400).json({ error: `Grade must be between 0 and ${maxGradeVal}` });
    }

    // Prevent teachers from adding duplicate grades
    if (req.user.role === 'teacher') {
      const dupCheck = await query(
        'SELECT id FROM grades WHERE student_id = $1 AND subject = $2 AND teacher_id = $3',
        [student_id, subject, req.user.id]
      );
      if (dupCheck.rows.length > 0) {
        return res.status(409).json({ error: `You have already added a grade for '${subject}' for this student. Please use the edit option to update it.` });
      }
    }

    await query(
      'INSERT INTO grades (student_id, subject, grade, max_grade, comment, teacher_id, term) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [student_id, subject, grade, maxGradeVal, comment || null, req.user.id, term || 'Term 1']
    );

    await logActivity(req.user.id, req.user.fullname, 'Added grade', `${subject} for student #${student_id} (${term || 'Term 1'})`);

    res.status(201).json({ message: 'Grade added' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add grade' });
  }
});

// Get single grade with feedback
router.get('/:gradeId', authMiddleware, async (req, res) => {
  try {
    const { gradeId } = req.params;

    const result = await query('SELECT * FROM grades WHERE id = $1', [gradeId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    const grade = result.rows[0];

    // Get feedback
    const feedbackResult = await query(
      'SELECT * FROM grade_feedback WHERE grade_id = $1 ORDER BY created_at ASC',
      [gradeId]
    );

    const feedback = feedbackResult.rows.map(f => ({
      id: f.id,
      author_name: f.author_name,
      role: f.role,
      message: f.message,
      created_at: new Date(f.created_at).toLocaleString()
    }));

    res.json({ ...grade, feedback });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch grade' });
  }
});

// Update grade
router.put('/:gradeId', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { gradeId } = req.params;
    const { grade, max_grade, subject, comment } = req.body;

    if (grade === undefined) {
      return res.status(400).json({ error: 'Grade is required' });
    }

    const checkResult = await query('SELECT * FROM grades WHERE id = $1', [gradeId]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Grade not found' });
    }

    if (comment && comment.length > 500) {
      return res.status(400).json({ error: 'Comment must be 500 characters or less' });
    }

    const updates = ['grade = $1'];
    const values = [grade];
    let paramIndex = 2;

    if (max_grade !== undefined) {
      updates.push(`max_grade = $${paramIndex}`);
      values.push(max_grade);
      paramIndex++;
    }

    if (subject) {
      updates.push(`subject = $${paramIndex}`);
      values.push(subject);
      paramIndex++;
    }

    if (comment !== undefined) {
      updates.push(`comment = $${paramIndex}`);
      values.push(comment.trim() || null);
      paramIndex++;
    }

    values.push(gradeId);

    await query(`UPDATE grades SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

    res.json({ message: 'Grade updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update grade' });
  }
});

// Delete grade
router.delete('/:gradeId', requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { gradeId } = req.params;

    await query('DELETE FROM grades WHERE id = $1', [gradeId]);

    await logActivity(req.user.id, req.user.fullname, 'Deleted grade', `Grade #${gradeId}`);

    res.json({ message: 'Grade deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete grade' });
  }
});

// Bulk import grades
router.post('/bulk-import', requireRole('admin', 'teacher'), upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const content = file.buffer.toString('utf-8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true
    });

    const teacherSubjects = req.user.subject ? req.user.subject.split(',').map(s => s.trim()) : [];
    let imported = 0;
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2;

      const email = (row.student_email || '').trim();
      const subject = (row.subject || '').trim();
      const gradeVal = (row.grade || '').trim();
      const maxVal = (row.max_grade || '100').trim();
      const term = (row.term || 'Term 1').trim();
      const comment = (row.comment || '').trim() || null;

      if (!email || !subject || !gradeVal) {
        errors.push(`Row ${rowNum}: missing required fields (student_email, subject, grade)`);
        continue;
      }

      try {
        const gradeNum = parseFloat(gradeVal);
        const maxGrade = parseFloat(maxVal) || 100;

        if (!(gradeNum >= 0 && gradeNum <= maxGrade)) {
          errors.push(`Row ${rowNum}: grade ${gradeNum} out of range 0–${maxGrade}`);
          continue;
        }

        if (req.user.role === 'teacher' && teacherSubjects.length > 0 && !teacherSubjects.includes(subject)) {
          errors.push(`Row ${rowNum}: subject '${subject}' not in your assigned subjects`);
          continue;
        }

        const studentResult = await query('SELECT id FROM students WHERE LOWER(email) = $1', [email.toLowerCase()]);
        if (studentResult.rows.length === 0) {
          errors.push(`Row ${rowNum}: student not found: ${email}`);
          continue;
        }

        const studentId = studentResult.rows[0].id;

        await query(
          'INSERT INTO grades (student_id, subject, grade, max_grade, comment, teacher_id, term) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [studentId, subject, gradeNum, maxGrade, comment, req.user.id, term]
        );

        imported++;
      } catch (err) {
        errors.push(`Row ${rowNum}: ${err.message}`);
      }
    }

    await logActivity(req.user.id, req.user.fullname, 'Bulk imported grades', `${imported} grades imported`);

    res.json({
      imported,
      errors,
      message: `Imported ${imported} grade(s) successfully${errors.length > 0 ? ` with ${errors.length} error(s)` : ''}`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: `Import failed: ${error.message}` });
  }
});

// Get feedback for a grade
router.get('/:gradeId/feedback', authMiddleware, async (req, res) => {
  try {
    const { gradeId } = req.params;

    if (req.user.role === 'student') {
      const studentResult = await query('SELECT id FROM students WHERE email = $1', [req.user.email]);
      if (studentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const gradeResult = await query(
        'SELECT id FROM grades WHERE id = $1 AND student_id = $2',
        [gradeId, studentResult.rows[0].id]
      );
      if (gradeResult.rows.length === 0) {
        return res.status(403).json({ error: 'Grade not found' });
      }
    }

    const result = await query(
      'SELECT * FROM grade_feedback WHERE grade_id = $1 ORDER BY created_at ASC',
      [gradeId]
    );

    const feedback = result.rows.map(f => ({
      id: f.id,
      author_name: f.author_name,
      role: f.role,
      message: f.message,
      created_at: new Date(f.created_at).toLocaleString()
    }));

    res.json(feedback);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

// Add feedback to a grade
router.post('/:gradeId/feedback', authMiddleware, async (req, res) => {
  try {
    const { gradeId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (message.length > 500) {
      return res.status(400).json({ error: 'Message must be 500 characters or less' });
    }

    if (req.user.role === 'student') {
      const studentResult = await query('SELECT id FROM students WHERE email = $1', [req.user.email]);
      if (studentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const gradeResult = await query(
        'SELECT id FROM grades WHERE id = $1 AND student_id = $2',
        [gradeId, studentResult.rows[0].id]
      );
      if (gradeResult.rows.length === 0) {
        return res.status(403).json({ error: 'Grade not found' });
      }
    }

    await query(
      'INSERT INTO grade_feedback (grade_id, user_id, author_name, role, message) VALUES ($1, $2, $3, $4, $5)',
      [gradeId, req.user.id, req.user.fullname, req.user.role, message.trim()]
    );

    res.status(201).json({ message: 'Feedback added' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add feedback' });
  }
});

export default router;
