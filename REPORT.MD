# REPORT.MD — 자동 품의 요구 생성기 프로그램 보고서

**작성일:** 2026-09-26 | **대상 버전:** v1.39.0 | **저장소:** github.com/parkdongbae-afk/AutoRequisitionGenerator

---

## 1. 사용 기술

| 구분 | 기술 |
|---|---|
| 데스크톱 앱 프레임워크 | Electron 33.2.1 (Chromium 130 + Node.js 20 런타임 내장) |
| UI | React 18.3.1 + Zustand 5.0.3(상태 관리) + Tailwind CSS 4.1.4 |
| 빌드 도구 | electron-vite 2.3.0 (Vite 5.4.11 기반), electron-builder 25.1.8 (portable exe 패키징) |
| HTML/DOM 파싱 | cheerio 1.0.0 (쇼핑몰 페이지에서 품목 추출) |
| 엑셀 처리 | SheetJS(xlsx) 0.18.5 — BIFF8(.xls) 읽기·쓰기 |
| 문자 인코딩 | iconv-lite 0.7.3 + 자체 스마트 디코딩(euc-kr/UTF-16 등 혼재 캡처 대응) |
| PDF 생성 | pdfkit 0.20.2 (사용/관리자 매뉴얼 생성 스크립트) |
| AI | Google Gemini API(generativelanguage REST) — 관리자 도구의 규칙 자동 생성 |

## 2. 개발언어 및 개발도구

- **개발언어:** JavaScript (ESM, `app/src`는 electron-vite 번들 대상 / `app/analysis` 도구는 CommonJS)
- **개발도구:**
  - Visual Studio Code 및 AI 코딩 에이전트(opencode + oh-my-openagent)로 개발
  - `npm` (의존성 관리, allowScripts 정책으로 electron·esbuild 승인)
  - **개발 실행:** `cd app` → `npm install` → `npm run dev`
  - **번들 빌드:** `npm run build` (out/main·preload·renderer 생성)
  - **자가테스트(E2E):** `$env:E2E='1'; $env:E2E_DIR="..\shoping_cart"; $env:E2E_OUT="..\e2e-result.json"; npx electron .` — 단위 테스트 프레임워크 없음, JSON 결과 출력이 유일한 통합 검증 수단
  - **규칙 검증:** `node analysis\test-cart-rules.js`(13몰 정답 대조), `test-cart-fix.js`, `test-feedback.js`, `test-emart.js` 등
  - **패키징:** `$env:CSC_IDENTITY_AUTO_DISCOVERY='false'; npx electron-builder --win portable --config.win.signAndEditExecutable=false`
  - **버전 관리:** Git(GitHub), 커밋 메시지는 UTF-8 파일 기반(`git commit -F`)으로 작성

## 3. 프로그램 구성 및 아키텍처

### 3.1 프로세스 구조 (Electron 3-프로세스)

```
메인 프로세스  src/main/index.js      창 생성·IPC·app-mhtml:// 프로토콜·수신 서버·E2E 진입
              src/main/lib/           기능 모듈(아래 3.2)
프리로드       src/preload/index.js   contextBridge로 renderer에 window.api 노출
렌더러         src/renderer/           React 18 + Zustand + Tailwind v4 화면
부속          extension/              Chrome/Edge/웨일 MV3 확장 "품의캡처"(패키징 시 extraResources 복사)
              extension_auto/         version2 확장 자동 설치 도구(Python, 아래 3.5) — extraResources 복사
              analysis/               규칙 검증 스크립트·매뉴얼 PDF 생성기·rules 사본
              resources/              사용 매뉴얼(manual.pdf)·관리자 매뉴얼(admin-manual.pdf)
```

### 3.2 주요 모듈 (src/main/lib)

