# Ffion Tracker

> **⚠️ Warning:** If this line is present, this means this project was vibe-coded and I haven't done a thorough review of it. Use at your own risk.

An ATProto-based social network for tracking Ffion the cat's activities. This project combines real-time cat detection using YOLO with automatic posting to an ATProto PDS.

## Features

- 🐱 Real-time cat detection using YOLOv8
- 📸 Automatic image capture when cat is detected
- 🤖 Image description generation
- 📡 Automatic posting to ATProto PDS
- 💾 Persistent OAuth session storage with SQLite
- 🌐 Browser-based OAuth login flow

## Setup

### 1. Node.js Server (WSL/Linux)

Install dependencies:
```bash
npm install
```

Start the server:
```bash
node server.js
```

The server will be available at `http://127.0.0.1:3000`

### 2. Authentication

Visit http://127.0.0.1:3000/login (or http://localhost:3000/login from Windows) in your browser:
1. Enter your ATProto handle (e.g., `your-handle.bsky.social`)
2. Complete the OAuth flow
3. After successful login, visit http://127.0.0.1:3000/get-cookie
4. Copy the cookie value and create a `cookies.txt` file:

```
# Netscape HTTP Cookie File
127.0.0.1	FALSE	/	FALSE	0	ffion_sid	<your-cookie-value-here>
```

**Note:** You only need to authenticate once! The session is stored persistently in SQLite and will survive server restarts.

### 3. Python Cat Detector

#### For WSL Users (Recommended)

Since WSL doesn't have direct webcam access, run the Python script on Windows while keeping the server in WSL:

**On Windows:**
```bash
# Install Python dependencies
pip install -r requirements.txt

# Copy the cookies.txt file to the same directory

# Run the Windows version
python cat_detector_windows.py
```

The Windows script will connect to the WSL server via `localhost:3000`.

#### For Linux/Mac Users

```bash
# Install Python dependencies
pip install -r requirements.txt

# Run the detector
python3 cat_detector.py
```

## How It Works

1. **Server** (Node.js in WSL/Linux):
   - Handles OAuth authentication with ATProto
   - Stores sessions persistently in SQLite
   - Provides API endpoint to post cat statuses

2. **Cat Detector** (Python on Windows/Linux):
   - Monitors webcam feed using OpenCV
   - Detects cats using YOLOv8 (class ID 15)
   - Generates image descriptions
   - Posts images and descriptions to the server

3. **Session Persistence**:
   - OAuth tokens stored in SQLite database
   - Automatic token refresh
   - No need to re-authenticate after server restarts

## Configuration

Edit the configuration variables in `cat_detector.py` or `cat_detector_windows.py`:

```python
WEBCAM_INDEX = 0              # Camera index
CONFIDENCE_THRESHOLD = 0.5    # Detection confidence (0.0-1.0)
COOLDOWN_SECONDS = 60         # Wait time between detections
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Windows (or Host OS)                          │
│  ┌───────────────────────────────────────┐    │
│  │  Python Cat Detector                   │    │
│  │  - Webcam access                       │    │
│  │  - YOLO detection                      │    │
│  │  - Image description                   │    │
│  └───────────────┬───────────────────────┘    │
│                  │ HTTP POST                   │
│                  │ localhost:3000              │
└──────────────────┼─────────────────────────────┘
                   │
┌──────────────────▼─────────────────────────────┐
│  WSL/Linux                                     │
│  ┌───────────────────────────────────────┐    │
│  │  Node.js Server                        │    │
│  │  - OAuth authentication                │    │
│  │  - SQLite session storage              │    │
│  │  - ATProto integration                 │    │
│  └───────────────┬───────────────────────┘    │
└──────────────────┼─────────────────────────────┘
                   │
                   │ OAuth/HTTPS
                   │
┌──────────────────▼─────────────────────────────┐
│  ATProto PDS                                   │
│  - Store cat status records                    │
│  - Store images as blobs                       │
└────────────────────────────────────────────────┘
```

## Available States

- `com.ffion.eating` - Ffion is eating
- `com.ffion.zoomies` - Ffion is being insane
- `com.ffion.playing` - Ffion is playing
- `com.ffion.sleeping` - Ffion is sleeping

## API Endpoints

- `GET /` - View latest Ffion status
- `GET /login` - Browser-based login page
- `POST /login` - Initiate OAuth flow (JSON API)
- `GET /oauth/callback` - OAuth callback
- `GET /get-cookie` - Get session cookie for Python script
- `POST /ffion/status` - Post a cat status (authenticated)
- `GET /session` - Check authentication status

## Project Structure

```
lexicons/com/ffion/     # Lexicon schema definitions
├── eating.json         # Token: eating state
├── zoomies.json        # Token: zoomies state
├── playing.json        # Token: playing state
├── sleeping.json       # Token: sleeping state
├── status.json         # Record: status update with state, text, image, timestamp
└── listStatuses.json   # Query: list status records

server.js               # Express API server with OAuth and ATProto integration
auth-storage.js         # SQLite-based persistent session storage
oauth-client.js         # OAuth client configuration
lexicons.js             # Loads all lexicons and validates
cat_detector.py         # Cat detection script for Linux/Mac
cat_detector_windows.py # Cat detection script for Windows
requirements.txt        # Python dependencies
```

## Future Improvements

- [ ] Integrate local vision model (LLaVA) for better image descriptions
- [ ] Add support for multiple cats
- [ ] Activity tracking and analytics
- [ ] Mobile app integration
- [ ] Real-time notifications
