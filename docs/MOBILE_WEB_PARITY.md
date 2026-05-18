# Mobile vs web parity tracker

**Purpose:** Track every user-facing capability on **mobile** (`mobile/`) vs **web** (`frontend/`), against the shared **FastAPI** backend (`backend/`). Use checkboxes to mark web catch-up work.

**Companion docs:** [WEB_PARITY_PLAN.md](./WEB_PARITY_PLAN.md) (implementation tracks), [PROJECT.md](../PROJECT.md) (shared backlog & security).

*Last updated: 2026-05-18*

---

## Implementation run (live)

**Orchestration:** Parallel agents implement web catch-up; **update this section** when you start, finish, or block on a task (set status + `Updated` timestamp).

### Agent roster

| Agent | Focus | WEB / UX IDs | Status | Last update |
|-------|--------|--------------|--------|-------------|
| A1 | Item detail + closet quick actions | WEB-001, 015–017, 361–363 · UX-005–010 | ✅ Done | 2026-05-18 |
| A2 | Pack mode (wire helpers → UI) | WEB-002–005, 023–024, 028 · UX-013 | ✅ Done | 2026-05-18 |
| A3 | Planning + trip log | WEB-006–011 · UX-014 | ✅ Done | 2026-05-18 |
| A4 | Wishlist, upload, profile, filters, auth | WEB-012–014, 018–022, 033, 1017, 1105–1112, 1207, 208 | ✅ Done | 2026-05-18 |
| A5 | Outfits/social polish + P3 + UX sweep | WEB-025–026, 029–035 · remaining UX-### | ✅ Done | 2026-05-18 |

**Status key:** ⬜ Not started · 🔄 In progress · 🟡 Partial (infra only) · ✅ Done · ⛔ Blocked

### Task ledger (sync with master checklist below)

| ID | Priority | Ledger status | Notes |
|----|----------|---------------|-------|
| WEB-001 | P0 | ✅ | Lifecycle chips in `item-detail.js` → `PUT /item/:id` + status for clean/in_hamper |
| WEB-002 | P0 | ✅ | Inline pack trip card + `#trip-form-modal`; New/Edit trip header buttons (no `prompt()`) |
| WEB-003 | P0 | ✅ | Geocode + forecast in pack tab via `GET /weather/geocode`, `GET /weather/forecast` |
| WEB-004 | P0 | ✅ | Suggest fits + multi-recommend build list in `loadPackMode()` |
| WEB-005 | P0 | ✅ | Apply pack list / pack selected via `PUT /closet/packed` + trip packed |
| WEB-006 | P0 | ✅ | Notes on create + inline edit via `PUT /planned-outfits/:id` |
| WEB-007 | P0 | ✅ | Status chips (draft/confirmed/worn/skipped) in `loadPlanning()` |
| WEB-008 | P0 | ✅ | Prep checklist toggles with partial PUT |
| WEB-009 | P1 | ✅ | Trip log start form → `openCreateFitWithTrip()` |
| WEB-010 | P1 | ✅ | Expand album → posts → `openFitModal()` |
| WEB-011 | P1 | ✅ | Add another fit per expanded album |
| WEB-012 | P1 | ✅ | `uploadWishlistPhotos` multipart in `app-features.js` |
| WEB-013 | P1 | ✅ | Photo → wishlist panel in `upload-features.js` |
| WEB-014 | P1 | ✅ | Modals + toasts; only modal-missing fallbacks use native `confirm` |
| WEB-015 | P1 | ✅ | Multi-image carousel from `image_paths[]` in `item-detail.js` |
| WEB-016 | P1 | ✅ | `#item-edit-tags-modal` with type/group/style/season/color chips |
| WEB-017 | P1 | ✅ | Hover quick actions on grid + rail cards in `script.js` |
| WEB-018 | P1 | ✅ | `#profile-created`, `#profile-last-login` in profile tab |
| WEB-019 | P2 | ✅ | Collapsible filter sections + `closet_filter_bar_sections_v1` |
| WEB-020 | P2 | ✅ | Mobile keys `neglected`, `cpw`; web extras documented in HTML |
| WEB-021 | P2 | ✅ | Capsule gap → wishlist prefill via `navigateToWishlistPrefill` |
| WEB-022 | P2 | ✅ | Wishlist PUT notes inline edit |
| WEB-023 | P2 | ✅ | Activity chips in pack tab + trip form modal |
| WEB-024 | P2 | ✅ | All / Packed / Not packed view mode chips |
| WEB-025 | P2 | ✅ | `#outfits-options-sheet` bottom sheet (weather + AI stylist) |
| WEB-026 | P2 | ✅ | `#fit-modal` full-viewport on ≤767px |
| WEB-027 | P2 | ✅ | Illustrated empty states: outfits seed/generate + planning (`empty-planning.svg`) |
| WEB-028 | P2 | ✅ | Edit trip via modal + `#pack-edit-trip-btn`; inline save in pack tab |
| WEB-029 | P3 | ✅ | Arrow keys + Enter in closet grid |
| WEB-030 | P3 | ⬜ | Bulk select mode |
| WEB-031 | P3 | ✅ | `@media print` expanded for outfit cards |
| WEB-032–035 | P3 | 🟡 | Compare outfits ⬜; change-password ✅ (WEB-033); auto-unpack/embedding ⬜ |
| WEB-208 | — | ✅ | Auth success uses toast not `alert` |
| WEB-1017 | — | ✅ | Stats + insights gap → wishlist route |
| WEB-1105–1112 | — | ✅ | Wishlist notes/photos/route params |
| WEB-1207 | — | ✅ | Feed error + `/healthz` hint |

*Agents: mark ledger **✅** and master checklist `[x]` when shipped; bump “Last update” on your row.*

---

## How to use this document

### Status legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Web matches mobile (acceptable UX; same API behavior) |
| 🟡 | Web partial — works but missing fields, polish, or uses `prompt`/`confirm` |
| ❌ | Missing on web (mobile or backend capability exists; web not wired) |
| 📱 | Mobile-only (native hardware/SDK; no web equivalent expected) |
| 🌐 | Web-only (intentional desktop/marketing extras) |
| ⬜ | Not on either client yet (backend may or may not exist) |
| 🔧 | Backend exists; neither UI uses it |

### Checkbox convention

- `[ ]` = not done on web (track work here)
- `[x]` = done on web

Pre-filled boxes reflect **current repo state** (2026-05-18). Change them as you ship.

### ID convention

- `WEB-###` — web catch-up item (primary tracker)
- `API-###` — endpoint wiring matrix
- `UX-###` — dialog / empty-state / visual polish
- `SHARED-###` — both platforms backlog

---

## Progress snapshot (web catch-up)

