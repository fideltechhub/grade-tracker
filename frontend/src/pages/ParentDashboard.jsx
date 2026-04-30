import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Tabs from '../components/common/Tabs';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { ToastContainer, useToast } from '../components/common/Toast';
import { parentService, authService } from '../services/api';

const cbcBadge = (v) => v >= 75 ? 'badge-ee' : v >= 50 ? 'badge-me' : v >= 25 ? 'badge-ae' : 'badge-be';
const cbcLabel = (v) => v >= 75 ? 'EE' : v >= 50 ? 'ME' : v >= 25 ? 'AE' : 'BE';

const TABS = [
  { id: 'grades',     label: 'Grades',     icon: '📝' },
  { id: 'attendance', label: 'Attendance', icon: '📅' },
  { id: 'settings',   label: 'Settings',   icon: '⚙️' },
];

export default function ParentDashboard({ user, onLogout }) {
  const [tab, setTab] = useState('grades');
  const navigate = useNavigate();
  const { toasts, toast } = useToast();

  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [gradeTerm, setGradeTerm] = useState('');
  const [attTerm, setAttTerm] = useState('');
  const [grades, setGrades] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });

  useEffect(() => { loadChildren(); }, []);

  useEffect(() => {
    if (!selectedChild) return;
    if (tab === 'grades') loadGrades();
    if (tab === 'attendance') loadAttendance();
  }, [selectedChild, tab, gradeTerm, attTerm]);

  const loadChildren = async () => {
    setLoading(true);
    try {
      const r = await parentService.getChildren();
      setChildren(r.data);
      if (r.data.length > 0) setSelectedChild(String(r.data[0].id));
    } catch { toast.error('Failed to load children'); }
    finally { setLoading(false); }
  };

  const loadGrades = async () => {
    if (!selectedChild) return;
    try { const r = await parentService.getChildGrades(selectedChild, gradeTerm); setGrades(r.data?.grades || r.data || []); }
    catch { toast.error('Failed to load grades'); }
  };

  const loadAttendance = async () => {
    if (!selectedChild) return;
    try { const r = await parentService.getChildAttendance(selectedChild, attTerm); setAttendance(r.data); }
    catch { toast.error('Failed to load attendance'); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    try {
      await authService.changePassword(pwForm.current, pwForm.next);
      toast.success('Password changed');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleLogout = () => { onLogout(); navigate('/login'); };

  const selectedName = children.find(c => String(c.id) === selectedChild)?.name || '—';
  const gradeNums = grades.map(g => Number(g.grade));
  const average = gradeNums.length ? parseFloat((gradeNums.reduce((a, b) => a + b, 0) / gradeNums.length).toFixed(1)) : null;
  const presentCount = attendance.filter(a => a.status === 'present').length;
  const attRate = attendance.length ? parseFloat(((presentCount / attendance.length) * 100).toFixed(1)) : null;

  if (loading) return <LoadingSpinner text="Loading portal..." />;

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="navbar-brand">🏫 GradeVault Parent Portal</div>
        <div className="navbar-user">
          <span>{user.fullname}</span>
          <button className="btn btn-sm btn-danger" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="container">
        {children.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👶</div>
            <p>No children have been linked to your account yet.</p>
            <p className="text-muted" style={{ marginTop: 8 }}>Please contact the school administrator.</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Viewing:</label>
              <select
                value={selectedChild}
                onChange={e => setSelectedChild(e.target.value)}
                style={{ maxWidth: 280 }}
              >
                {children.map(c => <option key={c.id} value={c.id}>{c.name} — {c.grade_level || ''}</option>)}
              </select>
            </div>

            <Tabs tabs={TABS} active={tab} onChange={setTab} />

            {/* ── GRADES ── */}
            {tab === 'grades' && (
              <div>
                <div className="stats-grid">
                  <StatCard label="Average Grade" value={average !== null ? `${average}%` : '—'} />
                  <StatCard label="CBC Status" value={average !== null ? cbcLabel(average) : '—'} />
                  <StatCard label="Subjects" value={grades.length} />
                </div>

                <div className="section-header">
                  <h2>{selectedName}'s Grades</h2>
                  <select value={gradeTerm} onChange={e => setGradeTerm(e.target.value)} style={{ width: 'auto' }}>
                    <option value="">All Terms</option>
                    <option>Term 1</option><option>Term 2</option><option>Term 3</option>
                  </select>
                </div>

                <div className="table-wrap card">
                  <table>
                    <thead><tr><th>Subject</th><th>Grade</th><th>Term</th><th>Status</th><th>Feedback</th></tr></thead>
                    <tbody>
                      {grades.map((g, i) => (
                        <tr key={g.id || i}>
                          <td>{g.subject}</td>
                          <td>{g.grade}</td>
                          <td>{g.term}</td>
                          <td><span className={`badge ${cbcBadge(Number(g.grade))}`}>{cbcLabel(Number(g.grade))}</span></td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{g.feedback || '—'}</td>
                        </tr>
                      ))}
                      {grades.length === 0 && <tr><td colSpan={5} className="empty-state">No grades yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── ATTENDANCE ── */}
            {tab === 'attendance' && (
              <div>
                <div className="stats-grid">
                  <StatCard label="Total Days" value={attendance.length} />
                  <StatCard label="Present" value={presentCount} accent="var(--success)" />
                  <StatCard label="Absent" value={attendance.filter(a => a.status === 'absent').length} accent="var(--danger)" />
                  <StatCard label="Attendance Rate" value={attRate !== null ? `${attRate}%` : '—'} />
                </div>

                <div className="section-header">
                  <h2>{selectedName}'s Attendance</h2>
                  <select value={attTerm} onChange={e => setAttTerm(e.target.value)} style={{ width: 'auto' }}>
                    <option value="">All Terms</option>
                    <option>Term 1</option><option>Term 2</option><option>Term 3</option>
                  </select>
                </div>

                <div className="table-wrap card">
                  <table>
                    <thead><tr><th>Date</th><th>Term</th><th>Status</th></tr></thead>
                    <tbody>
                      {attendance.map((a, i) => (
                        <tr key={a.id || i}>
                          <td>{a.date}</td>
                          <td>{a.term}</td>
                          <td><span className={`badge ${a.status === 'present' ? 'badge-success' : a.status === 'late' ? 'badge-warn' : 'badge-danger'}`}>{a.status}</span></td>
                        </tr>
                      ))}
                      {attendance.length === 0 && <tr><td colSpan={3} className="empty-state">No attendance records.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── SETTINGS ── */}
            {tab === 'settings' && (
              <div className="card" style={{ maxWidth: 480 }}>
                <div className="card-title">Change Password</div>
                <form onSubmit={changePassword}>
                  <div className="form-group"><label>Current Password</label><input required type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} /></div>
                  <div className="form-group"><label>New Password</label><input required type="password" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} /></div>
                  <div className="form-group"><label>Confirm Password</label><input required type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} /></div>
                  <button className="btn btn-primary">Update Password</button>
                </form>
              </div>
            )}
          </>
        )}
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
