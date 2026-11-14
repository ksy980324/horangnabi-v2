# Google 추천 장소

## 동작
추천 카드에는 긴 주소를 표시하지 않는다. 지도 핀·저장할 장소의 주소/좌표와 Google 지도 링크는 유지한다. 현재 요청에는 장소별 소개가 없으며 editorialSummary/generativeSummary는 Enterprise + Atmosphere 필드이므로 이번 변경에서는 요청하지 않는다. 이는 요약이 항상 유료라는 뜻이 아니라 기존 요금 등급·무료량 관리 방식을 유지하기 위한 선택이다.

여행 상세 → 추천 장소에서 관광지·맛집·카페를 고른 뒤 주변 추천 찾기를 누른다. 추천 기준 날짜 선택은 제공하지 않는다. 조회 시점의 기기 현지 날짜를 기준으로 오늘의 마지막 좌표가 있는 일정, 여행 도시, 다른 날짜의 일정 순서로 기준점을 정한다. 여행 전 조회는 보통 여행 도시가 기준이다. 주변 5km에서 Google 인기도순으로 최대 20곳을 한 번 조회하고, 6곳씩 최대 4페이지로 표시한다. Google Nearby Search에는 다음 페이지 토큰이 없으므로 20곳을 넘겨 계속 조회하는 기능은 아니다. 일정 추가 대상은 추천을 열기 전 보고 있던 여행 날짜이며 추가 버튼에 월·일을 표시한다. 일본 외 국가도 같은 방식이다. 사진이 있는 장소는 화면 가까이 왔을 때 사진 한 장을 조회하며 저작자·제공된 원본 링크를 표시한다. 사진 없는 장소는 안내를 표시한다.

Google의 한국어 장소명이 있으면 그대로 표시한다. 외국어 이름은 기존에도 사용하던 무료 MyMemory API로 순서대로 번역하며 원문을 작은 글씨로 함께 표시한다. 영문 이름은 영어를 기본으로 번역하고 태국·일본·중국·아랍·키릴 문자는 문자 종류로 원문 언어를 보완한다. 언어 판별과 고유명사 번역이 틀릴 수 있어 원문을 병기한다. 결과와 사진은 번역을 기다리지 않고 표시한다. 추천 창 맨 위의 Google 지도는 현재 페이지의 번호 핀을 표시한다. 장소 이름을 누르면 지도에서 강조하고, 핀을 누르면 해당 카드로 이동한다. 페이지 이동·번역에는 지도 인스턴스를 다시 생성하지 않는다. 추천 창을 열 때 지도 로드가 한 번 추가되며 기존 지도 일일 한도의 적용을 받는다. 이전 페이지의 사진은 창을 닫을 때까지 화면 메모리에 유지하여 이전/다음으로 돌아갈 때 같은 사진을 다시 요청하지 않는다. 미방문 페이지의 사진·번역은 미리 요청하지 않는다. 같은 조회 안의 중복 이름은 한 번만 번역하며 새 조회·분류 변경·창 닫기에 이전 번역을 취소한다. 번역 실패·무료 한도 소진에는 원문을 유지하며 검색·일정 추가를 막지 않는다. 번역된 이름이 표시된 상태에서 추가하면 그 이름으로 저장하되 원래 지도 링크·Place ID·좌표는 유지한다. 번역은 공식 명칭을 보장하지 않는다.

MyMemory 익명 무료량은 하루 5,000자다. 한 이름 500바이트 이하, 한 조회 최대 6곳, 순차 요청과 300ms 간격, 개별 5초/전체 15초 제한을 사용한다. 유료 번역 키·Google Translation API는 추가하지 않는다. 번역에는 공개 장소 이름·언어만 보내고 주소·좌표·여행명·메모·계정 토큰은 보내지 않는다. 제공자는 입력문과 접속 정보를 처리·보관할 수 있다. 안내: https://mymemory.translated.net/doc/usagelimits.php , https://mymemory.translated.net/terms-and-conditions .

일정 또는 보관함에 사용자가 선택한 장소를 추가한다. 공유 여행의 기존 revision 검사와 저장 경로를 사용하며 저장 실패를 성공으로 표시하지 않는다. 추천 사진·평점·응답 원본은 Firestore/localStorage/백업/서비스 워커에 저장하지 않는다. 창을 닫으면 사진 객체 URL을 해제한다. 조회 당시 이미 담은 이름·동일 지도 링크는 제외한다. 조회 후 추가한 카드는 페이지가 밀리지 않도록 유지하고 추가 완료로 표시한다. 다른 언어로 저장된 별칭은 중복 감지에서 빠질 수 있다.