| Area | Total items | ✅ Done | 🟡 Partial | ❌ Missing |
|------|-------------|---------|------------|------------|
| Auth & shell | 28 | 24 | 3 | 1 |
| Closet | 45 | 38 | 4 | 3 |
| Upload | 22 | 17 | 2 | 3 |
| Item detail | 38 | 30 | 4 | 4 |
| Outfits & AI | 32 | 26 | 4 | 2 |
| Planning | 18 | 12 | 0 | 6 |
| Pack & trips | 28 | 24 | 0 | 4 |
| Care (stats/laundry/insights) | 24 | 20 | 3 | 1 |
| Wishlist | 14 | 14 | 0 | 0 |
| Social | 30 | 23 | 5 | 2 |
| Profile & settings | 26 | 22 | 3 | 1 |
| **Approx. total** | **~305** | **~246** | **~32** | **~27** |

*Counts are manual estimates from checklists below; use section checklists as source of truth.*

---

## Master checklist (web catch-up)

Quick scan list. Details in sections below.

### P0 — functional gaps

- [x] WEB-001 Full laundry state machine on item detail (`clean` / `worn` / `in_hamper` / `washing` / `drying`)
- [x] WEB-002 Pack mode: trip create/edit form (replace `prompt()` chain)
- [x] WEB-003 Pack mode: destination geocode + weather forecast display
- [x] WEB-004 Pack mode: suggest outfits for trip (multi `GET /outfits/recommend`)
- [x] WEB-005 Pack mode: build/apply pack list from suggestions
- [x] WEB-006 Planning: plan `notes` field on create/edit
- [x] WEB-007 Planning: plan `status` editor (draft / confirmed / worn / skipped)
- [x] WEB-008 Planning: prep checklist toggles (`prep_clean`, `prep_packed`, `prep_steamed`, `prep_accessories`)

### P1 — important flows

- [x] WEB-009 Trip log: start trip → navigate to create-fit with trip metadata
- [x] WEB-010 Trip log: drill into album posts → fit detail
- [x] WEB-011 Trip log: add another fit to existing album
- [x] WEB-012 Wishlist: photo upload (`uploadWishlistPhotos` / multipart)
- [x] WEB-013 Upload: wishlist-from-photo flow (like mobile Upload screen)
- [x] WEB-014 Replace all `prompt()` / `confirm()` with in-app forms + toasts (A4 scope: wishlist, locations, friends, settings, auth toasts) — A5: `script.js`, `app-features-upgrade.js`, `item-detail.js` done
- [x] WEB-015 Item detail: multi-image carousel (`image_paths[]`)
- [x] WEB-016 Item detail: Edit tags modal (subcategory picker) — not `prompt()` for classification fix
- [x] WEB-017 Closet: swipe/quick actions on cards (favorite, mark clean, delete)
- [x] WEB-018 Fix dead profile fields `#profile-created`, `#profile-last-login`

### P2 — polish & parity

- [x] WEB-019 Closet: collapsible filter sections (persist section open/closed)
- [x] WEB-020 Align sort keys with mobile (`neglected`, `cpw`) or document intentional web extras
- [x] WEB-021 Stats: capsule gap → wishlist with prefilled route params
- [x] WEB-022 Wishlist: edit notes via `PUT /wishlist/{id}` (or item patch)
- [x] WEB-023 Pack mode: trip activity presets (casual/work/dinner/active/night/cozy)
- [x] WEB-024 Pack mode: view modes All / Packed / Not packed (explicit UI)
- [x] WEB-025 Outfits: bottom-sheet style options (mobile extras menu parity)
- [x] WEB-026 Social: fit detail full-screen route option on mobile widths
- [x] WEB-027 Illustrated empty states (outfits, feed, wishlist, planning)
- [x] WEB-028 `updateTrip` form on web (edit existing trip, not only create)

### P3 — nice to have

- [x] WEB-029 Keyboard: arrow keys in closet grid
- [ ] WEB-030 Bulk select mode in closet (if batch APIs used)
- [x] WEB-031 Print-friendly outfit card (CSS exists — verify content)
- [ ] WEB-032 Compare two generated outfits (desktop)
- [x] WEB-033 Wire `POST /api/auth/change-password` in settings
- [ ] WEB-034 Wire `POST /api/trips/auto-unpack` if product wants it
- [ ] WEB-035 Wire `POST /api/closet/embedding-backfill` (admin/dev only?)

---

## 1. App shell & navigation

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-101 | Bottom tab bar (Closet, Add, Outfits, Profile) | ✅ | ✅ | ✅ |
| WEB-102 | Feed tab when `social_enabled` | ✅ | ✅ | ✅ |
| WEB-103 | Default tab: Feed if social, else Closet | ✅ | ✅ | ✅ |
| WEB-104 | Stack navigation for sub-screens | Native stack | Profile hub sub-tabs + back | 🟡 |
| WEB-105 | Onboarding carousel gate before auth | ✅ | ✅ | ✅ |
| WEB-106 | Onboarding profile checklist banner | N/A | ✅ | 🌐 |
| WEB-107 | Persistent left sidebar ≥768px | N/A | ✅ | 🌐 |
| WEB-108 | Hide bottom nav + header pills ≥768px | N/A | ✅ | 🌐 |
| WEB-109 | Deep link `?tab=&pin=` | N/A | ✅ | 🌐 |
| WEB-110 | Keyboard `/` focus search | N/A | ✅ | 🌐 |
| WEB-111 | Keyboard `?` shortcuts modal | N/A | ✅ | 🌐 |
| WEB-112 | Keyboard `Esc` close modals | N/A | ✅ | 🌐 |
| WEB-113 | Theme toggle in header | In settings + context | ✅ | ✅ |
| WEB-114 | Glass blur tab bar | `expo-blur` | CSS only | 🟡 |
| WEB-115 | Marketing landing page | External link | `landing.html` | 🌐 |
| WEB-116 | Static privacy / terms pages | External link | `privacy.html`, `terms.html` | 🌐 |
| WEB-117 | Auth redirect unauthenticated → login | ✅ | ✅ | ✅ |
| WEB-118 | Script load order contract | N/A | Documented in WEB_PARITY_PLAN | 🟡 |

**Files:** `RootNavigator.tsx` · `index.html` · `script.js` · `onboarding-carousel.js`

---

