# 문서명: Extension.MD
# 브라우저 확장 프로그램 관리 페이지 직접 연결 가이드

## 1. 브라우저별 확장 프로그램 URL
각 브라우저의 확장 프로그램 관리 페이지로 이동하는 고유 주소(URI)는 다음과 같습니다.
* **Chrome 확장 열기:** `chrome://extensions/`
* **Edge 확장 열기:** `edge://extensions/`
* **웨일 확장 열기:** `whale://extensions/`

## 2. 기술적 주의사항 (보안 정책)
일반적인 웹페이지(HTML)에서 `<a href="chrome://extensions/">`와 같이 단순 링크를 걸면, 브라우저의 강력한 보안 정책(Local Resource 로드 차단) 때문에 클릭해도 페이지가 열리지 않습니다. 
따라서 첨부해주신 이미지와 같은 별도의 데스크톱 프로그램(GUI) 환경에서는 버튼 클릭 이벤트를 감지하여 **운영체제(OS) 명령어로 브라우저를 직접 호출**해야 합니다.

## 3. 핵심 구현 로직 (AI 프롬프트 지시어)
opencode z.ai에게 프로그램 작성을 요청할 때, 아래의 로직을 반드시 포함하도록 지시하세요.

* **Python (Tkinter/PyQt) 환경일 경우:**
  - `webbrowser` 모듈이나 `subprocess` 모듈을 사용하여 브라우저 프로세스를 직접 실행하도록 요청합니다.
  - *동작 원리 예시:* `subprocess.Popen(['chrome.exe', 'chrome://extensions/'])`
* **Electron (Node.js) 환경일 경우:**
  - `shell.openExternal()` API를 사용하여 각 브라우저의 실행 경로와 URL을 매핑하여 열어주도록 요청합니다.

## 4. UI/UX 적용 가이드 (첨부 이미지 연동)
1. **링크 활성화:** 첨부된 화면의 "1. 확장 프로그램 페이지 열기" 아래에 있는 세 개의 파란색 텍스트(Chrome, Edge, 웨일)에 위의 운영체제 호출 로직을 각각 연결합니다.
2. **시각적 강조:** 현재 디자인된 붉은색 경고 박스(개발자 모드 활성화)는 사용자가 링크를 클릭하여 페이지가 열렸을 때 꼭 필요한 조치이므로, 링크 클릭 시 해당 박스가 한 번 깜빡이거나 애니메이션 효과를 주어 주의를 환기시키는 것도 좋은 방법입니다.

## 5. Chrome Web Store 업로드 패키징 (2026-09-30)

스토어에 올릴 수 있는 확장은 `app\extension`(품의캡처)과 `app\extension-autoselect`(물품 자동 선택) 2개다.
**`extension_auto`(설치 도구 폴더)는 업로드 대상이 아니다** — 자체 `manifest.json`과 `test_extension/manifest.json`이 함께 들어 있어 업로드 시
"패키지에 2개 이상의 매니페스트가 있습니다" 오류가 발생한다(2026-09-30 실측).

### 5.1 패키징 규칙
* **manifest.json이 ZIP 최상위(root)에 1개만** 존재해야 한다 — 폴더째 압축하면 `폴더명/manifest.json`으로 들어가 거부된다.
* 경로 구분자는 `/`(슬래시)여야 한다 — PowerShell 5.1 `Compress-Archive`는 `\`(백슬래시)로 기록하는 규격 위반이 있어 사용 금지.
  UTF-8 파일명 + 슬래시 보장을 위해 **Python zipfile로 압축**한다(저장소에 `zip 재생성` 요청 시 같은 방식 사용).
* 업로드 대상에서 제외: `설치방법.txt`(수동 설치 안내문 — 스토어 게시물과 무관), 테스트 전용 폴더.

### 5.2 생성 결과 (2026-09-30)
| 확장 | ZIP | 크기 | 내용 |
|---|---|---|---|
| 물품 자동 선택 | `물품자동선택_1.2.2_CWS.zip` | 357.8KB | background·content·popup·icons·vendor·README 13개 |
| 품의캡처 | `품의캡처_1.7.0_CWS.zip` | 19.5KB | manifest·background·icons 4종 6개(설치방법.txt 제외) |

### 5.3 재생성 절차
1. manifest `version`을 올린다(재업로드는 항상 버전 증가 필요).
2. ZIP 최상위에 매니페스트가 오도록 압축한다 — 예: `python`으로 `zipfile.ZipFile(...).write(full, 상대경로)`.
3. 업로드: [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → 새 항목(또는 기존 항목 → 패키지) → ZIP 업로드.
4. 검토 참고: 물품 자동 선택은 호스트 권한 14몰 + `vendor/xlsx.full.min.js`(경량화 코드)로 심사 질의가 올 수 있다 —
   "SheetJS 0.18.5 공식 배포본, 로컬 엑셀 파싱 전용"으로 답변한다. 품의캡처는 `pageCapture`·`bookmarks` 권한 설명이 필요하며
   host_permissions이 127.0.0.1(로컬) 전용이라 심사에 유리하다. 학교 단위 배포는 **비공개(링크 보유자)** 권장.
