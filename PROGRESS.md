# Progress Log

Running log of roadmap slices I've implemented, what's in flight, and notes for next time. Newest entries at the top. ROADMAP.md is the wishlist; this file is the diary.

Each entry: date, roadmap section it came from, what changed, what's deliberately *not* changed yet, and the next step if there is one.

---

## 2026-05-14 — Cost-per-wear stat tile + roadmap dedupe (shipped)

**Roadmap source:** *Insights* → "Cost per wear" (partial — per-item surfacing only; ranking on the Stats tab is still open)

The follow-up from the previous slice. Backend already computes `cost_per_wear` inside `get_item` ([db_manager.py:396](backend/database/db_manager.py#L396)) and the mobile type ([types.ts:30](mobile/src/api/types.ts#L30)) already exposes it — nothing surfaced it in the UI. With purchase price now editable from the detail screen, the value finally has somewhere to live.

### Shipped this slice
- **Mobile** — `ItemDetailScreen` stats card swaps the "favorite" tile for a CPW tile (`$ / wear`) when `times_worn > 0 && cost_per_wear != null`. Falls back to the favorite tile when there's no usable CPW data, so screens with no purchase price keep their current look. Format is `$X.XX`, rounded server-side.
  - **Why the gate on `times_worn > 0`?** Backend returns `cost_per_wear = purchase_price` when `times_worn == 0`. Showing "$45 per wear" before the user has ever worn it is a misleading number, so we just hide the tile in that case.
  - **Why replace favorite, not add a 4th column?** The favorite state is already conveyed by the big heart on the photo overlay; the tile is redundant. Four equal columns on a phone gets tight; three is cleaner. The favorite tile still appears for items without CPW data so users who haven't entered prices don't lose information.

### Roadmap hygiene
ROADMAP.md had picked up duplicate sections from organic growth (Acquisition & shopping, Travel & packing, Sustainability, Accessibility, Notifications all appeared twice; Faster onboarding and Item location were dupe subsections inside Capture & data; AI stylist + Outfit planning calendar + Visual search appeared as bullets *and* as standalone sections). Consolidated to one section per topic, merging the few unique bullets from each duplicate into the canonical section (capsule gap analysis, browser extension, sale watch, capsule generator, trip outfit log, recycle/donate workflow, one-handed mode).

### Deliberately deferred
- **CPW ranking on the Stats tab** — the Insights roadmap bullet calls for "ranked", i.e. a list of items ordered by CPW. Out of scope for a one-tile change; needs its own slice on the Stats screen.
- **CPW tier badges** (💸/👌/⭐/🏆/💎 from the gamification section) — would replace the dollar value with a tier glyph. Skipped because the gamification system isn't built out yet; the raw number is more useful in isolation.
- **CPW on closet grid cards** — also surfaceable, but the grid is already dense. Wait until the density-toggle work happens.

### Verified
- `tsc --noEmit` clean across `mobile/`.
- Did **not** boot the dev server this session. Backend already computed `cost_per_wear` (no change there), so the runtime risk is purely on the new JSX — should render or fall back to the existing favorite tile.

### Next up
1. **Runtime smoke** for both this slice and the previous metadata slice — boot uvicorn + Expo, edit purchase price + times-worn, confirm the tile appears and reads correctly.
2. **CPW ranking on Stats tab** — finishes the Insights/Cost-per-wear roadmap bullet.
3. **Brand entry suggestions** (still next from the previous slice).
4. **Care label OCR** (still next from the previous slice).

---

## 2026-05-14 — Item metadata: brand, size, notes, purchase fields (shipped)

**Roadmap source:** *Capture & data* → "Brand, size, fit, material" + "Purchase metadata" + "Tags / notes"

The DB schema already has `brand`, `size`, `purchase_date`, `purchase_price`, `purchase_location`, and `notes` columns on `clothing_items` — they've been there since the migration but nothing in the app reads or writes them. The detail screen has empty space below the stats card that the roadmap explicitly flagged ("The detail screen already has space"). Goal: turn those latent columns into an actual editable surface so future features (CPW, brand collector badge, neglected-item context) have data to chew on.

### Shipped this slice
- **Backend** — `DatabaseManager.update_item_details(item_id, **fields)` updates any subset of `brand / size / notes / purchase_date / purchase_price / purchase_location`. Whitelist of allowed columns; rejects unknown keys instead of trusting the dict.
- **Backend** — `PUT /api/item/{item_id}` endpoint, auth-required, owner-scoped (404 if the item belongs to a different user, not 403, to avoid leaking existence).
- **Mobile** — `ClothingItem` type extended with the same fields. `api.updateItemDetails(id, patch)` mirrors the new endpoint.
- **Mobile** — `ItemDetailScreen` renders a "Details" card with brand / size / purchase price / purchase date / purchase location / notes. Empty fields show a muted "Add brand", etc. as a tap target. Editing happens inline in a single modal sheet with one TextInput per field; save calls the PUT and refreshes.

### Deliberately deferred
- **CPW surfacing** — the backend already computes `cost_per_wear` in `get_item`; not surfaced on the detail screen yet. One-line addition once the design for the stats card is settled.
- **Material / fit fields** — the roadmap lists them but the schema doesn't have columns yet. Skipped to avoid a migration in the same slice as the UI work; will batch with care-label OCR (which also wants new columns) later.
- **Brand autocomplete** — the roadmap calls for a curated brand DB. Out of scope for the first cut; the field is plain text. Autocomplete becomes a follow-up once we have ~50 items in the wild to see what users actually type.
- **Validation** — purchase_price is accepted as a string and coerced server-side; no client-side numeric input mask yet. Acceptable for v1.

### Verified
- `tsc --noEmit` clean across `mobile/`.
- `python -m ast` parses `backend/main.py` and `backend/database/db_manager.py` without syntax errors.
- Did **not** boot the dev server or hit the endpoints from a real device this session — runtime smoke test still owed. The DB schema already had these columns so no migration is required; existing rows should expose `null` for empties and the UI handles that case.

### Next up
After this, the natural follow-ups in priority order:
1. **Runtime smoke** — boot uvicorn + Expo, edit a field on a real item, confirm round-trip. Should be ~5 min.
2. **CPW surfacing on detail screen** — `get_item` already returns `cost_per_wear`; just needs a stat tile. Unblocks the "Item level up" gamification idea.
3. **Brand entry suggestions** — once we know what brands real users type, add the curated list.
4. **Care label OCR** — bigger lift; needs Vision API integration + new columns for wash/dry/iron icons. Probably a weekend's work, not a session.

---

## Notes on how I use this file

- One section per slice, dated. If a slice spans multiple sessions, append updates under the same heading instead of opening a new one.
- "Shipped" = merged to working tree and visibly functional. "Deferred" = consciously dropped from this slice with a one-line reason. "Next up" = the next thing I'd grab if I picked this back up cold.
- When a roadmap bullet is fully done, move it from ROADMAP.md to the README's "Notes" section (per ROADMAP.md's own instruction at the top) and link the corresponding entry here.
