# Closet-Org 👕

An AI-powered web application that helps you organize your closet using computer vision and machine learning.

## Features

### 🤖 AI Clothing Classification
Upload photos of your clothing and let our PyTorch-based AI automatically classify them:
- **Category Detection**: Automatically identifies shirts, pants, dresses, shoes, and more
- **Color Analysis**: Extracts dominant colors from your clothing
- **Style Classification**: Categorizes items as Casual, Formal, Athletic, etc.
- **Season Detection**: Determines if items are best for Winter, Summer, or All-Season

### 📦 Virtual Closet Management
Store and organize all your clothing in one place:
- Visual grid view of all your items
- Filter by category, season, style, and status
- Track which items are clean or need washing
- Monitor how many times you've worn each item

### 👔 Smart Outfit Recommendations
Get AI-powered outfit suggestions based on:
- **Color Theory**: Matches items that complement each other
- **Style Consistency**: Ensures cohesive looks
- **Occasion-Based**: Filter for work, casual, gym, dates, or parties
- **Season-Appropriate**: Get recommendations based on the weather

### 📊 Closet Analytics
Track your wardrobe with detailed statistics:
- Total items in your closet
- Items by category breakdown
- Most frequently worn pieces
- Recently added items
- Clean vs. dirty item counts

## Installation

### Prerequisites
- Python 3.8 or higher
- pip package manager

### Setup Steps

1. **Clone the repository**
```bash
git clone https://github.com/RohinPat/Closet-Org.git
cd Closet-Org
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
```

3. **Run the application**
```bash
cd backend
python main.py
```

4. **Open your browser**
Navigate to: `http://localhost:8000`

## Usage

### Adding Clothing Items
1. Click on the **Upload** tab
2. Drag & drop an image or click to browse
3. The AI will automatically classify your clothing
4. View the results and add to your virtual closet

### Managing Your Closet
1. Go to the **My Closet** tab
2. Use filters to find specific items
3. Click on any item to:
   - Mark as worn/unworn
   - Mark as clean/dirty
   - Delete items

### Getting Outfit Recommendations
1. Navigate to the **Outfits** tab
2. Select an occasion and/or season
3. Click **Generate Outfits**
4. Browse AI-recommended outfit combinations

### Viewing Statistics
1. Click on the **Stats** tab
2. View comprehensive analytics about your wardrobe

## Technology Stack

### Backend
- **FastAPI**: Modern, fast web framework for building APIs
- **PyTorch**: Deep learning framework for clothing classification
- **SQLite**: Lightweight database for storing clothing data
- **Pillow**: Image processing library

### Frontend
- **HTML5/CSS3**: Modern, responsive design
- **Vanilla JavaScript**: No framework dependencies
- **CSS Grid & Flexbox**: Responsive layouts

### AI/ML Components
- **ResNet50**: Pre-trained convolutional neural network
- **Color Analysis**: K-means clustering for dominant color extraction
- **Outfit Recommender**: Custom algorithm using color theory and style matching

## Project Structure

```
Closet-Org/
├── backend/
│   ├── main.py                 # FastAPI application
│   ├── models/
│   │   ├── clothing_classifier.py    # PyTorch classification model
│   │   └── outfit_recommender.py     # Outfit recommendation engine
│   └── database/
│       └── db_manager.py       # SQLite database operations
├── frontend/
│   ├── index.html             # Main web interface
│   ├── styles.css             # Styling
│   └── script.js              # Frontend logic
├── uploads/                   # Uploaded images storage
├── requirements.txt           # Python dependencies
└── README.md                  # This file
```

## API Endpoints

- `POST /api/upload-clothing` - Upload and classify a clothing item
- `GET /api/closet` - Get all clothing items (with optional filters)
- `GET /api/item/{item_id}` - Get specific item details
- `PUT /api/item/{item_id}/status` - Update item worn/washed status
- `DELETE /api/item/{item_id}` - Delete an item
- `GET /api/outfits/recommend` - Get outfit recommendations
- `GET /api/stats` - Get closet statistics

## Future Enhancements

- [ ] Mobile app version (iOS/Android)
- [ ] Advanced outfit scheduling
- [ ] Weather-based recommendations
- [ ] Social features (share outfits)
- [ ] Wardrobe insights and trends
- [ ] Integration with online shopping
- [ ] Barcode/tag scanning
- [ ] Multi-user support

## Contributing

This is a personal project, but suggestions and feedback are welcome! Feel free to open an issue or submit a pull request.

## License

This project is private and for personal use.

## Author

**Rohin Patel**
- GitHub: [@RohinPat](https://github.com/RohinPat)

## Acknowledgments

- PyTorch for the deep learning framework
- FastAPI for the excellent web framework
- ResNet architecture for image classification
