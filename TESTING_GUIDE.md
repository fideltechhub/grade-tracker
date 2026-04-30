# Testing Guide - GradeVault Framework Conversion

This guide helps you verify that the converted application is working correctly.

---

## Prerequisites

- Both backend and frontend servers running
- PostgreSQL database initialized
- Default admin account created (admin/admin123)

---

## 1. Backend Health Check

### API Health Endpoint
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{"status":"OK"}
```

### Database Connection
Check backend logs for:
```
✓ Database initialized successfully
```

---

## 2. Authentication Tests

### Test 1: Admin Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

Expected response:
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "role": "admin",
  "fullname": "Administrator",
  "redirect": "/dashboard/admin"
}
```

### Test 2: Invalid Credentials
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "wrongpassword"
  }'
```

Expected: `401` status with error message

### Test 3: Student Registration
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullname": "John Doe",
    "username": "johndoe",
    "email": "john@example.com",
    "password": "password123"
  }'
```

Expected: `201` status with success message

---

## 3. Admin Functionality Tests

### Get Statistics (requires JWT token)
```bash
curl -X GET http://localhost:5000/api/admin/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected response:
```json
{
  "total_students": 0,
  "total_teachers": 0,
  "total_grades": 0,
  "overall_average": 0
}
```

### Add Teacher
```bash
curl -X POST http://localhost:5000/api/admin/teachers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "fullname": "Mr. Smith",
    "username": "smith",
    "email": "smith@example.com",
    "password": "password123",
    "subject": "Mathematics,Physics"
  }'
```

Expected: `201` status

### Get All Teachers
```bash
curl -X GET http://localhost:5000/api/admin/teachers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected: Array of teacher objects

---

## 4. Grade Management Tests

### Add Grade
```bash
curl -X POST http://localhost:5000/api/grades \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "student_id": 1,
    "subject": "Mathematics",
    "grade": 85,
    "max_grade": 100,
    "comment": "Good performance",
    "term": "Term 1"
  }'
```

Expected: `201` status

### Get Grades
```bash
curl -X GET http://localhost:5000/api/grades \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Expected: Array of grade objects with student information

---

## 5. Frontend Tests

### Access Login Page
```
Open: http://localhost:5173/login
```

Should display:
- GradeVault title
- Login form with username/password fields
- "Forgot Password?" link
- "Create Account" link

### Test Login
1. Enter: `admin` / `admin123`
2. Click Login
3. Should redirect to `/dashboard/admin`

### Test Registration
1. Go to: http://localhost:5173/register
2. Fill in form
3. Submit
4. Should show success message

---

## 6. JWT Token Tests

### Test Token Expiration
```bash
# Create token manually (should work)
curl -H "Authorization: Bearer valid_token" http://localhost:5000/api/admin/stats

# Use invalid token
curl -H "Authorization: Bearer invalid_token" http://localhost:5000/api/admin/stats
```

Expected: `401` Unauthorized

### Test Token Refresh (on frontend)
- Login and check localStorage
- Token should be stored as `token` key
- Logout should remove it

---

## 7. Database Tests

### Check Tables Created
```bash
psql your_database
```

```sql
-- List all tables
\dt

-- Should show:
-- users
-- students
-- grades
-- attendance
-- announcements
-- activity_log
-- grade_feedback
-- password_reset_tokens
-- parent_students
```

### Verify Admin User
```sql
SELECT * FROM users WHERE role = 'admin';
```

Should return one admin user.

### Check Activity Log
```sql
SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 5;
```

Should show login activity.

---

## 8. Email Service Tests

### Request Password Reset
```bash
curl -X POST http://localhost:5000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@gradevault.com"
  }'
```

Expected:
- `200` status
- Email sent (if BREVO_API_KEY configured)
- Token created in database

### Verify Token Created
```sql
SELECT * FROM password_reset_tokens 
WHERE user_id = 1 
ORDER BY created_at DESC LIMIT 1;
```

Should show recent token.

---

## 9. Role-Based Access Tests

### Test Admin-Only Endpoint (as student)
1. Login as student
2. Try to access admin stats:
```bash
curl -X GET http://localhost:5000/api/admin/stats \
  -H "Authorization: Bearer STUDENT_TOKEN"
