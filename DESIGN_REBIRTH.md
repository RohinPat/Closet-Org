# Closet-Org design rebirth — audit and recommendations

This document reviews the **consumer-facing visual and interaction design** across the marketing site, web app shell, authentication pages, and Expo mobile app. It explains **why things look the way they do today**, where that helps or hurts a **closet / wardrobe** product, and how to evolve toward a **calm, editorial, wardrobe-first** experience that still feels modern.

---

## 1. North star — what a closet app should feel like

**Emotional job:** *“This is my wardrobe in my pocket — organized, personal, and low-friction.”*

| Pillar | Consumer expectation | Design implication |
|--------|----------------------|--------------------|
| **Garment-first** | Photos and texture lead; UI recedes | Neutral shells, restrained gradients, high image contrast |
| **Calm control** | Sorting and filtering feels like tidying, not admin | Predictable hierarchy, limited simultaneous decisions |
| **Trust** | Care state, cost-per-wear, and “clean/dirty” must feel legible | Consistent status semantics (color + icon + label), never color-only |
| **Rhythm** | Daily open, quick glance, occasional deep edit | Tab IA mirrors real tasks: browse → plan → add → reflect |

Today you already gesture at this on the web (`styles.css` comments about a “quiet slate shell”) and on mobile (`theme.ts` — slate neutrals, “brand only via soft orbs”). The main gap is **three parallel design dialects** that do not share one typographic and color story end-to-end.

---

## 2. Inventory — where design actually lives

| Surface | Key files | Role |
|---------|-----------|------|
| **Web app** | `frontend/styles.css`, `frontend/index.html`, `frontend/script.js` | Logged-in closet, upload, outfits, laundry, insights, stats |
| **Auth web** | `frontend/auth.css`, `frontend/login.html`, `frontend/register.html forgot-password.html`, `reset-password.html` | Glass card, gradients, feature strips |
| **Marketing** | `frontend/landing.css`, `frontend/landing.html`, `landing.js` | Hero, demos, tech story, CTA |
| **Mobile** | `mobile/src/theme.ts`, `mobile/src/context/ThemeContext.tsx`, `mobile/src/components/Glass.tsx`, `mobile/src/navigation/RootNavigator.tsx`, screens under `mobile/src/screens/` | Primary product UI for many users |

**Takeaway:** Treat `theme.ts` + `Glass.tsx` as your **strongest** cohesive system today. The web split (`landing` vs `auth` vs `styles`) is the **weakest link** for brand consistency.

---

## 3. Cross-platform diagnosis

### 3.1 Color and brand

- **Web app primary** (`styles.css`, `auth.css`): indigo / violet stack (`#6366f1`, `#8b5cf6`) — reads “SaaS dashboard.”
- **Marketing hero** (`landing.css`): **multi-stop rainbow gradient** (`#667eea` → `#764ba2` → `#f093fb`) — reads “startup landing,” not “wardrobe studio.”
- **Mobile accent** (`theme.ts`): `#7C4DFF` with a **blue-violet gradient** triplet — closer to “premium consumer app” and already **slightly different** from web hex values.

**Rebirth move:** Define **one semantic token set** (documented in one place, implemented in CSS variables + TS constants):

- `--color-accent`, `--color-accent-muted`, `--gradient-accent` (max **two** hues, optional third only for marketing hero if you must)
- Neutrals: warm gray **or** cool slate — pick one family globally (you are mostly **cool slate** today; stay there for closet credibility)

### 3.2 Typography

- **Web:** `Inter` everywhere in app + auth.
- **Landing:** `Space Grotesk` for headlines + logo, `Inter` for body — intentional contrast, but it **widens the gap** between marketing and product.

**Rebirth move:** Either:

- **A)** Use one display face **only** on marketing and **one** UI face in-app (current split is OK if landing is clearly “campaign”), **or**
- **B)** Introduce the display face **sparingly** in-app for section titles only (e.g. “My closet”) so web app and landing feel related.

Avoid more than **two** font families product-wide.

