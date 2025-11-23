# 🎉 Closet-Org Setup Guide

## New Features

### ✨ Modern UI Enhancements
- **Glassmorphism Design** - Beautiful frosted glass effects throughout the app
- **Smooth Animations** - Micro-interactions on buttons, cards, and transitions
- **Dark Mode** - Toggle between light and dark themes (saves your preference)
- **Responsive Design** - Optimized for mobile, tablet, and desktop
- **Enhanced Color Palette** - Vibrant gradients with purple/indigo theme

### 🔐 Account System
- **User Registration** - Create your personal account
- **Secure Login** - JWT-based authentication with bcrypt password hashing
- **User Profiles** - Customize your profile with name, bio, and avatar
- **Session Management** - Stay logged in with persistent sessions
- **User-Specific Closets** - Each user has their own private wardrobe

## Installation

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

New dependencies added:
- `passlib[bcrypt]` - Password hashing
- `python-jose[cryptography]` - JWT token handling
- `PyJWT` - JSON Web Tokens

### 2. Database Migration

The database schema has been updated to include user authentication. If you have existing data, it will need migration.

**Option A: Fresh Start (Recommended)**
```bash
# Delete old database
rm backend/closet.db

# Start the application (database will be created automatically)
cd backend
python main.py
```

**Option B: Keep Existing Data**
You'll need to manually add user_id column to existing clothing_items. Contact for migration script.

### 3. Run the Application

```bash
cd backend
python main.py
```

The app will be available at: `http://localhost:8000`

## First Time Setup

### 1. Create an Account
- Visit `http://localhost:8000`
- You'll be redirected to the registration page
- Fill in your details:
  - Full Name (optional)
  - Username (required, unique)
  - Email (required, unique)
  - Password (minimum 6 characters)
- Click "Create Account"

### 2. Login
- Use your username and password
- Your session will be saved for 7 days

### 3. Explore Features
- **Upload Tab**: Add clothing items with AI classification
- **My Closet**: View and manage your wardrobe
- **Outfits**: Get AI-powered outfit recommendations
- **Stats**: See analytics about your closet
- **Profile**: Update your personal information

## UI Features

### Theme Toggle
- Click the moon/sun icon in the header
- Automatically saves your preference
- Applies to all future sessions

### User Menu
- Click on your avatar/name in the header
- Access Profile and Logout options

### Profile Management
- Update your full name
- Add a bio
- View account creation date
- See last login time

### Enhanced Closet View
- Cards lift and scale on hover
- Smooth transitions and animations
- Color swatches for each item
- Clean/dirty status indicators
- Wear count tracking

## Security Notes

### Important for Production

1. **Change Secret Key**
   Edit `backend/auth.py`:
   ```python
   SECRET_KEY = os.getenv("SECRET_KEY", "your-production-secret-key-here")
   ```
   
   Set environment variable:
   ```bash
   export SECRET_KEY="your-very-secure-random-key-here"
   ```

2. **Use HTTPS**
   - JWT tokens should only be transmitted over HTTPS in production
   - Configure your web server (nginx, apache) with SSL certificates

3. **Password Requirements**
   - Current minimum: 6 characters
   - Consider adding complexity requirements for production

## API Authentication

All API endpoints (except `/api/auth/register` and `/api/auth/login`) now require authentication.

### Making Authenticated Requests

Include the JWT token in the Authorization header:

```javascript
fetch('/api/closet', {
    headers: {
        'Authorization': 'Bearer YOUR_JWT_TOKEN'
    }
})
```

### Token Storage
- Tokens are stored in localStorage
- Valid for 7 days
- Automatically included in all requests by the frontend

## Troubleshooting

### Login Issues
- Clear browser localStorage: `localStorage.clear()` in browser console
- Check if backend is running on port 8000
- Verify username/password are correct

### Database Issues
- Delete `backend/closet.db` and restart (will lose data)
- Check file permissions on database file

### Token Expiration
- Tokens expire after 7 days
- You'll be redirected to login automatically
- Just log in again to continue

## File Structure

```
Closet-Org/
├── backend/
│   ├── main.py                      # FastAPI app with auth endpoints
│   ├── auth.py                      # NEW: Authentication utilities
│   ├── database/
│   │   └── db_manager.py           # UPDATED: User management
│   └── models/
│       ├── clothing_classifier.py
│       └── outfit_recommender.py
├── frontend/
│   ├── index.html                   # UPDATED: Profile tab, user menu
│   ├── login.html                   # NEW: Login page
│   ├── register.html                # NEW: Registration page
│   ├── styles.css                   # UPDATED: Dark mode, glassmorphism
│   ├── auth.css                     # NEW: Auth pages styling
│   ├── script.js                    # UPDATED: Auth checks, profile
│   └── auth.js                      # NEW: Login/register logic
├── requirements.txt                 # UPDATED: New dependencies
├── README.md
└── SETUP_GUIDE.md                   # This file
```

## Tips for Best Experience

1. **Use Modern Browser**: Chrome, Firefox, Safari, or Edge (latest versions)
2. **Enable JavaScript**: Required for all functionality
3. **Upload Quality Photos**: Better photos = better AI classification
4. **Regular Updates**: Mark items as worn/washed for accurate stats
5. **Dark Mode**: Try dark mode for a sleek evening experience

## Support

For issues or questions:
- Check the troubleshooting section above
- Review the main README.md
- Check browser console for errors (F12 → Console tab)

---

**Enjoy your new AI-powered closet organizer! 👕✨**

