# Antigravity (Gemini) 작업 인수인계 & 전역 규칙

이 파일은 어느 PC에서든 Antigravity로 `lotteon-smartstore-v36` 폴더를 열었을 때 자동으로 로드되는 프로젝트 규칙 및 인수인계 문서입니다.

## 1. 언어 및 응답 규칙
- 모든 답변, 설명, 작업 계획(Plan), 요약 문서(Artifact)는 기본적으로 **한국어**로 작성한다.
- 코드, 파일 경로, 터미널 명령어, 라이브러리명 등 고유 식별자는 원문을 유지한다.

## 2. 프로젝트 개요 및 필수 참조 문서
- 저장소: `https://github.com/seungchullee84/lotteon-smartstore-v36` (`main` 브랜치)
- 용도: 지오다노 롯데ON · 네이버 스마트스토어 상품등록기 (`server.mjs`, Node.js 로컬 웹앱)
- 기존에 Codex에서 구축한 프로젝트이며, 아래 문서의 도메인 규칙을 깨뜨리지 않고 이어서 개선한다:
  - `AGENTS.md`: 전체 자동화·검증·운영 규칙
  - `PROJECT.md`: 확정 운영 설정, 사진·상세페이지, 네이버 API 상품명(27~39자), 태그 10개 검증 기준
  - `SMARTSTORE-DETAIL.md`: 스마트스토어 상세페이지(860px PNG) 제작 규칙

## 3. 자동화 연동 구조 (다른 PC에서도 동일하게 유지)
- **GitHub 자동 반영 (`github-sync.mjs`)**: 등록기 실행 중 소스(`*.mjs`, `public/*`, `*.md` 등)를 수정하면 2~4초 후 `main` 브랜치에 자동 커밋·푸시된다. `data/`의 API 키·로그인 세션·프로필은 자동 제외된다.
- **MYBOX 자동배포 (`mybox-deploy.mjs`, `mybox-browser-upload.mjs`)**: GitHub 반영 후 60초 뒤 테스트 → `최신업데이트.zip` 생성 → `ego-browser`를 통해 네이버 MYBOX `내 파일`(`https://mybox.naver.com/main/web/my`)에 자동 덮어쓰기 업로드한다.
  - `data/mybox-deploy/settings.json`에 `{"enabled": true, "folderUrl": "https://mybox.naver.com/main/web/my"}` 필요 (로컬 파일, GitHub 미업로드).
  - 신규 클론 PC에서는 `git fetch --unshallow`로 기준 커밋(`e9afe1b6...`) 포함 전체 이력이 있어야 패키징 가능하다.
- **25분 신상품 자동 감시 (`homepage-new-list.mjs`, `new-product-research.mjs`)**: 등록기 실행 중 25분 간격으로 공식몰 신상품 목록을 확인하고, 신규 상품 발견 시 백그라운드로 소구점 조사를 진행한다.

## 4. 다른 PC에서 이어서 작업하는 방법
1. 작업 시작 전 최신 코드 반영: `git pull --ff-only origin main` (또는 바탕화면 `상품등록기 최신버전` 아이콘 실행)
2. Antigravity에서 이 프로젝트 폴더를 워크스페이스로 열고 **"이어서 작업하자"**고 요청하면 이 파일과 최근 `git log`를 기준으로 바로 맥락을 이어받는다.
3. 다른 PC 최초 1회 세팅 시, GitHub에 올라가지 않는 로컬 `data/` 설정(네이버 API 키, 브라우저 로그인 설정/프로필, `data/mybox-deploy/settings.json`, 태그 조사자료)만 확인하면 동일 환경으로 동작한다.
4. 의미 있는 기능 개선을 마칠 때마다 아래 **최근 작업 이력**을 1~2줄 갱신해 두면 다음 PC에서 바로 이어서 작업할 수 있다.

## 5. 최근 작업 이력 (인수인계 로그)
- **2026-11-23 (`0.1513.0`)**:
  - 품번 입력칸(`#style`) 글씨 색상을 파란색(`#1d4ed8`)으로 변경 (`public/style.css`, 롯데ON·스마트스토어 공통)
  - `수집 진행 기록` (`#collectionTimeline`) 영역을 `로그인과 상품 수집` 카드(`#collectionCard`) 위쪽으로 이동 (`public/index.html`, `public/style.css`)
  - GitHub 자동 반영 및 네이버 MYBOX `최신업데이트.zip` 자동배포 정상 동작 확인