```

Expected: `403` Forbidden

### Test Teacher-Only Endpoint (as admin)
1. Login as admin
2. Should still have access (admins can do anything)

---

## 10. Frontend Component Tests

### Admin Dashboard
- [ ] Stats cards display
- [ ] Menu items visible
- [ ] Can click on menu items (navigation)
- [ ] Logout button works

### Student Dashboard
- [ ] Shows student's average
- [ ] Shows status (EE/ME/AE/BE)
- [ ] Shows grade count
- [ ] Can view grades

### Parent Portal
- [ ] Shows linked children
- [ ] Can click on child to view grades
- [ ] Can view attendance

---

## 11. Performance Tests

### Backend Response Time
```bash
time curl http://localhost:5000/api/admin/stats \
  -H "Authorization: Bearer TOKEN"
```

Expected: < 100ms

### Frontend Load Time
```bash
Open DevTools → Network tab
Reload http://localhost:5173
```

Expected: Page loads in < 2 seconds

---

## 12. Error Handling Tests

### Invalid Email Registration
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullname": "Test",
    "username": "test",
    "email": "invalid-email",
    "password": "password"
  }'
```

Expected: `400` Bad Request with error message

### Duplicate Username
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullname": "Admin2",
    "username": "admin",
    "email": "admin2@test.com",
    "password": "password"
  }'
```

Expected: `409` Conflict (Unique Violation)

### Missing Required Field
```bash
curl -X POST http://localhost:5000/api/grades \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "student_id": 1
  }'
```

Expected: `400` Bad Request

---

## 13. Data Persistence Tests

### Add Data and Restart
1. Add a student via admin dashboard
2. Stop and restart backend server
3. Login again
4. Student should still exist

Verifies: Database properly configured

---

## 14. Browser Compatibility

Test on:
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari
- [ ] Chrome Mobile

Expected: All features work

---

## 15. CORS Tests

### Request from Different Origin
If frontend on port 5173 and backend on 5000:

```javascript
fetch('http://localhost:5000/api/admin/stats', {
  headers: { 'Authorization': 'Bearer token' }
})
```

Should work (CORS enabled in backend)

---

## Test Summary Checklist

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| Backend Health | ✓ OK | | |
| Admin Login | 200 OK | | |
| Invalid Login | 401 Unauthorized | | |
| Student Register | 201 Created | | |
| Add Teacher | 201 Created | | |
| Get Stats | 200 OK | | |
| Frontend Load | < 2s | | |
| Token Auth | 401 if invalid | | |
| Admin Access | 200 OK | | |
| Student Access | 403 if denied | | |
| Email Send | Success | | |
| Database Check | All tables | | |
| Activity Log | Has entries | | |
| Error Handling | Proper errors | | |
| Responsive UI | Works | | |

---

## Debug Commands

### Backend Debug
```bash
# Check if backend running
curl http://localhost:5000/health

# Check all users
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:5000/api/admin/teachers

# Check database
psql your_database -c "SELECT COUNT(*) FROM users;"
```

### Frontend Debug
```javascript
// In browser console
localStorage.getItem('token')
localStorage.getItem('user')
```

### Database Debug
```bash
psql your_database

# See all users
SELECT * FROM users;

# See recent activity
SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10;

# Count grades
SELECT COUNT(*) FROM grades;
```

---

## Common Test Failures

### "Cannot connect to database"
- Check PostgreSQL running: `psql --version`
- Check DATABASE_URL in `.env`
- Check database exists

### "403 Forbidden on API"
- Check JWT token valid
- Check user role matches endpoint
- Check Authorization header format: `Bearer TOKEN`

### "CORS error in console"
- Check backend CORS middleware
- Check frontend API URL points to backend
- Check backend not blocking requests

### "Blank page on frontend"
- Check console for JS errors
- Check backend running
- Check API endpoint responding

---

## What's Tested

✅ Authentication (login, register, password reset)
✅ Authorization (role-based access)
✅ CRUD operations (create, read, update, delete)
✅ Database operations (queries, transactions)
✅ Error handling (validation, edge cases)
✅ API responses (correct format and status)
✅ Frontend routing (navigation works)
✅ State management (data persists)
✅ Email functionality (reset tokens)
✅ JWT tokens (creation, validation, expiration)

---

## Success Criteria

Application is working correctly when:
- ✅ All endpoints return expected responses
- ✅ Authentication works for all roles
- ✅ Frontend loads and navigates properly
- ✅ Database operations complete successfully
- ✅ No console errors on frontend
- ✅ No unhandled exceptions on backend
- ✅ Token-based auth works correctly
- ✅ Role-based access control enforced

---

Good luck with testing! 🚀