## 2. Authentication & account

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-201 | Login | ✅ | `login.html` | ✅ |
| WEB-202 | Register | ✅ | `register.html` | ✅ |
| WEB-203 | Register: full name field | ✅ | ✅ | ✅ |
| WEB-204 | Register: email | ✅ | ✅ | ✅ |
| WEB-205 | Password policy messaging | ✅ | ✅ | ✅ |
| WEB-206 | Forgot password | ✅ | ✅ | ✅ |
| WEB-207 | Reset password with token | ✅ | ✅ | ✅ |
| WEB-208 | Forgot/reset success uses toast not `alert` | N/A | `ClosetWebUtils.showToast` in `auth.js` | ✅ |
| WEB-209 | `GET /auth/me` bootstrap | ✅ | ✅ | ✅ |
| WEB-210 | JWT in secure storage | SecureStore | `localStorage` | 🟡 |
| WEB-211 | `POST /auth/logout-all` | Settings | Settings | ✅ |
| WEB-212 | `POST /auth/change-password` | ⬜/backend | Settings form | ✅ |
| WEB-213 | `PUT /auth/profile` (name, bio) | ✅ | Profile tab | ✅ |
| WEB-214 | `POST /auth/avatar` | ✅ | Profile | ✅ |
| WEB-215 | Token version logout on password change | Backend | Same | ✅ |

**Files:** `LoginScreen.tsx` · `RegisterScreen.tsx` · `auth.js`

---

## 3. Closet tab

### 3.1 Data loading

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-301 | `GET /closet` with query params | ✅ | ✅ | ✅ |
| WEB-302 | `GET /closet/locations` | ✅ | ✅ | ✅ |
| WEB-303 | `GET /settings` for default location | ✅ | ✅ | ✅ |
| WEB-304 | Pull-to-refresh | ✅ | Tab re-show / manual | 🟡 |
| WEB-305 | Loading / error / retry empty state | ✅ | ✅ | ✅ |
| WEB-306 | Illustrated empty closet + CTA to Add | Themed | SVG + CTA | ✅ |

### 3.2 Search & intelligence

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-310 | Client-side text search | ✅ | ✅ | ✅ |
| WEB-311 | `POST /closet/visual-search` | ✅ | `app-features-upgrade.js` | ✅ |
| WEB-312 | Visual search results → open item | ✅ | ✅ | ✅ |
| WEB-313 | Dismiss / clear visual search | ✅ | ✅ | ✅ |
| WEB-314 | `POST /closet/fit-check` | On **Upload** tab | On **Closet** tab | 🟡 placement |
| WEB-315 | Fit check pairing preview UI | ✅ | ✅ | 🟡 |

### 3.3 Filters (status chips)

Mobile `FilterKey`: `clean` | `wash` | `favorites` | `lent` | `packed` (multi-select set).

| ID | Filter | Mobile | Web | Status |
|----|--------|--------|-----|--------|
| WEB-320 | Clean | ✅ | ✅ | ✅ |
| WEB-321 | Needs wash | ✅ | ✅ | ✅ |
| WEB-322 | Favorites | ✅ | ✅ | ✅ |
| WEB-323 | On loan | ✅ | ✅ | ✅ |
| WEB-324 | Packed | ✅ | ✅ | ✅ |
| WEB-325 | Clear all filters | ✅ | `#closet-clear-filters` | ✅ |

### 3.4 Filters (other)

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-330 | Category chips | ✅ | ✅ | ✅ |
| WEB-331 | Color chips | ✅ | ✅ | ✅ |
| WEB-332 | Rotation filter (high/med/low/neglected) | Via sort `neglected` | Dedicated rotation chips | 🟡 |
| WEB-333 | Storage location text filter | Section in filter bar | “More filters” panel | 🟡 |
| WEB-334 | Multi-closet location chips | ✅ | ✅ | ✅ |
| WEB-335 | Collapsible filter sections | ✅ (`closets`, `status`, `categories`, `colors`, `locations`) | ✅ same sections in filter bar | ✅ |
| WEB-336 | Persist filter section expand state | SecureStore | `closet_filter_bar_sections_v1` | ✅ |
| WEB-337 | Desktop sticky filter rail ≥1024px | N/A | ✅ | 🌐 |

### 3.5 Sort, layout, density

| ID | Option | Mobile key | Web key | Status |
|----|--------|------------|---------|--------|
| WEB-340 | Recently added | `recent` | `recent` | ✅ |
| WEB-341 | Most worn | `most_worn` | `most_worn` | ✅ |
| WEB-342 | Neglected | `neglected` | `neglected` (+ rotation chips) | ✅ |
| WEB-343 | Best CPW | `cpw` | `cpw` | ✅ |
| WEB-344 | Last worn (oldest first) | — | `last-worn` | 🌐 |
| WEB-345 | Least worn | — | `least-worn` | 🌐 |
| WEB-346 | Freshness score | — | `freshness` | 🌐 |
| WEB-350 | Layout grid ↔ rails | `closet_layout_v1` | `closet_web_layout` | ✅ |
| WEB-351 | Density list→comfy→compact→dense | `closet_density_v1` | `closet_web_density` | ✅ |
| WEB-352 | Sort persisted | `closet_sort_v1` | `closet_web_sort` (mobile keys + web extras) | ✅ |
| WEB-353 | Subcategory horizontal rails | ✅ | ✅ | ✅ |

### 3.6 Item cards & quick actions

| ID | Action | Mobile | Web | Status |
|----|--------|--------|-----|--------|
| WEB-360 | Tap card → item detail | ✅ | ✅ | ✅ |
| WEB-361 | Swipe: mark clean | ✅ | ✅ hover action | ✅ |
| WEB-362 | Swipe: favorite | ✅ | ✅ hover action | ✅ |
| WEB-363 | Swipe: delete | ✅ | ✅ confirm modal | ✅ |
| WEB-364 | Haptic on actions | 📱 | — | 📱 |
| WEB-365 | Badges: CPW, days since worn, rotation, lent | ✅ | ✅ | ✅ |
| WEB-366 | Split detail pane ≥1024px | N/A | ✅ | 🌐 |

**Files:** `ClosetScreen.tsx` · `script.js` · `index.html` · `preferences.ts`

---

## 4. Upload (Add) tab

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-401 | Mode: individual photos | ✅ | Photo tab | ✅ |
| WEB-402 | Max 4 photos per batch | ✅ | ✅ | ✅ |
| WEB-403 | Camera capture | 📱 | File picker only | 📱 |
| WEB-404 | Library multi-select | ✅ | ✅ | ✅ |
| WEB-405 | `POST /upload-clothing` | ✅ | ✅ | ✅ |
| WEB-406 | Fit check before save | ✅ | ✅ | ✅ |
| WEB-407 | Fit check “preview pairings” | ✅ | 🟡 | 🟡 |
| WEB-408 | Classifier bulk suggestion (socks, etc.) | ✅ | `showBulkSuggestion` | ✅ |
| WEB-409 | Duplicate hint after upload | ✅ | 🟡 | 🟡 |
| WEB-410 | Mode: bulk quantity | ✅ | Bulk tab | ✅ |
| WEB-411 | `POST /closet/bulk-item` | ✅ | ✅ | ✅ |
| WEB-412 | `POST /closet/bulk-item/upload` | ✅ | ✅ | ✅ |
| WEB-413 | Mode: CSV import | ✅ | Import tab | ✅ |
| WEB-414 | `POST /closet/import-csv` | ✅ | ✅ | ✅ |
| WEB-415 | Mode: manual row | ✅ | Import tab | ✅ |
| WEB-416 | `POST /closet/import-manual` | ✅ | ✅ | ✅ |
| WEB-417 | Wishlist-from-photo on upload screen | ✅ | ❌ | ❌ |
| WEB-418 | Upload tab: quick wishlist add | N/A | `POST /wishlist` fixed category Other | 🌐 |
| WEB-419 | Per-file error display | ✅ | Toasts | 🟡 |
| WEB-420 | Redirect / refresh closet after success | ✅ | ✅ | ✅ |

