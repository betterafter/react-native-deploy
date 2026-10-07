# react-native-deploy

셀프호스트 React Native QA 배포 툴. Vercel + R2 무료 티어로 콘솔을 돌리고, CLI로 APK/IPA·샌드박스 QR을 올립니다.  
(스토어 출시용이 아니라 **팀 내부 테스트 배포**용입니다.)

```bash
npm i -D github:betterafter/react-native-deploy
npx rnd token add          # 토큰 + 콘솔 URL
npx rnd build              # 설치용 APK
npx rnd deploy -m "홈 화면" # 파일 설치 QR + 샌드박스 QR
```

`deploy` 기본 = 파일 설치 QR + 샌드박스 QR. `--export-only` / `--skip-export`로 한쪽만 가능.

---

## 사전 세팅 (콘솔 운영 · 1회)

```bash
git clone https://github.com/betterafter/react-native-deploy.git
cd react-native-deploy
cp .env.example apps/web/.env.local   # R2 · DEPLOY_API_TOKEN · APP_BASE_URL 채우기
npm install
npm run dev                           # 로컬 확인 후 apps/web → Vercel 등
```

| env | 역할 |
|-----|------|
| `APP_BASE_URL` | 콘솔 공개 URL |
| `DEPLOY_API_TOKEN` | CLI Bearer 토큰 |
| `R2_*` | Cloudflare R2 (계정·키·버킷·공개 URL) |
| `SANDBOX_APP_ANDROID_URL` / `IOS` | (선택) 샌드박스 설치 파일 URL |

샌드박스 앱: [react-native-deploy-app](https://github.com/betterafter/react-native-deploy-app) (`runtimeVersion` **57.0.0**)

---

## 앱 개발자

개발자는 **콘솔 URL** + **배포 토큰**만 있으면 됩니다. 설치 시 `rnd.config.json`이 생깁니다.

### 설치 · 설정

| 명령 | |
|------|--|
| `npm i -D github:betterafter/react-native-deploy` | CLI 설치 (+ config) |
| `npx rnd init` / `--force` / `--api-url …` | config 수동 생성·덮어쓰기 |
| `npx rnd --help` | 전체 도움말 |

`rnd.config.json` — `apiUrl`만 필수(`https://` 생략 OK). `artifact` / `export`는 경로가 다를 때만 수정.

### 토큰

| 명령 | |
|------|--|
| `npx rnd token add` | 토큰 + (필요 시) 콘솔 URL → `~/.rnd/credentials` |
| `npx rnd token add --api-key … --api-url …` | 비대화형 |
| `npx rnd token list` / `remove` | 프로필 목록·삭제 |

### 빌드 · 배포

| 명령 | |
|------|--|
| `npx rnd build` | Android release APK (Expo면 prebuild) |
| `npx rnd deploy -m "…"` | 파일 + 샌드박스 QR |
| `npx rnd deploy --export-only` | 샌드박스만 |
| `npx rnd deploy --skip-export` | 파일만 |
| `npx rnd open` | 콘솔 URL 출력 |

---

## 참고

| Apps in Toss | rnd |
|--------------|-----|
| `ait build` / `deploy` / `token add` | `rnd build` / `deploy` / `token add` |

R2: `apps/{appId}/builds/{buildId}/…` (+ `export/` 샌드박스)

CLI 수정 후: `npm run build:cli`

## License

[Apache-2.0](./LICENSE)
