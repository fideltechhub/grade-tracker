import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Title, Tooltip, Legend
} from 'chart.js';
import { Bar, Scatter } from 'react-chartjs-2';
import Tabs from '../components/common/Tabs';
import Modal from '../components/common/Modal';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { ToastContainer, useToast } from '../components/common/Toast';
import {
  adminService, studentService, gradeService,
  attendanceService, announcementService, analyticsService, authService
} from '../services/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend);

const TABS = [
  { id: 'overview',    label: 'Overview',      icon: '📊' },
  { id: 'teachers',    label: 'Teachers',      icon: '👩‍🏫' },
  { id: 'students',    label: 'Students',      icon: '🎓' },
  { id: 'grades',      label: 'Gradebook',     icon: '📝' },
  { id: 'attendance',  label: 'Attendance',    icon: '📅' },
  { id: 'charts',      label: 'Charts',        icon: '📈' },
  { id: 'notices',     label: 'Notices',       icon: '📢' },
  { id: 'parents',     label: 'Parents',       icon: '👨‍👩‍👧' },
  { id: 'log',         label: 'Activity Log',  icon: '🔍' },
  { id: 'settings',    label: 'Settings',      icon: '⚙️' },
];

const CBC = { EE: 'badge-ee', ME: 'badge-me', AE: 'badge-ae', BE: 'badge-be' };