## 비용 제한
- Nearby Search (New)의 평점·리뷰 수 필드는 Enterprise 요청이다. 검색 월 1,000회, Place Details Photos 월 1,000회가 현재 글로벌 무료 구간이다. 지도 로드 무료량과 별개다.
- 이 앱 서버는 검색과 사진 각각 전체 사용자 합계 **UTC 하루 25회, UTC 월 800회**까지만 예약한다. 단일 Durable Object의 영구 트랜잭션으로 동시 요청을 원자적으로 제한한다. Google 요청 전 예약하며 실패도 차감하고 자동 재시도·환불하지 않는다.
- UTC/Pacific 월 경계 차이를 고려해도 하루 25회는 연속 32개 UTC 날짜에 최대 800회다. 이는 해당 서버 경유 요청의 상한이며 전체 결제 계정 사용량을 조회하는 기능은 아니다.
- Google 무료량은 같은 결제 계정의 다른 프로젝트·키 사용과 합산될 수 있다. 이번 달 다른 사용을 확인하고 검색·사진 각각 800회 이상 무료량이 남은 경우에 활성화한다. 이 키를 다른 앱에 사용하지 않는다. API 키 유출, 외부 직접 호출, 카운터 삭제·이름 변경·새 namespace 배포, 요금 정책 변경까지 비용 0원을 보장하지 않는다.
- 브라우저 localStorage 카운터나 예산 알림만으로 차단하지 않는다. Google Console의 실제 제공되는 메서드별 quota도 함께 낮추고 사용량을 확인한다. 월별 무료 한도 도달이 자동 결제 차단은 아니다.
- 인증 실패, 카운터 저장 실패, 서버 설정 누락 시 Google를 호출하지 않는다. 한도 도달은 429, 설정 누락은 503이다. 추천 실패가 일정 편집에 영향을 주지 않는다.
- Cloudflare Workers **Free** 요금제를 유지한다. SQLite Durable Objects는 Free에서 사용할 수 있다. 유료 플랜으로 전환하지 않는다.

## 최초 활성화 — 사용자 설정 필요

### 1. Google Cloud
1. 기존 Google Cloud 프로젝트에서 **API 및 서비스 → 라이브러리 → Places API (New)** 를 찾아 사용 설정한다. 결제 계정은 필요하며 기존 Maps JavaScript API와 별도 사용량이다.
2. **사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키**로 서버 전용 키를 만든다.
3. API 제한은 **Places API (New)만** 선택한다. 기존 브라우저 지도 키와 분리한다.
4. 이 서버 키에는 웹사이트(HTTP 리퍼러) 제한을 적용하지 않는다. Cloudflare Worker가 서버에서 요청하기 때문이다. Cloudflare 기본 Worker의 출발 IP는 고정되어 있지 않으므로 임의 IP를 넣지 않는다. 키는 다음 Worker secret에만 넣고 GitHub Secret이나 VITE 변수, 채팅에 넣지 않는다.
5. 사용량 화면에서 이번 달 Nearby Search Enterprise와 Place Details Photos의 사용량을 확인한다. 무료량이 각각 800회 미만 남았다면 활성화를 미루거나 서버 상한을 남은 양보다 작게 수정해 배포한다.

### 2. PowerShell
저장소 최신 코드를 받은 다음 프로젝트 폴더에서 실행한다.

~~~powershell
cd C:\Users\ct06\vscode-repos\horangnabi\horangnabi-v2
npx.cmd wrangler login
npx.cmd wrangler secret put GOOGLE_PLACES_API_KEY --config workers/maps-link/wrangler.jsonc
npx.cmd wrangler deploy --config workers/maps-link/wrangler.jsonc
~~~

secret value 질문에는 방금 만든 **서버 전용 Places API 키**를 붙여넣는다. 입력한 키는 채팅에 보내지 않는다. Worker 이름과 주소는 기존 지도 공유 링크/항공편 서버를 그대로 유지한다. 기존 INCHEON_FLIGHT_SERVICE_KEY는 삭제하지 않는다. deploy에 추가한 SQLite migration이 사용량 저장소를 자동 생성하므로 테이블을 직접 만들 필요 없다. Cloudflare 로그인이 만료되었다면 첫 명령의 브라우저 인증을 완료한다.

wrangler.jsonc의 FIREBASE_PROJECT_ID는 현재 앱 프로젝트 horangnami-2f9fd다. 다른 Firebase 프로젝트를 쓰면 반드시 바꾼다. Firebase ID 토큰의 Google 서명·발급자·대상 프로젝트·만료를 서버에서 검증한다. 로그인한 같은 Firebase 프로젝트 사용자만 요청할 수 있으며 CORS만으로 인증을 대신하지 않는다.

