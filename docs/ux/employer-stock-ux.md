# Employer Stock — UX & Interaction Design Specification

**Feature**: Employer Stock (RSU / Equity Management)  
**Platform**: Angular 22 Progressive Web App · Angular Material 22 (M3)  
**Specification File**: `docs/ux/employer-stock-ux.md`  
**Binding Architecture**: [`docs/architecture/employer-stock.md`](../architecture/employer-stock.md)  
**Product Specification**: [`PRODUCT_SPECIFICATION.md`](../../PRODUCT_SPECIFICATION.md) §5, §6, §9.2, §11, §12  

---

## 1. Design Foundations & Principles

The Employer Stock experience bridges company equity vesting with personal financial goal planning. Users must immediately grasp what equity they actually own today versus future promises.

### 1.1 Core UX Principles
1. **Actual Wealth vs. Projections**: Vested shares held right now count toward net worth and financial goals. Unvested shares are projections only—they must never blend into current wealth or cushion progress.
2. **Plain Language, No Jargon**: Replace equity jargon with intuitive terms (e.g., *"Vested & held in account"* rather than *"Cumulative vested post-settlement holding"*).
3. **Tabular Numerals & Monospace Precision**: All share counts, stock prices, FX rates, and PLN equivalents use `font-variant-numeric: tabular-nums` (and monospace numerals `Roboto Mono, monospace` for dense schedules) to prevent jitter and maintain clean vertical alignment.
4. **Thumb-Zone Optimization**: Primary mobile actions (e.g., *Add Grant*, *Update Baseline*, *Record Sale*) reside in the lower 35% of the viewport. Touch targets are strictly $\ge 48 \times 48\,\text{px}$.
5. **Resilient Offline & Market Feedback**: Every market data point clearly discloses its origin, freshness, and fallback status without blocking user workflow.

### 1.2 Design Tokens & Theming (Angular Material 22 M3)
All styling strictly leverages Material 3 CSS variables defined in `src/styles.scss`:
- **Primary Accent**: `var(--mat-sys-primary)` / `var(--mat-sys-on-primary)` (Green 80/40)
- **Positive / Actual Wealth**: `var(--worth-it-positive)` (`#1b6b3a` in light, `#4ade80` in dark)
- **Projected Wealth / Future**: `var(--mat-sys-tertiary)` (Cyan 80/40) + *italics*
- **Surface Containers**: `var(--mat-sys-surface-container)` (cards), `var(--mat-sys-surface-container-high)` (dialogs/sheets)
- **Outlines & Dividers**: `var(--mat-sys-outline)` / `var(--mat-sys-outline-variant)`
- **Error / Danger**: `var(--mat-sys-error)` / `var(--mat-sys-on-error)`
- **Warning / Stale**: `var(--mat-sys-tertiary-container)` or amber tone on `surface-variant`
- **Text Hierarchy**: `var(--mat-sys-on-surface)` (100% heading/body), `var(--mat-sys-on-surface-variant)` (70% secondary)
- **Spacing Scale (8-Point Grid)**: $4, 8, 12, 16, 24, 32, 48\,\text{px}$

---

## 2. Terminology & Microcopy Dictionary

To eliminate ambiguity across all cards, dialogs, and summaries, copy adheres strictly to this table:

