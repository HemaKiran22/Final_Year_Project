# ColonyCarpool 🚗

> A secure, AI-powered ride-sharing platform exclusively for housing society residents.

**Live App →** https://final-year-project-swart-gamma.vercel.app

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Features](#features)
4. [AI & ML Modules](#ai--ml-modules)
5. [Project Structure](#project-structure)
6. [Firebase Data Model](#firebase-data-model)
7. [Environment Variables](#environment-variables)
8. [Getting Started](#getting-started)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Firestore Security Rules](#firestore-security-rules)

---

## Project Overview

ColonyCarpool connects residents of the same housing society for safe, affordable, and eco-friendly daily commutes. Users can post rides, find and join rides, chat privately or in ride groups, and track their environmental and financial impact over time.

The platform is designed around **trust** — users are admin-approved before they can interact, and an AI-driven reliability scoring system rewards consistent ride-sharing behaviour while flagging unreliable patterns.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 7 |
| Routing | React Router DOM 7 |
| Animations | Framer Motion 12 |
| Icons | React Icons 5 |
| Backend / DB | Firebase Firestore (NoSQL, real-time) |
| Authentication | Firebase Auth (email/password) |
| File Storage | Firebase Storage |
| AI Chat API | Vercel Serverless Function (`/api/chat`) |
| LLM Providers | Google Gemini, Groq, OpenAI (configurable) |
| Hosting | Vercel |
| E2E Tests | Playwright 1.58 |

---

## Features

### Authentication
- Email/password sign-up and login via Firebase Auth
- Admin approval gate — new users are placed in `pending_approval` status; the dashboard is only accessible after an admin sets their status to `approved`
- Remember Me (localStorage credential persistence)
- Forgot password via Firebase email reset
- Route guard — unauthenticated users are redirected to `/login`

### Dashboard
- **Post a Ride** — set destination, date, time (AM/PM picker), seats, and price
- **Find a Ride** — real-time search by destination; rides are ranked by an AI recommendation engine
- **My Rides** — sidebar panel listing rides you created or joined, with Cancel / Leave / Confirm / Rate actions
- **Suggested Rides** — AI-clustered groups based on travel patterns (DBSCAN-inspired algorithm)
- **Analytics Widgets** — CO₂ saved, money saved, rides completed (personalised)
- **Activity Feed** — recent ride events in your society
- **Running Late** — one-tap notification to co-riders
- **No-Show Reporting** — flag passengers or drivers who didn't show up (triggers trust score update)
- **Ride Rating** — 1–5 star rating after a ride completes
- Light / Dark theme toggle (persisted in `localStorage`)
- Quick-tour overlay for new members

### Society Feed
- Community posts with text, images, and videos
- Like and comment system
- Firebase Storage media uploads

### Leaderboard
- Top riders ranked by rides shared and reliability score
- Animated position badges

### Private Chat
- One-to-one real-time messaging between riders
- Unread message badges via Firestore `onSnapshot`

### Group Chat
- Per-ride group chat room (automatically created when a ride is posted)
- Real-time messages; membership tied to ride participants

### Profile
- Edit display name, vehicle type, and phone number
- View personal stats: rides completed, CO₂ reduced, money saved
- **Reliability Score** (0–100) with tier badge (High / Medium / Low)
- Achievements / badges panel

### AI Chatbot (Floating)
- Chat widget accessible from every page
- Powered by Gemini-1.5-flash-latest (or Groq / OpenAI via env vars)
- Understands natural language ride queries (`"find me a ride to Koramangala tomorrow at 9am"`)
- Returns personalised ride recommendations and booking guidance
- Falls back to general assistant if no ride intent is detected

### Settings
- Toggle push notification preferences
- Appearance settings

### Help & Support
- In-app FAQ panel

---

## AI & ML Modules

All AI modules are **assistive only** — they surface suggestions and insights but never auto-join, auto-cancel, or auto-block users.

### 1. LLM Chat Service — `src/services/llmService.js`

Multi-provider LLM client with automatic fallback:

```
Gemini Direct → Groq Direct → /api/chat (serverless proxy) → fallback message
```

Configure via environment variables (see [Environment Variables](#environment-variables)).

### 2. NLP Agent — `src/services/nlpAgent.js`

Lightweight, dependency-free intent extractor built on regex patterns:

| Extracted field | Example input | Output |
|-----------------|---------------|--------|
| Destination | `"ride to Koramangala"` | `"Koramangala"` |
| Date | `"tomorrow"`, `"next Monday"` | ISO-8601 date string |
| Time | `"9am"`, `"9:30 PM"` | `"09:30"` |
| Min rating | `"driver rating above 4"` | `4` |

Used by the chatbot to auto-populate the Find a Ride search form.

### 3. Auto-Book Service — `src/services/autoBookService.js`

Finds the best matching open ride for a given intent object and returns a ranked shortlist for user confirmation (no automatic joining).

### 4. Ride Recommendation Engine — `src/services/rideRecommendationService.js`

Multi-factor weighted scoring (sums to 1.0):

| Factor | Weight | Description |
|--------|--------|-------------|
| Destination similarity | 0.35 | Jaccard token + substring match |
| Time proximity | 0.25 | Gaussian decay within ±60 min window |
| Creator reliability | 0.25 | Normalised trust score of ride creator |
| Seat availability | 0.15 | Ratio of remaining / total seats |

Rides scoring ≥ 40 are tagged **"Recommended for You"** and surfaced first in search results.

### 5. Ride Clustering — `src/services/clusteringService.js`

DBSCAN-inspired density-based algorithm that groups users with similar travel patterns into **Suggested Ride Groups**:

- **Destination similarity** — Jaccard + substring (threshold 0.4)
- **Time window** — ±30 minutes
- **Cluster size** — 2–6 members
- Results are cached for 3 minutes to reduce Firestore reads

### 6. Trust & Reliability Model — `src/services/reliabilityService.js`

Behavioural scoring from Firestore signals:

| Signal | Weight | Direction |
|--------|--------|-----------|
| Ride completion rate | 0.35 | Positive |
| Early cancellations | 0.10 | Negative |
| Late cancellations | 0.15 | Negative |
| No-shows | 0.20 | Negative |
| Average rating | 0.20 | Positive |

Outputs a **Reliability Score (0–100)** and tier:

| Score | Tier | Badge |
|-------|------|-------|
| 75–100 | High Reliability | 🟢 |
| 40–74 | Medium Reliability | 🟡 |
| 0–39 | Low Reliability | 🔴 |

Score is persisted on the Firestore user document and read by the recommendation engine and the profile page.

### 7. Chat Agent Service — `src/services/chatAgentService.js`

Orchestrates chat history, context injection (user stats, active rides), and response routing between the NLP intent layer and the LLM service.

---

## Project Structure

```
Final_Year_Project-master/
├── vercel.json                       # Root Vercel config (build + SPA rewrites)
├── firebase.json                     # Firebase hosting + Firestore emulator config
├── firestore.rules                   # Firestore security rules
├── storage.rules                     # Firebase Storage security rules
└── Frontend/
    ├── index.html
    ├── vite.config.js
    ├── playwright.config.js          # E2E test config
    ├── vercel.json                   # Frontend-level Vercel config
    ├── package.json
    ├── TESTING_REPORT.md             # Full per-test E2E results
    ├── api/
    │   └── chat.js                   # Vercel serverless LLM proxy
    ├── tests/                        # Playwright E2E test suite
    │   ├── helpers.js                # Shared login/logout/navigation helpers
    │   ├── 01-auth.spec.js           # 8 auth scenarios
    │   ├── 02-rides.spec.js          # 14 ride scenarios
    │   ├── 03-trust.spec.js          # 7 trust/reliability scenarios
    │   ├── 04-chatbot.spec.js        # 6 chatbot scenarios
    │   ├── 05-dashboard.spec.js      # 7 dashboard scenarios
    │   └── 06-edge-cases.spec.js     # 7 edge case scenarios
    └── src/
        ├── App.jsx                   # Root router
        ├── firebase.js               # Firebase SDK initialisation
        ├── main.jsx
        ├── components/
        │   ├── ClusteredRideGroups.jsx
        │   └── FloatingChatbot.jsx
        ├── services/
        │   ├── llmService.js               # Multi-provider LLM client
        │   ├── nlpAgent.js                 # Regex-based intent extractor
        │   ├── chatAgentService.js         # Chat orchestrator
        │   ├── autoBookService.js          # Auto-book shortlist builder
        │   ├── clusteringService.js        # DBSCAN ride clustering
        │   ├── rideRecommendationService.js# Weighted ride ranking
        │   ├── reliabilityService.js       # Trust score computation
        │   ├── rideActionService.js        # Join / cancel / leave / confirm
        │   ├── ridePostService.js          # Create / update ride documents
        │   └── rideSearchService.js        # Firestore ride queries
        └── Screens/
            ├── LandingPage.jsx / .css
            ├── Login.jsx / .css
            ├── Signup.jsx / .css
            ├── Dashboard.jsx / .css        # Main app screen
            ├── Profile.jsx / .css
            ├── Settings.jsx / .css
            ├── Leaderboard.jsx / .css
            ├── SocietyFeed.jsx / .css
            ├── PrivateChat.jsx / .css
            ├── GroupChat.jsx
            ├── RideChatbot.jsx / .css
            └── HelpSupport.jsx
```

---

## Firebase Data Model

### `users/{uid}`
```json
{
  "displayName": "string",
  "email": "string",
  "phone": "string",
  "vehicleType": "car | auto | bike",
  "status": "pending_approval | approved",
  "reliabilityScore": "0-100",
  "reliabilityTier": "High | Medium | Low",
  "ridesCompleted": "number",
  "co2Saved": "number (kg)",
  "moneySaved": "number (₹)",
  "createdAt": "timestamp"
}
```

### `rides/{rideId}`
```json
{
  "creatorId": "string",
  "destination": "string",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "seats": "number",
  "price": "number (₹)",
  "status": "open | closed | cancelled",
  "participants": [{ "userId": "string", "joinedAt": "ISO string" }],
  "createdAt": "timestamp"
}
```

### `chats/{chatId}/messages/{msgId}`
```json
{ "senderId": "string", "text": "string", "createdAt": "timestamp" }
```

### `posts/{postId}`
```json
{
  "authorId": "string",
  "text": "string",
  "mediaUrl": "string (optional)",
  "likes": ["userId"],
  "comments": [{ "userId": "string", "text": "string" }],
  "createdAt": "timestamp"
}
```

### `ratings/{rideId}_{raterId}`
```json
{
  "rideId": "string",
  "raterId": "string",
  "ratedUserId": "string",
  "score": "1-5",
  "createdAt": "timestamp"
}
```

### `notifications/{notifId}`
```json
{
  "toUserId": "string",
  "type": "ride-joined | message | cancellation | no-show | rate | running-late",
  "text": "string",
  "read": "boolean",
  "createdAt": "timestamp"
}
```

---

## Environment Variables

Create `Frontend/.env.local` (never commit this file):

```env
# ── Firebase Configuration (required) ────────────────────────────
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# ── LLM Configuration (optional) ─────────────────────────────────
# Primary: Gemini (free tier)
VITE_GEMINI_API_KEY=your_gemini_api_key

# Fallback: Groq
VITE_GROQ_API_KEY=your_groq_api_key
VITE_GROQ_MODEL=llama3-8b-8192

# Fallback: OpenAI
VITE_OPENAI_API_KEY=your_openai_api_key

# Override default model (default: gemini-1.5-flash-latest)
VITE_LLM_MODEL=gemini-1.5-flash-latest
```

The app works without LLM keys — the chatbot falls back to a built-in rule-based response layer. Firebase keys are **required** for the app to function.

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- A Firebase project with **Firestore**, **Authentication**, and **Storage** enabled

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/Final_Year_Project.git
cd Final_Year_Project/Final_Year_Project-master/Frontend

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env.local
# Edit .env.local with your Firebase and LLM API keys

# 4. Start the dev server
npm run dev
# App available at http://localhost:5173
```

### Build for Production

```bash
npm run build    # Output in dist/
npm run preview  # Preview production build locally
```

---

## Testing

The project has a full Playwright E2E test suite covering **47 real-world scenarios** against the live production app using two test accounts.

### Test Suite Overview

| File | Scenarios | Coverage area |
|------|-----------|---------------|
| `01-auth.spec.js` | 8 | Login, logout, session persistence, auth errors |
| `02-rides.spec.js` | 14 | Post ride, find & join, cancel, leave ride |
| `03-trust.spec.js` | 7 | Trust score range, reliability badge, leaderboard |
| `04-chatbot.spec.js` | 6 | Chatbot open/close, greeting, NLP queries |
| `05-dashboard.spec.js` | 7 | Analytics widgets, theme toggle, nav links |
| `06-edge-cases.spec.js` | 7 | XSS, long input, session refresh, back-nav |

**Latest result: 47 / 47 passed ✅ (0 failed)**

### Run the Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install

# Full suite (headless)
npm test

# With visible browser window
npm run test:headed

# Single spec file
npx playwright test tests/01-auth.spec.js

# Filter by test name
npx playwright test --grep "TC-AUTH-01"

# Open HTML report after run
npm run test:report

# Interactive debugger
npm run test:debug
```

### Playwright Configuration

| Setting | Value | Reason |
|---------|-------|--------|
| Workers | 1 | Avoids Firebase free-tier rate limiting |
| Retries | 2 | Handles Firestore propagation delays |
| Test timeout | 60 s | Covers Firebase auth + 2 s redirect |
| Browser | Chromium (headless) | Fast, consistent CI results |
| Base URL | Production Vercel URL | Tests the live deployed app |

See [TESTING_REPORT.md](TESTING_REPORT.md) for the full per-test results table and bug observations.

---

## Deployment

The app is deployed on **Vercel**. The configuration in `vercel.json` at the repo root handles the build and SPA routing rewrites.

### Automatic Deployment

Push to `main` → Vercel CI/CD rebuilds and deploys automatically.

### Manual Deploy

```bash
# From repo root
npx vercel --prod
```

### Vercel Environment Variables

Add all `.env.local` variables to the Vercel project under **Settings → Environment Variables**.

### `vercel.json` (root)

```json
{
  "buildCommand": "cd Frontend && npm install && npm run build",
  "outputDirectory": "Frontend/dist",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## Firestore Security Rules

Key rules enforced in `firestore.rules`:

- **Users** — read/write own document only; admin-controlled fields (`status`, `reliabilityScore`) are write-protected on the client
- **Rides** — any approved user can read open rides; only the creator can update or delete
- **Chats** — read/write restricted to chat participants
- **Posts** — any approved user can read; only the author can delete their own post
- **Ratings** — one rating per user per ride, enforced at the rules level

---

## Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve production build locally |
| `npm run lint` | ESLint check across all source files |
| `npm test` | Playwright E2E suite (headless Chromium) |
| `npm run test:headed` | Playwright with visible browser |
| `npm run test:report` | Open Playwright HTML report |
| `npm run test:debug` | Playwright step-through debugger |

---

## License

Developed as a Final Year Engineering Project (2025–2026). All rights reserved.
