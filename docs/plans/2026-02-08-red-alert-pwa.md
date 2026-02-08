# Red Alert PWA Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a fully offline PWA cycle tracker with dark theme, vertical calendar, IndexedDB storage, and prediction algorithm.

**Architecture:** Single-page vanilla app with 3 screens (Calendar, History, Settings) switched via JS. IndexedDB for persistence, Service Worker for offline. No build step, no frameworks.

**Tech Stack:** Vanilla HTML/CSS/JS, IndexedDB, Service Worker, GitHub Pages

---

### Task 1: Project Skeleton — HTML + CSS Dark Theme

**Files:**
- Create: `index.html`
- Create: `style.css`
- Create: `manifest.json`

**Step 1:** Create `index.html` with full semantic structure:
- Meta viewport, theme-color, manifest link
- Google Fonts: DM Sans (weights 400, 500, 700)
- Status bar section (fixed top)
- Calendar section (scrollable middle)
- Stats bar (fixed bottom, above nav)
- Bottom nav (Calendar / History / Settings)
- Day action modal (hidden by default)
- All 3 screen containers

**Step 2:** Create `style.css` with complete dark theme:
- CSS variables for all colors from design doc
- Layout: fixed header + scrollable calendar + fixed footer
- Calendar grid (7 columns, responsive cells)
- Day states: menstruation, predicted, ovulation, fertile, today
- Modal styles with backdrop
- Navigation bar with active states
- Animations: modal slide-up, day tap ripple
- Progress bar gradient (pink → purple)
- Typography: DM Sans throughout

**Step 3:** Create `manifest.json` per spec.

**Step 4:** Verify — open `index.html` in browser, confirm dark theme renders, layout is correct, nav switches highlight.

**Step 5:** Commit: `feat: project skeleton with HTML structure and dark theme CSS`

---

### Task 2: IndexedDB Module

**Files:**
- Create: `db.js`

**Step 1:** Create `db.js` — self-contained IndexedDB module exporting:
- `initDB()` — opens/upgrades DB `red-alert` v1, creates `cycles` store (autoIncrement id, indexes on `startDate` unique, `createdAt`) and `settings` store (keyPath: `key`)
- `addCycle(cycle)` — adds new cycle record
- `updateCycle(id, data)` — updates cycle by id
- `deleteCycle(id)` — removes cycle by id
- `getAllCycles()` — returns all cycles sorted by startDate desc
- `getCycleByDate(dateStr)` — finds cycle containing this date
- `getSetting(key)` — returns setting value
- `setSetting(key, value)` — upserts setting
- `exportData()` — returns full JSON of all cycles + settings
- `importData(json)` — clears and replaces all data
- `clearAll()` — deletes all cycles and resets settings

All functions return Promises. Use raw IndexedDB API (no library).

**Step 2:** Verify — open console, call `initDB()`, `addCycle(...)`, `getAllCycles()`, confirm data persists on reload.

**Step 3:** Commit: `feat: IndexedDB module for cycles and settings`

---

### Task 3: Prediction Algorithm

**Files:**
- Create: `calc.js`

**Step 1:** Create `calc.js` exporting:
- `calcAverages(cycles, defaults)` — computes avg cycle length and avg period length from last 3-6 completed cycles, falls back to defaults
- `predictCycle(currentCycle, avgCycleLength, avgPeriodLength)` — returns object with: `predictedEndDate`, `ovulationDate`, `fertileStart`, `fertileEnd`, `nextCycleDate`
- `getCycleDay(cycleStartDate, targetDate)` — returns day number (1-based)
- `getPhase(cycleDay, periodEndDay, fertileStart, fertileEnd, cycleLength)` — returns phase name: "menstruation" | "follicular" | "ovulation" | "luteal"
- `getDaysUntil(targetDate)` — returns days from today to target

All date math uses plain `Date` objects, dates stored as `YYYY-MM-DD` strings.

**Step 2:** Verify — call functions with test data in console, confirm predictions match manual calculation.

**Step 3:** Commit: `feat: cycle prediction algorithm`

---

### Task 4: Calendar Rendering + Vertical Scroll

**Files:**
- Create: `app.js`
- Modify: `index.html` (add script tags)

**Step 1:** Create `app.js` with calendar engine:
- `renderMonth(year, month)` — generates DOM for one month (title + weekday headers + day grid)
- `renderCalendar()` — renders current ± 2 months into scroll container
- Infinite scroll: detect scroll near top/bottom, prepend/append months, remove distant months (keep ±2 from visible)
- Scroll snap: `scroll-snap-type: y mandatory` on container, each month is snap point
- "Today" button — scrolls to current month, highlights today
- Color-code days based on cycle data: menstruation (pink gradient), predicted end (pink outline), ovulation (purple), fertile window (purple outline), today (white border)
- On app init: `initDB()` → load cycles → `calcAverages()` → render calendar with predictions

