# W0PIUM — Design System

> **For AI agents generating UI. Use these tokens, NEVER invent new colors or styles.**
> **Source of truth:** `public/style.css` -> `:root` / `:root.light` blocks

---

## Color Palette

### Dark Theme (default)

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#050505` | Page background |
| `--bg2` | `#0B0B0E` | Card surface, sidebar |
| `--bg3` | `#131318` | Elevated surface (modals, dropdowns) |
| `--bg4` | `#1E1E26` | Hover state, active elements |
| `--fg` | `#E8E8E8` | Primary text |
| `--fg2` | `#BFC0C5` | Secondary text, meta |
| `--fg3` | `#8A8B92` | Tertiary text, placeholders |
| `--accent` | `#8A2BFF` | Primary accent (buttons, links, active) |
| `--accent2` | `rgba(138,43,255,0.12)` | Subtle accent (hover background) |
| `--purple` | `#8A2BFF` | Purple (brand) |
| `--purple-bright` | `#A45CFF` | Bright purple highlight |
| `--violet` | `#4B0082` | Dark purple |
| `--border` | `#26262C` | Subtle border |
| `--border2` | `#3A3A42` | Stronger border, input outlines |
| `--red` | `#E84040` | Danger, error, destructive actions |
| `--green` | `#3DDC84` | Success, online status |
| `--blue` | `#4DA6FF` | Info, links |

### Light Theme (`:root.light`)

| Token | Light Value | vs Dark |
|-------|-------------|---------|
| `--bg` | `#f5f3ef` | Warm white |
| `--bg2` | `#eeebe5` | Card surface |
| `--bg3` | `#e5e0d8` | Elevated surface |
| `--bg4` | `#dbd4ca` | Hover state |
| `--fg` | `#1a1714` | Near black |
| `--fg2` | `#4a4540` | Secondary text |
| `--fg3` | `#8a8278` | Tertiary text |
| `--accent` | `#8b6a40` | Warm amber accent |
| `--accent2` | `rgba(139,106,64,0.12)` | Subtle accent |
| `--border` | `rgba(0,0,0,0.08)` | Subtle border |
| `--border2` | `rgba(0,0,0,0.15)` | Stronger border |
| `--red` | `#c0392b` | Danger |
| `--green` | `#27ae60` | Success |
| `--blue` | `#2980b9` | Info |

---

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Body | `'Tektur', 'Exo 2', sans-serif` | 400 | 15px |
| Logo | `'Syncopate', 'Exo 2', sans-serif` | 700 | variable |
| Code | `'Space Mono', monospace` | 400 | 13px |
| Headings | inherit body font | 600-700 | scale TBD |

**Rules:**
- NEVER introduce new font families
- Use `font-weight` from CSS variables where possible
- No explicit `font-size: Npx` — prefer Tailwind text classes (`text-sm`, `text-base`, `text-lg`)

---

## Spacing & Layout

Use Tailwind spacing scale (`p-2`, `m-4`, `gap-6`, etc.). Custom exceptions:

| Context | Spacing |
|---------|---------|
| Page padding | `p-4 md:p-6` |
| Card padding | `p-4` |
| Section gap | `gap-6` |
| Inline gap | `gap-2` `gap-3` |
| Chat message gap | `gap-3` |
| Nav item gap | `gap-1.5` |

---

## Border Radii

| Token | Value | Usage |
|-------|-------|-------|
| `--r-xs` | `2px` | Inline code, small badges, tags |
| `--r-sm` | `4px` | Inputs, small buttons |
| `--r-md` | `8px` | Cards, buttons, modals, media |
| `--r-lg` | `14px` | Large cards, avatars, panels |
| `--r-pill` | `999px` | Pills, badges, chip toggles, circular avatars |

**Rule:** Use only these 5 token values. No ad-hoc `border-radius` values.

---

## Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-1` | `0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px rgba(0,0,0,0.55)` | Cards |
| `--shadow-2` | `0 18px 60px rgba(0,0,0,0.7)` | Modals |
| `--glow-purple` | `0 0 0 1px rgba(138,43,255,0.5), 0 0 28px rgba(138,43,255,0.35)` | Focus, active |
| `--glow-soft` | `0 0 24px rgba(138,43,255,0.18)` | Hover highlight |

---

## Motion

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Default transitions |
| `--ease-sharp` | `cubic-bezier(0.7, 0, 0.2, 1)` | Snappy interactions |
| `--dur-fast` | `120ms` | Hover, focus, micro-interactions |
| `--dur` | `220ms` | Standard transitions |
| `--dur-slow` | `420ms` | Modals, page transitions |

**Animation rules:**
- Button hover: `transition: background .2s, color .2s, transform .18s`
- Link hover: `transition: color .15s`
- NEVER use `animation-duration` more than 500ms for UI elements
- ALWAYS respect `prefers-reduced-motion`:
  ```
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
    }
  }
  ```

---

## Icons

- Custom PNG icons from `public/icons_cut/`
- Render via `iconCut(name, className, w, h)` — name is the PNG filename (without `.png`)
- Default size: `w=20, h=20`
- Light theme inverts via CSS filter
- NEVER use emoji as icons for functional UI elements

---

## Component Patterns

### Button Variants

1. **Primary** — `bg-accent text-white rounded-md px-4 py-2 hover:opacity-90`
2. **Ghost** — `btn-ghost` class: transparent bg, hover shows `var(--bg4)`
3. **Danger** — `btn-danger` class: `--red` color, red bg on hover
4. **Icon-only** — 20x20 PNG, no bg, 0.7 opacity -> 1.0 on hover

### Inputs

- Background: `var(--bg2)`, border: `var(--border2)`, radius: `var(--r-sm)`
- Focus: `border-color: var(--accent)`, `box-shadow: var(--glow-purple)`
- Placeholder: `color: var(--fg3)`
- Height: `h-10` (40px) default

### Cards

- Background: `var(--bg2)`, border: `1px solid var(--border)`
- Radius: `var(--r-md)`, shadow: `var(--shadow-1)`
- Padding: `p-4`

### Modal

- Overlay: `rgba(0,0,0,0.5)` (dark) / `rgba(0,0,0,0.4)` (light)
- Panel: `var(--bg3)`, `var(--shadow-2)`, `var(--r-lg)`
- Width: `max-w-md` default, `max-w-lg` for large

### Avatars

- Default: `w-10 h-10` (40px), `rounded-full`
- Small: `w-8 h-8`, Large: `w-20 h-20`
- Fallback: first letter of name, `var(--bg4)` bg, `var(--fg2)` color
