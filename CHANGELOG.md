# Changelog

## V2.5.0 · Talaan
- Adds read-only financial integrity detection and guarded recovery for historical, imported, restored, and cloud-reconstructed finance data, with deterministic safe repairs only and automatic rollback on failed imports/restores.

**Current production release:** V2.5.0
- Standardized phone controls, compact headers, summary cards, and utility actions at a maximum 35px height while preserving Finance Schema 12, Cloud Schema V3, and desktop/tablet behavior.

### Household expense splits

- Added household groups and expense-level equal, percentage, and exact PHP shares with deterministic cent rounding.
- Added payer tracking, member net positions, and explicit settlement history under Settings → Finance tools without adding a sidebar destination.
- Personal expense totals and reports count only the owner's assigned share while owner-paid Account Ledger transactions keep the complete cash amount actually paid.
- Another member can pay a split bill without deducting a Talaan account; moving the expense back to unpaid clears its payer claim.
- Settlements adjust household balances only and never create income, expenses, paid state, or automatic Account Ledger entries.
- Added expense allocation snapshots, recurring equal/percentage allocation support, paid-record edit protection, recovery snapshots, Undo, backup merge conflicts, and encrypted synchronization.
- Stored versioned groups and settlements under `ledgerSettings.householdSplits` and optional snapshots on expenses, preserving Finance Schema 12 and Cloud Schema V3.
- Hardened iPhone safe-area geometry, dynamic viewport sizing, and compact phone controls without changing desktop layouts or finance behavior.
- Corrected phone account-dialog mode headings and scroll containment, transaction-total overlap, workspace-tab chrome, and Project Agenda action wrapping.
- Organized the Dashboard into Calendar, Cash Flow, and Overview views with Calendar first, a consistent 7px card radius, a 12px spacing rhythm, and explicit default bento spans.
- Reused the exact Finance `workspace-switcher` component for Dashboard views and enlarged the monthly calendar grid across desktop and phone layouts.
- Refined the sidebar without changing its 60px collapsed or 185px expanded desktop widths: navigation now uses 12px semibold labels, 7px full-row selection states, clearer section spacing, a theme-aware Settings divider, and collapsed tooltips.
- Reordered the expanded sidebar header to place the logo first in the navigation-icon column, the Talaan title second, and the pin/unpin control at the far-right edge.
- Expanded the phone drawer to a capped 320px with safe-area padding and 48px navigation rows while preserving every route and the existing pinned-state preference.
- Normalized Calendar, Cash Flow, and Overview into one full-width Dashboard contract outside Customize mode, while preserving saved card order, visibility, and size preferences for editing.
- Enlarged the desktop calendar canvas, matched its event panel height, bounded the Cash Flow chart on wide screens, and made Overview use predictable three-, two-, and full-width bento rows.
- Kept the PWA cache at `finance-v2-20260828-household-splits-r17` and advanced the one-time Dashboard presentation refresh so installed clients receive the normalized layouts without changing the product version.
- Hardened Account Ledger balance corrections so edits are reconciled, verified in active-profile storage before the dialog closes, blocked for Viewer profiles, and delivered through fresh network-first account/sync runtime assets without changing Finance Schema 12, Cloud Schema V3, or the product version.

## V2.4.0 · Talaan

**Current production release:** V2.4.0

Talaan V2.4.0 is the active release baseline. This changelog focuses only on the current product version.

### Manual net worth ledger

- Added manually maintained assets and liabilities with dated valuation histories.
- Added net worth totals, category composition, stale-value awareness, and historical value evolution under Insights without adding a sidebar destination.
- Kept every valuation separate from Available Money, Cash Flow, Account Ledger balances, paid state, and project payments.
- Added optional foreign-currency values using an explicitly entered PHP conversion rate, with manual, stale, and converted-value labels.
- Added archive/restore, recovery snapshots, Undo, backup merge conflict handling, encrypted synchronization, and net-worth-only privacy-lock detection.
- Stored the versioned configuration under `ledgerSettings.netWorth`, preserving Finance Schema 12 and Cloud Schema V3.
- Rotated the PWA cache to `finance-v2-20260827-net-worth-r10` so installed clients receive the new Insights module and styles together.

### Local OFX and QIF statement import

- Added original local parsers for OFX 1.x SGML and OFX 2.x XML bank and credit-card statements.
- Added QIF Bank, Cash, CCard, Oth A, and Oth L parsing with opening-balance exclusion and bracketed-category transfer handling.
- Kept all formats inside the existing map, preview, rule-suggestion, deduplication, recovery, Undo, commit, and single-import rollback pipeline.
- Required OFX FITID values, blocked non-PHP or undeclared OFX currencies, and required explicit PHP confirmation for QIF.
- Rejected unsupported investment OFX and QIF split transactions before they can be selected.
- Added format-aware mapping profiles and compact batch metadata without widening Finance Schema 12 or Cloud Schema V3.
- Rotated the PWA cache to `finance-v2-20260826-import-formats-r9` so installed clients receive the parser before the import UI.

### Local CSV import center

