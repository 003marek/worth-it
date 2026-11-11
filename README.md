# Worth It

> *"How far am I from affording the life I want?"*

**Worth It** is an offline-first personal financial progress tracker built as an Angular 22 Progressive Web App (PWA). Unlike traditional budgeting apps, Worth It is organized around sequential financial goals, real asset balances, a protected Financial Cushion reserve, and transparent actual-vs-projected timelines.

## Tech Stack

- **Framework**: Angular 22 (Zoneless change detection, Standalone components, `OnPush`)
- **Forms**: Angular Signal Forms (`@angular/forms/signals` — `form()`, `[formRoot]`, `[formField]`, schema validation)
- **State Management**: `@ngrx/signals` (`signalStore`, `withEntities`, `withComputed`, `withMethods`)
- **UI & Theming**: Angular Material 22 (Material 3 design system with Light, Dark, and System themes)
- **Persistence**: Offline-first IndexedDB via `Dexie` (`WorthItDB`) + Service Worker (`@angular/service-worker`)
- **Testing**: Vitest (`146` unit & integration tests across `14` spec files)

## Key Features

- **Sequential Goals & Funding Waterfall** (`/goals`): Prioritize life goals with additional-amount targets, drag-and-drop reordering, goal skipping/resuming, and three completion choices (**Spend**, **Reserve**, **Release**).
- **Financial Cushion** (`/settings`, `/dashboard`): Protected emergency reserve (`Average Monthly Expenses × Coverage Months`) automatically funded and replenished before life goals.
- **Wealth & Assets** (`/assets`): Manual multi-currency asset tracking with goal-eligibility toggles, balance history snapshots, and one-click reconciliation of pending actual income/expenses to prevent double counting.
- **Income & Expenses Cash Flow** (`/cashflow`): Expected salary & other income sources, variable salary updates with preserved historical baselines, hybrid expense categories + simple overall monthly baseline, and actual monthly entries.
- **Actual vs. Projected Progress & What-If Simulator** (`/projections`): Strict separation between confirmed actual balances and forward projections, plus an interactive Signal Form simulator for testing extra monthly savings or windfalls.
- **Two Switchable Dashboard Layouts** (`/dashboard`): **Goal-First Dashboard** and **Financial Overview Dashboard**.
- **Standalone Stock Sales Log** (`/stock-sales`): Historical stock sale records with PLN conversion, explicitly isolated from asset balances and total wealth.
- **JSON Backup & Restore** (`/settings`): Full local database export and validated transactional import.

## Development

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:4200)
npm start

# Production PWA build
npm run build

# Run Vitest unit tests
npx ng test --no-watch
```
