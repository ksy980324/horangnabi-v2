# Firebase 공동 편집 준비

GitHub Pages는 앱 화면을 제공한다. 공동 편집을 선택한 두 사람의 여행 데이터는 별도 Firebase 프로젝트에 저장한다. 앱에 Google 로그인과 Firestore 동기화를 연결했다. 실제 계정과 기기를 사용한 검증 및 서비스 배포가 남아 있다.

## 프로젝트 설정 순서

1. Firebase 콘솔에서 Spark 무료 요금제로 공동 편집 전용 프로젝트를 만든다. 결제가 연결된 지도 프로젝트와 분리하면 두 서비스의 요금 설정을 따로 관리할 수 있다.
2. Authentication에서 Google 로그인 제공자를 켜고 승인된 도메인에 `ksy980324.github.io`를 추가한다. Firestore는 프로덕션 모드로 만든다.
3. Firebase 콘솔의 프로젝트 설정 → 일반 → 내 앱에서 웹 앱 구성 객체를 확인한다. 키와 값을 큰따옴표로 감싼 JSON으로 바꾸고 `.env.local`의 `VITE_FIREBASE_CONFIG` 한 줄에 넣는다. 기존 Google 지도 설정은 유지한다. 서비스 계정 키를 사용하지 않는다.
4. 로컬에서는 `npm.cmd run dev`로 열고 **공유 여행 → Google로 로그인**을 선택한다. 로컬 로그인을 시도할 때는 Authentication 승인된 도메인에 `localhost`를 추가하고 Vite 주소의 호스트도 `localhost`로 연다.
5. GitHub Pages에서는 GitHub 저장소의 Settings → Secrets and variables → Actions → Secrets에 `FIREBASE_WEB_CONFIG`를 만들고 같은 JSON 객체를 입력한다. 다음 Pages 빌드에 적용된다. 브라우저 설정값은 빌드 결과물에서 읽을 수 있고, 여행 데이터 접근은 Firestore 규칙이 제한한다.
6. 앱의 공유 화면이나 Authentication 사용자 목록에서 본인 UID를 확인한다. Firestore 콘솔에서 `settings` 컬렉션의 `members` 문서를 만들고, `uids` 필드를 배열로 지정해 본인 UID를 문자열로 넣는다. 두 번째 사용자가 로그인한 뒤 그 UID를 같은 배열에 추가한다. 실제 UID는 저장소에 기록하지 않는다.
7. 에뮬레이터에서 규칙을 검증한 뒤 프로젝트 관리자 계정으로 `firebase deploy --only firestore:rules --project PROJECT_ID`를 실행한다. `PROJECT_ID`는 전용 프로젝트의 ID로 바꾼다. 콘솔에서 적용하려면 Firestore Database → 규칙에서 `firestore.rules`의 내용을 게시한다. 적용 후 공유 화면에서 **접근 다시 확인**을 누른다.

기존 여행을 공유하려면 기기에서 **JSON 백업**을 받고, 공유 여행 화면의 **백업 가져오기**로 그 파일을 선택한다. 가져오기 전 두 사람이 같은 파일을 중복으로 추가하지 않도록 한 사람만 가져온다.

로컬에서 `localhost`만 승인된 경우 Vite가 출력한 주소의 `127.0.0.1`을 `localhost`로 바꾸고 포트는 그대로 둔다. Google 로그인이 실패하면 공유 여행 화면에 표시되는 `auth/...` 코드를 확인한다. UID가 표시되면 Google 로그인은 완료된 상태이며, 공유 접근 권한은 별도로 확인한다.

## 동기화 구현 기준

- `trips/{tripId}`에 기존 여행 전체를 `trip`으로 저장한다. `revision`, 서버 시간 `updatedAt`, 로그인 UID `updatedBy`를 함께 저장한다. 가져온 여행은 기존 `parseDatabase`로 검증한다.
- 여행·일정·후보 장소 편집창을 연 시점의 `revision`을 저장 트랜잭션에서 비교한다. 충돌하거나 연결이 끊기면 편집창의 입력을 보존한다. 충돌 시 입력을 확인하고 편집창을 다시 열어 최신 데이터에 적용한다. 순서 변경, 삭제, 준비물 즉시 체크는 작업 시점의 버전을 사용한다.
- 로컬과 공유 데이터를 분리한다. 기존 여행이나 오사카 예시는 사용자가 가져오기를 선택한 경우에만 새 여행 ID로 공유한다. 로그아웃하거나 접근이 거부되면 공유 데이터와 구독을 화면에서 정리한다.
- 배포 전 두 허용 계정, 비로그인 사용자, 세 번째 계정의 읽기·쓰기 권한을 확인한다. 클라이언트에서 멤버 목록 변경이 차단되고 올바른 버전 증가만 허용되는지 확인한다. 앱 연결 후 두 기기에서 실시간 반영과 동시 수정도 확인한다.

참고 · [Firestore 보안 규칙](https://firebase.google.com/docs/firestore/security/rules-conditions) · [트랜잭션](https://firebase.google.com/docs/firestore/manage-data/transactions) · [Firestore 사용량 및 한도](https://firebase.google.com/docs/firestore/quotas)
