# 발사탕 앱 (Capacitor)

`balsatang/` 의 웹 화면을 그대로 감싼 안드로이드·iOS 앱 프로젝트입니다.
웹과 앱이 **같은 코드**를 씁니다. 화면을 고칠 일이 있으면 `../balsatang/` 을 고치고 다시 동기화하면 됩니다.

```
balsatang/          ← 원본 (웹사이트도 이걸 씀)
balsatang-app/
  www/              ← 복사본 (자동 생성, 직접 수정 금지)
  android/          ← 안드로이드 프로젝트
  ios/              ← iOS 프로젝트
```

---

## 처음 한 번만 준비하기

### 공통
[Node.js](https://nodejs.org) 설치 후, 이 폴더에서:

```bash
npm install
```

### 안드로이드 (윈도우·맥 모두 가능)
[Android Studio](https://developer.android.com/studio) 를 설치합니다. 설치 마법사가 SDK를 같이 받아줍니다.

### iOS (맥 필요)
1. App Store 에서 **Xcode** 설치
2. CocoaPods 설치
   ```bash
   sudo gem install cocoapods
   ```

---

## 폰에서 실행하기

### 안드로이드

```bash
npm run android
```

Android Studio 가 열립니다. 그다음:

1. USB로 폰을 연결하고, 폰에서 **개발자 옵션 → USB 디버깅**을 켭니다
   *(설정 → 휴대전화 정보 → 빌드번호를 7번 연타하면 개발자 옵션이 나타납니다)*
2. Android Studio 상단에서 연결된 기기를 고릅니다
3. ▶ 버튼을 누릅니다

폰이 없으면 Android Studio 의 에뮬레이터로도 됩니다.

### iOS

```bash
npm run ios
```

Xcode 가 열립니다. 그다음:

1. 왼쪽에서 **App** 프로젝트 → **Signing & Capabilities** 탭
2. **Team** 을 본인 Apple ID 로 지정
   *(무료 계정도 됩니다. 다만 7일마다 다시 설치해야 합니다)*
3. 상단에서 연결된 아이폰을 고르고 ▶ 버튼
4. 처음 실행하면 폰에서 **설정 → 일반 → VPN 및 기기 관리** 에서 개발자를 신뢰해야 합니다

---

## 화면을 고친 뒤

`../balsatang/` 을 수정했다면:

```bash
npm run sync
```

그다음 Android Studio 나 Xcode 에서 다시 ▶ 를 누르면 반영됩니다.

---

## 명령어 정리

| 명령 | 하는 일 |
|---|---|
| `npm run sync` | 웹 코드를 앱으로 복사 + 네이티브 프로젝트 갱신 |
| `npm run android` | 동기화 후 Android Studio 열기 |
| `npm run ios` | 동기화 후 Xcode 열기 |

---

## 앱에만 적용되는 것들

`../balsatang/native.js` 에 있습니다. 웹 브라우저에서는 아무 동작도 하지 않습니다.

- 상태바 색을 배경과 맞춤
- 상태바 높이만큼 상단 여백 추가
- 안드로이드 하드웨어 뒤로가기 — 앱 안에서 한 단계씩 뒤로, 홈에서는 두 번 눌러야 종료
- **어드민(`/admin`)은 앱에 포함하지 않습니다** — 스토어 심사에서 불필요한 관리 기능은 감점 요인입니다

---

## 스토어 제출 전에 해야 할 일

지금 상태는 **웹사이트를 감싼 것**뿐입니다. 이대로 제출하면 애플 심사에서 거절될 가능성이 높습니다.

> **App Store Review Guideline 4.2 (Minimum Functionality)**
> 웹사이트를 단순히 패키징한 앱은 승인되지 않습니다.

통과하려면 앱다운 기능이 필요합니다. 우선순위 순으로:

1. **푸시 알림** — 리콜 발생 시 알림 (발사탕에 가장 자연스러운 기능)
2. **오프라인 조회** — 사료 데이터를 기기에 캐싱
3. **즐겨찾기** — 관심 사료를 기기에 저장
4. **네이티브 공유** — 사료 정보를 카톡 등으로 공유

그 밖에 필요한 것:

- 앱 아이콘 (안드로이드 512×512, iOS 1024×1024)
- 스플래시 화면
- 스토어 스크린샷
- 개인정보처리방침 URL — `butprompter.com/privacy.html` 을 앱 기준으로 보강
