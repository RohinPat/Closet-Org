# 🚀 Quick Start Guide - New Version

## What's New?

Your Closet-Org app now has:
- ✅ User accounts with secure login
- ✅ Beautiful modern UI with glassmorphism
- ✅ Dark mode toggle
- ✅ User profiles
- ✅ Enhanced animations and micro-interactions
- ✅ Mobile-responsive design

---

## Running the App

### 1. Install New Dependencies

```bash
pip install -r requirements.txt
```

This will install the new authentication libraries.

### 2. Start Fresh Database (Recommended)

```bash
# Delete old database if it exists
rm backend/closet.db

# Or on Windows:
del backend\closet.db
```

The new database with user accounts will be created automatically when you start the app.

### 3. Run the Application

```bash
cd backend
python main.py
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 4. Open in Browser

Visit: **http://localhost:8000**

You'll be automatically redirected to the registration page!

---

## First Time Setup

### Create Your Account

1. Fill in the registration form:
   - **Full Name**: Your name (optional)
   - **Username**: Choose a unique username
   - **Email**: Your email address
   - **Password**: Minimum 6 characters
   - **Confirm Password**: Must match

2. Click **"Create Account"**

3. You'll be automatically logged in and taken to your closet!

### Explore the Features

**Upload Your First Item**
- Click "Upload" tab
- Drag & drop or select an image
- AI will classify it automatically
- View the results!

**Customize Your Profile**
- Click your avatar in the top right
- Select "Profile"
- Add your bio and update your name
- Changes save automatically

**Try Dark Mode**
- Click the moon/sun icon in the header
- Toggle between light and dark themes
- Your preference is saved!

---

## Tips

### Best Practices
1. Upload clear, well-lit photos of clothing
2. Mark items as worn/washed to track usage
3. Use filters to find items quickly
4. Generate outfits for different occasions

### Shortcuts
- **Theme Toggle**: Click moon/sun icon
- **Profile**: Click avatar → Profile
- **Logout**: Click avatar → Logout

### Mobile Usage
- Fully responsive design
- Touch-friendly buttons
- Swipe-friendly cards
- Optimized for small screens

---

## Troubleshooting

### Can't Login?
- Make sure you're using the correct username (not email)
- Password is case-sensitive
- Try registering a new account if forgotten

### Page Won't Load?
- Check if backend is running: `http://localhost:8000/api/stats`
- Clear browser cache: Ctrl+Shift+Del (Windows) or Cmd+Shift+Del (Mac)
- Try incognito/private mode

### Database Errors?
```bash
# Delete and recreate database
rm backend/closet.db
cd backend
python main.py
```

### Token Expired?
- Just log in again
- Tokens last 7 days
- Your data is safe

---

## Screenshots Tour

### Login Page
- Beautiful gradient background
- Floating animated circles
- Glassmorphism login card
- Smooth animations

### Register Page
- Same beautiful design
- Form validation
- Password strength indicator
- Auto-login on success

### Main Closet
- Card grid layout
- Hover effects with lift
- Color swatches
- Status badges

### Dark Mode
- Elegant dark theme
- Reduced eye strain
- All features work the same
- Saves preference

### Profile Page
- Large avatar with initials
- Editable information
- Account statistics
- Clean layout

---

## Features Checklist

After logging in, try these features:

- [ ] Upload a clothing item
- [ ] View your closet
- [ ] Filter by category
- [ ] Mark an item as worn
- [ ] Mark an item as washed
- [ ] Generate outfit recommendations
- [ ] Check your stats
- [ ] Toggle dark mode
- [ ] Update your profile
- [ ] Test mobile view (resize browser)

---

## Security Notes

### Your Data is Safe
- ✅ Passwords are encrypted with bcrypt
- ✅ Sessions use secure JWT tokens
- ✅ Each user has private closet
- ✅ No one can see your data

### For Production Use
If deploying to a server:
1. Change the SECRET_KEY in `backend/auth.py`
2. Use HTTPS (not HTTP)
3. Set up proper CORS
4. Use environment variables

---

## Commands Reference

### Start Application
```bash
cd backend
python main.py
```

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Reset Database
```bash
rm backend/closet.db  # Mac/Linux
del backend\closet.db  # Windows
```

### Check Backend Running
```bash
# Visit in browser:
http://localhost:8000/api/auth/me
# Should show authentication error if not logged in
```

---

## What Changed?

### Backend
- ✨ User authentication system
- ✨ JWT token management
- ✨ Password hashing
- ✨ User profile management
- ✨ Protected API endpoints

### Frontend
- ✨ Login/Register pages
- ✨ Profile management page
- ✨ Dark mode toggle
- ✨ User menu dropdown
- ✨ Enhanced UI with glassmorphism
- ✨ Smooth animations
- ✨ Better mobile support

### Database
- ✨ Users table
- ✨ User-specific clothing items
- ✨ Theme preferences
- ✨ Account timestamps

---

## Need Help?

1. Check `SETUP_GUIDE.md` for detailed setup
2. Check `IMPLEMENTATION_SUMMARY.md` for technical details
3. Check browser console (F12) for errors
4. Make sure Python packages are installed
5. Verify backend is running on port 8000

---

**Enjoy your upgraded Closet-Org! 👕✨**

Remember to:
- Keep your account secure
- Upload quality photos
- Explore all features
- Try dark mode!

