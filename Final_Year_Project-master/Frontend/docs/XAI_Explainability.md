# Explainable AI (XAI) in Ride Clustering & Trust

This project implements Explainable AI (XAI) so users and reviewers can see why the AI makes grouping decisions and how trust/safety scores are computed.

## What We Explain

- Ride clustering decisions ("Why this group?")
- Trust & Safety score components and updates

## How We Explain It

### 1) "Why this group?" for clustered rides
We expose human-readable reasons for why rides were grouped, including:
- Time window: whether ride start times are within the configured window (e.g., 30 minutes)
- Time spread: maximum difference between group members' start times (in minutes)
- Proximity: average and per-pair distances using Haversine (km)
- Capacity: vehicle capacity checks and notes if a smaller car would break the group
- Counterfactual tip: simple suggestion to improve match quality (e.g., shift time by X minutes)

Where to see it:
- UI toggle in clustered ride cards: "Why this group?" reveals the explanation fields.
- Code: [Frontend/src/services/clusteringService.js](../src/services/clusteringService.js) computes explanations; [Frontend/src/components/ClusteredRideGroups.jsx](../src/components/ClusteredRideGroups.jsx) displays them.

### 2) Trust & Safety score breakdown
We show the trust score and its contributing signals:
- Identity verification: phone/email verified, society/college ID, photo
- Behavior: ride completion rate, punctuality, cancellation rate
- Social feedback: ratings, reports, mutual contacts
- Safety: past incidents, blocklist checks

Where to see it:
- UI: Profile page shows a trust meter ring and a breakdown card.
- Code: [Frontend/src/Screens/Profile.jsx](../src/Screens/Profile.jsx) & [Frontend/src/Screens/Profile.css](../src/Screens/Profile.css).

## How to Demo to a Teacher

1) Run the app
```bash
cd Frontend
npm install
npm run dev
```
2) Show clustering explanations
- Navigate to Dashboard → AI Grouped Rides
- Expand a group card and toggle "Why this group?"
- Point out time window, proximity, capacity, and the counterfactual tip
3) Show trust breakdown
- Open Profile → Trust & Safety section
- Highlight the meter ring and explanation bullets for identity, behavior, feedback, safety

## Design Principles Followed
- Faithful: Explanations report the same criteria used by the algorithm
- Simple: Plain language metrics (minutes, kilometers, capacity)
- Actionable: Counterfactual tip suggests how to improve the match
- Local: Per-group explanations relevant to each decision

## Configuration & Parameters
- Time window minutes and proximity thresholds are passed from Dashboard to the clustering formatter, allowing tuning.
- Capacity rules depend on `vehicleType` and recorded `seatsAvailable`.

## Files & References
- Clustering explanations: [Frontend/src/services/clusteringService.js](../src/services/clusteringService.js)
- Clustered groups UI: [Frontend/src/components/ClusteredRideGroups.jsx](../src/components/ClusteredRideGroups.jsx)
- Profile trust UI: [Frontend/src/Screens/Profile.jsx](../src/Screens/Profile.jsx)
- Styles: [Frontend/src/Screens/Profile.css](../src/Screens/Profile.css)
- Security rules for group chat membership: [firestore.rules](../../firestore.rules)

## Future Work (Optional)
- Persist explanations to Firestore for audit/debug
- Add driver trust badges to group cards
- Add a small tuning panel for time window and proximity
