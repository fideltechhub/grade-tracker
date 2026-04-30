# ============================================================
# app.py — GradeVault Backend (PostgreSQL version)
# ============================================================

import sys
import logging
# Force unbuffered output so logs appear in Render immediately
logging.basicConfig(level=logging.INFO, stream=sys.stderr, force=True)

from flask import Flask, request, jsonify, render_template, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
import psycopg2
import psycopg2.extras
import re
import os
import secrets
import requests
import csv
import io
from datetime import datetime, timedelta

app = Flask(__name__)
app.secret_key = "gradevault_secret_key_2024"

# Session survives refresh but expires after 8 hours of inactivity
app.config["SESSION_PERMANENT"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True

@app.route("/test-email")
def test_email():
    try:
        send_reset_email("fidelclinton4@gmail.com", "testtoken123")
        return "EMAIL SENT OK"
    except Exception as e:
        return f"EMAIL FAILED: {type(e).__name__}: {e}"

# ============================================================
# EMAIL CONFIG (Gmail SMTP)
# ============================================================
BREVO_API_KEY = os.environ.get("BREVO_API_KEY")
MAIL_FROM     = os.environ.get("MAIL_FROM", "fidelclinton4@gmail.com")
MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "GradeVault")
APP_BASE_URL  = os.environ.get("APP_BASE_URL", "https://grade-tracker-pq0y.onrender.com")

def send_reset_email(to_email, token):
    """Send password reset email via Brevo HTTP API."""
    reset_link = f"{APP_BASE_URL}/reset-password?token={token}"

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0f1117;color:#f0f0f0;border-radius:12px;padding:2rem">
      <h2 style="color:#f5c518;margin-bottom:0.5rem">Password Reset</h2>
      <p style="color:#aaa;margin-bottom:1.5rem">You requested a password reset for your GradeVault account.</p>
      <a href="{reset_link}" style="display:inline-block;background:#f5c518;color:#0f1117;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:1rem">Reset My Password</a>
      <p style="color:#666;font-size:0.8rem;margin-top:1.5rem">This link expires in <strong style="color:#aaa">30 minutes</strong>. If you didn't request this, ignore this email.</p>
      <p style="color:#888;font-size:0.75rem;margin-top:0.5rem">Or copy this link: {reset_link}</p>
      <p style="color:#444;font-size:0.75rem;margin-top:1rem">— GradeVault System</p>
    </div>
    """

    logging.info(f"[EMAIL DEBUG] Attempting to send to: {to_email}")
    logging.info(f"[EMAIL DEBUG] Reset link: {reset_link}")
    logging.info(f"[EMAIL DEBUG] BREVO_API_KEY set: {'yes' if BREVO_API_KEY else 'NO - EMPTY!'}")

    payload = {
        "sender": {"name": MAIL_FROM_NAME, "email": MAIL_FROM},
        "to": [{"email": to_email}],
        "subject": "GradeVault — Password Reset Request",
        "htmlContent": html,
        "textContent": f"Reset your GradeVault password: {reset_link}\n\nExpires in 30 minutes."
    }

    response = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={
            "accept": "application/json",
            "api-key": BREVO_API_KEY,
            "content-type": "application/json"
        },
        json=payload,
        timeout=20
    )

    logging.info(f"[EMAIL DEBUG] Brevo response: {response.status_code} {response.text}")

    if response.status_code not in (200, 201):
        raise Exception(f"Brevo API error {response.status_code}: {response.text}")

    logging.info(f"[EMAIL DEBUG] Email sent successfully to {to_email}")

# ============================================================
# DATABASE HELPERS
# ============================================================

def get_db():
    """Opens a connection to the PostgreSQL database."""
    conn = psycopg2.connect(
        os.environ.get("DATABASE_URL"),
        cursor_factory=psycopg2.extras.RealDictCursor  # returns rows as dicts like sqlite
    )
    return conn


def init_db():
    """Creates all tables if they don't exist."""
    conn = get_db()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            fullname TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            subject TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Students table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # Grades table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS grades (
            id SERIAL PRIMARY KEY,
            student_id INTEGER NOT NULL,
            subject TEXT NOT NULL,
            grade REAL NOT NULL,
            max_grade REAL DEFAULT 100,
            comment TEXT,
            teacher_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
            FOREIGN KEY (teacher_id) REFERENCES users(id)
        )
    """)

    # Add comment column if it doesn't exist (for existing databases)
    cursor.execute("""
        ALTER TABLE grades ADD COLUMN IF NOT EXISTS comment TEXT
    """)

    # Password reset tokens table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            token TEXT UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Announcements table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS announcements (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            message TEXT,
            author_name TEXT NOT NULL,
            created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Add term column to grades if it doesn't exist
    cursor.execute("""
        ALTER TABLE grades ADD COLUMN IF NOT EXISTS term TEXT DEFAULT 'Term 1'
    """)

    # Activity log table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_log (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            user_name TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Grade feedback table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS grade_feedback (
            id SERIAL PRIMARY KEY,
            grade_id INTEGER REFERENCES grades(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            author_name TEXT NOT NULL,
            role TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Attendance table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id SERIAL PRIMARY KEY,
            student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'Present',
            term TEXT DEFAULT 'Term 1',
            marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(student_id, date)
        )
    """)

    # Parent-student link table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS parent_students (
            id SERIAL PRIMARY KEY,
            parent_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(parent_id, student_id)
        )
    """)

    conn.commit()

    # Create default admin if none exists
    cursor.execute("SELECT id FROM users WHERE role = 'admin'")
    existing_admin = cursor.fetchone()
    if not existing_admin:
        cursor.execute("""
            INSERT INTO users (fullname, username, email, password, role)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            "Administrator",
            "admin",
            "admin@gradevault.com",
            generate_password_hash("admin123"),
            "admin"
        ))
        conn.commit()
        print("Default admin created → username: admin | password: admin123")

    cursor.close()
    conn.close()


# ============================================================
# HELPER — check if user is logged in
# ============================================================

def get_current_user():
    """Returns the logged in user from the session, or None."""
    user_id = session.get("user_id")
    if not user_id:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    return user


# ============================================================
# CBC GRADING HELPER
# ============================================================

# CBC subjects preset list
# Kenya CBC Junior Secondary School (Grade 7–9) subjects
CBC_SUBJECTS = [
    "English",
    "Kiswahili",
    "Mathematics",
    "Integrated Science",
    "Social Studies",
    "Religious Education (CRE)",
    "Religious Education (IRE)",
    "Religious Education (HRE)",
    "Pre-Technical Studies",
    "Business Studies",
    "Computer Studies",
    "Agriculture",
    "Nutrition & Home Science",
    "Creative Arts & Sports"
]

TERMS = ["Term 1", "Term 2", "Term 3"]


