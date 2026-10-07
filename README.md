# react-native-deploy

## 소개

**가난한 개발자를 위한, 무료로 쓸 수 있는 React Native 빌드·배포 툴**입니다.

Expo EAS나 상용 배포 서비스는 편하지만, 클라우드 빌드·시트 한도에 돈이 들기 쉽습니다.  
앱인토스처럼 `build` 한 번 → `deploy` 한 번으로 QA 빌드를 올리고 QR로 깔게 하고 싶은데,  
그 “콘솔 + CLI”를 **내가 호스팅하면 과금 없이** 굴릴 수 있게 만들었습니다.

- 콘솔은 Vercel + Cloudflare R2 같은 **무료 티어**로 운영
- CLI는 로컬/CI에서 IPA·APK만 올리면 됨
- DB 없이 R2에 메타·바이너리 저장
- API 토큰은 `rnd token add`로 로컬에 저장 (`ait token add`와 같은 패턴)

> 스토어 심사·정식 출시까지 자동으로 대신해 주는 만능 도구는 아닙니다.  
> **팀 내부 테스트 배포를 싸게, 단순하게** 만드는 게 목표입니다.

---

## 앱 개발자

앱 루트에 `package.json`이 있는 Node / React Native 프로젝트에서 사용합니다.  
(순수 Android/iOS 전용 폴더에는 `package.json`이 없어 `npm i`가 실패합니다.)

### 최소 명령어 (이걸로 배포 성공)

앱인토스의 `build` → `deploy`와 같은 뼈대입니다. **최초 1회 세팅 + 이후 반복**만 기억하면 됩니다.

```bash
npm i -D github:betterafter/react-native-deploy
npx rnd token add
npm run build                 
npx rnd deploy -m "홈 화면" 
```

Expo만 샌드박스 QR로 빠르게 볼 때는 설치 파일 없이:

```bash
npx rnd deploy --export-only -m "JS만 테스트"
```

전제: 팀이 콘솔을 이미 호스팅해 두었고, 개발자는 **콘솔 URL**과 **배포 토큰**만 알고 있으면 됩니다.

---

### 설치 · 설정

| 명령 | 설명 |
|------|------|
| `npm i -D github:betterafter/react-native-deploy` | CLI 설치. `postinstall`으로 `rnd.config.json` 생성 |
| `pnpm add -D github:betterafter/react-native-deploy` | pnpm |
| `yarn add -D github:betterafter/react-native-deploy` | yarn |
| `npm i -D file:../react-native-deploy` | 이 저장소를 로컬에서 붙일 때 |
| `npx rnd init` | config가 없을 때 수동 생성 (이미 있으면 스킵) |
| `npx rnd init --force` | config 덮어쓰기 |
| `npx rnd init --api-url https://…` | 생성하면서 `apiUrl`까지 넣기 |
| `npx rnd --help` | 전체 명령 목록 |

자동 생성된 `rnd.config.json` 예:

```json
{
  "appId": "my-app",
  "bundleId": "com.example.app",
  "apiUrl": "https://YOUR_CONSOLE_URL",
  "artifact": {
    "ios": "./build/App.ipa",
    "android": "./android/app/build/outputs/apk/release/app-release.apk"
  },
  "export": "./dist",
  "expoExport": true
}
```

| 필드 | 누가 손대나 |
|------|-------------|
| `apiUrl` | **필수** — 호스팅한 콘솔 URL |
| `appId` / `bundleId` | 보통 자동. 틀리면만 수정 |
| `artifact` | IPA/APK 경로가 기본과 다를 때만 |
| `expoExport` / `export` | Expo면 기본값 그대로인 경우가 많음 |

이 저장소에서 CLI 소스를 고친 뒤에는 `npm run build:cli`로 `packages/cli/dist`를 다시 만들고 커밋하세요.

---

### 토큰

토큰은 git에 올리지 않고 로컬(`~/.rnd/credentials`, 권한 0600)에만 둡니다.  
값은 콘솔 env의 `DEPLOY_API_TOKEN`과 같아야 합니다.

| 명령 | 설명 |
|------|------|
| `npx rnd token add` | 기본 프로필에 토큰 저장 (대화형 입력) |
| `npx rnd token add --api-key '…'` | 인자로 바로 저장 |
| `npx rnd token add staging` | `staging` 프로필로 저장 |
| `npx rnd token list` | 프로필 이름만 나열 (토큰 값은 안 보여 줌) |
| `npx rnd token remove` | default 프로필 삭제 |
| `npx rnd token remove staging` | 해당 프로필 삭제 |

