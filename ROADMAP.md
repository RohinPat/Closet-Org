# Roadmap

Realistic, solo-dev-sized work that fits the current stack (FastAPI + SQLite + Expo + CLIP). Add new ideas here as they come up. Retire items by moving them to the README's "Notes" section once shipped. The "Plausible but bigger" section at the end holds work that's doable but is more like a project than a feature.

## Capture & data

- **Care label OCR** — point the camera at the tag, scrape wash temperature / dry / iron icons and store them. Show "machine wash cold" on the detail screen. (Bigger piece — see "Plausible but bigger".)
- **Batch / shelf import** — point the camera at a hung rack or shelf, app detects each garment and creates draft entries. User reviews and saves. Big speedup for the initial closet build.
- **CSV / spreadsheet import** — for users who already track clothes elsewhere.

### Bulk items (socks, underwear, basics)
Not every garment needs its own photo + record. Plain socks, underwear, undershirts, and basic tees are interchangeable for outfit purposes and just clutter the closet view. Add a "bulk" mode.

- **Schema** — `clothing_items.is_bulk` bool + `quantity` int + `clean_count` int. Photo optional. Bulk items still belong to a category.
- **Upload flow** — toggle "individual / bulk" on the upload screen. Bulk path skips classification, just prompts: name (e.g. "white crew socks"), category, total quantity. No image required (one optional reference photo).
- **Smart defaults** — Socks and Underwear default to bulk; everything else defaults to individual. User can override.
- **Closet view** — bulk items render as a single card with a quantity badge ("12 pairs, 4 clean") instead of one card per pair.
- **Laundry integration** — bulk items don't go to the laundry queue as one record; instead "wash 3 socks" decrements `clean_count`. The wear-again counter doesn't apply to bulk items by default.
- **Outfit recommender** — treats bulk items generically ("any clean white sock") rather than picking a specific record.
- **Promote to individual** — option to convert a bulk item into individual records later (e.g. once you have a fancy pair worth tracking).

## Wishlist & shopping (single-user, no scraping)

- **Duplicate warning at upload** — when adding an item, check against existing closet by category + dominant color and warn "you already have 4 black tees" before saving.
- **Closet-fit pre-check** — upload a candidate photo; the recommender tells you which existing items it would pair with. Decide if it fills a real gap.
- **Capsule gap analysis** — "your closet is missing a neutral blazer / waterproof outer / dressy black shoe". Drives intentional buying instead of accumulation.

## Travel & packing

- **Pack list builder** — input destination, dates, planned activities; app builds a capsule from your closet that covers the trip (e.g. 5 outfits over 7 days with overlap).
- **Travel mode** — lock packed items out of normal outfit suggestions; they're "physically not here" until you toggle off.
- **Capsule generator** — given N items as a target, pick the subset that produces the most outfit combinations. Underlies the pack list builder.
- **Weather sync** — pull forecast for the destination instead of home; bias the pack list accordingly.
- **Packing checklist** — tap-off-as-packed UI with progress bar; the laundry boss-fight gamification applies here too.
- **Trip outfit log** — fit pics taken during the trip auto-group into a "Lisbon, April 2026" album.

## Planning ahead

- **Outfit calendar** — plan an outfit for a future date (Friday's wedding, Monday's interview). Reserved items are locked from earlier wear.
- **Conflict detection** — same item double-booked across two events → warn.
- **Event templates** — "office casual", "wedding guest", "first date" — saved item bundles you can drop onto a date with one tap.
- **Auto-prep reminder** — N days before a reserved event, check that items are clean and ironed; surface in the laundry queue with priority.

## AI stylist

Chat-style natural-language layer over the rule-based recommender. Bounded cost — send closet summary (categories, colors, wear-history summary) as context to a small Claude model, no full photos.

- **"What should I wear today?"** — considers weather, calendar, last-worn dates, and the user's stated mood. Returns 2–3 outfits with reasoning.
- **"What goes with my new green jacket?"** — pivot from one new item, suggests pairings.
- **"I'm bored of my usual" mode** — actively recommends items low in the rotation that still match user style.

