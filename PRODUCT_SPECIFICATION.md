# Worth It — Product Specification

**MVP Scope, Product Behavior, and Technical Foundation**

| Product | Platform | Architecture |
| :--- | :--- | :--- |
| **Worth It** | Angular Progressive Web App | Offline-first · Local IndexedDB · Twelve Data & NBP APIs |

*Version: 1.5 (Spec-Driven Development — Recurring Savings & IKE/IKZE Retirement Transfers) | Last Updated: 18 November 2026*

---

## 1. Product Vision

**Worth It** is a personal financial progress tracker that helps users understand how close they are to affording the life they want.

Unlike a traditional budgeting application, Worth It is organized around financial goals and long-term progress:

> *"How far am I from affording the life I want?"*

---

## 2. Product Principles

- **Goals first**: The experience is organized around what the user wants to achieve.
- **Actual wealth matters**: Progress reflects real financial balances and currently held vested shares, not just historical contributions or unvested promises.
- **Type-specific asset handling**: Each asset type has dedicated fields, workflows, and valuation mechanics rather than a generic balance box.
- **Simple configuration**: Use straightforward settings and toggles rather than complex percentage-based goal allocation rules.
- **Flexible planning**: Users can change goals and priorities as life changes.
- **Transparent projections**: Clearly distinguish actual financial progress from estimates (including future vesting schedules and expected monthly savings).
- **Manual control with live market data**: Users control their financial records while Twelve Data (stock prices) and the NBP API (FX rates) keep market valuations up to date.
- **No double counting**: Assets, expenses, reserves, stock sales, and goal allocations must be accounted for consistently.

---

## 3. Goals and Financial Journey

### 3.1 Multiple Sequential Goals
Users can create multiple financial goals and arrange them in priority order. Goal targets represent **additional amounts needed**, not cumulative wealth thresholds.
- *Example*: Apartment — 500,000 PLN; Car — 100,000 PLN; Financial Independence — 1,000,000 PLN.
- **Default funding sequence**: Financial Cushion (if enabled) $\rightarrow$ Active life goal $\rightarrow$ Upcoming goals.

### 3.2 Goal Management
- Add, edit, and delete goals.
- Change goal names and target amounts.
- Reorder or skip goals.
- Mark goals as completed.
- Modify goals at any time.

Changing goal order must never change actual wealth or silently move money between reserved amounts.

### 3.3 Goal Completion
Completing a goal does not necessarily mean spending the money immediately. Offer three choices:
1. **Spend the money**: Record the actual amount spent; reduce total wealth; carry any unspent amount forward.
2. **Reserve the money**: Keep it in total wealth, but earmark it for the completed goal and exclude it from subsequent goals.
3. **Release the money**: Make it available for the next goal.

Users can change allocations later. Accounting must prevent double counting.

---

## 4. Financial Cushion

### 4.1 Purpose
The Financial Cushion is a protected financial reserve intended to cover a configurable number of months of expenses. It is separate from life goals and takes priority over them.

### 4.2 Settings
The feature has an enable/disable toggle in Settings. When enabled, the user configures average monthly expenses and the number of months of coverage:

$$\text{Financial Cushion Target} = \text{Average Monthly Expenses} \times \text{Number of Months}$$

- *Example*: 6,000 PLN average monthly expenses $\times$ 6 months = 36,000 PLN cushion target.
- Disabling the feature does not delete its configuration or history; it stops reserving money for the cushion.

### 4.3 Funding and Maintenance
- The Financial Cushion is funded before the active life goal.
- Once fully funded, Worth It maintains it automatically.
- If spending or a withdrawal reduces it below target, new available funds restore the cushion first.
- Active goal funding resumes when the cushion is fully restored.
- The cushion remains included in total wealth, but is excluded from wealth available for life goals.

---

## 5. Wealth and Assets (Type-Specific Handling)

### 5.1 Dedicated Asset Types
Each asset type is handled separately with tailored data structures, forms, and valuation logic. All asset types share core attributes (name, asset type, goal-calculation include/exclude toggle, base-currency value, and history), while providing specialized behavior per type:

