# Local Testing Setup Guide

## ✅ What's Been Completed

- [x] Backend dependencies installed (`backend/node_modules`)
- [x] Frontend dependencies installed (`frontend/node_modules`)
- [x] `.env` files created for both backend and frontend
- [x] Package.json versions fixed

## ⚠️ Next: Setup PostgreSQL Database

The backend requires a PostgreSQL database. Choose one option below:

---

## Option 1: Local PostgreSQL (Recommended for Development)

### Windows Setup

#### A) Install PostgreSQL Desktop
1. Download from: https://www.postgresql.org/download/windows/
2. Run installer, set password for `postgres` user (remember it!)
3. Choose port `5432` (default)
4. Let it install pgAdmin (useful for viewing data)

#### B) Verify Installation
```powershell
psql --version
```

Should show version like: `psql (PostgreSQL) 15.x`

#### C) Create Database & User
```powershell
# Connect to PostgreSQL
psql -U postgres

# In psql prompt, run these commands:
CREATE USER grade_user WITH PASSWORD 'grade_password';
CREATE DATABASE grade_tracker OWNER grade_user;

# Verify
\l
# Should show grade_tracker database

# Exit
\q
```

#### D) Update Backend .env
Edit `backend/.env`:
```
DATABASE_URL=postgresql://grade_user:grade_password@localhost:5432/grade_tracker
```

---

## Option 2: Cloud PostgreSQL (No Installation Needed)

### Using Render or Railway

#### Render Setup (Free)
1. Go to: https://render.com
2. Sign up (free account)
3. Click "New" → "PostgreSQL"
4. Fill in database details
5. Copy the connection string
6. Paste into `backend/.env` as `DATABASE_URL`

#### Railway Setup (Free credits)
1. Go to: https://railway.app
2. Sign up with GitHub
3. Create new project
4. Add PostgreSQL
5. Copy connection string
6. Paste into `backend/.env` as `DATABASE_URL`

---

## Option 3: Docker (Alternative)

### If you have Docker installed:

```powershell
# Pull PostgreSQL image
docker pull postgres:15

# Run container
docker run --name grade-tracker-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15

# Create database
docker exec grade-tracker-db psql -U postgres -c "CREATE DATABASE grade_tracker;"

# Update backend/.env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/grade_tracker
```

---

## 🚀 Start Both Servers

Once you have PostgreSQL set up:

### Terminal 1: Backend
```powershell
cd backend
npm run dev
```

Expected output:
```
✓ Server running on http://localhost:5000
✓ Database initialized successfully
```

### Terminal 2: Frontend
```powershell
cd frontend
npm run dev
```

Expected output:
```
VITE v5.0.0  ready in 123 ms

➜  Local:   http://localhost:5173/
```

---

## 🔑 Login Credentials

Once database is initialized, use:
- **Username**: `admin`
- **Password**: `admin123`

---

## ✅ Testing

Open browser: **http://localhost:5173**

You should see:
1. Login page with GradeVault logo
2. Login with admin/admin123
3. Admin dashboard with stats and menu

---

## 🆘 Troubleshooting

### "Cannot connect to database"
```powershell
# Check if PostgreSQL running
psql -U postgres -c "\l"

# Check DATABASE_URL in backend/.env
cat backend\.env | findstr DATABASE_URL
```

### "Port 5000 already in use"
```powershell
# Find what's using port 5000
netstat -ano | findstr :5000

# Kill process (replace PID with actual number)
taskkill /PID <PID> /F
```

### "Port 5173 already in use"
```powershell
# Kill process using 5173
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### Frontend shows "Cannot connect to backend"
1. Check backend server is running
2. Check `frontend/.env` has correct API URL
3. Check CORS is enabled in backend

### "Module not found" errors
```powershell
# Reinstall dependencies
cd backend
rm -r node_modules
npm install

cd ../frontend
rm -r node_modules
npm install
```

---

## 📊 Database Info

### Using pgAdmin (Visual Tool)
1. Open pgAdmin (installed with PostgreSQL)
2. Connect to local server
3. Right-click "Databases" → "Create"
4. Name: `grade_tracker`
5. Owner: `grade_user`

### SQL Query Tools
```sql
-- Check all users
SELECT * FROM users;

-- Check grades
SELECT * FROM grades;

-- Check all tables
\dt
```

---

## 🎯 Quick Start Checklist

- [ ] PostgreSQL installed and running
- [ ] Database `grade_tracker` created
- [ ] `backend/.env` has correct DATABASE_URL
- [ ] `frontend/.env` configured
- [ ] Backend dependencies installed (`npm install` in backend/)
- [ ] Frontend dependencies installed (`npm install` in frontend/)
- [ ] Backend running: `npm run dev` (port 5000)
- [ ] Frontend running: `npm run dev` (port 5173)
- [ ] Logged in with admin/admin123
- [ ] Dashboard displays

---

## 📚 Next Steps

1. ✅ Get PostgreSQL running (choose Option 1, 2, or 3)
2. ✅ Start both servers
3. Read [QUICK_START.md](./QUICK_START.md) for feature overview
4. Read [TESTING_GUIDE.md](./TESTING_GUIDE.md) to test features

---

## 💡 Tips

- Keep 2 terminals open (one for backend, one for frontend)
- Changes to backend need restart
- Frontend auto-reloads (Vite HMR)
- Check browser console for errors (F12)
- Check backend terminal for API errors

---

**Ready to test locally!** 🚀

Which database option will you use?
