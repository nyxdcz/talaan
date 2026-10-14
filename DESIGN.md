# Talaan visual direction

This brief is the review contract for Talaan's interface. It describes the existing product direction and the constraints for focused UI changes.

## Direction

Talaan is a quiet, local-first finance workspace. Dense financial information should feel calm, legible, and dependable. The interface uses an opaque light or dark canvas, restrained blue actions, semantic green, orange, and red states, and compact cards that make comparisons easy.

## Material budget

- Data surfaces stay opaque: finance cards, tables, forms, charts, settings panels, and repeated list rows must not use backdrop blur.
- One purposeful floating surface may use Liquid Glass: the cloud-status popover. Navigation, marquees, menus, dialogs, and repeated day cards use opaque surfaces.
- Shadows establish elevation only where a surface floats. Avoid stacked shadows, translucent borders, and decorative gradients that compete with record content.
- Reduced-transparency and forced-colors modes remove blur and preserve visible borders.

## Shape hierarchy

- The shared radius token defines the application baseline.
- Small controls, pills, and compact rows use the smallest radius in the hierarchy.
- Desktop retains 14px cards and 12px controls. The compact phone scale uses 12px cards, 10px controls, and 16px dialogs in both orientations.
- Cards and sections use the shared radius; dialogs and larger floating surfaces may be slightly larger when their component contract requires it.
- Radius changes must preserve clear card boundaries and never hide action rows or dividers.

## Type and color

- Use the existing system font stack and the established heading, body, helper, and metadata scale.
- Blue is reserved for primary actions and navigation selection. Green means positive or completed, orange means attention or planning, and red means destructive or overdue.
- Amounts use tabular numerals and remain readable when privacy masking is enabled.
- Compact phone type uses 16px page headings, 14px section/record titles, 13px action and field labels, and 12px supporting text. Editable inputs retain 16px text.
- Phone Budget uses a 28px Money remaining value, an 18px outstanding total, and 16px other amounts, with a Monthly breakdown disclosure for the intermediate calculations.
- Empty and unavailable states use explicit words such as `N/A`, `Not signed in`, or a short explanation instead of ambiguous punctuation.

## Responsive behavior

- Desktop uses multi-column comparison layouts with stable card boundaries and contained action rows.
- Tablet reduces columns and gaps without clipping labels or controls.
- Phone reflows records into stacked rows, keeps primary actions inside their cards, and provides at least 44px touch targets for interactive controls.
- Horizontal scrolling is explicit and local to wide tables or marquees; the page itself must not overflow horizontally.
- Keyboard focus uses a persistent, theme-aware ring with at least 2px visual weight and clear contrast.

## Review checklist

Before shipping a UI change, check light and dark themes at 375px, 768px, 1024px, 1440px, and 1920px where the component exists. Confirm that content, dividers, labels, controls, and focus states remain visible, contained, and reachable without changing finance schemas or local-first privacy behavior.