1. **Employer Stock (`employer_stock`)**: Company equity (RSUs/shares) defined by stock ticker symbol and trading currency, managed through multiple stock grants with editable vesting schedules, with support for specifying the current amount of vested shares directly as well as deducting linked Stock Sales, priced via the **Twelve Data API**, and converted to base currency via the **NBP API** (detailed in **Section 6**).
2. **Recurring Savings (`recurring_savings` — e.g., PPK, PPO)**: Workplace and recurring-contribution savings programs defined by a verified baseline balance (`baselineAmount` as of `baselineDate`) and a recurring monthly increase (`monthlyContribution`), with automatic monthly balance accrual, one-step baseline re-anchoring to reflect actual account valuations, and future contribution projections (detailed in **Section 7**).
3. **Retirement (`retirement` — IKE & IKZE)**: Voluntary individual retirement accounts governed by annual contribution limits (with 2026 presets for IKE: `28,260 PLN`, IKZE Standard: `11,304 PLN`, and IKZE Self-Employed: `16,956 PLN`), year-to-date (YTD) contribution tracking, and atomic transfers from `bank_account` or `cash` savings (detailed in **Section 8**).
4. **Other Asset Types (`bank_account`, `cash`, `stocks_etf`, `other`)**: General balance-based accounts; deferred to separate type-specific specification documents in the future and retain existing balance behavior until specified.

### 5.2 Goal Eligibility
Users decide whether each asset counts towards goals using a simple toggle (`isGoalEligible`). No percentage-based allocation is required. All enabled, goal-eligible wealth is automatically considered for the funding sequence.

### 5.3 Wealth Calculations
- **Total wealth**: Sum of all recorded assets (using current held vested value for Employer Stock and current accrued balance for Recurring Savings) converted to the base currency, adjusted for unreflected pending income/expenses.
- **Goal-eligible wealth**: Wealth in assets enabled for goal calculations.
- **Financial Cushion**: Protected reserve, when enabled.
- **Completed-goal reserves**: Money earmarked for completed goals.
- **Available goal wealth**: Eligible wealth remaining after protected and reserved amounts.
- **Active goal progress**: Amount currently available towards the active goal.

---

## 6. Employer Stock Asset Type (`employer_stock`)

### 6.1 Asset Configuration
When adding or editing an Employer Stock asset, the user specifies:
- **Asset Name** (e.g., *"Alphabet RSU"*).
- **Ticker Symbol** (e.g., `GOOGL`, `MSFT`).
- **Trading Currency** (e.g., `USD`, `EUR`).
- **Goal Eligibility Toggle (`isGoalEligible`)**: Whether the vested holdings count toward financial goals.
- **Current Vested Shares Override (Optional Baseline)**:
  - Allows the user to directly specify the **current amount of vested shares** they hold (e.g., if they have already sold shares in the past and want to set their exact current vested share count directly without recreating every historical sale).
  - Records the baseline share count (`vestedSharesBaseline`) and the date it was set (`vestedSharesBaselineDate`, defaulting to the date of entry).

### 6.2 Stock Grants & Vesting Schedule Generator
A user can assign **multiple independent stock grants** to an Employer Stock asset (including multiple grants within the same month).
- Each **Stock Grant (`StockGrant`)** includes:
  - **Grant Name / Label** (optional, e.g., *"2025 Annual Grant"*, *"Promo Grant"*).
  - **Grant Date** (`YYYY-MM-DD`).
  - **Total Shares Granted** (net shares granted).
  - **Schedule Generator Parameters**:
    - **Frequency**: `monthly`, `quarterly`, or `annual`.
    - **Duration (Months)**: Total vesting period (e.g., `12`, `24`, `36`, `48` months).
    - **Cliff / First Vest Date (Optional)**: Months before first vest (e.g., `0` or `12`) or explicit first vest date.
  - **Editable Vesting Schedule (`VestingTranche[]`)**:
    - The generator creates concrete `{ id, vestDate, shares }` rows based on the parameters.
    - The user can inspect, add, remove, or edit individual `vestDate` and `shares` entries on any row so the schedule matches their brokerage's exact vesting calendar and rounding.

### 6.3 Calculating Current & Future Held Vested Shares
For an Employer Stock asset at any evaluation date $t$:

1. **Without a Manual Current Vested Shares Baseline**:
   - **Cumulative Vested Shares at date $t$**:
     $$\text{Vested}(t) = \sum_{\substack{g \in \text{Grants} \\ v \in g.\text{tranches} \\ v.\text{vestDate} \le t}} v.\text{shares}$$
   - **Cumulative Sold Shares at date $t$** (from linked `StockSale` records where `sourceAssetId === asset.id`):
     $$\text{Sold}(t) = \sum_{\substack{s \in \text{LinkedSales} \\ s.\text{saleDate} \le t}} s.\text{sharesSold}$$
   - **Held Vested Shares at date $t$**:
     $$\text{HeldShares}(t) = \max\left(0,\ \text{Vested}(t) - \text{Sold}(t)\right)$$