| Term in System | UI Label | User Explanation / Microcopy | Financial Impact |
| :--- | :--- | :--- | :--- |
| `totalGrantedShares` | **Total granted** | *"Total net shares awarded across all active grants before taxes."* | Informational only. Does not count toward wealth. |
| `heldShares` | **Vested & held** | *"Shares you currently hold in your brokerage account today."* | **Counts toward Total Wealth & Active Goals** ($\times \text{Price} \times \text{FX}$). |
| `unvestedShares` | **Unvested pipeline** | *"Future scheduled shares waiting to vest. Projected only."* | Excluded from wealth today. Feeds **Future Inflows** in Projections. |
| `soldSharesCounted` | **Deducted via sales** | *"Shares sold in recorded stock sales linked to this employer."* | Subtracted from vested shares to prevent double counting cash. |
| `vestedSharesBaseline` | **Vested baseline** | *"Your verified held share count as of a chosen date."* | Overrides older grants & sales; subsequent tranches add to it. |
| `manualPrice` | **Manual price** | *"Self-entered stock price used when live market data is unavailable."* | Overrides API quote; tagged with `Manual` badge. |
| `manualFxRate` | **Manual exchange rate** | *"Self-entered currency rate to PLN used when offline."* | Fallback for NBP rate; tagged with `Manual FX` badge. |

---

## 3. Market Data States & Status Badge Spec

Component: `MarketStatusBadgeComponent` (`src/app/shared/components/market-status-badge/market-status-badge.ts`)  
Inputs: `status: MarketDataStatus` (`'live' | 'cached' | 'stale' | 'manual' | 'missing'`), `source: MarketDataSource`, `asOf?: string`, `symbolOrPair?: string`

### 3.1 Status Matrix & Visual Feedback

| Status | Badge Color / Variant | Display Format | Tooltip / Expanded Text |
| :--- | :--- | :--- | :--- |
| **`live`** | Surface Container + Green Dot (`--worth-it-positive`) | `USD · Twelve Data · live` | *"Price fetched within the last 15 min. Up to date."* |
| **`cached`** | Surface Container Low + Variant Text | `USD → PLN · NBP · 2 h ago` | *"Cached market data from NBP Table A (effective: {date})."* |
| **`stale`** | Warning Container + Amber Icon (`schedule`) | `GOOGL · Twelve Data · 4 d ago` | *"Price is over 3 days old. Connect to internet and tap refresh."* |
| **`manual`** | Outlined Chip + Edit Icon (`edit`) | `Manual price ($185.00)` | *"Manual price override active. Tap to update or fetch live."* |
| **`missing`**| Error Container + Warning Icon (`warning`) | `Missing price · Tap to fix` | *"No price available. Enter manual price or add Twelve Data key."* |

### 3.2 Loading Skeletons & Refresh Animation
- **Price Shimmer State**: When `store.marketDataRefreshing()` is `true` or ticker lookup is pending, price values show a shimmer placeholder:
  `height: 1.5rem; width: 5.5rem; border-radius: 4px; background: linear-gradient(90deg, var(--mat-sys-surface-container) 25%, var(--mat-sys-surface-container-high) 50%, var(--mat-sys-surface-container) 75%); animation: shimmer 1.5s infinite;`
- **Manual Refresh Action**: Icon button (`sync`) in asset header with tooltip *"Refresh market price & FX rates"*. While refreshing, spins smoothly (`animation: spin 1s linear infinite`).

### 3.3 Ticker Lookup Error Handling (Form Dialog)
Inline feedback displayed beneath the ticker symbol field in `EmployerStockFormDialog`:

| Error Code | Inline Error Message | User Action / Recovery |
| :--- | :--- | :--- |
| `invalid_symbol` | *"Ticker not found on Twelve Data. Verify symbol (e.g. MSFT, GOOGL)."* | Keep typed symbol; reveal manual price input immediately. |
| `no_api_key` | *"Twelve Data API key not configured in Settings."* | Show link: *"Configure key in Settings →"* or enter manual price. |
| `rate_limit` | *"Twelve Data rate limit reached (8 req/min on free tier)."* | *"Wait 60s to retry or enter a manual price below."* |
| `network` / Offline | *"You are offline. Cannot fetch live ticker quote."* | Form continues seamlessly using manual price and fallback FX. |
| `unknown` | *"Unable to reach quote service. Please try again."* | Show [Retry lookup] button. |

---

## 4. Screen-by-Screen Specifications

