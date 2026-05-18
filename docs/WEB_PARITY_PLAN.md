# Web frontend parity plan (3 parallel workstreams)

**Goal:** The static web app (`frontend/`) should match the Expo mobile app in capability, feel *better* on large screens (desktop-first layout, not a stretched phone UI), and stay reliable end-to-end against the same FastAPI backend.

**Reference surfaces**

| Area | Mobile source | Web source |
|------|---------------|------------|
| Navigation | `mobile/src/navigation/RootNavigator.tsx` | `frontend/index.html`, `frontend/script.js` (`showTab`) |
| Closet | `mobile/src/screens/ClosetScreen.tsx` | `frontend/script.js`, `frontend/index.html` `#closet-tab` |
| Outfits + AI | `mobile/src/screens/OutfitsScreen.tsx` | `frontend/script.js`, `frontend/app-features-upgrade.js` |
| Item detail | `mobile/src/screens/ItemDetailScreen.tsx` | `frontend/item-detail.js` |
| Upload | `mobile/src/screens/UploadScreen.tsx` | `frontend/script.js`, `frontend/upload-features.js` |
| Social / travel / settings | `FeedScreen`, `FriendsScreen`, `PackModeScreen`, etc. | `frontend/app-features.js` |
| Shared helpers | `mobile/src/api/*`, theme | `frontend/lib/web-utils.js` → `window.ClosetWebUtils` |

**Run locally**

```powershell
cd backend
$env:CLOSET_ENV="development"
python main.py
# Web app: http://127.0.0.1:8000/app  (or /frontend/login.html)
```

**Smoke check (not e2e suite)**

```powershell
python scripts/smoke_web_app.py
cd frontend && npm test
```

---

## Current state (honest snapshot)

### What already works

- Auth pages, JWT in `localStorage`, tab shell (Closet / Add / Outfits / Profile + Feed when social on).
- Closet: chips, colors, sort, density, grid/rails, location filter, visual search + fit check hooks, item modal.
- Outfits: recommend API, weather toggle, home vs packed source, plan shortcut, AI stylist panel (basic).
- Care hub: laundry, insights, stats (via profile hub).
- Secondary flows wired in JS: wishlist, feed, friends, pack, trips, planning, settings, create-fit, onboarding carousel.
- Recent stability fixes: `web-utils.js` IIFE (no duplicate `const` globals), `window.ClosetApp` assigned before `updateUserDisplay`, optional chaining on `app()?.currentUser`.

### Gaps vs mobile (priority)

| Gap | Mobile | Web today |
|-----|--------|-----------|
| **Desktop layout** | N/A (phone) | Mostly single column; CSS only has `max-width` breakpoints, no `min-width` desktop grid |
| **Item detail** | Full screen, wear calendar, rich edits | Modal; calendar exists but cramped on wide screens |
| **Outfits UX** | AI mode hides occasion/season/vibe; stylist pin chips; rich planned-outfit editor | Stylist is a panel; filters always visible; planned list is simpler |
| **Closet filters** | Collapsible filter sections, sticky toolbar | Long filter bar; “More filters” panel duplicates chips |
| **Errors / feedback** | Inline errors, native alerts sparingly | Many `alert()` calls |
| **Empty states** | Themed copy + actions | Generic text; no illustrations |
| **Social** | Reactions, fit detail stack, smooth public profile | Implemented but visually thin vs mobile glass UI |
| **Regression safety** | Jest in `mobile/` | `frontend/lib/web-utils.test.js` only; smoke script is manual |

### Design principle for web

> **Use width:** persistent left nav or filter rail on ≥1024px, master–detail for items (list + detail pane), two-column outfits (controls | results), feed as masonry or multi-column cards. Mobile bottom nav stays for `<768px` only.

---

## Shared rules (all three owners)

1. **Do not add top-level `const`/`let` in new files** without an IIFE or `window.*` export — scripts share one global scope when loaded from `index.html`.
2. **`window.ClosetApp`** is the only cross-module API from `script.js`. Feature modules use `app()` helpers and `app()?.method` until init completes.
3. **Script order** (do not reorder without coordinating):

   `lib/web-utils.js` → `onboarding-carousel.js` → `script.js` → `app-features.js` → `item-detail.js` → `app-features-upgrade.js` → `upload-features.js`

4. **XSS:** interpolate user/API strings only through `escapeHtml` / `safeUrl` from `ClosetApp` or `ClosetWebUtils`.
5. **`script.js` merge contract:** Only one PR should touch `initializeApp` / `window.ClosetApp` / `showTab` at a time. Other PRs touch named regions below. Rebase daily.

| `script.js` region | Owner |
|------------------|--------|
| `initializeApp`, `showTab`, auth bootstrap | **Integrator** (rotate: whoever merges last) |
| Closet: `loadCloset`, filters, rails, visual search entry | **Track A** |
| Upload + photo flow | **Track A** |
| Outfits, care panes, stats, laundry, insights | **Track B** |
| Profile tab basics in script | **Track C** (or leave in script, hub in app-features) |

