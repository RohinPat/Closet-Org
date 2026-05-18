# Store listings — copy/paste for Play Console & App Store Connect

Use after your first EAS build. Replace screenshot paths with your own captures from a real device.

**Privacy policy URL (live after server deploy):** `http://193.122.156.36/privacy`  
**Terms of Service URL:** `http://193.122.156.36/terms`  
Update to `https://yourdomain.com/...` when you add HTTPS.

---

## Short description (Google Play, 80 chars max)

```
Organize your closet with AI. Upload clothes, get outfits, track what you wear.
```

---

## Full description (both stores)

```
Closet Org is your personal wardrobe assistant.

• Upload photos of clothing — AI suggests category, colors, and style
• Browse and search your digital closet
• Get outfit recommendations for weather, occasion, and vibe
• Track wears, laundry, and neglected pieces
• Plan trips and packing with forecast-aware suggestions
• Optional social features: friends and outfit feed

Create an account to sync your closet across devices. Your data stays on our servers until you delete it.

Questions: patel.rohin@northeastern.edu
```

---

## App Store subtitle (30 chars max)

```
AI closet & outfit planner
```

---

## Category

| Store | Suggested |
|-------|-----------|
| Google Play | Lifestyle |
| Apple | Lifestyle |

---

## Contact & support

| Field | Value |
|-------|--------|
| Developer / support email | patel.rohin@northeastern.edu |
| Privacy policy URL | http://193.122.156.36/privacy |
| Terms of Service URL | http://193.122.156.36/terms |
| Website (optional) | http://193.122.156.36 |

---

## Google Play — Data safety (honest defaults)

| Question | Answer |
|----------|--------|
| Collects data? | Yes |
| Data encrypted in transit | Partially (HTTP today; HTTPS when domain added) |
| Users can request deletion | Yes (email support) |
| **Personal info** | Email, username (account) |
| **Photos** | Clothing photos user uploads |
| **Location** | Approximate, optional, for weather |
| **App activity** | Closet items, outfits, preferences (app functionality) |
| Sold to third parties | No |
| Used for ads | No |

---

## Apple — App Privacy (nutrition labels)

| Data type | Linked to user | Used for tracking | Purpose |
|-----------|----------------|-------------------|---------|
| Email, user ID | Yes | No | App functionality, account |
| Photos | Yes | No | App functionality |
| Coarse location | Yes | No | App functionality (weather) |
| Product interaction (closet usage) | Yes | No | App functionality |

Tracking: **No**  
Third-party advertising: **No**

---

## Review notes (both stores)

Paste into “Notes for reviewer” / “App access”:

```
Closet Org requires an account.

Test account (create if needed before submit):
  Email: [YOUR_REVIEW_EMAIL]
  Password: [YOUR_REVIEW_PASSWORD]

Steps:
1. Open app → Register or log in
2. Allow photo access → Upload a clothing image from gallery
3. Open Closet tab → item appears after classification (first upload may take 1–2 minutes)
4. Open Outfits → generate a recommendation

Backend: http://193.122.156.36 (API). Location permission is optional (weather only).
```

Create a dedicated reviewer account before submission; do not use your personal password in the form if you reuse it elsewhere.

---

## Screenshots checklist

Capture on a **physical phone** (not Expo Go UI chrome if possible — use preview/production build).

| # | Screen | Why |
|---|--------|-----|
| 1 | Login or onboarding | First impression |
| 2 | Closet grid with items | Core value |
| 3 | Item detail | Depth |
| 4 | Outfit recommendation | Differentiator |
| 5 | Upload flow | Shows AI |
| 6 | Profile / settings (optional) | Trust |

**Google Play:** phone screenshots, 16:9 or 9:16, min 320px short side.  
**Apple:** 6.7" and 6.5" iPhone sizes required for iPhone apps.

---

## Versioning

| Field | Location | Rule |
|-------|----------|------|
| User-visible version | `mobile/app.json` → `expo.version` | e.g. `1.0.0` |
| Android `versionCode` | `app.json` → `android.versionCode` | Integer, increase every Play upload |
| iOS build | `app.json` → `ios.buildNumber` | String, increase every App Store upload |
| EAS | `production` profile `autoIncrement` | Bumps build numbers on cloud builds |

---

## Build commands (after `eas login` and `eas init`)

```bash
cd mobile
npm install
eas init          # links Expo project (once)
eas build --platform android --profile preview    # APK for sideload test
eas build --platform android --profile production # AAB for Play Store
eas build --platform ios --profile production     # IPA for TestFlight / App Store
```

Submit (optional):

```bash
eas submit --platform android --profile production
eas submit --platform ios --profile production
```

Full walkthrough: **[mobile/STORE_RELEASE.md](../mobile/STORE_RELEASE.md)**
