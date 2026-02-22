# Manufacturing SOP Training Platform — Frontend

React + TypeScript frontend for the AI-powered SOP training platform. Supports Admin and Employee roles with mobile-friendly layouts.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript |
| Framework | React 19 |
| Bundler | Vite 7 |
| Routing | React Router v7 |
| Data fetching | TanStack Query (React Query) |
| HTTP client | Axios |
| Styling | Tailwind CSS v4 |

---

## Project Structure

```
manufacturing-frontend/
├── src/
│   ├── main.tsx                        # App entry point (providers setup)
│   ├── App.tsx                         # Route definitions
│   ├── index.css                       # Tailwind import
│   ├── types/
│   │   └── index.ts                    # All TypeScript interfaces
│   ├── api/
│   │   └── client.ts                   # Axios instance with JWT interceptor
│   ├── contexts/
│   │   └── AuthContext.tsx             # Auth state, login/logout, localStorage
│   ├── components/
│   │   ├── Layout.tsx                  # Navbar + page wrapper
│   │   └── ProtectedRoute.tsx          # Role-based route guard
│   └── pages/
│       ├── Login.tsx
│       ├── admin/
│       │   ├── Documents.tsx           # Upload PDFs, trigger training
│       │   └── TrainingDetail.tsx      # View training + assign employees
│       └── employee/
│           ├── Trainings.tsx           # List of assigned trainings
│           └── TrainingDetail.tsx      # Read modules + take quiz
├── index.html
├── vite.config.ts
├── tsconfig.json
└── .env.example
```

---

## Environment Variables

Copy `.env.example` to `.env`:

```env
VITE_API_URL=http://localhost:8000
```

---

## Setup & Running

### 1. Install dependencies

```bash
npm install
```

### 2. Start the dev server

```bash
npm run dev
```

App runs at `http://localhost:5173`.

### 3. Build for production

```bash
npm run build
```

Output goes to `dist/`.

---

## Routes

| Path | Role | Description |
|---|---|---|
| `/login` | Public | Email + password login |
| `/admin/documents` | Admin | Upload SOPs, trigger training generation |
| `/admin/trainings/:id` | Admin | View training modules + assign to employees |
| `/employee/trainings` | Employee | List of assigned trainings with status |
| `/employee/trainings/:id` | Employee | Read modules + take quiz + see score |

Visiting `/` redirects to the correct dashboard based on role. Unauthenticated users are redirected to `/login`.

---

## Auth Flow

1. User submits email + password on `/login`.
2. Frontend calls `POST /auth/login` → receives `{ access_token, user }`.
3. Token and user are stored in `localStorage`.
4. Axios attaches `Authorization: Bearer <token>` to every request via an interceptor.
5. On 401, token is cleared and user is redirected to `/login`.
6. On logout, localStorage is cleared and the user is sent to `/login`.

---

## Admin Flow

1. **Upload PDF** — drag-and-drop or click "Upload PDF" on `/admin/documents`.
2. Document appears with status `Uploaded`.
3. Click **Generate Training** — status changes to `Processing…` (polls every 5s automatically).
4. Once ready, status shows `Ready` and a **View Training** button appears.
5. On the training detail page, review modules and quiz questions (read-only).
6. Select employees and click **Assign to selected** to assign the training.

---

## Employee Flow

1. Log in → redirected to `/employee/trainings`.
2. See cards for each assigned training (Not started / Passed / Failed).
3. Click a card → read module content.
4. Scroll to the **Quiz** section, answer all questions.
5. Click **Submit Quiz** → score and pass/fail result are shown immediately.
6. Correct answers are highlighted in green; wrong answers in red with explanations.
7. Retaking the quiz is supported — the latest score overwrites the previous one.

---

## Key Implementation Notes

- **Polling:** `GET /admin/documents` refetches every 5 seconds to catch status changes from the background worker.
- **Quiz state:** Selected answers are tracked in local component state and locked after submission.
- **Pass threshold:** ≥ 80% — enforced by the backend, displayed by the frontend.
- **Token storage:** JWT is kept in `localStorage`. For higher security in production, consider `httpOnly` cookies.
- **Tailwind v4:** Uses the `@tailwindcss/vite` plugin — no `tailwind.config.js` needed. Directives are a single `@import "tailwindcss"` in `index.css`.
- **TypeScript strictness:** `verbatimModuleSyntax` is enabled — always use `import type` for type-only imports.
