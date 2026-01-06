import { useState, useRef, useEffect } from 'react'
import './App.css'

const WS_URL = ''

function App() {
  const [isConnected, setIsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [messages, setMessages] = useState([])
  const [error, setError] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [transcriptionHistory, setTranscriptionHistory] = useState([])
  const [userTranscript, setUserTranscript] = useState('')
  
  const wsRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioStreamRef = useRef(null)
  const processorRef = useRef(null)
  const playbackContextRef = useRef(null)
  const audioQueueRef = useRef([])
  const isPlayingRef = useRef(false)

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (wsRef.current) {
        wsRef.current.close()
      }
      stopRecording()
      if (playbackContextRef.current) {
        playbackContextRef.current.close()
      }
    }
  }, [])

  const connect = async () => {
    try {
      setError(null)
      console.log('Attempting to connect to:', URL)
      addMessage('system', `Connecting to: ${WS_URL}`)
      const ws = new WebSocket(WS_URL)
      
      ws.onopen = () => {
        console.log('Connected to backend')
        setIsConnected(true)
        addMessage('system', 'Connected to server. Ready to start recording!')
      }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('Received from server:', data)
          
          // Handle different message types from OpenAI Realtime API
          switch(data.type) {
            case 'session.created':
            case 'session.updated':
              addMessage('system', 'Session configured successfully')
              break
              
            case 'conversation.item.created':
              if (data.item?.content) {
                data.item.content.forEach(content => {
                  if (content.transcript) {
                    addMessage('user', content.transcript)
                    addTranscription('user', content.transcript)
                  }
                })
              }
              break
              
            case 'input_audio_buffer.committed':
              // Audio buffer has been committed for processing
              addMessage('system', '✓ Audio committed for processing')
              break
              
            case 'conversation.item.input_audio_transcription.completed':
              // User's speech transcription completed
              if (data.transcript) {
                setUserTranscript(data.transcript)
                addTranscription('user', data.transcript)
              }
              break
              
            case 'response.audio_transcript.delta':
              setTranscript(prev => prev + (data.delta || ''))
              break
              
            case 'response.audio_transcript.done':
              if (data.transcript) {
                addMessage('assistant', data.transcript)
                addTranscription('assistant', data.transcript)
                setTranscript('')
              }
              break
              
            case 'response.audio.delta':
              // Audio response from OpenAI - could play this
              if (data.delta) {
                playAudioDelta(data.delta)
              }
              break
              
            case 'input_audio_buffer.speech_started':
              addMessage('system', '🎤 Speech detected...')
              break
              
            case 'input_audio_buffer.speech_stopped':
              addMessage('system', '✓ Speech ended, processing...')
              break
              
            case 'input_audio_buffer.cleared':
              addMessage('system', '🗑️ Audio buffer cleared')
              setUserTranscript('')
              break
              
            case 'response.done':
              addMessage('system', '✓ Response complete')
              break
              
            case 'error':
              addMessage('error', `Error: ${data.error?.message || data.error || 'Unknown error'}`)
              break
          }
        } catch (err) {
          console.error('Error parsing message:', err)
        }
      }
      
      ws.onerror = (err) => {
        console.error('WebSocket error:', err)
        console.error('Failed to connect to:', WS_URL)
        setError(`WebSocket connection error. Check if backend is running at: ${WS_URL}`)
        setIsConnected(false)
      }
      
      ws.onclose = (event) => {
        console.log('Disconnected from backend. Code:', event.code, 'Reason:', event.reason)
        setIsConnected(false)
        addMessage('system', `Disconnected from server (Code: ${event.code})`)
      }
      
      wsRef.current = ws
    } catch (err) {
      setError(`Connection error: ${err.message}`)
      console.error('Connection error:', err)
    }
  }

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    stopRecording()
    
    // Clean up playback context
    if (playbackContextRef.current) {
      playbackContextRef.current.close()
      playbackContextRef.current = null
    }
    audioQueueRef.current = []
    isPlayingRef.current = false
    setIsPlayingAudio(false)
    
    // Clear transcription data
    setUserTranscript('')
    
    setIsConnected(false)
  }

  const startRecording = async () => {
    try {
      setError(null)
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      })
      
      audioStreamRef.current = stream
      
      // Create audio context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
      })
      audioContextRef.current = audioContext
      
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      
      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const inputData = e.inputBuffer.getChannelData(0)
          
          // Convert Float32Array to Int16Array (PCM16)
          const pcm16 = new Int16Array(inputData.length)
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]))
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }
          
          // Convert to base64
          const base64Audio = btoa(
            String.fromCharCode(...new Uint8Array(pcm16.buffer))
          )
          
          // Send to backend in OpenAI Realtime API format
          const message = {
            type: 'input_audio_buffer.append',
            audio: base64Audio
          }
          
          wsRef.current.send(JSON.stringify(message))
        }
      }
      
      source.connect(processor)
      processor.connect(audioContext.destination)
      processorRef.current = processor
      
      setIsRecording(true)
      addMessage('system', '🎤 Recording started - Speak in Telugu!')
      
    } catch (err) {
      setError(`Microphone access error: ${err.message}`)
      console.error('Recording error:', err)
    }
  }

  const stopRecording = () => {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop())
      audioStreamRef.current = null
    }
    
    setIsRecording(false)
    addMessage('system', '⏹️ Recording stopped')
  }

  const playAudioDelta = async (base64Audio) => {
    try {
      // Initialize playback audio context if needed
      if (!playbackContextRef.current) {
        playbackContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 24000
        })
      }
      
      const audioContext = playbackContextRef.current
      
      // Decode base64 to binary
      const binaryString = atob(base64Audio)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      // Convert to Int16Array (PCM16)
      const pcm16 = new Int16Array(bytes.buffer)
      
      // Convert PCM16 to Float32 for Web Audio API
      const float32 = new Float32Array(pcm16.length)
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF)
      }
      
      // Create audio buffer
      const audioBuffer = audioContext.createBuffer(1, float32.length, 24000)
      audioBuffer.getChannelData(0).set(float32)
      
      // Add to queue
      audioQueueRef.current.push(audioBuffer)
      
      // Start playing if not already playing
      if (!isPlayingRef.current) {
        playNextInQueue()
      }
    } catch (err) {
      console.error('Error playing audio:', err)
    }
  }
  
  const playNextInQueue = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false
      setIsPlayingAudio(false)
      return
    }
    
    isPlayingRef.current = true
    setIsPlayingAudio(true)
    const audioBuffer = audioQueueRef.current.shift()
    const audioContext = playbackContextRef.current
    
    if (!audioContext) return
    
    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioContext.destination)
    
    source.onended = () => {
      playNextInQueue()
    }
    
    source.start(0)
  }

  const addMessage = (type, content) => {
    setMessages(prev => [...prev, { type, content, timestamp: new Date() }])
  }

  const addTranscription = (speaker, text) => {
    setTranscriptionHistory(prev => [...prev, { 
      speaker, 
      text, 
      timestamp: new Date().toLocaleTimeString() 
    }])
  }

  const clearMessages = () => {
    setMessages([])
    setTranscript('')
  }

  const clearTranscriptionHistory = () => {
    setTranscriptionHistory([])
    setUserTranscript('')
  }

  const clearAudioBuffer = () => {
    // Send command to clear the input audio buffer
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = {
        type: 'input_audio_buffer.clear'
      }
      wsRef.current.send(JSON.stringify(message))
      addMessage('system', '🗑️ Audio buffer cleared')
    }
  }

  const commitAudioBuffer = () => {
    // Manually commit the audio buffer for processing
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = {
        type: 'input_audio_buffer.commit'
      }
      wsRef.current.send(JSON.stringify(message))
      addMessage('system', '✓ Audio buffer committed')
    }
  }

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>🎤 Telugu Speech Correction</h1>
          <p>Speak in Telugu, get corrected in English</p>
        </header>

        <div className="controls">
          <div className="connection-controls">
            {!isConnected ? (
              <button onClick={connect} className="btn btn-primary">
                Connect to Server
              </button>
            ) : (
              <button onClick={disconnect} className="btn btn-secondary">
                Disconnect
              </button>
            )}
            <span className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
          </div>

          {isConnected && (
            <div className="recording-controls">
              {!isRecording ? (
                <button onClick={startRecording} className="btn btn-record">
                  🎤 Start Recording
                </button>
              ) : (
                <button onClick={stopRecording} className="btn btn-stop">
                  ⏹️ Stop Recording
                </button>
              )}
              {isRecording && (
                <>
                  <span className="recording-indicator">
                    🔴 Recording...
                  </span>
                  <button onClick={clearAudioBuffer} className="btn btn-small">
                    🗑️ Clear Audio
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {transcript && (
          <div className="live-transcript">
            <strong>AI is speaking:</strong> {transcript}
          </div>
        )}

        {isPlayingAudio && (
          <div className="audio-playing-indicator">
            🔊 Playing AI response...
          </div>
        )}

        {userTranscript && (
          <div className="user-transcript-box">
            <strong>Your Telugu speech (transcribed):</strong> {userTranscript}
          </div>
        )}

        {transcriptionHistory.length > 0 && (
          <div className="transcription-history">
            <div className="transcription-header">
              <h3>📝 Transcription History</h3>
              <button onClick={clearTranscriptionHistory} className="btn btn-small">
                Clear History
              </button>
            </div>
            <div className="transcription-list">
              {transcriptionHistory.map((item, idx) => (
                <div key={idx} className={`transcription-item transcription-${item.speaker}`}>
                  <div className="transcription-meta">
                    <span className="transcription-speaker">
                      {item.speaker === 'user' ? '👤 You (Telugu)' : '🤖 AI (English)'}
                    </span>
                    <span className="transcription-time">{item.timestamp}</span>
                  </div>
                  <div className="transcription-text">{item.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="messages-container">
          <div className="messages-header">
            <h2>Conversation</h2>
            {messages.length > 0 && (
              <button onClick={clearMessages} className="btn btn-small">
                Clear
              </button>
            )}
          </div>
          <div className="messages">
            {messages.length === 0 ? (
              <div className="empty-state">
                <p>Connect to the server and start recording to begin your English learning session!</p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`message message-${msg.type}`}>
                  <span className="message-type">
                    {msg.type === 'user' && '👤 You:'}
                    {msg.type === 'assistant' && '🤖 AI:'}
                    {msg.type === 'system' && 'ℹ️ System:'}
                    {msg.type === 'error' && '⚠️ Error:'}
                  </span>
                  <span className="message-content">{msg.content}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="info-box">
          <h3>ℹ️ How it works</h3>
          <ol>
            <li>Click "Connect to Server" to establish connection</li>
            <li>Click "Start Recording" to begin speaking</li>
            <li>Speak in Telugu - the AI will listen and understand</li>
            <li>See your Telugu speech transcribed in the yellow box</li>
            <li>The AI will correct you and respond in English (audio + text)</li>
            <li>Listen to the AI's spoken response through your speakers 🔊</li>
            <li>Review the complete transcription history with timestamps 📝</li>
            <li>Click "Clear Audio" during recording to reset the audio buffer 🗑️</li>
            <li>Click "Stop Recording" when done</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

export default App

