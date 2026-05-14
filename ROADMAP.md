# Roadmap

Running list of ideas for future work. Living document — add things here as they come up, retire items by moving them to the README's "Notes" section once shipped.

## Top of the list

### Front + back photo per item
Right now an item is one `image_path`. Most clothes look very different front vs back — a graphic tee, a jacket with a print, jeans with rear-pocket detail. We should support a small image gallery per item.

- Schema: replace `image_path` with `image_paths: list[str]` (or add `image_path_back`, `image_path_extra`). SQLite stores as JSON column.
- Upload flow: the upload screen accepts multiple images, lets the user tag which is "front" and which is "back".
- Classifier: run on each photo, merge results (color extraction in particular benefits — front of a tee may be solid green but the back has a logo).
- Detail screen: small image carousel.

### Closet density & filtering
The closet grid currently shows ~4 items at a time (2-col, aspect-1 cards). For users with a real-sized closet that's not enough; need to fit more without making it look bad.

- **Density toggle** — small (3 or 4 col, thumbnail only) / medium (current 2-col) / large (1-col with detail). Persist user's choice.
- **Sticky filter bar** at the top of the closet: chip row for Clean / Needs wash / Favorites, plus a horizontal-scrolling row of category chips and a color swatch row. Filters AND together.
- **Search** — free-text over category, subcategory, color names, notes.
- **Sort options** — recently added, most worn, neglected (longest unworn), best CPW.
- **Category rails view** — alternative layout: horizontal-scroll rails grouped by Top / Bottom / Footwear / Accessory. Lets you scan more items at once and feels native-iOS. Toggle between rails view and grid view in the header.

## Capture & data

- **Brand, size, fit, material** — small free-text fields on each item. The detail screen already has space.
- **Care label OCR** — point the camera at the tag, scrape wash temperature / dry / iron icons and store them. Show "machine wash cold" on the detail screen.
- **Purchase metadata** — date, price, store. Enables cost-per-wear later.
- **Tags / notes** — user-defined free text. Useful for "vacation only", "gift from mom", etc.
- **Physical location** — which drawer / rack / bin an item lives in. Optional but useful in big closets ("front rack, left"). Search by location.
- **Batch / shelf import** — point the camera at a hung rack or shelf, app detects each garment and creates draft entries. User reviews and saves. Big speedup for the initial closet build.
- **CSV / spreadsheet import** — for users who already track clothes elsewhere.
- **Voice add** — "add black H&M jeans size 32" parses into fields. Faster than typing on mobile.
- **NFC / barcode tags** — stick a small NFC tag inside a garment; tap with phone to instantly mark worn or send to laundry. Optional power-user feature.
- **Lending tracker** — when you lend an item to a friend, mark it "lent" with a return date. Item temporarily disappears from outfit suggestions; reminder fires near the due date.

### Bulk items (socks, underwear, basics)
Not every garment needs its own photo + record. Plain socks, underwear, undershirts, and basic tees are interchangeable for outfit purposes and just clutter the closet view. Add a "bulk" mode.

- **Schema** — `clothing_items.is_bulk` bool + `quantity` int + `clean_count` int. Photo optional. Bulk items still belong to a category.
- **Upload flow** — toggle "individual / bulk" on the upload screen. Bulk path skips classification, just prompts: name (e.g. "white crew socks"), category, total quantity. No image required (one optional reference photo).
- **Smart defaults** — Socks and Underwear default to bulk; everything else defaults to individual. User can override.
- **Closet view** — bulk items render as a single card with a quantity badge ("12 pairs, 4 clean") instead of one card per pair.
- **Laundry integration** — bulk items don't go to the laundry queue as one record; instead "wash 3 socks" decrements `clean_count`. The wear-again counter doesn't apply to bulk items by default.
- **Outfit recommender** — treats bulk items generically ("any clean white sock") rather than picking a specific record.
- **Promote to individual** — option to convert a bulk item into individual records later (e.g. once you have a fancy pair worth tracking).

