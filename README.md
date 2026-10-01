# react-native-deploy

Self-hosted React Native **release console** + CLI.

App developer UX (Apps in Toss style):

```bash
npm run build          # your existing IPA/APK / bundle step
npx rnd deploy         # upload to the console → QR test
```

---

## For app developers (day to day)

### 1. Install CLI in the app

```bash
# from your RN app folder
npm i -D rnd@github:betterafter/react-native-deploy#main:packages/cli
# or locally while developing the tool:
npm i -D file:../react-native-deploy/packages/cli
```

```json
{
  "scripts": {
    "build": "… your ios/android build …",
    "deploy": "rnd deploy"
  }
}
```

### 2. One-time config in the app root

`rnd.config.json`:

```json
{
  "appId": "my-app",
  "bundleId": "com.example.app",
  "apiUrl": "https://your-console.vercel.app",
  "artifact": {
    "ios": "./build/App.ipa",
    "android": "./android/app/build/outputs/apk/release/app-release.apk"
  }
}
```

Env (CI / shell):

```bash
export RND_API_TOKEN=…   # same as console DEPLOY_API_TOKEN
```

### 3. Ship a QA build

```bash
npm run build
npx rnd deploy -m "ad size center"
# or: npm run deploy -- -m "ad size center"
```

That’s the whole loop. Open the console URL printed at the end → **테스트** → QR.

---

## For console operators (once)

Host the dashboard (Vercel / Node). This is the “Apps in Toss console” equivalent — **not** something every developer runs before each deploy.

```bash
git clone https://github.com/betterafter/react-native-deploy.git
cd react-native-deploy
cp .env.example apps/web/.env.local
# fill R2_* , DEPLOY_API_TOKEN, APP_BASE_URL
npm install
npm run dev    # or deploy apps/web to Vercel
```

| Variable | Purpose |
|----------|---------|
| `APP_BASE_URL` | Public console URL |
| `DEPLOY_API_TOKEN` | Shared token for `rnd deploy` |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_BASE_URL` | Artifact + JSON meta storage (no DB) |

---

## Mapping to Apps in Toss

| Apps in Toss | react-native-deploy |
|--------------|---------------------|
| `npm run build` / `ait build` | Your app `npm run build` (IPA/APK) |
| `npx ait deploy` | `npx rnd deploy` |
| Toss console + QR | Your hosted Next console + QR |
| Hosted by Toss | You host console once (Vercel + R2) |

---

## R2 layout

```
apps/{appId}/index.json
apps/{appId}/builds/{buildId}/meta.json
apps/{appId}/builds/{buildId}/{file}
apps/{appId}/builds/{buildId}/manifest.plist   # iOS
```

## Roadmap

- [ ] Play / App Store Connect from **출시 요청**
- [ ] Publish `rnd` to npm
- [ ] Optional kit package that ships `rnd` as a transitive bin

## License

[Apache-2.0](./LICENSE)