### Screen 1: Assets List — Employer Stock Card
- **Component**: `EmployerStockAssetCardComponent` or within `src/app/features/assets/assets.html`
- **Store Signals**: `store.assetValuations().get(asset.id)`, `store.employerStockSnapshots().get(asset.id)`
- **M3 Components**: `mat-card`, `mat-card-header`, `mat-card-content`, `mat-card-actions`, `mat-icon`, `mat-menu`, `mat-button`, `mat-slide-toggle`, `app-market-status-badge`

#### Layout & Visual Elements
- **Card Header**:
  - Avatar: Company stock icon (`trending_up`) with ticker badge in bold.
  - Title: Asset Name (`asset.name`, e.g. *"Alphabet Inc."*).
  - Subtitle: `Employer Stock · {tickerSymbol} ({currency})`.
  - Trailing Menu (`more_vert`): *Edit Details*, *Manage Grants*, *Set Baseline*, *Delete Asset*.
- **Primary Balance (Actual Held Wealth)**:
  - Big Number: `{heldShares | number:'1.0-4'} sh` in tabular numerals (`font-size: 1.5rem; font-weight: 600`).
  - Base Value: `≈ {valueInBase | money:'PLN'}` (bold, color: `--mat-sys-on-surface`).
  - Sub-rate: `(@ {unitPrice} {currency} · FX: {fxRateToBase})`.
- **Secondary Pipeline (Unvested Future)**:
  - Text: `Unvested: {unvestedShares} sh (est. {unvestedValueInBase | money:'PLN'})` (italicized, color: `var(--mat-sys-tertiary)`).
  - Next vest pill: `Next: {nextVest.shares} sh on {nextVest.date | date:'mediumDate'}`.
- **Market Status Row**:
  - `app-market-status-badge` showing quote freshness and NBP FX rate.
- **Goal Eligibility Toggle**:
  - `mat-slide-toggle` bound to `asset.isGoalEligible`.
- **Card Actions (Thumb Zone)**:
  - Primary Flat Button: `Manage grants ({grantsCount})` $\rightarrow$ navigates to `/assets/:assetId`.
  - Stroked Button: `Sell shares` $\rightarrow$ opens Stock Sale dialog with asset pre-selected.

---

### Screen 2: Employer Stock Form Dialog (Add / Edit)
- **Component**: `EmployerStockFormDialogComponent` (`src/app/features/assets/employer-stock/employer-stock-form-dialog.ts`)
- **Store Methods**: `store.lookupTicker(symbol)`, `store.addAsset(...)`, `store.updateAsset(...)`
- **M3 Components**: `mat-dialog`, `mat-form-field`, `matInput`, `mat-select`, `mat-slide-toggle`, `mat-progress-spinner`, `mat-button`, `app-field-errors`

#### Form Fields & Interactions (Signal Forms)
1. **Ticker Symbol**:
   - Uppercase text input with trailing action: `[Search]` icon button.
   - On blur or submit: calls `store.lookupTicker(symbol.toUpperCase())`.
   - Spinner replaces search icon while lookup is active.
   - On success: auto-fills Asset Name (if blank), selects Trading Currency, and displays live price preview.
   - On error: displays inline warning banner (§3.3) and expands manual fallback fields.
2. **Asset Name**:
   - Text input (`matInput`). Prefilled with company name from quote (e.g. *"Alphabet Inc."*), editable.
3. **Trading Currency**:
   - `mat-select` (`USD`, `EUR`, `GBP`, `PLN`, `CHF`). Auto-selected from ticker quote.
4. **Manual Fallbacks (Collapsible Section)**:
   - `manualPrice`: Number input (in asset currency). Required if offline or no API key.
   - `manualFxRate`: Number input (1 Asset Currency = X PLN). Shown only when currency $\ne$ base.
5. **Goal Eligibility Toggle**:
   - `mat-slide-toggle`: *"Count towards financial goals"*.
   - Helper copy: *"When enabled, currently held vested shares fund your cushion and active goals."*
