import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AdminDashboard from './pages/AdminDashboard';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentDashboard from './pages/StudentDashboard';
import ParentDashboard from './pages/ParentDashboard';

function AppRoutes() {
  const { user, loading, login, logout } = useAuth();

  if (loading) return <div className="loading">Loading GradeVault...</div>;

  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to={`/dashboard/${user.role}`} replace /> : <LoginPage onLogin={login} />
      } />
      <Route path="/register" element={
        user ? <Navigate to={`/dashboard/${user.role}`} replace /> : <RegisterPage onLogin={login} />
      } />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route path="/dashboard/admin" element={
        user?.role === 'admin'
          ? <AdminDashboard user={user} onLogout={logout} />
          : <Navigate to="/login" replace />
      } />
      <Route path="/dashboard/teacher" element={
        user?.role === 'teacher'
          ? <TeacherDashboard user={user} onLogout={logout} />
          : <Navigate to="/login" replace />
      } />
      <Route path="/dashboard/student" element={
        user?.role === 'student'
          ? <StudentDashboard user={user} onLogout={logout} />
          : <Navigate to="/login" replace />
      } />
      <Route path="/dashboard/parent" element={
        user?.role === 'parent'
          ? <ParentDashboard user={user} onLogout={logout} />
          : <Navigate to="/login" replace />
      } />

      <Route path="/" element={
        user ? <Navigate to={`/dashboard/${user.role}`} replace /> : <Navigate to="/login" replace />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