배포 시 토큰 찾는 순서: `--token` → 환경변수 `RND_API_TOKEN` → `~/.rnd/credentials` 프로필  
프로필을 쓰려면: `npx rnd deploy --profile staging`

---

### 빌드 · 배포

| 명령 | 설명 |
|------|------|
| `npm run build` | 앱 레포의 빌드 스크립트 (IPA/APK). 프로젝트마다 다름 |
| `npx rnd deploy -m "메모"` | 기본 배포. 설치 파일 + (Expo면) `expo export` 후 샌드박스 QR |
| `npm run deploy` | `package.json`에 넣어진 경우 `rnd deploy` 별칭 |
| `npx rnd deploy -f ./app.apk` | config의 artifact 대신 파일 직접 지정 |
| `npx rnd deploy --export-only -m "…"` | 샌드박스 QR만 (설치 파일 없음) |
| `npx rnd deploy --skip-export` | 설치 파일만 (샌드박스 생략) |
| `npx rnd deploy --skip-expo-export` | 이미 있는 `./dist`만 쓰고 `expo export`는 안 돌림 |
| `npx rnd upload …` | `deploy`와 동일 |
| `npx rnd open` | config의 콘솔 URL 출력 |

`npx expo export`는 JS·자산을 폴더로 뽑는 Expo 명령입니다. 샌드박스 QR은 이 결과물을 올립니다.  
**Expo 앱에서는 `rnd deploy`가 기본으로 export를 실행**하므로 따로 칠 필요가 없습니다.

| 설정 / 플래그 | 동작 |
|---------------|------|
| (기본, Expo) | `expo export` 후 artifact + sandbox 둘 다 |
| `expoExport: false` | export 명령을 안 돌림 (기존 `./dist`만) |
| `--skip-expo-export` | 위와 같음 (한 번만) |
| `--skip-export` | 설치 파일만 |
| `--export-only` | 샌드박스만 |

- IPA/APK → 설치용 QR  
- export → 샌드박스 QR 테스트 (SDK / `runtimeVersion`은 샌드박스와 맞출 것, 현재 **57.0.0**)

---

## 콘솔 운영자: 한 번만 세팅

토스가 콘솔을 대신 돌려 주듯, **대시보드는 팀이 한 번 호스팅**하면 됩니다.  
매 배포마다 `npm run dev` 할 필요 없습니다.

```bash
git clone https://github.com/betterafter/react-native-deploy.git
cd react-native-deploy
cp .env.example apps/web/.env.local
npm install
npm run dev          # 로컬 확인
# 이후 apps/web 을 Vercel 등에 배포
```

### 콘솔 env

| 변수 | 설명 |
|------|------|
| `APP_BASE_URL` | 콘솔 공개 URL |
| `DEPLOY_API_TOKEN` | CLI가 쓰는 Bearer 토큰 |
| `R2_ACCOUNT_ID` | Cloudflare 계정 ID |
| `R2_ACCESS_KEY_ID` | R2 액세스 키 |
| `R2_SECRET_ACCESS_KEY` | R2 시크릿 |
| `R2_BUCKET` | 버킷 이름 |
| `R2_PUBLIC_BASE_URL` | 객체 공개/CDN 베이스 URL |
| `DEFAULT_APP_ID` | (선택) UI 기본 앱 id |
| `DEFAULT_IOS_BUNDLE_ID` | (선택) CLI에 bundle id 없을 때 |
| `SANDBOX_APP_ANDROID_URL` | (선택) Android 샌드박스 APK 공개 URL. 띠 이름은 파일 이름 |
| `SANDBOX_APP_IOS_URL` | (선택) iOS 샌드박스 IPA 공개 URL. Apple Developer 계정으로 서명한 파일 |

메타·파일은 전부 R2. **DB 없음.**

---

## Apps in Toss 와의 대응

| Apps in Toss | react-native-deploy |
|--------------|---------------------|
| `npm run build` / `ait build` | 앱의 `npm run build` (IPA/APK) |
| `npx ait deploy` | `npx rnd deploy` |
| `ait token add` | `rnd token add` → `~/.rnd/credentials` |
| 토스 콘솔 + QR | 셀프호스트 Next 콘솔 + QR |
| 토스가 호스팅 | Vercel + R2 등 무료 티어로 직접 호스팅 |

