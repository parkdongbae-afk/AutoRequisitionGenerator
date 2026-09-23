# AGENTS.md — 자동 품의 요구 생성기

쇼핑몰 캡처(MHTML/HTML)에서 품목을 추출해 품의 서식 엑셀에 저장하는 Electron 앱.
**모든 소스는 `app/` 폴더에 있고, 루트는 배포 exe와 명세 문서만 둔다.**

## 문서 우선순위

- **`SUMMARY.MD`** — 세션 인계용 요약. 버전·기능·IPC·명령이 가장 최신. 항상 먼저 읽을 것.
- `SYSTEM.md`(아키텍처), `ALGO.md`(파싱/규칙 엔진), `excel.MD`·`Book.MD`·`BookmarkUp.MD`·`Extension.MD`·`UIUX.md`·`RPD.md` — as-built 명세
- 문서와 코드가 충돌하면 코드가 사실

## 개발 명령 (app/ 폴더에서)

```powershell
cd app
npm install        # 최초 1회. allowScripts 정책으로 electron/esbuild 승인 필요할 수 있음
npm run dev        # electron-vite dev
npm run build      # out/ 번들 (main 진입점 = ./out/main/index.js이므로 실행 전 빌드 필요)

# E2E 자가테스트 (단위 테스트 프레임워크 없음 — 이게 유일한 검증 수단)
$env:E2E='1'; $env:E2E_DIR="..\shoping_cart"; $env:E2E_OUT="..\e2e-result.json"; npx electron .
# 결과는 JSON으로 출력됨. 패키징 exe에도 동일 env 적용하되 E2E_DIR/E2E_OUT은 절대경로 필수(portable exe는 %TEMP% 기준으로 상대경로가 틀어짐). E2E 후 좀비 프로세스 정리 습관화(과거 EADDRINUSE 사고)

# 패키징 (winCodeSign 심볼릭링크 이슈로 플래그 없으면 실패)
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win portable --config.win.signAndEditExecutable=false

# 배포: 산출물을 루트 배포 파일로 교체
Copy-Item release\AutoRequisitionGenerator-Portable.exe "..\자동품의요구생성기_Portable.exe" -Force

# 사용 매뉴얼 PDF 재생성 (app/resources/manual.pdf — 수정 시 재실행 후 재패키징 필요)
node analysis\make-manual-pdf.js
```

## 작업 완료 기준

**변경 → exe 재생성 → 루트 배포 파일 교체까지 완료해야 작업 완료.**
사용자가 앱을 실행 중이면 파일이 잠기므로 `question` 도구로 종료를 요청한다.

## 환경 주의 (Windows)

- PowerShell 5.1 콘솔에서 한글 깨짐 → 한글 파일 조작은 직접 셸 명령 대신 node 스크립트로 (`app/analysis/` 참조)
- 앱은 단일 인스턴스 잠금 사용, 수신 포트 57330~57335 폴백
- 최신 Chrome(v137+)은 `--load-extension` 차단 → 북마크릿 안내 로직이 정상 동작인 것

## 아키텍처 핵심

- `app/src/main/index.js` — 창/IPC/`app-mhtml://` 프로토콜/수신 서버/E2E 진입
- `app/src/main/lib/` — mhtml.js(파서), extract.js(규칙 엔진), rules.js+rules/*.json(내장 13몰), excel.js(SheetJS BIFF8), receiver.js(HTTP 수신), mhtmlsave.js(HTML→MHTML), bookmarks.js, picker.js
- `app/src/renderer/` — React 18 + Zustand + Tailwind v4
- `app/extension/` — Chrome MV3 확장(패키징 시 extraResources로 복사)
- 사용자 데이터: `%APPDATA%\자동 품의 요구 생성기\` (settings.json, rules/, inbox/, extension/)
- IPC 채널 목록은 SUMMARY.MD §3 참조

## 규칙 엔진

- 규칙 원본: `app/src/main/lib/rules/*.json` (사본 `app/analysis/rules/` — 원본 수정 시 함께 관리)
- `rules.js`의 **builtin 배열 순서 = 매칭 우선순위** (예: teachermall-cart가 teachermall보다 앞)
- 스키마(`rowSelector`/`fields`/`priceIs: lineTotal`/`shipping.mode` 4종/`match: "last"`) 상세는 ALGO.md §2
- 규칙 검증: `app/analysis/test-rule.js`, `test-spec.js` + 정답 파일 `test_OK/품목내역(통합).xls`

## 과거 버그 재발 방지

- `findBrowserByKey` 등 **async 호출부 await 누락** 주의 (v1.4.1 버그 원인)
- iframe 피커는 앱이 `picker-mode` 메시지를 iframe에 postMessage해야 진행 (v1.0.x "클릭 안 됨" 원인)
- 북마크바 편집은 브라우저 **완전 종료 상태**에서만 유효
- 북마크 노드는 **기존 guid/id를 보존해 이동만** — 새 guid로 재생성하면 Chrome 동기화가 옛 guid 노드를 서버 위치(맨뒤)로 부활시킴 (v1.6.3 버그 원인)
- "엑셀에 저장"은 현재 표 내용으로 **교체**(.bak 백업) — 누적이 아님 (v1.6.1 의미론)

## 사용자 협업 패턴

- 응답은 **간결한 한국어**, 표/불릿 선호
- 사용자 개입 필요 시(앱 종료 요청 등) `question` 도구 적극 활용