### Faster onboarding (for users with full closets)
- **Shelf scan** — point the camera at a hanging rack or folded stack; segment each visible garment, pre-classify, then user confirms in a batch grid. One shelf → 8 items in ~30 seconds.
- **Camera-roll batch** — picker that accepts N photos at once and processes them as a queue with one progress bar.
- **CSV import** — power-user path: drop a spreadsheet of items without photos. Useful for migrating from a spreadsheet or another app.
- **Voice input** — "add black H&M jeans, size 32, $45". Faster than typing on mobile.
- **NFC tag** — stick an NFC sticker on a label; tap to log a wear instantly. Niche, for power users.

### Item location (physical world)
- **Where is this** — free-text "front closet, top shelf" or a structured drawer/section picker. Helps when you have multiple storage spots.
- **Lent to a friend** — mark item out-on-loan, who has it, expected return date. Friend can confirm receipt if they're on the app.

## Acquisition & shopping

The current flow assumes an item is already in your closet. Buying / planning to buy is its own surface.

- **Receipt OCR** — scan a paper receipt; extract line items + prices to pre-populate purchase metadata for items you upload right after.
- **Order-email parsing** — opt-in mailbox connector that reads shipping/order confirmations from common retailers (Amazon, Zara, H&M, Uniqlo) and pre-creates items with brand + price + size already filled.
- **Wishlist** — items you want; share with family for gifts; convert a wishlist item to a real item when it arrives.
- **Duplicate warning at purchase** — paste a product URL; app checks against existing closet and warns "you already have 4 black tees" before you buy.
- **Closet-fit pre-check** — paste a product photo; the recommender tells you which existing items it would pair with. Decide if it fills a real gap.
- **Resale price tracker** — fetch each item's going rate on Depop/Poshmark/eBay; surface on the detail screen as a hint for retirement decisions.

## Travel & packing

- **Pack list builder** — input destination, dates, planned activities; app builds a capsule from your closet that covers the trip (e.g. 5 outfits over 7 days with overlap).
- **Travel mode** — lock packed items out of normal outfit suggestions; they're "physically not here" until you toggle off.
- **Weather sync** — pull forecast for the destination instead of home; bias the pack list accordingly.
- **Packing checklist** — tap-off-as-packed UI with progress bar; the laundry boss-fight gamification applies here too.

## Planning ahead

- **Outfit calendar** — plan an outfit for a future date (Friday's wedding, Monday's interview). Reserved items are locked from earlier wear.
- **Conflict detection** — same item double-booked across two events → warn.
- **Event templates** — "office casual", "wedding guest", "first date" — saved item bundles you can drop onto a date with one tap.
- **Auto-prep reminder** — N days before a reserved event, check that items are clean and ironed; surface in the laundry queue with priority.

## AI stylist

Beyond the rule-based recommender, a chat-style natural-language layer.

- **"What should I wear today?"** — natural language query that considers weather, calendar, last-worn dates, and the user's stated mood. Returns 2–3 outfits with reasoning.
- **"What goes with my new green jacket?"** — pivot from one new item, suggests pairings.
- **"I'm bored of my usual" mode** — actively recommends items low in the rotation that still match user style.
- **Context window** — feed user closet (categories, colors, wear-history summary) + recent outfit log as system context to a small chat model; do not send full photos. Costs are bounded.

## Sustainability & values

- **30-wears club** — celebrate any item that hits 30 wears (a common sustainability target). Badge + private milestone.
- **Carbon estimate** — rough per-garment CO₂ estimate (fast fashion ≫ secondhand). Curated table; directional, not authoritative.
- **Repair savings tracker** — every logged repair shows "you avoided $X of replacement spending."
- **Donation log** — running total of items donated + estimated tax-deduction value (US 501c3 rules).
- **Brand ethics overlay** — Good On You-style score per brand surfaced on the detail screen (opt-in; curated table or licensed API).

## Search within your closet

- **Free-text search** — across name, brand, color, notes, category. Lives in the closet's sticky filter bar.
- **Visual search** — upload a reference photo (an inspo pic or another garment); the app uses CLIP embeddings to return your closest closet items.
- **"Outfits containing X"** — pivot from one item card to every outfit (past and recommended) it's part of.
- **Color search** — tap a color swatch on the filter bar to show everything in that bucket.