def log_activity(user, action, details=""):
    """Log an activity to the activity_log table."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO activity_log (user_id, user_name, action, details) VALUES (%s, %s, %s, %s)",
            (user["id"], user["fullname"], action, details or None)
        )
        conn.commit()
        cursor.close()
        conn.close()
    except Exception as e:
        logging.error(f"[ACTIVITY LOG ERROR] {e}")


def cbc_status(average):
    """Return CBC performance level based on percentage average."""
    if average is None:
        return "No Grades"
    if average >= 75:
        return "EE"   # Exceeds Expectation
    elif average >= 50:
        return "ME"   # Meets Expectation
    elif average >= 25:
        return "AE"   # Approaches Expectation
    else:
        return "BE"   # Below Expectation


# ============================================================
# PAGE ROUTES
# ============================================================

@app.route("/")
def home():
    user = get_current_user()
    if user:
        role_map = {"admin": "admin_dashboard", "teacher": "teacher_dashboard",
                    "student": "student_dashboard", "parent": "parent_dashboard"}
        return redirect(url_for(role_map.get(user["role"], "login_page")))
    return redirect(url_for("login_page"))


# ============================================================
# PASSWORD RESET ROUTES
# ============================================================

@app.route("/forgot-password")
def forgot_password_page():
    return render_template("forgot_password.html")

@app.route("/reset-password")
def reset_password_page():
    token = request.args.get("token", "")
    return render_template("reset_password.html", token=token)

@app.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    data  = request.get_json()
    email = data.get("email", "").strip().lower()
    logging.info(f"[RESET] Forgot password request for: {email}")
    if not email:
        return jsonify({"error": "Email is required"}), 400

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, fullname, email FROM users WHERE LOWER(email) = %s", (email,))
    user = cursor.fetchone()

    if not user:
        logging.info(f"[RESET] No user found for email: {email}")
        cursor.close(); conn.close()
        return jsonify({"message": "If that email exists, a reset link has been sent."})

    logging.info(f"[RESET] User found: {user['fullname']} ({user['email']})")

    # Generate secure token, expires in 30 minutes
    token      = secrets.token_urlsafe(48)
    expires_at = datetime.utcnow() + timedelta(minutes=30)

    # Invalidate any existing tokens for this user
    cursor.execute("UPDATE password_reset_tokens SET used = TRUE WHERE user_id = %s AND used = FALSE", (user["id"],))
    cursor.execute(
        "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (user["id"], token, expires_at)
    )
    conn.commit()
    cursor.close(); conn.close()

    logging.info(f"[RESET] Token generated, attempting to send email to {user['email']}")
    try:
        send_reset_email(user["email"], token)
        logging.info(f"[RESET] Email sent successfully to {user['email']}")
    except Exception as e:
        logging.error(f"[EMAIL ERROR] {type(e).__name__}: {e}")
        return jsonify({"error": f"Email failed: {str(e)}"}), 500

    return jsonify({"message": "If that email exists, a reset link has been sent."})


@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    data     = request.get_json()
    token    = data.get("token", "").strip()
    password = data.get("password", "")

    if not token or not password:
        return jsonify({"error": "Token and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT t.id, t.user_id, t.expires_at, t.used
        FROM password_reset_tokens t
        WHERE t.token = %s
    """, (token,))
    record = cursor.fetchone()

    if not record:
        cursor.close(); conn.close()
        return jsonify({"error": "Invalid or expired reset link."}), 400
    if record["used"]:
        cursor.close(); conn.close()
        return jsonify({"error": "This reset link has already been used."}), 400
    if datetime.utcnow() > record["expires_at"]:
        cursor.close(); conn.close()
        return jsonify({"error": "This reset link has expired. Please request a new one."}), 400

    # Update password and mark token as used
    cursor.execute(
        "UPDATE users SET password = %s WHERE id = %s",
        (generate_password_hash(password), record["user_id"])
    )
    cursor.execute("UPDATE password_reset_tokens SET used = TRUE WHERE id = %s", (record["id"],))
    conn.commit()
    cursor.close(); conn.close()

    return jsonify({"message": "Password reset successfully! You can now log in."})


@app.route("/login")
def login_page():
    return render_template("login.html")


@app.route("/register")
def register_page():
    return render_template("register.html")


@app.route("/dashboard/admin")
def admin_dashboard():
    user = get_current_user()
    if not user or user["role"] != "admin":
        return redirect(url_for("login_page"))
    return render_template("dashboard_admin.html", user=dict(user))


@app.route("/dashboard/teacher")
def teacher_dashboard():
    user = get_current_user()
    if not user or user["role"] != "teacher":
        return redirect(url_for("login_page"))
    return render_template("dashboard_teacher.html", user=dict(user))


@app.route("/dashboard/student")
def student_dashboard():
    user = get_current_user()
    if not user or user["role"] != "student":
        return redirect(url_for("login_page"))
    return render_template("dashboard_student.html", user=dict(user))


@app.route("/dashboard/parent")
def parent_dashboard():
    user = get_current_user()
    if not user or user["role"] != "parent":
        return redirect(url_for("login_page"))
    return render_template("dashboard_parent.html", user=dict(user))


# ============================================================
# AUTH API ENDPOINTS
# ============================================================

@app.route("/api/login", methods=["POST"])
def api_login():
    data     = request.get_json()
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Please enter both username and password"}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()

    if not user or not check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid username or password"}), 401

    session.permanent = True
    session["user_id"] = user["id"]
    session["role"]    = user["role"]

    log_activity(dict(user), "Logged in", user["role"])

    redirects = {
        "admin":   "/dashboard/admin",
        "teacher": "/dashboard/teacher",
        "student": "/dashboard/student",
        "parent":  "/dashboard/parent"
    }

    return jsonify({
        "message":  "Login successful",
        "role":     user["role"],
        "fullname": user["fullname"],
        "redirect": redirects[user["role"]]
    })