### 3. GitHub Pages
기존 Actions Variable **MAPS_LINK_RESOLVER_URL**(끝에 /resolve)이 이미 있으므로 새 GitHub 키를 등록할 필요 없다. 앱은 같은 서버의 /recommendations, /recommendation-photo를 사용한다. 브라우저 지도 API 키의 허용 API에 Places를 추가하지 않는다. 사이트 코드는 Pages에 배포되지만 Worker 코드는 위 deploy로 별도 배포한다.

공유 여행에서 추천을 조회한다. 설정 안내가 나오면 Worker 배포·secret·API 활성화·키 제한을 확인한다. 429 안내는 앱 전체 한도 또는 Google quota일 수 있다. 설정 완료 전에는 실제 추천이 나오지 않는다.

## 개인정보·표시
검색 기준 좌표·분류·언어만 Google에 보내며 여행명·메모·참여자 닉네임은 보내지 않는다. Firebase 로그인 토큰은 Worker 인증에만 사용한다. 사진 저작자와 Google Maps 출처 표시는 삭제하지 않는다. 결과가 Google 지도에 표시된다면 Google 지도만 사용한다. 추천 화면은 목록으로 표시한다. 공개 이용 안내는 public/places-terms.html이다.

## 검증과 제약
단위 테스트는 실제 유료 API 대신 모의 Google 응답과 자체 RSA 서명 토큰을 사용한다. 인증 거부·원자적 일/월 제한·한도 초기화·Google 호출 전 차단·사진 전달·실패 시 자동 재시도 없음·백업 호환성을 검사한다. 실제 Google 결과·사진 품질·휴대폰 화면·두 계정 동기화는 별도 확인해야 한다. Places 활성화/서버 키가 없으면 검증했다고 보고하지 않는다.

## 공식 문서
- https://developers.google.com/maps/billing-and-pricing/pricing
- https://developers.google.com/maps/documentation/places/web-service/nearby-search
- https://developers.google.com/maps/documentation/places/web-service/place-photos
- https://developers.google.com/maps/documentation/places/web-service/policies
- https://developers.cloudflare.com/durable-objects/platform/pricing/

## 조회 오류 확인
설정 화면이 정상이어도 Worker secret에 다른 키가 등록되었거나, 결제·서버 저장소·연결 문제가 있을 수 있다. 앱은 Google 응답의 HTTP 상태와 허용한 오류 코드만 표시한다. SERVICE_DISABLED는 키 프로젝트의 API 활성화, API_KEY_SERVICE_BLOCKED는 키의 API 허용, BILLING_DISABLED는 결제 연결을 뜻한다. BUDGET_UNAVAILABLE은 서버 사용량 저장소 실패로 Google 호출 전 차단한 상태다. 원본 오류 메시지·키·프로젝트 메타데이터는 노출하지 않는다. 기존 Maps JavaScript API의 지도 로드 일/분 제한은 Places API (New)의 주변 검색 한도와 별개다.

Cloudflare Workers의 fetch는 redirect:error를 지원하지 않으므로 서버 요청은 manual을 사용하고 3xx를 실패 처리한다. Node에서 통과하는 옵션도 실제 Worker에서는 요청 전 예외가 날 수 있다. GOOGLE_UNAVAILABLE은 네트워크 장애뿐 아니라 요청 생성·응답 처리 예외도 포함한다. 이 오류만 보고 API 제한을 해제하거나 사용량 카운터를 초기화하지 않는다.

## 20곳 조회 서버 갱신
기존 Worker는 최대 6곳을 반환한다. 웹사이트 업데이트만으로는 결과가 늘어나지 않으며, 20곳 조회 코드를 기존 Worker에 게시해야 한다. 기존 secret·namespace·global-v1 ID와 카운터는 그대로 유지한다.

~~~powershell
cd C:\Users\ct06\vscode-repos\horangnabi\horangnabi-v2
npx.cmd wrangler@latest login --device
npx.cmd wrangler deploy --config workers/maps-link/wrangler.jsonc
~~~

이미 Cloudflare 로그인이 유효하면 첫 로그인 명령은 생략할 수 있다. 새 API 키나 Firebase 규칙 변경은 필요 없다. 현재 서버의 X-Horangnabi-Recommendations 응답 헤더가 4이면 20곳 조회 버전이다. 실제 결과가 6곳 이하이거나 이미 담은 장소를 제외해 6곳 이하이면 페이지 버튼은 표시되지 않는다.
