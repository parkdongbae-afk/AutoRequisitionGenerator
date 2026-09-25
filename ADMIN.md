# 요구사항 정의서: 새로운 쇼핑몰 추가 원클릭 (관리자 서브 프로그램)

## 1\. 개요

* **기능명**: 새로운 쇼핑몰 추가 원클릭 관리자 모듈
* **목적**: 관리자가 신규 쇼핑몰 샘플 파일(장바구니/주문서 HTML/MHTML 및 정답 엑셀)을 등록하고 Gemini API를 활용하여 파싱 규칙 JSON을 자동 생성한 후, `make-rules-json.js` 실행 및 Git 커밋/푸시까지 원클릭으로 처리함.

## 2\. 진입 조건 및 UI 요구사항

* **실행 방식**: 설정(Settings) 화면 진입 상태에서 `F9` 키 입력 시 관리자 전용 모달(팝업) 창 또는 대화상자 실행.
* **입력 폼 구성**:

  1. **Gemini API 설정**:

     * Gemini API Key 입력 필드 (로컬 저장소 저장/불러오기 지원)
     * Gemini 모델 선택 드롭다운 (예: `gemini-2.5-flash`, `gemini-2.5-pro` 등)
  2. **신규 쇼핑몰 식별자**:

     * 쇼핑몰 영문/한글 이름 입력란 (생성될 `.json` 파일명으로 사용)
  3. **샘플 파일 선택기 (File Picker)**:

     * 장바구니 HTML/MHTML 파일 선택
     * 주문서 HTML/MHTML 파일 선택
     * 정답 데이터 엑셀 파일 (`.xls` 또는 `.xlsx`) 선택
  4. **실행 버튼**: "쇼핑몰 규칙 생성 및 자동 배포 시작"

## 3\. 처리 프로세스 (Workflow)

### Step 1: Gemini API 기반 JSON 생성

* 아래의 기존 학습/참조 데이터 경로 및 입력받은 샘플 파일 분석:

  * `C:\\Users\\Park\\Desktop\\Automatic\_generation\_of\_approval\_requests\_html (1)\\Automatic\_generation\_of\_approval\_requests\_html\\shoping\_cart`
  * `C:\\Users\\Park\\Desktop\\Automatic\_generation\_of\_approval\_requests\_html (1)\\Automatic\_generation\_of\_approval\_requests\_html\\test\_OK`
  * `C:\\Users\\Park\\Desktop\\Automatic\_generation\_of\_approval\_requests\_html (1)\\Automatic\_generation\_of\_approval\_requests\_html\\장바구니\_html`
* 선택한 Gemini API와 모델을 호출하여 정답 엑셀 구조에 맞는 파싱 규칙 추출.
* 생성된 소스 JSON 파일 저장 위치:

  * `C:\\Users\\Park\\Desktop\\Automatic\_generation\_of\_approval\_requests\_html (1)\\Automatic\_generation\_of\_approval\_requests\_html\\
  * app\\src\\main\\lib\\rules\\\[입력한\_쇼핑몰명].json`

### Step 2: rules.json 자동 통합 (빌드)

* 소스 JSON 파일 작성이 완료되면 Node.js `child\_process`를 통해 다음 스크립트 자동 실행:

  * `node C:\\Users\\Park\\Desktop\\Automatic\_generation\_of\_approval\_requests\_html (1)\\Automatic\_generation\_of\_approval\_requests\_html\\app\\analysis\\make-rules-json.js`
* 실행 후 저장소 루트의 `rules.json` 파일 재생성 여부 확인.
* 다운로드 가능하게.

### Step 3: Git 자동 커밋 및 푸시

* 변경된 파일들을 Git에 원클릭으로 커밋/푸시하는 기능 제공:

  * 커밋 대상: `app/src/main/lib/rules/\[입력한\_쇼핑몰명].json`, `rules.json`
  * 커밋 메시지: `feat: \[입력한\_쇼핑몰명] 쇼핑몰 규칙 추가 및 rules.json 갱신`
  * 처리 명령어: `git add .` -> `git commit` -> `git push`
* UI상에 진행 상태(로그) 및 완료 메시지 표시.