6. **Actions**:
   - `[Cancel]` (stroked button) | `[Save Asset]` (flat button, disabled while invalid or submitting).

---

### Screen 3: Employer Stock Detail Page
- **Component**: `EmployerStockDetailComponent` (`src/app/features/assets/employer-stock/employer-stock-detail.ts`)
- **Route**: `/assets/:assetId`
- **Store Signals**: `store.assetValuations().get(assetId)`, `store.employerStockSnapshots().get(assetId)`, `store.grantsByAsset().get(assetId)`
- **M3 Components**: `mat-card`, `mat-expansion-panel`, `mat-divider`, `mat-icon`, `mat-button`, `mat-chip-set`, `mat-menu`

#### Section Breakdown
1. **Sticky Top Header**:
   - Back button (`arrow_back` $\rightarrow$ `/assets`).
   - Title: `{asset.name} ({tickerSymbol})`.
   - Actions: `[+ Add Grant]` (primary button), `[More Actions]` menu (*Edit Asset*, *Set Baseline*, *Refresh Market Data*).
2. **Wealth Summary Hero Banner**:
   - 3-column metric cards:
     - **Vested & Held**: `{heldShares} sh` $\rightarrow$ `{valueInBase | money:'PLN'}` (Counts toward goals).
     - **Unvested Future**: `{unvestedShares} sh` $\rightarrow$ `{unvestedValueInBase | money:'PLN'}` (*Projected only*).
     - **Total Granted**: `{totalGrantedShares} sh` across `{grants.length}` grants.
   - Market Status strip: `app-market-status-badge` + `[Refresh]` icon button.
3. **Vested Baseline Banner (if active)**:
   - Elevated amber card: *"Baseline active: Fixed at {baselineShares} sh on {baselineDate}. Tranches before this date are excluded from vesting math."*
   - Actions: `[Adjust baseline]` / `[Clear baseline]`.
4. **Visual Vesting Timeline Section**:
   - Interactive scrubber component (`VestingTimelineComponent`, §5).
5. **Collapsible Grant Cards (`mat-expansion-panel`)**:
   - Each grant is a collapsible card:
     - **Collapsed Header**: Grant Name (e.g. *"2025 Annual Grant"*), Grant Date, Total Shares (`{totalShares} sh`), Vesting Progress (`{vestedShares}/{totalShares} sh`).
     - **Expanded Content**: Schedule parameters summary (Frequency, Duration, Cliff) + Tranches breakdown table + Action buttons: `[Edit Grant]` (opens Grant Editor), `[Delete Grant]`.
   - **Empty State (0 grants)**:
     - Icon: `inventory_2`, Title: *"No stock grants recorded yet"*.
     - Copy: *"Add your initial grant or RSU award to start tracking vesting schedules and projected inflows."*
     - CTA: `[+ Add your first grant]` (flat primary button).
6. **Linked Stock Sales History Section**:
   - List of sales linked to this asset:
     - Date, Shares Sold, Sale Price, Gross Value in PLN.
     - Note: *"Deducted from held vested shares"*.
   - **Empty State (0 sales)**:
     - Copy: *"No shares sold yet from this company. When you sell shares, record it under Stock Sales to deduct them from your held balance."*

---

### Screen 4: Grant Editor Dialog
- **Component**: `GrantEditorDialogComponent` (`src/app/features/assets/employer-stock/grant-editor-dialog.ts`)
- **Inputs**: `assetId: string`, `grant?: StockGrant`
- **Store Methods**: `store.addStockGrant(...)` / `store.updateStockGrant(...)`
- **M3 Components**: `mat-dialog`, `mat-form-field`, `matInput`, `mat-button-toggle-group`, `mat-radio-group`, `mat-icon-button`, `mat-button`, `app-field-errors`