@app.route("/api/register", methods=["POST"])
def api_register():
    data     = request.get_json()
    fullname = data.get("fullname", "").strip()
    username = data.get("username", "").strip()
    email    = data.get("email", "").strip()
    password = data.get("password", "")

    if not fullname or not username or not email or not password:
        return jsonify({"error": "All fields are required"}), 400

    email_regex = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    if not re.match(email_regex, email):
        return jsonify({"error": "Please enter a valid email address"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if len(fullname) > 32:
        return jsonify({"error": "Full name must be 32 characters or less"}), 400
    if len(username) > 32:
        return jsonify({"error": "Username must be 32 characters or less"}), 400

    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (fullname, username, email, password, role)
            VALUES (%s, %s, %s, %s, 'student')
        """, (fullname, username, email, generate_password_hash(password)))

        cursor.execute("""
            INSERT INTO students (name, email) VALUES (%s, %s)
        """, (fullname, email))

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"message": "Account created successfully"}), 201

    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        return jsonify({"error": "Username or email already exists"}), 409


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"message": "Logged out"})


@app.route("/api/change-password", methods=["POST"])
def change_password():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 403

    data             = request.get_json()
    current_password = data.get("current_password", "")
    new_password     = data.get("new_password", "")

    if not current_password or not new_password:
        return jsonify({"error": "All fields are required"}), 400

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400

    if not check_password_hash(user["password"], current_password):
        return jsonify({"error": "Current password is incorrect"}), 401

    if check_password_hash(user["password"], new_password):
        return jsonify({"error": "New password must be different from current password"}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET password = %s WHERE id = %s",
        (generate_password_hash(new_password), user["id"])
    )
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({"message": "Password updated successfully"})


# ============================================================
# ADMIN API ENDPOINTS
# ============================================================

@app.route("/api/cbc-subjects", methods=["GET"])
def get_cbc_subjects():
    return jsonify(CBC_SUBJECTS)


@app.route("/api/admin/teachers", methods=["GET"])
def get_teachers():
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE role = 'teacher' ORDER BY fullname")
    teachers = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify([dict(t) for t in teachers])


@app.route("/api/admin/teachers", methods=["POST"])
def add_teacher():
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data     = request.get_json()
    fullname = data.get("fullname", "").strip()
    username = data.get("username", "").strip()
    email    = data.get("email", "").strip()
    password = data.get("password", "")
    subject  = data.get("subject", "").strip()

    if not fullname or not username or not email or not password:
        return jsonify({"error": "All fields are required"}), 400

    # Validate at least one subject selected
    subject_list = [s.strip() for s in subject.split(",") if s.strip()]
    if not subject_list:
        return jsonify({"error": "Please select at least one subject"}), 400
    subject = ",".join(subject_list)  # normalise

    if len(fullname) > 32:
        return jsonify({"error": "Full name must be 32 characters or less"}), 400
    if len(username) > 32:
        return jsonify({"error": "Username must be 32 characters or less"}), 400

    email_regex = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    if not re.match(email_regex, email):
        return jsonify({"error": "Please enter a valid email address"}), 400

    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (fullname, username, email, password, role, subject)
            VALUES (%s, %s, %s, %s, 'teacher', %s)
        """, (fullname, username, email, generate_password_hash(password), subject))
        conn.commit()
        cursor.close()
        conn.close()
        log_activity(user, "Added teacher", f"{fullname} ({username})")
        return jsonify({"message": "Teacher added"}), 201
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        return jsonify({"error": "Username or email already exists"}), 409


@app.route("/api/admin/teachers/<int:teacher_id>/subjects", methods=["PATCH"])
def update_teacher_subjects(teacher_id):
    """Update subjects assigned to a teacher — admin only."""
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data = request.get_json()
    subject = data.get("subject", "").strip()

    # Validate at least one subject
    subject_list = [s.strip() for s in subject.split(",") if s.strip()]
    if not subject_list:
        return jsonify({"error": "Please select at least one subject"}), 400

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE id = %s AND role = 'teacher'", (teacher_id,))
    if not cursor.fetchone():
        cursor.close()
        conn.close()
        return jsonify({"error": "Teacher not found"}), 404

    cursor.execute(
        "UPDATE users SET subject = %s WHERE id = %s AND role = 'teacher'",
        (",".join(subject_list), teacher_id)
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"message": "Subjects updated successfully"})


@app.route("/api/admin/teachers/<int:teacher_id>", methods=["DELETE"])
def delete_teacher(teacher_id):
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = %s AND role = 'teacher'", (teacher_id,))
    conn.commit()
    cursor.close()
    conn.close()
    log_activity(user, "Deleted teacher", f"Teacher #{teacher_id}")
    return jsonify({"message": "Teacher deleted"})


@app.route("/api/admin/stats", methods=["GET"])
def admin_stats():
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as c FROM students")
    total_students = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) as c FROM users WHERE role='teacher'")
    total_teachers = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) as c FROM grades")
    total_grades = cursor.fetchone()["c"]
    cursor.execute("SELECT grade FROM grades")
    grades = [g["grade"] for g in cursor.fetchall()]
    overall_avg = round(sum(grades) / len(grades), 2) if grades else 0
    cursor.close()
    conn.close()

    return jsonify({
        "total_students":  total_students,
        "total_teachers":  total_teachers,
        "total_grades":    total_grades,
        "overall_average": overall_avg
    })


