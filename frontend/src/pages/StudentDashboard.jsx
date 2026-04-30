import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  RadialLinearScale, PointElement, LineElement, Filler,
  Title, Tooltip, Legend
} from 'chart.js';
import { Bar, Radar } from 'react-chartjs-2';
import Tabs from '../components/common/Tabs';
import StatCard from '../components/common/StatCard';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { ToastContainer, useToast } from '../components/common/Toast';
import { studentService, attendanceService, analyticsService, authService } from '../services/api';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  RadialLinearScale, PointElement, LineElement, Filler,
  Title, Tooltip, Legend
);

const TABS = [
  { id: 'grades',     label: 'My Grades',   icon: '📝' },
  { id: 'attendance', label: 'Attendance',  icon: '📅' },
  { id: 'charts',     label: 'Charts',      icon: '📈' },
  { id: 'report',     label: 'Report Card', icon: '🏆' },
  { id: 'settings',   label: 'Settings',    icon: '⚙️' },
];

const cbcBadge = (v) => v >= 75 ? 'badge-ee' : v >= 50 ? 'badge-me' : v >= 25 ? 'badge-ae' : 'badge-be';
const cbcLabel = (v) => v >= 75 ? 'EE' : v >= 50 ? 'ME' : v >= 25 ? 'AE' : 'BE';

