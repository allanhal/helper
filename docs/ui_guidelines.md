# UI Guidelines

## Accessibility — Contrast

All text/background color combinations **must** meet WCAG AA minimums:

| Text size | Minimum contrast ratio |
|---|---|
| Normal (< 18pt) | 4.5 : 1 |
| Large (≥ 18pt or ≥ 14pt bold) | 3 : 1 |

Use tools like [Contrast Checker](https://webaim.org/resources/contrastchecker/) to verify.

**In dark mode**, always use `var(--text-primary)` (#ffffff) for primary content and `var(--text-secondary)` (#98989d) for secondary — never arbitrary gray values without checking the ratio against the background.

## Design tokens

All colors, spacing, radii, and shadows are defined in `src/styles/tokens.css`. Never hardcode hex values in components — always use CSS custom properties (`var(--...)`).

## Component conventions

- Use Tailwind for layout and spacing utilities
- Use `style={{ ... }}` with CSS variables for themed colors so dark mode works automatically
- Keep components single-purpose and small

## Code quality rules

- `pnpm lint` must pass before merging. Do not leave parse errors, broken imports, or generated build output in the lint scope.
- Do not commit unused props, locals, imports, or state. Remove dead code as soon as the call site disappears.
- Do not suppress lint rules without an inline reason and a concrete follow-up task.
- Effects should subscribe, clean up, or bridge to external systems. Avoid effect bodies that only reshuffle local state.
- Keep generated artifacts such as `dist/` and `dist-electron/` out of code-quality checks.
- Prefer typed helpers over spreading `any` through app code. If `any` is temporarily unavoidable, isolate it at the boundary and convert to typed data immediately.
- Avoid no-op expressions and placeholder callbacks that hide intent. Use explicit conditionals and named helpers instead.
- Fix warnings that indicate stale refactors early: unused exports, unused props, unreachable branches, and duplicate logic tend to turn into real regressions.
