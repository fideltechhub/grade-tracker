import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection.js';

export async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      fullname: user.fullname
    },
    process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    { expiresIn: '8h' }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
  } catch (error) {
    return null;
  }
}

export async function logActivity(userId, userName, action, details = '') {
  try {
    await query(
      'INSERT INTO activity_log (user_id, user_name, action, details) VALUES ($1, $2, $3, $4)',
      [userId, userName, action, details || null]
    );
  } catch (error) {
    console.error('Activity log error:', error);
  }
}

export function cbcStatus(average) {
  if (average === null || average === undefined) return 'No Grades';
  if (average >= 75) return 'EE';   // Exceeds Expectation
  if (average >= 50) return 'ME';   // Meets Expectation
  if (average >= 25) return 'AE';   // Approaches Expectation
  return 'BE';                      // Below Expectation
}

export const CBC_SUBJECTS = [
  'English', 'Kiswahili', 'Mathematics', 'Integrated Science',
  'Social Studies', 'Religious Education (CRE)', 'Religious Education (IRE)',
  'Religious Education (HRE)', 'Pre-Technical Studies', 'Business Studies',
  'Computer Studies', 'Agriculture', 'Nutrition & Home Science',
  'Creative Arts & Sports'
];

export const TERMS = ['Term 1', 'Term 2', 'Term 3'];
