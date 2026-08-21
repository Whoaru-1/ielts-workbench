# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS, zero build step (user confirmed). Served as a static site for Cloud Studio static hosting.

## Users

A Chinese speaker preparing for the IELTS exam (Academic or General, target band to be set in-app), studying daily on desktop and mobile browsers. Primary job: keep every part of their IELTS preparation organized, measurable, and continuously visible so they can see progress and stay consistent.

## Product Purpose

A personal IELTS study workbench: one dashboard that tracks vocabulary learning, practice/mock test results, writing records, speaking records, daily study plans and check-ins, and overall score/band progress — all saved locally and portable via JSON import/export.

## Positioning

An all-in-one, local-first IELTS preparation dashboard: all six study modules live under one progress view, and the user owns their data as plain JSON files — no account, no backend, fully portable and backup-able.

## Operating Context

- Used daily, often multiple short sessions; on desktop and mobile.
- Works offline once loaded (no network dependencies beyond fonts/icons loaded at build time; app data is local).
- Practice content is user-supplied or self-logged: the app records what the user studied/practiced and the scores they achieved; it does not embed copyrighted Cambridge test content.
- Exam date and target band are user settings shown in the dashboard (countdown, band goals).

## Capabilities and Constraints

Confirmed capabilities:

- Six modules: 词汇 (vocabulary), 真题模考与练习 (practice & mock results), 写作 (writing records), 口语 (speaking records), 学习计划与打卡 (daily plan & streaks), 成绩与进度看板 (dashboard).
- Progress saved automatically to browser localStorage.
- Full export to JSON file and import from JSON file (with validation and merge/replace choice).
- Chinese UI.
- Dark, modern, high-contrast dashboard visual style (user confirmed direction; no other visuals pinned).
- A topic-organized built-in vocabulary bank (~2000 words across 12 IELTS topics: education, environment, technology, health, society, work, economy, culture, science, travel, government, media) ships with the app and merges on first load (incremental for existing users); users can add/edit/delete their own words; built-in data is labeled as non-official starter content.

Technical constraints:

- Static files only; no server, no database, no build step.
- localStorage capacity limits the size of vocab banks (built-in bank ~2000 words ≈ 400KB, well within limits; user additions tracked individually).
- Single-user per browser; import/export is the migration path.

Undecided facts (not invented):

- Exact app name (working title: “IELTS 工作台”), target band, exam date, daily goal — all user-configurable in-app settings, not product facts.

## Brand Commitments

- UI language: Simplified Chinese.
- Visual direction: 深色现代科技风 — dark background, high-contrast data cards, dashboard-like density (user-confirmed choice; visual system defined in DESIGN.md, not here).

## Evidence on Hand

No existing assets or content. Starter vocabulary list is authored as curated starter material (labeled as such, not claimed to be an official IELTS word list). No user study data yet; dashboard states shown with empty-state guidance until the user adds data.

## Product Principles

1. **Local-first, user-owned data.** Everything saves to the browser; JSON import/export is a first-class feature, never an afterthought.
2. **Progress over perfection.** Every module feeds the dashboard; the user should always be able to answer “where am I and what's next?” at a glance.
3. **Consistency by design.** Daily check-ins, streaks, and countdown make the habit visible; the plan module is as important as content modules.
4. **Honest, self-reported practice.** The app records what the user logs (scores, time, notes) and labels starter/placeholder content clearly; it never fabricates official test data.
5. **Fast and offline.** Zero-build static files, no network dependency at runtime, works on a phone in a coffee shop.

## Accessibility & Inclusion

- Dark theme designed with sufficient contrast for the dashboard density.
- Respect `prefers-reduced-motion`; all interactive controls keyboard-operable and labeled.
- No product-specific accessibility standard was confirmed beyond these baseline choices.