2. **With a Manual Current Vested Shares Baseline ($V_{\text{base}}$ set at date $d_{\text{base}}$)**:
   - All vestings and sales on or before $d_{\text{base}}$ are already reflected in $V_{\text{base}}$.
   - For any date $t \ge d_{\text{base}}$, subsequent vesting tranches ($\text{vestDate} > d_{\text{base}}$) add to $V_{\text{base}}$, and subsequent linked Stock Sales ($\text{saleDate} > d_{\text{base}}$) subtract from it:
     $$\text{HeldShares}(t) = \max\left(0,\ V_{\text{base}} + \sum_{d_{\text{base}} < v.\text{vestDate} \le t} v.\text{shares} - \sum_{d_{\text{base}} < s.\text{saleDate} \le t} s.\text{sharesSold}\right)$$
   - The user can also update or clear $V_{\text{base}}$ at any time to re-anchor the current vested share count to a static value.

3. **Unvested Shares at Today ($t_0$)**:
   $$\text{UnvestedShares}(t_0) = \sum_{\substack{g \in \text{Grants} \\ v \in g.\text{tranches} \\ v.\text{vestDate} > t_0}} v.\text{shares}$$
   - Only $\text{HeldShares}(t_0)$ counts toward **Actual Wealth** today.
   - $\text{UnvestedShares}(t_0)$ is displayed separately on the asset card/detail view (both in shares and estimated value) and feeds into **Projected Progress** as future tranches vest.

### 6.4 Live Stock Price (Twelve Data API) & FX Conversion (NBP API)
1. **Twelve Data API (Stock Price)**:
   - Queries the current market price for the asset's `tickerSymbol` using the **Twelve Data API** (`https://api.twelvedata.com/price?symbol={ticker}&apikey={key}`).
   - The user configures their Twelve Data API key in **Settings**.
   - The fetched price and timestamp (`lastPriceUpdatedAt`) are cached locally in IndexedDB.
   - Users can trigger a manual refresh and can also enter a fallback price if offline or before configuring an API key.
2. **NBP API (Currency Exchange Rate)**:
   - When the asset's `currency` differs from the base currency in Settings (`PLN`), the app queries the **NBP Web API** (`https://api.nbp.pl/api/exchangerates/rates/a/{currency}/?format=json`) to retrieve the mid-market conversion rate to `PLN`.
   - If the base currency in Settings is set to a currency other than `PLN`, NBP Table A rates are used to compute the cross-rate to the selected base currency.
   - The fetched rate and effective date are cached locally in IndexedDB with manual fallback support when offline.
3. **Asset Valuation**:
   $$\text{Current Value (Trading Currency)} = \text{HeldShares}(\text{Today}) \times \text{StockPrice}$$
   $$\text{Current Value (Base Currency)} = \text{Current Value (Trading Currency)} \times \text{ExchangeRateToBase}$$

---

## 7. Recurring Savings Asset Type (`recurring_savings` — PPK & PPO)

### 7.1 Domain Context: Recurring Savings (PPK, PPO) vs. Annual-Cap Retirement (`retirement`: IKE, IKZE)
Long-term savings and workplace retirement instruments differ fundamentally in how contributions are made and how funds can be accessed:

1. **PPK (*Pracownicze Plany Kapitałowe*) — `recurring_savings`**:
   - Funded automatically each month via payroll deductions (typically 2% employee contribution + 1.5% employer contribution, plus state welcome/annual subsidies).
   - **Withdrawal Conditions**:
     - *After age 60 (Standard)*: 0% capital gains tax (*podatek Belki*) and no ZUS deductions when withdrawing 25% as a lump sum and 75% in at least 120 monthly installments.
     - *Special Purpose (Housing Down Payment up to age 45 or Serious Illness)*: Up to 100% of accumulated funds can be withdrawn without tax or ZUS deductions (housing down payment is returned to the account within 15 years).
     - *Early Return ("Zwrot" before age 60)*: Can be withdrawn at any time without giving a reason, subject to statutory deductions: 100% of state subsidies are returned to the state budget, 30% of employer contributions are transferred to the employee's ZUS pension subaccount (70% paid out), 100% of employee contributions are paid out, and 19% capital gains tax (*podatek Belki*) is deducted from the investment gains on the paid-out portion.
