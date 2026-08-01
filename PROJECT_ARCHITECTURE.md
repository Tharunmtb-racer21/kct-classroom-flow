# KCT PULSE — Project Architecture & Developer Reference

## 🚀 Overview
**KCT PULSE** is a real-time classroom engagement platform built for Kumaraguru College of Technology (KCT). It empowers faculty to host interactive live lectures with real-time polling, animated word clouds, quizzes, and slide embeds (for Google Slides & PowerPoint).

---

## 🛠️ Technology Stack
- **Frontend & Router**: React 18, TanStack Router (SSR / TanStack Start), Vite, TailwindCSS, Lucide Icons, Shadcn UI.
- **Authentication**: Firebase Authentication (Restricted to KCT institutional emails `@kct.ac.in`).
- **Database & Realtime**: Supabase Postgres + Supabase Realtime Channels.
- **Hosting & Deployment**: Vercel Serverless Functions (`main` branch synced with Lovable).

---

## 🔑 Key Hidden Routes & Access Points

| Route Path | Description | Access Level |
| :--- | :--- | :--- |
| `/` | Landing page & Faculty login redirect | Public |
| `/auth` | Faculty Sign In / Sign Up page | Public |
| `/dashboard` | Faculty Session Management & Control Panel | Authenticated Faculty |
| `/dashboard/session/$id` | Live Session Control Room (Poll controls, charts, QR code) | Session Creator |
| `/join/$code` | Student Live Join & Answering Interface | Students (No Login Required) |
| `/embed/$code` | PowerPoint / Google Slides Live iFrame Embed View | Public / Embedded iFrame |
| `/developer` | System Telemetry, Faculty Monitor & Database Health | **Password Protected: `Pulse_2026`** |

> [!NOTE]
> The `/developer` route is hidden from the sidebar menu and can only be accessed by manually entering `/developer` in the browser URL bar.

---

## 🗄️ Database Schemas (Supabase Postgres)

### 1. `sessions`
- `id` (uuid, primary key)
- `title` (text) — Session title (e.g. "Linear PDE", "Chemistry")
- `code` (text, unique) — 6-character short code (e.g. `KCTJR9`)
- `status` (text) — `'draft' | 'live' | 'ended'`
- `creator_id` (text) — Firebase UID of the faculty creator
- `created_at` (timestamptz)
- `current_question_id` (uuid, optional) — Active question ID currently projected
- `all_active` (boolean) — True when all questions are active at once
- `active_question_ids` (jsonb / text[]) — Array of active question IDs
- `expires_at` (timestamptz, optional) — 1-hour expiration timestamp for auto-draft cleanup
- `image_url` (text, optional) — Uploaded session banner image

### 2. `questions`
- `id` (uuid, primary key)
- `session_id` (uuid, foreign key -> `sessions.id`)
- `type` (text) — `'poll' | 'wordcloud' | 'quiz'`
- `title` (text) — Question prompt text
- `options` (jsonb / text[]) — Answer choices for polls/quizzes
- `correct_answer` (text, optional) — Correct option key for quizzes
- `order_index` (integer) — Display order in presentation
- `image_url` (text, optional) — Uploaded question diagram image
- `created_at` (timestamptz)

### 3. `participants`
- `id` (uuid, primary key)
- `session_id` (uuid, foreign key -> `sessions.id`)
- `name` (text) — Student display name
- `joined_at` (timestamptz)

### 4. `responses`
- `id` (uuid, primary key)
- `question_id` (uuid, foreign key -> `questions.id`)
- `participant_id` (uuid, foreign key -> `participants.id`)
- `answer` (text) — Selected option or submitted word cloud text
- `created_at` (timestamptz)

### 5. `profiles`
- `id` (text, primary key) — Firebase UID
- `email` (text) — Faculty email address
- `full_name` (text) — Faculty full name
- `avatar_url` (text, optional)
- `created_at` (timestamptz)

---

## ⚡ Background Automation Systems

1. **1-Hour Auto-Draft Cleanup**:
   - Implemented in `src/lib/session-utils.ts` (`autoDraftStaleSessions()`).
   - Runs on app mount and on a 60-second background timer in `src/routes/__root.tsx`.
   - Reverts any live session active for > 1 hour or past `expires_at` back to `status = 'draft'`.

2. **Faculty Inactivity Logout**:
   - Implemented in `src/routes/_authenticated/route.tsx`.
   - Automatically signs out faculty members after 30 minutes of user inactivity.

3. **Faculty Profile Auto-Sync**:
   - Automatically syncs Firebase user email and display name to the Supabase `profiles` table on dashboard load.

---

## 📂 Key Source Code Map

```
src/
├── components/
│   ├── app-sidebar.tsx              # Navigation sidebar layout
│   ├── theme-toggle.tsx             # Dark / Light theme switcher
│   └── ui/                          # Shadcn UI primitives (button, dialog, tabs, etc.)
├── integrations/
│   └── supabase/
│       ├── client.ts                # Supabase JS client setup
│       └── types.ts                 # Auto-generated Supabase database type definitions
├── lib/
│   ├── firebase.ts                  # Firebase auth initialization & config
│   ├── session-utils.ts             # Auto-draft stale sessions cleanup helper
│   ├── pdf-generator.ts             # PDF export utility for lecture reports
│   └── utils.ts                     # Classname merger (clsx + tailwind-merge)
└── routes/
    ├── __root.tsx                   # Root router component, theme sync & global auto-draft timer
    ├── auth.tsx                     # Faculty login / registration page
    ├── developer.tsx                # Password-gated telemetry portal (Password: Pulse_2026)
    ├── embed.$code.tsx              # Frameless slide embed view for PowerPoint / Google Slides
    ├── join.$code.tsx               # Student real-time response view
    └── _authenticated/
        ├── route.tsx                # Authenticated route guard & 30-min inactivity timer
        ├── dashboard.tsx            # Main dashboard container
        ├── dashboard.index.tsx      # Faculty analytics dashboard home
        ├── dashboard.sessions.tsx   # Session management list
        ├── dashboard.session.$id.tsx# Live Session Control Room (Host polls, charts & QR code)
        ├── dashboard.reports.tsx    # Post-session analytics & PDF export
        └── dashboard.profile.tsx    # Faculty profile settings
```
