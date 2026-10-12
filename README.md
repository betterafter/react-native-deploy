# react-native-deploy

셀프호스트 React Native QA 배포 툴. Vercel + R2 무료 티어로 콘솔을 돌리고, CLI로 APK/IPA·샌드박스 QR을 올립니다.  
(스토어 출시용이 아니라 **팀 내부 테스트 배포**용입니다.)

```bash
npm i -D github:betterafter/react-native-deploy
npx rnd init               # rnd.config.json (npm 설치 시 자동 생성되므로 생략 가능)
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

개발자는 **콘솔 URL** + **배포 토큰**만 있으면 됩니다.

### 설치 · 설정

| 명령 | |
|------|--|
| `npm i -D github:betterafter/react-native-deploy` | CLI 설치 (+ config 자동 생성) |
| `pnpm add -D github:betterafter/react-native-deploy` | CLI 설치 (config는 `rnd init`으로) |
| `npx rnd init` / `--force` / `--api-url …` | config 수동 생성·덮어쓰기 |
| `npx rnd init --with-scripts` | `package.json`에 `build` / `deploy` 스크립트까지 추가 |
| `npx rnd --help` | 전체 도움말 |

`rnd build`와 `rnd deploy`는 실행한 폴더가 앱이 아니어도 됩니다. npm, pnpm, Yarn 워크스페이스에서 Expo 또는 `android/`가 있는 React Native 앱이 하나면 그 앱을 사용합니다. 저장소가 pnpm을 쓰더라도 그 컴퓨터에 pnpm이 없으면 npm으로 설치합니다. 앱이 여러 개면 `rnd.config.json`에 `appDir`을 적거나 `npx rnd build --cwd <앱 폴더>`로 지정합니다. Expo 명령은 `npx expo`로 다른 버전을 받지 않고, 그 저장소의 패키지 매니저로 이미 설치된 Expo를 실행합니다. 의존성이 없으면 워크스페이스 루트에서 install을 먼저 합니다. 그 install이 요구하는 Node.js 버전이 지금 버전보다 높으면, 스택 대신 필요한 버전을 출력하고 멈춥니다.

pnpm·Yarn, 그리고 `--ignore-scripts` 설치는 의존성의 `postinstall`을 실행하지 않습니다. 이 경우 `rnd.config.json`이 생기지 않으니 설치 후 `npx rnd init`을 한 번 실행하세요.

`rnd init`은 기본적으로 `rnd.config.json`만 만들고 `package.json`은 건드리지 않습니다. 모노레포 루트에서는 `build` / `deploy`가 보통 워크스페이스로 분기하므로, 덮어쓰기를 원할 때만 `--with-scripts`를 붙이세요.

버전을 고정하려면 태그를 붙여 설치합니다: `npm i -D github:betterafter/react-native-deploy#v0.1.0`

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
| `npx rnd build` | Android release APK. 모노레포면 Expo/RN 앱 폴더를 찾고, 그 프로젝트의 npm·pnpm·yarn으로 prebuild |
| `npx rnd build --cwd apps/mobile` | 앱이 여러 개일 때 폴더를 지정 |
| `npx rnd deploy -m "…"` | APK가 없으면 Android를 찾아 빌드한 뒤, 파일 + 샌드박스 QR |
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