#### Modal Flow & Layout
- **Dialog Title**: `New Stock Grant` or `Edit {grant.name || 'Stock Grant'}`
- **Section A: Grant Details**:
  - Grant Name / Label: Text input (optional, e.g. *"2026 Promo Grant"*).
  - Grant Date: Date input (`yyyy-mm-dd`).
  - Total Shares Granted: Number input (`step="0.0001"`, tabular nums).
- **Section B: Schedule Generator Parameters**:
  - Frequency: Button toggle group: `[Monthly]` | `[Quarterly]` | `[Annual]`.
  - Duration (Months): Dropdown: `12`, `24`, `36`, `48` months.
  - Cliff Option:
    - Radio: `None (immediate vesting)` vs `1-Year Cliff (12 months)` vs `Custom First Vest Date`.
    - If Custom: Date input for `firstVestDate`.
  - Generator CTA: `[Generate Schedule]` button.
- **Section C: Concrete Vesting Schedule (Editable Tranches)**:
  - Header: `Vesting Tranches ({tranches.length})` + `[+ Add Tranche]` icon button.
  - Allocation Status Bar:
    - Text: `Total allocated: {sumTranches} / {totalShares} sh`
    - Pill indicator: Green check (`done`) if exact match; Red alert (`error`) with difference if mismatch.
  - Tranche Rows:
    - Mobile (stacked card): Date input on top, Shares input below, 48×48px delete icon button on right.
    - Desktop (table row): Row #, Date input, Shares input, % of grant, Delete button.
- **Customization Confirmation Pattern**:
  - If user edits any tranche manually, `isScheduleCustomized` becomes `true`.
  - Clicking `[Generate Schedule]` opens `ConfirmDialogComponent`:  
    - Title: *"Overwrite custom schedule?"*
    - Message: *"You have made manual edits to individual tranches. Regenerating will reset dates and share counts to default splits."*
    - Buttons: `[Cancel]` | `[Regenerate]` (destructive action).
- **Dialog Footer**:
  - `[Cancel]` (stroked button) | `[Save Grant]` (flat button, disabled while invalid or sum mismatch).

---

### Screen 5: Vested Baseline Dialog
- **Component**: `VestedBaselineDialogComponent` (`src/app/features/assets/employer-stock/vested-baseline-dialog.ts`)
- **Store Methods**: `store.setVestedSharesBaseline(assetId, shares, date)`, `store.clearVestedSharesBaseline(assetId)`
- **M3 Components**: `mat-dialog`, `mat-form-field`, `matInput`, `mat-button`, `mat-icon`

#### Purpose & UI Elements
Allows users with multi-year grant histories to set a single verified baseline count without manually inputting historical stock sales or past grants.
- **Guidance Card**:
  - Icon: `verified`, Copy: *"Set the exact number of vested shares currently held in your brokerage account today. Any vesting tranches or sales dated before the baseline date will be disregarded in held share calculations."*
- **Form Controls (Signal Forms)**:
  - `vestedSharesBaseline`: Number input (`step="0.0001"`, required, $\ge 0$).
  - `vestedSharesBaselineDate`: Date input (default: `Today`).
- **Live Preview Calculation**:
  - *"New held shares today: {baselineShares} sh."*
  - *"Future scheduled vests after {date} (+{futureShares} sh) will add to this count."*
- **Actions**:
  - If baseline active: `[Clear Baseline]` (warns that calculation will revert to full grant history).
  - `[Cancel]` | `[Save Baseline]` (flat button).

---

### Screen 6: Stock Sale Dialog — Source Asset Field
- **Component**: Integrated in `StockSaleDialogComponent` (`src/app/features/stock-sales/stock-sale-dialog.ts`)
- **Model Field**: `StockSale.sourceAssetId?: string`
- **M3 Components**: `mat-select`, `mat-option`, `mat-icon`

