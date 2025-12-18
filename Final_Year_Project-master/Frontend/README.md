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