## Search within your closet

- **Free-text search** — across name, brand, color, notes, category. Lives in the closet's sticky filter bar.
- **Visual search** — upload a reference photo (an inspo pic or another garment); use CLIP embeddings to return your closest closet items. Requires storing one embedding per item at upload time — CLIP is already loaded in [clothing_classifier.py](backend/models/clothing_classifier.py).
- **"Outfits containing X"** — pivot from one item card to every outfit (past and recommended) it's part of.
- **Color search** — tap a color swatch on the filter bar to show everything in that bucket.

## Accessibility

- **VoiceOver / TalkBack** pass — verify all glass primitives + screen layouts are screen-reader friendly. Buttons need accessible labels.
- **Dynamic Type / large text** — layouts shouldn't break at the largest accessibility text sizes.
- **High-contrast mode** — alternate theme tokens with WCAG-compliant contrast.
- **Color-blind labels** — show a hex swatch + color name together so users who can't distinguish hue still get useful info.
- **Reduced motion** — respect the system setting; disable shake/scale animations and the laundry-load swoosh.
- **One-handed mode** — bottom-anchored versions of common flows (upload, fit pic) for big phones.

## Notifications & reminders

- **Smart timing** — never push between 10pm and 7am local; batch pending pings into a 9am morning digest.
- **Digest vs ping** — per-category toggle: streaks, laundry, neglected items, reminders. Default everything to digest, push only for explicit user-set reminders.
- **Quiet seasons** — travel mode mutes closet-internal pings. Re-enable on return.
- **Wash-by reminders** — items with high freshness decay get a "wash by Sunday" hint in-app, not push.
- **In-app inbox** — a single home-screen pull-out with everything (streaks, reminders). Users opting out of push still see it on next open.

## Lifecycle & status

The schema has `wear_again_count` and `max_wear_before_wash` already — most of this is UI work + the laundry state machine on top.

- **Laundry queue** — explicit states: `clean → worn → in_hamper → washing → drying → clean`. Tap "wore today" advances the state.
- **Outfit of the day** — optional one-tap selfie or just a list of items worn today; feeds the wear history.
- **Wear history per item** — a small calendar/heatmap on the detail screen.

## Recommendations

- **Weather-aware outfits** — pull current/forecast weather from the device and bias the outfit recommender toward season-appropriate items.
- **Calendar-aware** — read calendar events (work meeting vs gym vs date) and prefer matching styles.
- **Vibe profiles** — preset moods/personas ("clean prep", "streetwear", "cozy") instead of just occasion/season.
- **Outfit history** — don't recommend an outfit identical to one worn in the last N days.
- **Inspo → outfit** — paste a Pinterest URL or upload a runway/inspo pic; the recommender finds the closest items in your closet and proposes the best approximation.

## Gamification

Make every chore feel rewarding: uploading, tagging, doing laundry, even cleaning out the closet. Most are tiny — a streak counter, a small animation, a badge — but they compound. Avoid manipulative dark patterns; rewards celebrate use, not punish lapses. Almost all of this is client-side.

### Onboarding & first build
- **Closet completeness rings** — Apple-Watch-style rings for Tops / Bottoms / Footwear / Accessories. Each fills as you add items. First ring full = first badge.
- **Milestone badges** — 10, 25, 50, 100, 250 items.
- **First-week streak** — upload at least one item per day in your first week to earn a "starter pack" cosmetic (e.g. a tab bar accent color).
- **Fast lane** — skip the classification confirmation modal for the first 20 items to keep onboarding frictionless; only enforce review after that.

### Photo capture
- **Photo score** — live overlay grades framing / lighting / single item / plain background. Bar fills toward green as the shot improves. Bonus stars for 5/5.
- **Background remover bonus** — if rembg confidence is high, award a "clean shot" badge; if low, suggest a retake.
- **Photo streaks** — N consecutive 5-star photos = small cosmetic.