## Mood & outfit feedback

- **Outfit rating** — at end of day, optional 1–5 tap on how you felt in today's fit. Cheap signal, accumulates fast.
- **Confidence boost log** — track which items correlate with high ratings; surface as "your power pieces."
- **Lucky outfit detector** — items repeatedly tagged on days marked good (job offer, great date) bubble up.
- **Compliments counter** — manual log ("got a compliment today") per item; ties into the favorites loop in the Social section.

## Accessibility

- **VoiceOver / TalkBack** pass — verify all glass primitives + screen layouts are screen-reader friendly. Buttons need accessible labels.
- **Dynamic Type / large text** — layouts shouldn't break at the largest accessibility text sizes.
- **High-contrast mode** — alternate theme tokens with WCAG-compliant contrast.
- **Color-blind labels** — show a hex swatch + color name together so users who can't distinguish hue still get useful info.
- **Reduced motion** — respect the system setting; disable shake/scale animations and the laundry-load swoosh.

## Notifications & reminders

- **Smart timing** — never push between 10pm and 7am local; batch pending pings into a 9am morning digest.
- **Digest vs ping** — per-category toggle: streaks, laundry, neglected items, friend reactions. Default everything to digest, push only for friend reactions and explicit user-set reminders.
- **Quiet seasons** — travel mode mutes closet-internal pings. Re-enable on return.
- **Wash-by reminders** — items with high freshness decay get a "wash by Sunday" hint in-app, not push.
- **In-app inbox** — a single home-screen pull-out with everything (streaks, friend hearts, reminders). Users opting out of push still see it on next open.

## Lifecycle & status

Today an item is just "clean" or "needs wash". There's a richer state machine worth modeling:

- **Wear-again counter** — for items like jeans/jackets that get worn multiple times between washes. Configurable per-item max.
- **Laundry queue** — explicit states: `clean → worn → in_hamper → washing → drying → clean`. Tap "wore today" advances the state.
- **Outfit of the day** — optional one-tap selfie or just a list of items worn today; feeds the wear history.
- **Neglected items alert** — flag items unworn for 30/60/90 days.
- **Wear history per item** — a small calendar/heatmap on the detail screen.
- **Outfit planning calendar** — plan tomorrow's outfit, this week's, special events ahead. Items can be "reserved" for a date; outfit recommender won't pick a reserved item for any other day. Conflict detection (two events same day, same outfit). Pulls weather forecast for planned days.
- **Mood / outfit feedback** — after wearing, rate confidence 1–5 (optional). Feeds future recommendations ("favorites you also felt good in") and surfaces a "lucky outfit" tag.

## Recommendations

- **Weather-aware outfits** — pull current/forecast weather from the device and bias the outfit recommender toward season-appropriate items.
- **Calendar-aware** — read calendar events (work meeting vs gym vs date) and prefer matching styles.
- **Vibe profiles** — preset moods/personas ("clean prep", "streetwear", "cozy") instead of just occasion/season.
- **Outfit history** — don't recommend an outfit identical to one worn in the last N days.
- **AI stylist (chat)** — natural-language assistant grounded in the user's closet. "What should I wear today?", "I just bought a green jacket, what goes with it?", "Build me a capsule for a 5-day trip to Lisbon". Backend: an LLM call with the closet (item embeddings + metadata) injected as context.
- **Inspo → outfit** — paste a Pinterest URL or upload a runway/inspo pic; the recommender finds the closest items in your closet and proposes the best approximation.
- **Visual search in your own closet** — "show me anything like this" from an item or external photo. Useful for "do I already own this style?" and quick filtering.

## Social & daily fit pic

A daily "fit of the day" ritual that doubles as automatic wear tracking. The user takes one body shot per day; the app detects which closet items are in it and advances each item's wear state. Friends can follow each other's feeds.

- **Daily fit capture** — one tap from the home tab to take a body photo. Stored as the day's "fit". Optional caption, location, occasion tag.
- **Auto-detect worn items** — segment the photo into garment regions (e.g. Grounding DINO + SAM, or a fashion-segmentation model), embed each region with CLIP, match nearest neighbor against the user's closet item embeddings. Show the matched items so the user can confirm/correct before saving.
  - Requires storing a CLIP embedding per item at upload time (one extra column on `clothing_items`).
  - User confirmation step is important because mis-matches will be common at first; corrections become labeled data.