**Files:** `UploadScreen.tsx` · `upload-features.js` · `script.js`

---

## 5. Item detail

### 5.1 Display & navigation

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-501 | Full-screen stack | ✅ | Modal &lt;1024px | 🟡 |
| WEB-502 | Split pane ≥1024px | N/A | ✅ | 🌐 |
| WEB-503 | `GET /item/:id` refresh | ✅ | ✅ | ✅ |
| WEB-504 | Multi-image carousel `image_paths` | ✅ | Carousel + dots | ✅ |
| WEB-505 | Classification chips display | ✅ | ✅ | ✅ |
| WEB-506 | Mark detail visited (onboarding) | N/A | `closet_web_item_detail_visited` | 🌐 |

### 5.2 Editable fields (`PUT /item/:id`)

| Field | Mobile | Web edit form | Status |
|-------|--------|---------------|--------|
| brand | ✅ | ✅ | ✅ |
| size | ✅ | ✅ | ✅ |
| purchase_price | ✅ | ✅ | ✅ |
| purchase_date | ✅ | ✅ | ✅ |
| purchase_location | ✅ | ✅ | ✅ |
| storage_location (physical) | ✅ | ✅ as `storage_location` | ✅ |
| care_summary | ✅ | ✅ | ✅ |
| notes | ✅ | ✅ | ✅ |
| closet_location_id | ✅ | ✅ select | ✅ |
| category / season / style | Edit tags modal | Edit form selects | ✅ |
| subcategory | Picker in modal | Edit tags modal | ✅ |
| user_tags | ✅ | ✅ comma input | ✅ |
| colors (in correction) | Edit tags modal | Edit tags modal + correction API | ✅ |

### 5.3 Actions & APIs

| ID | Action | API | Mobile | Web | Status |
|----|--------|-----|--------|-----|--------|
| WEB-520 | Toggle favorite | `PUT .../favorite` | ✅ | ✅ | ✅ |
| WEB-521 | Pack / unpack toggle | `PUT /item/:id` | ✅ | ✅ | ✅ |
| WEB-522 | Lend | `PUT .../lend` | Form | Form modal | ✅ |
| WEB-523 | Return | `PUT .../return` | ✅ | ✅ | ✅ |
| WEB-524 | Mark worn today | `PUT .../status` | ✅ | ✅ inline occasion field | ✅ |
| WEB-525 | Wear again → laundry | `PUT .../status` | ✅ | ✅ | ✅ |
| WEB-526 | Add to laundry queue | `POST /laundry/add/:id` | ✅ | ✅ (+ confirm urgent) | 🟡 |
| WEB-527 | **Laundry state: clean** | `laundry_state` on PUT | ✅ | ✅ | ✅ |
| WEB-528 | **Laundry state: worn** | ✅ | ✅ | ✅ |
| WEB-529 | **Laundry state: in_hamper** | ✅ | ✅ | ✅ |
| WEB-530 | **Laundry state: washing** | ✅ | ✅ | ✅ |
| WEB-531 | **Laundry state: drying** | ✅ | ✅ | ✅ |
| WEB-532 | Promote bulk clean copies | `POST .../promote-bulk` | Form | Number input modal | ✅ |
| WEB-533 | Classification correction | `POST .../classification-correction` | Modal | Edit tags modal | ✅ |
| WEB-534 | Care label scan | `POST .../care-label` | Camera | File input | 🟡 |
| WEB-535 | Suggested outfits modal | `GET .../outfits` | ✅ | ✅ | ✅ |
| WEB-536 | Wear calendar month nav | `GET .../wear-history` | ✅ | ✅ | ✅ |
| WEB-537 | Worn-in-fits grid → fit | `GET .../worn-outfits` | ✅ | ✅ | ✅ |
| WEB-538 | Delete item | `DELETE /item/:id` | ✅ | Confirm modal | ✅ |
| WEB-539 | Haptics on actions | 📱 | — | 📱 |

**Files:** `ItemDetailScreen.tsx` · `item-detail.js`

---

## 6. Outfits tab

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-601 | Classic `GET /outfits/recommend` | ✅ | ✅ | ✅ |
| WEB-602 | Query: occasion, season, vibe | ✅ | ✅ | ✅ |
| WEB-603 | Query: seed / reshuffle | ✅ | ✅ | ✅ |
| WEB-604 | Query: `closet_location_id` | ✅ | ✅ | ✅ |
| WEB-605 | Query: lat/lon when weather on | ✅ | ✅ | ✅ |
| WEB-606 | Source: home closet | ✅ | ✅ | ✅ |
| WEB-607 | Source: travel bag (packed only) | ✅ | ✅ | ✅ |
| WEB-608 | Weather banner + toggle | ✅ | ✅ + `closet_web_weather_sync` | ✅ |
| WEB-609 | Hide occasion/season/vibe when AI on | ✅ | ✅ | ✅ |
| WEB-610 | Outfit cards: score, items, images | ✅ | ✅ | ✅ |
| WEB-611 | “Plan this look” → planning | ✅ | ✅ | ✅ |
| WEB-612 | Upcoming plans preview on tab | Separate screen | Inline edit title/date | 🟡 |
| WEB-613 | AI stylist toggle | `outfits_ai_stylist` pref | `closet_web_ai_stylist` | ✅ |
| WEB-614 | `POST /ai-stylist` | ✅ | ✅ | ✅ |
| WEB-615 | Pin item `pin_item_ids` | Single select | Single thumbnail chips | ✅ |
| WEB-616 | `POST /ai-stylist/feedback` | ✅ | ✅ | ✅ |
| WEB-617 | Source badge (Claude vs Local) | ✅ | 🟡 | 🟡 |
| WEB-618 | Extras menu (options sheet) | Bottom sheet | Bottom sheet ≤767px | ✅ |
| WEB-619 | Desktop 2-col layout ≥1024px | N/A | ✅ | 🌐 |
| WEB-620 | Print outfit CSS | N/A | `@media print` | 🌐 |
| WEB-621 | Compare two outfits | ⬜ | ⬜ | ⬜ |