| 모듈 | 역할 |
|---|---|
| `receiver.js` | 로컬 HTTP 수신 서버(127.0.0.1:57330~57335 폴백) — 확장/북마크릿의 캡처를 `/mhtml`, `/html`로 받음 |
| `mhtml.js` | MHTML 파서(quoted-printable/base64, charset 스니핑·스마트 디코딩) |
| `mhtmlsave.js` | 북마크릿이 보낸 live HTML을 CSS/이미지 리소스 포함 MHTML로 재조립(Referer 보정 포함) |
| `docstore.js` | 문서 로드(MHTML/HTML 자동 판별, lazy 이미지 복구, base href), 재추출, 체크 상태 복원 |
| `extract.js` | **규칙 엔진** — rowSelector·fields·shipping(mode 5종)·checkedOnly·verifyCount·units 등 스키마로 품목 추출, 단가=합계÷수량 환산, 10원 단가 올림 |
| `rules.js` + `rules/*.json` | 내장 34몰 규칙(builtin 배열 순서 = URL 매칭 우선순위, `-cart` 규칙이 주문서보다 앞) |
| `excel.js` | 서식 엑셀 읽기/교체 저장(SheetJS BIFF8, .xlsx 분기, .bak 백업, 배송비 금액별 합산) |
| `bookmarks.js` | 브라우저 북마크바 JSON 편집(맨 앞 삽입, guid 보존, Guest/System 골격 생성), 프로필 나열 |
| `bookmarklet.js` | 북마크릿 URL 빌더(포트 57330 고정) |
| `picker.js` | 매핑(규칙 학습)용 iframe 주입 스크립트 — 클릭한 요소의 CSS 선택자 추출 |
| `admin.js` | 관리자 도구 — Gemini로 규칙 JSON 생성, rules.json 재생성(버전 관리), git 배포, 몰 목록/삭제 |

### 3.3 데이터 흐름 (캡처 → 엑셀)

```
[브라우저] 확장 아이콘(outerHTML/MHTML) 또는 북마크릿(HTML)
   → HTTP 수신(receiver.js) → MHTML 조립(mhtmlsave.js) → inbox 저장
   → 규칙 매칭(rules.js matchRule) → 품목 추출(extract.js)
   → 문서 뷰어(app-mhtml:// iframe) + 추출 결과 표(React Grid)
   → [엑셀에 저장] 서식 파일 교체 저장(excel.js, .bak 백업)
```

### 3.4 관리자 파이프라인 (규칙 신규 추가)

```
설정 화면 F9 → 관리자 모달 → 샘플(최대 2파일/종류) + 정답 엑셀
   → Gemini 프롬프트(내장 규칙 few-shot) → 규칙 JSON 검증
   → 소스 rules + analysis 사본 + 사용자 rules 저장
   → rules.json 재생성({version, generatedAt, count, rules}) → git add/commit/push
   → 일반 사용자 [⬇ 업데이트 확인]으로 자동 배포
```

### 3.5 extension_auto — version2 확장 자동 설치 도구 (Python, 현상 유지)

Chrome 137+가 `--load-extension` 플래그를 차단한 뒤로 확장을 자동 설치할 수 있는 유일한 경로로, Windows UI Automation으로 브라우저 설정 화면을 직접 조작합니다. **Python(pywinauto)으로 구현되어 있으며 JS 재작성을 검토 후 현상 유지 결정**(2026-09-26) — UIA 계층은 순수 JS로 대체 불가하고, 3,014줄에 축적된 브라우저별·언어별 예외 처리의 회귀 비용이 재작성 공수를 초과하기 때문.

| 파일 | 내용 |
|---|---|
| `extension_developer_mode_manager.py` (3,014줄) | 본체. tkinter 도구 UI + pywinauto UIA 자동화 + psutil 프로세스 관리 |
| `install_and_run.bat` / `run.bat` | 실행 래퍼(앱의 run-extension-v2 IPC가 호출) |
| `build_windows.bat` / `requirements.txt` | 빌드(pywinauto==0.6.8, psutil>=5.9,<8) |
| `manifest.json` / `background.js` | 설치 대상 캡처 확장 사본(도구가 이 폴더를 선택 설치) |
| `test_extension/` | UIA 동작 검증용 더미 확장 |

