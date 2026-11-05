# Google Maps 연결하기

## 1. 예상 사용량과 비용
현재 공식 글로벌 요금표에서 웹의 Dynamic Maps는 매월 10,000회 지도 로드까지 무료입니다. 두 사람이 개인 여행 계획에 쓰는 수준이라면 무료량 안일 가능성이 높습니다. 예를 들어 두 사람 합쳐 하루 20회 지도를 새로 만들면 30일에 약 600회입니다. 이는 사용 패턴을 가정한 예시이며 실제 사용량은 Google Cloud 콘솔에서 확인해야 합니다.

- 처음 여행 지도를 열거나 일정 추가/수정 창을 열면 새 지도 인스턴스를 생성합니다. 새로고침과 여행 재진입도 새 로드가 될 수 있습니다.
- 같은 화면에서 날짜 변경, 카드 선택, 핀 선택, 확대·축소 시에는 지도 인스턴스를 다시 만들지 않습니다.
- SDK 스크립트는 페이지에서 한 번만 가져옵니다. 스크립트 요청 횟수와 과금 대상 지도 로드 횟수는 서로 다릅니다.
- 이번 변경은 Google 지도 표시만 사용합니다. 장소 검색은 기존 Photon을 유지하며 Google Places·Routes·Street View API는 호출하지 않습니다.
- 무료량은 결제 계정의 다른 프로젝트 사용량과 요금 변경의 영향을 받을 수 있습니다. 무조건 0원이라고 보장하지 않습니다.

공식 문서:
- https://developers.google.com/maps/billing-and-pricing/pricing
- https://developers.google.com/maps/documentation/javascript/usage-and-billing

## 2. Google Cloud 설정
1. https://console.cloud.google.com/ 에서 개인 Google 계정으로 로그인합니다.
2. 호랑나비용 프로젝트를 만들고 결제 계정/결제 수단을 연결합니다. 이 작업은 사용자가 직접 해야 합니다.
3. API 라이브러리에서 **Maps JavaScript API**를 사용 설정합니다. 현재 구현에는 Places API나 Routes API가 필요하지 않습니다.
4. 사용자 인증 정보에서 API 키를 만듭니다.
5. 키의 **애플리케이션 제한사항**을 웹사이트(HTTP 리퍼러)로 설정하고 개발용 주소를 추가합니다.

```text
http://localhost:5173/*
http://127.0.0.1:5173/*
```

`npm.cmd run preview`도 사용할 경우 4173 포트의 두 주소를 별도로 추가합니다. Vite가 다른 포트를 사용하면 그 포트도 추가해야 합니다.

6. **API 제한사항**에서 Maps JavaScript API만 허용합니다.
7. GitHub Pages 배포 시 실제 사이트 호스트를 추가합니다. 예: `https://YOUR_NAME.github.io/*`. 이 앱의 referrer 정책과 브라우저가 Google 요청에서 경로를 생략할 수 있으므로 저장소 경로만 허용하는 규칙은 피합니다. [배포 안내](GITHUB_PAGES_SETUP.md)에 GitHub Secret과 Map ID 설정 순서가 있습니다.

웹 지도용 API 키는 브라우저 요청과 빌드 결과에 노출되는 구조입니다. 키를 숨기는 것보다 허용 웹사이트와 API 제한이 필수입니다. 서비스 계정 키나 비공개 서버 자격 증명을 여기에 넣으면 안 됩니다. API 키를 채팅에 보내지 않아도 됩니다.

## 3. 로컬 프로젝트에 키 넣기
PowerShell에서 프로젝트 폴더로 이동하고, **처음 한 번만** 예시 파일을 복사하세요. 이미 `.env.local`이 있으면 덮어쓰지 말고 기존 파일을 편집합니다.

```powershell
cd C:\Users\ct06\vscode-repos\horangnabi\horangnabi-v2
Copy-Item .env.example .env.local
notepad .env.local
```

다음과 같이 발급받은 키를 넣고 저장합니다.

```dotenv
VITE_GOOGLE_MAPS_API_KEY=YOUR_BROWSER_API_KEY
VITE_GOOGLE_MAP_ID=DEMO_MAP_ID
```

`DEMO_MAP_ID`는 Google이 제공하는 로컬 테스트용 지도 ID입니다. 배포 전에 Google Maps Platform의 지도 관리에서 **JavaScript용 Map ID**를 생성하여 그 값으로 바꾸세요. API 키와 Map ID는 다른 값입니다. 번호 핀은 Advanced Markers를 사용하므로 Map ID가 필요합니다.

`.env.local`은 `.gitignore`의 `*.local` 규칙으로 버전 관리에서 제외됩니다. 키가 빈 상태면 기존 무료 지도가 표시되고, 아직 Google 지도 연결 전이라는 안내가 나옵니다. 키를 넣은 뒤에는 오류가 나도 다른 제공자로 몰래 전환하지 않으며 일정 편집은 계속 가능합니다.

실행 중인 서버를 Ctrl+C로 종료한 뒤 다시 시작하세요. 환경 변수 변경은 새로고침만으로 반영되지 않습니다.

```powershell
npm.cmd run dev
```

배포 파일을 사용할 경우 키 변경 후 `npm.cmd run build`를 다시 실행해야 합니다. GitHub Actions 배포에서는 두 `VITE_` 환경 변수도 빌드 단계에 공급해야 합니다.

## 4. 사용량 확인과 제한
- Google Cloud 결제 메뉴에서 작은 금액의 예산 알림을 설정하세요. **예산 알림은 과금을 자동으로 중지하는 장치가 아닙니다.**
- Maps JavaScript API의 사용량·할당량 메뉴에서 지원되는 제한과 알림을 설정하고 실제 지도 로드를 확인하세요. 월 무료량과 분당 요청 제한은 다릅니다.
- 로컬 브라우저 카운터는 두 사람/다른 기기의 총 사용량을 보장할 수 없으므로 과금 차단 장치로 구현하지 않았습니다.
- 필요 없을 때 API 키를 사용 중지하면 추가 사용을 막을 수 있지만 Google 지도도 표시되지 않습니다.

## 5. 정상 연결 확인
1. 여행을 열었을 때 Google 로고/저작권 표시가 보이고 한국어 설정 지도가 나오는지 확인합니다. 일부 지명은 Google 데이터에 따라 현지어가 남을 수 있습니다.
2. 카드 선택 → 해당 장소 이동·확대, 핀 선택 → 카드로 스크롤을 확인합니다.
3. 날짜 변경 및 전체 장소 보기, 일정 순서 변경 후 번호 갱신을 확인합니다.
4. 일정 추가 창에서 지도 클릭 선택 및 Photon 검색 결과 선택 후 저장을 확인합니다.

회색 지도·인증 오류가 나면 API 사용 설정, 결제 계정, 웹사이트 제한의 주소/포트, API 키 값, Map ID를 확인하세요. 키 제한 변경은 반영에 시간이 걸릴 수 있습니다. 설정을 고친 뒤 브라우저를 새로고침합니다. Google 저작권 표시와 로고를 가리거나 제거하지 마세요.

공식 설정 문서:
- https://developers.google.com/maps/documentation/javascript/get-api-key
- https://developers.google.com/maps/documentation/javascript/advanced-markers/start
- https://developers.google.com/maps/documentation/javascript/localization
- https://cloud.google.com/billing/docs/how-to/budgets