---

## R2 레이아웃

```
apps/{appId}/index.json
apps/{appId}/builds/{buildId}/meta.json
apps/{appId}/builds/{buildId}/{file}
apps/{appId}/builds/{buildId}/export/          # Expo export for sandbox QR
apps/{appId}/builds/{buildId}/manifest.plist   # iOS Ad Hoc
```

---

## 샌드박스 앱

[react-native-deploy-app](https://github.com/betterafter/react-native-deploy-app)은 폰에 한 번 설치하는 샌드박스입니다. Expo Go가 카메라·위치·알림처럼 Expo SDK 네이티브를 미리 넣어 두는 것과 같이, [Expo Go(SDK 57)에 들어 있는 네이티브 모듈](https://github.com/expo/expo/blob/sdk-57/apps/expo-go/package.json)을 설치본에 담습니다. 런타임 버전은 `57.0.0`입니다.

QR 테스트는 이 샌드박스가 설치된 폰에서만 동작합니다. 콘솔 QR을 스캔하면 샌드박스 목록에 저장되고, 목록에서 누르면 Expo Updates로 그 화면을 실행합니다. 실행 중 목록으로 돌아가려면 `rnd-sandbox://home` 링크를 엽니다. 샌드박스가 없으면 각 프로젝트의 APK·IPA QR로 설치해 테스트합니다.

샌드박스에 없는 자체 네이티브가 프로젝트에 추가되면, 그 기능은 지금 설치된 샌드박스 안에서 동작하지 않습니다. 그 배포는 프로젝트 설치 파일로 확인하거나, 그 네이티브가 포함된 샌드박스를 다시 만들어 설치합니다. QR 테스트를 쓰려면 아래 설정이 반영된 샌드박스를 다시 빌드해 설치해야 합니다.

### 설치 파일을 Cloudflare에 연결

이미 콘솔에 쓰는 R2 버킷에 설치 파일을 올리고, 공개 URL을 콘솔에 연결합니다. 띠에 나오는 이름은 환경변수로 따로 적지 않습니다. Android URL 파일 이름에서 확장자를 뺀 값이고, Android 주소가 없으면 iOS 파일 이름을 씁니다.

1. [react-native-deploy-app](https://github.com/betterafter/react-native-deploy-app)에서 설치 파일을 만듭니다. 방법은 그 저장소 README에 있습니다.
2. 테스터에게 보일 이름으로 R2에 올립니다. 예: `MySandBox.apk`, `MySandBox.ipa`
3. 콘솔 환경변수에 플랫폼별 공개 URL을 넣습니다. `R2_PUBLIC_BASE_URL`과 같은 공개 주소입니다.

```bash
SANDBOX_APP_ANDROID_URL=https://pub-xxxxx.r2.dev/MySandBox.apk
SANDBOX_APP_IOS_URL=https://pub-xxxxx.r2.dev/MySandBox.ipa
```

콘솔을 다시 배포하면 상단 띠에 **MySandBox을 설치해서 간편하게 테스트해보세요!** 와 **Android 다운로드**, **iOS 다운로드**가 나옵니다. 주소가 있는 플랫폼 버튼만 보입니다.

띠 안내 문구는 두 가지 테스트 방법을 알려 줍니다.

- 샌드박스가 폰에 있으면 그 안에서 테스트합니다.
- 없으면 아래 빌드 목록의 **테스트**로 그 앱의 설치 파일을 받아 확인합니다.

iOS 샌드박스 설치본은 Apple Developer 계정으로 서명해야 다른 아이폰에 설치됩니다. 계정이 없으면 `SANDBOX_APP_IOS_URL`을 비우고, Android 샌드박스나 각 빌드의 설치 파일로 테스트합니다. 두 주소가 모두 없으면 띠는 나오지 않습니다. 예전 `SANDBOX_APP_URL` 하나만 있으면 확장자로 Android(`.apk`, `.aab`)와 iOS(`.ipa`)를 구분합니다.

---

## 로드맵

- [ ] **출시 요청** → Play / App Store Connect 연동
- [ ] npm에 `rnd` 퍼블리시 (지금은 `github:betterafter/react-native-deploy`로 설치)
- [ ] 앱 키트 패키지에 `rnd` bin 포함 (framework가 `ait`를 실어 나르듯)

## License

[Apache-2.0](./LICENSE)
