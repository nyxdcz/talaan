## 2025-05-24 - Header Tools Menu Accessibility
**Learning:** Topbar menu items containing nested span/strong element markup for visual sublabels and shortcuts require explicit `aria-label` attributes so screen readers consistently announce the primary action without reading redundant inner text structure.
**Action:** When adding or updating topbar tool menu buttons with complex inner HTML layout, always declare a concise `aria-label` matching the button's primary intent.
