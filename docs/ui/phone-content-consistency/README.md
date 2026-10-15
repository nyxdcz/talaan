# Phone content and menu consistency

Implements approved audit findings 26–33. The compact phone roles remain 13px action labels, 12px supporting text, 16px editable fields, 44px touch targets, 10px controls and 16px dialog corners. App V2.5.0, Finance Schema 12, Cloud Schema V3 and the finance cache identity are retained. The one-time UI refresh advances to talaan15.

## Changes

- 26: Account correction uses the short phone label “Correct balance” and complete accessible name “Correct account balance”; the original desktop label remains. Icon and label center as a group. Modes stack below 361px when two complete labels need more room.
- 27: Report headings and actions use separate phone rows; the text-labelled Export control takes the available row width.
- 28: Security choices show their complete explanations in rows with automatic height and 8px gaps. The selected explanation uses opaque text to meet normal-text contrast.
- 29: Connection title and supporting text use separate lines with one centered disclosure arrow that reflects the open state.
- 30: Reminder messages wrap and the row grows to its content, retaining its 44px minimum.
- 31: Template actions follow the heading instead of competing for a narrow column.
- 32: Project and planner overflow controls retain at least 44px touch targets and 13px labels through phone rotation; fine-pointer desktop controls keep their previous sizes.
- 33: Planner menus share viewport-coordinate positioning with retained phone record menus. Placement accounts for the visible viewport and header, updates on scroll/resize, and prefers the space above the trigger when below does not fit. Changing the expense-swipe breakpoint now closes only expense menus, preserving the planner's open state through rotation.

The earlier optional summary change 25, heading change 34, dialog gutter change 35, and proposed Today/entry-form workflows are excluded.

## Verification

- 11 new browser regressions exercise full painted-text containment, combined icon/text centering, complete accessible names, long explanatory text, gaps, selected-text contrast, real report and budget CSV export, normal pointer/keyboard menu activation, focus return, outside click, scrolling, viewport changes and preserved financial records.
- Phone widths 320, 393 and 430; heights 660 and 852; landscape 852×393; light/dark themes; mouse baseline 1440px.
- Source quality: 45 tests passed; lint, project inspection and maintainability passed.
- The full browser suite contains 419 checks, including the 11 added here; final execution status is recorded in the PR checks and implementation report.
- 22 changed text-role/theme combinations measured at a minimum contrast of 4.817:1; colors and compositing evidence in [contrast.json](contrast.json).
- Screenshots below use an isolated sample workspace with amounts masked. After images show the actual local implementation, without injected proposal styles.

Browser checks use the available Chromium engine with phone touch/viewport emulation. Physical iPhone Safari, native keyboard and VoiceOver are separate device checks. No live profile was edited.

## Before and implemented captures

| Component | Dark before / implemented | Light before / implemented |
| --- | --- | --- |
| menu | [Before](dark-before-menu.png) · [Implemented](dark-after-menu.png) | [Before](light-before-menu.png) · [Implemented](light-after-menu.png) |
| landscape project | [Before](dark-before-landscape-project.png) · [Implemented](dark-after-landscape-project.png) | [Before](light-before-landscape-project.png) · [Implemented](light-after-landscape-project.png) |
| landscape income | [Before](dark-before-landscape-income.png) · [Implemented](dark-after-landscape-income.png) | [Before](light-before-landscape-income.png) · [Implemented](light-after-landscape-income.png) |
| account | [Before](dark-before-account.png) · [Implemented](dark-after-account.png) | [Before](light-before-account.png) · [Implemented](light-after-account.png) |
| report budget | [Before](dark-before-report-budget.png) · [Implemented](dark-after-report-budget.png) | [Before](light-before-report-budget.png) · [Implemented](light-after-report-budget.png) |
| report export | [Before](dark-before-report-export.png) · [Implemented](dark-after-report-export.png) | [Before](light-before-report-export.png) · [Implemented](light-after-report-export.png) |
| remember | [Before](dark-before-remember.png) · [Implemented](dark-after-remember.png) | [Before](light-before-remember.png) · [Implemented](light-after-remember.png) |
| connection | [Before](dark-before-connection.png) · [Implemented](dark-after-connection.png) | [Before](light-before-connection.png) · [Implemented](light-after-connection.png) |
| alert | [Before](dark-before-alert.png) · [Implemented](dark-after-alert.png) | [Before](light-before-alert.png) · [Implemented](light-after-alert.png) |
| quick create | [Before](dark-before-quick-create.png) · [Implemented](dark-after-quick-create.png) | [Before](light-before-quick-create.png) · [Implemented](light-after-quick-create.png) |
