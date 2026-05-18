# Mobile store release — Closet Org

One backend (`http://193.122.156.36`) powers all builds. No second API.

## Prerequisites

- [ ] Oracle VM running, `/privacy` and `/terms` load in browser
- [ ] [Expo account](https://expo.dev/signup)
- [ ] `npm i -g eas-cli` → `eas login`
- [ ] Google Play Console (~$25) and/or Apple Developer (~$99/yr)

## One-time: link EAS project

```bash
cd mobile
npm install
eas init
```

Accept creating/linking the Expo project for slug `closet-org`. This writes `expo.extra.eas.projectId` into `app.json` (or `app.config`).

## Local dev (Expo Go)

`mobile/.env` sets `EXPO_PUBLIC_API_URL`. Restart Metro after changes:

```bash
npx expo start
```

## Test install (Android APK)

```bash
eas build --platform android --profile preview
```

Download APK from the EAS dashboard → install on device → log in → upload → closet.

## Play Store (AAB)

```bash
eas build --platform android --profile production
```

Play Console → your app → **Testing → Internal testing** → create release → upload `.aab` → add testers.

Listing copy and Data safety answers: **[docs/STORE_LISTINGS.md](../docs/STORE_LISTINGS.md)**

```bash
eas submit --platform android --profile production
```

(or upload the AAB manually in Play Console)

## Apple (TestFlight → App Store)

```bash
eas build --platform ios --profile production
```

First build: EAS prompts for Apple ID, team, certificates.

App Store Connect → TestFlight → add internal testers.

**HTTPS:** App Store review may require `https://` API. When you add a domain + certbot, update:

1. `eas.json` → all profiles `EXPO_PUBLIC_API_URL`
2. `app.json` → `extra.closetApiOrigin`, `privacyPolicyUrl`
3. Server `/etc/closet-org.env` → `ALLOWED_ORIGINS`
4. Redeploy + rebuild

## Config reference (already in repo)

| File | Purpose |
|------|---------|
| `app.json` | `android.package`, `ios.bundleIdentifier`, version codes, privacy URL |
| `eas.json` | Build profiles + `EXPO_PUBLIC_API_URL` for release |
| `.env.example` | Local Expo Go template |

## After `git pull` on Oracle

```bash
cd /opt/closet-org && sudo git pull
sudo systemctl restart closet-org
curl -s -o /dev/null -w "privacy:%{http_code}\n" http://127.0.0.1/privacy
curl -s -o /dev/null -w "terms:%{http_code}\n" http://127.0.0.1/terms
```

Expect `200` before using those URLs in store forms.