@app.route("/api/admin/users/<int:user_id>/reset-password", methods=["POST"])
def reset_user_password(user_id):
    admin = get_current_user()
    if not admin or admin["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
    target_user = cursor.fetchone()

    if not target_user:
        cursor.close()
        conn.close()
        return jsonify({"error": "User not found"}), 404

    new_password = target_user["username"]
    cursor.execute("UPDATE users SET password = %s WHERE id = %s",
                   (generate_password_hash(new_password), user_id))
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({
        "message":      "Password reset successfully",
        "new_password": new_password
    })


@app.route("/api/admin/reset-student-password", methods=["POST"])
def reset_student_password():
    admin = get_current_user()
    if not admin or admin["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data  = request.get_json()
    email = data.get("email", "").strip()

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cursor.fetchone()

    if not user:
        cursor.close()
        conn.close()
        return jsonify({"error": "User not found"}), 404

    new_password = user["username"]
    cursor.execute("UPDATE users SET password = %s WHERE email = %s",
                   (generate_password_hash(new_password), email))
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({
        "message":      "Password reset successfully",
        "new_password": new_password
    })


# ============================================================
# STUDENT & GRADE API ENDPOINTS
# ============================================================

@app.route("/api/students", methods=["GET"])
def get_students():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM students ORDER BY name")
    students = cursor.fetchall()

    # For teachers with multiple subjects, split and filter by any of their subjects
    teacher_subjects = [s.strip() for s in user["subject"].split(",")] if user.get("subject") else []
    term_filter = request.args.get("term", "").strip()

    result = []
    for s in students:
        params = [s["id"]]
        conds  = ["student_id = %s"]
        if user["role"] == "teacher" and teacher_subjects:
            placeholders = ",".join(["%s"] * len(teacher_subjects))
            conds.append(f"subject IN ({placeholders})")
            params += teacher_subjects
        if term_filter:
            conds.append("term = %s")
            params.append(term_filter)
        cursor.execute(f"SELECT * FROM grades WHERE {' AND '.join(conds)}", params)

        grade_list = [dict(g) for g in cursor.fetchall()]
        avg    = round(sum(g["grade"] for g in grade_list) / len(grade_list), 2) if grade_list else None
        status = cbc_status(avg)

        result.append({
            "id": s["id"], "name": s["name"], "email": s["email"],
            "grades": grade_list, "average": avg, "status": status
        })

    cursor.close()
    conn.close()
    return jsonify(result)


@app.route("/api/students", methods=["POST"])
def add_student():
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    data  = request.get_json()
    name  = data.get("name", "").strip()
    email = data.get("email", "").strip()

    if not name or not email:
        return jsonify({"error": "Name and email are required"}), 400

    username         = email.split("@")[0]
    default_password = generate_password_hash(username)

    try:
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM users WHERE email = %s OR username = %s", (email, username))
        existing_user = cursor.fetchone()

        if not existing_user:
            cursor.execute("""
                INSERT INTO users (fullname, username, email, password, role)
                VALUES (%s, %s, %s, %s, 'student')
            """, (name, username, email, default_password))

        cursor.execute("INSERT INTO students (name, email) VALUES (%s, %s)", (name, email))
        conn.commit()

        cursor.execute("SELECT * FROM students WHERE email = %s", (email,))
        student = cursor.fetchone()
        cursor.close()
        conn.close()

        return jsonify({
            "message":    "Student added",
            "student":    dict(student),
            "login_info": {"username": username, "password": username}
        }), 201

    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        return jsonify({"error": "Email already exists"}), 409


@app.route("/api/students/<int:student_id>", methods=["DELETE"])
def delete_student(student_id):
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM grades WHERE student_id = %s", (student_id,))
    cursor.execute("DELETE FROM students WHERE id = %s", (student_id,))
    conn.commit()
    cursor.close()
    conn.close()
    log_activity(user, "Deleted student", f"Student #{student_id}")
    return jsonify({"message": "Student deleted"})


@app.route("/api/grades", methods=["POST"])
def add_grade():
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    data       = request.get_json()
    student_id = data.get("student_id")
    subject    = data.get("subject", "").strip()
    grade      = data.get("grade")
    max_grade  = data.get("max_grade", 100)
    comment    = data.get("comment", "").strip() if data.get("comment") else None
    term       = data.get("term", "Term 1").strip() or "Term 1"

    if not student_id or not subject or grade is None:
        return jsonify({"error": "student_id, subject, and grade are required"}), 400

    if comment and len(comment) > 500:
        return jsonify({"error": "Comment must be 500 characters or less"}), 400

    if not (0 <= float(grade) <= float(max_grade)):
        return jsonify({"error": "Grade must be between 0 and max_grade"}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Prevent teachers from adding duplicate subject grade for same student
    if user["role"] == "teacher":
        cursor.execute("""
            SELECT id FROM grades
            WHERE student_id = %s AND subject = %s AND teacher_id = %s
        """, (student_id, subject, user["id"]))
        existing = cursor.fetchone()
        if existing:
            cursor.close()
            conn.close()
            return jsonify({"error": f"You have already added a grade for '{subject}' for this student. Please use the edit option to update it."}), 409

    cursor.execute("""
        INSERT INTO grades (student_id, subject, grade, max_grade, comment, teacher_id, term)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (student_id, subject, grade, max_grade, comment, user["id"], term))
    conn.commit()
    cursor.close()
    conn.close()
    log_activity(user, "Added grade", f"{subject} for student #{student_id} ({term})")
    return jsonify({"message": "Grade added"}), 201

@app.route("/api/grades/<int:grade_id>", methods=["DELETE"])
def delete_grade(grade_id):
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM grades WHERE id = %s", (grade_id,))
    conn.commit()
    cursor.close()
    conn.close()
    log_activity(user, "Deleted grade", f"Grade #{grade_id}")
    return jsonify({"message": "Grade deleted"})


@app.route("/api/stats", methods=["GET"])
def get_stats():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db()
    cursor = conn.cursor()

    # For teachers, scope stats to their subjects only
    teacher_subjects = []
    if user["role"] == "teacher" and user.get("subject"):
        teacher_subjects = [s.strip() for s in user["subject"].split(",") if s.strip()]

    cursor.execute("SELECT COUNT(*) as c FROM students")
    total_students = cursor.fetchone()["c"]

    if teacher_subjects:
        placeholders = ",".join(["%s"] * len(teacher_subjects))
        cursor.execute(f"SELECT grade FROM grades WHERE subject IN ({placeholders})", teacher_subjects)
    else:
        cursor.execute("SELECT grade FROM grades")
    grades = [g["grade"] for g in cursor.fetchall()]
    overall_avg = round(sum(grades) / len(grades), 2) if grades else 0

    if teacher_subjects:
        placeholders = ",".join(["%s"] * len(teacher_subjects))
        cursor.execute(f"""
            SELECT COUNT(*) as c FROM (
                SELECT student_id, AVG(grade) as avg FROM grades
                WHERE subject IN ({placeholders})
                GROUP BY student_id HAVING AVG(grade) >= 50
            ) sub
        """, teacher_subjects)
    else:
        cursor.execute("""
            SELECT COUNT(*) as c FROM (
                SELECT student_id, AVG(grade) as avg FROM grades
                GROUP BY student_id HAVING AVG(grade) >= 50
            ) sub
        """)
    meeting = cursor.fetchone()["c"]
    cursor.close()
    conn.close()

    return jsonify({
        "total_students":    total_students,
        "overall_average":   overall_avg,
        "meeting_students":  meeting,
        "below_students":    total_students - meeting
    })


@app.route("/api/my-grades", methods=["GET"])
def my_grades():
    user = get_current_user()
    if not user or user["role"] != "student":
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM students WHERE email = %s", (user["email"],))
    student = cursor.fetchone()

    if not student:
        cursor.close()
        conn.close()
        return jsonify({"grades": [], "average": None, "status": "No Grades"})

    term_filter = request.args.get("term", "").strip()
    if term_filter:
        cursor.execute("SELECT * FROM grades WHERE student_id = %s AND term = %s", (student["id"], term_filter))
    else:
        cursor.execute("SELECT * FROM grades WHERE student_id = %s", (student["id"],))
    grade_list = [dict(g) for g in cursor.fetchall()]
    avg    = round(sum(g["grade"] for g in grade_list) / len(grade_list), 2) if grade_list else None
    status = cbc_status(avg)

    cursor.close()
    conn.close()
    return jsonify({
        "student": dict(student),
        "grades":  grade_list,
        "average": avg,
        "status":  status
    })


# ============================================================
# EDIT GRADE
# ============================================================

@app.route("/api/grades/<int:grade_id>", methods=["PUT"])
def edit_grade(grade_id):
    """Edit an existing grade — teachers and admin only."""
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    data      = request.get_json()
    grade     = data.get("grade")
    max_grade = data.get("max_grade")
    subject   = data.get("subject", "").strip()
    comment   = data.get("comment")  # None means "don't change", "" means "clear it"

    if grade is None:
        return jsonify({"error": "Grade is required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Verify grade exists
    cursor.execute("SELECT * FROM grades WHERE id = %s", (grade_id,))
    existing = cursor.fetchone()
    if not existing:
        cursor.close()
        conn.close()
        return jsonify({"error": "Grade not found"}), 404

    # Build update query dynamically
    updates = ["grade = %s"]
    values  = [grade]
    if max_grade is not None:
        updates.append("max_grade = %s")
        values.append(max_grade)
    if subject:
        updates.append("subject = %s")
        values.append(subject)
    if comment is not None:
        updates.append("comment = %s")
        stripped = comment.strip() if comment else None
        if stripped and len(stripped) > 500:
            cursor.close()
            conn.close()
            return jsonify({"error": "Comment must be 500 characters or less"}), 400
        values.append(stripped)

    values.append(grade_id)
    cursor.execute(f"UPDATE grades SET {', '.join(updates)} WHERE id = %s", values)
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"message": "Grade updated successfully"})


# ============================================================
# SEARCH ENDPOINTS
# ============================================================

@app.route("/api/students/search", methods=["GET"])
def search_students():
    """Search students by name or email."""
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM students
        WHERE LOWER(name) LIKE %s OR LOWER(email) LIKE %s
        ORDER BY name
    """, (f"%{query.lower()}%", f"%{query.lower()}%"))
    students = cursor.fetchall()

    result = []
    for s in students:
        cursor.execute("SELECT * FROM grades WHERE student_id = %s", (s["id"],))
        grade_list = [dict(g) for g in cursor.fetchall()]
        avg    = round(sum(g["grade"] for g in grade_list) / len(grade_list), 2) if grade_list else None
        status = cbc_status(avg)
        result.append({
            "id": s["id"], "name": s["name"], "email": s["email"],
            "grades": grade_list, "average": avg, "status": status
        })

    cursor.close()
    conn.close()
    return jsonify(result)


@app.route("/api/teachers/search", methods=["GET"])
def search_teachers():
    """Search teachers by name, username or subject — admin only."""
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    query = request.args.get("q", "").strip()
    if not query:
        return jsonify([])

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM users
        WHERE role = 'teacher' AND (
            LOWER(fullname) LIKE %s OR
            LOWER(username) LIKE %s OR
            LOWER(subject)  LIKE %s
        )
        ORDER BY fullname
    """, (f"%{query.lower()}%", f"%{query.lower()}%", f"%{query.lower()}%"))
    teachers = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify([dict(t) for t in teachers])


# ============================================================
# REPORT ENDPOINTS
# ============================================================

@app.route("/api/my-report", methods=["GET"])
def my_report():
    """Return full report data for the logged in student."""
    user = get_current_user()
    if not user or user["role"] != "student":
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM students WHERE email = %s", (user["email"],))
    student = cursor.fetchone()

    if not student:
        cursor.close()
        conn.close()
        return jsonify({"error": "Student record not found"}), 404

    cursor.execute("""
        SELECT g.*, u.fullname as teacher_name
        FROM grades g
        LEFT JOIN users u ON g.teacher_id = u.id
        WHERE g.student_id = %s
        ORDER BY g.created_at DESC
    """, (student["id"],))
    grade_list = [dict(g) for g in cursor.fetchall()]

    # Fix 2: Format dates as DD/MM/YYYY (Kenyan format)
    for g in grade_list:
        if g.get("created_at"):
            g["date_added"] = g["created_at"].strftime("%d/%m/%Y")
        else:
            g["date_added"] = "—"

    avg    = round(sum(g["grade"] for g in grade_list) / len(grade_list), 2) if grade_list else None
    status = cbc_status(avg)

    # Fix 4: Sort by official KNEC/MoE CBC subject order
    KNEC_ORDER = [
        "English", "Kiswahili", "Mathematics", "Integrated Science",
        "Social Studies", "Religious Education (CRE)", "Religious Education (IRE)",
        "Religious Education (HRE)", "Pre-Technical Studies", "Business Studies",
        "Agriculture", "Nutrition & Home Science", "Computer Studies",
        "Creative Arts & Sports",
    ]
    grade_list.sort(key=lambda g: KNEC_ORDER.index(g["subject"]) if g["subject"] in KNEC_ORDER else len(KNEC_ORDER))

    # Subject breakdown
    subjects = {}
    for g in grade_list:
        subj = g["subject"]
        if subj not in subjects:
            subjects[subj] = []
        subjects[subj].append(g["grade"])
    subject_avgs = {s: round(sum(v)/len(v), 2) for s, v in subjects.items()}

    cursor.close()
    conn.close()
    return jsonify({
        "student":      dict(student),
        "fullname":     user["fullname"],
        "email":        user["email"],
        "grades":       grade_list,
        "average":      avg,
        "status":       status,
        "subject_avgs": subject_avgs,
        "total_grades": len(grade_list)
    })


@app.route("/api/admin/school-report", methods=["GET"])
def school_report():
    """Return full school report — admin only."""
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    conn = get_db()
    cursor = conn.cursor()

    # All students with their averages
    cursor.execute("SELECT * FROM students ORDER BY name")
    students = cursor.fetchall()

    student_data = []
    for s in students:
        cursor.execute("SELECT grade FROM grades WHERE student_id = %s", (s["id"],))
        grades = [g["grade"] for g in cursor.fetchall()]
        avg    = round(sum(grades) / len(grades), 2) if grades else None
        status = cbc_status(avg)
        student_data.append({
            "name": s["name"], "email": s["email"],
            "average": avg, "status": status,
            "total_grades": len(grades)
        })

    # Teacher count
    cursor.execute("SELECT COUNT(*) as c FROM users WHERE role='teacher'")
    total_teachers = cursor.fetchone()["c"]

    # Overall stats
    cursor.execute("SELECT grade FROM grades")
    all_grades = [g["grade"] for g in cursor.fetchall()]
    overall_avg = round(sum(all_grades) / len(all_grades), 2) if all_grades else 0
    passing = sum(1 for s in student_data if s["status"] in ["EE", "ME"])
    failing = sum(1 for s in student_data if s["status"] in ["AE", "BE"])

    cursor.close()
    conn.close()
    return jsonify({
        "students":        student_data,
        "total_students":  len(student_data),
        "total_teachers":  total_teachers,
        "total_grades":    len(all_grades),
        "overall_average": overall_avg,
        "passing":         passing,
        "failing":         failing
    })


# ============================================================
# ANNOUNCEMENTS
# ============================================================

@app.route("/api/announcements", methods=["GET"])
def get_announcements():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Not logged in"}), 401
    conn = get_db()
    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cursor.execute("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 20")
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    result = []
    for r in rows:
        result.append({
            "id":          r["id"],
            "title":       r["title"],
            "message":     r["message"] or "",
            "author_name": r["author_name"],
            "created_at":  r["created_at"].strftime("%d %b %Y, %H:%M") if r["created_at"] else "—"
        })
    return jsonify(result)


@app.route("/api/announcements", methods=["POST"])
def post_announcement():
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Admin only"}), 403
    data    = request.get_json()
    title   = (data.get("title") or "").strip()
    message = (data.get("message") or "").strip()
    if not title:
        return jsonify({"error": "Title is required"}), 400
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO announcements (title, message, author_name, created_by) VALUES (%s, %s, %s, %s)",
        (title, message or None, user["fullname"], user["id"])
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"ok": True})


@app.route("/api/announcements/<int:ann_id>", methods=["DELETE"])
def delete_announcement(ann_id):
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Admin only"}), 403
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM announcements WHERE id = %s", (ann_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"ok": True})


# ============================================================
# ATTENDANCE
# ============================================================

@app.route("/api/attendance", methods=["POST"])
def mark_attendance():
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    data    = request.get_json()
    records = data.get("records", [])   # [{student_id, status}]
    date    = data.get("date", "").strip()
    term    = data.get("term", "Term 1").strip() or "Term 1"

    if not date or not records:
        return jsonify({"error": "date and records are required"}), 400

    conn   = get_db()
    cursor = conn.cursor()
    saved  = 0
    for r in records:
        sid    = r.get("student_id")
        status = r.get("status", "Present")
        if not sid or status not in ("Present", "Absent", "Late"):
            continue
        cursor.execute("""
            INSERT INTO attendance (student_id, date, status, term, marked_by)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (student_id, date)
            DO UPDATE SET status = EXCLUDED.status, term = EXCLUDED.term, marked_by = EXCLUDED.marked_by
        """, (sid, date, status, term, user["id"]))
        saved += 1

    conn.commit()
    cursor.close()
    conn.close()
    log_activity(user, "Marked attendance", f"{saved} records for {date} ({term})")
    return jsonify({"saved": saved, "message": f"Attendance saved for {date}"})


@app.route("/api/attendance", methods=["GET"])
def get_attendance():
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    date_filter    = request.args.get("date", "").strip()
    student_filter = request.args.get("student_id", "").strip()
    term_filter    = request.args.get("term", "").strip()

    conn   = get_db()
    cursor = conn.cursor()

    conds  = []
    params = []
    if date_filter:
        conds.append("a.date = %s"); params.append(date_filter)
    if student_filter:
        conds.append("a.student_id = %s"); params.append(student_filter)
    if term_filter:
        conds.append("a.term = %s"); params.append(term_filter)

    where = ("WHERE " + " AND ".join(conds)) if conds else ""
    cursor.execute(f"""
        SELECT a.*, s.name as student_name, s.email as student_email
        FROM attendance a
        JOIN students s ON a.student_id = s.id
        {where}
        ORDER BY a.date DESC, s.name ASC
    """, params)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    return jsonify([{
        "id":            r["id"],
        "student_id":    r["student_id"],
        "student_name":  r["student_name"],
        "student_email": r["student_email"],
        "date":          str(r["date"]),
        "status":        r["status"],
        "term":          r["term"] or "Term 1"
    } for r in rows])


@app.route("/api/my-attendance", methods=["GET"])
def my_attendance():
    user = get_current_user()
    if not user or user["role"] != "student":
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM students WHERE email = %s", (user["email"],))
    student = cursor.fetchone()
    if not student:
        cursor.close(); conn.close()
        return jsonify({"records": [], "summary": {"total": 0, "present": 0, "absent": 0, "late": 0, "pct": 0}})

    term_filter = request.args.get("term", "").strip()
    if term_filter:
        cursor.execute("SELECT * FROM attendance WHERE student_id = %s AND term = %s ORDER BY date DESC", (student["id"], term_filter))
    else:
        cursor.execute("SELECT * FROM attendance WHERE student_id = %s ORDER BY date DESC", (student["id"],))

    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    total   = len(rows)
    present = sum(1 for r in rows if r["status"] == "Present")
    absent  = sum(1 for r in rows if r["status"] == "Absent")
    late    = sum(1 for r in rows if r["status"] == "Late")
    pct     = round((present / total) * 100, 1) if total else 0

    return jsonify({
        "records": [{"date": str(r["date"]), "status": r["status"], "term": r["term"] or "Term 1"} for r in rows],
        "summary": {"total": total, "present": present, "absent": absent, "late": late, "pct": pct}
    })


@app.route("/api/admin/attendance-stats", methods=["GET"])
def attendance_stats():
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as c FROM attendance")
    total = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) as c FROM attendance WHERE status='Present'")
    present = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) as c FROM attendance WHERE status='Absent'")
    absent = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) as c FROM attendance WHERE status='Late'")
    late = cursor.fetchone()["c"]
    cursor.close()
    conn.close()

    pct = round((present / total) * 100, 1) if total else 0
    return jsonify({"total": total, "present": present, "absent": absent, "late": late, "pct": pct})


# ============================================================
# PARENT PORTAL
# ============================================================

@app.route("/api/admin/parents", methods=["GET"])
def get_parents():
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, fullname, username, email, created_at FROM users WHERE role='parent' ORDER BY fullname")
    parents = cursor.fetchall()

    result = []
    for p in parents:
        cursor.execute("""
            SELECT s.id, s.name, s.email FROM parent_students ps
            JOIN students s ON ps.student_id = s.id
            WHERE ps.parent_id = %s
        """, (p["id"],))
        children = cursor.fetchall()
        d = dict(p)
        d["children"]    = [dict(c) for c in children]
        d["created_at"]  = p["created_at"].strftime("%d %b %Y") if p["created_at"] else "—"
        result.append(d)

    cursor.close()
    conn.close()
    return jsonify(result)


@app.route("/api/admin/parents", methods=["POST"])
def add_parent():
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data     = request.get_json()
    fullname = data.get("fullname", "").strip()
    username = data.get("username", "").strip()
    email    = data.get("email", "").strip()
    password = data.get("password", "")

    if not fullname or not username or not email or not password:
        return jsonify({"error": "All fields are required"}), 400

    email_regex = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    if not re.match(email_regex, email):
        return jsonify({"error": "Please enter a valid email address"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    try:
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO users (fullname, username, email, password, role)
            VALUES (%s, %s, %s, %s, 'parent')
        """, (fullname, username, email, generate_password_hash(password)))
        conn.commit()
        cursor.close()
        conn.close()
        log_activity(user, "Added parent", f"{fullname} ({username})")
        return jsonify({"message": "Parent added"}), 201
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        return jsonify({"error": "Username or email already exists"}), 409


@app.route("/api/admin/parents/<int:parent_id>", methods=["DELETE"])
def delete_parent(parent_id):
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = %s AND role = 'parent'", (parent_id,))
    conn.commit()
    cursor.close()
    conn.close()
    log_activity(user, "Deleted parent", f"Parent #{parent_id}")
    return jsonify({"message": "Parent deleted"})


@app.route("/api/admin/parents/<int:parent_id>/link", methods=["POST"])
def link_parent_student(parent_id):
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    data       = request.get_json()
    student_id = data.get("student_id")
    if not student_id:
        return jsonify({"error": "student_id required"}), 400

    try:
        conn   = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO parent_students (parent_id, student_id) VALUES (%s, %s)",
            (parent_id, student_id)
        )
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"message": "Linked"})
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        return jsonify({"error": "Already linked"}), 409