6. **CSS:** Track C owns `design-tokens.css` + layout shell. Tracks A/B add BEM blocks under their sections; prefix classes if unsure (e.g. `.closet-rail--dense`).

7. **Done means:** feature works in browser against live API, no console errors on `/app`, smoke script passes, and a one-line note in PR description under which track.

---

## Track A — Closet, upload & item experience

**Owner focus:** “My stuff” — browse, add, inspect, edit. Make the closet feel like a desktop catalog.

### Primary files

- `frontend/script.js` (closet + upload sections only)
- `frontend/item-detail.js`
- `frontend/upload-features.js`
- `frontend/index.html` — `#closet-tab`, `#upload-tab`, item modal markup
- `frontend/styles.css` — `.closet-*`, `.upload-*`, `.item-detail-*` (coordinate with Track C for tokens)

### Mobile parity checklist

Reference: `ClosetScreen.tsx`, `ItemDetailScreen.tsx`, `UploadScreen.tsx`.

- [ ] **Desktop closet layout (≥1024px):** left sticky filter rail (~260px) + scrollable grid; collapse chip rows into rail sections mirroring mobile `useClosetFilterBarSections`.
- [ ] **Filter parity:** lent / packed / favorites / clean / wash behave like mobile `FilterKey` set (multi-select OR document single-select choice); “Clear all” resets chips + location + search.
- [ ] **Sort + density + layout:** persist in `localStorage` (keys already partially used); density cycles list → comfy → compact → dense like mobile; layout toggles grid ↔ rails with horizontal subcategory rails.
- [ ] **Multi closet location:** location dropdown syncs with settings API; filter badge when active.
- [ ] **Visual search + fit check:** full-width results strip on desktop; dismiss / clear; loading states (no silent failure).
- [ ] **Item detail on desktop:** ≥1024px use split view (grid left, detail right) instead of only centered modal; keep modal on mobile.
- [ ] **Item detail parity:** wear calendar month nav, classification corrections, pack/unpack, lend/return, favorite, laundry queue, linked outfits, care label — match mobile field set in `ItemDetailScreen.tsx`.
- [ ] **Upload parity:** photo (with review queue if API returns pending), bulk quantity, CSV import, manual row, wishlist-from-upload; progress and per-file errors; redirect to closet on success.
- [ ] **Replace `alert()` in owned files** with `showToast` (add in Track C if missing).

### Web-only enhancements (do if time)

- [ ] Keyboard: `/` focus search, `Esc` close detail, arrow keys in grid (optional).
- [ ] Bulk select mode (shift-click) for pack / laundry — only if API supports batch endpoints already.

### Acceptance

1. Empty closet → illustrated empty state + CTA to Add tab.
2. 20+ items → filters, sort, rails, and item detail work without layout jump.
3. Upload one photo → appears in grid after classification poll/refresh.
4. `python scripts/smoke_web_app.py` passes; closet tab shows grid or empty-state, not eternal “Loading…”.

---

## Track B — Outfits, care & wardrobe intelligence

**Owner focus:** “What should I wear?” and wardrobe health — outfits generator, AI stylist, laundry, insights, stats.

### Primary files

- `frontend/script.js` (outfits tab, `generateOutfits`, care panes: `loadStats`, `loadLaundry`, `loadInsights`)
- `frontend/app-features-upgrade.js` (AI stylist, visual search glue, pack UI overlap — only outfits-related edits)
- `frontend/index.html` — `#outfits-tab`, `#care-tab`
- `frontend/styles.css` — `.outfits-*`, `.care-*`, `.insights-*`, `.stats-*`

### Mobile parity checklist

Reference: `OutfitsScreen.tsx`, `StatsScreen.tsx`, insights/laundry sections in mobile care flows.

- [ ] **Desktop outfits layout:** left column fixed filters + AI stylist; right column scrollable outfit cards (2–3 columns on wide screens).
- [ ] **AI stylist mode:** when enabled, hide occasion/season/vibe controls (match mobile); show pin-item chips (thumbnails) not only `<select>`.
- [ ] **Stylist API parity:** `POST /api/ai-stylist` with weather + location + `pin_item_ids`; feedback buttons call `/api/ai-stylist/feedback`.
- [ ] **Weather banner:** same copy/behavior as mobile `weatherDetail` + toggle persistence (`closet_web_weather_sync` aligned with settings).
- [ ] **Outfit cards:** score, items, “Plan this look” → planning tab with ids prefilled; reshuffle changes seed.
- [ ] **Planned outfits:** list upcoming plans, edit title/date/items, delete — match `PlanningAheadScreen` / outfits planned section in mobile.
- [ ] **Care → Laundry:** queue list, mark washed, add from item; refresh button.
- [ ] **Care → Insights:** neglect days filter, duplicate/gap cards, donate tag flow (`considerDonating` uses real `user_tags` API).
- [ ] **Care → Stats:** category breakdown, CPW highlights, charts readable on desktop (wider bars, not phone-width).
- [ ] **Pack mode interaction:** outfit source “Travel bag” counts match packed items (coordination with Track C if pack UI lives in `app-features.js` — agree on API calls only).

### Web-only enhancements