**Files:** `OutfitsScreen.tsx` · `script.js` · `app-features-upgrade.js`

---

## 7. Planning ahead

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-701 | `GET /planned-outfits` | ✅ incl. past on mobile | `include_past=false` | 🟡 |
| WEB-702 | Create: title, date, occasion | ✅ | ✅ | ✅ |
| WEB-703 | Create: item_ids (max 36 mobile) | ✅ | Multi-select | ✅ |
| WEB-704 | Create: **notes** | ✅ | ✅ create + inline edit | ✅ |
| WEB-705 | Create: **status** default draft | ✅ | Draft/confirmed chips on create | ✅ |
| WEB-706 | List conflict messages | ✅ | ✅ | ✅ |
| WEB-707 | Edit title/date (Outfits preview) | In Planning screen | ✅ | ✅ |
| WEB-708 | Edit items | ✅ | Edit items → planning tab | ✅ |
| WEB-709 | **Edit status** (draft/confirmed/worn/skipped) | ✅ | Chip row per plan | ✅ |
| WEB-710 | **Prep: clean** toggle | `prep_clean` | ✅ | ✅ |
| WEB-711 | **Prep: packed** | `prep_packed` | ✅ | ✅ |
| WEB-712 | **Prep: steamed** | `prep_steamed` | ✅ | ✅ |
| WEB-713 | **Prep: accessories** | `prep_accessories` | ✅ | ✅ |
| WEB-714 | Delete plan | ✅ | Confirm modal | ✅ |
| WEB-715 | `GET /planned-outfits/:id` for edit | ✅ | ✅ | ✅ |
| WEB-716 | `PUT /planned-outfits/:id` partial patch | Full patch API | Notes, prep, status, title/date | ✅ |

**Files:** `PlanningAheadScreen.tsx` · `app-features.js`

---

## 8. Pack mode

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-801 | `GET /trips` | ✅ | ✅ | ✅ |
| WEB-802 | `GET /closet?status=clean` for picker | ✅ | ✅ | ✅ |
| WEB-803 | Trip selector UI | ✅ | `#pack-trip-select` + edit/new buttons | ✅ |
| WEB-804 | View: All / Packed / Not packed | ✅ | View mode chips | ✅ |
| WEB-805 | Multi-select items | ✅ | Tap-to-select + pack selected | ✅ |
| WEB-806 | `PUT /trips/:id/packed` per item | ✅ | ✅ | ✅ |
| WEB-807 | `PUT /closet/packed` bulk | ✅ | Pack all / apply list | ✅ |
| WEB-808 | `POST /trips` create | Form | Modal + inline save | ✅ |
| WEB-809 | `PUT /trips/:id` update | Form | Modal + inline save | ✅ |
| WEB-810 | `GET /weather/geocode` | ✅ Pack | Pack tab sync weather | ✅ |
| WEB-811 | `GET /weather/forecast` | ✅ Pack | Pack tab sync weather | ✅ |
| WEB-812 | Show forecast summary on trip | ✅ | Forecast summary in pack card | ✅ |
| WEB-813 | Trip activity presets (6 types) | ✅ | Activity chips | ✅ |
| WEB-814 | Suggest outfits (multi recommend) | ✅ | Suggest fits + build list | ✅ |
| WEB-815 | Pack plan overlap / coverage summary | ✅ | Pack list ready card | ✅ |
| WEB-816 | Apply pack list from plan | ✅ | Pack selected items button | ✅ |
| WEB-817 | `defaultOutfitTarget` from trip length | ✅ | Coverage goal hint + input | ✅ |

**Files:** `PackModeScreen.tsx` · `app-features.js` · `index.html` (`#pack-tab`, `#trip-form-modal`)

---

## 9. Trip outfit log

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-901 | `GET /trips/logs` | ✅ | ✅ | ✅ |
| WEB-902 | Display album name, destination, dates | ✅ | ✅ | ✅ |
| WEB-903 | Cover image | ✅ | ✅ | ✅ |
| WEB-904 | Post count | ✅ | ✅ | ✅ |
| WEB-905 | Start trip form → `CreateFit` params | ✅ | `loadTripsLog()` start form | ✅ |
| WEB-906 | `packedOnly` on create fit | ✅ | `initCreateFit({ packedOnly })` | ✅ |
| WEB-907 | Expand album → list posts | ✅ | Expand/collapse per album | ✅ |
| WEB-908 | Open fit from album | ✅ | `openFitModal(postId)` | ✅ |
| WEB-909 | Add another fit to album | ✅ | Add another fit button | ✅ |

**Files:** `TripOutfitLogScreen.tsx` · `CreateFitScreen.tsx` · `app-features.js`

---

## 10. Care hub (stats, laundry, insights)

### 10.1 Stats

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-1001 | `GET /stats` | Stats screen | Care → stats | ✅ |
| WEB-1002 | Category breakdown bars | ✅ | ✅ | ✅ |
| WEB-1003 | Best CPW list | ✅ | ✅ | ✅ |
| WEB-1004 | Total items / wears summary | ✅ | ✅ | ✅ |
| WEB-1005 | Wardrobe mix (subcategory/color/season) | ✅ | Partial in insights | 🟡 |

### 10.2 Insights

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-1010 | `GET /closet/insights` | ✅ | ✅ upgrade | ✅ |
| WEB-1011 | `GET /neglected-items?days=` | ✅ | ✅ | ✅ |
| WEB-1012 | Neglect days filter control | ✅ | ✅ | ✅ |
| WEB-1013 | Retirement candidates list | Display | Display | ✅ |
| WEB-1014 | Duplicate candidates (embedding) | Display | Display | ✅ |
| WEB-1015 | Duplicate merge action | ⬜ | ⬜ | ⬜ |
| WEB-1016 | Capsule gap cards | ✅ | ✅ | ✅ |
| WEB-1017 | Gap → wishlist with prefill params | Navigate Wishlist | `navigateToWishlistPrefill` + deep link | ✅ |
| WEB-1018 | Consider donate tag | Via insights | `considerDonating()` | ✅ |

### 10.3 Laundry

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-1020 | `GET /laundry` | ✅ | ✅ | ✅ |
| WEB-1021 | Priority sections (urgent/normal/done) | ✅ | ✅ | ✅ |
| WEB-1022 | `PUT /laundry/:id/status` | ✅ | ✅ | ✅ |
| WEB-1023 | Add from item `POST /laundry/add/:id` | ✅ | ✅ | ✅ |
| WEB-1024 | Urgent confirm on add | ✅ | `confirm()` | 🟡 |
| WEB-1025 | Refresh button | ✅ | ✅ | ✅ |

**Files:** `StatsScreen.tsx` · `script.js` · `app-features-upgrade.js`

---

