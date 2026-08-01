# KCT PULSE — UI/UX Design System & Style Guide

Welcome to the **KCT PULSE Design System**. This guide defines the visual identity, UI components, color tokens, typography, and UX principles used across KCT PULSE to ensure a consistent, modern, and high-contrast user experience for both faculty and students.

---

## 🎨 1. Core Visual Identity & Design Aesthetics

### Glassmorphism & Modern Dark Theme
KCT PULSE relies on a **futuristic glassmorphism** design language characterized by:
- Dark background canvases (`#090d16` / HSL dark background).
- Semi-transparent glass container cards with subtle backdrop blurs (`backdrop-blur-md bg-card/60`).
- Thin, glowing borders (`border border-border/60` or `border-primary/30`).
- Smooth rounded corners (`rounded-2xl` and `rounded-3xl` for outer cards).

---

## 🎨 2. Color Palette & Token Scale

| Color Role | CSS / Tailwind Class | Hex / HSL Equivalent | Usage Context |
| :--- | :--- | :--- | :--- |
| **Primary (Brand)** | `bg-primary text-primary-foreground` | Tailored Deep Emerald / Indigo | Primary action buttons, active navigation items, QR shortcodes |
| **Background** | `bg-background` | `#090d16` (Dark) / `#f8fafc` (Light) | App body background |
| **Card (Glass)** | `bg-card/60 backdrop-blur-md` | Semi-transparent | Dashboard widgets, analytics tables, modal dialogs |
| **Emerald (Live State)**| `bg-emerald-500/10 text-emerald-500` | `#10b981` | Active live sessions, positive response feedback, latency pings |
| **Amber (Draft State)** | `bg-amber-500/10 text-amber-500` | `#f59e0b` | Unpublished draft sessions, auto-draft alerts |
| **Purple (Questions)**  | `bg-purple-500/10 text-purple-500` | `#a855f7` | Question prompts, poll metrics, response counts |
| **Blue (Participants)**| `bg-blue-500/10 text-blue-500` | `#3b82f6` | Student participant counts, join notifications |

---

## 🔤 3. Typography Hierarchy

KCT PULSE uses clean sans-serif typography (`Inter` / system sans-serif) with strong font weight contrast:

```
Hero Headlines      -> 3xl / 2xl  font-black tracking-tight
Section Titles      -> lg / xl    font-extrabold tracking-tight
Card Titles         -> sm / base  font-bold text-foreground
Labels & Subtext    -> xs / 11px  font-semibold text-muted-foreground uppercase
Shortcodes & Monospace-> base / lg font-mono font-black tracking-widest
```

---

## 🧩 4. UI Components & Component Patterns

### A. Action Buttons (`src/components/ui/button.tsx`)
1. **Primary Button**:
   ```tsx
   <Button className="bg-primary text-primary-foreground font-bold shadow-md hover:bg-primary/90 rounded-xl">
     Launch Live Session
   </Button>
   ```
2. **Status Pill (Live / Draft / Ended)**:
   ```tsx
   // Live Badge
   <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
     🟢 Live
   </span>
   ```

### B. Glass Cards (`.glass`)
Used for all containers, metric cards, and dialogs:
```tsx
<div className="glass rounded-2xl p-5 border border-border/60 space-y-3 relative overflow-hidden">
  <div className="text-xs font-extrabold uppercase text-muted-foreground">Session Title</div>
  <div className="text-2xl font-black">Electromechanical Systems</div>
</div>
```

### C. Live Polling Bar Chart
Designed for high visibility on classroom projector screens:
- **Option Letter Badge**: A square badge (e.g. `A`, `B`, `C`, `D`) with distinct color accents.
- **Progress Fill Bar**: Animated width transition (`transition-all duration-500 ease-out`).
- **Percentage Tag**: Displayed on the far right in `font-mono font-bold`.

### D. Word Cloud Visualizer
- Dynamically scales font sizes based on frequency (from `text-sm` up to `text-3xl`).
- Uses vibrant gradient tags (`bg-gradient-to-r from-primary/20 to-purple-500/20`).

### E. Slide Embed Presentation View (`/embed/$code`)
- **Frameless Layout**: High contrast, zero sidebar or header distraction.
- **Split Screen**: Left side displays live updating charts/word clouds; right side displays a projector-optimized **White QR Code Container** with the join URL and 6-digit session shortcode.

---

## 📱 5. UX & Interaction Guidelines

1. **Micro-Animations**:
   - Hover scale effects (`hover:scale-[1.02] transition-all`).
   - Pulse animation for live indicators (`animate-pulse`).
   - Smooth entrance transitions for modals and tabs.

2. **Feedback & Micro-Copy**:
   - Destructive actions (e.g. session deletion) require confirmation dialogs.
   - Success actions trigger instant toast notifications via `sonner` (`toast.success(...)`).

3. **Accessibility & High Contrast**:
   - High contrast text on dark cards ensuring readability from the back of a lecture hall.
   - Clear visual differentiation between `Live` (Green), `Draft` (Amber), and `Ended` (Slate) statuses.