#### Form Behavior
- **Source Asset Dropdown**:
  - Label: *"Source Employer Stock (Optional)"*
  - Placeholder: *"Select company equity (optional)"*
  - Options: `None (independent sale)` + list of `store.employerStockAssets()`.
- **Auto-Fill on Selection**:
  - Auto-fills `tickerSymbol` $\leftarrow$ `asset.employerStock.tickerSymbol`.
  - Auto-fills `currency` $\leftarrow$ `asset.currency`.
  - Prefills suggested `pricePerShare` $\leftarrow$ latest price from `assetValuations()`.
- **Accounting Clarification Banner**:
  - Amber notice: *"Selling {sharesSold} shares will deduct them from {asset.name}'s held vested shares as of {saleDate}."*
  - Note: *"Sale proceeds do not automatically add to cash accounts. Update your bank balance when cash settles."*

---

### Screen 7: Settings — Twelve Data API Key Field
- **Component**: `TwelveDataSettingsComponent` (inside `src/app/features/settings/`)
- **Store Signal**: `store.settings().twelveDataApiKey`
- **M3 Components**: `mat-form-field`, `matInput`, `mat-icon-button`, `mat-button`, `mat-chip`

#### Controls & Feedback
- **API Key Field**:
  - Input type: `password` / `text` with visibility toggle icon button (`visibility` / `visibility_off`).
  - Helper copy: *"Used to fetch live market prices for employer stock tickers."*
- **Validation Action**:
  - `[Test Key]` button: Executes `store.lookupTicker('AAPL')`.
  - Inline chip:
    - *Success*: Green chip `Valid key (AAPL quote received)`.
    - *Invalid*: Red chip `Invalid API key. Check key and retry.`.
    - *Offline*: Red chip `Network offline. Connect and retry.`.
- **Privacy Notice**:
  - *"Your API key is stored locally in IndexedDB. It is never uploaded to any external server other than twelvedata.com."*

---

### Screen 8: Projections — Upcoming Vests Section
- **Component**: Integrated in `ProjectionsComponent` / `UpcomingVestsCardComponent` (`src/app/features/projections/`)
- **Store Signal**: `store.projectedInflows()` (filtered to goal-eligible assets)
- **M3 Components**: `mat-card`, `mat-icon`, `mat-chip`

#### Visual Differentiation (Actual vs Projected)
- **Assumptions Disclaimer**:
  - Cyan callout: *"Includes {inflows.length} future scheduled stock vestings totaling {inflowsTotal | money:'PLN'} based on current market prices and NBP exchange rates. Future stock prices will fluctuate."*
- **Timeline Milestone Inflows**:
  - Scheduled vests appear as discrete timeline events distinct from monthly salary:
    `◆ 15 Dec 2026: GOOGL Vest · 12 sh (+24,500 PLN)`
  - Visual treatment: Italicized, tertiary cyan color (`--mat-sys-tertiary`), monospace numeral share count.

---

## 5. Visual Vesting Timeline Component

**Component**: `VestingTimelineComponent` (`src/app/features/assets/employer-stock/vesting-timeline.ts`)  
**Inputs**: `grants: StockGrant[]`, `today: string`, `stockPrice: number`, `fxRate: number`

### Concept & Responsive Layout
Rather than forcing mobile users to read wide, complex data tables, the timeline renders an accessible horizontal scrubber (desktop: interactive milestone track):

```
Past / Vested (Solid Green)          Today                Future / Projected (Dashed Cyan)
=====================================|---------------------------------------------
[ 15 Mar 2026 ]   [ 15 Jun 2026 ]    |      [ 15 Sep 2026 ]        [ 15 Dec 2026 ]
  12 sh · Vested    12 sh · Vested   |        12 sh · Projected      12 sh · Projected
  24,000 PLN        24,000 PLN       |        ≈24,000 PLN            ≈24,000 PLN
```