## 11. Wishlist

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-1101 | `GET /wishlist` | ✅ | ✅ | ✅ |
| WEB-1102 | `POST /wishlist` create | ✅ | ✅ form | ✅ |
| WEB-1103 | Intent: want / saving / sale_watch / gift | ✅ | ✅ | ✅ |
| WEB-1104 | Name, category, price, URL | ✅ | ✅ | ✅ |
| WEB-1105 | **Notes** on create | ✅ | ✅ `#wishlist-notes-input` | ✅ |
| WEB-1106 | `PUT /wishlist/{id}` update notes | ✅ | ✅ inline Save notes | ✅ |
| WEB-1107 | **Photo upload** on wishlist | `uploadWishlistPhotos` | ✅ multipart | ✅ |
| WEB-1108 | Open product URL | `Linking` | `<a href>` if url set | ✅ |
| WEB-1109 | `PUT /item/:id/promote` | ✅ | ✅ | ✅ |
| WEB-1110 | `DELETE /item/:id` | ✅ | confirm modal | ✅ |
| WEB-1111 | Route params prefill (from Stats) | ✅ | `?tab=wishlist&wishName=…` | ✅ |
| WEB-1112 | `openAdd` route param | ✅ | `?openAdd=1` | ✅ |

**Files:** `WishlistScreen.tsx` · `app-features.js` · `index.html` `#wishlist-tab`

---

## 12. Social — feed, fits, friends

### 12.1 Feed

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-1201 | `GET /feed` | ✅ | ✅ | ✅ |
| WEB-1202 | Pagination `?before=` | ✅ | Load more | ✅ |
| WEB-1203 | `POST /fits/:id/react` | ✅ | ✅ | ✅ |
| WEB-1204 | Open fit detail | Stack | Modal; full-screen ≤767px | ✅ |
| WEB-1205 | Open public profile | Stack | Modal | 🟡 |
| WEB-1206 | Header: Friends, Create fit | ✅ | 🟡 | 🟡 |
| WEB-1207 | Feed error + `/healthz` hint | ✅ | `enrichFeedError()` | ✅ |
| WEB-1208 | Multi-column grid ≥1024/1280 | N/A | ✅ | 🌐 |

### 12.2 Fit detail

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-1210 | `GET /fits/:id` | ✅ | ✅ | ✅ |
| WEB-1211 | Reactions | ✅ | ✅ | ✅ |
| WEB-1212 | `GET /fits/:id/comments` | ✅ | Upgrade modal | ✅ |
| WEB-1213 | `POST /fits/:id/comments` | ✅ | Upgrade | ✅ |
| WEB-1214 | `DELETE /comments/:id` | ✅ | 🟡 | 🟡 |
| WEB-1215 | `DELETE /fits/:id` own post | ✅ | Upgrade + confirm | ✅ |
| WEB-1216 | Tagged item thumbnails | ✅ | ✅ | ✅ |
| WEB-1217 | Trip metadata on post | ✅ | ✅ create-fit | ✅ |

### 12.3 Create fit

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-1220 | `POST /fits` multipart | ✅ | ✅ | ✅ |
| WEB-1221 | Photo camera | 📱 | File only | 📱 |
| WEB-1222 | Caption | ✅ | ✅ | ✅ |
| WEB-1223 | Tag closet items | ✅ | Chip picker | ✅ |
| WEB-1224 | Trip name/destination/dates | ✅ | Optional fields | ✅ |
| WEB-1225 | `packedOnly` ordering | ✅ | 🟡 | 🟡 |

### 12.4 Friends & profiles

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-1230 | `GET /friends` | ✅ | ✅ | ✅ |
| WEB-1231 | `GET /friends/requests` | ✅ | ✅ | ✅ |
| WEB-1232 | Accept / reject request | ✅ | ✅ | ✅ |
| WEB-1233 | `DELETE /friends/:id` | ✅ | confirm | 🟡 |
| WEB-1234 | `GET /users/search` | ✅ | ✅ | ✅ |
| WEB-1235 | `POST /friends/requests` | ✅ | ✅ | ✅ |
| WEB-1236 | `GET /users/:id` public profile | ✅ | Modal | 🟡 |
| WEB-1237 | Relationship actions on profile | ✅ | 🟡 | 🟡 |
| WEB-1238 | `GET /users/:id/posts` grid | ✅ | ✅ | ✅ |

**Files:** `FeedScreen.tsx` · `FitDetailScreen.tsx` · `FriendsScreen.tsx` · `app-features.js` · `app-features-upgrade.js`

---

## 13. Profile & settings

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-1301 | Profile hub cards navigation | Rows on Profile | Hub cards | ✅ |
| WEB-1302 | Avatar picker | Library | File input | 🟡 |
| WEB-1303 | Edit name / bio | ✅ | ✅ | ✅ |
| WEB-1304 | `GET /reminders` strip | ✅ | ✅ | ✅ |
| WEB-1305 | Stats line (items, posts, friends) | ✅ | ✅ | ✅ |
| WEB-1306 | Your fits grid | ✅ | ✅ | ✅ |
| WEB-1307 | **Profile created date** | N/A | Broken DOM ids | ❌ |
| WEB-1308 | **Last login display** | N/A | Broken DOM ids | ❌ |
| WEB-1309 | Weather sync + location permission | ✅ | Toggle + localStorage | ✅ |
| WEB-1310 | Theme preference `PUT /settings` | ✅ | ✅ | ✅ |
| WEB-1311 | Social enabled toggle | ✅ | ✅ | ✅ |
| WEB-1312 | Default closet location | ✅ | ✅ | ✅ |
| WEB-1313 | CRUD closet locations | ✅ | add via `prompt()` | 🟡 |
| WEB-1314 | Closet density/layout/sort in settings | ✅ | Partial (shared with closet toolbar) | 🟡 |
| WEB-1315 | Sign out | ✅ | ✅ | ✅ |
| WEB-1316 | Logout all devices | ✅ | confirm | 🟡 |
| WEB-1317 | Dev API origin hint | ✅ | Rare on web | 🟡 |

**Files:** `ProfileScreen.tsx` · `PersonalSettingsScreen.tsx` · `app-features.js`

---

## 14. Onboarding

| ID | Feature | Mobile | Web | Status |
|----|---------|--------|-----|--------|
| WEB-1401 | Carousel before auth | ✅ | ✅ | ✅ |
| WEB-1402 | Persist completed/skipped | SecureStore | `localStorage` onboarding key | ✅ |
| WEB-1403 | Legal links in carousel | Linking | HTML links | ✅ |
| WEB-1404 | Reduce motion respect | ✅ | 🟡 | 🟡 |
| WEB-1405 | Profile checklist banner | N/A | ✅ | 🌐 |
| WEB-1406 | Checklist: upload item | ✅ | ✅ | ✅ |
| WEB-1407 | Checklist: open item detail | ✅ | ✅ | ✅ |
| WEB-1408 | Checklist: generate outfit | ✅ | 🟡 | 🟡 |
| WEB-1409 | Dismiss banner persist | N/A | `closet_web_onboarding_dismissed` | 🌐 |