- [ ] Print-friendly outfit card (CSS `@media print`) for trip packing.
- [ ] Side-by-side compare two generated outfits (desktop only).

### Acceptance

1. Generate outfits with clean items → at least one card with images.
2. Toggle AI stylist → occasion row hidden; ask stylist → suggestions render.
3. Plan an outfit → appears under “Upcoming plans”.
4. Laundry + insights load without JS errors when opened from profile hub.

---

## Track C — App shell, social, profile hub & design system

**Owner focus:** Navigation, visual polish, social/travel/settings flows, auth, and cross-cutting UX.

### Primary files

- `frontend/index.html` — header, nav, profile hub, feed/friends/settings/trips/pack/planning/wishlist/create-fit sections, bottom nav
- `frontend/app-features.js` (feed, wishlist, pack, trips, planning, friends, settings, profile hub, onboarding banner)
- `frontend/onboarding-carousel.js`
- `frontend/styles.css` — layout shell, header, nav, hub, feed, tokens; **`frontend/design-tokens.css`**
- `frontend/auth.js`, `login.html`, `register.html`, `forgot-password.html`, `reset-password.html`, `auth.css`
- `frontend/lib/web-utils.js` (shared toasts, formatting — extend here)

### Mobile parity checklist

Reference: `ProfileScreen`, `FeedScreen`, `FriendsScreen`, `CreateFitScreen`, `PersonalSettingsScreen`, `PackModeScreen`, `TripOutfitLogScreen`, `PlanningAheadScreen`, `WishlistScreen`, `OnboardingCarouselScreen`.

- [ ] **Desktop shell:** top header + **persistent left sidebar** (icons + labels) for main tabs; hide duplicate bottom nav above 768px; max-width content area ~1400px with sensible gutters.
- [ ] **Design system pass:** spacing scale, glass cards, focus rings, button sizes consistent with mobile theme (purple accent, slate shell) — document tokens in `design-tokens.css`.
- [ ] **`min-width` breakpoints:** 768 / 1024 / 1280 for sidebar, hub grid (2–3 columns), feed columns.
- [ ] **Toast system:** `showToast(message, type)` in `web-utils` or `script.js`; migrate critical paths away from `alert()` (Tracks A/B can call it).
- [ ] **Profile hub:** stats line, edit profile, avatar upload, social section gating (`social_enabled`), reminders banner.
- [ ] **Feed:** infinite scroll or “Load more”, reactions, open fit modal, create-fit CTA.
- [ ] **Friends:** search, requests, accept/decline, view public profile modal.
- [ ] **Create fit:** caption, images, trip metadata, submit → feed refresh.
- [ ] **Wishlist / pack / trips / planning / settings:** each sub-tab loads API data, back navigation to profile, error states inline.
- [ ] **Onboarding:** carousel first visit; banner on profile; non-blocking (backdrop dismiss, no click trap).
- [ ] **Auth pages:** match password policy messaging with backend; forgot/reset flows; redirect to `/app` with token.

### Web-only enhancements

- [ ] Illustrated SVG empty states (closet, outfits, feed) under `frontend/assets/`.
- [ ] Optional keyboard shortcuts cheat sheet (`?` modal).
- [ ] Deep-link query params: `/app?tab=planning&pin=123` for support/testing.

### Acceptance

1. Log in → land on closet; sidebar/tab nav works on desktop and phone widths.
2. Social enabled user sees Feed tab; disabled user does not.
3. Profile hub cards navigate to each sub-flow and back.
4. Theme toggle persists; no layout overlap with sticky header.
5. `npm test` in `frontend/` still passes after `web-utils` changes.

---

## Integration week (after parallel work)

| Day | Activity |
|-----|----------|
| 1 | Merge Track C shell first (layout affects everyone) |
| 2 | Merge Track A + B; resolve `script.js` conflicts in agreed regions |
| 3 | Full manual pass: login → upload → closet edit → outfits → plan → feed post → pack → settings |
| 4 | Expand `scripts/smoke_web_app.py` (outfits tab, profile hub click, no `pageerror`) |
| 5 | Optional: add `frontend/README.md` section pointing to this plan |

### Manual test script (all hands)

1. Register or login at `/frontend/login.html`.
2. Hard refresh `/app` (`Ctrl+Shift+R`).
3. Add item (photo) → appears in closet.
4. Open item → edit name → save.
5. Generate outfits → plan one.
6. Profile → laundry → insights → stats.
7. If social: feed → react → open fit → friend search.
8. Settings → add closet location → filter closet by it.
9. Logout → login again → data persists.

---

## Suggested branch names

| Track | Branch |
|-------|--------|
| A | `web/track-a-closet-items` |
| B | `web/track-b-outfits-care` |
| C | `web/track-c-shell-social` |

---

## Out of scope (unless blocked)

- Rewriting web as React/SPA.
- Playwright e2e suite expansion (user asked to deprioritize).
- Backend API changes (file issues separately; use existing mobile endpoints).
- Capsule optimizer, push notifications (see `PROJECT.md`).

---

*Last updated: 2026-05-18 — aligns with uncommitted `frontend/` parity work and mobile screens as of this repo.*