@app.route("/api/admin/parents/<int:parent_id>/unlink/<int:student_id>", methods=["DELETE"])
def unlink_parent_student(parent_id, student_id):
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM parent_students WHERE parent_id = %s AND student_id = %s",
        (parent_id, student_id)
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"message": "Unlinked"})


@app.route("/api/parent/children", methods=["GET"])
def get_children():
    user = get_current_user()
    if not user or user["role"] != "parent":
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT s.id, s.name, s.email FROM parent_students ps
        JOIN students s ON ps.student_id = s.id
        WHERE ps.parent_id = %s
    """, (user["id"],))
    children = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify([dict(c) for c in children])


@app.route("/api/parent/child/<int:student_id>/grades", methods=["GET"])
def parent_child_grades(student_id):
    user = get_current_user()
    if not user or user["role"] != "parent":
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    # Verify parent is linked to this student
    cursor.execute(
        "SELECT id FROM parent_students WHERE parent_id = %s AND student_id = %s",
        (user["id"], student_id)
    )
    if not cursor.fetchone():
        cursor.close(); conn.close()
        return jsonify({"error": "Not authorized for this student"}), 403

    cursor.execute("SELECT * FROM students WHERE id = %s", (student_id,))
    student = cursor.fetchone()

    term_filter = request.args.get("term", "").strip()
    if term_filter:
        cursor.execute("SELECT * FROM grades WHERE student_id = %s AND term = %s ORDER BY created_at DESC", (student_id, term_filter))
    else:
        cursor.execute("SELECT * FROM grades WHERE student_id = %s ORDER BY created_at DESC", (student_id,))
    grade_list = [dict(g) for g in cursor.fetchall()]

    for g in grade_list:
        if g.get("created_at"):
            g["date_added"] = g["created_at"].strftime("%d/%m/%Y")
        else:
            g["date_added"] = "—"

    avg    = round(sum(g["grade"] for g in grade_list) / len(grade_list), 2) if grade_list else None
    status = cbc_status(avg)
    cursor.close()
    conn.close()

    return jsonify({
        "student": dict(student),
        "grades":  grade_list,
        "average": avg,
        "status":  status
    })


@app.route("/api/parent/child/<int:student_id>/attendance", methods=["GET"])
def parent_child_attendance(student_id):
    user = get_current_user()
    if not user or user["role"] != "parent":
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM parent_students WHERE parent_id = %s AND student_id = %s",
        (user["id"], student_id)
    )
    if not cursor.fetchone():
        cursor.close(); conn.close()
        return jsonify({"error": "Not authorized for this student"}), 403

    term_filter = request.args.get("term", "").strip()
    if term_filter:
        cursor.execute("SELECT * FROM attendance WHERE student_id = %s AND term = %s ORDER BY date DESC", (student_id, term_filter))
    else:
        cursor.execute("SELECT * FROM attendance WHERE student_id = %s ORDER BY date DESC", (student_id,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    total   = len(rows)
    present = sum(1 for r in rows if r["status"] == "Present")
    absent  = sum(1 for r in rows if r["status"] == "Absent")
    late    = sum(1 for r in rows if r["status"] == "Late")
    pct     = round((present / total) * 100, 1) if total else 0

    return jsonify({
        "records": [{"date": str(r["date"]), "status": r["status"], "term": r["term"] or "Term 1"} for r in rows],
        "summary": {"total": total, "present": present, "absent": absent, "late": late, "pct": pct}
    })


# ============================================================
# TERMS
# ============================================================

@app.route("/api/terms", methods=["GET"])
def get_terms():
    return jsonify(TERMS)


# ============================================================
# BULK GRADE IMPORT
# ============================================================

@app.route("/api/grades/bulk-import", methods=["POST"])
def bulk_import_grades():
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file uploaded"}), 400

    try:
        content = file.read().decode("utf-8")
        reader  = csv.DictReader(io.StringIO(content))

        conn   = get_db()
        cursor = conn.cursor()

        imported = 0
        errors   = []
        teacher_subjects = [s.strip() for s in user["subject"].split(",")] if user.get("subject") else []

        for i, row in enumerate(reader, start=2):
            email      = (row.get("student_email") or "").strip()
            subject    = (row.get("subject") or "").strip()
            grade_val  = (row.get("grade") or "").strip()
            max_val    = (row.get("max_grade") or "100").strip()
            term       = (row.get("term") or "Term 1").strip()
            comment    = (row.get("comment") or "").strip() or None

            if not email or not subject or not grade_val:
                errors.append(f"Row {i}: missing required fields (student_email, subject, grade)")
                continue

            try:
                grade     = float(grade_val)
                max_grade = float(max_val) if max_val else 100.0
            except ValueError:
                errors.append(f"Row {i}: invalid grade value '{grade_val}'")
                continue

            if not (0 <= grade <= max_grade):
                errors.append(f"Row {i}: grade {grade} out of range 0–{max_grade}")
                continue

            if user["role"] == "teacher" and teacher_subjects and subject not in teacher_subjects:
                errors.append(f"Row {i}: subject '{subject}' not in your assigned subjects")
                continue

            cursor.execute("SELECT id FROM students WHERE LOWER(email) = %s", (email.lower(),))
            student = cursor.fetchone()
            if not student:
                errors.append(f"Row {i}: student not found: {email}")
                continue

            cursor.execute("""
                INSERT INTO grades (student_id, subject, grade, max_grade, comment, teacher_id, term)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (student["id"], subject, grade, max_grade, comment, user["id"], term))
            imported += 1

        conn.commit()
        cursor.close()
        conn.close()

        log_activity(user, "Bulk imported grades", f"{imported} grades imported")
        suffix = f" with {len(errors)} error(s)" if errors else ""
        return jsonify({
            "imported": imported,
            "errors":   errors,
            "message":  f"Imported {imported} grade(s) successfully{suffix}"
        })

    except Exception as e:
        logging.error(f"[BULK IMPORT ERROR] {e}")
        return jsonify({"error": f"Import failed: {str(e)}"}), 500