### 3.3 Motion

- **Auth:** Bouncing logo emoji, floating orbs (`auth.css`).
- **Landing:** Continuous gradient shift, swaying garment illustrations, spinning stat icons, custom cursor animation (`landing.css`).
- **Web app:** Hover lifts on cards, tab fades — moderate.
- **Mobile:** Blur + gradient buttons; less “ambient” motion unless you add it screen-by-screen.

**Rebirth move:** Closet products benefit from **calm motion**. Keep:

- Short **enter** transitions (200–300 ms)
- **One** subtle ambient layer on hero **only**

Reduce or gate infinite loops behind `prefers-reduced-motion` (you already do this in places on auth orbs; landing should match everywhere).

### 3.4 Icons and affordances

- **Web header:** Theme toggle uses **emoji** (`🌙`) — fast to ship, inconsistent with the rest of the system and **not** ideal for accessibility compared to inline SVG with `aria-label`.
- **Mobile:** `Ionicons` in tab bar — consistent and platform-familiar.

**Rebirth move:** One icon style for web (SVG stroke set matching mobile stroke weight ~1.5–2px at 24px).

---

## 4. File-by-file — what is there and how to optimize

### 4.1 `frontend/styles.css` (main app)

**What works**

- CSS variables for light/dark with `[data-theme="dark"]` — good foundation.
- **Shell gradient** (`--shell-base`, `--shell-wash`) —Comment aligns with product: photos stay hero.
- Card grid, modal, laundry summaries — practical IA.

**Friction / improvement**

1. **Hardcoded badge palettes** (`.badge-category`, `.badge-season`, `.badge-style`, status chips): Tailwind-like **pastel fills** that do not automatically inherit dark-theme contrast. In dark mode, some combinations may feel **muted or muddy** or **too loud** against `--card-bg`.
   - *Fix:* Map badges to **semantic tokens** (e.g. `--tag-neutral`, `--tag-warm`, `--tag-cool`) with tested light/dark pairs.
2. **Hover transforms** (`translateY(-8px) scale(1.02)` on cards): Fun on marketing; in a **large grid** it can feel jittery. Prefer **subtle shadow + 2px lift** or border emphasis only.
3. **Primary CTA** vs **secondary**: Clear hierarchy; ensure destructive actions in modals always **outrank** gradient buttons visually (outline + red text pattern).
4. **Progress / “slider” bars** (`.freshness-bar`, `.wear-progress-bar`, `.score-bar`): Good storytelling, but **semantics** matter:
   - Add `role="progressbar"` (or expose via adjacent text) where rendered in JS.
   - Unify **track height** and **corner radius** (you use 20px, 24px, 12px in different places — pick one scale: 6 / 8 / 12).
5. **Filter UX**: Four stacked `<select>`s in `index.html` — cognitively heavy. Closets are browsed **often**; filters should feel like **chips + one “more filters” sheet**, not a form row from 2010.

### 4.2 `frontend/auth.css`

**What works**

- Glass card + soft gradient shell **matches** the “premium consumer” direction.
- Reduced-motion handling for orbs — thoughtful.

**Friction / improvement**

1. **Card hover glow** (`auth-card:hover::before`): Nice on desktop; on touch devices **unused**. Ensure focus states for inputs/buttons are equally strong.
2. **Full-width buttons** stacked — good. **Secondary actions** should be **text links** or **tertiary buttons** to reduce “wall of equal CTAs” next to primary gradient.
3. **Feature strip** at bottom: If present on small screens, it competes with the form. Consider **collapsing** to three one-line bullets under the primary CTA on mobile.

### 4.3 `frontend/landing.css`

**What works**

- **Virtual closet** visualization (rail + hangers) — **on-brand** and memorable.
- Strong narrative sections (demos, flow steps).

**Friction / improvement — high priority**

