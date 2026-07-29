# ⚡ KCT PULSE — Real-time Classroom Engagement

<div align="center">

[![Vercel Deployment](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://kct-classroom-flow.vercel.app)
[![Powered by Supabase](https://img.shields.io/badge/Backend-Supabase-green?style=for-the-badge&logo=supabase)](https://supabase.com)
[![Firebase Auth](https://img.shields.io/badge/Auth-Firebase-orange?style=for-the-badge&logo=firebase)](https://firebase.google.com)
[![Kumaraguru College](https://img.shields.io/badge/Campus-KCT-blue?style=for-the-badge)](https://kct.ac.in)

**Transforming KCT classrooms into active, interactive learning environments.** 

[Explore Live Web App 🚀](https://kct-classroom-flow.vercel.app) • [Faculty Portal 🔑](https://kct-classroom-flow.vercel.app/auth)

---

<img src="./public/kct-temple-bg-opt.jpg" width="800" style="border-radius: 16px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" alt="KCT Campus Banner" />

</div>

---

### ✨ Core Features

*   📊 **Instant Audience Polls** — Launch multi-choice polls with live, animating bar charts.
*   ☁️ **Real-time Word Clouds** — Watch student inputs dynamically form interactive, sizing word clusters.
*   🤖 **Multi-Provider AI Engine** — Generates questions instantly using an automated fallback list (**NVIDIA NIM (Primary)** → **Groq** → **Google AI Studio** → **Together AI**) ensuring high-availability (16,000+ free queries/day) scale for up to **600+ faculty members**.
*   ⚡ **One-Click Activate & Deactivate All** — Simple controls to make all session questions active at once or shut down the active state instantly.
*   ⏱️ **Live Countdown Timer Sync** — Syncs Auto Play timers in real-time to student screens with active seconds-left countdown headers.
*   🛡️ **Anti-Repetition Check** — Browser validation checks Supabase responses on reload, locking student inputs to prevent double submissions.
*   📈 **Rich Reports Breakdown** — Expanded analytical reports displaying student names alongside their exact answered text values for audits.
*   🔒 **Secure Faculty Control** — Simple sign-in portal via Microsoft OAuth or institutional credentials powered by Firebase Auth.

---

### 🛠️ Architecture & Tech Stack

Our platform is engineered for high performance, sub-second latency, and scale.

```mermaid
graph TD
    A[React Front-end] -->|Supabase Realtime| B[Database Subscriptions]
    A -->|Firebase Auth| C[User Verification]
    A -->|NVIDIA NIM / Groq / Google AI| D[Multi-Provider AI Layer]
    A -->|Vercel Edge| E[Serverless Functions]
```

*   **Framework:** React 19 + [Vite](https://vite.dev) + [TanStack Router & Start](https://tanstack.com/router)
*   **Database & Subscriptions:** [Supabase](https://supabase.com) (PostgreSQL + Realtime Channel Engines)
*   **Authentication:** [Firebase Authentication](https://firebase.google.com) (Faculty accounts, Microsoft OAuth SSO)
*   **AI API Switching:** Dynamic runtime provider failover implementation (`src/lib/ai-service.ts`)
*   **Styling & Components:** Tailwind CSS + Radix UI + Lucide Icons
*   **Hosting:** [Vercel](https://vercel.com) (Edge Network)

---

### 🚀 Getting Started

#### 1. Clone the repository
```bash
git clone https://github.com/navneethvaradharaj11-dev/kct-classroom-flow.git
cd kct-classroom-flow
```

#### 2. Install dependencies
```bash
npm install
```

#### 3. Setup Environment Variables
Create a `.env` file in the root directory:
```env
SUPABASE_URL="your-supabase-url"
SUPABASE_PUBLISHABLE_KEY="your-supabase-key"
VITE_FIREBASE_API_KEY="your-firebase-key"
VITE_FIREBASE_AUTH_DOMAIN="your-auth-domain"
VITE_FIREBASE_PROJECT_ID="your-project-id"
VITE_FIREBASE_STORAGE_BUCKET="your-storage-bucket"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"

# AI Multi-Provider API keys
VITE_AI_PROVIDER="nvidia" # Primary fallback driver
VITE_NVIDIA_API_KEY="nvapi-..."
VITE_GROQ_API_KEY="gsk_..."
VITE_GOOGLE_AI_KEY="AIzaSy..."
VITE_TOGETHER_API_KEY="together_..."
```

#### 4. Run Dev Server
```bash
npm run dev
```
Open [http://localhost:8081](http://localhost:8081) to test the app locally.

---

### 👨‍💻 Contributors

This project is built and maintained with ⚡ by:

*   **Navneeth Varadharaj** — [@navneethvaradharaj11-dev](https://github.com/navneethvaradharaj11-dev)
*   **Tharun** — [@Tharunmtb-racer21](https://github.com/Tharunmtb-racer21)

---

<div align="center">
Built for <b>Kumaraguru College of Technology</b>. Character is life.
</div>
