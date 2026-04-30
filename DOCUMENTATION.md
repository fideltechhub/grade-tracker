# GradeVault — Complete Technical Documentation

## Table of Contents
1. [Deployment Checklist](#deployment-checklist)
2. [Project Overview](#project-overview)
3. [File & Folder Structure](#file--folder-structure)
4. [Environment Variables](#environment-variables)
5. [Database Schema](#database-schema)
6. [Backend — app.py](#backend--apppy)
   - [Imports & App Configuration](#imports--app-configuration)
   - [Email System (Brevo)](#email-system-brevo)
   - [Database Helpers](#database-helpers)
   - [CBC Grading System](#cbc-grading-system)
   - [Activity Logging](#activity-logging)
   - [Page Routes](#page-routes)
   - [Password Reset Routes](#password-reset-routes)
   - [Auth API Endpoints](#auth-api-endpoints)
   - [Admin API Endpoints](#admin-api-endpoints)
   - [Student & Grade API Endpoints](#student--grade-api-endpoints)
   - [Search Endpoints](#search-endpoints)
   - [Report Endpoints](#report-endpoints)
   - [Announcements](#announcements)
   - [Attendance](#attendance)
   - [Parent Portal](#parent-portal)
   - [Bulk Grade Import](#bulk-grade-import)
   - [Activity Log](#activity-log)
   - [Grade Feedback](#grade-feedback)
   - [NEW: At-Risk Student Detection](#new-at-risk-student-detection)
   - [NEW: Class Rank & Percentile](#new-class-rank--percentile)
   - [NEW: Attendance-Grade Correlation](#new-attendance-grade-correlation)
   - [NEW: Term Grade Prediction](#new-term-grade-prediction)
7. [Frontend — CSS (style.css)](#frontend--css-stylecss)
8. [Frontend — Templates](#frontend--templates)
   - [login.html](#loginhtml)
   - [register.html](#registerhtml)
   - [forgot_password.html / reset_password.html](#forgot_passwordhtml--reset_passwordhtml)
   - [dashboard_admin.html](#dashboard_adminhtml)
   - [dashboard_teacher.html](#dashboard_teacherhtml)
   - [dashboard_student.html](#dashboard_studenthtml)
   - [dashboard_parent.html](#dashboard_parenthtml)
9. [Frontend — JavaScript Functions (per dashboard)](#frontend--javascript-functions-per-dashboard)
10. [Security Model](#security-model)
11. [Deployment Guide (Render)](#deployment-guide-render)

---

## Deployment Checklist

Before deploying, confirm these items are all green:

| Check | Status |
|---|---|
| `app.py` Python syntax | PASS |
| All HTML `<div>` tags balanced | PASS |
| All `<script>` / `<style>` tags balanced | PASS |
| All 4 new API routes in backend | PASS |
| All new routes referenced in correct frontends | PASS |
| All new routes have authentication + 403 guards | PASS |
| No raw user data injected into SQL strings | PASS |
| `requirements.txt` includes all dependencies | PASS |
| `runtime.txt` specifies Python 3.11 | PASS |
| `Procfile` starts the app correctly | PASS |

**The application is ready for deployment.**

---

## Project Overview

**GradeVault** is a web-based academic grade tracking system built for Kenya's CBC (Competency-Based Curriculum) Junior Secondary School (Grades 7–9). It supports four user roles: **Admin**, **Teacher**, **Student**, and **Parent**, each with their own dashboard.

**Technology Stack:**
- **Backend:** Python / Flask (server-side web framework)
- **Database:** PostgreSQL (hosted on Render or any cloud PostgreSQL provider)
- **Email:** Brevo (formerly Sendinblue) REST API for transactional emails
- **Frontend:** Plain HTML + CSS + Vanilla JavaScript (no frontend framework)
- **Charts:** Chart.js v4.4.1 (CDN)
- **PDF Generation:** jsPDF v2.5.1 (CDN)
- **Auth:** Session-based (Flask sessions, server-side), with WebAuthn/biometrics as a second factor
- **Deployment:** Render.com (Web Service)

---

## File & Folder Structure

```
grade-tracker/
├── app.py                   ← The entire backend (Flask application)
├── requirements.txt         ← Python dependencies
├── runtime.txt              ← Python version for Render
├── procfile                 ← Render startup command
├── static/
│   ├── css/
│   │   └── style.css        ← Global stylesheet for all pages
│   └── js/
│       └── main.js          ← Shared utility JS (currently minimal)
└── templates/               ← Jinja2 HTML templates
    ├── login.html
    ├── register.html
    ├── forgot_password.html
    ├── reset_password.html
    ├── dashboard_admin.html
    ├── dashboard_teacher.html
    ├── dashboard_student.html
    └── dashboard_parent.html
```

---

## Environment Variables

These must be set in Render's environment variable settings:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | YES | Full PostgreSQL connection string (e.g. `postgres://user:pass@host/db`) |
| `BREVO_API_KEY` | YES | API key from your Brevo account for sending emails |
| `MAIL_FROM` | No | Sender email address (defaults to `fidelclinton4@gmail.com`) |
| `MAIL_FROM_NAME` | No | Sender display name (defaults to `GradeVault`) |
| `APP_BASE_URL` | No | Full URL of your deployed app (defaults to the Render URL) |

---

## Database Schema

GradeVault uses 8 tables, all created automatically on first launch by `init_db()`.

### `users`
Stores all user accounts regardless of role.

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | Auto-incrementing user ID |
| `fullname` | TEXT | User's full name (max 32 chars) |
| `username` | TEXT UNIQUE | Login username (max 32 chars) |
| `email` | TEXT UNIQUE | Email address |
| `password` | TEXT | Werkzeug-hashed password |
| `role` | TEXT | One of: `admin`, `teacher`, `student`, `parent` |
| `subject` | TEXT | Comma-separated subjects for teachers, NULL otherwise |
| `created_at` | TIMESTAMP | Account creation time |

### `students`
A separate record for each student (linked to a `users` row by email).

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | Student record ID |
| `user_id` | INTEGER FK | References `users.id` (nullable) |
| `name` | TEXT | Student's full name |
| `email` | TEXT UNIQUE | Student's email |
| `created_at` | TIMESTAMP | Record creation time |

### `grades`
One row per grade entry (a student can have multiple grades per subject across terms).

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | Grade record ID |
| `student_id` | INTEGER FK | References `students.id` |
| `subject` | TEXT | Subject name (e.g. "Mathematics") |
| `grade` | REAL | Raw score (e.g. 78) |
| `max_grade` | REAL | Maximum possible score (default 100) |
| `comment` | TEXT | Optional teacher comment (max 500 chars) |
| `teacher_id` | INTEGER FK | References `users.id` (teacher who set it) |
| `term` | TEXT | "Term 1", "Term 2", or "Term 3" |
| `created_at` | TIMESTAMP | When the grade was entered |

### `password_reset_tokens`
Stores secure tokens for the "Forgot Password" flow.

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | Token ID |
| `user_id` | INTEGER FK | References `users.id` |
| `token` | TEXT UNIQUE | 48-byte URL-safe random token |
| `expires_at` | TIMESTAMP | Token expiry (30 minutes after creation) |
| `used` | BOOLEAN | TRUE once the token has been used |

### `announcements`
School-wide announcements posted by admins.

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | Announcement ID |
| `title` | TEXT | Announcement title |
| `message` | TEXT | Body text (optional) |
| `author_name` | TEXT | Display name of who posted it |
| `created_by` | INTEGER FK | References `users.id` |
| `created_at` | TIMESTAMP | Posting time |

### `activity_log`
Audit trail of all significant actions in the system.

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | Log entry ID |
| `user_id` | INTEGER FK | Who performed the action |
| `user_name` | TEXT | Snapshot of their name at time of action |
| `action` | TEXT | Short action label (e.g. "Added grade") |
| `details` | TEXT | Longer context string |
| `created_at` | TIMESTAMP | When the action happened |

### `grade_feedback`
Threaded comments on individual grade entries (teacher ↔ student communication).

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | Message ID |
| `grade_id` | INTEGER FK | References `grades.id` |
| `user_id` | INTEGER FK | Author's user ID |
| `author_name` | TEXT | Snapshot of author's name |
| `role` | TEXT | Author's role at time of posting |
| `message` | TEXT | Message body (max 500 chars) |
| `created_at` | TIMESTAMP | Posted time |

### `attendance`
Daily attendance records, one row per student per date.

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | Record ID |
| `student_id` | INTEGER FK | References `students.id` |
| `date` | DATE | The calendar date |
| `status` | TEXT | One of: `Present`, `Absent`, `Late` |
| `term` | TEXT | Which term this date falls in |
| `marked_by` | INTEGER FK | Teacher/admin who marked it |
| `created_at` | TIMESTAMP | When it was recorded |
| UNIQUE | `(student_id, date)` | Prevents duplicate records per student per day |

### `parent_students`
Many-to-many link table connecting parents to their children.

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | Link ID |
| `parent_id` | INTEGER FK | References `users.id` (parent role) |
| `student_id` | INTEGER FK | References `students.id` |
| UNIQUE | `(parent_id, student_id)` | Prevents duplicate links |

---

## Backend — app.py

### Imports & App Configuration

```python
import sys
import logging
logging.basicConfig(level=logging.INFO, stream=sys.stderr, force=True)
```
Sets up Python's logging to write to stderr at INFO level. `force=True` overrides any previous logging configuration. Render captures stderr logs and shows them in the dashboard.

```python
from flask import Flask, request, jsonify, render_template, session, redirect, url_for
```
- `Flask` — the application factory class
- `request` — access incoming HTTP request data (body, args, files)
- `jsonify` — converts a Python dict to a JSON HTTP response
- `render_template` — renders a Jinja2 HTML template
- `session` — server-side cookie session dictionary
- `redirect` / `url_for` — HTTP redirects and URL building

```python
from werkzeug.security import generate_password_hash, check_password_hash
```
Werkzeug's hashing utilities. `generate_password_hash` applies PBKDF2-HMAC-SHA256 with a random salt. `check_password_hash` compares a plain password against a stored hash securely (timing-safe).

```python
import psycopg2
import psycopg2.extras
```
`psycopg2` is the PostgreSQL adapter for Python. `psycopg2.extras.RealDictCursor` makes query results behave as Python dicts (`row["column"]`) instead of tuples.

```python
import re       # Regular expressions — used for email validation
import os       # Access environment variables (os.environ.get)
import secrets  # Cryptographically secure random tokens
import requests # HTTP client — used to call Brevo API
import csv      # Parse CSV files for bulk grade import
import io       # In-memory file streams
from datetime import datetime, timedelta  # Date/time arithmetic
```

```python
app = Flask(__name__)
app.secret_key = "gradevault_secret_key_2024"
```
Creates the Flask application. `secret_key` signs the session cookie — changing this invalidates all active sessions. **In production, this should be a long random secret stored in an environment variable.**

```python
app.config["SESSION_PERMANENT"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True
```
- `SESSION_PERMANENT` — session survives browser restart
- `PERMANENT_SESSION_LIFETIME` — session expires after 8 hours of the last request
- `SESSION_COOKIE_SAMESITE = "Lax"` — prevents CSRF attacks from cross-site requests
- `SESSION_COOKIE_HTTPONLY = True` — JavaScript cannot read the session cookie (prevents XSS cookie theft)

---

### Email System (Brevo)

```python
BREVO_API_KEY = os.environ.get("BREVO_API_KEY")
MAIL_FROM     = os.environ.get("MAIL_FROM", "fidelclinton4@gmail.com")
MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "GradeVault")
APP_BASE_URL  = os.environ.get("APP_BASE_URL", "https://grade-tracker-pq0y.onrender.com")
```
Read configuration from environment variables. The second argument to `os.environ.get()` is the default if the variable is not set.

```python
def send_reset_email(to_email, token):
```
Sends a password reset email using the Brevo transactional email API (REST over HTTPS).

```python
    reset_link = f"{APP_BASE_URL}/reset-password?token={token}"
```
Builds the clickable reset URL by appending the token as a query parameter.

```python
    html = f"""..."""
```
An HTML email template with inline CSS styling, a clickable button, and a fallback plain-text link.

```python
    payload = {
        "sender": {"name": MAIL_FROM_NAME, "email": MAIL_FROM},
        "to": [{"email": to_email}],
        "subject": "GradeVault — Password Reset Request",
        "htmlContent": html,
        "textContent": f"Reset your GradeVault password: {reset_link}..."
    }
```
Builds the Brevo API request body. `htmlContent` is shown by modern email clients; `textContent` is the plain-text fallback for older clients.

```python
    response = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={"accept": "application/json", "api-key": BREVO_API_KEY, ...},
        json=payload,
        timeout=20
    )
```
Sends the HTTP POST request to Brevo's email API. `timeout=20` prevents hanging indefinitely if Brevo is slow.

```python
    if response.status_code not in (200, 201):
        raise Exception(f"Brevo API error {response.status_code}: {response.text}")
```
Raises an exception if Brevo returns any non-success status code, which is caught by the route handler.

---

### Database Helpers

```python
def get_db():
    conn = psycopg2.connect(
        os.environ.get("DATABASE_URL"),
        cursor_factory=psycopg2.extras.RealDictCursor
    )
    return conn
```
Opens a new database connection on every call. `RealDictCursor` is set here so every cursor from this connection returns dict-like rows automatically. Each request opens and closes its own connection (not a connection pool — acceptable for low-to-medium traffic).

```python
def init_db():
```
Called once at application startup. Uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` so it is safe to run on a database that already has tables (idempotent). It also seeds a default admin account if no admin user exists yet.

---

### CBC Grading System

```python
CBC_SUBJECTS = [
    "English", "Kiswahili", "Mathematics", "Integrated Science",
    "Social Studies", "Religious Education (CRE)", ...
    "Creative Arts & Sports"
]
```
The official list of 14 subjects for Kenya's CBC Junior Secondary curriculum. Used to populate subject dropdowns and to sort grade reports in the official KNEC order.

```python
TERMS = ["Term 1", "Term 2", "Term 3"]
```
The three academic terms used throughout the system for filtering grades, attendance, and predictions.

```python
def cbc_status(average):
    if average is None:   return "No Grades"
    if average >= 75:     return "EE"   # Exceeds Expectation
    elif average >= 50:   return "ME"   # Meets Expectation
    elif average >= 25:   return "AE"   # Approaches Expectation
    else:                 return "BE"   # Below Expectation
```
Converts a numerical average (0–100) into a CBC performance level. These are the official KNEC descriptors:
- **EE** (Exceeds Expectation) — 75% and above
- **ME** (Meets Expectation) — 50–74%
- **AE** (Approaches Expectation) — 25–49%
- **BE** (Below Expectation) — below 25%

---

### Activity Logging

```python
def log_activity(user, action, details=""):
    cursor.execute(
        "INSERT INTO activity_log (user_id, user_name, action, details) VALUES (%s, %s, %s, %s)",
        (user["id"], user["fullname"], action, details or None)
    )
```
Writes a row to `activity_log` after every significant action (login, adding grades, deleting students, etc.). The `try/except` wrapper ensures a logging failure never breaks the main operation. This gives the admin a full audit trail visible in the Activity Log tab.

---

### Page Routes

```python
@app.route("/")
def home():
    user = get_current_user()
    if user:
        role_map = {"admin": "admin_dashboard", "teacher": "teacher_dashboard", ...}
        return redirect(url_for(role_map.get(user["role"], "login_page")))
    return redirect(url_for("login_page"))
```
The root URL `/` checks if a session exists. If the user is logged in, it sends them directly to their role-specific dashboard. Otherwise it redirects to the login page. This prevents logged-in users from seeing the login page again.

```python
@app.route("/dashboard/admin")
def admin_dashboard():
    user = get_current_user()
    if not user or user["role"] != "admin":
        return redirect(url_for("login_page"))
    return render_template("dashboard_admin.html", user=dict(user))
```
Protects the admin dashboard: anyone without a valid admin session is redirected to login. `dict(user)` converts the `RealDictRow` to a plain Python dict that Jinja2 can use freely.

The same pattern applies to `/dashboard/teacher`, `/dashboard/student`, and `/dashboard/parent`.

---

### Password Reset Routes

```python
@app.route("/api/forgot-password", methods=["POST"])
def forgot_password():
```
Handles the forgot-password form submission. Always returns the same generic message whether the email exists or not (`"If that email exists, a reset link has been sent."`) — this is deliberate to prevent email enumeration attacks (attackers cannot probe which emails are registered).

```python
    token      = secrets.token_urlsafe(48)
    expires_at = datetime.utcnow() + timedelta(minutes=30)
```
Generates a 48-byte cryptographically random URL-safe token. The token is stored in the database and expires in 30 minutes.

```python
    cursor.execute("UPDATE password_reset_tokens SET used = TRUE WHERE user_id = %s AND used = FALSE", (user["id"],))
```
Invalidates any existing unused tokens for this user before creating a new one, so only the latest link works.

```python
@app.route("/api/reset-password", methods=["POST"])
def reset_password():
```
Validates the token (exists, not used, not expired), then updates the password. The token is marked `used = TRUE` immediately after the password change so it cannot be reused.

---

### Auth API Endpoints

#### POST `/api/login`
```python
cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
user = cursor.fetchone()
if not user or not check_password_hash(user["password"], password):
    return jsonify({"error": "Invalid username or password"}), 401
```
Fetches the user by username (not email), then uses `check_password_hash` for a timing-safe comparison. A generic error message is returned regardless of whether the username was wrong or the password was wrong — this prevents username enumeration.

```python
session.permanent = True
session["user_id"] = user["id"]
session["role"]    = user["role"]
```
Stores minimal data in the session (just the user ID and role). The user record is re-fetched from the database on each request via `get_current_user()` rather than caching stale data in the session.

#### POST `/api/register`
Creates a `users` record with role `student` and a matching `students` record. Both are inserted in the same database transaction. If either raises a `UniqueViolation` (duplicate username or email), the transaction is rolled back and a 409 Conflict is returned.

#### POST `/api/change-password`
Verifies the current password before allowing the update. Also prevents re-using the same password. Requires an active session.

---

### Admin API Endpoints

#### GET/POST `/api/admin/teachers`
- **GET** — returns all teachers ordered by name with all fields
- **POST** — creates a new teacher account. Subjects can be a comma-separated list (e.g. `"Mathematics,Physics"`). Validation checks that at least one subject is selected and that the name/email/username constraints are met.

#### PATCH `/api/admin/teachers/<teacher_id>/subjects`
Updates which subjects a teacher is assigned to. Only admin can call this.

#### DELETE `/api/admin/teachers/<teacher_id>`
Removes the teacher's `users` row. This cascades to delete any related records.

#### GET `/api/admin/stats`
Returns aggregate stats: total students, total teachers, total grades, overall average. Used by the admin overview tab.

#### POST `/api/admin/users/<user_id>/reset-password`
Admin-only: resets any user's password to their username (the default password). Returns the new password so the admin can communicate it to the user.

#### GET `/api/cbc-subjects`
Public-ish endpoint returning the list of 14 CBC subjects. Used by all dropdowns across the system.

---

### Student & Grade API Endpoints

#### GET `/api/students`
Returns all students with their grades and calculated averages. For teachers, grades are filtered to only include their assigned subjects. Accepts a `?term=` query parameter to filter grades by term.

The response for each student includes:
- `id`, `name`, `email`
- `grades` — array of grade objects
- `average` — computed mean percentage
- `status` — CBC level (EE/ME/AE/BE/No Grades)

#### POST `/api/students`
Creates a student record. Also creates a `users` row if one doesn't already exist for that email, with a default password equal to the username (derived from the email prefix). The login credentials are returned in the response so a teacher/admin can share them.

#### DELETE `/api/students/<student_id>`
Deletes the student and all their grades (the foreign key `ON DELETE CASCADE` handles this at the DB level, but the code also runs explicit DELETEs).

#### POST `/api/grades`
```python
if user["role"] == "teacher":
    cursor.execute("""
        SELECT id FROM grades
        WHERE student_id = %s AND subject = %s AND teacher_id = %s
    """, (student_id, subject, user["id"]))
    existing = cursor.fetchone()
    if existing:
        return jsonify({"error": "You have already added a grade ..."}), 409
```
Prevents a teacher from accidentally adding a second grade for the same subject for the same student. They must use the edit option instead. Admin is not subject to this restriction.

#### PUT `/api/grades/<grade_id>`
Updates an existing grade. The update is built dynamically — only fields present in the request body are updated. This allows partial updates (e.g. only updating the comment without touching the score).

#### DELETE `/api/grades/<grade_id>`
Removes a single grade entry.

#### GET `/api/my-grades`
Student-only endpoint. Returns the logged-in student's own grades by matching their session email to the `students` table. Supports `?term=` filtering.

#### GET `/api/stats`
Returns aggregate statistics scoped appropriately: teachers see stats only for their subjects, everyone else sees school-wide stats.

---

### Search Endpoints

#### GET `/api/students/search?q=<query>`
Full-text search on student name and email using PostgreSQL `LIKE`. Case-insensitive via `LOWER()`. Returns up to all matching students with their grades and averages.

#### GET `/api/teachers/search?q=<query>`
Admin-only search across teacher name, username, and assigned subjects.

---

### Report Endpoints

#### GET `/api/my-report`
Student-only. Returns the full report data needed to render the student's Report Card tab and to generate the PDF download. Includes:
- All grades sorted in official KNEC subject order
- Dates formatted as `DD/MM/YYYY`
- Per-subject averages
- Overall average and CBC status

```python
KNEC_ORDER = ["English", "Kiswahili", "Mathematics", ...]
grade_list.sort(key=lambda g: KNEC_ORDER.index(g["subject"]) if g["subject"] in KNEC_ORDER else len(KNEC_ORDER))
```
Sorts grades into the official Ministry of Education subject order. Subjects not in the list are placed at the end.

#### GET `/api/admin/school-report`
Admin-only. Returns all students with their averages, teacher count, and pass/fail breakdown. Used for the School Report tab and PDF export.

---

### Announcements

#### GET `/api/announcements`
Returns the 20 most recent announcements. Available to all logged-in users. Used by the announcement banner visible on all dashboards.

#### POST `/api/announcements`
Admin-only. Creates a new announcement with a title and optional body.

#### DELETE `/api/announcements/<ann_id>`
Admin-only. Deletes an announcement immediately.

---

### Attendance

#### POST `/api/attendance`
```python
cursor.execute("""
    INSERT INTO attendance (student_id, date, status, term, marked_by)
    VALUES (%s, %s, %s, %s, %s)
    ON CONFLICT (student_id, date)
    DO UPDATE SET status = EXCLUDED.status, ...
""", ...)
```
Uses PostgreSQL's `ON CONFLICT DO UPDATE` (upsert) so re-submitting attendance for the same date overwrites the previous entry rather than creating a duplicate. This lets teachers correct mistakes.

#### GET `/api/attendance`
Returns attendance records for teachers/admins. Supports filtering by `?date=`, `?student_id=`, and `?term=` query parameters. Includes the student name and email by joining with the `students` table.

#### GET `/api/my-attendance`
Student-only. Returns the student's own attendance records with a summary (total, present, absent, late, percentage).

#### GET `/api/admin/attendance-stats`
Returns school-wide attendance statistics (totals for each status, overall percentage).

---

### Parent Portal

#### GET/POST `/api/admin/parents`
Admin manages parent accounts (list and create). Creating a parent does not automatically link them to any student — that is a separate step.

#### POST `/api/admin/parents/<parent_id>/link`
Links a parent to a student via the `parent_students` junction table.

#### DELETE `/api/admin/parents/<parent_id>/unlink/<student_id>`
Removes a parent-student link.

#### GET `/api/parent/children`
Parent-only. Returns the list of students linked to the logged-in parent.

#### GET `/api/parent/child/<student_id>/grades`
Parent-only. Before returning data, verifies that the requested student is actually linked to this parent — unauthorized access to another student's data is blocked with a 403.

#### GET `/api/parent/child/<student_id>/attendance`
Same access pattern as the grades endpoint. Returns attendance records and a summary for the parent's child.

---

### Bulk Grade Import

#### POST `/api/grades/bulk-import`
Accepts a multipart file upload (CSV). The expected columns are:
`student_email`, `subject`, `grade`, `max_grade` (optional), `term` (optional), `comment` (optional)

```python
content = file.read().decode("utf-8")
reader  = csv.DictReader(io.StringIO(content))
```
Reads the CSV into memory and iterates row by row. Errors (missing fields, invalid grades, unknown students, teacher subject violations) are collected and returned alongside the success count rather than aborting the entire import.

A downloadable template CSV is generated client-side in the browser by the `downloadCSVTemplate()` JavaScript function.

---

### Activity Log

#### GET `/api/admin/activity-log`
Admin-only. Returns up to 100 recent log entries (configurable via `?limit=` parameter). Each entry shows who did what and when.

---

### Grade Feedback

#### GET/POST `/api/grades/<grade_id>/feedback`
Implements a per-grade discussion thread. Students can only access feedback on their own grades (enforced by a JOIN check). Teachers and admins can access any grade's feedback. Messages are limited to 500 characters.

---

### NEW: At-Risk Student Detection

**Endpoint:** `GET /api/at-risk-students`  
**Access:** Admin and Teacher only

```python
@app.route("/api/at-risk-students", methods=["GET"])
def at_risk_students():
```
Identifies students who need intervention by analysing their grade trajectory across terms.

```python
    teacher_subjects = [s.strip() for s in user["subject"].split(",")] if user.get("subject") else []
```
For teachers, only their assigned subjects are considered. This ensures a Maths teacher only sees at-risk students based on maths performance.

```python
    for term in TERMS:
        cursor.execute(
            f"SELECT AVG(grade) as avg FROM grades WHERE student_id = %s AND term = %s ...",
        )
        if row["avg"] is not None:
            term_avgs[term] = round(float(row["avg"]), 2)
```
For each student, computes their average grade for each term separately. Only terms with at least one grade are included.

**Risk Criterion 1 — Currently Below Expectation:**
```python
    if latest_avg is not None and latest_avg < 25:
        reasons.append("Below Expectation (BE)")
```
A student scoring below 25% is flagged regardless of trend.

**Risk Criterion 2 — Consistently Declining:**
```python
    if len(avg_vals) >= 2:
        declining = all(avg_vals[i] > avg_vals[i + 1] for i in range(len(avg_vals) - 1))
        if declining and avg_vals[-1] < 50:
            reasons.append("Consistently declining")
```
Checks if averages are strictly decreasing across all consecutive terms AND the student is currently below the ME threshold (50%). Requires at least 2 terms of data.

**Risk Criterion 3 — Sharp Drop:**
```python
    if len(avg_vals) >= 2:
        best = max(avg_vals[:-1])
        drop = round(best - avg_vals[-1], 1)
        if drop >= 15:
            reasons.append(f"Dropped {drop} pts from best term")
```
Flags a student whose latest term average is 15 or more points below their best previous term. This catches students who peaked and are now slipping, even if they haven't gone below 50%.

The response is a list of student objects with `name`, `email`, `average`, `status`, `reasons` (list of strings), and `term_avgs` (dict of term → average).

---

### NEW: Class Rank & Percentile

**Endpoint:** `GET /api/my-rank`  
**Access:** Student only

```python
cursor.execute("""
    SELECT s.id, AVG(g.grade) as avg
    FROM students s
    JOIN grades g ON g.student_id = s.id
    GROUP BY s.id
    ORDER BY avg DESC
""")
ranked = cursor.fetchall()
```
Fetches all students who have at least one grade, ordered from highest to lowest average. Only students with grades appear in the ranking (ungraded students are excluded).

```python
for i, r in enumerate(ranked, start=1):
    if r["id"] == student["id"]:
        rank = i
        break
```
Scans the ranked list to find the logged-in student's position (1 = top of class).

```python
percentile = round(((total - rank) / total) * 100, 1) if total > 1 else 100.0
```
Calculates the percentile: what percentage of students this student is ahead of. Rank 1 out of 20 = (20-1)/20 × 100 = 95th percentile (top 5%).

Response: `{ rank, total, percentile }` — or `rank: null` if the student has no grades yet.

---

### NEW: Attendance-Grade Correlation

**Endpoint:** `GET /api/attendance-grade-correlation`  
**Access:** Admin and Teacher only

```python
cursor.execute("SELECT status FROM attendance WHERE student_id = %s", (s["id"],))
att_rows  = cursor.fetchall()
total_att = len(att_rows)
present   = sum(1 for r in att_rows if r["status"] == "Present")
att_pct   = round((present / total_att) * 100, 1)
```
For each student, calculates their attendance rate: (days present / total recorded days) × 100.

```python
cursor.execute("SELECT AVG(grade) as avg FROM grades WHERE student_id = %s ...", ...)
```
Fetches their overall grade average (filtered to the teacher's subjects if applicable).

Only students who have **both** attendance records **and** grade records are included in the response. Students missing either data point are silently skipped.

Response: array of `{ name, attendance_pct, grade_avg }` — one object per qualifying student. This is consumed by the Chart.js scatter chart in the Charts tab.

---

### NEW: Term Grade Prediction

**Endpoint:** `GET /api/my-prediction`  
**Access:** Student only

```python
known = [(i, term_avgs[t]) for i, t in enumerate(TERMS) if t in term_avgs]
```
Builds a list of `(index, average)` pairs for terms that have data. Term 1 = index 0, Term 2 = index 1, Term 3 = index 2.

```python
if len(known) < 2:
    return jsonify({"prediction": None, ..., "message": "Need at least 2 terms of data..."})
if len(known) == 3:
    return jsonify({"prediction": None, ..., "message": "All three terms complete..."})
```
Edge cases: fewer than 2 terms = no basis for prediction. All 3 terms complete = no prediction needed.

```python
x1, y1 = known[-2]
x2, y2 = known[-1]
slope     = y2 - y1
predicted = round(y2 + slope * (2 - x2), 2)
predicted = max(0.0, min(100.0, predicted))
```
**Linear extrapolation:** uses the last two known data points to project the next value.
- `slope` = change in average per term
- `2 - x2` = how many steps to project (if the last known term is Term 2 at index 1, we project 1 step ahead to index 2)
- The result is clamped to [0, 100] since grades cannot exceed those bounds

```python
trend = "improving" if slope > 2 else ("declining" if slope < -2 else "stable")
```
Classifies the trend: more than 2% improvement = "improving", more than 2% drop = "declining", otherwise "stable" (allows for minor natural variation).

Response: `{ prediction, trend, slope, term_avgs, status, message }`.

---

## Frontend — CSS (style.css)

The stylesheet uses **CSS custom properties** (variables) for the design system, making dark/light mode switching trivial.

### Design Tokens

```css
:root {
  --bg: #0d0f14;         /* Page background — deep dark navy */
  --surface: #13161e;    /* Card/panel background */
  --surface2: #1a1e2a;   /* Input background, nested surfaces */
  --border: #252a38;     /* All borders and dividers */
  --accent: #e8c547;     /* Primary action colour — golden yellow */
  --accent2: #4f8ef7;    /* Secondary accent — blue */
  --green: #3dd68c;      /* Success, passing grades */
  --red: #f7604f;        /* Error, failing grades, danger actions */
  --text: #e8eaf0;       /* Primary text colour */
  --muted: #6b7294;      /* Secondary/label text */
  --font-display: 'Syne', sans-serif;    /* Headings and UI text */
  --font-mono: 'DM Mono', monospace;    /* Numbers, labels, code */
  --radius: 12px;        /* Standard border radius */
  --radius-sm: 8px;      /* Smaller border radius */
  --transition: 0.2s ease; /* Standard animation speed */
}
```

### Key Component Classes

**`.stat-card`** — The summary number cards at the top of each dashboard. The `::before` pseudo-element draws a 3px coloured top border. Variants `.accent`, `.green`, `.red` change that colour and the value text colour.

**`.stats-grid`** — A 4-column CSS grid that holds stat cards. Collapses to 2 columns on screens under 768px.

**`.tab` / `.tab.active`** — The navigation pills. The active tab gets `background: var(--accent)` (gold) with dark text.

**`.tab-content` / `.tab-content.active`** — All tab panels are `display:none` by default. Adding `active` class switches to `display:block` with a `fadeUp` animation (slides up 12px while fading in over 0.3s).

**`.student-card`** — The individual student summary card in the teacher's Overview. Lifts on hover with a border colour change.

**`.progress-bar` / `.progress-fill`** — A horizontal bar showing grade percentage. `.good` = green, `.mid` = yellow, `.bad` = red.

**`.btn-primary`** — The gold action button. Lightens on hover, has a 1px lift.

**`.btn-danger`** — A ghost button (no background) that turns red on hover.

**`.toast`** — A fixed notification that slides up from the bottom and fades in. Automatically dismisses after 3 seconds.

**`.light` mode overrides** — When `body.light` is present, the design token values are overridden to white/light grey backgrounds, making the entire UI switch to light mode without any JavaScript needing to know about colours.

**`.password-wrap` / `.eye-btn`** — Wraps a password input with an absolutely-positioned eye icon button for show/hide toggle.

---

## Frontend — Templates

All templates are Jinja2 HTML files rendered by Flask's `render_template()`. They receive user data as `{{ user.fullname }}` etc.

### login.html

**Purpose:** The entry point for all users.

**Structure:**
- A centered card with GradeVault logo
- Username + password fields with show/hide toggle
- "Forgot Password" link → `/forgot-password`
- "Create Account" link → `/register`

**JavaScript:**
```javascript
document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();  // Prevent native form submission
    const res  = await fetch("/api/login", { method:"POST", headers:..., body:... });
    const data = await res.json();
    if (data.error) { showMsg(data.error, "error"); return; }
    window.location.href = data.redirect;  // Navigate to role-specific dashboard
});
```
All form submissions use `fetch()` (AJAX) rather than native form posts. This allows displaying inline error messages without a page reload.

**WebAuthn biometric login button:** Calls `biometricLogin()` which uses the WebAuthn API (`navigator.credentials.get()`). The challenge is fetched from the server, credentials are verified client-side by the browser (fingerprint/Face ID), and the response is sent to the server for verification.

---

### register.html

**Purpose:** Self-service account creation (creates student accounts only; teacher/parent accounts are admin-created).

**Features:**
- Real-time password strength meter (colour bar that turns red → yellow → green)
- Client-side validation before API call (field lengths, email format, password match)
- On success, redirects to login with a success message

---

### forgot_password.html / reset_password.html

**forgot_password.html:** Simple email form. Sends POST to `/api/forgot-password`. Always shows the same success message to prevent email enumeration.

**reset_password.html:** Reads the token from the URL query string (`?token=...`). Shows a new password + confirm password form. On success, redirects to login.

---

### dashboard_admin.html

**Tabs:**
1. **Overview** — Stats cards + At-Risk alert panel + Announcement banner
2. **Teachers** — Add/edit/delete teachers, assign subjects
3. **Students** — List all students, add new, search, delete, reset passwords
4. **Charts** — Pass/Fail doughnut + Grade Distribution bar + Top 15 Students + Attendance-Grade Correlation scatter
5. **School Report** — Full printable report with PDF download
6. **Change Password** — Secure password update form
7. **Notices** — Post and delete announcements
8. **Activity Log** — Full audit trail of all system actions
9. **Parents** — Add/delete parent accounts, link/unlink students
10. **Biometrics** — Register/remove WebAuthn credentials

---

### dashboard_teacher.html

**Tabs:**
1. **Overview** — Stats cards + At-Risk alert panel + Student cards grid
2. **Students** — Full student list with search, PDF export
3. **Add Grade** — Grade entry form with subject dropdown, term selector, comment field, bulk CSV import
4. **Gradebook** — A cross-tabulation matrix: students × subjects, showing each grade's percentage and CBC level
5. **Attendance** — Mark daily attendance (Present/Absent/Late) with bulk "All Present/Absent" buttons; view attendance history
6. **Charts** — Pass/Fail doughnut + Grade Distribution bar + Student Averages bar + Attendance-Grade Correlation scatter
7. **Change Password**
8. **Biometrics**

---

### dashboard_student.html

**Tabs:**
1. **My Grades** — Stats cards (average, status, subjects, total grades, **class rank**, **top percentile**) + **Term 3 Prediction card** + Grade table grouped by subject with progress bars and Feedback Thread buttons
2. **Attendance** — Attendance summary stats + full attendance history table
3. **Charts** — Subject cards grid + Bar chart + Radar chart + Timeline chart + Progress by Term chart
4. **Report Card** — Formatted report with PDF download button
5. **Change Password**
6. **Biometrics**

---

### dashboard_parent.html

**Structure:** Simpler than other dashboards. Shows a dropdown of linked children. When a child is selected, loads their grades (grouped by subject) and attendance summary.

---

## Frontend — JavaScript Functions (per dashboard)

### Universal Patterns (all dashboards)

```javascript
async function api(method, url, body = null) {
    const opts = { method, headers: { "Content-Type": "application/json" } };
    if (body) opts.body = JSON.stringify(body);
    const res  = await fetch(url, opts);
    return res.json();
}
```
A shared helper that wraps `fetch()` to reduce boilerplate on every API call. Used throughout all dashboards.

```javascript
function escHtml(str) {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
```
Escapes HTML special characters before inserting any server-provided string into `innerHTML`. This prevents XSS (Cross-Site Scripting) attacks — if a student's name contained `<script>`, it would be displayed as text rather than executed.

```javascript
function showToast(msg, type="success") {
    const t = document.getElementById("toast");
    t.textContent = msg; t.className = "toast " + type + " show";
    setTimeout(() => { t.className = "toast"; }, 3000);
}
```
Shows the bottom notification for 3 seconds, then removes the `show` class to trigger the fade-out CSS transition.

**Tab switching:**
```javascript
document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(s => s.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
        if (btn.dataset.tab === "charts") loadCharts();
        // ... other lazy-load triggers
    });
});
```
Tab content is loaded lazily — `loadCharts()` is only called when the Charts tab is clicked, not on page load. This avoids making unnecessary API calls for tabs the user never opens.

**Auto-logout on tab close:**
```javascript
window.addEventListener('pagehide', function(e) {
    if (!e.persisted) {
        navigator.sendBeacon('/api/logout', new Blob([JSON.stringify({})], { type: 'application/json' }));
    }
});
```
Uses `navigator.sendBeacon()` to send a logout request even as the page is unloading. `sendBeacon` is designed for this use case — it queues the request and sends it reliably even when the page is being closed. `e.persisted` is true for back/forward cache navigations; we skip logout in that case.

**Auto-logout after 30 minutes hidden:**
```javascript
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') { hiddenSince = Date.now(); }
    else if (document.visibilityState === 'visible') {
        const minutesHidden = (Date.now() - hiddenSince) / 1000 / 60;
        if (minutesHidden >= 30) { fetch('/api/logout', ...).finally(() => window.location.href = '/login'); }
    }
});
```
If a user leaves the tab open for more than 30 minutes and comes back, they are logged out. Uses the Page Visibility API.

**Dark/Light mode toggle:**
```javascript
const savedTheme = localStorage.getItem("gv-theme") || "dark";
if (savedTheme === "light") { document.body.classList.add("light"); }
themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("light");
    localStorage.setItem("gv-theme", isLight ? "light" : "dark");
});
```
Persists the user's theme preference in `localStorage` so it survives page reloads and browser restarts.

### NEW: `loadAtRiskStudents()` (Teacher & Admin)

```javascript
async function loadAtRiskStudents() {
    const students = await api("GET", "/api/at-risk-students");
    if (!students.length) { panel.style.display = "none"; return; }
    panel.style.display = "block";
    badge.textContent = students.length;
```
If no students are at risk, the panel stays hidden — it only appears when there is something actionable. The badge shows the count of flagged students.

```javascript
    list.innerHTML = students.map(s => `
        <div style="...">
            ${s.reasons.map(r => `<span class="reason-tag">${escHtml(r)}</span>`).join("")}
        </div>`).join("");
```
Each at-risk student is rendered as a card with their name, email, latest average, CBC status, and one or more reason tags explaining why they were flagged.

### NEW: `loadMyRank()` (Student)

```javascript
async function loadMyRank() {
    const data = await res.json();
    if (data.rank === null) return;    // No grades yet — don't update the card
    document.getElementById("val-rank").textContent      = `${data.rank} / ${data.total}`;
    document.getElementById("val-percentile").textContent = `Top ${100 - data.percentile}%`;
```
Converts the raw percentile (e.g. 95 = top 95%) to a "Top X%" display by subtracting from 100 (top 5% means "better than 95% of students" but is displayed as "Top 5%").

```javascript
    if (data.percentile >= 75) { rankCard.classList.add("green"); ... }
    else if (data.percentile < 40) { rankCard.classList.add("red"); ... }
```
Cards go green for the top 25% and red for the bottom 40%, giving immediate visual feedback.

### NEW: `loadMyPrediction()` (Student)

```javascript
async function loadMyPrediction() {
    const data = await res.json();
    if (!data.prediction) { card.style.display = "none"; return; }
    card.style.display = "block";
    document.getElementById("pred-score").textContent = data.prediction.toFixed(1) + "%";
```
Shows the card only when a prediction is available. Uses `toFixed(1)` for consistent one-decimal display.

```javascript
    const trendMap = {
        improving: { label: "↑ Improving", bg: "rgba(34,197,94,0.15)", ..., color: "var(--green)" },
        declining: { label: "↓ Declining", ..., color: "var(--red)" },
        stable:    { label: "→ Stable",    ..., color: "var(--accent)" }
    };
    const t = trendMap[data.trend] || trendMap.stable;
    trendBadge.textContent = t.label;
    trendBadge.style.cssText += `background:${t.bg};border:1px solid ${t.border};color:${t.color}`;
```
Applies trend-specific styling inline. Unicode arrow characters (↑ ↓ →) provide immediate directional signal without needing icons.

### Correlation Chart (Teacher & Admin Charts tab)

```javascript
correlationChart = new Chart(document.getElementById("chart-correlation"), {
    type: "scatter",
    data: {
        datasets: [{
            data: corrData.map(d => ({ x: d.attendance_pct, y: d.grade_avg, name: d.name })),
            backgroundColor: corrData.map(d => d.grade_avg >= 50 ? "rgba(34,197,94,0.75)" : "rgba(239,68,68,0.75)"),
        }]
    },
    options: {
        plugins: {
            tooltip: { callbacks: { label: ctx => `${ctx.raw.name}: ${ctx.raw.x}% attendance, ${ctx.raw.y}% grade` } }
        },
        scales: {
            x: { title: { display: true, text: "Attendance %" }, min: 0, max: 100 },
            y: { title: { display: true, text: "Grade Average %" }, min: 0, max: 100 }
        }
    }
});
```
Creates a scatter plot where each point's X coordinate is attendance rate and Y is grade average. Points are green if the student is passing (≥50%) and red if failing. The custom tooltip callback includes the student's name when hovering over a dot.

The `name` field is stored in the data point itself (`ctx.raw.name`) as a workaround — Chart.js scatter datasets don't have labels per point, so the name travels with the data.

### PDF Generation (jsPDF)

```javascript
async function downloadReportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18); doc.setFont("helvetica","bold");
    doc.text("GradeVault - Report Card", 14, 20);
    // ... builds the PDF line by line with coordinates
    doc.save("report-card.pdf");
}
```
Uses the jsPDF library to generate PDFs entirely in the browser (no server needed). The PDF is constructed by calling positioning methods like `doc.text(string, x, y)` where x/y are in millimeters from the top-left corner. Pages are added automatically with `doc.addPage()` when content overflows.

### Gradebook (Teacher)

```javascript
const lookup = {};
students.forEach(s => {
    lookup[s.id] = {};
    if (s.grades) s.grades.forEach(g => {
        lookup[s.id][g.subject] = Math.round((g.grade / g.max_grade) * 100);
    });
});
```
Builds a 2D lookup table `[studentId][subject] = percentageScore` for O(1) cell rendering in the matrix table. Without this, rendering would require nested loops through the grade arrays for every cell.

### WebAuthn / Biometrics

```javascript
function b64urlToBuffer(b) { ... }
function bufferToB64url(buf) { ... }
```
WebAuthn uses `ArrayBuffer` for binary data, but JSON can only transmit strings. These two functions convert between Base64URL-encoded strings (safe for JSON) and `ArrayBuffer` (required by the WebAuthn API).

```javascript
const opts = await fetch('/api/webauthn/register/begin', { method: 'POST' });
const cred = await navigator.credentials.create({ publicKey: opts });
await fetch('/api/webauthn/register/complete', { method: 'POST', body: JSON.stringify(cred) });
```
The registration flow is a two-step challenge-response:
1. Server generates a random challenge and returns registration options
2. Browser prompts for biometric (Touch ID / Windows Hello / etc.)
3. Browser creates a signed credential and returns it to the server
4. Server verifies the signature and stores the public key

---

## Security Model

| Threat | Mitigation |
|---|---|
| Unauthorized page access | Every dashboard route checks `get_current_user()` and role before rendering |
| Unauthorized API access | Every API endpoint checks the session and role; returns 403 if unauthorized |
| SQL injection | All user-supplied values use `%s` parameterized queries. F-string queries only insert `%s` placeholder counts (never raw user data) |
| XSS | All server-provided strings are passed through `escHtml()` before insertion into `innerHTML` |
| CSRF | `SESSION_COOKIE_SAMESITE = "Lax"` prevents cross-site form submissions from carrying the session cookie |
| Session theft | `SESSION_COOKIE_HTTPONLY = True` prevents JavaScript from reading the session cookie |
| Password storage | Werkzeug PBKDF2-HMAC-SHA256 with random salt; passwords are never stored in plain text |
| Token prediction | Password reset tokens use `secrets.token_urlsafe(48)` — 48 bytes = 384 bits of entropy, cryptographically unpredictable |
| Email enumeration | Forgot-password endpoint always returns the same message regardless of whether the email exists |
| Cross-user data access | Parent grade/attendance endpoints verify the parent-student link before returning data |
| Student data leakage | Student endpoints check that the session user's email matches the student record |

---

## Deployment Guide (Render)

### Step 1 — Create a PostgreSQL Database on Render
1. In your Render dashboard, click **New → PostgreSQL**
2. Choose a name (e.g. `gradevault-db`) and the free plan
3. After creation, copy the **Internal Database URL** from the Info tab

### Step 2 — Create a Web Service on Render
1. Click **New → Web Service**
2. Connect your GitHub repository (or use the existing connected repo)
3. Set:
   - **Environment:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python app.py`

### Step 3 — Set Environment Variables
In the web service's **Environment** tab, add:

| Key | Value |
|---|---|
| `DATABASE_URL` | Paste the Internal Database URL from Step 1 |
| `BREVO_API_KEY` | Your Brevo API key |
| `APP_BASE_URL` | `https://your-app-name.onrender.com` |
| `MAIL_FROM` | Your verified sender email in Brevo |

### Step 4 — Deploy
Click **Deploy**. Render will:
1. Install Python packages from `requirements.txt`
2. Run `python app.py`
3. Flask calls `init_db()` on startup, creating all tables
4. The default admin account is created: **username:** `admin`, **password:** `admin123`

### Step 5 — First Login
1. Navigate to your Render URL
2. Log in with `admin` / `admin123`
3. **Immediately change the admin password** in the Change Password tab

### Keeping the Free Tier Alive
Render's free tier spins down after 15 minutes of inactivity. The first request after a spin-down takes ~30 seconds. Consider using a free uptime monitor (e.g. UptimeRobot) to ping the URL every 14 minutes.

---

*Documentation generated for GradeVault v2.0 — 2026-04-30*
