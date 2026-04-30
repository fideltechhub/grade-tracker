import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar, Scatter } from 'react-chartjs-2';
import Tabs from '../components/common/Tabs';
import Modal from '../components/common/Modal';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { ToastContainer, useToast } from '../components/common/Toast';
import {
  studentService, gradeService, attendanceService,
  analyticsService, authService
} from '../services/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, Title, Tooltip, Legend);

const TABS = [
  { id: 'overview',   label: 'Overview',   icon: '📊' },
  { id: 'students',   label: 'Students',   icon: '🎓' },
  { id: 'grades',     label: 'Add Grade',  icon: '✏️' },
  { id: 'gradebook',  label: 'Gradebook',  icon: '📝' },
  { id: 'attendance', label: 'Attendance', icon: '📅' },
  { id: 'charts',     label: 'Charts',     icon: '📈' },
  { id: 'settings',   label: 'Settings',   icon: '⚙️' },
];

const cbcBadge = (v) => {
  if (v >= 75) return 'badge-ee';
  if (v >= 50) return 'badge-me';
  if (v >= 25) return 'badge-ae';
  return 'badge-be';
};
const cbcLabel = (v) => v >= 75 ? 'EE' : v >= 50 ? 'ME' : v >= 25 ? 'AE' : 'BE';

const SUBJECTS = [
  'English','Kiswahili','Mathematics','Integrated Science','Social Studies',
  'Religious Education (CRE)','Religious Education (IRE)','Religious Education (HRE)',
  'Pre-Technical Studies','Business Studies','Computer Studies','Agriculture',
  'Nutrition & Home Science','Creative Arts & Sports'
];

