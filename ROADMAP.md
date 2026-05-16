# Roadmap

Remaining work only. Keep this practical: features that fit the current FastAPI + SQLite + Expo + CLIP app and are worth building soon.

## Travel & packing

- **Capsule optimizer** — stronger “pick N items that maximize outfit combinations” beyond the current coverage-style pack list.

## Notifications & reminders

- **Push / scheduled reminders** — optional notifications when lends are due or planned outfits still need prep (today: in-app cards only).

## Lifecycle & status

- **Wear calendar UI** — proper month grid / heatmap vs. recent-wear dots on item detail.

- **Laundry ↔ queue wiring** — align explicit `laundry_state` with `laundry_queue` flows if you want one unified pipeline.

## Recommendations

- **Calendar integration** — bias outfits from device calendar or richer planned-outfit surfacing on the Outfits tab (beyond stylist context).

- **Planned-outfit-aware picker** — explicit UI to “dress for Thursday’s plan” on recommendations.

## Insights

- **Retirement model** — deeper fusion of CPW, neglect, condition trend, and correction history.

- **Charts polish** — denser visuals for composition / duplicates (beyond text lists and bars).

## Classification quality

- **Swap CLIP for a fine-tuned model** — there is already a "swap here" marker in [clothing_classifier.py](backend/models/clothing_classifier.py). Fine-tune on user-corrected data once enough exists.

- **Accent vs dominant colors** — store secondary accent buckets separately when patterns are busy.

- **Train export** — bulk export classification corrections for offline training pipelines.

## UX / UI polish

- **`expo-haptics`** on iOS for taps (today: short `Vibration` where used).

- **True swipe actions** — `Swipeable` rows on closet grid/list vs. compact inline buttons.

- **Illustrated empty states** — artwork or branded placeholders instead of copy-only empties.

- **Skeleton loaders on closet/outfit grids** — Stats has a skeleton; extend to other heavy lists.

## Backend / infrastructure

- **Image storage** — move local `uploads/` to S3/R2 with signed URLs if this leaves the laptop.

- **Background jobs** — classification currently blocks upload; move to a queue or FastAPI `BackgroundTasks`.

- **Refresh tokens** — issue short-lived access tokens plus long-lived refresh tokens with rotation.

- **Audit log** — persist auth events into a separate table so abuse patterns are reviewable.

- **TOTP / MFA enrolment** — optional second factor gated on a `mfa_secret` user column.

- **Multi-instance rate limiter** — swap the in-process limiter in [security.py](backend/security.py) to Redis when fanning out.

---

## Plausible but bigger

These are worth remembering, but not part of the near-term backlog.

- **Batch / shelf import** — detect multiple garments in one rack/shelf photo and create draft items.

- **Receipt OCR** — scan a paper receipt; extract line items and prices to pre-populate purchase metadata.

- **Voice add** — "add black H&M jeans size 32" via Whisper plus a slot-filler that maps to fields.

- **Daily fit pic with auto-detect** — segment garment regions, embed each, nearest-neighbor against closet embeddings, and advance wear counts after user confirmation.

- **Social moderation and notifications** — outfit-repeat detector, push notifications, report/block flows, rate-limited comments, and cursor pagination for feed.

- **Year-in-review / On this day** — December montage of fit pics, top items by wear count, most worn outfit, and quiet replay of a fit pic from one year ago.