2. **PPO (Employer Private Pension / Savings Program) — `recurring_savings`**:
   - Employer-sponsored recurring monthly contribution program.
   - **Withdrawal Conditions**: Accumulated funds can be withdrawn when leaving the employer (or held for retirement) without the statutory state/ZUS clawbacks of PPK.
3. **IKE & IKZE (*Indywidualne Konto Emerytalne / Zabezpieczenia Emerytalnego*) — `retirement`**:
   - Voluntary individual accounts governed by **annual contribution limits** (e.g., in 2026: 28,260 PLN for IKE; 11,304 PLN standard / 16,956 PLN self-employed for IKZE) rather than automatic monthly payroll increments.
   - **Withdrawal Conditions**:
     - *IKE*: 0% Belka tax after age 60 (with contributions in at least 5 calendar years); early withdrawal is permitted at any time and incurs standard 19% Belka tax on gains only (no ZUS deductions).
     - *IKZE*: Contributions are deductible from the annual PIT tax base; withdrawals after age 65 (with $\ge 5$ years of contributions) are taxed at a flat 10% rate; early return requires paying full progressive PIT (12% / 32%) on the entire withdrawn sum.
   - Because IKE and IKZE rely on discretionary contributions up to an annual cap rather than fixed monthly accruals, they remain under the **`retirement`** asset type, whereas **PPK**, **PPO**, and similar monthly contribution plans use the dedicated **`recurring_savings`** asset type.

### 7.2 Asset Configuration
When adding or editing a Recurring Savings (`recurring_savings`) asset, the user specifies:
- **Asset Name** (e.g., *"PPK — Nationale-Nederlanden"*, *"Employer PPO"*).
- **Currency** (defaults to Base Currency `PLN`; supports foreign currencies converted via the NBP API or a manual fallback rate).
- **Baseline Amount (`baselineAmount`, $B_{\text{base}} \ge 0$)**: The verified current balance held in the account as of the baseline date.
- **Baseline Date (`baselineDate`, $d_{\text{base}}$, `YYYY-MM-DD`)**: The date when the baseline amount was verified (defaults to `Today`).
- **Monthly Contribution (`monthlyContribution`, $C_{\text{monthly}} \ge 0$)**: A single combined recurring monthly increase amount in the asset's currency (representing the total monthly addition, e.g., combined employee + employer contribution).
- **Contributions Active Toggle (`isContributing`, default `true`)**: Indicates whether monthly contributions are currently active. Pausing (`false`, e.g., upon leaving an employer or suspending contributions) stops future monthly accruals and projections while preserving the accumulated balance.
- **Goal Eligibility Toggle (`isGoalEligible`)**: Whether the asset counts toward the Financial Cushion and active life goals (e.g., enabled when PPO or PPK is earmarked for an apartment down payment or general goals; disabled when reserved strictly for retirement).

### 7.3 Calculating Accrued Balance & Re-Anchoring the Baseline
For a `recurring_savings` asset at any evaluation date $t$:

1. **Scheduled Monthly Accrual Dates**:
   - Starting from the anchor date $d_{\text{base}}$, each subsequent monthly contribution $k \in \{1, 2, \dots\}$ accrues on:
     $$d_k = \text{addMonthsClamped}(d_{\text{base}}, k)$$
   - Month-end dates clamp to the last day of the target month (e.g., `2026-01-31` + 1 month = `2026-02-28`, always anchored to $d_{\text{base}}$).

2. **Elapsed Monthly Contributions at Date $t$**:
   - When `isContributing === true` and $t \ge d_{\text{base}}$, the number of completed monthly contributions since $d_{\text{base}}$ is:
     $$m(t) = \max\left\{ k \in \mathbb{Z}_{\ge 0} \ \middle|\ \text{addMonthsClamped}(d_{\text{base}}, k) \le t \right\}$$
   - When `isContributing === false` or $t < d_{\text{base}}$, $m(t) = 0$.

3. **Accrued Balance at Today ($t_0$)**:
   - **Accrued Contributions since Baseline**:
     $$\text{AccruedContributions}(t_0) = m(t_0) \times C_{\text{monthly}}$$
   - **Current Accrued Balance (Asset Currency)**:
     $$\text{AccruedBalance}(t_0) = B_{\text{base}} + \text{AccruedContributions}(t_0)$$
   - **Current Value (Base Currency)**:
     $$\text{Current Value (Base Currency)} = \text{AccruedBalance}(t_0) \times \text{ExchangeRateToBase}$$
   - $\text{AccruedBalance}(t_0)$ counts directly toward **Actual Wealth** today (and **Goal-Eligible Wealth** when `isGoalEligible === true`).