# ============================================================
# ACTIVITY LOG
# ============================================================

@app.route("/api/admin/activity-log", methods=["GET"])
def get_activity_log():
    user = get_current_user()
    if not user or user["role"] != "admin":
        return jsonify({"error": "Unauthorized"}), 403

    limit = request.args.get("limit", 100, type=int)
    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM activity_log ORDER BY created_at DESC LIMIT %s", (limit,))
    logs = cursor.fetchall()
    cursor.close()
    conn.close()

    return jsonify([{
        "id":         l["id"],
        "user_name":  l["user_name"],
        "action":     l["action"],
        "details":    l["details"] or "",
        "created_at": l["created_at"].strftime("%d %b %Y, %H:%M") if l["created_at"] else "—"
    } for l in logs])


# ============================================================
# GRADE FEEDBACK
# ============================================================

@app.route("/api/grades/<int:grade_id>/feedback", methods=["GET"])
def get_grade_feedback(grade_id):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()

    # Students can only read feedback on their own grades
    if user["role"] == "student":
        cursor.execute("SELECT id FROM students WHERE email = %s", (user["email"],))
        student = cursor.fetchone()
        if not student:
            cursor.close(); conn.close()
            return jsonify({"error": "Student not found"}), 404
        cursor.execute("SELECT id FROM grades WHERE id = %s AND student_id = %s", (grade_id, student["id"]))
        if not cursor.fetchone():
            cursor.close(); conn.close()
            return jsonify({"error": "Grade not found"}), 404

    cursor.execute("SELECT * FROM grade_feedback WHERE grade_id = %s ORDER BY created_at ASC", (grade_id,))
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    return jsonify([{
        "id":          f["id"],
        "author_name": f["author_name"],
        "role":        f["role"],
        "message":     f["message"],
        "created_at":  f["created_at"].strftime("%d %b %Y, %H:%M") if f["created_at"] else "—"
    } for f in rows])