### Visual Specifications
- **Today Marker**: Distinct vertical divider with pill badge `Today` (`background: var(--mat-sys-primary); color: var(--mat-sys-on-primary)`).
- **Tranche Cards**:
  - *Past Tranches* ($t \le t_0$): Solid border, checkmark icon (`done`), value in standard font.
  - *Future Tranches* ($t > t_0$): Dashed border, schedule icon (`event`), value in *italics* with cyan accent.
  - Numerical display: Mono font (`font-family: Roboto Mono`), tabular numerals.
- **Grant Filter Chips**: When multiple grants exist, filter pills allow toggling: `[All Grants] [2025 Annual] [Promo Grant]`.

---

## 6. Form Validation & Signal Forms Spec

All forms strictly implement `@angular/forms/signals` without `FormGroup` or `ReactiveFormsModule`.

### 6.1 Grant Editor Schema Validation
```ts
// Schema definition in GrantEditorDialogComponent
protected readonly grantForm = form(this.model, (path) => {
  required(path.grantDate, { message: 'Grant date is required' });
  required(path.totalShares, { message: 'Total shares is required' });
  min(path.totalShares, 0.0001, { message: 'Must be greater than 0' });

  // Custom validation rule: Tranche sum must match total shares
  validate(path.tranches, (ctx) => {
    const total = ctx.valueOf(path.totalShares) ?? 0;
    const tranches = ctx.value() ?? [];
    const sum = tranches.reduce((acc, t) => acc + (Number(t.shares) || 0), 0);
    const diff = Math.abs(sum - total);
    if (diff > 0.001) {
      return {
        kind: 'sum_mismatch',
        message: `Tranches sum (${sum.toFixed(4)}) must equal total shares (${total.toFixed(4)}). Difference: ${diff.toFixed(4)}`
      };
    }
    return null;
  });

  // Custom validation rule: Chronological order and no duplicate dates
  validate(path.tranches, (ctx) => {
    const tranches = ctx.value() ?? [];
    for (let i = 0; i < tranches.length; i++) {
      if (tranches[i].shares <= 0) {
        return { kind: 'zero_shares', message: `Tranche ${i + 1} shares must be > 0` };
      }
      if (i > 0 && tranches[i].vestDate <= tranches[i - 1].vestDate) {
        return { kind: 'date_order', message: `Tranche ${i + 1} date must be strictly after tranche ${i} date` };
      }
    }
    return null;
  });
});
```

### 6.2 Error Display Policy
- Validation errors appear inline next to the affected row or field via `<app-field-errors>`.
- The form submit button remains disabled (`[disabled]="!grantForm().valid()"`) while sum mismatches or invalid dates exist.
- Form level error summary banner appears above the actions row if the user attempts submission.

---

## 7. Responsive Layouts & Breakpoint Matrix

| Viewport Breakpoint | Screen | Layout Behavior & Touch Targets |
| :--- | :--- | :--- |
| **Mobile Narrow (320px – 389px)** | Asset Card | Single column stack; big numbers 1.3rem; status badges wrap to second line. 48px touch targets. |
| | Grant Editor | Tranche rows stack vertically: Date on top, Shares below, 48×48px delete button on right. |
| | Detail Page | Metric hero stacks into 3 full-width cards; timeline scrolls horizontally. |
| **Mobile Standard (390px – 767px)**| Asset Card | 2-row layout; primary metrics top, actions pinned to bottom thumb zone. |
| | Grant Editor | Tranche rows inline: Date (45%) + Shares (40%) + Delete (15%). |
| | Detail Page | 3 metric cards arranged 2 + 1; sticky bottom action bar. |
| **Tablet (768px – 1023px)** | Assets Page | Asset cards in 2-column grid (`grid-template-columns: repeat(2, 1fr)`). |
| | Detail Page | 2-column layout: Left (Summary + Timeline), Right (Grants list & Sales). Dialog width 600px. |
| **Desktop (1024px+)** | Assets Page | 3-column asset grid; multi-select filters in top toolbar. |
| | Grant Editor | Dialog width 720px; tranche editor renders as full tabular grid with column sorting. |

