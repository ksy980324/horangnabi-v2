# GitHub Pages로 휴대폰에서 어디서나 접속하기

## 현재 상태와 공개 범위

공개 저장소 [ksy980324/horangnabi-v2](https://github.com/ksy980324/horangnabi-v2)를 생성하고 Pages의 Source를 GitHub Actions로 지정했습니다. 로컬 v2 폴더에도 Git을 초기화하고 원격 origin/main을 연결해 소스를 커밋했습니다. **아래 최초 생성 절차를 다시 실행하지 마세요.** 현재 남은 단계는 지도 값 등록과 로컬 커밋 push입니다. 연결 GitHub 앱의 쓰기는 403으로 거절됐고 도구 실행 환경에서 Windows Git 인증 프로그램도 실행되지 않아 원격 소스 업로드는 아직 완료되지 않았습니다. 상세 상태는 [진행 상황](PROGRESS.md)을 확인하세요.

현재 상태에서 이어가기:

```powershell
cd C:\Users\ct06\vscode-repos\horangnabi\horangnabi-v2
git push -u origin main
```

로그인 창이 열리면 본인 GitHub 계정으로 로그인하세요. 인증이 실패하면 본인 PowerShell에서 `gh auth login --hostname github.com --git-protocol https --web --scopes workflow`를 실행한 뒤 push를 다시 시도하세요. 비밀번호/토큰을 채팅으로 전달하지 않습니다. 아래 3번의 Pages·지도 설정도 확인하세요.

GitHub Free의 Pages는 공개 저장소를 사용합니다. 이 방식을 선택하면 소스 코드와 앱 화면이 공개되고, 로그인 없이 앱을 열 수 있습니다. 준비된 공개 대상은 이 `horangnabi-v2` 폴더의 소스·테스트·프로젝트 문서·설정 파일입니다. 상위 폴더의 기존 앱은 포함하지 않습니다. 실제 일정/보관함/준비물 데이터는 각 브라우저의 localStorage에 있으므로 저장소에 자동 업로드되지 않습니다. `.env.local`, 다른 환경 파일, 생성된 JSON 백업, node_modules, dist는 커밋하지 않습니다.

공개를 원하지 않으면 아래 공개 저장소 생성 단계를 실행하지 말고 배포 방식을 먼저 결정하세요. GitHub Pages 배포 자체가 두 계정 인증이나 공동 편집을 제공하지는 않습니다.

## 1. 공개 배포를 선택한 경우: 소스 준비

아래 명령은 **v2 폴더 안에서만**, 최초 한 번 실행합니다. 상위 폴더에서 `git init`하거나 기존 프로젝트를 함께 올리지 마세요.

```powershell
cd C:\Users\ct06\vscode-repos\horangnabi\horangnabi-v2
git init -b main
git add .github .gitignore .env.example AGENTS.md README.md docs src tests scripts index.html package.json package-lock.json tsconfig.json vite.config.ts
git status --short
git diff --cached --stat
```

올릴 파일을 확인한 뒤 커밋합니다. `.env.local`이나 본인 여행의 JSON 백업이 나타나면 진행하지 마세요.

```powershell
git commit -m "Prepare Horangnabi for GitHub Pages"
```

Git이 이름/이메일을 요청하면 본인의 값으로 이 저장소에 설정한 뒤 커밋을 다시 실행하세요. 전역 설정을 변경할 필요는 없습니다.

```powershell
git config user.name "YOUR_GITHUB_NAME"
git config user.email "YOUR_GITHUB_NOREPLY_EMAIL"
```

## 2. GitHub 로그인과 저장소 생성

GitHub CLI가 설치되어 있습니다. 비밀번호/토큰을 채팅에 보내지 말고 본인 브라우저에서 로그인하세요. workflow 권한은 자동화 파일을 올리는 데 사용합니다.

```powershell
gh auth login --hostname github.com --git-protocol https --web --scopes workflow
gh auth status
gh repo create horangnabi-v2 --public --source . --remote origin
```

확인한 연결 계정은 `ksy980324`입니다. 다른 계정으로 로그인하면 아래 URL의 계정명도 달라집니다. 이미 같은 이름의 저장소가 있다면 덮어쓰거나 삭제하지 말고 그 저장소를 사용할지 먼저 확인하세요. 이 문서의 저장소 생성 명령에는 `--push`를 넣지 않았으므로 다음 설정 후 소스를 올립니다.

## 3. Pages와 지도 값 설정

새 저장소의 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택하세요.

**Settings → Secrets and variables → Actions**에서 다음 두 값을 등록하세요. 로컬 `.env.local` 파일은 GitHub로 전송하지 않습니다.

| 위치 | 이름 | 값 |
| --- | --- | --- |
| Secrets → New repository secret | `GOOGLE_MAPS_API_KEY` | 사용 중인 제한된 웹 지도 API 키 |
| Variables → New repository variable | `GOOGLE_MAP_ID` | Google에서 생성한 본인의 JavaScript용 Map ID |

`GOOGLE_MAP_ID`에는 `DEMO_MAP_ID`를 사용하지 않습니다. [지도 설정 안내](GOOGLE_MAPS_SETUP.md)를 참고하세요. 배포 흐름은 이 값들의 누락/데모 값이면 안내 후 중단하여 Google 지도 대신 의도치 않은 기본 지도가 공개되지 않도록 합니다. 로컬 개발의 키 없는 무료 지도 실행은 계속 지원합니다.

Google Cloud API 키의 **애플리케이션 제한은 웹사이트**, **API 제한은 Maps JavaScript API**를 유지하고 다음 허용 주소를 추가하세요.

```text
https://ksy980324.github.io/*
```

이 앱은 `strict-origin-when-cross-origin`을 사용하여 Google 요청에 사이트 origin이 전달됩니다. 저장소 경로(`/horangnabi-v2/`)까지 들어간 허용 규칙만 등록하면 브라우저의 경로 생략 때문에 지도 인증이 실패할 수 있습니다. 다른 계정/도메인을 쓰면 실제 호스트로 바꾸세요. 개발용 localhost/LAN 주소는 필요하면 유지합니다. 새 유료 API는 켜지 않습니다.

브라우저용 지도 키는 빌드된 JavaScript와 네트워크 요청에서 확인 가능한 값입니다. GitHub Secret은 소스에 직접 커밋하거나 빌드 로그에 출력하는 것을 방지하는 용도이며, 배포 후 키를 숨기는 장치는 아닙니다. 웹사이트/API 제한과 기존 사용량 설정을 유지하세요. 서비스 계정 파일이나 Firebase 관리자 키를 등록하지 않습니다.

## 4. 첫 배포 실행

설정을 마친 후 다음을 실행합니다.

```powershell
git push -u origin main
```

저장소 **Actions → Deploy Horangnabi to GitHub Pages**에서 진행 상태를 확인하세요. 설치 → 타입 검사 → 테스트 → Pages 설정 확인 → 지도 값 확인 → 빌드 → dist 업로드 → 공개 순서입니다. 실패하면 마지막 정상 배포는 유지되고 실패 단계의 로그에서 원인을 확인할 수 있습니다. 성공한 실행의 `deploy` 결과에 실제 사이트 주소가 표시됩니다.

이 계정과 저장소 이름을 사용한다면 예정 주소는 **`https://ksy980324.github.io/horangnabi-v2/`**입니다. **현재 살아 있는 배포 주소라고 확인한 것은 아닙니다.** 주소 끝 `/`까지 포함해 여세요. 이제 PC가 꺼져 있거나 휴대폰이 모바일 데이터를 써도 이 HTTPS 주소로 접속할 수 있습니다.

이후 코드 변경은 해당 파일을 커밋하고 `git push`하면 자동 배포됩니다. 지도 Secret/Variable만 바꿨을 때는 Actions에서 **Run workflow → main**으로 새 빌드를 실행하세요. 작업 흐름은 `main` 배포만 허용하며 Pages 설정에서 `github-pages` environment의 배포 브랜치도 `main`으로 제한할 수 있습니다.

## 5. 데이터 옮기기와 접속 확인

1. 기존 PC/LAN 주소에서 **JSON 백업**을 내려받습니다.
2. 새 배포 주소를 휴대폰에서 열고 파일을 **복원**합니다. 복원은 그 브라우저의 여행 전체를 교체합니다.
3. 여행 열기, 날짜 변경, 지도 핀/카드 선택, 장소 검색, 후보 이동, 준비물 체크를 확인합니다.
4. 새로고침 후 저장 유지, 와이파이를 끈 뒤 모바일 데이터로 접속을 확인합니다.

기존 주소와 배포 주소, PC와 휴대폰은 서로 다른 저장소입니다. 배포만으로 데이터를 동기화하거나 두 사람이 동시에 같은 일정을 편집할 수는 없습니다. Firebase 연동은 다음 단계입니다. 브라우저 데이터를 삭제하기 전에는 백업하세요.

## 문제 해결

- **Actions 파일이 안 보임**: 이 v2 폴더의 내용이 저장소 최상위에 있어야 합니다. `.github/workflows/deploy.yml`이 저장소 루트 기준 그 경로인지 확인하세요.
- **Pages 설정 조회 실패**: Settings → Pages의 Source를 GitHub Actions로 지정했는지 확인하세요.
- **지도 값 확인 실패**: Secret/Variable 이름과 등록 위치가 위 표와 같은지 확인하세요. 키 값은 로그에 출력하지 않습니다.
- **앱 화면은 뜨는데 지도만 실패**: 허용 웹사이트 호스트/API 제한/JavaScript Map ID를 확인한 후 새로고침하세요. 키 값 변경은 새 빌드가 필요합니다.
- **CSS/JavaScript가 404**: 배포된 실제 주소 끝 `/`와 Actions 빌드 설정을 확인하세요. 워크플로는 configure-pages가 알려준 `base_path`로 빌드합니다. 임의로 루트 `/`만 지정하지 마세요.
- **예시 여행만 보임**: 다른 주소/브라우저의 실제 데이터를 아직 복원하지 않았을 수 있습니다.

## 로컬에서 배포 경로 빌드 확인

```powershell
$env:PAGES_BASE_PATH = '/horangnabi-v2/'
npm.cmd run build
npm.cmd run preview -- --port 4180 --strictPort
```

브라우저에서 `http://127.0.0.1:4180/horangnabi-v2/`를 확인합니다. 종료는 Ctrl+C이며, 확인 후 아래 명령으로 임시 경로 환경 변수를 지우세요. 4180에서 Google 지도를 확인하려면 그 개발 주소도 키에 허용되어 있어야 합니다.

```powershell
Remove-Item Env:PAGES_BASE_PATH
```

공식 참고: [Vite 배포](https://vite.dev/guide/static-deploy), [GitHub Pages 범위](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Pages Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Google Maps 키 제한](https://developers.google.com/maps/api-security-best-practices).