4. **Re-Anchoring / Updating the Baseline**:
   - Because PPK and PPO funds are invested in market sub-funds, the real account balance periodically diverges from pure contribution math due to investment gains or losses.
   - The user can re-anchor the baseline at any time via **Update Baseline**:
     - Enters the new verified account balance $B_{\text{new}}$ and anchor date $d_{\text{new}}$ (defaulting to `Today`).
     - Records an `AssetBalanceHistory` entry with $B_{\text{new}}$ and an optional note so historical performance is preserved.
     - Resets elapsed months $m(d_{\text{new}}) = 0$; subsequent monthly contributions accrue on top of $B_{\text{new}}$ after $d_{\text{new}}$.
   - **Rate Change or Pause Protection**: When the user edits `monthlyContribution` or toggles `isContributing` without explicitly entering a new baseline balance, the system automatically snapshots $\text{AccruedBalance}(\text{Today})$ as the new `baselineAmount` at `baselineDate = Today` before applying the change, ensuring past accrued months are never retroactively altered.

---

## 8. Retirement Asset Type (`retirement` — IKE & IKZE) & Savings-to-Retirement Transfers

### 8.1 Retirement Account Configuration (`RetirementDetails`)
When adding or editing a Retirement (`retirement`) asset, the user configures:
- **Asset Name** (e.g., *"XTB IKE"*, *"mBank IKZE"*).
- **Balance** and **Currency** (default `PLN`).
- **Account Subtype / Preset (`accountKind: 'ike' | 'ikze_standard' | 'ikze_b2b' | 'custom'`)**:
  - **IKE (2026 Statutory Limit)**: Pre-fills `annualLimit = 28260` PLN.
  - **IKZE — Standard Employment (2026 Statutory Limit)**: Pre-fills `annualLimit = 11304` PLN.
  - **IKZE — Self-Employed / B2B (2026 Statutory Limit)**: Pre-fills `annualLimit = 16956` PLN.
  - **Custom / Other**: Allows entering any custom `annualLimit` ($\ge 0$) or leaving it unset (`0`).
- **Prior YTD Contributions Baseline (Optional)**:
  - `ytdContributionsBaseline?: number` ($\ge 0$) and `ytdBaselineYear?: number` (defaults to current calendar year): Allows specifying contributions already made earlier in the current calendar year before tracking transfers in Worth It.
- **Goal Eligibility Toggle (`isGoalEligible`)**: Defaults to `false` for `retirement` accounts (as funds are typically held until age 60/65), but can be toggled on at any time.