**Files:** `OnboardingCarouselScreen.tsx` · `onboarding-carousel.js` · `preferences.ts`

---

## 15. Native & platform (expected differences)

| ID | Capability | Mobile | Web | Track? |
|----|------------|--------|-----|--------|
| WEB-1501 | Camera | 📱 expo-image-picker | File `<input type="file">` | No — platform |
| WEB-1502 | Haptics | 📱 expo-haptics | — | No |
| WEB-1503 | Blur chrome | 📱 expo-blur | CSS backdrop-filter | Visual only |
| WEB-1504 | Secure credential storage | SecureStore | localStorage | Security review |
| WEB-1505 | OS location permission | expo-location | navigator.geolocation | ✅ equivalent |
| WEB-1506 | Deep linking / universal links | Expo config | Query params on `/app` | 🌐 web pattern |
| WEB-1507 | Push notifications | ⬜ | ⬜ | SHARED backlog |

---

## API endpoint matrix

**Legend:** M = mobile UI calls · W = web UI calls · B = backend route exists

| ID | Method | Path | M | W | Notes |
|----|--------|------|---|---|-------|
| API-001 | POST | `/auth/register` | ✅ | ✅ | auth pages |
| API-002 | POST | `/auth/login` | ✅ | ✅ | |
| API-003 | POST | `/auth/forgot-password` | ✅ | ✅ | |
| API-004 | POST | `/auth/reset-password` | ✅ | ✅ | |
| API-005 | GET | `/auth/me` | ✅ | ✅ | |
| API-006 | PUT | `/auth/profile` | ✅ | ✅ | |
| API-007 | POST | `/auth/avatar` | ✅ | ✅ | |
| API-008 | POST | `/auth/logout-all` | ✅ | ✅ | |
| API-009 | POST | `/auth/change-password` | ❌ | ✅ | WEB-033 settings form |
| API-010 | GET/PUT | `/settings` | ✅ | ✅ | |
| API-011 | POST | `/upload-clothing` | ✅ | ✅ | |
| API-012 | GET | `/closet` | ✅ | ✅ | |
| API-013 | POST | `/closet/fit-check` | ✅ | ✅ | |
| API-014 | POST | `/closet/visual-search` | ✅ | ✅ | |
| API-015 | POST | `/closet/bulk-item` | ✅ | ✅ | |
| API-016 | POST | `/closet/bulk-item/upload` | ✅ | ✅ | |
| API-017 | POST | `/closet/import-csv` | ✅ | ✅ | |
| API-018 | POST | `/closet/import-manual` | ✅ | ✅ | |
| API-019 | GET | `/closet/insights` | ✅ | ✅ | |
| API-020 | PUT | `/closet/packed` | ✅ | ✅ | upgrade |
| API-021 | GET/POST/PUT/DELETE | `/closet/locations` | ✅ | ✅ | |
| API-022 | POST | `/closet/embedding-backfill` | ❌ | ❌ | dev/admin? |
| API-023 | GET/POST/PUT/DELETE | `/planned-outfits` | ✅ | ✅ | notes, status, prep toggles |
| API-024 | GET/PUT/DELETE | `/item/:id` | ✅ | ✅ | |
| API-025 | PUT | `/item/:id/status` | ✅ | ✅ | full laundry_state via PUT /item/:id |
| API-026 | PUT | `/item/:id/favorite` | ✅ | ✅ | |
| API-027 | PUT | `/item/:id/lend` | ✅ | ✅ | |
| API-028 | PUT | `/item/:id/return` | ✅ | ✅ | |
| API-029 | POST | `/item/:id/classification-correction` | ✅ | ✅ | |
| API-030 | POST | `/item/:id/care-label` | ✅ | ✅ | |
| API-031 | POST | `/item/:id/promote-bulk` | ✅ | ✅ | |
| API-032 | GET | `/item/:id/outfits` | ✅ | ✅ | |
| API-033 | GET | `/item/:id/wear-history` | ✅ | ✅ | |
| API-034 | GET | `/item/:id/worn-outfits` | ✅ | ✅ | |
| API-035 | DELETE | `/item/:id` | ✅ | ✅ | |
| API-036 | GET | `/outfits/recommend` | ✅ | ✅ | |
| API-037 | POST | `/ai-stylist` | ✅ | ✅ | |
| API-038 | POST | `/ai-stylist/feedback` | ✅ | ✅ | |
| API-039 | GET | `/stats` | ✅ | ✅ | |
| API-040 | GET | `/neglected-items` | ✅ | ✅ | |
| API-041 | GET/POST | `/laundry` | ✅ | ✅ | |
| API-042 | POST | `/laundry/add/:id` | ✅ | ✅ | |
| API-043 | PUT | `/laundry/:id/status` | ✅ | ✅ | |
| API-044 | GET/POST | `/wishlist` | ✅ | ✅ | |
| API-045 | PUT | `/wishlist/:id` | ✅ | ✅ | WEB-1106 notes |
| API-046 | PUT | `/item/:id/promote` | ✅ | ✅ | |
| API-047 | GET/POST/PUT | `/trips` | ✅ | ✅ | create/edit modal + pack tab |
| API-048 | PUT | `/trips/:id/packed` | ✅ | ✅ | |
| API-049 | POST | `/trips/auto-unpack` | ❌ | ❌ | API-034 |
| API-050 | GET | `/trips/logs` | ✅ | ✅ | expand albums + create-fit |
| API-051 | GET | `/weather/geocode` | ✅ | ✅ | pack tab |
| API-052 | GET | `/weather/current` | ✅ | 🟡 | outfits |
| API-053 | GET | `/weather/forecast` | ✅ | ✅ | pack tab |
| API-054 | GET | `/feed` | ✅ | ✅ | |
| API-055 | POST | `/fits` | ✅ | ✅ | |
| API-056 | GET/DELETE | `/fits/:id` | ✅ | ✅ | |
| API-057 | POST | `/fits/:id/react` | ✅ | ✅ | |
| API-058 | GET/POST | `/fits/:id/comments` | ✅ | ✅ | |
| API-059 | DELETE | `/comments/:id` | ✅ | 🟡 | |
| API-060 | GET | `/friends` + requests | ✅ | ✅ | |
| API-061 | GET | `/users/search` | ✅ | ✅ | |
| API-062 | GET | `/users/:id` + posts | ✅ | ✅ | |
| API-063 | GET | `/reminders` | ✅ | ✅ | |
| API-064 | POST | `/refresh-scores` | ❌ | ❌ | optional |

---

## Local persistence keys

