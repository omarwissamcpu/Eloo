# eloo — V1 source code

A Waze-style navigation app for Iraq. It has two parts:

| Folder | What it is | Tech |
|---|---|---|
| `app/` | The iOS + Android app | React Native, Expo SDK 58, TypeScript, MapLibre (OpenStreetMap) |
| `backend/` | The server the app talks to | Node.js 22, Express, Socket.IO, SQLite |

## What V1 does

- **Map** with free OpenStreetMap tiles (OpenFreeMap). Light and dark styles follow the phone, or can be set in Settings.
- **Search** for places across Iraq. Home and Work shortcuts, saved favorites, and long-press to drop a pin.
- **Routes** with up to 3 alternatives, sorted by **live traffic ETA**. Routes through a reported road closure are flagged and moved last.
- **Turn-by-turn driving**: next-turn banner, distance, ETA, automatic re-route when you leave the route, screen kept on, 2D/3D.
- **Voice guidance** in Arabic, Kurdish (Sorani) and English, using the phone's voices. Voice on/off, a choice of voice and a test button.
- **Incident reports in 2 taps**: jam, accident, road closed, flooding, hazard, slowdown, low visibility (dust/fog). Reports appear live for everyone nearby.
  - Comments are **preset only**, so there's no typing while driving and no abusive text.
  - "Still there / Not there" votes; reports voted away disappear.
  - Duplicate reports merge, and reporters build a trust score and points.
  - There is deliberately no "checkpoint/police" type. Use "slowdown" until legal review.
- **One-tap SOS 911** button on the map and while driving.
- **Accounts**: continue as a guest or sign up with an Iraqi phone number (SMS code). A guest who adds a phone keeps their places. There's also an avatar picker (male/female), profile editing and account deletion, which the App Store requires.
- **Crowd-sourced traffic**: while driving, the app sends anonymous speed samples. The server turns them into live speeds per road and direction, which feed the ETAs.
- Full **RTL layout** for Arabic and Kurdish.

## Run it on your computer (developer)

### 1. Backend
```bash
cd backend
npm install
npm test          # 9 tests: auth, places, incidents, live updates, traffic, routing
npm run dev       # http://localhost:4000/v1
```
SMS codes are printed in this terminal while `SMS_PROVIDER=console`.

### 2. App on a real phone
The map is a native module, so the app runs in a **development build**, not Expo Go.
```bash
cd app
npm install
cp .env.example .env      # set EXPO_PUBLIC_API_URL to your computer's LAN IP, e.g. http://192.168.1.10:4000/v1
npx expo run:android      # needs Android Studio, or:
npx expo run:ios          # needs a Mac with Xcode
```
You can also build in the cloud with no Mac or Android Studio: `npm i -g eas-cli && eas login && eas build --profile development --platform android`, then install the build on the phone and run `npx expo start`.

Checks: `npm run typecheck` and `npm test` (navigation logic).

## Put the server online

### Free (no credit card): Back4app + Turso
1. **Database:** at turso.tech, sign in with GitHub and create a database (pick the region closest to Iraq, e.g. Frankfurt). Copy its URL (`libsql://…turso.io`) and create an auth token.
2. **Server:** at back4app.com → Containers, sign in with GitHub, create an app from this repo with **Root directory `backend`** (it uses `backend/Dockerfile`, port 4000).
3. In the Back4app app's environment variables add `DATABASE_URL` (the Turso URL) and `DATABASE_AUTH_TOKEN` (the token). Nothing else is required: the server creates its own signing secret on first start.
4. Check `https://<your-app>.b4a.run/v1/health` answers `{"ok":true}`, then set that address (with `/v1`) as `EXPO_PUBLIC_API_URL` in `app/eas.json`.

Free-tier limits are fine for testing with a few dozen drivers; move to a paid plan before launch.

### Paid: Render (one click)
On render.com choose **New → Blueprint**, pick this repo. `render.yaml` creates the server in Frankfurt with a 1 GB disk. Health check: `https://<your-service>.onrender.com/v1/health`.
- **Privacy policy for the stores:** served by the backend at `/privacy`. Replace `[CONTACT EMAIL]` in `backend/public/privacy.html` first.
- **Own routing + search for Iraq:** see `infra/routing/README.md` (one VPS, one script).
- **Automatic checks:** every push runs the backend tests, app typecheck/tests and bundles (`.github/workflows/ci.yml`).

## Publishing to the App Store and Google Play

1. Create an **Apple Developer** account ($99/year) and a **Google Play Console** account ($25 once), both in the company's name.
2. Put the eloo logo in `app/assets/` (icon.png 1024×1024, plus the Android adaptive icon files) and set the final `bundleIdentifier`/`package` in `app/app.json` (currently `com.thekey.eloo`).
3. Deploy the backend to a server: `docker build -t eloo-backend backend/`, run it with a `JWT_SECRET` and a persistent `/data` volume, and put HTTPS in front of it.
4. Put the server URL in `app/eas.json` → `production.env.EXPO_PUBLIC_API_URL`.
5. Run `eas build --profile production --platform all`, then `eas submit`.
6. In both stores, add the privacy policy URL and screenshots, and fill in the data-safety form (location: used for navigation and anonymous traffic).

## Must do before public launch

| # | Item | Why |
|---|---|---|
| 1 | **Self-host routing (OSRM) and search (Photon)** with the Iraq OpenStreetMap extract, then set `OSRM_URL` / `PHOTON_URL` | The public demo servers in `.env.example` are for development only and have no uptime guarantee |
| 2 | **Real SMS provider** (Twilio is built in; local Iraqi SMS gateways are often cheaper) | Phone sign-up |
| 3 | **Native review of the Arabic and Kurdish text** (`app/src/i18n/strings.ts`, `app/src/nav/instructions.ts`) | Written by AI. Needs theKey's dialect pass |
| 4 | **Kurdish voice-over**: many phones have no Sorani voice, so Kurdish users currently hear English (Settings explains this). Record the phrases in `instructions.ts` with voice talent | Core promise of the product |
| 5 | Legal review of incident types, privacy policy and terms | Location data and security-sensitive reports |
| 6 | Move SQLite → PostgreSQL + PostGIS and in-memory rate limits → Redis once you run more than one server | Scale |
| 7 | Self-host map tiles or move to a paid tile provider when traffic grows | OpenFreeMap is free but best-effort |
| 8 | Fix the Iraqi OpenStreetMap data (street names, one-ways, new roads) in key cities | Route quality depends on it |

## Not in V1 (planned for V2+)

CarPlay / Android Auto, offline maps, satellite view, walking/bike/transit modes, multi-stop, trip history, calendar sync, hiking/compass, family live location, speed cameras and limits, lane guidance, background navigation with the screen off, admin dashboard for moderating reports, and the premium tier.

## Code map

```
backend/src/
  app.js         HTTP routes + live socket, profile, saved places
  auth.js        guest accounts, phone codes, tokens, +964 number handling
  incidents.js   reports, merge duplicates, preset comments, votes, trust
  traffic.js     speed samples → live speed per ~150 m cell and direction
  routing.js     routing/search proxy, traffic-adjusted ETAs, closures on route
  catalog.js     incident types, preset comments, ETA penalties
app/src/
  screens/       Onboarding (language, phone, avatar), MapScreen, Settings
  components/    ElooMap, SearchPanel, RoutePanel, NavPanel, ReportSheet, IncidentSheet
  nav/           useNavigation (GPS, progress, re-route, voice), instructions (ar/ckb/en), geo
  state/         settings (language, theme, voice), session (account, places)
  i18n/          all UI text in 3 languages
```

Map data © OpenStreetMap contributors.