@app.route("/api/grades/<int:grade_id>/feedback", methods=["POST"])
def add_grade_feedback(grade_id):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Unauthorized"}), 403

    data    = request.get_json()
    message = (data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Message is required"}), 400
    if len(message) > 500:
        return jsonify({"error": "Message must be 500 characters or less"}), 400

    conn   = get_db()
    cursor = conn.cursor()

    # Students can only comment on their own grades
    if user["role"] == "student":
        cursor.execute("SELECT id FROM students WHERE email = %s", (user["email"],))
        student = cursor.fetchone()
        if not student:
            cursor.close(); conn.close()
            return jsonify({"error": "Student not found"}), 404
        cursor.execute("SELECT id FROM grades WHERE id = %s AND student_id = %s", (grade_id, student["id"]))
        if not cursor.fetchone():
            cursor.close(); conn.close()
            return jsonify({"error": "Grade not found"}), 404

    cursor.execute(
        "INSERT INTO grade_feedback (grade_id, user_id, author_name, role, message) VALUES (%s, %s, %s, %s, %s)",
        (grade_id, user["id"], user["fullname"], user["role"], message)
    )
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"ok": True})


# ============================================================
# AT-RISK STUDENTS
# ============================================================

@app.route("/api/at-risk-students", methods=["GET"])
def at_risk_students():
    """Returns students flagged as at-risk based on grade trends."""
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    teacher_subjects = [s.strip() for s in user["subject"].split(",")] if user.get("subject") else []

    cursor.execute("SELECT * FROM students ORDER BY name")
    students = cursor.fetchall()

    at_risk = []
    for s in students:
        term_avgs = {}
        for term in TERMS:
            if user["role"] == "teacher" and teacher_subjects:
                placeholders = ",".join(["%s"] * len(teacher_subjects))
                cursor.execute(
                    f"SELECT AVG(grade) as avg FROM grades WHERE student_id = %s AND term = %s AND subject IN ({placeholders})",
                    [s["id"], term] + teacher_subjects
                )
            else:
                cursor.execute(
                    "SELECT AVG(grade) as avg FROM grades WHERE student_id = %s AND term = %s",
                    (s["id"], term)
                )
            row = cursor.fetchone()
            if row["avg"] is not None:
                term_avgs[term] = round(float(row["avg"]), 2)

        if not term_avgs:
            continue

        avg_vals = [term_avgs[t] for t in TERMS if t in term_avgs]
        latest_avg = avg_vals[-1] if avg_vals else None

        reasons = []
        if latest_avg is not None and latest_avg < 25:
            reasons.append("Below Expectation (BE)")
        if len(avg_vals) >= 2:
            declining = all(avg_vals[i] > avg_vals[i + 1] for i in range(len(avg_vals) - 1))
            if declining and avg_vals[-1] < 50:
                reasons.append("Consistently declining")
        if len(avg_vals) >= 2:
            best = max(avg_vals[:-1])
            drop = round(best - avg_vals[-1], 1)
            if drop >= 15:
                reasons.append(f"Dropped {drop} pts from best term")

        if reasons:
            at_risk.append({
                "id":        s["id"],
                "name":      s["name"],
                "email":     s["email"],
                "average":   latest_avg,
                "status":    cbc_status(latest_avg),
                "reasons":   reasons,
                "term_avgs": term_avgs
            })

    cursor.close()
    conn.close()
    return jsonify(at_risk)