export default function StudentDashboard({ user, onLogout }) {
  const [tab, setTab] = useState('grades');
  const navigate = useNavigate();
  const { toasts, toast } = useToast();

  const [grades, setGrades] = useState([]);
  const [gradeTerm, setGradeTerm] = useState('');
  const [myRank, setMyRank] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [attTerm, setAttTerm] = useState('');
  const [report, setReport] = useState(null);

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadGrades(''); loadRank(); loadPrediction(); }, []);

  useEffect(() => {
    if (tab === 'attendance') loadAttendance(attTerm);
    if (tab === 'report') loadReport();
  }, [tab]);

  const loadGrades = async (term) => {
    setLoading(true);
    try { const r = await studentService.getMyGrades(term); setGrades(r.data?.grades || r.data || []); }
    catch { toast.error('Failed to load grades'); }
    finally { setLoading(false); }
  };

  const loadRank = async () => {
    try { const r = await analyticsService.getMyRank(); setMyRank(r.data); }
    catch { /* non-critical */ }
  };

  const loadPrediction = async () => {
    try { const r = await analyticsService.getMyPrediction(); setPrediction(r.data); }
    catch { /* non-critical */ }
  };

  const loadAttendance = async (term) => {
    try { const r = await attendanceService.getMyAttendance(term); setAttendance(r.data); }
    catch { toast.error('Failed to load attendance'); }
  };

  const loadReport = async () => {
    try { const r = await studentService.getMyReport(); setReport(r.data); }
    catch { toast.error('Failed to load report'); }
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

  const downloadPDF = () => {
    import('jspdf').then(({ jsPDF }) => {
      import('jspdf-autotable').then(() => {
        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text('GradeVault — Report Card', 14, 20);
        doc.setFontSize(12);
        doc.text(`Student: ${user.fullname}`, 14, 32);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 40);

        if (report) {
          const tableData = (report.grades || []).map(g => [
            g.subject, g.term, g.grade, cbcLabel(Number(g.grade))
          ]);
          doc.autoTable({
            startY: 50,
            head: [['Subject', 'Term', 'Grade', 'Status']],
            body: tableData,
            styles: { fontSize: 11 },
            headStyles: { fillColor: [245, 197, 24], textColor: 0 }
          });
          const avg = report.overall_average;
          if (avg !== undefined) {
            doc.text(`Overall Average: ${Number(avg).toFixed(1)}% — ${cbcLabel(Number(avg))}`, 14, doc.lastAutoTable.finalY + 12);
          }
        }
        doc.save(`${user.fullname?.replace(/\s+/g, '_') || 'report'}_report_card.pdf`);
      });
    });
  };

  const handleLogout = () => { onLogout(); navigate('/login'); };

  // Derived stats
  const gradeNums = grades.map(g => Number(g.grade));
  const average = gradeNums.length ? parseFloat((gradeNums.reduce((a, b) => a + b, 0) / gradeNums.length).toFixed(1)) : null;
  const presentCount = attendance.filter(a => a.status === 'present').length;
  const attRate = attendance.length ? parseFloat(((presentCount / attendance.length) * 100).toFixed(1)) : null;

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#f0f0f0' } } },
    scales: {
      x: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' } },
      y: { ticks: { color: '#8b949e' }, grid: { color: '#30363d' }, min: 0, max: 100 }
    }
  };

  const barData = {
    labels: grades.map(g => g.subject?.length > 10 ? g.subject.slice(0, 10) + '…' : g.subject),
    datasets: [{
      label: 'Grade',
      data: grades.map(g => Number(g.grade)),
      backgroundColor: grades.map(g => {
        const v = Number(g.grade);
        return v >= 75 ? 'rgba(63,185,80,.7)' : v >= 50 ? 'rgba(88,166,255,.7)' : v >= 25 ? 'rgba(227,179,65,.7)' : 'rgba(248,81,73,.7)';
      }),
      borderRadius: 5
    }]
  };

  const radarLabels = [...new Set(grades.map(g => g.subject?.slice(0, 12)))];
  const radarData = {
    labels: radarLabels,
    datasets: [{
      label: 'Grade',
      data: radarLabels.map(subj => {
        const sg = grades.filter(g => g.subject?.slice(0, 12) === subj);
        return sg.length ? parseFloat((sg.reduce((a, g) => a + Number(g.grade), 0) / sg.length).toFixed(1)) : 0;
      }),
      backgroundColor: 'rgba(245,197,24,.15)',
      borderColor: '#f5c518',
      pointBackgroundColor: '#f5c518'
    }]
  };
  const radarOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#f0f0f0' } } },
    scales: { r: { ticks: { color: '#8b949e', backdropColor: 'transparent' }, grid: { color: '#30363d' }, pointLabels: { color: '#f0f0f0', font: { size: 11 } }, min: 0, max: 100 } }
  };

  if (loading && tab === 'grades') return <LoadingSpinner />;

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="navbar-brand">🏫 GradeVault</div>
        <div className="navbar-user">
          <span>{user.fullname}</span>
          <button className="btn btn-sm btn-danger" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="container">
        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {/* ── MY GRADES ── */}
        {tab === 'grades' && (
          <div>
            <div className="stats-grid">
              <StatCard label="Average Grade" value={average !== null ? `${average}%` : '—'} />
              <StatCard label="CBC Status" value={average !== null ? cbcLabel(average) : '—'} />
              <StatCard label="Subjects" value={grades.length} />
              {myRank?.rank && <StatCard label="Class Rank" value={`#${myRank.rank}`} sub={`of ${myRank.total} students`} />}
              {myRank?.percentile && <StatCard label="Top Percentile" value={`${(100 - myRank.percentile).toFixed(1)}%`} accent="var(--success)" />}
            </div>

            {prediction && prediction.predicted !== null && (
              <div className="card prediction-card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>📊 Term 3 Prediction</div>
                    <div className="prediction-score">{prediction.predicted}%</div>
                    <div className="prediction-sub">{cbcLabel(prediction.predicted)} — {prediction.cbc_status}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`badge badge-${prediction.trend}`}>{prediction.trend}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, maxWidth: 220 }}>{prediction.message}</div>
                  </div>
                </div>
              </div>
            )}

            {prediction && prediction.predicted === null && prediction.message && (
              <div className="alert alert-info mb-16">{prediction.message}</div>
            )}

            <div className="section-header">
              <h2>Grades</h2>
              <select value={gradeTerm} onChange={e => { setGradeTerm(e.target.value); loadGrades(e.target.value); }} style={{ width: 'auto' }}>
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

            <div className="section-header" style={{ marginBottom: 12 }}>
              <h2>Records</h2>
              <select value={attTerm} onChange={e => { setAttTerm(e.target.value); loadAttendance(e.target.value); }} style={{ width: 'auto' }}>
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

        {/* ── CHARTS ── */}
        {tab === 'charts' && (
          <div>
            <div className="card">
              <div className="card-title">Grade by Subject</div>
              <div className="chart-container">
                {grades.length > 0 ? <Bar data={barData} options={chartOpts} /> : <div className="empty-state">No grades yet.</div>}
              </div>
            </div>
            <div className="card">
              <div className="card-title">Subject Performance Radar</div>
              <div className="chart-container">
                {grades.length > 0 ? <Radar data={radarData} options={radarOpts} /> : <div className="empty-state">No grades yet.</div>}
              </div>
            </div>
          </div>
        )}

        {/* ── REPORT CARD ── */}
        {tab === 'report' && (
          <div>
            <div className="section-header">
              <h2>Report Card</h2>
              <button className="btn btn-primary" onClick={downloadPDF}>⬇ Download PDF</button>
            </div>

            {report ? (
              <div className="card">
                <div style={{ marginBottom: 16, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <div><strong>Student:</strong> {user.fullname}</div>
                  <div><strong>Overall Average:</strong> {Number(report.average || 0).toFixed(1)}%</div>
                  <div><strong>CBC Status:</strong> <span className={`badge badge-${cbcLabel(Number(report.average || 0)).toLowerCase()}`}>{cbcLabel(Number(report.average || 0))}</span></div>
                </div>

                {['Term 1', 'Term 2', 'Term 3'].map(term => {
                  const termGrades = (report.grades || []).filter(g => g.term === term);
                  if (!termGrades.length) return null;
                  const termAvg = termGrades.reduce((a, g) => a + Number(g.grade), 0) / termGrades.length;
                  return (
                    <div key={term} style={{ marginBottom: 20 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--primary)' }}>
                        {term} — Avg: {termAvg.toFixed(1)}% <span className={`badge badge-${cbcLabel(termAvg).toLowerCase()}`}>{cbcLabel(termAvg)}</span>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Subject</th><th>Grade</th><th>Status</th><th>Feedback</th></tr></thead>
                          <tbody>
                            {termGrades.map((g, i) => (
                              <tr key={i}>
                                <td>{g.subject}</td>
                                <td>{g.grade}</td>
                                <td><span className={`badge ${cbcBadge(Number(g.grade))}`}>{cbcLabel(Number(g.grade))}</span></td>
                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.feedback || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">No report data available yet.</div>
            )}
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