### 8.2 Transfers from Cash / Bank Account Savings to IKE / IKZE (`RetirementTransfer`)
Users can transfer savings from any `bank_account` or `cash` asset into a `retirement` (IKE/IKZE) asset:
- **Transfer Record Fields**:
  - **Source Asset (`fromAssetId: string`)**: Selected from existing `bank_account` and `cash` assets.
  - **Destination Asset (`toAssetId: string`)**: Selected `retirement` (IKE/IKZE) asset.
  - **Transfer Amount (`amount: number`)**: Positive amount contributed to the retirement account (in the retirement account's currency, with automatic FX conversion if the source account currency differs).
  - **Transfer Date (`date: string`, `YYYY-MM-DD`)**: Defaults to `Today`.
  - **Note (`note?: string`)**: Optional description (e.g., *"Q1 IKE contribution"*).
- **Atomic Balance & History Accounting**:
  1. **Deduct from Source Savings (`bank_account` / `cash`)**:
     - Automatically subtracts the transferred amount from `sourceAsset.balance` ($\max(0, \text{sourceBalance} - \text{sourceDeduction})$).
     - Logs an `AssetBalanceHistory` entry on the source asset (`"Transfer to {destinationAsset.name}"`).
  2. **Add to Destination Retirement (`retirement`)**:
     - Automatically adds `amount` to `destinationAsset.balance` ($\text{destBalance} + \text{amount}$).
     - Logs an `AssetBalanceHistory` entry on the destination asset (`"Transfer from {sourceAsset.name}"`).
  3. **Wealth & Goal Eligibility Impact**:
     - **Total Wealth** remains unchanged (an internal asset transfer is not an expense).
     - When transferring from a goal-eligible `bank_account`/`cash` asset (`isGoalEligible === true`) to an excluded `retirement` account (`isGoalEligible === false`), **Goal-Eligible Wealth** (and **Available for Goals**) decreases by the transferred amount while **Excluded Wealth** increases correspondingly.

### 8.3 Calculating Annual Contribution Limit Progress (`RetirementSnapshot`)
For a `retirement` asset in calendar year $Y = \text{year}(\text{Today})$:
1. **Recorded Transfers in Year $Y$**:
   $$\text{TransferredYTD}(Y) = \sum_{\substack{tr \in \text{RetirementTransfers} \\ tr.\text{toAssetId} === \text{asset.id} \\ \text{year}(tr.\text{date}) === Y}} tr.\text{amount}$$
2. **Total Contributed in Year $Y$**:
   $$\text{ContributedYTD}(Y) = \text{BaselineYTD}(Y) + \text{TransferredYTD}(Y)$$
   where $\text{BaselineYTD}(Y) = \text{ytdContributionsBaseline}$ if $\text{ytdBaselineYear} === Y$, else $0$.
3. **Remaining Annual Limit & Progress Percentage** (when `annualLimit > 0`):
   $$\text{RemainingLimit}(Y) = \max\left(0,\ \text{annualLimit} - \text{ContributedYTD}(Y)\right)$$
   $$\text{LimitUsagePercent}(Y) = \min\left(100,\ \frac{\text{ContributedYTD}(Y)}{\text{annualLimit}} \times 100\right)$$

---

## 9. Income

### 9.1 MVP Income Types
Supports two primary income types: **Salary** and **Other**.

### 9.2 Income Source Fields
- Custom name and income type.
- Amount and currency.
- Frequency (`monthly`, `annual`, `one_time`).
- Enabled/disabled status.
- Effective date and history where applicable.

### 9.3 Variable Salary
- Allow manual salary updates and preserve historical salary amounts.
- Record effective dates for salary changes.
- Support actual monthly salary entries.
- Distinguish expected salary from salary actually received.
- Use expected salary for projections and actual received amounts for historical reporting and pending wealth adjustments.

---

## 10. Expenses (Including Annual Stock Tax)

### 10.1 Expense Management
Worth It uses a hybrid expense model:
- Users can configure recurring monthly expense categories with expected amounts, or use a simple overall monthly expense baseline.
- Users can record **actual individual expenses** — including **annual capital gains / stock tax payments** (paid once a year based on all sold stock).
- Custom category name (e.g., Rent, Food, Transport, Utilities, Subscriptions, **Taxes / Stock Tax**, Other).

### 10.2 Expense Impact
- Actual expenses reduce total wealth (via pending adjustments until reflected in asset balances) and therefore affect goal progress.
- Recording a one-off actual expense (such as annual stock tax) reduces current wealth when incurred without inflating the recurring expected monthly expense baseline used for future monthly surplus projections.

---

## 11. Actual and Projected Progress

### 11.1 Actual Progress
Based on current recorded financial balances, currently held vested shares ($\text{HeldShares}(\text{Today})$ for Employer Stock), and currently accrued balances ($\text{AccruedBalance}(\text{Today})$ for Recurring Savings). Displays total wealth, goal-eligible wealth, Financial Cushion, available goal wealth, active goal progress, remaining amount, and progress percentage.

### 11.2 Projected Progress (Incorporating Future Stock Vesting & Recurring Savings)
Forecasts future financial progress and estimated completion dates for the Financial Cushion and sequential Goals by combining:
1. **Starting Available Goal Wealth** (and current Cushion deficit).
2. **Monthly Cashflow Surplus**: $\text{Monthly Expected Income} - \text{Monthly Expected Expenses}$.
3. **Future Recurring Savings Contributions (`recurring_savings`)**:
   - Salary in Worth It is entered as net take-home pay (after PPK/PPO employee payroll deductions), and employer PPK/PPO contributions occur outside net take-home salary.
   - Therefore, for all goal-eligible (`isGoalEligible === true`) and active (`isContributing === true`) Recurring Savings assets, their monthly contributions are treated as **additional monthly inflows on top of Monthly Cashflow Surplus** without double counting:
     $$\Delta W_{\text{recurring, monthly}} = \sum_{\substack{a \in \text{RecurringSavings} \\ a.\text{isGoalEligible} \land a.\text{isContributing}}} \left(a.\text{monthlyContribution} \times a.\text{ExchangeRateToBase}\right)$$
   - The **Effective Monthly Savings Surplus** driving linear monthly projection growth is:
     $$\text{EffectiveMonthlySurplus} = \text{MonthlyCashflowSurplus} + \Delta W_{\text{recurring, monthly}}$$
4. **Future Employer Stock Vesting Events (`employer_stock`)**:
   - For all goal-eligible (`isGoalEligible === true`) Employer Stock assets, every future vesting tranche with $\text{vestDate} > \text{Today}$ adds projected goal-eligible wealth on its scheduled `vestDate`:
     $$\Delta W_{\text{vest}} = \text{tranche.shares} \times \text{StockPrice} \times \text{ExchangeRateToBase}$$
   - As the projection timeline advances from `Today`, cumulative projected funding increases via the effective monthly savings surplus ($\text{EffectiveMonthlySurplus}$) and each scheduled vesting tranche $\Delta W_{\text{vest}}$ at its `vestDate`.
   - Even if cashflow `MonthlyCashflowSurplus <= 0`, active recurring savings contributions or future stock vestings can still advance and complete funding for the Financial Cushion and Goals.
   - Actual and projected values must always be visually distinct, with clear assumptions shown (e.g., *"Includes +800 PLN/mo from recurring savings (PPK/PPO)"* and *"Includes future stock vestings valued at current market price & NBP rate"*).

---

## 12. Dashboard

Users choose their preferred dashboard in Settings:
- **Goal-First Dashboard**: Active goal name, target, progress, estimated completion date, Financial Cushion status, and upcoming goals.
- **Financial Overview Dashboard**: Total wealth, goal-eligible wealth, Financial Cushion, completed-goal reserves, available goal wealth, monthly cashflow surplus, asset breakdown (including Employer Stock vested value & unvested pipeline, and Recurring Savings accrued balance & monthly contribution rate), and active goal.

---

## 13. Stock Sales — Integrated with Employer Stock

Worth It includes a **Stock Sales** feature for recording stock sales:
- **Sale Record Fields (`StockSale`)**:
  - **Source Asset (`sourceAssetId?: string`)**: Optional reference to an `employer_stock` asset indicating the sale came from vested employer shares.
  - **Stock / Company Name or Ticker** (auto-populated from the Employer Stock asset's ticker when selected).
  - **Sale Date** (`YYYY-MM-DD`).
  - **Number of Shares Sold (`sharesSold`)**.
  - **Sale Price per Share (`pricePerShare`)** and **Currency** (defaulted from the Employer Stock asset when selected).
  - **Calculated Gross Sale Value** and **PLN Equivalent** (fetched via NBP API or manually entered).
- **Accounting Behavior**:
  - **Share Reduction on Employer Stock**: When `sourceAssetId` is set to an Employer Stock asset, `sharesSold` is deducted from that asset's held vested shares (for sales after `vestedSharesBaselineDate`, or all sales if no manual baseline override is active).
  - **No Double Counting of Cash Proceeds**: Sale proceeds are **not** automatically added to cash/bank asset balances; the user updates their bank account balance manually when cash settles.
  - **Taxes**: Handled once a year via the Expenses feature rather than per-sale tax fields.

---

## 14. Settings

- **Base Currency**: Default `PLN` (used as the target currency for NBP FX conversion and wealth reporting).
- **Twelve Data API Key**: User-configurable API key for fetching live stock prices.
- **Default Dashboard**: Goal-first / Financial overview.
- **Theme**: Light / Dark / System.
- **Financial Cushion**: Enable/disable toggle, average monthly expenses, and coverage in months.
- **Data Export / Import**: Full JSON backup and restore (including stock grants, vesting schedules, recurring savings configurations, retirement transfers, and cached market/FX quotes).
- **Google Drive Sync**: Optional cloud backup and restore to a user-specified folder in Google Drive (`worth-it-backup.json`) using Google Identity Services (GIS) OAuth2 (`drive.file` scope) and the user's Google OAuth Client ID.

---

## 15. Technical Architecture & Data Model Additions

### 15.1 Stack
- Angular 22 standalone, zoneless, `ChangeDetectionStrategy.OnPush`, Angular Material 22 (M3), Signal Forms (`@angular/forms/signals`), `@ngrx/signals` store.
- Offline-first IndexedDB persistence via Dexie (`WorthItDB`).

### 15.2 Employer Stock & Market Data Model Extensions
- **`Asset` (extended for `employer_stock`)**:
  - `tickerSymbol?: string` (e.g., `'GOOGL'`)
  - `currentStockPrice?: number` (cached latest price in `currency`)
  - `lastPriceUpdatedAt?: string` (ISO timestamp)
  - `lastFxUpdatedAt?: string` (ISO timestamp)
  - `vestedSharesBaseline?: number` (optional static override of current held vested shares)
  - `vestedSharesBaselineDate?: string` (`YYYY-MM-DD` date when baseline was anchored)
- **`StockGrant`**:
  - `id: string`
  - `assetId: string` (foreign key to `Asset.id`)
  - `name?: string`
  - `grantDate: string` (`YYYY-MM-DD`)
  - `totalShares: number`
  - `vestingFrequency: 'monthly' | 'quarterly' | 'annual' | 'custom'`
  - `durationMonths: number`
  - `cliffMonths?: number`
  - `tranches: VestingTranche[]`
- **`VestingTranche`**:
  - `id: string`
  - `vestDate: string` (`YYYY-MM-DD`)
  - `shares: number`
- **`StockSale` (extended)**:
  - `sourceAssetId?: string` (optional link to an `employer_stock` `Asset.id`)
- **`ApplicationSettings` (extended)**:
  - `twelveDataApiKey?: string`
  - `googleClientId?: string`
  - `googleDriveBackupFolder?: string`

### 15.3 Recurring Savings (`recurring_savings`) Data Model Extensions
- **`AssetType` (extended)**:
  - `'bank_account' | 'cash' | 'stocks_etf' | 'employer_stock' | 'recurring_savings' | 'retirement' | 'other'`
- **`RecurringSavingsDetails` (stored on `Asset.recurringSavings`)**:
  - `baselineAmount: number` ($\ge 0$, verified balance at `baselineDate` in `Asset.currency`)
  - `baselineDate: string` (`YYYY-MM-DD`, anchor date from which monthly contributions accrue)
  - `monthlyContribution: number` ($\ge 0$, recurring monthly increase in `Asset.currency`)
  - `isContributing: boolean` (default `true`; when `false`, pauses automatic monthly accrual and future monthly projections)
- **`RecurringSavingsSnapshot` (computed domain snapshot)**:
  - `assetId: string`
  - `date: string` (`YYYY-MM-DD` evaluation date)
  - `baselineAmount: number`
  - `baselineDate: string`
  - `monthlyContribution: number`
  - `isContributing: boolean`
  - `monthsElapsed: number` ($m(t)$ completed monthly intervals since `baselineDate`)
  - `accruedContributions: number` (`monthsElapsed * monthlyContribution`)
  - `currentAccruedBalance: number` (`baselineAmount + accruedContributions`)
  - `nextContributionDate?: string` (`YYYY-MM-DD` date of next scheduled monthly increase when `isContributing === true`)

### 15.4 Retirement (`retirement` — IKE / IKZE) & Savings-to-Retirement Transfers Data Model Extensions
- **`RetirementAccountKind`**:
  - `'ike' | 'ikze_standard' | 'ikze_b2b' | 'custom'`
- **`RetirementDetails` (stored on `Asset.retirement`)**:
  - `accountKind: RetirementAccountKind`
  - `annualLimit?: number` ($\ge 0$, e.g. 2026 presets: `28260` for IKE, `11304` for IKZE Standard, `16956` for IKZE B2B)
  - `ytdContributionsBaseline?: number` ($\ge 0$, optional prior YTD contributions in `ytdBaselineYear`)
  - `ytdBaselineYear?: number` (e.g., `2026`)
- **`RetirementTransfer` (IndexedDB table `retirementTransfers` & `WorthItBackupData.data.retirementTransfers`)**:
  - `id: string`
  - `fromAssetId: string` (FK to `bank_account` or `cash` `Asset.id`)
  - `fromAssetName: string`
  - `toAssetId: string` (FK to `retirement` `Asset.id`)
  - `toAssetName: string`
  - `amount: number` ($> 0$, in destination `retirement` asset currency)
  - `sourceAmount: number` ($> 0$, deducted from source `bank_account`/`cash` asset currency)
  - `currency: string`
  - `date: string` (`YYYY-MM-DD`)
  - `note?: string`
  - `createdAt: string`
- **`RetirementSnapshot` (computed domain snapshot)**:
  - `assetId: string`
  - `year: number`
  - `accountKind: RetirementAccountKind`
  - `annualLimit: number`
  - `baselineYtd: number`
  - `transferredYtd: number`
  - `contributedYtd: number`
  - `remainingLimit: number`
  - `limitUsagePercent: number`
  - `isLimitReached: boolean`
