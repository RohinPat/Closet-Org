# Quick Start Guide for Closet-Org 🚀

## Installation (First Time Only)

1. **Install Python** (if not already installed)
   - Download from: https://www.python.org/downloads/
   - Version 3.8 or higher required
   - Make sure to check "Add Python to PATH" during installation

2. **Install Dependencies**
   Open Command Prompt or PowerShell in this folder and run:
   ```
   pip install -r requirements.txt
   ```
   
   Note: This may take a few minutes as it downloads PyTorch and other libraries.

## Running the Application

### Option 1: Using the Batch File (Windows)
Simply double-click `start.bat`

### Option 2: Manual Start
1. Open Command Prompt or PowerShell
2. Navigate to this folder
3. Run:
   ```
   cd backend
   python main.py
   ```

### Access the Application
Once the server is running, open your web browser and go to:
```
http://localhost:8000
```

## First Steps

1. **Upload Your First Item**
   - Click on the "Upload" tab
   - Choose a photo of clothing
   - Watch the AI classify it automatically!

2. **Explore Your Closet**
   - Go to "My Closet" to see all your items
   - Use filters to find specific items
   - Click on items to manage their status

3. **Get Outfit Recommendations**
   - Add at least 3-4 items to your closet
   - Go to "Outfits" tab
   - Click "Generate Outfits" to see AI suggestions

## Troubleshooting

### "Command not found: python"
- Try using `python3` instead of `python`
- Make sure Python is installed and in your PATH

### "Module not found" errors
- Run `pip install -r requirements.txt` again
- Make sure you're in the correct directory

### Can't access http://localhost:8000
- Check if the server is running (you should see log messages)
- Make sure no other application is using port 8000
- Try refreshing your browser

### Images not displaying
- Make sure the `uploads` folder exists in the project directory
- Check that you have write permissions in the project folder

## Tips for Best Results

1. **Photo Quality**: Use clear, well-lit photos of clothing items
2. **Background**: Plain backgrounds work best for classification
3. **Single Items**: Photograph one item at a time for accurate classification
4. **Build Your Closet**: Add at least 5-10 items to get good outfit recommendations

## Stopping the Server

Press `Ctrl+C` in the terminal/command prompt where the server is running.

## Need Help?

Check the main README.md for more detailed information and feature documentation.

Enjoy organizing your closet with AI! 👕✨


