# Telugu Speech Correction Frontend

React application that captures audio from the user's microphone and streams it to the FastAPI backend for real-time Telugu to English speech correction using OpenAI's Realtime API.

## Features

- 🎤 Real-time audio capture from microphone
- 🌐 WebSocket connection to backend
- 💬 Live conversation display
- 🎨 Modern, responsive UI
- ⚡ Real-time transcription and responses
- 🔊 Audio playback of AI responses through speakers
- 📝 **Transcription history display** - Shows complete history of user (Telugu) and AI (English) transcriptions
- 🗑️ **Clear audio buffer** - Manually clear the input audio buffer during recording
- ⏱️ **Timestamps** - Each transcription shows the exact time it was created

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Start the development server:**
```bash
npm run dev
```

The app will start on `http://localhost:3000`

## Usage

1. Open the app in your browser at `http://localhost:3000`
2. Click "Connect to Server" to establish connection with the backend
3. Click "Start Recording" to begin speaking
4. Speak in Telugu - the AI will:
   - Listen to your speech
   - Understand what you're saying
   - Provide corrections if needed
   - Respond to you in English
5. Click "Stop Recording" when you're done
6. View the conversation history in the messages panel

## Technical Details

### Audio Processing

The app captures audio using the Web Audio API and converts it to PCM16 format:
- Sample rate: 24kHz
- Channel: Mono
- Format: PCM16 (16-bit signed integer)
- Encoding: Base64 for transmission

### WebSocket Communication

The frontend communicates with the backend using WebSocket messages in OpenAI's Realtime API format:

- `input_audio_buffer.append` - Send audio chunks
- `conversation.item.created` - Receive transcriptions
- `response.audio_transcript.delta` - Receive AI response text (streaming)
- `response.audio.delta` - Receive AI response audio (played through speakers)

### Browser Requirements

- Modern browser with WebSocket support
- Microphone access permission
- Web Audio API support (Chrome, Firefox, Edge, Safari)

## Project Structure

```
frontend/
├── src/
│   ├── App.jsx          # Main application component
│   ├── App.css          # Application styles
│   ├── main.jsx         # React entry point
│   └── index.css        # Global styles
├── index.html           # HTML template
├── vite.config.js       # Vite configuration
├── package.json         # Dependencies
└── README.md           # This file
```

## Development

Built with:
- React 18
- Vite (fast build tool)
- Web Audio API
- WebSocket API

## Troubleshooting

**Microphone not working:**
- Check browser permissions for microphone access
- Ensure HTTPS or localhost (required for microphone access)
- Check browser console for errors

**Connection issues:**
- Ensure backend is running on `http://localhost:8000`
- Check browser console for WebSocket errors
- Verify CORS settings in backend

**No audio/transcription:**
- Ensure you're speaking clearly
- Check microphone input levels
- Verify backend has valid OpenAI API key