- Added an original local-only CSV pipeline for parsing, column mapping, preview, duplicate detection, commit, and rollback.
- Added reusable mapping profiles, Philippine D/M/Y dates, signed amount and debit/credit support, delimiter detection, and quoted multiline values.
- Added preview totals, invalid and duplicate reasons, date range, destination-account context, and reviewed payee/rule suggestions.
- Added recovery snapshots, Undo, one-save commits, import batches, and single-import rollback.
- Imported records never deduct account balances or create Account Ledger entries; transfers remain excluded from personal totals.
- Uploaded file contents and filenames remain session-only and are never synchronized, cached, logged, or stored.
- Rotated the PWA cache to `finance-v2-20260826-import-center-r8` while preserving Finance Schema 12 and Cloud Schema V3.

### Payees and transaction rules

- Added normalized payees with Unicode-aware aliases, optional default categories, and non-mutating account suggestions.
- Added deterministic ordered rules with equals, contains, starts-with, and validated regular-expression matching.
- Added explainable preview showing every matched rule and proposed field change before records can be selected for bulk apply.
- Added recovery snapshots, confirmation, stale-preview protection, and Undo for rule import and bulk application.
- Added rule export/import and Finance tools actions to the existing global search without adding a sidebar destination.
- Kept rules from changing account balances, paid state, payment identifiers, recurring-series identity, or project payments.
- Rotated the PWA cache to `finance-v2-20260825-payees-rules-r7` while preserving Finance Schema 12 and Cloud Schema V3.

### Transaction workspace and display privacy

- Added profile-scoped named transaction views for Income, Budget & Expenses, and Paid Expenses without widening Finance Schema 12 or Cloud Schema V3.
- Added desktop column visibility and keyboard-operable reordering while keeping record identity, amount, and actions protected.
- Added list/calendar display modes, row density, sorting, visible/selected totals, and Income selection alongside the existing expense selection flows.
- Added a persistent Hide values control that masks monetary text, chart surfaces, accessible monetary labels, and newly rendered content without changing stored values.
- Added transaction-view and Hide/Show values actions to the existing global search instead of introducing a second command system.
- Rotated only the PWA delivery cache to `finance-v2-20260824-transaction-views-r6`; product version and protected finance/cloud schemas remain unchanged.

### Brand and PWA

- Renamed the current product experience to **Talaan**.
- Updated the website title, sidebar brand, installed-app labels, manifest metadata, offline page, install messaging, and calendar export branding.
- Updated current-facing repository documentation to use the Talaan name.
- Unified the legacy primary-action blues on `#356FD1` across buttons, selected controls, and related blue UI states.
- Replaced the remaining exact `#244770` and `#325279` shades with `#356FD1` across tracked source and runtime styles.
- Styled the active Finance and Projects workspace tabs with Talaan blue `#356FD1` and persistent white text across hover, focus, and dark mode while leaving inactive tabs neutral.
- Kept the **More tools** control at 34px on fine-pointer desktops, restored the 44px touch-tablet target, and contained both the trigger and popup within the viewport.
- Kept the collapsed desktop sidebar at a 64px icon rail, restored a compact 190px open/pinned state with the uploaded logo, Talaan title, and navigation labels, and kept `#356FD1` limited to the selected icon square rather than the full row.
- Increased collapsed sidebar tooltip readability with 13px semibold white text on a solid `#1F2937` popup, larger padding, and a stronger shadow while preserving hover and keyboard focus behavior.
- Replaced the sidebar brand pseudo-image with a real 16px `talaan-brand-logo.png` image beside the Talaan title and cache-busted the brand stylesheet/image as `talaan6` so the uploaded logo renders reliably.
- Replaced the sidebar brand PNG with the exact uploaded artwork and advanced the one-time UI refresh to clear any previously cached `talaan-brand-logo.png` before reloading.
- Rotated the PWA cache to `finance-v2-20260824-transaction-views-r6` so installed clients receive the refreshed primary color and corrected header layout.
- Preserved compatibility-sensitive storage keys, repository paths, calendar UID domains, and runtime filenames where changing them could affect saved data or installed clients.

### Finance

- Local-first Dashboard and Finance workspace.
- Income, Budget & Expenses, Paid Expenses, Accounts, and Account Ledger.
- Transfers, reconciliation, direct account spending, payment reversals, and auditable balances.
- Monthly category budgets, planned vs. actual spending, savings allocation, forecasts, and low-balance awareness.
- Multi-range reports, financial insights, project profitability, utility trends, and CSV/PDF export.

### Budget & Expenses

- Compact desktop expense cards and action rows.
- First half, Second half, and Other expenses sections with independent collapse controls.
- Repeat monthly, Mark paid, Edit, and expense-selection controls.
- Added `icons/repeat-monthly-off.png` and `icons/repeat-monthly-on.png` as the replaceable artwork for the saved-for-future-months control while preserving the existing recurrence behavior and accessibility labels.
- Added a short spring-style bounce when the Repeat monthly control is clicked or tapped, with the animation disabled when Reduce Motion is enabled.
- Removed the redundant visible Repeat monthly / Repeats monthly text beside the recurrence icon in Paid Expenses desktop rows while keeping the icon control, tooltip, accessibility label, and phone More-actions wording.
- Unified the Paid Expenses desktop recurrence control with the same 30px replaceable OFF/ON PNG artwork and spring bounce used by Budget & Expenses.
- Compact Monthly budget plan and summary layouts.
- PNG mascot summaries with phone numeric fallbacks and accessible numeric labels.

### Projects & productivity

- Projects, completed projects, revision cycles, and Project Agenda.