export default function AdminDashboard({ user, onLogout }) {
  const [tab, setTab] = useState('overview');
  const navigate = useNavigate();
  const { toasts, toast } = useToast();

  // ── Overview ──
  const [stats, setStats] = useState(null);
  const [atRisk, setAtRisk] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  // ── Teachers ──
  const [teachers, setTeachers] = useState([]);
  const [teacherModal, setTeacherModal] = useState(false);
  const [teacherForm, setTeacherForm] = useState({ fullname: '', username: '', email: '', subject: '' });

  // ── Students ──
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentModal, setStudentModal] = useState(false);
  const [studentForm, setStudentForm] = useState({ name: '', email: '', grade_level: 'Grade 7', stream: '' });

  // ── Grades ──
  const [grades, setGrades] = useState([]);
  const [gradeTerm, setGradeTerm] = useState('');
  const [gradeModal, setGradeModal] = useState(false);
  const [gradeForm, setGradeForm] = useState({ student_id: '', subject: '', grade: '', term: 'Term 1' });
  const [editGrade, setEditGrade] = useState(null);

  // ── Attendance ──
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [attendanceList, setAttendanceList] = useState([]);
  const [attDate, setAttDate] = useState(new Date().toISOString().slice(0, 10));
  const [attTerm, setAttTerm] = useState('Term 1');

  // ── Charts ──
  const [correlationData, setCorrelationData] = useState([]);

  // ── Notices ──
  const [noticeModal, setNoticeModal] = useState(false);
  const [noticeForm, setNoticeForm] = useState({ title: '', message: '' });

  // ── Parents ──
  const [parents, setParents] = useState([]);
  const [parentModal, setParentModal] = useState(false);
  const [parentForm, setParentForm] = useState({ fullname: '', username: '', email: '' });
  const [linkModal, setLinkModal] = useState(null);
  const [linkStudentId, setLinkStudentId] = useState('');

  // ── Activity Log ──
  const [activityLog, setActivityLog] = useState([]);

  // ── Settings ──
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });

  const [loading, setLoading] = useState(true);

  useEffect(() => { loadOverview(); }, []);

  useEffect(() => {
    if (tab === 'teachers' && teachers.length === 0) loadTeachers();
    if (tab === 'students') loadStudents();
    if (tab === 'grades') { if (students.length === 0) loadStudents(); loadGrades(gradeTerm); }
    if (tab === 'attendance') { loadAttendanceStats(); loadAttendance(); }
    if (tab === 'charts') loadCharts();
    if (tab === 'notices' && announcements.length === 0) loadAnnouncements();
    if (tab === 'parents') { if (students.length === 0) loadStudents(); loadParents(); }
    if (tab === 'log') loadLog();
  }, [tab]);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const [s, risk, ann] = await Promise.all([
        adminService.getStats(),
        analyticsService.getAtRiskStudents(),
        announcementService.getAnnouncements()
      ]);
      setStats(s.data);
      setAtRisk(risk.data);
      setAnnouncements(ann.data);
    } catch { toast.error('Failed to load overview'); }
    finally { setLoading(false); }
  };

  const loadTeachers = async () => {
    try { const r = await adminService.getTeachers(); setTeachers(r.data); }
    catch { toast.error('Failed to load teachers'); }
  };

  const loadStudents = async () => {
    try {
      const r = studentSearch
        ? await studentService.searchStudents(studentSearch)
        : await studentService.getStudents();
      setStudents(r.data);
    } catch { toast.error('Failed to load students'); }
  };

  const loadGrades = async (term) => {
    try {
      const r = await gradeService.getGrades(term);
      // Flatten nested {student, grades[]} → flat grade rows with student_name + cbc_status
      const flat = [];
      for (const s of r.data) {
        for (const g of s.grades || []) {
          const v = Number(g.grade);
          flat.push({
            ...g,
            student_name: s.name,
            cbc_status: v >= 75 ? 'EE' : v >= 50 ? 'ME' : v >= 25 ? 'AE' : 'BE'
          });
        }
      }
      setGrades(flat);
    } catch { toast.error('Failed to load grades'); }
  };

  const loadAttendanceStats = async () => {
    try { const r = await attendanceService.getStats(); setAttendanceStats(r.data); }
    catch { /* non-critical */ }
  };

  const loadAttendance = async () => {
    try {
      const r = await attendanceService.getAttendance(attDate, '', attTerm);
      setAttendanceList(r.data);
    } catch { toast.error('Failed to load attendance'); }
  };

  const loadCharts = async () => {
    try { const r = await analyticsService.getAttendanceCorrelation(); setCorrelationData(r.data); }
    catch { toast.error('Failed to load chart data'); }
  };

  const loadAnnouncements = async () => {
    try { const r = await announcementService.getAnnouncements(); setAnnouncements(r.data); }
    catch { toast.error('Failed to load announcements'); }
  };

  const loadParents = async () => {
    try { const r = await adminService.getParents(); setParents(r.data); }
    catch { toast.error('Failed to load parents'); }
  };

  const loadLog = async () => {
    try { const r = await adminService.getActivityLog(200); setActivityLog(r.data); }
    catch { toast.error('Failed to load activity log'); }
  };

  // ── Teacher actions ──
  const addTeacher = async (e) => {
    e.preventDefault();
    try {
      await adminService.addTeacher({ ...teacherForm, role: 'teacher' });
      toast.success('Teacher added');
      setTeacherModal(false);
      setTeacherForm({ fullname: '', username: '', email: '', subject: '' });
      loadTeachers();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add teacher'); }
  };

  const deleteTeacher = async (id) => {
    if (!confirm('Delete this teacher?')) return;
    try {
      await adminService.deleteTeacher(id);
      toast.success('Teacher deleted');
      loadTeachers();
    } catch { toast.error('Failed to delete teacher'); }
  };

  const resetTeacherPw = async (id) => {
    try {
      await adminService.resetUserPassword(id);
      toast.success('Password reset — teacher will receive email');
    } catch { toast.error('Failed to reset password'); }
  };

  // ── Student actions ──
  const addStudent = async (e) => {
    e.preventDefault();
    try {
      await studentService.addStudent(studentForm.name, studentForm.email, studentForm.grade_level, studentForm.stream);
      toast.success('Student added');
      setStudentModal(false);
      setStudentForm({ name: '', email: '', grade_level: 'Grade 7', stream: '' });
      loadStudents();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add student'); }
  };

  const deleteStudent = async (id) => {
    if (!confirm('Delete this student and all their data?')) return;
    try {
      await studentService.deleteStudent(id);
      toast.success('Student deleted');
      loadStudents();
    } catch { toast.error('Failed to delete student'); }
  };

  // ── Grade actions ──
  const saveGrade = async (e) => {
    e.preventDefault();
    try {
      if (editGrade) {
        await gradeService.updateGrade(editGrade.id, gradeForm);
        toast.success('Grade updated');
      } else {
        await gradeService.addGrade(gradeForm);
        toast.success('Grade added');
      }
      setGradeModal(false);
      setEditGrade(null);
      setGradeForm({ student_id: '', subject: '', grade: '', term: 'Term 1' });
      loadGrades(gradeTerm);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save grade'); }
  };

  const deleteGrade = async (id) => {
    if (!confirm('Delete this grade?')) return;
    try {
      await gradeService.deleteGrade(id);
      toast.success('Grade deleted');
      loadGrades(gradeTerm);
    } catch { toast.error('Failed to delete grade'); }
  };

  const openEditGrade = (g) => {
    setEditGrade(g);
    setGradeForm({ student_id: g.student_id, subject: g.subject, grade: g.grade, term: g.term });
    setGradeModal(true);
  };

  // ── Notice actions ──
  const postNotice = async (e) => {
    e.preventDefault();
    try {
      await announcementService.postAnnouncement(noticeForm.title, noticeForm.message);
      toast.success('Announcement posted');
      setNoticeModal(false);
      setNoticeForm({ title: '', message: '' });
      loadAnnouncements();
    } catch { toast.error('Failed to post announcement'); }
  };

  const deleteNotice = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    try {
      await announcementService.deleteAnnouncement(id);
      toast.success('Deleted');
      loadAnnouncements();
    } catch { toast.error('Failed to delete'); }
  };

  // ── Parent actions ──
  const addParent = async (e) => {
    e.preventDefault();
    try {
      await adminService.addParent({ ...parentForm, role: 'parent' });
      toast.success('Parent added');
      setParentModal(false);
      setParentForm({ fullname: '', username: '', email: '' });
      loadParents();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add parent'); }
  };

  const deleteParent = async (id) => {
    if (!confirm('Delete this parent account?')) return;
    try {
      await adminService.deleteParent(id);
      toast.success('Parent deleted');
      loadParents();
    } catch { toast.error('Failed to delete parent'); }
  };

  const linkParent = async (parentId) => {
    if (!linkStudentId) return;
    try {
      await adminService.linkParent(parentId, linkStudentId);
      toast.success('Student linked');
      setLinkModal(null);
      setLinkStudentId('');
      loadParents();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to link'); }
  };

  // ── Change Password ──
  const changePassword = async (e) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    try {
      await authService.changePassword(pwForm.current, pwForm.next);
      toast.success('Password changed');
      setPwForm({ current: '', next: '', confirm: '' });
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to change password'); }
  };

  const handleLogout = () => { onLogout(); navigate('/login'); };

  // ── Chart data ──
  const gradeDistData = {
    labels: ['EE (≥75)', 'ME (≥50)', 'AE (≥25)', 'BE (<25)'],
    datasets: [{
      label: 'Students',
      data: stats ? [stats.ee_count, stats.me_count, stats.ae_count, stats.be_count].map(v => v ?? 0) : [],
      backgroundColor: ['rgba(63,185,80,.7)', 'rgba(88,166,255,.7)', 'rgba(227,179,65,.7)', 'rgba(248,81,73,.7)'],
      borderRadius: 6
    }]
  };

  const scatterData = {
    datasets: [{
      label: 'Students',
      data: correlationData.map(d => ({ x: d.attendance_pct, y: d.avg_grade, name: d.name })),
      backgroundColor: 'rgba(245,197,24,.7)', pointRadius: 5
    }]
  };

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#f0f0f0' } } },
    scales: {
      x: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } },
      y: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } }
    }
  };

  const scatterOptions = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      tooltip: {
        callbacks: {
          label: ctx => `${ctx.raw.name}: Att ${ctx.raw.x}% / Avg ${ctx.raw.y}`
        }
      }
    },
    scales: {
      x: { ...chartOptions.scales.x, title: { display: true, text: 'Attendance %', color: '#8b949e' } },
      y: { ...chartOptions.scales.y, title: { display: true, text: 'Avg Grade', color: '#8b949e' } }
    }
  };

  if (loading && tab === 'overview') return <LoadingSpinner text="Loading dashboard..." />;

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="navbar-brand">🏫 GradeVault Admin</div>
        <div className="navbar-user">
          <span>{user.fullname}</span>
          <button className="btn btn-sm btn-danger" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="container">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            <div className="stats-grid">
              <StatCard label="Students" value={stats?.total_students} />
              <StatCard label="Teachers" value={stats?.total_teachers} />
              <StatCard label="Grades Entered" value={stats?.total_grades} />
              <StatCard label="School Average" value={stats?.overall_average?.toFixed(1)} />
              <StatCard label="At-Risk Students" value={atRisk.length} accent={atRisk.length > 0 ? 'var(--danger)' : undefined} />
            </div>

            {atRisk.length > 0 && (
              <div className="card">
                <div className="card-title text-danger">⚠ At-Risk Students ({atRisk.length})</div>
                {atRisk.map(s => (
                  <div className="at-risk-item" key={s.id}>
                    <div>
                      <div className="at-risk-name">{s.name}</div>
                      <div className="at-risk-meta">{s.grade_level} {s.stream} — Avg: {s.average}% <span className={`badge badge-${s.cbc_status?.toLowerCase()}`}>{s.cbc_status}</span></div>
                      <div className="at-risk-reasons">
                        {s.reasons.map(r => <span key={r} className="badge badge-danger">{r}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="card">
              <div className="card-title">📢 Recent Announcements</div>
              {announcements.length === 0 && <div className="empty-state">No announcements yet.</div>}
              {announcements.slice(0, 5).map(a => (
                <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <strong>{a.title}</strong>
                  <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{a.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── TEACHERS ── */}
        {tab === 'teachers' && (
          <div>
            <div className="section-header">
              <h2>Teachers ({teachers.length})</h2>
              <button className="btn btn-primary" onClick={() => setTeacherModal(true)}>+ Add Teacher</button>
            </div>
            <div className="table-wrap card">
              <table>
                <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Subject</th><th>Actions</th></tr></thead>
                <tbody>
                  {teachers.map(t => (
                    <tr key={t.id}>
                      <td>{t.fullname}</td>
                      <td>{t.username}</td>
                      <td>{t.email}</td>
                      <td>{t.subject || '—'}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-outline" onClick={() => resetTeacherPw(t.id)}>Reset PW</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteTeacher(t.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {teachers.length === 0 && <tr><td colSpan={5} className="empty-state">No teachers yet.</td></tr>}
                </tbody>
              </table>
            </div>

            {teacherModal && (
              <Modal title="Add Teacher" onClose={() => setTeacherModal(false)}>
                <form onSubmit={addTeacher}>
                  <div className="form-group"><label>Full Name</label><input required value={teacherForm.fullname} onChange={e => setTeacherForm(f => ({ ...f, fullname: e.target.value }))} /></div>
                  <div className="form-group"><label>Username</label><input required value={teacherForm.username} onChange={e => setTeacherForm(f => ({ ...f, username: e.target.value }))} /></div>
                  <div className="form-group"><label>Email</label><input required type="email" value={teacherForm.email} onChange={e => setTeacherForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div className="form-group"><label>Subject</label><input value={teacherForm.subject} onChange={e => setTeacherForm(f => ({ ...f, subject: e.target.value }))} /></div>
                  <button className="btn btn-primary w-full">Add Teacher</button>
                </form>
              </Modal>
            )}
          </div>
        )}

        {/* ── STUDENTS ── */}
        {tab === 'students' && (
          <div>
            <div className="section-header">
              <h2>Students ({students.length})</h2>
              <button className="btn btn-primary" onClick={() => setStudentModal(true)}>+ Add Student</button>
            </div>
            <div className="search-bar">
              <input placeholder="Search by name..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)} />
              <button className="btn btn-secondary" onClick={loadStudents}>Search</button>
            </div>
            <div className="table-wrap card">
              <table>
                <thead><tr><th>Name</th><th>Grade</th><th>Stream</th><th>Email</th><th>Actions</th></tr></thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.grade_level}</td>
                      <td>{s.stream || '—'}</td>
                      <td>{s.email || '—'}</td>
                      <td><button className="btn btn-sm btn-danger" onClick={() => deleteStudent(s.id)}>Delete</button></td>
                    </tr>
                  ))}
                  {students.length === 0 && <tr><td colSpan={5} className="empty-state">No students found.</td></tr>}
                </tbody>
              </table>
            </div>

            {studentModal && (
              <Modal title="Add Student" onClose={() => setStudentModal(false)}>
                <form onSubmit={addStudent}>
                  <div className="form-group"><label>Full Name</label><input required value={studentForm.name} onChange={e => setStudentForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div className="form-group"><label>Email (optional)</label><input type="email" value={studentForm.email} onChange={e => setStudentForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div className="form-group">
                    <label>Grade Level</label>
                    <select value={studentForm.grade_level} onChange={e => setStudentForm(f => ({ ...f, grade_level: e.target.value }))}>
                      <option>Grade 7</option><option>Grade 8</option><option>Grade 9</option>
                    </select>
                  </div>
                  <div className="form-group"><label>Stream (optional)</label><input value={studentForm.stream} onChange={e => setStudentForm(f => ({ ...f, stream: e.target.value }))} /></div>
                  <button className="btn btn-primary w-full">Add Student</button>
                </form>
              </Modal>
            )}
          </div>
        )}

        {/* ── GRADEBOOK ── */}
        {tab === 'grades' && (
          <div>
            <div className="section-header">
              <h2>Gradebook</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={gradeTerm} onChange={e => { setGradeTerm(e.target.value); loadGrades(e.target.value); }}>
                  <option value="">All Terms</option>
                  <option>Term 1</option><option>Term 2</option><option>Term 3</option>
                </select>
                <button className="btn btn-primary" onClick={() => { setEditGrade(null); setGradeForm({ student_id: '', subject: '', grade: '', term: 'Term 1' }); setGradeModal(true); }}>+ Add Grade</button>
              </div>
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
                      <td><span className={`badge badge-${(g.cbc_status || '').toLowerCase()}`}>{g.cbc_status}</span></td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-outline" onClick={() => openEditGrade(g)}>Edit</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteGrade(g.id)}>Del</button>
                      </td>
                    </tr>
                  ))}
                  {grades.length === 0 && <tr><td colSpan={6} className="empty-state">No grades found.</td></tr>}
                </tbody>
              </table>
            </div>

            {gradeModal && (
              <Modal title={editGrade ? 'Edit Grade' : 'Add Grade'} onClose={() => { setGradeModal(false); setEditGrade(null); }}>
                <form onSubmit={saveGrade}>
                  {!editGrade && (
                    <div className="form-group">
                      <label>Student</label>
                      <select required value={gradeForm.student_id} onChange={e => setGradeForm(f => ({ ...f, student_id: e.target.value }))}>
                        <option value="">— Select —</option>
                        {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="form-group"><label>Subject</label><input required value={gradeForm.subject} onChange={e => setGradeForm(f => ({ ...f, subject: e.target.value }))} /></div>
                  <div className="form-group"><label>Grade (0–100)</label><input required type="number" min="0" max="100" value={gradeForm.grade} onChange={e => setGradeForm(f => ({ ...f, grade: e.target.value }))} /></div>
                  <div className="form-group">
                    <label>Term</label>
                    <select value={gradeForm.term} onChange={e => setGradeForm(f => ({ ...f, term: e.target.value }))}>
                      <option>Term 1</option><option>Term 2</option><option>Term 3</option>
                    </select>
                  </div>
                  <button className="btn btn-primary w-full">{editGrade ? 'Save Changes' : 'Add Grade'}</button>
                </form>
              </Modal>
            )}
          </div>
        )}

        {/* ── ATTENDANCE ── */}
        {tab === 'attendance' && (
          <div>
            <h2 style={{ marginBottom: 16 }}>Attendance Overview</h2>
            {attendanceStats && (
              <div className="stats-grid">
                <StatCard label="Total Records" value={attendanceStats.total_records} />
                <StatCard label="Present" value={attendanceStats.present_count} accent="var(--success)" />
                <StatCard label="Absent" value={attendanceStats.absent_count} accent="var(--danger)" />
                <StatCard label="Attendance Rate" value={attendanceStats.attendance_rate ? `${attendanceStats.attendance_rate}%` : '—'} />
              </div>
            )}
            <div className="card">
              <div className="section-header">
                <span>View Records</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="date" value={attDate} onChange={e => { setAttDate(e.target.value); }} style={{ width: 'auto' }} />
                  <select value={attTerm} onChange={e => setAttTerm(e.target.value)} style={{ width: 'auto' }}>
                    <option>Term 1</option><option>Term 2</option><option>Term 3</option>
                  </select>
                  <button className="btn btn-secondary btn-sm" onClick={loadAttendance}>Load</button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Student</th><th>Date</th><th>Term</th><th>Status</th></tr></thead>
                  <tbody>
                    {attendanceList.map(a => (
                      <tr key={a.id}>
                        <td>{a.student_name || a.student_id}</td>
                        <td>{a.date}</td>
                        <td>{a.term}</td>
                        <td><span className={`badge ${a.status === 'present' ? 'badge-success' : 'badge-danger'}`}>{a.status}</span></td>
                      </tr>
                    ))}
                    {attendanceList.length === 0 && <tr><td colSpan={4} className="empty-state">No records for selected date/term.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── CHARTS ── */}
        {tab === 'charts' && (
          <div>
            <div className="card">
              <div className="card-title">CBC Performance Distribution</div>
              <div className="chart-container">
                <Bar data={gradeDistData} options={chartOptions} />
              </div>
            </div>
            <div className="card">
              <div className="card-title">Attendance vs Grade Correlation</div>
              <div className="chart-container">
                {correlationData.length > 0
                  ? <Scatter data={scatterData} options={scatterOptions} />
                  : <div className="empty-state">No correlation data. Students need both grades and attendance records.</div>
                }
              </div>
            </div>
          </div>
        )}

        {/* ── NOTICES ── */}
        {tab === 'notices' && (
          <div>
            <div className="section-header">
              <h2>Announcements</h2>
              <button className="btn btn-primary" onClick={() => setNoticeModal(true)}>+ New Announcement</button>
            </div>
            {announcements.map(a => (
              <div className="card" key={a.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <strong>{a.title}</strong>
                    <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 13 }}>{a.message}</p>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteNotice(a.id)}>Delete</button>
                </div>
              </div>
            ))}
            {announcements.length === 0 && <div className="empty-state">No announcements yet.</div>}

            {noticeModal && (
              <Modal title="New Announcement" onClose={() => setNoticeModal(false)}>
                <form onSubmit={postNotice}>
                  <div className="form-group"><label>Title</label><input required value={noticeForm.title} onChange={e => setNoticeForm(f => ({ ...f, title: e.target.value }))} /></div>
                  <div className="form-group"><label>Message</label><textarea required rows={4} value={noticeForm.message} onChange={e => setNoticeForm(f => ({ ...f, message: e.target.value }))} /></div>
                  <button className="btn btn-primary w-full">Post Announcement</button>
                </form>
              </Modal>
            )}
          </div>
        )}

        {/* ── PARENTS ── */}
        {tab === 'parents' && (
          <div>
            <div className="section-header">
              <h2>Parents ({parents.length})</h2>
              <button className="btn btn-primary" onClick={() => setParentModal(true)}>+ Add Parent</button>
            </div>
            <div className="table-wrap card">
              <table>
                <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Linked Students</th><th>Actions</th></tr></thead>
                <tbody>
                  {parents.map(p => (
                    <tr key={p.id}>
                      <td>{p.fullname}</td>
                      <td>{p.username}</td>
                      <td>{p.email}</td>
                      <td>{p.students?.map(s => s.name).join(', ') || '—'}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-outline" onClick={() => { setLinkModal(p); setLinkStudentId(''); }}>Link Student</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteParent(p.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {parents.length === 0 && <tr><td colSpan={5} className="empty-state">No parents yet.</td></tr>}
                </tbody>
              </table>
            </div>

            {parentModal && (
              <Modal title="Add Parent" onClose={() => setParentModal(false)}>
                <form onSubmit={addParent}>
                  <div className="form-group"><label>Full Name</label><input required value={parentForm.fullname} onChange={e => setParentForm(f => ({ ...f, fullname: e.target.value }))} /></div>
                  <div className="form-group"><label>Username</label><input required value={parentForm.username} onChange={e => setParentForm(f => ({ ...f, username: e.target.value }))} /></div>
                  <div className="form-group"><label>Email</label><input required type="email" value={parentForm.email} onChange={e => setParentForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <button className="btn btn-primary w-full">Add Parent</button>
                </form>
              </Modal>
            )}

            {linkModal && (
              <Modal title={`Link Student to ${linkModal.fullname}`} onClose={() => setLinkModal(null)}>
                <div className="form-group">
                  <label>Select Student</label>
                  <select value={linkStudentId} onChange={e => setLinkStudentId(e.target.value)}>
                    <option value="">— Select —</option>
                    {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <button className="btn btn-primary w-full" onClick={() => linkParent(linkModal.id)}>Link Student</button>
              </Modal>
            )}
          </div>
        )}

        {/* ── ACTIVITY LOG ── */}
        {tab === 'log' && (
          <div>
            <h2 style={{ marginBottom: 16 }}>Activity Log</h2>
            <div className="table-wrap card">
              <table>
                <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th></tr></thead>
                <tbody>
                  {activityLog.map(l => (
                    <tr key={l.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(l.created_at).toLocaleString()}</td>
                      <td>{l.user_name}</td>
                      <td>{l.action}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{l.details}</td>
                    </tr>
                  ))}
                  {activityLog.length === 0 && <tr><td colSpan={4} className="empty-state">No activity yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && (
          <div>
            <div className="card" style={{ maxWidth: 480 }}>
              <div className="card-title">Change Password</div>
              <form onSubmit={changePassword}>
                <div className="form-group"><label>Current Password</label><input required type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} /></div>
                <div className="form-group"><label>New Password</label><input required type="password" value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))} /></div>
                <div className="form-group"><label>Confirm New Password</label><input required type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} /></div>
                <button className="btn btn-primary">Update Password</button>
              </form>
            </div>

            <div className="card" style={{ maxWidth: 480, marginTop: 16 }}>
              <div className="card-title">Biometric Login</div>
              <p className="text-muted" style={{ marginBottom: 12 }}>Register your device for passwordless login using fingerprint or face recognition.</p>
              <button className="btn btn-secondary" onClick={() => toast.info('WebAuthn registration coming soon')}>Register Biometrics</button>
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  );
}
