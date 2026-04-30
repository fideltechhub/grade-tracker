# GradeVault Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Prerequisites
- Node.js 16+ installed
- PostgreSQL database running
- Git (optional)

### Step 1: Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit .env with your PostgreSQL connection
# Example: DATABASE_URL=postgresql://postgres:password@localhost:5432/grade_tracker
```

**Important**: Set these environment variables in `.env`:
```
DATABASE_URL=your_postgresql_url
JWT_SECRET=your_secret_key
BREVO_API_KEY=your_brevo_key (optional for email)
```

### Step 2: Start Backend Server

```bash
npm run dev
```

You should see:
```
✓ Database initialized successfully
GradeVault Backend running on port 5000
```

### Step 3: Frontend Setup (New Terminal)

```bash
cd frontend

# Install dependencies
npm install

# Create environment file (optional, uses localhost defaults)
cp .env.example .env
```

### Step 4: Start Frontend Server

```bash
npm run dev
```

You should see:
```
VITE v5.0.11  ready in 234 ms

➜  Local:   http://localhost:5173/
```

### Step 5: Access the Application

Open your browser and go to: **http://localhost:5173**

### Step 6: Login with Default Admin

```
Username: admin
Password: admin123
```

⚠️ **Change this password immediately in production!**

---

## 📋 Common Setup Issues

### "Cannot connect to database"
- Check PostgreSQL is running
- Verify `DATABASE_URL` in `.env`
- Test connection: `psql your_connection_string`

### "Port 5000 already in use"
```bash
# Change port in backend/.env
PORT=5001

# Or kill existing process
# Windows: netstat -ano | findstr :5000
# Mac/Linux: lsof -i :5000
```

### "Port 5173 already in use"
```bash
# Vite will automatically try the next port
# Or edit vite.config.js to specify a different port
```

### "npm: command not found"
- Install Node.js from nodejs.org
- Verify installation: `node --version`

---

## 🎯 What to Try First

### As Admin
1. Create a teacher account
2. Add students
3. View school statistics
4. Create announcements

### As Teacher
1. View students
2. Add grades
3. Mark attendance
4. View class statistics

### As Student
1. View your grades
2. Download report
3. View attendance

### As Parent
1. View linked children
2. Check children's grades
3. Monitor attendance

---

## 🔗 Access Points

| Role | URL | Username |
|------|-----|----------|
| Admin | http://localhost:5173/dashboard/admin | admin |
| Teacher | http://localhost:5173/dashboard/teacher | [created by admin] |
| Student | http://localhost:5173/dashboard/student | [registered account] |
| Parent | http://localhost:5173/dashboard/parent | [created by admin] |

---

## 📚 Documentation

- **Full Setup**: [README_CONVERSION.md](./README_CONVERSION.md)
- **Conversion Details**: [CONVERSION_SUMMARY.md](./CONVERSION_SUMMARY.md)
- **API Reference**: Available at `/api/health` when running

---

## 🐛 Debug Mode

### Backend Logging
Backend automatically logs to console. For more details:
```bash
# Windows
set DEBUG=*
npm run dev

# Mac/Linux
DEBUG=* npm run dev
```

### Frontend React DevTools
Install React Developer Tools browser extension for better debugging.

---

## 📦 Build for Production

### Backend
```bash
cd backend
npm install --production
npm start
```

### Frontend
```bash
cd frontend
npm run build
# Output: dist/ folder (deploy to Vercel, Netlify, etc.)
```

---

## 🆘 Need Help?

Check these files:
1. **Backend issues**: `/backend/server.js`
2. **Database issues**: `/backend/db/init.js`
3. **Frontend issues**: `/frontend/src/App.jsx`
4. **API issues**: `/backend/routes/`

---

## ✅ Verification Checklist

After startup, verify:

- [ ] Backend running on http://localhost:5000 ✓
- [ ] Frontend running on http://localhost:5173 ✓
- [ ] Can access login page
- [ ] Can login with admin/admin123
- [ ] Dashboard loads successfully
- [ ] Can view students/grades
- [ ] Database connection working

---

## 🎉 You're Ready!

The application is now running with:
- ✅ Express.js backend (API)
- ✅ React frontend (UI)
- ✅ PostgreSQL database
- ✅ JWT authentication

**Next steps**: Customize the application for your needs!

---

**Questions?** See the detailed [README_CONVERSION.md](./README_CONVERSION.md) for complete information.
