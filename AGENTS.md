# Horangnabi v2

## Start here
- 작업 시작 전에 이 파일과 `docs/PRODUCT_SPEC.md`, `docs/PROGRESS.md`를 읽는다.
- 이 폴더 바깥의 기존 프로젝트 파일은 수정하거나 삭제하지 않는다.

## Goal
두 사람이 휴대폰에서 함께 쓰는 광고 없는 개인 여행 플래너. 앱 이름은 호랑나비, 패키지 이름은 horangnabi-v2. 무료 운영과 지도·일정 연동이 우선이다.

## Rules
- React + TypeScript + Vite, strict TypeScript 유지. 파일·폴더·식별자는 영문, 한국어는 UI 및 사용자 데이터에만 사용하고 UTF-8로 저장한다.
- 모바일 우선 반응형 UI. 흰색·연회색 배경, 네이비 텍스트, 청록 포인트를 유지한다.
- 동작하지 않는 버튼, 광고, 상품 추천을 추가하지 않는다. 사용자가 승인한 Google Maps JavaScript API 외의 과금 API는 임의로 추가하지 않는다.
- 기본 지도 목표는 한국어 설정의 Google Maps이다. `VITE_GOOGLE_MAPS_API_KEY`가 있을 때 Google Maps, 없을 때 MapLibre GL JS + OpenFreeMap으로 실행한다. 지도 제공자 로고와 출처 표시를 제거하지 않는다. Google 키의 허용 웹사이트 및 API 제한을 문서화한다.
- Google Places/Routes/Street View는 현재 사용하지 않는다. 장소 검색은 Photon을 유지한다. Google Maps 스크립트 중복 로드와 날짜·선택 변경 시 불필요한 지도 인스턴스 생성을 피한다. 무료량과 결제 설정은 `docs/GOOGLE_MAPS_SETUP.md`를 참고한다.
- 검색은 명시적 제출만 허용한다. 입력 자동 요청 금지. 요청 제한, 캐시, 타임아웃, 오류 처리를 유지한다. 제공자 정책 변경을 확인한다.
- 지도/검색 실패가 일정 편집을 막으면 안 된다. 좌표 없는 일정을 지원한다.
- LAN HTTP에서 crypto.randomUUID가 없을 수 있으므로 ID는 data.ts의 uid를 사용한다. getRandomValues 대체 경로를 유지하고 HTTPS에서만 테스트하지 않는다.
- localStorage 데이터 스키마를 변경하면 기존 데이터 이전을 구현한다. 저장 실패를 숨기지 않는다. 사용자 데이터는 외부 서비스에 임의 전송하지 않는다.
- Trip.savedPlaces는 선택적 후보 배열이다. 누락된 구형 데이터는 빈 보관함으로 처리하고 여행 편집 시 보존한다. 후보와 일정의 ID는 여행 내에서 중복되지 않아야 하며 날짜 이동은 scheduleSavedPlace를 통해 원자적으로 처리한다.
- Trip.packingItems는 선택적 준비물 배열이다. 구형 데이터의 누락은 빈 목록으로 처리하고 completed는 boolean으로 검증한다. 여행 편집/백업 시 항목을 보존하며 준비물 보기 전환으로 지도 인스턴스를 재생성하지 않는다.
- 요청된 범위를 실제로 완성하고, 의미 있는 로직 검증과 `npm run typecheck`, `npm test`, `npm run build`를 실행한다. 못 한 검증은 명확히 보고한다.
- 기능 변경 후 PROGRESS.md를 갱신하고, 구현 상태·검증 결과·제약을 쉬운 한국어로 보고한다.
- Firebase/PWA/실시간 공동 편집은 후속 작업이다. 키나 계정 없이 현재 MVP가 실행되어야 한다.
- GitHub Pages 워크플로는 v2 내용을 저장소 최상위에 배치하는 구조다. 배포 전에 docs/GITHUB_PAGES_SETUP.md를 읽고 공개 범위를 설명한다. main 배포, Pages 메타데이터 기반 base, 타입 검사/테스트, dist만 업로드하는 흐름을 유지한다. .env.local/개인 백업을 업로드하거나 지도 키를 로그에 출력하지 않는다.