### Tagging & metadata
- **Item profile completeness ring** — per item, percent of optional fields filled (brand, size, material, price, notes). Fully-filled items unlock more detailed insights (CPW, retirement projections).
- **Brand collector** — discover X unique brands, earn a "brand explorer" badge. Autocomplete from a curated brand list cuts typos.
- **Suggest-as-you-type brand entry** — pressing tab on a suggestion is one tap instead of typing.
- **Discovery counter** — running total of unique brands in your closet shown on the profile.

### Outfit creation
- **Style score** — when you build an outfit, show a color-theory + balance score with a sparkle animation. Hitting > 90 plays a small celebration.
- **Outfit collection** — save outfits, see how many you've built; "100 outfits" badge.

### Wear tracking
- **Wear-again progress bar** — visible on the item card. Three taps fills it; when it hits the user-set max, item slides into the laundry queue with a small animation. (Backed by existing `wear_again_count` / `max_wear_before_wash` columns.)
- **Wear milestones per item** — 10, 25, 50, 100 wears each unlock a badge on the item card ("best friend", "ride or die").
- **Diversity bonus** — wearing an item you haven't touched in 30+ days awards a "rediscovery" star and bumps your weekly variety score.
- **30-wears club** — celebrate any item that hits 30 wears (a common sustainability target). Badge + private milestone.

### Laundry (making the chore fun)
- **Load satisfaction** — confirming "started a wash" plays a soft animation (water swoosh). Stupid? Yes. Effective? Also yes.
- **Laundry boss fight** — when the queue has 10+ items, a header banner ("10 items pending → conquer the pile") + an XP bar that drains as items move from dirty to clean.
- **Drying timer** — set a timer for the dryer; finishing within the timer awards punctuality points.
- **Folding mode** — bulk-tap UI to flip a stack of clean items back to "in closet". Each tap = satisfying tick.
- **Laundry day stats** — items washed this month, streak of weeks with at least one wash, "0 items overdue" achievement.
- **Bulk-item batch** — wash 12 socks at once with a single slider gesture.

### Cost-per-wear (CPW)
- **Item "level up"** — items have tiers as CPW drops: 💸 fresh ($50+/wear) → 👌 worn-in ($10) → ⭐ great-value ($5) → 🏆 free ($1) → 💎 priceless ($0.10). Tier badge shown on the item card. (CPW is already computed on the detail screen.)
- **Best-of leaderboard** — top 5 best CPW items, surfaced on the Stats tab.

### Closet cleanout
- **Spring clean event** — quarterly prompt. Marie-Kondo-style swipe-through of neglected items (left = donate, right = keep). Points per decision.
- **Money earned tracker** — when you mark an item sold, prompt for the sale price; running total shown ("$340 reclaimed").
- **"Closet diet" challenges** — wear only N items for a week, app locks the rest from outfit suggestions.

### Diversity & wardrobe health
- **Variety score** — % of closet worn in the last 30 days. Aim for > 60%.
- **Heatmap** — calendar view of which items got worn, colored by recency. Neglected items glow.
- **Daily challenge** — "wear something from the bottom of the pile". Optional, dismissible.

### Care & repair
- **Tailor points** — logging a repair or alteration awards points; restoring an item from low to high condition gives a bonus.
- **Repair savings tracker** — every logged repair shows "you avoided $X of replacement spending."
- **Maintenance reminders** — leather shoes need polishing, denim needs spot-treatment; gentle reminders show as glanceable cards.

### Cosmetics / unlockables
- **Theme accents** — milestones unlock new accent colors / glass tints for the app UI (the Liquid Glass system already supports color tokens).
- **App icon variants** — Apple supports alternate icons; one per major milestone.
- **Donation log** — running total of items donated.

### Anti-patterns to avoid
- **No notification spam** — streak warnings should be subtle, in-app only, never push.
- **No paid streak freezes** — feature, not monetization hook.
- **No public shaming** — neglected-item alerts are private.

## Insights

