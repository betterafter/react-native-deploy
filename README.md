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

```bash
npm i -D rnd@github:betterafter/react-native-deploy#main:packages/cli
# 또는 로컬 개발 중
npm i -D file:../react-native-deploy/packages/cli
```

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
  }
}
```

예시는 저장소의 [`rnd.config.example.json`](./rnd.config.example.json)을 참고하세요.

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

```bash
npm run build
npx rnd deploy -m "ad size center"
# 또는
npm run deploy -- -m "ad size center"
```

끝나면 콘솔 URL이 출력됩니다. 웹에서 **테스트** → QR로 Ad Hoc / APK 설치.

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
apps/{appId}/builds/{buildId}/manifest.plist   # iOS Ad Hoc
```

---

## 로드맵

- [ ] **출시 요청** → Play / App Store Connect 연동
- [ ] npm에 `rnd` 퍼블리시
- [ ] 앱 키트 패키지에 `rnd` bin 포함 (framework가 `ait`를 실어 나르듯)

## License

[Apache-2.0](./LICENSE)