1. **`body { cursor: none; }` (desktop):** Hides the system cursor for a custom dot. This is **hostile** to many users (precision tasks, cognitive load, some assistive setups). **Remove** or restrict to a **demo canvas**, not the whole page.
2. **Visual noise:** Simultaneous grid, orbs, gradient text animation, and **many** micro-animations fight the “wardrobe calm” story. Consider **static** gradient text on scroll-past-hero.
3. **Demo stats** (`.stat-number::after` with `+`, `%`, `/7`): Clever but can feel **marketing-fluff** if disconnected from real product metrics — tie copy to real features or soften claims.
4. **Undefined token:** `.file-preview` uses `var(--bg-secondary)` which is **not** in `:root` at top of file — risk of inconsistent background.

### 4.4 `frontend/index.html` (structure)

**Improvements**

- **Nav tab proliferation:** Closet / Upload / Outfits / Laundry / Insights / Stats — six top-level tabs. Consumers think: *“my stuff,” “add,” “wear,” “maintain.”* **Group** laundry + insights + stats under **Care** or **Insights** as sub-nav or a single dashboard with anchors.
- **Profile access** in dropdown only — fine, but add **visible account** affordance on mobile web (hamburger with same routes).

### 4.5 Mobile — `theme.ts`

**What works**

- **Palette + Surface** split — mirrors Material / iOS “elevation through blur + overlay.”
- **Radii, spacing, typography** scale — this is your **design system spine**.

**Improvements**

