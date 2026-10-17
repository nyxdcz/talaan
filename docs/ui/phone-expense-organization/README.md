# Phone expense organization · approved finding 36

Actual local app captures at 393 × 852 CSS pixels with touch emulation, 3× device scale, fixed time October 14, 2026, both themes, isolated sample records and masked amounts. Before is merged main f941653. After uses the approved organization: neutral card, restrained warning edge, identity and amount, quiet category/note, one payment-status line, and schedule/account beside the centered payment action.

The same Apple Music example measures 181.95px before and 153.98px after, about 15% less vertical space. The payment action remains 104 × 44px. This is a measured sample, not a universal height promise: longer content and special warnings expand the row.

Canonical changes: assets/css/expense-compact.css and the expense renderer in index.html. Runtime preparation appends the canonical CSS overlay into production-ui-audit.css. The UI refresh advances to talaan16; app version 2.5.0, schema 12, cloud schema 3 and the finance cache identity remain unchanged.

Regression coverage verifies role sizes, text containment, centered payment labels and footer grouping, contrast, due states, ordinals/all-date context, recurrence updates, special warnings, custom icons, long metadata, financial immutability when cancelling dialogs, and restoration of the original layout outside the phone breakpoint. Existing swipe coverage verifies native touch events, scrolling, keyboard access and action opening. Real iPhone Safari/VoiceOver have not been tested.