- **Auto-advance lifecycle** — for each detected item: increment `wear_again_count`; if it hits `max_wear_before_wash`, move to the laundry queue automatically; otherwise stay clean. Hooks into the existing machinery in [db_manager.py](backend/database/db_manager.py).
- **Friends list** — follow/unfollow other users. Privacy: closet stays private by default; only fit pics are sharable, and only with confirmed friends.
- **Feed** — chronological list of friends' fit pics. Tap a pic → see the items, react with a heart/comment.
- **Outfit repeat detector** — warn before posting "you wore this exact combo to Sarah's last Friday."
- **Compliments → favorites loop** — items that get the most hearts become candidates for the user's favorites list.
- **Year-in-review** — December montage of the year's fit pics, top items by wear count, most-photographed-with-friend, "most worn outfit". Shareable card.
- **"On this day"** — quiet replay of a fit pic from one year ago, like Photos memories.
- **Borrow / lend with friends** — request to borrow a specific item from a friend's closet; if they accept, both sides get the lending log entry.
- **Style twin** — surface a friend whose closet overlaps most with yours; suggests pieces to swap or borrow.

## Gamification

The goal is to make every chore feel rewarding: uploading, tagging, doing laundry, even cleaning out the closet. Most of these are tiny — a streak counter, a small animation, a badge — but they compound. Avoid manipulative dark patterns; the rewards should celebrate use, not punish lapses.

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
- **Brand collector** — discover X unique brands, earn a "brand explorer" badge. Autocomplete from a known-brand list cuts typos.
- **Care label scanner combo bonus** — using OCR to fill care fields counts as multiple fields at once → fast progress.

### Brand entry specifically (you asked)
- **Suggest as you type** with a curated brand database (Nike, H&M, Patagonia, …); pressing tab on a suggestion is one tap instead of typing.
- **Brand badges**: "Sustainability shopper" (3+ items from a curated sustainable list), "Local hero" (3+ items from independent labels you tag as local), "Vintage" (item year < 2010).
- **Discovery counter** — running total of unique brands in your closet shown on the profile.

### Daily fit pic streak (ties to Social section)
- **Streak counter** — consecutive days with a fit pic. Snap-style flame icon.
- **Streak freezes** — earn one freeze per 7-day milestone; auto-spend to protect a streak when you miss a day.
- **Weekly themes** — Monday "monochrome", Friday "throwback", Sunday "comfy". Themed posts get bonus points.
- **Compliments received** — running counter; friend reactions on fits show up here.

### Outfit creation
- **Style score** — when you build an outfit, show a color-theory + balance score with a sparkle animation. Hitting > 90 plays a small celebration.
- **Outfit collection** — save outfits, see how many you've built; "100 outfits" badge.
- **Outfit-of-the-week** — community vote across friends (opt-in).

### Wear tracking
- **Wear-again progress bar** — visible on the item card. Three taps fills it; when it hits the user-set max, item slides into the laundry queue with a small animation.
- **Wear milestones per item** — 10, 25, 50, 100 wears each unlock a badge on the item card ("best friend", "ride or die").
- **Diversity bonus** — wearing an item you haven't touched in 30+ days awards a "rediscovery" star and bumps your weekly variety score.

### Laundry (making the chore fun)
- **Load satisfaction** — confirming "started a wash" plays a soft animation (water swoosh). Stupid? Yes. Effective? Also yes.
- **Laundry boss fight** — when the queue has 10+ items, a header banner ("10 items pending → conquer the pile") + an XP bar that drains as items move from dirty to clean.
- **Drying timer** — set a timer for the dryer; finishing within the timer awards punctuality points.
- **Folding mode** — bulk-tap UI to flip a stack of clean items back to "in closet". Each tap = satisfying tick.
- **Laundry day stats** — items washed this month, streak of weeks with at least one wash, "0 items overdue" achievement.
- **Bulk-item batch** — wash 12 socks at once with a single slider gesture.

