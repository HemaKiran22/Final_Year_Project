# Colony Carpool — Frontend

React + Vite frontend for the Colony Carpool ride-sharing app.

## Tech Stack

- **React 19** with Vite 7 for fast HMR and builds
- **Firebase** — Firestore (data), Auth (login/signup), Storage (media)
- **Framer Motion** — landing page animations
- **react-icons** — icon library
- **Vercel** — deployment with serverless functions

## Features

- **Dashboard** — post rides, view your rides, analytics, suggested rides, ratings
- **AI Chatbot** — floating chatbot ([src/components/FloatingChatbot.jsx](src/components/FloatingChatbot.jsx)) powered by LLM via /api/chat serverless function
- **Society Feed** — community posts with likes, comments, media uploads
- **Leaderboard** — top riders ranked by rides shared
- **Private & Group Chat** — real-time messaging between riders
- **Profile** — edit profile, view stats and achievements

## AI Used

- **LLM Chatbot**: The floating chatbot supports natural language ride search, booking, and general help. It calls /api/chat (Vercel serverless) which proxies to Gemini or OpenAI.
  - Default model: gemini-1.5-flash-latest (override with VITE_LLM_MODEL)
  - NLP agent: [src/services/nlpAgent.js](src/services/nlpAgent.js) extracts ride intent from user messages
  - Auto-book: [src/services/autoBookService.js](src/services/autoBookService.js) finds and books best matching rides

### Enable LLM Chat (Optional)

1. Set environment variables (Vercel Project Settings or Frontend/.env):
   - GEMINI_API_KEY (or GOOGLE_API_KEY) for Google Gemini
   - OPENAI_API_KEY for OpenAI
   - VITE_LLM_PROVIDER=google (or openai)

2. Deploy on Vercel. The serverless function at /api/chat proxies requests securely.

3. If keys are missing, the chatbot falls back with a friendly error.

## Environment Variables

Only variables prefixed with VITE_ are exposed to the browser.

Add a .env file in the Frontend/ folder:

`
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
`

A template is provided at .env.example.

## Deployment (Vercel)

- Framework Preset: Vite
- Root Directory: Frontend
- Build Command: 
pm run build
- Output Directory: dist