1. **Document** the palette in a short **human readme** (designer handoff): what is `accent` vs `accentSoft` vs gradient stops.
2. **`thumbBg` (#EFEDE8)** is slightly **warm** while bg gradient is **cool** — minor tension. Either warm the whole light mode slightly or cool the thumb.
3. **Android** fallbacks in `GlassCard` (`backgroundColor: surface.cardOverlay`) — good; audit other screens for **plain `View`** that skip glass and look “flat” beside glass cards.

### 4.6 Mobile — `Glass.tsx`

**What works**

- **`GlassButton`**: Primary gradient + ghost/danger variants — **clear hierarchy**.
- **`ScreenBackground`**: Orbs + gradient + blur — **signature** look.

**Improvements**

1. **Primary button shadow** tints blue (`shadow.button`) — ensure it still works if global accent shifts greener or warmer.
2. **Hit targets:** `minHeight: 52` is good. Audit **icon-only** controls in screens (favorite, density) for **44×44** minimum.
3. **Loading states:** `ActivityIndicator` on primary — good; add **skeleton** placeholders for closet grid to reduce perceived latency.

### 4.7 Mobile — `RootNavigator.tsx`

**What works**

- Glass tab bar and transparent stack headers — **cohesive**.
- Tab order adapts to `social_enabled` — smart.

**Improvements**

1. **Center “Add”** tab: Slightly larger icon — good for emphasis; consider **FAB-style** raised center (visual peak) if you want stronger “add garment” affordance without changing IA.
2. **Label length:** “Outfits” vs “Looks” / “Fits” — pick language that matches **your feed** (`FitDetail`, `CreateFit` already say “fit”).
3. **Stats** is not a tab but a stack screen — intentional; ensure **discoverability** from Profile or Closet header (stats shortcut).

### 4.8 Mobile — `ClosetScreen.tsx` (read partial + patterns)

**What works**

- Rich filtering (clean, wash, favorites, lent, packed), density modes, sort prefs — **power user** friendly.
- Category rails and color swatches — **closet-native**.

**Improvements**

1. **First-run empty state:** Design a **guided** empty closet (illustration + “Add first piece” + optional demo) — technical grids feel cold when empty.
2. **Filter bar density:** Many chips can overwhelm; use **“Active: N”** summary + horizontal scroll with **fade edge** cues.
3. **Neglect badges:** Valuable, but language like “Never worn” should feel **supportive**, not **judgmental** (microcopy pass).

### 4.9 Mobile — `ItemDetailScreen.tsx` / `UploadScreen.tsx`

**What works**

- **Glass** cards and structured field list — consistent.
- Upload flows with **modes** (individual, bulk, import) — powerful.

**Improvements**

1. **Long forms:** Group into **Accordion** sections: *Basics / Purchase / Care / Notes / History* with **sticky save** or auto-save indication.
2. **Tag / classification pickers:** Prefer **searchable** lists over endless scroll where constants are large (`CLOTHING_*` arrays).
3. **Wishlist intent chips** — ensure selected state meets **WCAG contrast** on glass backgrounds.

---

## 5. Component system — unified rules (web + mobile)

| Element | Current state | Rebirth rule |
|---------|---------------|--------------|
| **Primary button** | Web: flat indigo; Auth/Mobile: gradient | **One rule:** gradient **or** solid accent — not both across surfaces |
| **Secondary** | Outlined / ghost | Ghost = **glass** (mobile) / **subtle border** (web) |
| **Destructive** | Red fills / soft fills | Never full red block unless **irreversible**; prefer outline + red label |
| **Cards** | Web: bordered white; Mobile: blur | Web can adopt **very light** blur only if perf OK; otherwise match **radius + shadow** language |
| **Tags / chips** | Mixed hex pastels | Tokenized **semantic** tags + dark variants |
| **Progress** | Various radii | One **track** style; label always **outside** bar for small screens if inner text crowds |

---

## 6. Accessibility and usability (consumer protection)

1. **Color-only status:** Laundry and rotation use color — pair every color signal with **text** (you often do; keep enforcing).
2. **Keyboard:** Custom cursor on landing breaks expectations — fix first.
3. **Focus rings:** Web app `filter-select:focus` — good; audit **buttons** and **modals** for visible `:focus-visible`.
4. **Motion:** Expand `mediaprint` / `prefers-reduced-motion` to **landing** continuous animations.
5. **Touch targets:** Mobile icon buttons — audit systematically.

---

## 7. Phased rebirth roadmap (practical)

### Phase A — Alignment (low risk, high clarity)

- Single **token document** + sync CSS variables with `theme.ts` names (even if values differ slightly at first).
- Fix **landing** `cursor: none` and **`--bg-secondary`** bug.
- Badge / tag colors → **theme-aware** variables on web.

### Phase B — IA and density

- Web: replace multi-select filter row with **chips + overflow menu**.
- Web: **consolidate** Stats / Insights / Laundry navigation.
- Mobile: **empty states** and **skeleton loaders**.

### Phase C — Signature closet moments

- **Lookbook grid** option: variable aspect ratio masonry **or** consistent polaroid frames for “closet album” feel.
- **Outfit builder** visual: mannequin / layer strip (even abstract) to differentiate from generic e-commerce.
- **Care hub:** one screen that merges laundry pipeline + wear-again hints (consumer mental model: “maintenance”).

### Phase D — Brand polish

- One **photography** guideline (lighting, crop, background) so user uploads feel like **one gallery** — bigger impact than any hex change.
- Optional: **seasonal** skin (autumn tint in ORB only, not whole UI) — subtle delight.

---

## 8. What to keep without apology

- **Mobile glass + orb background** — distinctive and already aligned with “soft studio” wardrobe apps.
- **Web dark mode** and **quiet slate shell** — correct direction for garment photography.
- **Landing virtual closet** motif — unique; tighten motion and connect typography to product.
- **Semantic data richness** (CPW, freshness, rotation) — differentiator; surface it with **calmer** visual weight (typography over neon).

---

## 9. Summary judgment

The product **already contains** thoughtful closet-specific logic and several **quiet-base / photo-forward** choices. The consumer experience is held back mainly by **fragmented visual languages** (marketing vs app vs auth), a few **sharp edges** (custom cursor, unthemed badges), and **filter/navigation density** on web. A rebirth should **not** mean “more gradients” — it means **one calm wardrobe studio** where every color and motion choice answers: *does this help someone feel in control of their clothes?*

---

*Generated from a static review of `frontend/*.css`, `frontend/index.html`, and `mobile/src/theme.ts`, `Glass.tsx`, `RootNavigator.tsx`, and representative screens.*
