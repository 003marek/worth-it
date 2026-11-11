# Worth It – Engineering Conventions

Read this before writing any code. The product spec is `Worth_It_Product_Specification.docx`
(summarised in the brief you received). Reference app for patterns: `C:\Users\marek\source\repos\seen-it`.

## Stack
- Angular 22 (standalone, zoneless, `ChangeDetectionStrategy.OnPush` everywhere), Angular Material 22 (M3).
- State: `WorthItStore` (`src/app/core/stores/worth-it.store.ts`, `@ngrx/signals`). **Components never talk to
  `StorageService` or Dexie directly** – they inject `WorthItStore` and call its methods / read its signals.
- Calculations: `FinancialCalculatorService` – the store already exposes everything as computed signals
  (`wealthSummary`, `goalsWithFunding`, `activeGoal`, `upcomingGoals`, `skippedGoals`, `completedGoals`,
  `financialCushionStatus`, `monthlySurplusSummary`, `projectionSummary`, `pendingIncomeRecords`,
  `pendingExpenseRecords`). **Do not re-implement financial math in components.** If something is missing,
  report it to the orchestrator instead of hacking around it.
- Tests: Vitest (`npx ng test --no-watch`). Build: `npx ng build`.

## Code style
- File naming like seen-it: `feature-name.ts` / `.html` / `.scss`, class names without `Component` suffix are OK
  (e.g. `export class Goals`). Inline templates are fine for small dialogs.
- Use `inject()`, `input()`, `output()`, `computed()`, `signal()`; built-in control flow (`@if`, `@for`, `@let`).
- No `any`. No `NgModule`s. No `ngModel`, no `FormGroup`/`FormControl`/`FormBuilder`, no `ReactiveFormsModule`.
- Money formatting: use the shared `money` pipe (`src/app/shared/pipes/money.pipe.ts`, base currency PLN).
- Theme colours only via Material system variables (`var(--mat-sys-primary)`, `--mat-sys-surface-container`,
  `--mat-sys-error`, ...). Must look right in light **and** dark mode. Mobile-first, responsive.

## Forms – Angular Signal Forms ONLY
Canonical, compiling example: `src/app/features/goals/goal-form-dialog.ts`. Copy its structure exactly:

```ts
import { form, FormField, FormRoot, required, min } from '@angular/forms/signals';

private readonly model = signal<MyValue>({ name: '', amount: 0 });   // 1. plain-object model signal

protected readonly myForm = form(this.model, (path) => {            // 2. schema fn = validation
  required(path.name, { message: 'Name is required' });
  min(path.amount, 0, { message: 'Must be ≥ 0' });
}, {
  submission: { action: async () => { /* save via store */ return undefined; } },  // 3. submit
});
```
```html
<form [formRoot]="myForm">                                <!-- FormRoot handles submit + novalidate -->
  <mat-form-field appearance="outline">
    <mat-label>Name</mat-label>
    <input matInput [formField]="myForm.name" />          <!-- FormField binds the control -->
  </mat-form-field>
  <app-field-errors [field]="myForm.name" />              <!-- shared error display -->
  <mat-slide-toggle [formField]="myForm.enabled">Enabled</mat-slide-toggle>
  <button mat-flat-button type="submit" [disabled]="myForm().submitting()">Save</button>
</form>
```
- Field state: `myForm.name().value()`, `.valid()`, `.touched()`, `.errors()`; whole form: `myForm().valid()`.
- Other schema rules available: `minLength`, `max`, `validate(path, ctx => ... )`, `disabled`, `hidden`, `applyWhen`.
- `[formField]` works on native inputs/selects/checkboxes and Material controls (`matInput`, `mat-select`,
  `mat-slide-toggle`, `mat-checkbox`, datepicker input). Dates: keep ISO `string` (`yyyy-mm-dd`) in the model with
  `<input matInput type="date">` — simplest and offline-safe.
- To reset after save: `this.model.set(initialValue)`; `myForm().reset()`.

## Accounting rules (already implemented – just surface them in the UI)
- Asset balances are the source of truth. Actual income/expense records not yet reflected in balances are
  *pending adjustments* to wealth (`wealthSummary().pendingAdjustments`). After the user updates balances they
  mark records as reflected (`store.markRecordsReflected()`), so nothing is counted twice. Show this clearly.
- Expected (non-actual) amounts never count as actual wealth. Actual vs projected values must be visually distinct
  (e.g. projected values in italics / tertiary colour with a "Projected" label and an assumptions note).
- Stock sales never modify assets or wealth.
- Goal completion offers Spend / Reserve / Release (`store.completeGoal`). Skip via `store.skipGoal(id, bool)`.

## Collaboration rules (parallel workers share one working copy)
- Only edit files inside the folder(s) you own (listed in your brief). Shared files
  (`app.routes.ts`, `styles.scss`, `app.*`, `core/**`, `shared/**`) belong to the shell owner / orchestrator.
- Never run `git commit`, `git push`, `git reset`, `git checkout` or `git stash`. The orchestrator commits.
- If `ng build` fails because of another worker's folder, ignore that error; make sure *your* files compile.