**Step 2:** Wire up status bar:
- Show current month/year (update on scroll)
- Cycle day badge ("День N")
- Current phase name
- Key dates: period end, ovulation, next cycle
- Progress bar (percent through current cycle)

**Step 3:** Wire up stats footer:
- Average cycle length
- Average period length
- Days until next cycle

**Step 4:** Verify — open app, see calendar with correct dates, scroll between months, snap works, today button works.

**Step 5:** Commit: `feat: vertical calendar with scroll, status bar, and stats`

---

### Task 5: Day Tap + Modal Actions

**Files:**
- Modify: `app.js`

**Step 1:** Add tap handler on calendar days:
- Tap day → open modal showing date and available actions
- "Начало месячных" — creates new cycle with startDate, auto-calculates predictedEndDate. If previous cycle unclosed → close it (set endDate to day before)
- "Конец месячных" — sets endDate on current cycle. Only shown if active cycle exists and day is after startDate
- "Убрать отметку" — if day is startDate → delete entire cycle; if day is endDate → set endDate to null. Only shown if day has a mark
- After any action: recalculate predictions, re-render calendar

**Step 2:** Modal UX:
- Slide-up animation from bottom
- Backdrop tap closes modal
- Haptic feedback hint (vibrate API if available)
- Disable irrelevant actions (grey out with explanation)

**Step 3:** Verify — tap days, create/close cycles, confirm calendar updates, data persists on reload.

**Step 4:** Commit: `feat: day tap modal with cycle start/end/remove actions`

---

### Task 6: History Screen

**Files:**
- Modify: `app.js`
- Modify: `style.css`

**Step 1:** Build history screen:
- List all cycles reverse-chronological
- Each row: start date → end date, cycle length, period length
- Tap row → inline edit with date inputs for start/end
- Delete button per cycle (with confirmation)
- After edit/delete: recalculate all dependent cycles and predictions, refresh UI

**Step 2:** Add navigation:
- Bottom nav switches between Calendar / History / Settings screens
- Only one screen visible at a time
- Calendar is default active screen

**Step 3:** Verify — switch to history, see cycles, edit dates, delete cycle, confirm calendar reflects changes.

**Step 4:** Commit: `feat: history screen with cycle editing and navigation`

---

### Task 7: Settings Screen

**Files:**
- Modify: `app.js`
- Modify: `style.css`

**Step 1:** Build settings screen:
- Default cycle length slider (21–35, default 28)
- Default period length slider (3–7, default 5)
- Export JSON button (downloads file)
- Import JSON button (file picker, validates, replaces data)
- Reset all data button (double confirmation: "Вы уверены?" → "Точно удалить все данные?")
- After import/reset: reload all data, re-render

**Step 2:** Verify — change defaults, export, import into fresh state, reset.

**Step 3:** Commit: `feat: settings screen with export/import/reset`

---

### Task 8: Service Worker + PWA

**Files:**
- Create: `sw.js`
- Modify: `index.html` (register SW)

**Step 1:** Create `sw.js`:
- Cache name with version: `red-alert-v1`
- On install: precache all static assets (HTML, CSS, JS, fonts, icons, manifest)
- On fetch: Cache First strategy — serve from cache, fall back to network
- On activate: delete old caches
- Version check: when new SW activates, post message to client

**Step 2:** Register SW in `index.html`:
- Register on load
- Listen for `controllerchange` — show toast "Доступно обновление" with "Обновить" button
- Toast triggers `location.reload()`

**Step 3:** Create PWA icons:
- Generate `icons/icon-192.png` and `icons/icon-512.png` (red/pink alert icon on dark background)

**Step 4:** Verify — load app, go offline (DevTools), confirm app still works. Bump cache version, reload with network, confirm update toast appears.

**Step 5:** Commit: `feat: service worker with cache-first and PWA icons`

---

### Task 9: Polish + Final QA

**Files:**
- All files (minor tweaks)

**Step 1:** Visual polish:
- Smooth transitions between screens
- Calendar scroll momentum feels natural
- Modal animations are snappy
- Touch targets ≥ 44px
- Safe area insets for iPhone notch/home indicator

**Step 2:** Edge cases:
- First use with no data — shows empty calendar with today highlighted
- Very long history (50+ cycles) — calendar doesn't lag
- Import malformed JSON — shows error, doesn't corrupt data
- Multiple rapid taps — debounced, no double-creates

**Step 3:** Verify on iPhone Safari:
- Install to home screen
- Works offline
- Scroll feels native
- No layout issues with safe areas

**Step 4:** Commit: `fix: polish, edge cases, and iOS safe areas`