### Cost-per-wear (CPW)
- **Item "level up"** — items have tiers as CPW drops: 💸 fresh ($50+/wear) → 👌 worn-in ($10) → ⭐ great-value ($5) → 🏆 free ($1) → 💎 priceless ($0.10). Tier badge shown on the item card.
- **Best-of leaderboard** — top 5 best CPW items, surfaced on the Stats tab.

### Closet cleanout
- **Spring clean event** — quarterly prompt. Marie-Kondo-style swipe-through of neglected items (left = donate, right = keep). Points per decision.
- **Money earned tracker** — when you mark an item sold, prompt for the sale price; running total shown ("$340 reclaimed").
- **"Closet diet" challenges** — wear only N items for a week, app locks the rest from outfit suggestions.

### Diversity & wardrobe health
- **Variety score** — % of closet worn in the last 30 days. Aim for > 60%.
- **Heatmap** — calendar view of which items got worn, colored by recency. Neglected items glow.
- **Daily challenge** — "wear something from the bottom of the pile". Optional, dismissible.

### Social loops
- **Compliment economy** — give/receive hearts on fit pics. Total hearts received = a passive score; can't be gamed easily because friends are real.
- **Group challenges** — "September minimalism: 10 items for the month". Friends opt in, leaderboard at the end.
- **Style twin** — recommends a friend whose closet overlaps with yours in style for outfit swaps.

### Care & repair
- **Tailor points** — logging a repair or alteration awards points; restoring an item from low to high condition gives a bonus.
- **Maintenance reminders** — leather shoes need polishing, denim needs spot-treatment; gentle reminders show as glanceable cards.

### Knowledge / education (optional, opt-in)
- **Style tips** — short cards that pop up when you do something for the first time (your first formal item: "did you know dress shirts last 2x longer with hangers?").
- **Mini-quizzes** — "which of these colors complements navy?" Three quick taps, no streak pressure.

### Cosmetics / unlockables
- **Theme accents** — milestones unlock new accent colors / glass tints for the app UI (the Liquid Glass system already supports color tokens — easy to wire).
- **App icon variants** — Apple supports alternate icons; one per major milestone.
- **Custom badges visible to friends** on your profile.

### Anti-patterns to avoid
- **No notification spam** — streak warnings should be subtle, in-app only, never push.
- **No paid streak freezes** — feature, not monetization hook.
- **No public shaming** — neglected-item alerts are private; missed laundry isn't broadcast to friends.
- **No leaderboards that humiliate** — only positive-sum rankings ("most diverse closet this month"), never bottom-of-the-pile.

## Acquisition & shopping

The current upload flow is post-hoc: you already own the thing. The shopping side could be a whole pre-purchase loop.

- **Wishlist** — items you want; mark as "would accept as gift", "saving up for", "watching for sale". Shareable as a gift list.
- **Pre-purchase duplicate check** — paste a product URL or photo before buying. The app warns if you already own 4 similar items.
- **Capsule gap analysis** — "your closet is missing a neutral blazer / waterproof outer / dressy black shoe". Drives intentional buying.
- **Email/receipt parsing** — opt-in inbox connection that parses confirmation emails from Zara, H&M, Uniqlo, Amazon → drafts items with brand, price, date auto-filled.
- **Browser extension** — when you're on a retailer product page, one click drafts a wishlist item with the product image and price.
- **Resale price tracking** — for items you might sell, periodic check against eBay / Poshmark for current resale value.
- **Sale watch** — if a wishlist item drops in price, notify.

## Travel & packing

- **Pack list builder** — pick destination, dates, activities, and the app proposes a packing list (N outfits, weather-aware, capsule logic).
- **Travel mode** — mark items as "packed", they show as unavailable in the closet until you return. Useful for tracking what you actually have on a trip.
- **Capsule generator** — given N items, pick the subset that produces the most outfit combinations.
- **Trip outfit log** — fit pics taken during the trip get grouped into a "Lisbon, April 2026" album.

## Sustainability

A values-aligned lens on the same data — opt-in, not in-your-face.