export default function TeacherDashboard({ user, onLogout }) {
  const [tab, setTab] = useState('overview');
  const navigate = useNavigate();
  const { toasts, toast } = useToast();

  const [atRisk, setAtRisk] = useState([]);
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState([]);
  const [gradeTerm, setGradeTerm] = useState('');
  const [correlationData, setCorrelationData] = useState([]);

  const [gradeForm, setGradeForm] = useState({ student_id: '', subject: '', grade: '', term: 'Term 1', feedback: '' });
  const [editGrade, setEditGrade] = useState(null);
  const [gradeModal, setGradeModal] = useState(false);

  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0, 10));
  const [attTerm, setAttTerm] = useState('Term 1');
  const [attStatus, setAttStatus] = useState({});
  const [attSaving, setAttSaving] = useState(false);

  const [csvFile, setCsvFile] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadOverview(); loadStudents(); }, []);

  useEffect(() => {
    if (tab === 'gradebook') loadGrades(gradeTerm);
    if (tab === 'attendance') loadAttForDate();
    if (tab === 'charts') loadCorrelation();
  }, [tab]);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const risk = await analyticsService.getAtRiskStudents();
      setAtRisk(risk.data);
    } catch { toast.error('Failed to load overview'); }
    finally { setLoading(false); }
  };

  const loadStudents = async () => {
    try {
      const r = await studentService.getStudents();
      setStudents(r.data);
      const init = {};
      r.data.forEach(s => { init[s.id] = 'present'; });
      setAttStatus(init);
    } catch { toast.error('Failed to load students'); }
  };

  const loadGrades = async (term) => {
    try {
      const r = await gradeService.getGrades(term);
      const flat = [];
      for (const s of r.data) {
        for (const g of s.grades || []) {
          flat.push({ ...g, student_name: s.name });
        }
      }
      setGrades(flat);
    } catch { toast.error('Failed to load grades'); }
  };

  const loadAttForDate = async () => {
    try {
      const r = await attendanceService.getAttendance(attDate, '', attTerm);
      const map = {};
      students.forEach(s => { map[s.id] = 'present'; });
      r.data.forEach(a => { map[a.student_id] = a.status; });
      setAttStatus(map);
    } catch { /* non-critical */ }
  };

  const loadCorrelation = async () => {
    try { const r = await analyticsService.getAttendanceCorrelation(); setCorrelationData(r.data); }
    catch { toast.error('Failed to load chart data'); }
  };

  const saveGrade = async (e) => {
    e.preventDefault();
    try {
      if (editGrade) {
        await gradeService.updateGrade(editGrade.id, gradeForm);
        if (gradeForm.feedback) await gradeService.addFeedback(editGrade.id, gradeForm.feedback);
        toast.success('Grade updated');
      } else {
        const res = await gradeService.addGrade(gradeForm);
        if (gradeForm.feedback && res.data?.id) await gradeService.addFeedback(res.data.id, gradeForm.feedback);
        toast.success('Grade saved');
      }
      setGradeModal(false);
      setEditGrade(null);
      setGradeForm({ student_id: '', subject: '', grade: '', term: 'Term 1', feedback: '' });
      if (tab === 'gradebook') loadGrades(gradeTerm);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save grade'); }
  };

  const deleteGrade = async (id) => {
    if (!confirm('Delete this grade?')) return;
    try { await gradeService.deleteGrade(id); toast.success('Deleted'); loadGrades(gradeTerm); }
    catch { toast.error('Failed to delete'); }
  };

  const openEdit = (g) => {
    setEditGrade(g);
    setGradeForm({ student_id: g.student_id, subject: g.subject, grade: g.grade, term: g.term, feedback: '' });
    setGradeModal(true);
  };

  const submitAttendance = async () => {
    setAttSaving(true);
    try {
      const records = Object.entries(attStatus).map(([student_id, status]) => ({ student_id, status }));
      await attendanceService.markAttendance(records, attDate, attTerm);
      toast.success(`Attendance saved for ${attDate}`);
    } catch { toast.error('Failed to save attendance'); }
    finally { setAttSaving(false); }
  };

  const uploadCsv = async (e) => {
    e.preventDefault();
    if (!csvFile) return;
    setCsvUploading(true);
    try {
      const r = await gradeService.bulkImport(csvFile);
      toast.success(r.data.message || `${r.data.imported} grades imported`);
      setCsvFile(null);
    } catch (err) { toast.error(err.response?.data?.error || 'CSV import failed'); }
    finally { setCsvUploading(false); }
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

  const baseChartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#f0f0f0' } } },
    scales: {
      x: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } },
      y: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } }
    }
  };

  const barData = {
    labels: students.slice(0, 20).map(s => s.name.split(' ')[0]),
    datasets: [{
      label: 'Avg Grade',
      data: students.slice(0, 20).map(s => {
        const sg = grades.filter(g => String(g.student_id) === String(s.id));
        return sg.length ? parseFloat((sg.reduce((a, g) => a + Number(g.grade), 0) / sg.length).toFixed(1)) : 0;
      }),
      backgroundColor: 'rgba(245,197,24,.7)', borderRadius: 5
    }]
  };

  const scatterData = {
    datasets: [{
      label: 'Students',
      data: correlationData.map(d => ({ x: d.attendance_pct, y: d.avg_grade, name: d.name })),
      backgroundColor: 'rgba(88,166,255,.7)', pointRadius: 5
    }]
  };

  const scatterOpts = {
    ...baseChartOpts,
    plugins: { ...baseChartOpts.plugins, tooltip: { callbacks: { label: ctx => `${ctx.raw.name}: Att ${ctx.raw.x}% / Avg ${ctx.raw.y}` } } },
    scales: {
      x: { ...baseChartOpts.scales.x, title: { display: true, text: 'Attendance %', color: '#8b949e' } },
      y: { ...baseChartOpts.scales.y, title: { display: true, text: 'Avg Grade', color: '#8b949e' } }
    }
  };

  if (loading && tab === 'overview') return <LoadingSpinner />;

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="navbar-brand">🏫 GradeVault</div>
        <div className="navbar-user">
          <span>{user.fullname} — Teacher</span>
          <button className="btn btn-sm btn-danger" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="container">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {tab === 'overview' && (
          <div>
            <div className="stats-grid">
              <StatCard label="Students" value={students.length} />
              <StatCard label="Grades Entered" value={grades.length || '—'} />
              <StatCard label="At-Risk" value={atRisk.length} accent={atRisk.length > 0 ? 'var(--danger)' : undefined} />
            </div>
            {atRisk.length > 0 ? (
              <div className="card">
                <div className="card-title text-danger">⚠ At-Risk Students</div>
                {atRisk.map(s => (
                  <div className="at-risk-item" key={s.id}>
                    <div>
                      <div className="at-risk-name">{s.name}</div>
                      <div className="at-risk-meta">Avg {s.average}% — <span className={`badge badge-${s.cbc_status?.toLowerCase()}`}>{s.cbc_status}</span></div>
                      <div className="at-risk-reasons">{s.reasons.map(r => <span key={r} className="badge badge-danger">{r}</span>)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="alert alert-success">✅ No at-risk students detected.</div>
            )}
          </div>
        )}

        {tab === 'students' && (
          <div>
            <h2 style={{ marginBottom: 16 }}>Students ({students.length})</h2>
            <div className="table-wrap card">
              <table>
                <thead><tr><th>Name</th><th>Grade</th><th>Stream</th><th>Email</th></tr></thead>
                <tbody>
                  {students.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.grade_level}</td><td>{s.stream || '—'}</td><td>{s.email || '—'}</td></tr>)}
                  {students.length === 0 && <tr><td colSpan={4} className="empty-state">No students.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'grades' && (
          <div>
            <div className="card" style={{ maxWidth: 560 }}>
              <div className="card-title">Enter Grade</div>
              <form onSubmit={saveGrade}>
                <div className="form-group">
                  <label>Student</label>
                  <select required value={gradeForm.student_id} onChange={e => setGradeForm(f => ({ ...f, student_id: e.target.value }))}>
                    <option value="">— Select —</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Subject</label>
                  <select required value={gradeForm.subject} onChange={e => setGradeForm(f => ({ ...f, subject: e.target.value }))}>
                    <option value="">— Select —</option>
                    {SUBJECTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Grade (0–100)</label><input required type="number" min="0" max="100" value={gradeForm.grade} onChange={e => setGradeForm(f => ({ ...f, grade: e.target.value }))} /></div>
                <div className="form-group">
                  <label>Term</label>
                  <select value={gradeForm.term} onChange={e => setGradeForm(f => ({ ...f, term: e.target.value }))}>
                    <option>Term 1</option><option>Term 2</option><option>Term 3</option>
                  </select>
                </div>
                <div className="form-group"><label>Feedback (optional)</label><textarea rows={3} value={gradeForm.feedback} onChange={e => setGradeForm(f => ({ ...f, feedback: e.target.value }))} /></div>
                <button className="btn btn-primary w-full">Save Grade</button>
              </form>
            </div>
            <div className="card" style={{ maxWidth: 560 }}>
              <div className="card-title">Bulk Import CSV</div>
              <p className="text-muted mb-8" style={{ fontSize: 12 }}>Columns: student_name, subject, grade, term</p>
              <form onSubmit={uploadCsv}>
                <div className="form-group"><input type="file" accept=".csv" onChange={e => setCsvFile(e.target.files[0])} style={{ padding: '6px 0' }} /></div>
                <button className="btn btn-secondary" disabled={!csvFile || csvUploading}>{csvUploading ? 'Uploading...' : 'Import CSV'}</button>
              </form>
            </div>
          </div>
        )}

        {tab === 'gradebook' && (
          <div>
            <div className="section-header">
              <h2>Gradebook</h2>
              <select value={gradeTerm} onChange={e => { setGradeTerm(e.target.value); loadGrades(e.target.value); }} style={{ width: 'auto' }}>
                <option value="">All Terms</option>
                <option>Term 1</option><option>Term 2</option><option>Term 3</option>
              </select>
            </div>
            <div className="table-wrap card">
              <table>
                <thead><tr><th>Student</th><th>Subject</th><th>Grade</th><th>Term</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {grades.map(g => (
                    <tr key={g.id}>
                      <td>{g.student_name || g.student_id}</td>
                      <td>{g.subject}</td>
                      <td>{g.grade}</td>
                      <td>{g.term}</td>
                      <td><span className={`badge ${cbcBadge(Number(g.grade))}`}>{cbcLabel(Number(g.grade))}</span></td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-outline" onClick={() => openEdit(g)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteGrade(g.id)}>Del</button>
                      </td>
                    </tr>
                  ))}
                  {grades.length === 0 && <tr><td colSpan={6} className="empty-state">No grades found.</td></tr>}
                </tbody>
              </table>
            </div>
            {gradeModal && (
              <Modal title="Edit Grade" onClose={() => { setGradeModal(false); setEditGrade(null); }}>
                <form onSubmit={saveGrade}>
                  <div className="form-group"><label>Grade (0–100)</label><input required type="number" min="0" max="100" value={gradeForm.grade} onChange={e => setGradeForm(f => ({ ...f, grade: e.target.value }))} /></div>
                  <div className="form-group">
                    <label>Term</label>
                    <select value={gradeForm.term} onChange={e => setGradeForm(f => ({ ...f, term: e.target.value }))}>
                      <option>Term 1</option><option>Term 2</option><option>Term 3</option>
                    </select>
                  </div>
                  <div className="form-group"><label>Feedback</label><textarea rows={3} value={gradeForm.feedback} onChange={e => setGradeForm(f => ({ ...f, feedback: e.target.value }))} /></div>
                  <button className="btn btn-primary w-full">Save</button>
                </form>
              </Modal>
            )}
          </div>
        )}

        {tab === 'attendance' && (
          <div className="card">
            <div className="section-header">
              <h2>Mark Attendance</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <input type="date" value={attDate} onChange={e => setAttDate(e.target.value)} style={{ width: 'auto' }} />
                <select value={attTerm} onChange={e => setAttTerm(e.target.value)} style={{ width: 'auto' }}>
                  <option>Term 1</option><option>Term 2</option><option>Term 3</option>
                </select>
                <button className="btn btn-sm btn-secondary" onClick={loadAttForDate}>Load</button>
              </div>
            </div>
            {students.map(s => (
              <div className="attendance-row" key={s.id}>
                <span className="attendance-name">{s.name}</span>
                <div className="attendance-btns">
                  {['present', 'absent', 'late'].map(status => (
                    <button key={status}
                      className={`btn btn-sm ${attStatus[s.id] === status ? (status === 'present' ? 'btn-success' : status === 'absent' ? 'btn-danger' : 'btn-secondary') : 'btn-outline'}`}
                      onClick={() => setAttStatus(p => ({ ...p, [s.id]: status }))}>
                      {status[0].toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {students.length === 0 && <div className="empty-state">No students.</div>}
            {students.length > 0 && (
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={submitAttendance} disabled={attSaving}>
                {attSaving ? 'Saving...' : 'Save Attendance'}
              </button>
            )}
          </div>
        )}

        {tab === 'charts' && (
          <div>
            <div className="card">
              <div className="card-title">Student Average Grades</div>
              <div className="chart-container"><Bar data={barData} options={baseChartOpts} /></div>
            </div>
            <div className="card">
              <div className="card-title">Attendance vs Grade Correlation</div>
              <div className="chart-container">
                {correlationData.length > 0
                  ? <Scatter data={scatterData} options={scatterOpts} />
                  : <div className="empty-state">No data yet.</div>}
              </div>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div>
            <div className="card" style={{ maxWidth: 480 }}>
              <div className="card-title">Change Password</div>
              <form onSubmit={changePassword}>
                <div className="form-group"><label>Current Password</label><input required type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} /></div>
                <div className="form-group"><label>New Password</label><input required type="password" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} /></div>
                <div className="form-group"><label>Confirm Password</label><input required type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} /></div>
                <button className="btn btn-primary">Update Password</button>
              </form>
            </div>
            <div className="card" style={{ maxWidth: 480 }}>
              <div className="card-title">Biometric Login</div>
              <p className="text-muted mb-8">Register fingerprint/face for passwordless login.</p>
              <button className="btn btn-secondary" onClick={() => toast.info('WebAuthn coming soon')}>Register Biometrics</button>
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
