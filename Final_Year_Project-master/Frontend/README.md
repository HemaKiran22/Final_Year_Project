# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Explainable AI (XAI)

This app includes explainability for AI decisions in two areas:

- "Why this group?" explanations on AI-clustered ride groups (time window, proximity in km, capacity checks, and a counterfactual tip)
- Trust & Safety score breakdown on the Profile page (identity, behavior, feedback, safety signals)

How to demo:
- Open Dashboard → AI Grouped Rides → Toggle "Why this group?"
- Open Profile → Trust & Safety → Review the meter and breakdown

See the detailed explainer at [docs/XAI_Explainability.md](docs/XAI_Explainability.md).

## AI Used

This project uses classical machine learning for ride grouping (unsupervised learning). It also supports an optional generative AI chatbot:

- K-Means clustering: Groups rides by pickup proximity and time window; see [src/services/clusteringService.js](src/services/clusteringService.js) (`kMeansClustering`).
- DBSCAN (optional): Density-based spatial clustering over pickup latitude/longitude; see `dbscanClustering` in the same file.
- Distance metric: Haversine distance (km) for geographic closeness, weighted with time difference.
- Explainability: We expose “Why this group?” metrics (time spread, average proximity, capacity, counterfactual tip) shown in [src/components/ClusteredRideGroups.jsx](src/components/ClusteredRideGroups.jsx).
- Chatbots:
	- Floating helper: [src/components/FloatingChatbot.jsx](src/components/FloatingChatbot.jsx) now supports LLM answers via `/api/chat`.
	- Default Gemini model: `gemini-1.5-flash-latest` (override with `VITE_LLM_MODEL`).
	- Guided ride finder: [src/Screens/RideChatbot.jsx](src/Screens/RideChatbot.jsx) (no LLM).

### Enable LLM Chat (Optional)

1. Set environment variables (Vercel → Project Settings → Environment Variables or `Frontend/.env`):

	 - For OpenAI: `OPENAI_API_KEY` (project-level secret, not exposed to browser)
	 - For Google Gemini: `GEMINI_API_KEY` (or `GOOGLE_API_KEY`)
	 - In `Frontend/.env`:
		 - `VITE_LLM_PROVIDER=openai` (or `google`)
		 - Optionally `VITE_CHAT_API_URL=/api/chat`

2. Deploy on Vercel. The serverless function lives at `/api/chat` and proxies requests securely to the chosen LLM.

3. Local dev:

	 - Start the frontend:
		 ```bash
		 npm run dev
		 ```
	 - If testing the serverless function locally, use Vercel CLI:
		 ```bash
		 vercel dev
		 ```

If keys are missing, the chatbot falls back with a friendly error.

## Environment Variables

This project uses Vite. Only variables prefixed with `VITE_` are exposed to the browser.

Add a `.env` file in the `Frontend/` folder (or use Vercel → Project Settings → Environment Variables) with:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

A template is provided at `.env.example`. For local dev:

```
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
```

On Vercel:
- Framework Preset: Vite
- Root Directory: `Frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
