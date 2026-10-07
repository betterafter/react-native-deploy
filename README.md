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

## 앱 개발자: 매일 쓰는 흐름

앱인토스의 `npm run build` → `npx ait deploy` 와 같습니다.

```bash
npm run build
npx rnd deploy -m "메모"
```

### 1. CLI 설치 (앱 레포)

앱 루트에 `package.json`이 있는 Node / React Native 프로젝트에서 실행하세요.  
(순수 Android/iOS 네이티브 전용 폴더에는 `package.json`이 없어 `npm i`가 실패합니다.)

```bash
# 권장 — 저장소 루트가 `rnd` CLI로 설치됩니다
npm i -D github:betterafter/react-native-deploy

# pnpm / yarn
pnpm add -D github:betterafter/react-native-deploy
yarn add -D github:betterafter/react-native-deploy

# 이 저장소를 로컬에서 같이 고칠 때
npm i -D file:../react-native-deploy
```

끝나면 앱 루트에서 확인합니다.

```bash
npx rnd --help
```

이 저장소에서 CLI 소스를 고친 뒤에는 `npm run build:cli`로 `packages/cli/dist`를 다시 만들고 커밋하세요. (다른 앱은 빌드된 dist를 그대로 설치합니다.)

```json
{
  "scripts": {
    "build": "… iOS/Android 빌드 …",
    "deploy": "rnd deploy"
  }
}
```

### 2. 앱 루트 설정 `rnd.config.json`

```json
{
  "appId": "my-app",
  "bundleId": "com.example.app",
  "apiUrl": "https://your-console.vercel.app",
  "artifact": {
    "ios": "./build/App.ipa",
    "android": "./android/app/build/outputs/apk/release/app-release.apk"
  },
  "export": "./dist",
  "expoExport": true
}
```

예시는 저장소의 [`rnd.config.example.json`](./rnd.config.example.json)을 참고하세요.  
`expoExport`는 샌드박스용으로 `expo export`를 배포 전에 돌릴지입니다. Expo 프로젝트면 기본이 켜져 있어서 보통 적지 않아도 됩니다.

### 3. API 토큰 한 번만 저장

콘솔의 `DEPLOY_API_TOKEN`과 같은 값을 로컬에 둡니다.

```bash
npx rnd token add
# → ~/.rnd/credentials  (권한 0600, git에 안 올라감)

npx rnd token list
npx rnd token remove          # default 프로필
npx rnd token add staging --api-key '…'
npx rnd deploy --profile staging
```

우선순위: `--token` → `RND_API_TOKEN` 환경변수 → `~/.rnd/credentials` 프로필

### 4. 배포

`npx expo export`는 앱 JS·자산을 폴더로 뽑는 Expo 명령입니다. 샌드박스 QR은 이 결과물을 올립니다.  
**Expo 앱에서는 `rnd deploy`가 이걸 기본으로 실행**하므로 따로 칠 필요 없습니다.

```bash
npm run build                 # IPA/APK (있을 때)
npx rnd deploy -m "홈 화면"   # 설치 업로드 + expo export + 샌드박스 QR 업로드
```

- IPA/APK → 설치용 QR (iOS / Android)
- `expo export` 결과 → 샌드박스 QR (QR 테스트)

| 설정 / 플래그 | 동작 |
|---------------|------|
| (기본, Expo 프로젝트) | `expo export` 실행 후 artifact + sandbox 둘 다 |
| `expoExport: false` | export 명령을 안 돌림 (기존 `./dist`만 사용) |
| `--skip-expo-export` | 위와 같음 (한 번만) |
| `--skip-export` | 설치 파일만 |
| `--export-only` | 샌드박스만 (`expo export` 포함) |

샌드박스 QR은 스캔한 뒤 앱을 완전히 종료하고 다시 열면 로드됩니다. export는 샌드박스와 같은 Expo SDK 57로 맞춥니다.

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
