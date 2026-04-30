import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth
export const authService = {
  login: (username, password) => api.post('/auth/login', { username, password }),
  register: (fullname, username, email, password) =>
    api.post('/auth/register', { fullname, username, email, password }),
  logout: () => api.post('/auth/logout'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post('/auth/reset-password', { token, password })
};

// Admin
export const adminService = {
  getTeachers: () => api.get('/admin/teachers'),
  addTeacher: (data) => api.post('/admin/teachers', data),
  updateTeacherSubjects: (teacherId, subject) =>
    api.patch(`/admin/teachers/${teacherId}/subjects`, { subject }),
  deleteTeacher: (teacherId) => api.delete(`/admin/teachers/${teacherId}`),
  getStats: () => api.get('/admin/stats'),
  resetUserPassword: (userId) => api.post(`/admin/users/${userId}/reset-password`),
  resetStudentPassword: (email) => api.post('/admin/reset-student-password', { email }),
  getSchoolReport: () => api.get('/admin/school-report'),
  getActivityLog: (limit = 100) => api.get(`/admin/activity-log?limit=${limit}`),
  getSubjects: () => api.get('/admin/subjects'),
  getParents: () => api.get('/admin/parents'),
  addParent: (data) => api.post('/admin/parents', data),
  deleteParent: (parentId) => api.delete(`/admin/parents/${parentId}`),
  linkParent: (parentId, studentId) =>
    api.post(`/admin/parents/${parentId}/link`, { student_id: studentId }),
  unlinkParent: (parentId, studentId) =>
    api.delete(`/admin/parents/${parentId}/unlink/${studentId}`)
};

// Students
export const studentService = {
  getStudents: () => api.get('/students'),
  addStudent: (name, email, grade_level, stream) => api.post('/students', { name, email, grade_level, stream }),
  deleteStudent: (studentId) => api.delete(`/students/${studentId}`),
  searchStudents: (query) => api.get(`/students/search?q=${encodeURIComponent(query)}`),
  getMyGrades: (term = '') => api.get(`/students/my-grades${term ? `?term=${encodeURIComponent(term)}` : ''}`),
  getMyReport: () => api.get('/students/my-report'),
  getStats: () => api.get('/students/stats')
};

// Grades
export const gradeService = {
  getGrades: (term = '') => api.get(`/grades${term ? `?term=${encodeURIComponent(term)}` : ''}`),
  addGrade: (data) => api.post('/grades', data),
  updateGrade: (gradeId, data) => api.put(`/grades/${gradeId}`, data),
  deleteGrade: (gradeId) => api.delete(`/grades/${gradeId}`),
  bulkImport: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/grades/bulk-import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  getFeedback: (gradeId) => api.get(`/grades/${gradeId}/feedback`),
  addFeedback: (gradeId, message) => api.post(`/grades/${gradeId}/feedback`, { message })
};

// Attendance
export const attendanceService = {
  markAttendance: (records, date, term) => api.post('/attendance', { records, date, term }),
  getAttendance: (date = '', studentId = '', term = '') =>
    api.get(`/attendance?date=${date}&student_id=${studentId}&term=${term}`),
  getMyAttendance: (term = '') => api.get(`/attendance/my-attendance${term ? `?term=${encodeURIComponent(term)}` : ''}`),
  getStats: () => api.get('/attendance/admin/stats')
};

// Announcements
export const announcementService = {
  getAnnouncements: () => api.get('/announcements'),
  postAnnouncement: (title, message) => api.post('/announcements', { title, message }),
  deleteAnnouncement: (announcementId) => api.delete(`/announcements/${announcementId}`)
};

// Parent
export const parentService = {
  getChildren: () => api.get('/parent/children'),
  getChildGrades: (studentId, term = '') =>
    api.get(`/parent/child/${studentId}/grades${term ? `?term=${encodeURIComponent(term)}` : ''}`),
  getChildAttendance: (studentId, term = '') =>
    api.get(`/parent/child/${studentId}/attendance${term ? `?term=${encodeURIComponent(term)}` : ''}`)
};

// Analytics
export const analyticsService = {
  getAtRiskStudents: () => api.get('/analytics/at-risk-students'),
  getMyRank: () => api.get('/analytics/my-rank'),
  getAttendanceCorrelation: () => api.get('/analytics/attendance-grade-correlation'),
  getMyPrediction: () => api.get('/analytics/my-prediction')
};

export default api;