| Key | Mobile (SecureStore) | Web (localStorage) | Aligned? |
|-----|----------------------|-------------------|----------|
| Sort | `closet_sort_v1` | `closet_web_sort` | ❌ different values |
| Density | `closet_density_v1` | `closet_web_density` | 🟡 |
| Layout | `closet_layout_v1` | `closet_web_layout` | 🟡 |
| Filter sections | `closet_filter_bar_sections_v1` | `closet_filter_bar_sections_v1` | ✅ |
| AI stylist | `outfits_ai_stylist` (pref) | `closet_web_ai_stylist` | 🟡 |
| Weather sync | weather pref | `closet_web_weather_sync` | 🟡 |
| Onboarding carousel | preferences | onboarding storage key | 🟡 |
| Onboarding banner | — | `closet_web_onboarding_dismissed` | 🌐 |
| Item detail visited | — | `closet_web_item_detail_visited` | 🌐 |
| Auth token | SecureStore | `access_token` | — |

---

## UX audit: dialogs on web (replace with forms/toasts)

| UX-ID | Location | Type | Trigger | Target fix |
|-------|----------|------|---------|------------|
| UX-001 | `auth.js` | alert | Forgot password success | Toast | ✅ |
| UX-002 | `auth.js` | alert | Reset password success | Toast | ✅ |
| UX-003 | `script.js` | prompt | Mark worn occasion | Inline field |
| UX-004 | `script.js` | confirm | Laundry urgent | Toggle in modal |
| UX-005 | `script.js` | confirm | Delete item | Confirm modal | ✅ |
| UX-006 | `script.js` | confirm | Donate tag | Confirm modal |
| UX-007 | `item-detail.js` | prompt | Lend name/date | Form | ✅ |
| UX-008 | `item-detail.js` | prompt | Worn occasion | ✅ inline `#item-worn-occasion` |
| UX-009 | `item-detail.js` | prompt | Promote bulk count | ✅ `#item-promote-modal` |
| UX-010 | `item-detail.js` | prompt | Fix classification fields | ✅ `#item-edit-tags-modal` |
| UX-011 | `item-detail.js` | alert | Generic error | ✅ Toast |
| UX-012 | `app-features.js` | confirm | Remove wishlist | Modal ✅ |
| UX-013 | `app-features.js` | — | New trip | `#trip-form-modal` (WEB-002) ✅ |
| UX-014 | `app-features.js` | confirm | Delete plan | Modal ✅ |
| UX-015 | `app-features.js` | confirm | Remove friend | Modal ✅ |
| UX-016 | `app-features.js` | confirm | Logout all | Modal ✅ |
| UX-017 | `app-features.js` | prompt×2 | New closet location | Location form ✅ |
| UX-018 | `app-features.js` | confirm | Delete location | Modal ✅ |
| UX-019 | `app-features-upgrade.js` | confirm | Delete fit | ✅ `showConfirmDialog` |

---

## Shared backlog (neither client complete)

From `PROJECT.md` — track separately from web parity:

- [ ] SHARED-001 Capsule optimizer (packing)
- [ ] SHARED-002 Push / scheduled reminders
- [ ] SHARED-003 Device calendar bias for recommendations
- [ ] SHARED-004 Retirement model (fused signals)
- [ ] SHARED-005 Richer insight charts
- [ ] SHARED-006 Fine-tuned classifier vs CLIP
- [ ] SHARED-007 Accent vs dominant colors
- [ ] SHARED-008 Train export for corrections
- [ ] SHARED-009 Illustrated empty states (all major screens)
- [ ] SHARED-010 Image storage S3/R2 + signed URLs
- [ ] SHARED-011 Background classification jobs
- [ ] SHARED-012 Refresh tokens (short access + rotated refresh)
- [ ] SHARED-013 Audit log for auth events
- [ ] SHARED-014 TOTP / MFA
- [ ] SHARED-015 Distributed rate limiting (Redis)

---

## Test coverage tracker

| Area | Mobile (`mobile/` Jest) | Web (`frontend/` vitest) | E2E (`e2e/`) |
|------|-------------------------|--------------------------|--------------|
| Unit utils | `web-utils` N/A | `lib/web-utils.test.js` | — |
| Auth | Some | — | `test_website_auth.py` |
| App shell / tabs | Snapshots | — | `test_website_app.py`, `test_website_pages.py` |
| Closet filters | — | — | Partial |
| Item detail laundry | — | — | ❌ |
| Pack / planning | — | — | ❌ |
| Social feed | — | — | Partial |

- [ ] SHARED-TEST-001 E2E: item detail laundry states
- [ ] SHARED-TEST-002 E2E: planning prep + status
- [ ] SHARED-TEST-003 E2E: pack mode trip + forecast
- [ ] SHARED-TEST-004 Expand `scripts/smoke_web_app.py` per WEB_PARITY_PLAN

---

## File reference

| Concern | Mobile | Web |
|---------|--------|-----|
| Navigation | `mobile/src/navigation/RootNavigator.tsx` | `frontend/index.html`, `frontend/script.js` |
| API client | `mobile/src/api/client.ts` | `window.ClosetApp.apiFetch` |
| Types | `mobile/src/api/types.ts` | Implicit from API responses |
| Preferences | `mobile/src/preferences.ts` | `script.js`, `ClosetWebUtils`, `app-features.js` |
| Closet | `ClosetScreen.tsx` | `script.js` |
| Upload | `UploadScreen.tsx` | `upload-features.js` |
| Item detail | `ItemDetailScreen.tsx` | `item-detail.js` |
| Outfits | `OutfitsScreen.tsx` | `script.js`, `app-features-upgrade.js` |
| Planning | `PlanningAheadScreen.tsx` | `app-features.js` |
| Pack | `PackModeScreen.tsx` | `app-features.js`, `app-features-upgrade.js` |
| Trips log | `TripOutfitLogScreen.tsx` | `app-features.js` |
| Stats / insights | `StatsScreen.tsx` | `script.js`, `app-features-upgrade.js` |
| Wishlist | `WishlistScreen.tsx` | `app-features.js` |
| Social | `FeedScreen.tsx`, `FitDetailScreen.tsx`, … | `app-features.js`, `app-features-upgrade.js` |
| Profile / settings | `ProfileScreen.tsx`, `PersonalSettingsScreen.tsx` | `app-features.js`, `script.js` |
| Backend routes | `backend/main.py` | Same |

---

## Maintenance

When shipping web parity:

1. Find the `WEB-###` row in the master checklist and section tables.
2. Change `[ ]` → `[x]` and update Status column to ✅.
3. Update the progress snapshot counts at the top.
4. If you add a new mobile feature, add a new `WEB-###` row before merging mobile PR.

*Implementation sequencing: [WEB_PARITY_PLAN.md](./WEB_PARITY_PLAN.md).*
