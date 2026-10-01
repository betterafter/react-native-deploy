# react-native-deploy

Self-hosted **React Native release console** — inspired by Apps in Toss style version boards.

- Upload IPA / APK with a short CLI (`rnd upload`)
- Version list + memo + status on a Next.js dashboard
- **Test** opens an install QR (`itms-services://` for iOS Ad Hoc, HTTPS APK for Android)
- **No database** for MVP — Cloudflare R2 stores binaries + JSON metadata
- One shared `DEPLOY_API_TOKEN` (customize via env)

```
divident_rn_app/          # your app
react-native-deploy/      # this tool (sibling)
```

## Quick start

### 1. Install

```bash
cd react-native-deploy
cp .env.example apps/web/.env.local
# fill R2_* , DEPLOY_API_TOKEN, APP_BASE_URL
npm install
```

### 2. Run console

```bash
npm run dev
# http://localhost:3000
```

### 3. Upload a build

```bash
export RND_API_URL=http://localhost:3000
export RND_API_TOKEN=same-as-DEPLOY_API_TOKEN
export RND_APP_ID=my-app

# from packages/cli
npm run start -w rnd -- upload -f /path/to/app.ipa \
  --bundle-id com.example.app \
  -m "ad size center"
```

Or after `npm run build -w rnd` and linking:

```bash
npx rnd upload -f ./app.apk -a my-app -m "qa build"
```

## Env (console)

| Variable | Required | Purpose |
|----------|----------|---------|
| `APP_BASE_URL` | yes | Public URL of the dashboard |
| `DEPLOY_API_TOKEN` | yes | Bearer token for CLI |
| `R2_ACCOUNT_ID` | yes | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | yes | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | yes | R2 secret |
| `R2_BUCKET` | yes | Bucket name |
| `R2_PUBLIC_BASE_URL` | yes | Public/CDN base for objects |
| `DEFAULT_APP_ID` | no | Default app in UI |
| `DEFAULT_IOS_BUNDLE_ID` | no | Fallback if CLI omits `--bundle-id` |

## Env (CLI)

| Variable | Purpose |
|----------|---------|
| `RND_API_URL` | Console origin |
| `RND_API_TOKEN` | Same as `DEPLOY_API_TOKEN` |
| `RND_APP_ID` | Default `--app` |
| `RND_BUNDLE_ID` | Default iOS bundle id |

## R2 layout

```
apps/{appId}/index.json
apps/{appId}/builds/{buildId}/meta.json
apps/{appId}/builds/{buildId}/{file}
apps/{appId}/builds/{buildId}/manifest.plist   # iOS
```

## Use from an RN app (ait-style)

In your app `package.json`:

```json
{
  "devDependencies": {
    "rnd": "file:../react-native-deploy/packages/cli"
  },
  "scripts": {
    "deploy:qa": "rnd upload -f ./build/app.ipa -m \"$npm_config_memo\""
  }
}
```

Or ship `rnd` as `bin` from a future `@your-org/rn-kit` dependency so apps only install the kit.

## Roadmap

- [ ] Play Console / App Store Connect promote from **출시 요청**
- [ ] Optional Postgres meta store adapter
- [ ] Multi API keys / apps ACL
- [ ] GitHub Actions example workflow

## License

[Apache-2.0](./LICENSE)