# ============================================================
# CLASS RANK & PERCENTILE
# ============================================================

@app.route("/api/my-rank", methods=["GET"])
def my_rank():
    """Returns the logged-in student's rank and percentile among all graded students."""
    user = get_current_user()
    if not user or user["role"] != "student":
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM students WHERE email = %s", (user["email"],))
    student = cursor.fetchone()
    if not student:
        cursor.close(); conn.close()
        return jsonify({"rank": None, "total": 0, "percentile": None})

    cursor.execute("""
        SELECT s.id, AVG(g.grade) as avg
        FROM students s
        JOIN grades g ON g.student_id = s.id
        GROUP BY s.id
        ORDER BY avg DESC
    """)
    ranked = cursor.fetchall()
    cursor.close()
    conn.close()

    total = len(ranked)
    rank  = None
    for i, r in enumerate(ranked, start=1):
        if r["id"] == student["id"]:
            rank = i
            break

    if rank is None:
        return jsonify({"rank": None, "total": total, "percentile": None})

    percentile = round(((total - rank) / total) * 100, 1) if total > 1 else 100.0
    return jsonify({"rank": rank, "total": total, "percentile": percentile})


# ============================================================
# ATTENDANCE-GRADE CORRELATION
# ============================================================

@app.route("/api/attendance-grade-correlation", methods=["GET"])
def attendance_grade_correlation():
    """Per-student attendance % vs grade average for a scatter correlation chart."""
    user = get_current_user()
    if not user or user["role"] not in ["admin", "teacher"]:
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM students ORDER BY name")
    students = cursor.fetchall()
    teacher_subjects = [s.strip() for s in user["subject"].split(",")] if user.get("subject") else []

    result = []
    for s in students:
        cursor.execute("SELECT status FROM attendance WHERE student_id = %s", (s["id"],))
        att_rows  = cursor.fetchall()
        total_att = len(att_rows)
        if total_att == 0:
            continue
        present = sum(1 for r in att_rows if r["status"] == "Present")
        att_pct = round((present / total_att) * 100, 1)

        if user["role"] == "teacher" and teacher_subjects:
            placeholders = ",".join(["%s"] * len(teacher_subjects))
            cursor.execute(
                f"SELECT AVG(grade) as avg FROM grades WHERE student_id = %s AND subject IN ({placeholders})",
                [s["id"]] + teacher_subjects
            )
        else:
            cursor.execute("SELECT AVG(grade) as avg FROM grades WHERE student_id = %s", (s["id"],))
        row = cursor.fetchone()
        if not row["avg"]:
            continue

        result.append({
            "name":           s["name"],
            "attendance_pct": att_pct,
            "grade_avg":      round(float(row["avg"]), 2)
        })

    cursor.close()
    conn.close()
    return jsonify(result)


# ============================================================
# TERM GRADE PREDICTION
# ============================================================

@app.route("/api/my-prediction", methods=["GET"])
def my_prediction():
    """Predicts a student's Term 3 performance using linear trend extrapolation."""
    user = get_current_user()
    if not user or user["role"] != "student":
        return jsonify({"error": "Unauthorized"}), 403

    conn   = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM students WHERE email = %s", (user["email"],))
    student = cursor.fetchone()
    if not student:
        cursor.close(); conn.close()
        return jsonify({"prediction": None, "message": "No student record found"})

    term_avgs = {}
    for term in TERMS:
        cursor.execute(
            "SELECT AVG(grade) as avg FROM grades WHERE student_id = %s AND term = %s",
            (student["id"], term)
        )
        row = cursor.fetchone()
        if row["avg"] is not None:
            term_avgs[term] = round(float(row["avg"]), 2)

    cursor.close()
    conn.close()

    known = [(i, term_avgs[t]) for i, t in enumerate(TERMS) if t in term_avgs]

    if len(known) < 2:
        return jsonify({"prediction": None, "term_avgs": term_avgs,
                        "message": "Need at least 2 terms of data for a prediction"})

    if len(known) == 3:
        return jsonify({"prediction": None, "term_avgs": term_avgs,
                        "message": "All three terms complete — no prediction needed"})

    x1, y1 = known[-2]
    x2, y2 = known[-1]
    slope     = y2 - y1
    predicted = round(y2 + slope * (2 - x2), 2)
    predicted = max(0.0, min(100.0, predicted))

    trend = "improving" if slope > 2 else ("declining" if slope < -2 else "stable")
    return jsonify({
        "prediction": predicted,
        "trend":      trend,
        "slope":      round(slope, 2),
        "term_avgs":  term_avgs,
        "status":     cbc_status(predicted),
        "message":    f"Based on your trend, you're projected to score ~{predicted:.1f}% in Term 3"
    })


# ============================================================
# START
# ============================================================

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port)
