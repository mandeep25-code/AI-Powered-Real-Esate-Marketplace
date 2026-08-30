# Lumina Estates — Product Requirements Document

## Original problem statement
Build a premium AI-Powered Real Estate Marketplace using strictly MERN Stack (React.js, Node.js, Express.js, MongoDB) with Google Gemini API. Include JWT authentication with Buyer/Seller roles, listing/search/filtering, wishlist/comparison, AI recommendations and natural-language assistant, AI price/comparable analysis, investment insights, risk detection, seller analytics and suggestions, buyer-seller messaging, and a modern responsive experience.

## Architecture decisions
- React 19 frontend with a responsive luxury real-estate interface and REST API access through `REACT_APP_BACKEND_URL`.
- Node.js + Express API with MongoDB native driver, JWT, bcryptjs, and server-side AI request handling.
- Existing workspace port 8001 is preserved through a small compatibility proxy that launches the Express service on localhost:8002; public API routes remain `/api/*`.
- MongoDB collections: `users`, `properties`, and `messages`. Public responses remove Mongo `_id` values.
- AI assistant attempts Gemini `generateContent` server-side and returns an explicit recommendation fallback when the configured credential is not accepted by Google.

## User personas
- Buyer: explores curated homes, searches by natural language, saves favorites, compares properties, and contacts sellers.
- Seller: signs in with a seller role, enters the seller studio, and manages a listing-oriented dashboard.
- Marketplace operator: maintains curated inventory, AI-fit scores, market signals, and safe role-based access.

## Core requirements (static)
- Buyer/Seller registration and JWT login.
- Seeded luxury property catalog with search, type filtering, detail view, wishlist, and comparison.
- AI assistant with free-form property brief and matching results.
- Price/investment/risk analysis API foundation.
- Seller dashboard metrics and listing entry point.
- Messaging API foundation and responsive premium UI.
- Unique `data-testid` attributes for interactive and critical user-facing elements.

## What's been implemented

### 2026-08-30
- Replaced the starter FastAPI API with a Node/Express marketplace service backed by MongoDB.
- Added seeded properties and demo buyer/seller accounts: `buyer@lumina.demo` and `seller@lumina.demo`, password `Lumina2026!`.
- Added JWT registration/login, role-aware property creation, saved properties, compare state, dashboards, messages, AI assistant, and analysis endpoints.
- Built the Lumina Estates responsive UI with hero search, collection filters, property cards, auth modal, assistant modal, detail/contact modal, dashboard bands, and mobile layout.
- Added server-side Gemini request attempt with graceful `lumina-insights-fallback` response when the universal credential is not accepted by Google.
- Verified production frontend compilation, external API catalog response, browser rendering, and end-to-end marketplace interactions.

## Prioritized backlog

### P0 — remaining for production completion
- Configure a Google-accepted Gemini API credential so assistant, comparable analysis, risk, and investment responses are live rather than fallback.
- Complete seller listing form with image upload, full property fields, edit/delete, and publish moderation.
- Complete message inbox UI and threaded buyer-seller conversations.

### P1
- Add persistent user preference profiles to improve recommendations over time.
- Add saved searches, alerts, pagination, and map-based discovery.
- Add server-side validation schemas, rate limits, audit events, and refresh-token rotation.

### P2
- Add agent profiles and verified listing badges.
- Add mortgage and rental-yield calculators.
- Add shareable comparison reports and scheduled property tours.

## Next tasks
1. Add a Google-accepted Gemini credential and validate live assistant responses.
2. Build the complete seller listing workflow and analytics charts.
3. Build the buyer-seller inbox and conversation detail view.
4. Expand property analysis into a persisted, explainable report.