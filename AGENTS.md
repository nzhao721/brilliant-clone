# AGENTS.md

## Cursor Cloud specific instructions

SlopeWise is a client-only React + Vite single-page app (TypeScript) backed by Firebase
Auth + Cloud Firestore. There is no separate backend service to run — everything is the Vite
dev server. Standard commands live in `package.json` `scripts`; the notes below only cover
non-obvious caveats.

### Service: web app (Vite SPA)
- Run dev: `npm run dev` (serves on `http://localhost:5173`, not exposed to the network by default).
- Build/typecheck: `npm run build` (`tsc -b` then `vite build`).
- Tests: `npm run test:run` (Vitest, jsdom). `npm test` starts watch mode.
- Lint: there is no ESLint config. The closest checks are `npm run knip` (unused files/exports/deps)
  and the `tsc` typecheck inside `npm run build`.

### Firebase configuration (important gotcha)
- Auth and Firestore are only initialized when all four `VITE_FIREBASE_*` values are present and
  non-placeholder (see `src/lib/firebase.ts`). Copy `.env.example` to `.env` and fill in real
  Firebase web-app values to enable login/signup and progress persistence.
- Without `.env`, `hasFirebaseConfig` is `false`: the login/signup forms are disabled with a
  "configure .env" notice, and the auth-protected routes (`/dashboard`, `/analytics`,
  `/practice`, `/lessons/:id`) redirect to `/login`.
- You do NOT need Firebase to exercise the core interactive lesson engine. The unprotected
  route `/preview-lesson/:lessonId` renders any lesson and runs questions/feedback fully
  client-side (progress is in-memory only). Lesson ids are listed in `firestore.rules` and
  `src/data/lessons.ts` (e.g. `what-changes`).
- Tests disable Firebase by default (`MODE === 'test'`); set
  `VITE_FIREBASE_ENABLE_TEST_SERVICES=true` to opt a test into real Firebase services.