자동화 흐름: 프로필 선택 → 브라우저 종료(psutil) → 프로필 실행 → 주소창으로 chrome://extensions 이동(UIA) → "개발자 모드" 토글 클릭(UIA) → "압축해제된 확장 프로그램 로드" 클릭(UIA) → 네이티브 폴더 선택 다이얼로그에 확장 경로 입력(UIA) → 설치 확인 → 재실행.

앱 연동: 앱 시작 시 `%APPDATA%\...\extension` 최신 확장을 extension_v2에 복제 → [🧩 익스텐션 추가] 버튼이 `run-extension-v2` IPC로 이 도구를 스폰(extraResources로 패키징 포함). UI 테마는 v1.18.3에서 앱 팔레트로 맞춰져 있음.

## 4. 실행환경 및 실행방법

### 4.1 사용자(배포본)

| 항목 | 내용 |
|---|---|
| 실행환경 | Windows 10/11 x64, 설치 불필요(portable) |
| 실행 파일 | 저장소 루트 `자동품의요구생성기_Portable.exe` (약 72~73MB) |
| 첫 실행 | [⭐ 북마크바 추가] 또는 [🧩 익스텐션 추가]로 캡처 수단 설치 → 쇼핑몰 화면에서 🛒품의캡처 클릭 |
| 사용자 데이터 | `%APPDATA%\자동 품의 요구 생성기\` — settings.json, rules/(사용자 규칙), inbox/(캡처 원본), extension/, manual.pdf |
| 내부 포트 | 127.0.0.1:57330~57335 (수신 서버 폴백) — 단일 인스턴스 잠금 |
| 관리자 도구 | [⚙ 설정] 화면에서 F9 (배포 exe는 저장소 루트 폴더에서 실행 권장) |

### 4.2 주요 화면 동작 (v1.27~v1.30)

- **글자 배율**: 헤더·뷰어 탭·상태바·설정/관리자 모달은 1.5배(CSS zoom), 총액 칩은 2배. 추출 결과 표는 별도 설정(글자 크기 슬라이더)으로 관리
- **▣ 반반 버튼**(헤더, 설정에서 표시/숨김 — 기본 표시): 클릭 시 좌측 미리보기와 상태바 좌측 정보를 숨기고, **Win+Right 키 시뮬레이션으로 정확히 화면 오른쪽 1/2에 강제 스냅** — 스냅 애시스트가 떠서 왼쪽 절반에 놓을 다른 프로그램을 선택할 수 있다. 최대화 상태는 먼저 해제 후 시도하며, 키 입력 실패 시 setBounds로 오른쪽 절반에 배치하고 workArea를 벗어나지 않게 클램프한다. 다시 누르면 미리보기 복원
- **좁은 창 대응**: 최소 창 폭 640px, 헤더/상태바는 줄바꿈 지원, 창 폭 1100px 이하에서 미디어 쿼리로 여백·간격 축소, 모달 카드는 max-width 클램프 + 내부 스크롤 — 절반 폭에서도 잘리지 않는다
- **단가 인상 즉시 반영**: 상태바의 단가 % 선택 시 추출 결과의 예상단가·행 총액·총액에 즉시 반영(배송비 제외) — 엑셀 저장과 동일 기준
- **쇼핑몰 전체 삭제**: 추출 결과 표의 쇼핑몰 이름 칸 [전체삭제] 버튼 — 해당 쇼핑몰 행 전체와 미리보기 탭을 한 번에 닫는다
- **캡처 전송 신뢰성**: 북마크릿은 포트 57330~57335 순회 전송 + CSP 차단 사이트용 /bridge.html postMessage 브리지 폴백, 확장은 6포트 순회 — 발신자는 응답의 app 식별 마커를 검증해 타 프로세스가 포트를 점유해도 캡처를 잃지 않는다
- **뷰어 탭 라벨**: 캡처 파일명의 시간 접두사를 뒤로 이동해 표시(`23-59-27_G마켓-장바구니` → `G마켓-장바구니-23-59-27`)
- **표 편집**: 셀 클릭 편집, Tab/Shift+Tab으로 다음/이전 편집 셀 이동(행 끝에서 다음 행으로 이어짐)
- **＋ 행 추가**: 셀을 선택한 상태면 그 행 바로 아래에 삽입(새 행의 품목명 셀 자동 활성화), 선택이 없으면 맨 아래 추가
- **버튼 표시 토글**(설정): ⭐ 북마크바 추가·🧩 익스텐션 추가·▣ 반반 버튼(기본 켜기), 새 쇼핑몰 규칙 추가 버튼(기본 끔). MHTML 폴더/파일 열기 버튼 토글은 관리자 모달에 위치(기본 끔)

### 4.3 개발 환경

```powershell
cd app
npm install                        # 최초 1회
npm run dev                        # 개발 실행 (electron-vite)
npm run build                      # 번들 생성 (out/)
# E2E
$env:E2E='1'; $env:E2E_DIR="..\shoping_cart"; $env:E2E_OUT="..\e2e-result.json"; npx electron .
# 패키징 + 배포
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win portable --config.win.signAndEditExecutable=false
Copy-Item release\AutoRequisitionGenerator-Portable.exe "..\자동품의요구생성기_Portable.exe" -Force
# 매뉴얼 재생성
node analysis\make-manual-pdf.js ; node analysis\make-admin-manual-pdf.js
# rules.json 재생성(버전 자동 증가)
node analysis\make-rules-json.js
```

## 5. 입력·출력 파일 형식

### 5.1 입력

| 파일 | 형식 | 설명 |
|---|---|---|
| 캡처 파일 | `.mhtml` `.mht` `.html` `.htm` | 쇼핑몰 화면 저장본. MHTML은 MIME multipart(quoted-printable/base64), 문자셋은 선언과 실제가 어긋나도 자동 판별 |
| 내장 규칙 | `app/src/main/lib/rules/*.json` | `{id, name, match[], rowSelector, fields{name,qty,price,option}, shipping{mode…}, checkedOnly, verifyCount…}` |
| 사용자 규칙 | `%APPDATA%\...\rules\*.json` + `overrides.json` | 매핑 학습/업데이트로 저장된 같은 스키마, 이름 오버라이드 |
| 업데이트 문서 | 저장소 루트 `rules.json` | `{version, generatedAt, count, rules:[…]}` (구 배열 형식도 읽기 호환) |
| 품의 서식 엑셀 | `.xls`(BIFF8), `.xlsx` | 품목내역(통합).xls — 헤더 자동 탐지(품목명/규격/단위/수량/단가 열 별칭) |
| 관리자 도구 입력 | 샘플 HTML/MHTML(종류별 최대 2개) + 정답 `.xls/.xlsx` + Gemini API 키 | 정답 엑셀은 품목·수량·금액·배송비가 화면과 일치해야 품질 확보 |

### 5.2 출력

| 파일 | 형식 | 설명 |
|---|---|---|
| 품의 엑셀 | `.xls` 교체 저장 | 현재 표 내용으로 교체(.bak 자동 백업), 배송비는 금액별 합산 행, 단가 인상 % 반영(배송비 제외) |
| inbox 캡처 원본 | `YYYY-MM-DD_HH-MM-SS.mhtml/.html` + `.url.txt`(출처 URL sidecar) | 보관 기간(기본 5일) 경과 시 자동 삭제 |
| rules.json | JSON(버전 문서) | 깃허브 푸시 → 사용자 [업데이트 확인] 배포 채널 |
| 매뉴얼 | `resources/manual.pdf`, `resources/admin-manual.pdf` | pdfkit 생성, 패키징 시 extraResources 포함 |
| E2E 결과 | `e2e-result.json` | 19샘플 추출 결과 + protocolOk/adminCheck/rendererCheck/mappingCheck 등 지표 |

## 6. 주요 오류 발생 시 조치 방법

| 증상 | 원인 | 조치 |
|---|---|---|
| "주문서 상태에서 품의캡처 눌러 주세요" 등 0건 거부 팝업 | 해당 몰은 장바구니/주문서 중 특정 화면에서만 추출 지원 | 안내 문구에 맞는 화면(장바구니는 체크 후)에서 다시 캡처 |
| "체크 N개 중 캡처에 M개만 저장…" 경고 | 브라우저 저장 스냅샷의 행 누락(목록 가상화) | 장바구니를 끝까지 스크롤해 모든 행을 렌더한 뒤 품의캡처(확장)로 재캡처 |
| 네이버 장바구니 추출 실패/거부 | 구버전 확장 | 브라우저 완전 재시작(확장 코드 리로드) 또는 [🧩 익스텐션 추가] 재설치 |
| 북마크릿이 없어짐/중복 | 북마크 동기화 충돌 | 브라우저 실행 중엔 파일 편집이 무효 — [⭐ 북마크바 추가] 재실행(종료→삽입→재시작 자동화), 중복은 브라우저 북마크 관리자에서 1회 삭제(tombstone 전파) |
| 최신 Chrome에서 확장이 안 뜸 | Chrome 137+ 정책상 `--load-extension` 차단 | [🧩 익스텐션 추가] 자동 설치 도구 또는 수동 로드(chrome://extensions) |
| 엑셀 저장 실패 "확장자가 잘못되었습니다" | .xlsx 경로에 BIFF8로 저장한 경우 | v1.16.2에서 확장자별 bookType 분기로 수정 — 재현 시 파일 확장자 확인 |
| 포트 충돌(EADDRINUSE) / 앱이 안 열림 | 좀비 프로세스 | 작업 관리자에서 이전 exe/electron 프로세스 종료 (폴백 포트 57331~35 자동 시도) |
| 관리자 도구: Gemini 503 High Demand | 구글 서버 과부하 | 자동 재시도(2/4/8초 ×3) + 대체 모델(gemini-2.5-flash→2.0-flash) 전환. 최종 실패 시 잠시 후 재시도 또는 모델 변경 |
| 관리자 도구: "규칙 id ~가 이미 있습니다" | 도구가 만든 규칙은 자동 덮어쓰기되지만, 클릭 매핑 등 사람이 만든 규칙과는 충돌 | 다른 id 입력 또는 안내된 파일 경로의 규칙 삭제 |
| 관리자 도구: git push 실패 | 네트워크/인증 | 로컬 생성은 완료 — rules/{id}.json + rules.json을 나중에 직접 push |
| 콘솔(PowerShell 5.1)에서 한글 깨짐 | 코드페이지 | 한글 파일 조작은 node 스크립트로 수행 |

## 7. 향후 수정이 필요한 주요 설정값

| 설정값 | 위치 | 비고 |
|---|---|---|
| 수신 포트 57330~57335 | `receiver.js`, `bookmarklet.js`, `index.js`(host_permissions 확장 manifest도) | 충돌 시 범위 확장 필요 — 북마크릿은 57330 캐노니컬 고정이라 변경 시 3곳 동시 수정 |
| `ORDER` 배열(규칙 우선순위) | `make-rules-json.js` **와** `admin.js` (2곳 동기 필수) | 신규 내장 규칙 추가 시 순서 등록(없으면 rules.json 맨 뒤) |
| Gemini 기본 모델·폴백 사슬 | `AdminModal.jsx` `DEFAULT_MODEL`, `admin.js` `MODEL_FALLBACKS` | 신모델 출시/단종 시 교체 |
| rules.json 버전 형식 | `admin.js` `buildRulesJsonDoc` + `make-rules-json.js` | 형식 변경 시 check-rule-updates 하위호환 유지 |
| inbox 보관 기간 기본 5일 | `store.js` 초기값 + `index.js` cleanupInbox | 사용자별 settings로 조정 가능 |
| rulesUpdateUrl 기본값 | `store.js` | 저장소 이전 시 수정 |
| 다이소 무료배송 기준 30,000원 | `rules/daisomall.json` `shipping.freeOver` | 쇼핑몰 정책 변경 시 규칙 JSON 수정 |
| 몰별 거부/안내 메시지 | `store.js` `RULE_REJECT_MESSAGES` | 신규 몰 추가 시 등록 권장 |
| E2E 샘플 경로 | `E2E_DIR`/`E2E_OUT` 환경변수 | 포터블 exe E2E는 절대경로 필수 |
| 사용자 데이터 폴더명 | electron productName | 폴더명 변경 시 기존 사용자 설정 이동 필요 |

## 8. 프로그램에서 사용하는 외부 시스템 또는 기능

| 외부 시스템/기능 | 용도 | 비고 |
|---|---|---|
| Google Gemini API (`generativelanguage.googleapis.com/v1beta`) | 관리자 도구의 파싱 규칙 JSON 자동 생성 | REST 직접 호출(키 인증), 503 시 지수 백오프·모델 폴백. 일반 사용자 기능에는 미사용 |
| GitHub 저장소 (parkdongbae-afk/AutoRequisitionGenerator) | ① 규칙 업데이트 서버(raw.githubusercontent의 rules.json 다운로드) ② 규칙 배포(git push) | 비공개면 다운로드 404 — 공개 저장소 필요 |
| 브라우저 프로필 파일 (Chrome/Edge/웨일) | 북마크바 자동 추가 — `Bookmarks`/`Bookmarks.bak` JSON 편집, `Local State` 프로필 나열 | 브라우저 완전 종료 상태에서만 유효, 동기화 환경 주의(문서 §6 참조) |
| Windows 레지스트리 `HKCU\...\Run` | 시작 프로그램 등록/삭제 | reg.exe 사용 |
| 로컬 루프백 HTTP 서버 (57330~57335) | 확장·북마크릿의 캡처 수신, 북마크릿 설치 페이지 | 외부 노출 없음(127.0.0.1) |
| `app-mhtml://` 커스텀 프로토콜 | 뷰어 iframe에 캡처 문서를 로컬 리소스(CSS/이미지 포함)로 서빙 | 오프라인 안전 렌더링 |
| Chrome UI Automation 도구 (extension_auto, version2 — §3.5) | 확장 자동 설치(브라우저 종료→개발자 모드→확장 로드) | Python(pywinauto 0.6.8 + psutil) — JS 재작성 검토 후 현상 유지(2026-09-26) |

## 9. 외부 라이브러리·모듈 및 라이선스

라이선스는 `app/node_modules` 내 설치된 패키지 기준으로 실측(2026-09-26).

### 9.1 런타임 의존성 (dependencies)

| 패키지 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| electron | 33.2.1 | MIT | 데스크톱 앱 런타임 |
| cheerio | 1.0.0 | MIT | 캡처 HTML DOM 파싱(규칙 추출) |
| xlsx (SheetJS Community Edition) | 0.18.5 | Apache-2.0 | 엑셀(.xls BIFF8/.xlsx) 읽기·생성 |
| iconv-lite | 0.7.3 | MIT | euc-kr 등 문자셋 디코딩 |
| zustand | 5.0.3 | MIT | React 상태 관리 |

### 9.2 개발 의존성 (devDependencies)

| 패키지 | 버전 | 라이선스 | 용도 |
|---|---|---|---|
| react / react-dom | 18.3.1 | MIT | UI |
| tailwindcss + @tailwindcss/vite | 4.1.4 | MIT | 스타일링 |
| vite | 5.4.11 | MIT | 번들러 |
| electron-vite | 2.3.0 | MIT | Electron 빌드 파이프라인 |
| @vitejs/plugin-react | 4.4.1 | MIT | React JSX 변환 |
| electron-builder | 25.1.8 | MIT | portable exe 패키징 |
| pdfkit | 0.20.2 | MIT | 매뉴얼 PDF 생성(analysis 스크립트) |

### 9.3 내장(Node/Electron 표준) 모듈

`fs`, `path`, `crypto`, `child_process`, `net`, `global fetch` — 외부 라이선스 없음(Electron/Node 런타임에 귀속).

---

*본 문서는 v1.25.0 기준 as-built 보고서이며, 최신 동작은 `SUMMARY.MD`와 소스 코드가 우선합니다.*