- **Duplicate detector** — embedding-distance similarity warns when you upload yet another black tee.
- **Retirement suggestions** — items with high wear count + neglected + low CPW = candidates for donate/sell. Surface in a "spring clean" view.
- **Wardrobe composition** — % tops/bottoms/etc., season balance, color distribution.

## Classification quality

- **Swap CLIP for a fine-tuned model** — there's already a "swap here" marker in [clothing_classifier.py](backend/models/clothing_classifier.py). Fine-tune on user-corrected data once enough exists.
- **User corrections feed back into training** — let the user fix a wrong category and save the correction; store as labeled data.
- **Color extraction edge cases** — patterned items (stripes, graphics) currently bucket into 2 colors and lose the pattern. Detect "is this patterned" and store dominant + accent colors separately.
- **Hex codes alongside color names** — store the cluster centroid so the UI can show a true swatch, not just the named bucket.

## UX / UI polish

- **Haptic feedback** on iOS for key taps (favorite, wear, delete).
- **Swipe actions** on closet items (swipe to mark clean / favorite / delete).
- **Empty states with illustrations** instead of plain text.
- **Skeleton loaders** instead of `ActivityIndicator` for grid screens.
- **Native iOS Liquid Glass** — once `expo-glass-effect` stabilizes, swap our `BlurView` shim for the real thing on iOS 26+.

## Backend / infrastructure

- **Image storage** — `uploads/` is fine for local but won't scale. Move to S3/R2 with signed URLs if this ever leaves the laptop.
- **Background jobs** — classification currently blocks the upload request. Move to a queue (RQ or just `BackgroundTasks`) so the API returns immediately and the result streams in.
- **Refresh tokens** — current JWTs are long-lived single tokens (7 days). Issue short-lived access + long-lived refresh, with refresh-token rotation.
- **Audit log** — persist auth events (login, password change, friend request) into a separate table so abuse patterns are reviewable after the fact.
- **TOTP / MFA enrolment** — optional second factor for the auth endpoints, gated on a `mfa_secret` user column.
- **Multi-instance rate limiter** — the in-process limiter in [security.py](backend/security.py) only covers one uvicorn worker. Swap to Redis when fanning out.

> Security posture lives in [SECURITY.md](SECURITY.md). The previous
> hardcoded-JWT-secret / wildcard-CORS / unrate-limited-auth items in this
> section have all shipped — see that doc for the current controls.

---

## Plausible but bigger

These are doable but cost weeks each — model pipelines or whole new surfaces. Defer until the smaller items above are mostly done.

- **Care label OCR** — Tesseract or a cloud OCR for the laundry icons; brittle parsing per icon set, but workable.
- **Receipt OCR** — scan a paper receipt; extract line items + prices to pre-populate purchase metadata. Same OCR backbone as care labels.
- **Voice add** — "add black H&M jeans size 32" via Whisper + a slot-filler that maps to fields. Faster than typing on mobile.
- **Daily fit pic with auto-detect** — one tap to take a body photo; segment garment regions (Grounding DINO + SAM or a fashion-segmentation model), embed each with CLIP, nearest-neighbor against the user's closet embeddings, advance `wear_again_count` for matched items. Show matches for user confirmation before saving — corrections become labeled data. The capture half is easy; the auto-detect pipeline is the real work.
- **Browser extension wishlist drafter** — small MV3 extension; one click on a retailer product page drafts a wishlist item with image + price. Separate codebase but small.
- **Friends & feed (single-instance social)** — _v1 in progress (2026-05-14)._ Friendships (request/accept/reject), avatar + bio profiles, fit-pic posts with item tags, chronological feed, emoji reactions, threaded comments. Schema: `friendships`, `fit_posts`, `post_reactions`, `post_comments`. Still TODO: outfit-repeat detector ("you wore this exact combo to Sarah's last Friday"), push notifications, moderation primitives (report, block, rate-limited comments), full pagination cursor instead of `before` timestamp.
- **Year-in-review / "On this day"** — December montage of the year's fit pics, top items by wear count, "most worn outfit"; quiet replay of a fit pic from one year ago. Easy once the fit-pic stream exists.