---

## 8. Accessibility & Dark Mode Parity

### 8.1 Accessibility Checklist (WCAG 2.2 AA)
- [x] **Touch Targets**: All mobile buttons, chip options, and icon triggers $\ge 48 \times 48\,\text{px}$ with $\ge 8\,\text{px}$ spacing.
- [x] **Color Contrast**: 
  - Standard text $\ge 4.5:1$ against surface containers.
  - Large values and headers $\ge 3:1$.
  - Status badges never rely on color alone—each includes an icon and text label (e.g. `● Live`, `⚠ Stale`).
- [x] **Screen Reader Semantics**:
  - `aria-live="polite"` on price refresh banners and validation error containers.
  - `<table aria-label="Vesting tranches schedule">` on desktop grid.
  - Descriptive icon button labels (`aria-label="Delete tranche vesting on 15 Dec 2026"`).
- [x] **Focus Management**:
  - Dialog openings trap focus; focus returns to the invoking trigger on close.
  - Esc key closes all modals without saving.

### 8.2 Dark Mode Adaptation
- Backgrounds switch to `var(--mat-sys-surface)` (dark charcoal, not pure black `#000000`).
- Dialogs elevate via `var(--mat-sys-surface-container-high)`.
- Positive value tokens shift from forest green (`#1b6b3a`) to high-contrast emerald (`#4ade80`).
- Timeline connecting lines use `var(--mat-sys-outline-variant)` to prevent harsh contrast.

---

## 9. Implementation File & Contract Reference

| Architecture §9 UI File | UX Component Spec & Role | Store Signals & Methods Used |
| :--- | :--- | :--- |
| `src/app/features/assets/assets.html` | Asset card with `heldShares`, `unvestedShares`, and market status badge. | `store.assetValuations`, `store.employerStockSnapshots`, `store.toggleGoalEligible` |
| `src/app/features/assets/employer-stock/employer-stock-form-dialog.ts` | Form dialog for ticker lookup, currency, and manual fallback prices. | `store.lookupTicker`, `store.addAsset`, `store.updateAsset` |
| `src/app/features/assets/employer-stock/employer-stock-detail.ts` | Central equity hub: summary hero, timeline, collapsible grants, baseline controls. | `store.assetValuations`, `store.employerStockSnapshots`, `store.grantsByAsset` |
| `src/app/features/assets/employer-stock/grant-editor-dialog.ts` | Grant creation/edit dialog with schedule generator & Signal Form tranche table. | `store.addStockGrant`, `store.updateStockGrant`, `store.deleteStockGrant` |
| `src/app/features/assets/employer-stock/vested-baseline-dialog.ts` | Modal to set/clear verified held share snapshot. | `store.setVestedSharesBaseline`, `store.clearVestedSharesBaseline` |
| `src/app/features/assets/employer-stock/vesting-timeline.ts` | Presentational horizontal visual vesting scrubber. | Inputs: `grants`, `today`, `stockPrice`, `fxRate` |
| `src/app/shared/components/market-status-badge/market-status-badge.ts` | Compact badge for Twelve Data & NBP status (`live`, `cached`, `stale`, etc.). | Inputs: `status`, `source`, `asOf`, `symbolOrPair` |
| `src/app/features/stock-sales/stock-sale-dialog.ts` | Source asset dropdown to deduct shares from employer equity. | `store.employerStockAssets`, `store.assetValuations` |
| `src/app/features/settings/` | Twelve Data API key field with password toggle and "Test Key" lookup. | `store.settings`, `store.updateSettings`, `store.lookupTicker` |
| `src/app/features/projections/` | Discrete inflow markers for upcoming vests and assumptions disclaimer. | `store.projectedInflows`, `store.projectionSummary` |
