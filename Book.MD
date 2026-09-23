# 문서명: Book.MD
# 크롬, 엣지, 웨일 브라우저 북마크 일괄 추가 및 진행 상황 표시 기술 가이드

## 1. 개요
선생님들의 PC에 설치된 주요 크로미움(Chromium) 기반 브라우저인 **Chrome, Microsoft Edge, Naver Whale**의 모든 프로필 북마크바 최상단에 '자동 품의 요구 생성기'를 일괄 추가하는 스크립트 작성 가이드입니다.
또한, 작업이 진행되는 동안 선생님들이 답답해하지 않도록 **진행 상황(Progress)**을 시각적으로 보여주는 요건이 추가되었습니다.

## 2. 작동 원리 (Chromium 기반 파일 구조)
크롬, 엣지, 웨일은 모두 동일한 크로미움 엔진을 사용하므로, 북마크 파일의 이름(`Bookmarks`)과 내부 JSON 구조(`roots.bookmark_bar.children`)가 완벽하게 동일합니다. 저장되는 기본 경로(Windows 기준)만 다릅니다.

* **Google Chrome:** `C:\Users\<사용자명>\AppData\Local\Google\Chrome\User Data\`
* **Microsoft Edge:** `C:\Users\<사용자명>\AppData\Local\Microsoft\Edge\User Data\`
* **Naver Whale:** `C:\Users\<사용자명>\AppData\Local\Naver\Naver Whale\User Data\`

## 3. 핵심 구현 로직 (AI 프롬프트 지시어)
opencode z.ai에게 스크립트 작성을 요청할 때 다음 프로세스를 포함하도록 지시하세요.

1. **브라우저 프로세스 안전 종료:** 
   - 파일 수정 전 `chrome.exe`, `msedge.exe`, `whale.exe` 프로세스가 실행 중인지 확인하고, 안전하게 종료하도록 안내하거나 강제 종료합니다. (실행 중일 때 수정하면 덮어씌워짐 방지)
2. **다중 브라우저 경로 순회:**
   - 위 3개의 `User Data` 폴더를 각각 스캔하여 `Default`, `Profile 1`, `Profile 2` 등의 폴더를 모두 찾습니다.
3. **JSON 파싱 및 최상단(Index 0) 삽입:**
   - `{"name": "자동 품의 생성기", "type": "url", "url": "https://선생님_프로그램_주소"}` 객체를 각 브라우저의 북마크 배열 맨 앞(`index 0`)에 삽입합니다.

## 4. 진행 상황(Progress) 표시 구현 방안
작업 속도가 빠르더라도, 다수의 프로필을 검색하고 수정하는 동안 사용자에게 현재 상태를 알려주어야 합니다. 스크립트 언어별로 아래의 방식을 적용하도록 AI에게 지시하세요.

* **Python 기반 스크립트 시:** `tqdm` 라이브러리를 사용하여 콘솔(터미널)에 직관적인 프로그레스 바(Progress Bar)를 출력하도록 지시.
  - *출력 예시:* `Edge 프로필 업데이트 중... [██████████░░] 80% (4/5)`
* **PowerShell 스크립트 시:** 내장 명령어인 `Write-Progress`를 사용하여 윈도우 기본 진행률 표시줄을 화면 상단에 띄우도록 지시.
* **GUI 프로그램 (Tkinter / PyQt) 변환 시:** UI 화면에 상태 메시지 라벨("현재 웨일 브라우저 북마크 적용 중...")과 시각적인 진행률 바(ProgressBar) 위젯을 추가하여 연동.

## 5. [권장] 통합 프롬프트 템플릿
"Python을 사용하여 Chrome, Edge, Whale 브라우저의 모든 프로필 북마크바 맨 앞에 특정 URL을 추가하는 스크립트를 작성해줘. 
단, 스크립트 실행 시 1) 세 브라우저 프로세스를 먼저 종료하고, 2) `tqdm`을 사용하여 각 브라우저 및 프로필별 수정 진행 상황을 시각적인 프로그레스 바로 보여줘야 해."
