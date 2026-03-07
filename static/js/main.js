// ============================================================
// main.js — Frontend Logic
// Handles all button clicks, form submissions, and screen updates
// Talks to Flask backend using fetch() requests
// ============================================================


// ── API HELPER ───────────────────────────────────────────────
// One reusable function instead of writing fetch() every time
// method = "GET", "POST", or "DELETE"
// path   = the endpoint e.g. "/api/students"
// body   = data to send (only for POST requests)

async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body); // convert JS object → JSON text
  const res = await fetch(path, opts);        // send request, wait for response
  return res.json();                          // convert response → JS object
}


// ── TOAST NOTIFICATION ───────────────────────────────────────
// Shows a small popup message at the bottom of the screen
// Automatically disappears after 3 seconds

function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => { t.className = "toast"; }, 3000);
}


// ── TAB SWITCHING ────────────────────────────────────────────
// When a tab is clicked, hide all sections and show only the matching one

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    // Remove active from all tabs and sections
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((s) => s.classList.remove("active"));

    // Add active to clicked tab and its matching section
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");

    // Load fresh data for the tab that was clicked
    if (btn.dataset.tab === "dashboard") loadDashboard();
    if (btn.dataset.tab === "students")  loadStudentsTab();
    if (btn.dataset.tab === "grades")    loadGradesTab();
  });
});


// ── DASHBOARD ────────────────────────────────────────────────
// Loads stats and student cards when Dashboard tab is shown

async function loadDashboard() {
  // Fetch both stats and students at the same time
  const [stats, students] = await Promise.all([
    api("GET", "/api/stats"),
    api("GET", "/api/students"),
  ]);

  // Update the 4 stat boxes
  document.getElementById("val-total").textContent = stats.total_students || 0;
  document.getElementById("val-avg").textContent   = stats.overall_average ? stats.overall_average + "%" : "—";
  document.getElementById("val-pass").textContent  = stats.passing_students || 0;
  document.getElementById("val-fail").textContent  = stats.failing_students || 0;
  document.getElementById("student-count-badge").textContent = students.length;

  const grid = document.getElementById("student-cards");

  // Show empty message if no students yet
  if (!students.length) {
    grid.innerHTML = '<div class="empty-state">No students yet. Add one in the <strong>Students</strong> tab.</div>';
    return;
  }

  // Build a card for each student
  grid.innerHTML = students.map((s) => {
    const avg = s.average !== null ? s.average : null;
    const pct = avg !== null ? Math.min(avg, 100) : 0;
    const fillClass   = pct >= 70 ? "good" : pct >= 50 ? "mid" : "bad";
    const statusClass = s.status === "Pass" ? "pass" : s.status === "Fail" ? "fail" : "none";
    const unique = [...new Set(s.grades.map((g) => g.subject))]; // unique subjects only

    return `
    <div class="student-card">
      <div class="sc-header">
        <div>
          <div class="sc-name">${escHtml(s.name)}</div>
          <div class="sc-email">${escHtml(s.email)}</div>
        </div>
        <span class="status-pill ${statusClass}">${s.status}</span>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px">
        <span class="sc-avg" style="color:${pct>=50?'var(--green)':'var(--red)'}">
          ${avg !== null ? avg + "%" : "—"}
        </span>
        <span style="font-size:0.72rem;color:var(--muted);font-family:var(--font-mono)">
          ${s.grades.length} grade(s)
        </span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill ${fillClass}" style="width:${pct}%"></div>
      </div>
      ${unique.length ? '<div class="sc-subjects">' + unique.map((sub) => '<span class="subject-chip">' + escHtml(sub) + '</span>').join("") + '</div>' : ""}
    </div>`;
  }).join("");
}


// ── STUDENTS TAB ─────────────────────────────────────────────
// Loads and displays the students roster table

async function loadStudentsTab() {
  const students = await api("GET", "/api/students");
  const tbody = document.getElementById("students-tbody");

  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No students yet.</td></tr>';
    return;
  }

  tbody.innerHTML = students.map((s, i) => `
    <tr>
      <td style="color:var(--muted);font-family:var(--font-mono)">${i + 1}</td>
      <td style="font-weight:600">${escHtml(s.name)}</td>
      <td style="font-family:var(--font-mono);font-size:0.8rem;color:var(--muted)">${escHtml(s.email)}</td>
      <td style="font-family:var(--font-mono)">
        ${s.average !== null
          ? '<span style="color:' + (s.average >= 50 ? 'var(--green)' : 'var(--red)') + '">' + s.average + '%</span>'
          : '<span style="color:var(--muted)">—</span>'
        }
      </td>
      <td>
        <span class="status-pill ${s.status === 'Pass' ? 'pass' : s.status === 'Fail' ? 'fail' : 'none'}">
          ${s.status}
        </span>
      </td>
      <td><button class="btn-danger" onclick="deleteStudent(${s.id})">Delete</button></td>
    </tr>
  `).join("");
}

// Delete a student when Delete button is clicked
async function deleteStudent(id) {
  if (!confirm("Delete this student and all their grades?")) return;
  await api("DELETE", "/api/students/" + id);
  showToast("Student deleted", "error");
  loadStudentsTab();
  loadDashboard();
}