- **30 wears club** — celebrate items that pass 30 wears (sustainable fashion benchmark). Badge on the item card.
- **Carbon footprint estimate** — rough per-garment CO₂ based on material + brand category. Aggregate footprint for the closet.
- **Repair savings** — track money saved by repairing instead of replacing. Show "$X saved this year".
- **Brand ethics rating** — surface a curated rating (e.g. Good On You) on the brand field. Optional, off by default.
- **Recycle / donate workflow** — when retiring, suggest the nearest accepting drop-off + tax-deduction estimator.

## Accessibility

- **VoiceOver / TalkBack pass** — label every interactive control, group related labels, fix scroll order.
- **Dynamic type** — respect the system text-size setting throughout. Currently typography is hardcoded.
- **High-contrast mode** — alternate theme with stronger borders and reduced translucency for the glass UI.
- **Color-blind-friendly** — show a hex swatch and pattern indicator next to the named color, not the name alone.
- **Reduce motion** — honor the system setting; disable the float/scale animations and ring-fill celebrations.
- **One-handed mode** — bottom-anchored versions of common flows (upload, fit pic) for big phones.

## Notifications & quiet hours

Important to design carefully — bad notification UX is what kills closet apps.

- **Digest mode** — one daily summary card (laundry pending, neglected items, friend reactions) instead of multiple pings.
- **Smart timing** — never ping during night hours; learn the user's morning routine and post the digest then.
- **Per-category opt-in** — separate toggles for streaks, friends, laundry reminders, wishlist sales.
- **Quiet seasons** — auto-mute streak and neglected-item alerts when the user marks themselves as traveling or on vacation.
- **In-app first** — every notification has an in-app counterpart; push is opt-in and stays minimal.

## Insights

- **Cost per wear** — purchase price ÷ times worn, ranked.
- **Duplicate detector** — embedding-distance similarity warns when you upload yet another black tee.
- **Retirement suggestions** — items with high wear count + neglected + low CPW = candidates for donate/sell. Surface in a "spring clean" view.
- **Wardrobe composition** — % tops/bottoms/etc., season balance, color distribution.

## Classification quality

- **Swap CLIP for a fine-tuned model** — there's already a "swap here" marker in [clothing_classifier.py](backend/models/clothing_classifier.py). Fine-tune on user-corrected data once enough exists.
- **User corrections feed back into training** — let the user fix a wrong category and save the correction.
- **Color extraction edge cases** — patterned items (stripes, graphics) currently bucket into 2 colors and lose the pattern. Detect "is this patterned" and store dominant + accent colors separately.
- **Hex codes alongside color names** — store the cluster centroid so the UI can show a true swatch, not just the named bucket.

## UX / UI polish

- **Haptic feedback** on iOS for key taps (favorite, wear, delete).
- **Swipe actions** on closet items (swipe to mark clean / favorite / delete).
- **Pull-to-refresh** on every list (Closet and Outfits — Stats already has it).
- **Empty states with illustrations** instead of plain text.
- **Skeleton loaders** instead of `ActivityIndicator` for grid screens.
- **Native iOS Liquid Glass** — once `expo-glass-effect` stabilizes, swap our `BlurView` shim for the real thing on iOS 26+.

## Backend / infrastructure

- **Move the JWT secret** out of source (currently hardcoded in [auth.py](backend/auth.py)).
- **CORS** — drop the wildcard (`allow_origins=["*"]` in [main.py](backend/main.py)); pin to the actual frontend origins.
- **Image storage** — `uploads/` is fine for local but won't scale. Move to S3/R2 with signed URLs if this ever leaves the laptop.
- **Resize on upload** — store a small thumbnail alongside the original, serve thumbnails to grids.
- **Background jobs** — classification currently blocks the upload request. Move to a queue (RQ or just `BackgroundTasks`) so the API returns immediately and the result streams in.
- **Rate limit** auth endpoints.

## Stretch

- **AR try-on** — overlay items onto a body via the camera (probably needs a separate model).
- **Marketplace integration** — when retiring an item, prefill a Poshmark / Depop listing draft.
- **Multi-user household** — shared closets for couples / families with per-user worn history.
