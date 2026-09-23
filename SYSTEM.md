# 기술 스택 및 아키텍처 문서 (Tech & Architecture)
**업데이트:** 2026-09-13 — 구현 완료 상태 기준 (v1.0.1)

## 1. 기술 스택 (as-built)
- **프론트엔드 (UI/UX):** React 18, Tailwind CSS v4 (`@tailwindcss/vite`), Zustand v5 (상태 관리)
- **빌드 체인:** electron-vite 2.3 (main/preload/renderer 번들), Vite 5
- **데스크톱 런타임 (OS 제어 및 파일 관리):** Electron 33 (Chromium)
- **데이터 파싱 (HTML 분석):** Cheerio 1.0 (DOM 구조 분석, AI 없는 순수 파싱) + iconv-lite 0.7 (EUC-KR 등 문자셋 디코딩)
- **엑셀 제어:** SheetJS (xlsx) 0.18.5 — `.xls`(BIFF8) 읽기/추가/쓰기 지원
- **MHTML 자동 캡처:** Chrome Extension (Manifest V3, `chrome.pageCapture.saveAsMHTML` → 로컬 HTTP POST 전송)
- **패키징:** electron-builder 25 — Windows portable 단일 exe

## 2. 아키텍처 다이어그램 (as-built)
1. **캡처 채널 3종 (v1.1.0):**
   - **확장프로그램 (MV3, Chrome/Edge/웨일 호환):** 아이콘 클릭 → `chrome.pageCapture.saveAsMHTML` → `POST /mhtml`
   - **북마크릿 (모든 브라우저):** `🛒품의캡처` 클릭 → `document.documentElement.outerHTML` + `location.href` → `POST /html` (charset 자동 판별/UTF-8 변환, sidecar `.url.txt` 저장)
   - **원클릭 연동:** [🌐 브라우저 원클릭 연동] → 브라우저 감지(표준 경로 + 레지스트리 App Paths) → 바탕화면 바로가기(`--load-extension`=/userData/extension, portable 임시경로 대비 고정 복사) + `GET /install` 북마크릿 설치 페이지 오픈. Chrome stable v137+는 플래그 차단 감지 시 북마크릿 안내
2. **Electron Main Process:**
   - **수신 서버 (receiver.js):** 로컬 HTTP 수신(포트 57330~57335 폴백) → `userData/inbox/` 저장 → `loadDocument()` (MHTML MIME 또는 원본 HTML 자동 판별) → Renderer에 `mhtml-received` 이벤트
   - **문서 저장소 (docstore.js):** 파싱 → 규칙 매칭(MHTML Content-Location 또는 X-Source-Url)·품목 추출·규격 생성 → 문서 캐시(Map)
   - **커스텀 프로토콜 (`app-mhtml://`):** 원본 HTML 및 이미지 파트 서빙 + 문서 높이 측정 스크립트/피커 주입, 스크립트/CSP 제거
   - **엑셀 제어 (excel.js):** `품목내역` 시트 읽기 → 행 추가 → `.bak` 백업 후 BIFF8 저장 (+저장 대화상자 경로 지정)
3. **React Renderer Process:**
   - Zustand 스토어가 문서/행/줌/엑셀/매핑/연동 상태 통합 관리
   - 좌측 iframe은 `app-mhtml://` URL 직접 로드 (스케일 줌 + 패널 스크롤)
   - 우측 그리드의 행 수정은 스토어 경유
4. **Excel Export/Append:** '엑셀에 누적 저장하기'(현재 경로) / '📂 다른 경로에 저장'(대화상자 지정, 새 파일이면 서식 생성)

## 3. 프로세스 안정장치
- **단일 인스턴스 잠금:** `app.requestSingleInstanceLock()` — 중복 실행 시 기존 창 포커스
- **포트 폴백:** 57330 EADDRINUSE 시 57331~57335 순차 바인딩, 전부 실패해도 앱은 계속 동작(익스텐션 수신만 비활성)
- **설정 저장:** `userData/settings.json` (마지막 엑셀 경로 등)

## 4. 디렉터리 구조
```
app/
├─ src/main/               Electron 메인 프로세스
│  ├─ index.js             창/IPC/프로토콜/수신서버/E2E 자가테스트
│  ├─ preload/index.js     contextBridge API 노출
│  └─ lib/
│     ├─ mhtml.js          MIME 파서 (QP/Base64 디코딩, 문자셋 판별)
│     ├─ extract.js        규칙 엔진 (rowSelector/필드/배송비 모드)
│     ├─ rules.js          규칙 로더 (내장 + 사용자)
│     ├─ rules/*.json      내장 규칙 9종
│     ├─ docstore.js       문서 로드/재추출/URL 치환/스크립트 제거
│     ├─ excel.js          .xls 읽기/추가/생성 (SheetJS)
│     ├─ receiver.js       로컬 HTTP 수신 서버
│     └─ picker.js         매핑용 클릭 수집 스크립트(주입)
├─ src/renderer/           React UI (Header/Viewer/Grid/StatusBar/MappingModal/Toasts)
├─ extension/              Chrome 확장 (manifest.json / background.js / 설치방법.txt)
├─ analysis/               규칙 도출용 분석 스크립트 및 디코드 결과
└─ release/                빌드 산출물 (AutoRequisitionGenerator-Portable.exe)
```

## 5. IPC 채널 목록
`open-mhtml-files`, `open-mhtml-folder`, `load-mhtml-path`, `remove-doc`, `get-doc-url(id, picker)`, `reextract-doc(id, ruleId)`, `update-rows`, `list-rules`, `save-user-rule`, `delete-user-rule`, `read-excel`, `pick-excel`, `append-excel`, `get-settings`, `set-setting`, `open-extension-folder`, `reveal-file`, 이벤트 `mhtml-received`

## 6. E2E 자가테스트 모드
`E2E=1` 환경변수로 실행 시: 9개 샘플 MHTML 전수 파싱 → 프로토콜 서빙 검증 → 임시 xls 생성/추가/재독기 → 렌더러 DOM·콘솔 에러 검사 → 결과 JSON 출력 후 자동 종료. 패키징 exe에서도 동작 (`E2E_DIR`, `E2E_OUT`로 경로 지정).