// Add a new student when Add Student button is clicked
document.getElementById("add-student-btn").addEventListener("click", async () => {
  const name  = document.getElementById("student-name").value.trim();
  const email = document.getElementById("student-email").value.trim();
  const msg   = document.getElementById("student-msg");

  // Check fields are not empty before sending to server
  if (!name || !email) {
    msg.textContent = "Please fill in both fields.";
    msg.className = "msg error";
    return;
  }

  // Send POST request to Flask with name and email
  const res = await api("POST", "/api/students", { name, email });

  if (res.error) {
    msg.textContent = res.error;
    msg.className = "msg error";
  } else {
    msg.textContent = "✓ " + name + " added successfully!";
    msg.className = "msg success";
    document.getElementById("student-name").value  = "";
    document.getElementById("student-email").value = "";
    showToast(name + " added!", "success");
    loadStudentsTab();
  }
});


// ── GRADES TAB ───────────────────────────────────────────────
// Loads grade entry form and grade records

let selectedStudentId = null; // tracks which student is selected in the dropdown

async function loadGradesTab() {
  const students = await api("GET", "/api/students");

  // Fill the student dropdown with names from the database
  const sel = document.getElementById("grade-student");
  sel.innerHTML = '<option value="">— Choose a student —</option>';
  students.forEach((s) => {
    const opt = document.createElement("option");
    opt.value       = s.id;
    opt.textContent = s.name;
    sel.appendChild(opt);
  });

  renderGradeRecords(students);
}

// Builds and shows grade record cards below the form
function renderGradeRecords(students) {
  const container = document.getElementById("grade-records");

  // Filter to selected student only if one is chosen in dropdown
  const filtered = selectedStudentId
    ? students.filter((s) => s.id == selectedStudentId)
    : students;

  // Show empty message if no grades exist
  if (!filtered.length || filtered.every((s) => !s.grades.length)) {
    container.innerHTML = '<div class="empty-state">No grade records to display.</div>';
    return;
  }

  container.innerHTML = filtered.filter((s) => s.grades.length).map((s) => `
    <div class="grade-record-card">
      <div class="grc-header">
        <div class="grc-name">${escHtml(s.name)}</div>
        <span class="status-pill ${s.status === 'Pass' ? 'pass' : s.status === 'Fail' ? 'fail' : 'none'}">
          ${s.status} ${s.average !== null ? "· " + s.average + "%" : ""}
        </span>
      </div>
      <table class="grc-table">
        <thead>
          <tr><th>Subject</th><th>Score</th><th>Percentage</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${s.grades.map((g) => {
            const pct = Math.round((g.grade / g.max_grade) * 100);
            return `<tr>
              <td style="font-weight:600">${escHtml(g.subject)}</td>
              <td style="font-family:var(--font-mono)">${g.grade} / ${g.max_grade}</td>
              <td style="font-family:var(--font-mono);color:${pct >= 50 ? 'var(--green)' : 'var(--red)'}">${pct}%</td>
              <td><button class="btn-danger" onclick="deleteGrade(${g.id})">Remove</button></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>
  `).join("");
}

// When student dropdown changes, filter grade records shown
document.getElementById("grade-student").addEventListener("change", async (e) => {
  selectedStudentId = e.target.value || null;
  const students = await api("GET", "/api/students");
  renderGradeRecords(students);
});

// Save a grade when Save Grade button is clicked
document.getElementById("add-grade-btn").addEventListener("click", async () => {
  const student_id = document.getElementById("grade-student").value;
  const subject    = document.getElementById("grade-subject").value.trim();
  const grade      = document.getElementById("grade-value").value;
  const max_grade  = document.getElementById("grade-max").value || 100;
  const msg        = document.getElementById("grade-msg");

  // Validate all fields are filled
  if (!student_id || !subject || grade === "") {
    msg.textContent = "Please fill in all fields and select a student.";
    msg.className = "msg error";
    return;
  }

  // Send POST request to Flask
  const res = await api("POST", "/api/grades", {
    student_id: parseInt(student_id),
    subject,
    grade:     parseFloat(grade),
    max_grade: parseFloat(max_grade),
  });

  if (res.error) {
    msg.textContent = res.error;
    msg.className = "msg error";
  } else {
    msg.textContent = "✓ Grade saved for " + subject + "!";
    msg.className = "msg success";
    document.getElementById("grade-subject").value = "";
    document.getElementById("grade-value").value   = "";
    document.getElementById("grade-max").value     = "100";
    showToast("Grade saved!", "success");
    loadGradesTab();
    loadDashboard();
  }
});

// Remove a grade when Remove button is clicked
async function deleteGrade(id) {
  await api("DELETE", "/api/grades/" + id);
  showToast("Grade removed", "error");
  loadGradesTab();
  loadDashboard();
}


// ── SECURITY HELPER ──────────────────────────────────────────
// Converts special characters so user input can't run as code
// e.g. <script> becomes &lt;script&gt; which is harmless

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


// ── START ────────────────────────────────────────────────────
// Load the dashboard automatically when the page first opens
loadDashboard();
