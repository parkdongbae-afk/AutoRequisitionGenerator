# ADMIN_SATAD_ALONE.MD
# 단독 실행형 쇼핑몰 규칙 관리 프로그램 상세 개발 명세서

- **문서 목적:** Z.ai Coding Plan에 투입하여 구현 작업을 바로 분해·수행·검수할 수 있는 수준의 상세 명세 제공
- **프로그램 가칭:** 쇼핑몰 규칙 관리자 (Shopping Mall Rule Manager)
- **문서 버전:** 1.1.0
- **작성일:** 2026-09-30
- **기준 프로젝트:** 자동 품의 요구 생성기 v1.49.9
- **대상 OS:** Windows 10/11 x64
- **배포 형태:** 설치가 필요 없는 단일 Portable EXE
- **핵심 원칙:** 기존 사용자용 앱과 독립적으로 실행하되, 현재 프로젝트의 규칙 엔진·규칙 파일·검증 로직·Git 배포 계약과 완전히 호환되어야 한다. AI 기능은 Z.ai GLM가 아니라 Z.ai GLM Coding Plan을 사용하며, API를 사용할 수 없는 경우에도 결정론적 분석과 클릭 매핑으로 작업을 완료할 수 있어야 한다.

---

## 0. Z.ai Coding Plan용 최상위 지시문

아래 요구사항에 따라 기존 `자동 품의 요구 생성기` 저장소 안에 **별도 단독 실행형 관리자 프로그램**을 구현한다.

1. 기존 사용자용 Electron 앱의 설정 화면 `F9` 관리자 모달에 들어 있는 기능을 별도 프로그램으로 분리한다.
2. 사용자용 앱을 실행하지 않아도 신규 쇼핑몰 규칙 생성, 클릭 매핑, 규칙 편집·검증·삭제, `rules.json` 재생성, builtin 등록, Git 커밋·푸시를 수행할 수 있어야 한다.
3. 기존 Z.ai GLM 연동은 제거하고 Z.ai GLM Coding Plan 연동으로 교체한다. 기본 연동은 공식 지원 코딩 도구(OpenCode 등)를 경유하는 방식으로 구현하며, 기존 규칙 JSON 스키마와 `extract.js`, `rules.js`, `admin-verify.js`, `make-rules-json.js`, 사용자 규칙 업데이트 형식은 변경하지 않는다.
4. 가능한 한 기존 모듈을 재사용하거나 Electron 비의존 공용 모듈로 추출한다. 동일 기능을 관리자 앱에 복사하여 이중 구현하지 않는다.
5. 파일 변경은 트랜잭션 방식으로 처리하며, 검증 실패 또는 Git 실패 시 사용자가 복구할 수 있도록 백업·롤백 기능을 제공한다.
6. Z.ai Coding Plan API Key, Git 인증정보, 사용자 샘플 HTML/MHTML 및 정답 Excel은 외부로 임의 전송하지 않는다. 샘플은 사용자가 명시적으로 AI 생성을 실행한 경우에만 선택한 Z.ai 연동 채널로 전달한다.
7. 신규 프로그램은 `npm run dev`, `npm run build`, Windows portable 패키징, 자동화 테스트가 가능해야 한다.
8. 구현 완료 후 기존 사용자용 앱의 E2E와 규칙 회귀 테스트가 모두 통과해야 한다.
9. 문서와 코드가 충돌할 경우 기존 동작을 보존하되, 본 명세의 “필수 수용 기준”을 충족하도록 코드와 문서를 함께 정리한다.
10. 관리자 프로그램의 실행 파일은 사용자용 앱 실행 파일과 이름·프로세스 식별자·userData 경로·단일 인스턴스 잠금을 분리한다.

---

# 0-A. Z.ai GLM Coding Plan 사용 정책 및 구현 원칙

## 0-A.1 중요 정책

Z.ai 공식 문서 기준으로 GLM Coding Plan은 일반 종량제 API와 구분되며, 공식 지원 코딩 도구 및 제품 환경에서 사용하도록 제한된다. 따라서 이 프로그램의 기본 설계는 다음과 같다.

1. **기본값:** OpenCode 등 Z.ai 공식 지원 코딩 도구를 실행하는 브리지 방식
2. **보조값:** AI를 전혀 사용하지 않는 결정론적 규칙 생성
3. **선택값:** 정책상 허용됨을 확인한 경우에만 Coding Plan 전용 OpenAI 호환 endpoint 직접 호출
4. 일반 API endpoint인 `/api/paas/v4`와 Coding Plan endpoint인 `/api/coding/paas/v4`를 혼동하지 않는다.
5. Individual Coding Plan Key와 Team Plan Key를 다른 종류의 Z.ai API Key로 대체하지 않는다.
6. API Key를 코드, 규칙 JSON, 로그, Git에 저장하지 않는다.

## 0-A.2 지원 연동 우선순위

```text
1순위: OpenCode 브리지
2순위: 사용자가 설치한 다른 공식 지원 코딩 도구 어댑터
3순위: 결정론적 로컬 생성 + 클릭 매핑
4순위: 정책 확인 후 직접 OpenAI Chat Completions 호출
```

지원 도구 어댑터는 공통 인터페이스를 사용한다.

```js
class CodingAgentAdapter {
  detect()
  getVersion()
  testConnection(config)
  generateRule(request, signal)
  repairRule(request, signal)
  normalizeOutput(raw)
}
```

초기 필수 어댑터는 `OpenCodeAdapter` 하나로 한다. 이후 Codex, Cline, Roo Code 등을 플러그인 방식으로 추가할 수 있게 설계한다.

## 0-A.3 API Key 획득 위치 안내

설정 UI에는 다음 안내를 표시한다.

- Individual Plan: Individual Coding Plan의 Plan Overview에서 Key 생성
- Team Plan: Team Coding Plan의 My Plan에서 Team Plan Key 확인
- Team Plan Key는 다른 Z.ai API Key와 상호 교환되지 않음
- Key는 하드코딩하지 않음
- Coding Plan quota가 소진되면 다음 갱신 주기를 기다리거나 Plan 상태를 확인해야 함

# 1. 배경

현재 프로젝트는 Electron 기반 사용자용 데스크톱 앱이며, 쇼핑몰 HTML/MHTML을 규칙 JSON으로 파싱하여 품목을 추출하고 Excel에 저장한다. 관리자 기능은 사용자용 앱의 설정 화면에서 `F9`를 눌러 여는 숨겨진 모달로 제공된다.

기존 관리자 기능은 다음 업무를 수행한다.

- Z.ai Coding Plan API Key 설정 저장·불러오기·연결 확인
- 장바구니 및 주문서 샘플 HTML/MHTML 등록
- 정답 Excel 등록
- 신규 규칙 JSON 자동 생성
- 클릭 매핑 방식 규칙 생성
- 생성 규칙 자동 검증 및 최대 3회 AI 자가 수정
- 규칙 파일 다중 위치 동기 저장
- `rules.json` 재생성 및 버전 관리
- 구축된 쇼핑몰 규칙 목록 확인 및 삭제
- 미등록 규칙을 `rules.js` builtin에 등록
- Git 선택적 add, commit, push
- 진행 로그 및 오류 안내

현재 방식은 다음 문제가 있다.

1. 관리자 작업을 위해 사용자용 앱을 실행하고 설정 화면까지 진입해야 한다.
2. 사용자 기능과 관리자 기능의 UI·상태·IPC가 한 프로그램에 결합되어 있다.
3. 규칙 생성·삭제·builtin 등록 같은 위험 작업이 일반 사용자 앱에 포함된다.
4. 포터블 실행 위치, 저장소 탐지, Node 실행 가능 여부 등 환경 의존성이 높다.
5. 일부 단계가 실패하면 소스 규칙, 분석용 사본, 사용자 규칙, `rules.json`, `rules.js` 사이에 부분 반영 상태가 생길 수 있다.
6. 관리자 기능 변경이 사용자용 앱의 빌드와 렌더러 복잡도를 증가시킨다.

본 개발의 목표는 기존 기능을 유지하면서 관리자 업무를 별도 Portable 프로그램으로 분리하고, 안전한 변경·검증·배포 워크플로를 제공하는 것이다.

---

# 2. 목표

## 2.1 필수 목표

- 사용자용 앱과 별도 프로세스 및 별도 실행 파일로 실행
- 대상 프로젝트 저장소를 선택하거나 자동 탐지
- 현재 규칙 상태, 버전, 동기화 상태, Git 상태를 한 화면에서 확인
- 주문서 규칙과 장바구니 규칙을 각각 또는 동시에 생성
- 화면 종류별 HTML/MHTML 샘플을 최대 2개씩 등록
- `.xls` 또는 `.xlsx` 정답 파일 등록
- Z.ai GLM 기반 규칙 생성 및 연결 테스트
- 생성 규칙 스키마 검증
- 샘플 추출 검증
- 실패 시 최대 3회 Z.ai GLM 자가 수정
- 클릭 매핑 기반 수동 규칙 생성
- 옵션/선택 행 `optionRows` 매핑 지원
- 기존 규칙 조회·검색·편집·복제·삭제
- 규칙 단독 테스트와 정답 대조
- `rules.json` 재생성 및 버전 증가
- `rules.js` builtin 자동 등록
- Git 커밋·푸시
- 모든 파일 변경의 미리보기, 백업, 롤백
- 독립 Portable EXE 패키징

## 2.2 품질 목표

- 관리자 작업 실패가 기존 정상 규칙을 손상시키지 않아야 한다.
- 신규 규칙이 추출 0건이면 성공으로 처리하지 않아야 한다.
- 장바구니 규칙은 V체크 항목만 추출하도록 `checkedOnly`를 기본 필수로 검증해야 한다.
- `-cart` 규칙은 동일 쇼핑몰의 일반 주문서 규칙보다 우선 매칭되어야 한다.
- Git에 작업과 무관한 파일을 자동으로 포함하지 않아야 한다.
- 네트워크 오류나 Z.ai 서비스 과부하 시 재시도와 모델 폴백을 제공해야 한다.
- 관리자 UI에서 API Key 원문을 로그에 출력하지 않아야 한다.
- 기존 사용자용 앱의 규칙 업데이트 기능이 생성된 `rules.json`을 그대로 읽을 수 있어야 한다.

## 2.3 비목표

1차 버전에서는 다음을 구현 범위에서 제외한다.

- 쇼핑몰 계정 로그인 자동화
- 실제 쇼핑몰 구매·결제 자동화
- GitHub 계정 또는 토큰 발급 자동화
- Z.ai GLM 외 AI 공급자 지원
- macOS/Linux 패키징
- 규칙 엔진 자체의 전면 재설계
- 사용자용 앱의 품목 추출·Excel 저장 기능 복제
- 서버형 다중 사용자 규칙 관리
- 원격 데이터베이스
- 사용자 동의 없는 샘플 자동 업로드

---

# 3. 기준 시스템 및 호환 계약

## 3.1 기준 기술 스택

관리자 프로그램은 기존 프로젝트와 호환성 및 코드 재사용을 위해 다음 스택을 기본으로 한다.

| 구분 | 기술 |
|---|---|
| 데스크톱 프레임워크 | Electron 33 계열 |
| 런타임 | Electron 내장 Node.js 20 |
| UI | React 18 |
| 상태 관리 | Zustand 5 |
| 스타일 | Tailwind CSS 4 |
| 빌드 | electron-vite 2 / Vite 5 |
| 패키징 | electron-builder 25, Windows portable |
| HTML 파싱 | cheerio 1.0 |
| Excel | SheetJS `xlsx` 0.18.5 |
| 인코딩 | iconv-lite 0.7.x 및 기존 스마트 디코딩 |
| AI | Z.ai GLM Coding Plan 연동 |
| 버전 관리 연동 | 시스템 Git CLI |
| 언어 | JavaScript ESM 우선 |
| 테스트 도구 | Node 내장 assert 또는 기존 프로젝트 테스트 방식 + Electron E2E |

의존성 버전은 가능하면 기존 `app/package.json`과 동일하게 고정한다. 특별한 이유 없이 TypeScript, 다른 상태 관리 도구, 다른 UI 프레임워크를 새로 도입하지 않는다.

## 3.2 기존 데이터 계약

다음 파일 및 코드 계약을 유지한다.

```text
<repo-root>/
  rules.json
  app/
    src/main/lib/
      extract.js
      rules.js
      admin.js
      admin-verify.js
      mhtml.js 또는 관련 MHTML 파서
      rules/
        <rule-id>.json
    analysis/
      make-rules-json.js
      test-rule.js
      test-cart-rules.js
      test-cart-fix.js
      test-feedback.js
      rules/
        <rule-id>.json
```

실제 경로가 다른 경우 하드코딩하지 말고 프로젝트 구조 검사를 통해 탐지한다.

## 3.3 `rules.json` 배포 형식

신규 프로그램은 다음 객체 형식을 생성해야 한다.

```json
{
  "version": "1.0.8",
  "generatedAt": "2026-09-30T00:00:00.000Z",
  "count": 34,
  "rules": []
}
```

요구사항:

- `version`: `major.minor.patch` 문자열
- `generatedAt`: ISO 8601
- `count`: `rules.length`와 동일
- `rules`: 배포 대상 규칙 배열
- 기존 구형 배열 형식을 읽을 수는 있어야 하나, 새로 저장할 때는 객체 형식을 사용한다.
- Git 배포를 선택한 생성·삭제·수정 작업은 기본적으로 patch 버전을 1 증가시킨다.
- Git 배포를 선택하지 않은 로컬 초안 저장은 버전을 자동 증가시키지 않는다.
- 수동으로 버전을 올릴 경우 현재 버전보다 낮은 버전은 차단한다.

---

# 4. 프로그램 분리 전략

## 4.1 권장 디렉터리 구조

기존 저장소 안에 다음 별도 앱을 추가한다.

```text
<repo-root>/
  admin-stand-alone/
    package.json
    electron.vite.config.mjs
    electron-builder.yml
    src/
      main/
        index.js
        ipc.js
        window.js
        services/
          project-service.js
          settings-service.js
          zai-coding-plan-service.js
          rule-service.js
          verify-service.js
          builtin-service.js
          bundle-service.js
          git-service.js
          transaction-service.js
          backup-service.js
          log-service.js
      preload/
        index.js
      renderer/
        index.html
        src/
          main.jsx
          App.jsx
          store/
          pages/
          components/
          styles/
    resources/
      icon.ico
    tests/
      unit/
      integration/
      fixtures/
    README.md
```

공용화가 가능한 기존 로직은 다음 중 하나로 배치한다.

### 권장안 A: 기존 `app/src/main/lib`의 순수 모듈을 직접 재사용

- 관리자 앱의 빌드 설정에서 기존 모듈을 import
- Electron main 객체에 직접 의존하는 코드는 서비스 래퍼로 감싼다.
- 동일 로직 복제를 최소화한다.

### 권장안 B: 공용 패키지 추출

```text
<repo-root>/
  packages/
    rule-core/
      extract.js
      schema.js
      mhtml.js
      verify.js
      bundle.js
```

- 사용자용 앱과 관리자 앱이 같은 공용 모듈을 참조한다.
- 리팩터링 범위가 커질 경우 별도 단계로 수행한다.
- 1차 구현에서는 기능 변경 위험을 줄이기 위해 A안을 우선한다.

## 4.2 독립 실행 조건

관리자 프로그램은 다음 조건을 모두 만족해야 한다.

- 사용자용 `자동 품의 요구 생성기`가 설치 또는 실행되어 있지 않아도 시작 가능
- 사용자용 앱의 로컬 수신 서버 포트 `57330~57335`를 열지 않음
- 사용자용 앱과 다른 Electron `app.setName()` 사용
- 사용자용 앱과 다른 `userData` 경로 사용
- 사용자용 앱과 다른 single-instance lock 사용
- 사용자용 앱의 `settings.json`을 자동 수정하지 않음
- 대상 저장소를 읽고 쓰는 작업은 사용자가 프로젝트를 선택한 뒤에만 수행
- 사용자 규칙 폴더 동기화는 명시적 옵션으로만 수행

권장 식별값:

```text
Product Name: 쇼핑몰 규칙 관리자
Executable: ShoppingMallRuleManager-Portable.exe
App ID: kr.school.shopping-mall-rule-manager
userData: %APPDATA%\쇼핑몰 규칙 관리자\
```

---

# 5. 사용자 역할

## 5.1 관리자

모든 기능을 사용할 수 있는 기본 역할이다.

- 프로젝트 선택
- API 설정
- 규칙 생성·수정·삭제
- 검증
- builtin 등록
- `rules.json` 생성
- Git 커밋·푸시
- 백업·복원

## 5.2 검토자 모드

선택 구현 기능이다.

- API Key 없이 규칙 목록과 검증 결과 열람
- 규칙 JSON 편집 및 diff 확인
- 샘플 테스트 실행
- Git 커밋은 가능하나 AI 생성은 불가

별도 로그인 시스템은 구현하지 않는다. 로컬 단독 도구이므로 OS 사용자 권한과 저장소 접근 권한을 신뢰 경계로 사용한다.

---

# 6. 전체 사용자 흐름

## 6.1 최초 실행

1. 프로그램 실행
2. 시작 화면에서 대상 저장소 자동 탐지
3. 탐지 성공 시 프로젝트 루트, Git branch, 규칙 수, `rules.json` 버전 표시
4. 탐지 실패 시 `[프로젝트 폴더 선택]` 제공
5. 프로젝트 구조 검증
6. 최근 프로젝트로 저장
7. 대시보드 진입

## 6.2 신규 AI 규칙 생성

1. `[새 규칙 만들기]`
2. 방식으로 `[AI 자동 생성]` 선택
3. 쇼핑몰 이름과 기본 규칙 ID 입력
4. 주문서 또는 장바구니 중 하나 이상 선택
5. 화면 종류별 HTML/MHTML 샘플 최대 2개 등록
6. 정답 Excel 등록
7. 샘플 분석 미리보기
8. Z.ai GLM API 연결 확인
9. 생성 실행
10. 규칙 JSON 스키마 검증
11. 샘플 추출 자동 검증
12. 실패 시 최대 3회 AI 자가 수정
13. 생성 결과, 추출 품목, 정답 비교, 경고 표시
14. 변경 파일 diff 확인
15. `[초안 저장]`, `[프로젝트에 적용]`, `[적용 후 Git 배포]` 중 선택

## 6.3 클릭 매핑 규칙 생성

1. `[새 규칙 만들기]`
2. `[클릭 매핑]` 선택
3. HTML/MHTML 파일 열기
4. 안전한 로컬 뷰어에서 원문 렌더링
5. 단계별 요소 클릭
6. 생성된 CSS selector 즉시 표시
7. 추출 미리보기
8. 규칙 메타데이터 입력
9. 저장 전 검증
10. 프로젝트에 적용

## 6.4 기존 규칙 수정

1. 규칙 목록에서 규칙 선택
2. 구조화 폼 또는 JSON 편집기에서 수정
3. JSON 문법 및 스키마 실시간 검증
4. 샘플 파일로 추출 테스트
5. 변경 전후 diff 확인
6. 트랜잭션 적용
7. 필요 시 `rules.json` 재생성 및 Git 배포

## 6.5 규칙 삭제

1. 규칙 선택
2. 삭제 대상 파일과 영향 범위 표시
3. 1차 확인: 규칙 ID 직접 입력
4. 2차 확인: `삭제` 버튼
5. 자동 백업
6. 소스·분석 사본·선택한 사용자 사본 삭제
7. `rules.js` import 및 builtin 배열 항목 제거
8. `rules.json` 재생성
9. 전체 검증
10. Git 커밋·푸시 또는 로컬 적용

---

# 7. 화면 명세

## 7.1 공통 레이아웃

```text
┌──────────────────────────────────────────────────────────────┐
│ 쇼핑몰 규칙 관리자 | 프로젝트명 | branch | 규칙 v1.0.8     │
├──────────────┬───────────────────────────────────────────────┤
│ 대시보드     │                                               │
│ 규칙 관리    │               페이지 본문                     │
│ 새 규칙      │                                               │
│ 검증 센터    │                                               │
│ 배포/Git     │                                               │
│ 백업/복원    │                                               │
│ 설정         │                                               │
├──────────────┴───────────────────────────────────────────────┤
│ 작업 상태 | 최근 로그 | 오류/경고 수                         │
└──────────────────────────────────────────────────────────────┘
```

필수 공통 요소:

- 현재 프로젝트 경로
- Git 현재 branch
- 수정 파일 존재 여부
- `rules.json` 버전과 규칙 수
- 소스 규칙과 `rules.json` 동기화 상태
- 실행 중 작업 표시
- 취소 가능한 작업의 `[취소]`
- 로그 패널 열기
- 민감정보를 제거한 로그 복사

## 7.2 대시보드

카드 항목:

1. **프로젝트 상태**
   - 프로젝트 루트
   - 저장소 유효/무효
   - Git 저장소 여부
   - 현재 branch
   - remote 존재 여부
2. **규칙 상태**
   - 소스 규칙 수
   - 분석용 사본 수
   - `rules.json` 규칙 수
   - 버전
   - 동기화 여부
3. **builtin 상태**
   - 파일은 있으나 `rules.js`에 미등록인 규칙 수
   - 잘못된 import 수
   - `-cart` 우선순위 오류 수
4. **검증 상태**
   - 최근 전체 검증 시각
   - 성공/실패 수
   - 마지막 E2E 결과
5. **Git 상태**
   - staged/unstaged/untracked 수
   - 최근 커밋
   - push 가능 여부
6. **빠른 작업**
   - AI 규칙 생성
   - 클릭 매핑
   - 전체 검증
   - rules.json 재생성
   - 미등록 builtin 등록

## 7.3 설정 화면

### 프로젝트 설정

- 최근 프로젝트 목록
- 프로젝트 폴더 선택
- 시작 시 최근 프로젝트 자동 열기
- 프로젝트 구조 재검사
- 사용자 규칙 동기화 경로
- 분석용 규칙 사본 경로
- 백업 경로
- 로그 보존 일수

### Z.ai Coding Plan 설정

- API Key 비밀번호 필드
- 표시/숨김 토글
- `[저장]`
- `[불러오기]`
- `[연결 확인]`
- 모델 목록
- 기본 모델
- 폴백 허용 여부
- 요청 타임아웃
- 자동 수정 최대 횟수: 기본 3, 허용 범위 0~3

모델 목록은 하드코딩 목록을 기본 제공하되, 연결 확인 시 공식 지원 도구 또는 Z.ai 모델 조회 기능의 사용 가능한 모델 목록을 조회하여 지원 여부를 표시한다. 기존 설정에 저장된 모델이 현재 목록에 없어도 값을 삭제하지 말고 “현재 조회되지 않음” 상태로 보여 준다.

### Git 설정

- Git 실행 파일 자동 탐지
- Git 사용 여부
- 기본 remote: `origin`
- 기본 branch: 현재 branch
- 자동 push 기본값: 해제 권장
- 커밋 메시지 템플릿
- push 전 diff 확인 필수
- force push 금지: 항상 활성

## 7.4 규칙 목록 화면

표 컬럼:

| 컬럼 | 설명 |
|---|---|
| 상태 | 정상, 경고, 오류, 미등록, 동기화 불일치 |
| ID | 예: `gmarket-cart` |
| 이름 | 예: `G마켓 장바구니` |
| 종류 | 장바구니 / 주문서 |
| match | 첫 URL 패턴 및 추가 패턴 수 |
| rowSelector | 행 선택자 요약 |
| 품목 필드 | name/qty/price/option 등 |
| 배송비 | selector/conditional/perFee/없음 |
| builtin | 등록/미등록 |
| bundle | rules.json 포함/미포함 |
| 수정일 | 파일 기준 |
| 테스트 | 최근 성공/실패 |

기능:

- ID, 이름, URL, notes 검색
- 장바구니/주문서 필터
- 정상/경고/오류 필터
- builtin 미등록만 보기
- 여러 규칙 선택 후 일괄 검증
- JSON 열기
- 구조화 편집
- 복제하여 새 ID 생성
- 파일 위치 열기
- 규칙 비교
- 삭제

## 7.5 규칙 상세·편집 화면

탭:

1. **기본 정보**
2. **추출 필드**
3. **선택 행/옵션 행**
4. **배송비**
5. **JSON**
6. **샘플 테스트**
7. **변경 이력**

JSON 편집기 요구사항:

- 줄 번호
- JSON syntax highlighting
- 자동 들여쓰기
- 문법 오류 위치 표시
- 스키마 오류 목록
- 원본 대비 diff
- 저장 전 포맷 정리
- 키 순서 표준화 옵션
- API Key 또는 파일 경로 자동 삽입 금지

## 7.6 AI 생성 화면

### 기본 정보

- 쇼핑몰 표시 이름
- 기본 ID
- 주문서 생성 체크
- 장바구니 생성 체크
- 생성될 ID 미리보기
  - 주문서: `<base-id>`
  - 장바구니: `<base-id>-cart`
- 기본 ID가 `-cart`로 끝나면 내부 base ID에서 제거한 뒤 규칙 종류별 ID를 구성
- ID 정규식: `^[a-z0-9][a-z0-9-]*$`

### 샘플 파일

- 주문서 HTML/MHTML: 0~2개
- 장바구니 HTML/MHTML: 0~2개
- 정답 Excel: 1개 이상 권장
- 허용 확장자:
  - `.html`
  - `.htm`
  - `.mhtml`
  - `.mht`
  - `.xls`
  - `.xlsx`
- 파일별 크기, 인코딩 추정, 문서 URL, DOM 행 후보 수 표시
- 화면 종류를 선택했는데 해당 샘플이 없으면 실행 차단
- 두 화면 종류를 동시에 생성하는 경우 정답 Excel이 어느 화면 기준인지 선택 가능하게 한다.
  - 주문서 기준
  - 장바구니 기준
  - 공통/알 수 없음
- “공통/알 수 없음”이면 각 규칙은 0건 여부만 필수 판정하고 건수·총액 비교는 경고로 처리

### 실행 옵션

- Z.ai GLM 모델
- 자가 수정 사용
- 최대 수정 횟수
- 프로젝트 적용 여부
- `rules.json` 재생성
- 사용자 규칙 폴더 동기화
- builtin 자동 등록
- Git 커밋
- Git push

안전한 기본값:

```text
프로젝트 적용: 켜짐
rules.json 재생성: 켜짐
사용자 규칙 동기화: 꺼짐
builtin 자동 등록: 꺼짐
Git 커밋: 꺼짐
Git push: 꺼짐
```

## 7.7 검증 센터

검증 종류:

- JSON 문법
- 규칙 스키마
- 규칙 ID 중복
- `match` 중복 또는 과도하게 넓은 패턴
- 장바구니 `checkedOnly` 누락
- 필수 필드 selector 존재
- CSS selector 실행 결과
- 샘플 추출 0건
- 정답 건수 비교
- 정답 총액 비교
- 배송비 비교
- `priceIs: lineTotal` 환산
- 옵션 행 추출
- builtin 등록
- 규칙 우선순위
- source/analysis/user/bundle 동기화
- `rules.json` count 일치
- `rules.json` 버전 형식
- Git 변경 파일 범위
- 기존 회귀 스크립트 실행

결과는 규칙별, 파일별, 심각도별로 표시한다.

심각도:

- `ERROR`: 적용·배포 차단
- `WARNING`: 적용 가능하나 명시적 확인 필요
- `INFO`: 참고
- `PASS`: 성공

## 7.8 배포/Git 화면

- 변경 파일 목록
- staged 여부
- unified diff
- 예상 버전 증가
- 커밋 메시지
- remote/branch
- `[선택 파일 Stage]`
- `[Commit]`
- `[Push]`
- `[Commit + Push]`
- `[Git 작업 없이 파일만 적용]`

금지:

- `git add .`
- `git add -A`
- `git push --force`
- 사용자 확인 없는 branch 전환
- 사용자 확인 없는 reset/clean

## 7.9 로그 화면

로그 필드:

```json
{
  "timestamp": "ISO-8601",
  "level": "info|warn|error|debug",
  "operationId": "uuid",
  "step": "generate|verify|save|bundle|builtin|git",
  "message": "사용자 표시 메시지",
  "detail": "민감정보 제거 상세",
  "file": "선택적 상대경로"
}
```

기능:

- 작업별 필터
- 레벨별 필터
- 복사
- 파일 저장
- 민감정보 마스킹
- 최근 N일 자동 정리

절대 로그에 남기지 않는 값:

- Z.ai Coding Plan API Key 전체
- Git credential
- HTML 폼의 비밀번호 값
- 쿠키
- Authorization 헤더

---

# 8. 프로젝트 탐지 및 구조 검증

## 8.1 자동 탐지 우선순위

1. 명령행 `--project <path>`
2. 최근 프로젝트 설정
3. 관리자 EXE가 위치한 폴더
4. 관리자 EXE 상위 폴더
5. `PORTABLE_EXECUTABLE_DIR`
6. 현재 작업 디렉터리
7. 사용자 폴더 아래 최근 사용 경로

## 8.2 저장소 판정 조건

다음 중 핵심 파일이 확인되어야 한다.

```text
rules.json
app/src/main/lib/rules/
app/src/main/lib/rules.js
app/src/main/lib/extract.js
app/analysis/
```

Git 기능을 사용하려면 추가로 `.git`이 존재해야 한다.

## 8.3 구조 검사 결과

```js
{
  ok: true,
  repoRoot: "...",
  gitAvailable: true,
  paths: {
    sourceRulesDir: "...",
    analysisRulesDir: "...",
    rulesJs: "...",
    rulesBundle: "...",
    extractModule: "...",
    verifyModule: "..."
  },
  warnings: [],
  errors: []
}
```

## 8.4 경로 처리 원칙

- Windows 절대경로를 소스에 하드코딩하지 않는다.
- UI에는 절대경로를 표시할 수 있으나 규칙 JSON과 Git 커밋에는 상대경로를 사용한다.
- 파일명 비교는 Windows에서 대소문자 비구분을 고려한다.
- 한글 경로와 공백 경로를 지원한다.
- 모든 텍스트 파일은 UTF-8로 읽고 쓴다.
- PowerShell 코드페이지에 의존하지 않는다.

---

# 9. 규칙 JSON 스키마

## 9.1 기본 구조

```json
{
  "id": "example-cart",
  "name": "예시몰 장바구니",
  "match": [
    "example.com/cart"
  ],
  "rowSelector": "div.cart-item",
  "checkedOnly": {
    "sel": "input[type=checkbox]"
  },
  "fields": {
    "name": {
      "sel": ".product-name"
    },
    "qty": {
      "sel": "input.quantity",
      "attr": "value",
      "regex": "(\\d+)"
    },
    "price": {
      "sel": ".price",
      "regex": "([\\d,]+)원"
    },
    "option": {
      "sel": ".option"
    },
    "url": {
      "sel": "a.product-name",
      "attr": "href"
    }
  },
  "shipping": {
    "mode": "selector",
    "sel": ".shipping-fee",
    "regex": "([\\d,]+)원",
    "freeOver": 30000
  },
  "priceIs": "unit",
  "notes": "규칙 설명"
}
```

## 9.2 필수 필드

| 경로 | 타입 | 조건 |
|---|---|---|
| `id` | string | 필수, kebab-case |
| `name` | string | 필수 |
| `match` | string[] | 필수, 1개 이상 |
| `rowSelector` | string | 필수 |
| `fields` | object | 필수 |
| `fields.name` | object | 필수 |
| `fields.name.sel` | string | 필수 |
| `fields.price` | object | 필수 |
| `fields.price.sel` | string | 필수 |

## 9.3 선택자 필드 형식

```json
{
  "sel": ".selector",
  "attr": "value",
  "regex": "([\\d,]+)",
  "default": 1
}
```

- `sel`: 행 내부 또는 문서 기준 CSS selector
- `attr`: 생략 시 text, 지정 시 해당 attribute
- `regex`: 첫 캡처 그룹 우선
- `default`: 값이 없을 때 기본값
- selector가 여러 요소를 반환할 수 있는 경우 기존 추출기의 결합 규칙을 따른다.

## 9.4 수량

기본값은 1이다.

```json
"qty": {
  "sel": "input[name=qty]",
  "attr": "value",
  "regex": "(\\d+)"
}
```

다음 사례를 지원한다.

- input value
- 텍스트 `3개`
- select의 선택값
- data attribute
- 옵션 행 내부 수량

0 이하, NaN, 비정상적으로 큰 값은 경고한다.

## 9.5 가격과 `priceIs`

```json
"priceIs": "unit"
```

허용값:

- `unit`: 추출값이 단가
- `lineTotal`: 추출값이 수량을 포함한 행 합계이며 단가로 환산

`lineTotal`인 경우 수량이 1보다 크면 기존 엔진 방식으로 단가를 계산한다. 나눗셈과 올림 정책은 사용자용 앱의 기존 `extract.js` 동작을 그대로 재사용해야 한다.

## 9.6 장바구니 선택 항목

장바구니 규칙은 원칙적으로 다음 필드를 가져야 한다.

```json
"checkedOnly": {
  "sel": "input[type=checkbox]"
}
```

검증 원칙:

- 체크된 상품만 추출
- disabled 체크박스 제외
- 전체 선택 체크박스를 상품으로 오인하지 않음
- `checked`, DOM property, 관련 class 등 기존 추출 방식과 호환
- 장바구니 규칙에서 누락 시 기본 `ERROR`
- 쇼핑몰 구조상 체크 상태를 저장 HTML에서 판정할 수 없는 예외는 사용자가 사유를 입력해야 하며 `WARNING`으로 강등 가능

## 9.7 옵션 행 `optionRows`

상품 체크 시 상품 아래 별도 형제 행로 옵션이 나타나는 구조를 지원한다.

예시:

```json
{
  "optionRows": {
    "sel": "tr.option-row",
    "fields": {
      "name": {
        "sel": ".option-name"
      },
      "qty": {
        "sel": ".option-qty",
        "regex": "(\\d+)"
      },
      "price": {
        "sel": ".option-price",
        "regex": "([\\d,]+)원"
      }
    },
    "priceIs": "lineTotal"
  }
}
```

요구사항:

- 현재 상품 행과 다음 상품 행 사이의 옵션 형제 행만 현재 상품에 귀속
- 옵션 행에 상품명이 없으면 부모 상품명으로 폴백 가능
- 옵션명은 별도 필드 또는 상품명에 병합 가능
- 옵션 행마다 수량과 가격을 독립 추출
- 다음 상품의 옵션을 잘못 귀속하지 않음
- 옵션 행이 없을 때 일반 상품 추출이 깨지지 않음

## 9.8 배송비

### selector 방식

```json
{
  "shipping": {
    "mode": "selector",
    "sel": ".shipping strong",
    "regex": "([\\d,]+)원",
    "freeOver": 30000
  }
}
```

- 화면에 표시된 배송비를 추출
- 동일 selector가 여러 판매자 그룹을 반환하면 기존 합산 정책 적용
- `freeOver`가 있으면 상품 합계 이상일 때 배송비를 생성하지 않음
- 숨김 요소나 도서산간 추가비 등 비적용 값을 잘못 합산하지 않도록 검증

### conditional 방식

```json
{
  "shipping": {
    "mode": "conditional",
    "fee": 3000,
    "freeOver": 30000
  }
}
```

### 고정/품목별 방식

기존 엔진에서 지원하는 `fixed`, `perFee` 등 모드가 있으면 그대로 노출한다. 관리자 앱이 임의의 새 모드를 정의하지 않는다.

## 9.9 notes

`notes`에는 다음 정보를 권장한다.

- 화면 종류
- 체크 항목 처리
- 가격 의미
- 수량 위치
- 배송비 정책
- 예외 사항
- 생성 방식
- 검증 샘플
- 정책 확인일

AI 자동 생성 규칙에는 도구 생성 마커를 포함한다.

```text
관리자 도구 자동 생성
```

이 마커가 있는 규칙은 같은 ID로 재실행할 때 자동 덮어쓰기할 수 있다. 사람이 클릭 매핑 또는 수동 편집으로 만든 규칙과 충돌할 경우에는 자동 덮어쓰지 않는다.

---

# 10. AI 규칙 생성

## 10.1 입력 전처리

HTML:

- `<script>`, `<style>`, `<svg>` 제거
- 주석 제거
- 연속 공백 정리
- 의미 없는 대형 inline 데이터 제거
- 비밀번호 필드 값 제거
- 쿠키·토큰 의심 문자열 마스킹
- 문서 URL과 title 별도 추출
- 기본 최대 프롬프트 입력 크기: 샘플당 160KB
- 잘린 경우 시작·중간 관련 DOM·끝부분을 균형 있게 보존하는 전략 권장
- 단순 앞 160KB 절단만으로 상품 영역이 누락되지 않도록 row 후보 중심 압축을 우선 적용

MHTML:

- 루트 `text/html` 파트 추출
- Content-Transfer-Encoding 디코딩
- charset 스마트 디코딩
- 상대 URL 기준 정보 보존
- HTML 전처리 적용

Excel:

- `.xls`, `.xlsx` 지원
- 헤더 자동 탐지
- 품목명, 규격/옵션, 단위, 수량, 단가, 금액, 쇼핑몰, URL 등 인식
- 빈 행 제거
- 배송비 행 별도 구분
- 정답 요약:
  - 품목 건수
  - 배송비 제외 총액
  - 배송비
  - 품목명 목록
  - 수량·단가

## 10.2 프롬프트 구성

프롬프트는 화면 종류별로 분리한다.

### 주문서 프롬프트

- `checkedOnly`를 넣지 않는 것을 기본으로 안내
- 최종 주문/결제 화면의 실제 구매 품목 행 식별
- 표시 단가와 행 합계 구분
- 배송비 표시 위치 식별
- 기존 주문서 규칙 few-shot 제공

### 장바구니 프롬프트

- `checkedOnly` 필수
- 전체 선택과 상품 선택 구분
- 체크되지 않은 품목 제외
- 판매자 그룹별 배송비 주의
- `priceIs: lineTotal` 및 `perFee` 사례 안내
- `optionRows` 가능성 안내
- 기존 장바구니 규칙 few-shot 제공

few-shot 규칙은 코드에 무제한 복제하지 말고 대상 프로젝트의 정상 builtin 규칙에서 읽는다. 기본 참조 후보:

- `gmarket-cart`
- `naver-cart`
- `coupang`
- `emartmall`
- 옵션 행을 사용하는 규칙
- `lineTotal`을 사용하는 규칙
- selector/conditional 배송비 사례

## 10.3 Z.ai GLM Coding Plan 호출

### 기본 연동 방식: 공식 지원 코딩 도구 브리지

Z.ai GLM Coding Plan은 공식 지원 도구와 제품 환경에서 사용하도록 제공되므로, 관리자 프로그램이 Coding Plan 전용 endpoint를 임의의 일반 목적 API처럼 직접 호출하는 방식을 기본값으로 삼지 않는다.

기본 구현은 기존 프로젝트 개발 환경에서도 사용 중인 **OpenCode** 등 Z.ai 공식 지원 코딩 도구를 브리지로 실행한다.

```text
관리자 앱
  → ZaiToolBridge
  → 공식 지원 코딩 도구(OpenCode 우선)
  → Z.ai Coding Plan endpoint
  → 구조화 JSON 결과
  → 로컬 검증 및 적용
```

요구사항:

- 지원 도구 설치 여부와 버전 확인
- 표준 입력 또는 임시 프롬프트 파일로 작업 요청 전달
- API Key는 command line 인자로 넘기지 않고 process environment 또는 도구의 안전한 설정 저장소 사용
- 작업별 임시 디렉터리와 읽기 허용 파일 목록 제한
- 저장소 전체 수정 권한을 AI 도구에 주지 않음
- AI 도구는 규칙 JSON 후보만 반환하고 실제 파일 반영은 관리자 앱의 TransactionService가 담당
- 결과에 Markdown 설명이 포함되어도 JSON만 추출
- 기본 타임아웃 180초
- 프로세스 취소 및 하위 프로세스 종료 지원
- API Key, Authorization 값, 도구 설정 파일 원문을 로그에서 마스킹

### Coding Plan 연결 정보

OpenAI Chat Completions 호환 도구를 사용할 때의 Coding Plan 전용 Base URL:

```text
https://api.z.ai/api/coding/paas/v4
```

인증 헤더 형식:

```text
Authorization: Bearer <ZAI_CODING_PLAN_API_KEY>
```

모델 기본 후보:

```text
GLM-5.3
GLM-5.3-Flash
```

실제 사용 가능 모델은 가입한 Plan과 공식 지원 도구의 조회 결과를 기준으로 표시한다. 모델명을 소스에 하나만 고정하지 않는다.

### 선택 연동 방식: 직접 OpenAI 호환 호출

직접 호출 모드는 다음 조건을 모두 만족할 때만 설정에서 활성화할 수 있다.

1. Z.ai의 최신 Coding Plan 정책상 해당 프로그램 또는 사용 시나리오가 허용됨을 관리자가 확인
2. 사용자가 “직접 API 호출 사용”을 명시적으로 활성화
3. Coding Plan 전용 Base URL을 사용
4. 일반 API endpoint와 Coding Plan endpoint를 혼동하지 않음
5. 연결 테스트에서 모델 응답을 확인

정책 확인이 되지 않은 상태에서는 직접 호출 모드를 비활성화하고 공식 지원 도구 브리지를 사용한다.

### OpenAI 호환 요청 예시

```json
{
  "model": "GLM-5.3",
  "messages": [
    {
      "role": "system",
      "content": "쇼핑몰 추출 규칙 JSON만 생성한다."
    },
    {
      "role": "user",
      "content": "<전처리된 샘플과 규칙 생성 요청>"
    }
  ],
  "temperature": 0.1,
  "stream": false
}
```

- 낮은 temperature를 사용하여 selector와 JSON 형식의 변동을 줄인다.
- 지원되는 경우 structured output 또는 JSON schema 기능을 우선한다.
- 지원되지 않는 파라미터로 400 오류가 발생하면 최소 호환 파라미터로 1회 재시도한다.

## 10.4 재시도

다음 오류는 자동 재시도한다.

- HTTP 429
- HTTP 500
- HTTP 503
- HTTP 504
- 네트워크 연결 오류
- 일시적 DNS 오류
- 타임아웃은 설정에 따라 1회 재시도 가능

기본 지수 백오프:

```text
1차 실패 → 2초
2차 실패 → 4초
3차 실패 → 8초
```

각 모델당 최대 3회 시도한다.

## 10.5 모델 폴백

- 사용자가 폴백을 허용한 경우에만 실행
- 기존 호환 사슬을 기본값으로 사용
- 예: 선택 모델 → `zaiCodingPlan-2.5-flash` → `zaiCodingPlan-2.0-flash`
- 이미 시도한 모델은 중복 호출하지 않음
- 모델 미지원 404/400은 즉시 다음 모델로 전환 가능
- 인증 실패 401/403은 폴백하지 않고 중단
- 429는 연결 확인 단계에서는 Key 유효로 볼 수 있으나 생성 작업은 재시도 대상으로 처리

## 10.6 응답 파싱

다음 형태를 모두 안전하게 처리한다.

- 순수 JSON 객체
- JSON 배열
- Markdown code fence 안 JSON
- 앞뒤 설명이 붙은 JSON
- 주문서와 장바구니 규칙을 함께 반환한 배열

금지:

- `eval`
- `Function`
- AI가 반환한 임의 JavaScript 실행
- AI가 반환한 파일 경로 사용
- AI가 제안한 shell 명령 자동 실행

## 10.7 생성 직후 검증

1. JSON 문법
2. 스키마
3. ID 강제 교정
4. name 확인
5. match 배열
6. rowSelector
7. fields.name
8. fields.price
9. 장바구니 checkedOnly
10. 샘플 추출
11. 정답 대조
12. 위험한 과다 추출 탐지

AI가 ID를 다르게 반환해도 최종 ID는 UI에서 확정한 값을 사용한다.

---

# 10-A. 한 번에 성공할 가능성을 높이는 다중 생성 전략

> “한 번에 성공”을 절대 보장할 수는 없지만, 아래 방법을 함께 사용하여 첫 생성 성공률을 최대화하고 불필요한 API 호출과 토큰 사용을 줄인다.

## 10-A.1 전략 개요

단일 프롬프트에 전체 HTML을 넣고 규칙 하나를 바로 받는 방식에 의존하지 않는다. 다음 파이프라인을 사용한다.

```text
샘플 사전검사
  → DOM 구조 프로파일링
  → 결정론적 selector 후보 생성
  → 기존 규칙 유사도 검색
  → 압축된 증거 패키지 생성
  → 복수 규칙 후보 생성
  → 로컬 샘플 실행
  → 점수화·최적 후보 선택
  → 필요한 경우에만 1~3회 정밀 수정
```

## 10-A.2 방법 1 — AI 호출 전 샘플 품질 게이트

다음 조건을 먼저 검사하고 미달이면 AI를 호출하지 않는다.

- HTML/MHTML에서 실제 상품 행 후보가 존재
- 주문서/장바구니 URL이 확인됨
- 상품명과 가격으로 보이는 텍스트가 존재
- 장바구니 샘플에 체크 상태 정보가 존재
- 정답 Excel의 품목 건수와 총액을 읽을 수 있음
- 샘플이 로그인 만료, 로딩 화면, 오류 페이지가 아님
- 동일 화면 종류의 두 샘플이 서로 다른 쇼핑몰 페이지가 아님

오류 예:

```text
현재 파일은 상품 페이지가 아니라 로그인 화면입니다.
장바구니에서 상품을 선택한 뒤 다시 캡처해 주세요.
```

샘플 품질 게이트를 통과하지 못하면 AI 호출을 생략하여 quota 낭비를 방지한다.

## 10-A.3 방법 2 — DOM 프로파일러

로컬에서 상품 구조 후보를 먼저 계산한다.

수집 항목:

- 반복되는 DOM subtree
- 반복 행별 텍스트 길이
- 가격 패턴 `[\d,]+원`
- 수량 패턴 `N개`, input value, select value
- 체크박스 포함 여부
- 상품 링크 포함 여부
- 이미지와 상품명 후보
- 동일 class 조합 빈도
- 판매자 그룹 경계
- 배송비 텍스트 위치
- 숨김 요소 여부
- 다음 형제 옵션 행 여부

프로파일 결과 예:

```json
{
  "documentUrl": "https://example.com/cart",
  "rowCandidates": [
    {
      "selector": "div.cart-item",
      "count": 5,
      "checkboxCoverage": 1.0,
      "priceCoverage": 1.0,
      "nameCoverage": 1.0,
      "score": 96
    }
  ],
  "fieldCandidates": {
    "name": [".product-name", "a.title"],
    "qty": ["input.qty[value]", ".quantity"],
    "price": [".sale-price", ".item-total"]
  }
}
```

AI에는 원본 전체보다 이 프로파일과 관련 DOM 조각을 우선 제공한다.

## 10-A.4 방법 3 — 결정론적 selector 후보 생성

AI 호출 전에 자체 알고리즘으로 후보 규칙을 3~10개 만든다.

후보 조합:

- 반복 행 selector 상위 N개
- 상품명 selector 상위 N개
- 가격 selector 상위 N개
- 수량 selector 상위 N개
- 체크박스 selector
- 배송비 selector

각 후보를 실제 기존 `extract.js`로 실행하고 다음 점수를 계산한다.

```text
총점 100점
- 추출 1건 이상: 20
- 정답 건수 일치: 20
- 정답 총액 2% 이내: 25
- 모든 이름 존재: 10
- 모든 가격 양수: 10
- 수량 유효: 5
- 장바구니 체크 항목만 포함: 10
```

결정론적 후보가 90점 이상이면 AI 없이 성공 후보로 제시한다.

## 10-A.5 방법 4 — 기존 규칙 유사도 검색

현재 34개 규칙에서 새 샘플과 구조적으로 유사한 규칙을 찾는다.

유사도 특징:

- table/tr 구조
- div/list 구조
- checkbox 위치
- input 수량
- line total 사용
- 판매자별 배송비
- optionRows
- URL 및 쇼핑몰 플랫폼 흔적
- class 이름 토큰
- 결제 솔루션/쇼핑몰 엔진 공통 구조

가장 유사한 규칙 3~5개만 few-shot으로 제공한다. 무관한 규칙을 모두 넣지 않아 토큰을 절약하고 혼선을 줄인다.

## 10-A.6 방법 5 — 증거 중심 프롬프트

프롬프트는 원본 HTML 덤프 대신 다음 순서로 구성한다.

1. 고정 JSON schema
2. 화면 종류별 필수 조건
3. 정답 요약
4. DOM 프로파일
5. selector 후보와 로컬 실행 점수
6. 상품 행 후보의 최소 DOM 조각
7. 배송비 주변 DOM
8. 체크박스 주변 DOM
9. 유사 규칙 3개
10. 금지사항

이 방식은 토큰 사용량을 줄이고 모델이 핵심 구조에 집중하게 한다.

## 10-A.7 방법 6 — 한 번의 요청에서 복수 후보 생성

AI에게 규칙 하나만 요청하지 않고 서로 다른 접근의 후보를 최대 3개 생성하도록 요청한다.

```json
{
  "candidates": [
    {
      "strategy": "stable-class",
      "rule": {}
    },
    {
      "strategy": "attribute-based",
      "rule": {}
    },
    {
      "strategy": "relative-structure",
      "rule": {}
    }
  ]
}
```

관리자 앱이 세 후보를 모두 로컬 실행하여 가장 높은 점수의 후보를 선택한다.

장점:

- API 호출 1회로 여러 selector 접근 확보
- 불안정한 class와 안정적인 attribute 접근 비교
- 첫 후보 실패 시 추가 API 호출 없이 대체 가능

## 10-A.8 방법 7 — 두 샘플 교차 검증

같은 화면 종류의 샘플이 2개이면 후보 규칙을 두 샘플 모두에 실행한다.

선택 기준:

- 두 샘플 모두 0건이 아님
- selector coverage가 안정적
- 한 샘플에서만 존재하는 난수 class 의존도가 낮음
- 품목 수가 달라도 필드 추출률이 유지됨
- 체크/미체크 샘플이 있으면 checkedOnly 정확도 확인

한 샘플에서만 성공한 규칙은 배포 후보가 아니라 경고 후보로 처리한다.

## 10-A.9 방법 8 — 정답 역산

정답 Excel의 수량·단가·총액을 이용해 가격 의미를 자동 판정한다.

예:

```text
HTML 가격 30,000원, 수량 3, 정답 단가 10,000원
→ priceIs = lineTotal 가능성 높음
```

다음 후보를 모두 시험한다.

- 추출 가격을 단가로 사용
- 추출 가격을 lineTotal로 사용
- 할인 전 가격 제외
- 쿠폰/결제 예정 가격 우선
- 품목별 합계와 주문 총액 구분

가장 정답에 가까운 의미를 선택하고 AI 프롬프트에도 이 판정 근거를 제공한다.

## 10-A.10 방법 9 — 배송비 분리 판정

상품 규칙이 맞더라도 배송비 때문에 전체 검증이 실패하지 않도록 상품 추출과 배송비 추출을 별도 점수화한다.

1. 상품 selector 먼저 확정
2. 배송비 후보만 별도 분석
3. selector/conditional/freeOver/perFee 후보 실행
4. 판매자 그룹별 중복 합산 검사
5. 무료배송 정책 문구와 실제 표시값 구분

상품 규칙 성공, 배송비 실패 상태를 별도로 표시하여 전체 규칙을 처음부터 다시 만들지 않는다.

## 10-A.11 방법 10 — 클릭 매핑 자동 보완

AI 후보가 일부 필드만 실패하면 전체를 다시 생성하지 않고 사용자가 실패 필드만 클릭한다.

예:

```text
행/상품명/수량 성공
가격 실패
→ 사용자에게 가격 요소만 클릭 요청
→ 기존 후보에 fields.price만 병합
→ 즉시 재검증
```

부분 보완 가능 필드:

- rowSelector
- checkedOnly
- name
- qty
- price
- option
- optionRows
- shipping

## 10-A.12 방법 11 — 단계별 생성

복잡한 페이지는 한 요청에서 전체 규칙을 만들지 않고 단계별로 처리할 수 있다.

1. 상품 행과 체크박스
2. 상품명·수량·가격
3. 옵션 행
4. 배송비
5. 최종 통합

각 단계 결과를 로컬 실행한 뒤 다음 단계로 진행한다. 오류 원인이 명확해져 수정 토큰을 줄일 수 있다.

## 10-A.13 방법 12 — 무AI 완성 경로

Z.ai quota 부족, 연결 실패, 정책 제한 상황에서도 작업을 완료할 수 있어야 한다.

```text
DOM 프로파일
  → 자동 selector 후보
  → 로컬 점수화
  → 필요한 필드 클릭 보완
  → 정답 대조
  → 규칙 저장
```

무AI 모드는 1차 버전의 필수 기능이다. AI는 성공률을 높이는 보조 수단이지 프로그램 실행의 필수 조건이 아니다.

## 10-A.14 최종 후보 선택 기준

```text
필수 통과:
- 추출 0건 아님
- 필수 필드 존재
- JSON schema 정상
- 장바구니 checkedOnly 정상

우선순위:
1. 두 샘플 모두 성공
2. 정답 건수 일치
3. 정답 총액 오차 최소
4. 안정적 attribute selector
5. 짧고 명확한 selector
6. 난수 class 의존도 낮음
7. 옵션과 배송비 정확
```

동점이면 더 단순하고 안정적인 selector를 선택한다.

---

# 11. 자동 검증 및 자가 수정

## 11.1 판정 기준

### 무조건 실패

- 추출 중 예외
- 추출 결과 0건
- 필수 필드 누락
- 모든 상품명이 빈 문자열
- 모든 가격이 0 또는 NaN
- 장바구니인데 unchecked 상품이 포함됨이 확인됨
- selector가 문서 전체를 과도하게 선택하여 비상품 행이 다수 포함됨
- 규칙 ID 또는 파일명이 허용 형식이 아님

### 단일 화면 종류 + 정답 기준 명확

- 품목 건수 일치
- 배송비 제외 총액 비교
- 총액 허용 오차 기본 2%
- 수량 비교
- 품목명 유사도는 경고 지표로 제공
- 배송비는 별도 비교
- 정답 구조상 단가 반올림이 있으면 기존 엔진 결과 기준을 따른다.

### 두 종류 동시 생성 + 정답 기준 불명확

- 각 규칙 0건 여부는 필수
- 건수·총액 불일치는 경고
- 사용자가 결과를 선택 승인해야 적용 가능

## 11.2 자가 수정 입력

수정 프롬프트에는 다음을 포함한다.

- 직전 규칙 JSON
- 샘플의 축약 HTML
- 실제 추출 결과
- 추출 건수
- 배송비 제외 합계
- 품목명 목록
- 정답 요약
- 발견된 오류
- 가능한 원인 안내
  - rowSelector 불일치
  - fields selector 불일치
  - `priceIs` 누락
  - 수량 포함 총액 오인
  - 옵션 형제 행 구조
  - checkedOnly 누락
  - match URL 오류
  - 숨김 행 포함
  - 배송비 selector 과다 선택

## 11.3 수정 반복

- 기본 최대 3회
- 매 회차 새 규칙을 메모리에만 유지
- 검증에 성공한 결과만 적용 후보가 됨
- 이전 회차와 동일 JSON이 반환되면 무한 반복 방지를 위해 중단
- 3회 실패 시:
  - 실패 상태로 저장하지 않는 것이 기본
  - 사용자가 `[실패 규칙을 초안으로 저장]`을 명시적으로 선택할 수 있음
  - 프로젝트 배포와 Git push는 차단
  - 로그와 검증 보고서를 저장 가능

## 11.4 검증 결과 계약

```js
{
  ok: false,
  ruleId: "example-cart",
  sampleType: "cart",
  attempts: 3,
  extracted: {
    count: 4,
    subtotal: 52300,
    shipping: 3000,
    items: []
  },
  expected: {
    count: 5,
    subtotal: 62300,
    shipping: 3000
  },
  errors: [],
  warnings: [],
  repairHistory: []
}
```

---

# 12. 클릭 매핑 기능

## 12.1 목적

AI API 없이도 사용자가 화면 요소를 클릭하여 규칙을 생성할 수 있어야 한다. 기존 사용자 앱의 매핑 기능을 독립 관리자 앱으로 이전·재사용한다.

## 12.2 뷰어

- 로컬 HTML/MHTML만 표시
- 외부 네트워크 요청 기본 차단
- JavaScript 기본 비활성 또는 제거
- `webview`보다 격리된 iframe/커스텀 프로토콜 방식 우선
- `nodeIntegration: false`
- `contextIsolation: true`
- 원문 CSS 리소스는 안전한 로컬 프로토콜로 제공
- 클릭 피커 스크립트만 제한적으로 주입
- 사용자 세션 쿠키를 사용하지 않음

## 12.3 기본 단계

1. 상품 행
2. 상품명
3. 수량
4. 단가
5. 배송비
6. 확인 및 저장

각 단계에서 다음을 표시한다.

- 클릭한 요소
- 생성 selector
- 행 기준 상대 selector
- selector 일치 개수
- 첫 5개 추출값
- selector 수정 입력
- 이전/다음/건너뛰기

## 12.4 장바구니 추가 단계

- 체크박스 선택
- 체크 상태 확인
- 전체 선택 체크박스 제외
- 체크되지 않은 샘플 행 테스트

## 12.5 옵션 행 단계

상품 아래에 새 행이 생기는 쇼핑몰을 위해 다음 단계를 지원한다.

1. 옵션 행 활성화
2. 옵션 행 selector
3. 옵션명
4. 옵션 수량
5. 옵션 가격
6. 가격 의미: 단가/행 합계
7. 부모 상품명 폴백 여부

## 12.6 selector 생성 규칙

우선순위:

1. 고유하고 안정적인 `id`
2. 의미 있는 `name`, `data-*`, class 조합
3. 행 기준 상대 selector
4. 구조 기반 `nth-child`

피해야 할 selector:

- 난수형 class 전체 의존
- 지나치게 긴 DOM 절대 경로
- 동적 React/Vue scope hash 단독 의존
- 화면 해상도나 표시 순서에만 의존
- 첫 번째 요소만 우연히 맞는 selector

생성 selector는 최소 두 개 샘플이 있으면 양쪽에서 검증한다.

## 12.7 매핑 완료 조건

- rowSelector가 1개 이상의 후보 행 선택
- name과 price가 각 행에서 추출
- qty 미지정 시 기본 1 명시
- 장바구니면 checkedOnly 지정
- 배송비 미지정 시 “배송비 없음/수동 처리”를 명시적으로 선택
- 추출 미리보기 확인 체크
- 스키마 통과

---

# 13. 규칙 저장 및 파일 동기화

## 13.1 저장 대상

규칙 적용 시 선택 가능한 대상:

1. 필수: `app/src/main/lib/rules/<id>.json`
2. 기본 켜짐: `app/analysis/rules/<id>.json`
3. 선택: 사용자용 앱 userData `rules/<id>.json`
4. 파생 산출물: 루트 `rules.json`
5. 선택: `app/src/main/lib/rules.js` builtin import/배열

## 13.2 트랜잭션 처리

모든 적용은 다음 순서로 수행한다.

1. 프로젝트 write lock 획득
2. 대상 파일 목록 계산
3. 변경 전 스냅샷 생성
4. 임시 디렉터리에 결과 파일 생성
5. JSON/JavaScript 구문 검증
6. 규칙 추출 검증
7. `rules.json` count·순서 검증
8. 원자적 rename으로 실제 파일 반영
9. 적용 후 재검증
10. lock 해제
11. 실패 시 자동 롤백

임시 파일 예:

```text
<userData>/transactions/<operation-id>/
  before/
  after/
  manifest.json
```

## 13.3 충돌 정책

- 동일 ID 없음: 신규 생성
- 동일 ID + `notes`에 자동 생성 마커: 덮어쓰기 허용
- 동일 ID + 수동 규칙: 기본 차단
- 사용자가 강제 덮어쓰기할 경우 diff 확인과 ID 입력 확인 필수
- 대소문자만 다른 ID도 충돌로 처리
- 주문서와 장바구니 ID 파생 충돌을 생성 전에 함께 검사

## 13.4 파일 포맷

- UTF-8
- 2칸 들여쓰기
- 마지막 개행
- 안정적 키 순서
- `JSON.stringify(value, null, 2) + "\n"`
- 불필요한 BOM 금지

---

# 14. builtin 등록

## 14.1 대상

`app/src/main/lib/rules.js`

## 14.2 기능

규칙 디렉터리의 JSON 파일과 `rules.js`를 비교하여 다음을 탐지한다.

- JSON 파일은 있으나 import 없음
- import는 있으나 builtin 배열 없음
- 배열은 있으나 import 없음
- 파일이 삭제됐으나 잔존 import/배열 항목 존재
- 변수명 충돌
- `-cart` 규칙이 일반 규칙 뒤에 있어 우선순위 위험
- 중복 배열 항목

## 14.3 등록 방식

- 기존 파일 포맷을 보존
- 메타 import 앞의 지정 위치에 import 삽입
- builtin 규칙 배열 끝 또는 기존 정렬 정책 위치에 항목 추가
- 같은 쇼핑몰에서는 긴 ID 또는 `-cart` 규칙을 일반 규칙보다 앞에 둠
- 변수명은 규칙 ID를 안전한 JavaScript 식별자로 변환
- 충돌 시 자동 적용하지 않고 사용자에게 제안 이름 표시
- 변경 후 JS parse 검사
- 사용자용 앱 빌드 검사

## 14.4 주의

builtin 등록은 `rules.json` 배포와 별개이다.

- 원격 `rules.json`만으로 사용자 규칙 업데이트가 가능한 경우 builtin 등록 없이도 런타임 규칙으로 동작할 수 있다.
- builtin 등록은 새 EXE에 기본 포함할 필요가 있을 때 수행한다.
- UI에서 이 차이를 명확히 설명한다.

---

# 15. `rules.json` 생성

## 15.1 규칙 수집

- source rules 디렉터리의 `.json`만 수집
- 임시·백업·숨김 파일 제외
- JSON 오류 파일이 하나라도 있으면 생성 차단
- 중복 ID 차단
- 파일명과 `id` 불일치 경고 또는 차단
- 삭제된 규칙이 ORDER에 남아 있어도 전체 생성이 중단되지 않도록 skip + 경고

## 15.2 정렬

기존 `ORDER` 정책을 유지한다.

- 특화 규칙이 일반 규칙보다 앞
- `-cart`가 base보다 앞
- 명시 ORDER 우선
- ORDER에 없는 규칙은 안정적 기준으로 뒤에 추가
- `make-rules-json.js`와 관리자 서비스의 정렬 로직이 분기되지 않도록 하나의 공용 함수로 통합

## 15.3 버전

```js
function bumpPatch("1.0.8") => "1.0.9"
```

- 잘못된 버전은 사용자 수정 전 배포 차단
- 생성만 하고 Git을 사용하지 않으면 기본 유지
- 생성·수정·삭제를 Git 배포할 경우 patch 증가
- 한 트랜잭션에 주문서/장바구니 두 규칙을 추가해도 1회만 증가

## 15.4 동기화 검사

```js
{
  sourceRuleCount: 34,
  bundleRuleCount: 34,
  idsEqual: true,
  contentsEqual: true,
  orderEqual: true,
  countFieldValid: true,
  synced: true
}
```

---

# 16. 규칙 삭제

## 16.1 삭제 대상 계산

- source rule
- analysis rule copy
- 선택한 userData rule copy
- `rules.js` import
- builtin array entry
- `rules.json` bundle entry
- 관련 테스트 fixture는 기본 자동 삭제하지 않음
- fixture가 있으면 목록을 보여 주고 별도 선택

## 16.2 안전 절차

1. 영향 분석
2. 자동 백업
3. ID 직접 입력
4. 삭제 확인
5. 파일 삭제
6. builtin 정리
7. bundle 재생성
8. 전체 동기화 검사
9. 기존 회귀 테스트
10. 커밋 선택

## 16.3 Git 메시지 기본값

```text
chore: <rule-id> 쇼핑몰 규칙 삭제 및 rules.json 갱신
```

---

# 17. Git 연동

## 17.1 사전 검사

- Git 실행 파일 존재
- `.git` 존재
- 현재 branch 확인
- detached HEAD 여부
- merge/rebase/cherry-pick 진행 중 여부
- remote 확인
- 사용자 이름/email 설정
- 작업 트리 상태

merge/rebase 등 진행 중이면 자동 커밋·푸시를 차단한다.

## 17.2 Stage 허용 파일

작업에서 실제 변경한 파일만 stage한다.

예:

```text
app/src/main/lib/rules/<id>.json
app/analysis/rules/<id>.json
app/src/main/lib/rules.js
rules.json
```

관리자 앱 소스 변경은 규칙 배포 작업에 자동 포함하지 않는다.

## 17.3 커밋 메시지

신규:

```text
feat: <쇼핑몰명> 쇼핑몰 규칙 추가 및 rules.json 갱신
```

수정:

```text
fix: <쇼핑몰명> 쇼핑몰 규칙 수정
```

삭제:

```text
chore: <rule-id> 쇼핑몰 규칙 삭제 및 rules.json 갱신
```

## 17.4 push

- 기본 remote `origin`
- 기본 현재 branch
- push 전 커밋 hash와 대상 표시
- `--force` 금지
- 인증 실패 시 로컬 커밋은 유지
- push 실패를 파일 적용 실패로 오인하지 않음
- 성공/부분 성공 상태를 분리 표시

## 17.5 부분 실패 상태

예:

```js
{
  filesApplied: true,
  testsPassed: true,
  committed: true,
  pushed: false,
  message: "로컬 커밋은 완료되었으나 push 인증에 실패했습니다."
}
```

---

# 18. API Key 및 보안

## 18.1 저장

- Electron `safeStorage` 사용 가능 시 암호화 저장
- 사용 불가능한 환경에서는 평문 저장 전에 명시적 경고
- 설정 파일에는 암호화된 payload와 버전만 기록
- 기존 사용자 앱의 평문 `adminZ.ai GLMApiKey`를 자동으로 가져오지 않음
- 사용자가 가져오기를 선택한 경우 1회 마이그레이션 후 원문 표시 금지

## 18.2 프로세스 보안

BrowserWindow:

```js
{
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true
}
```

- preload는 allowlist API만 노출
- 임의 경로 읽기 IPC 금지
- renderer가 shell 명령 문자열을 넘기지 못하게 함
- Git 명령은 main process가 정해진 인자 배열로 구성
- `shell: true` 사용 금지
- 외부 URL은 허용 목록과 사용자 확인 후 OS 브라우저로 열기
- CSP 설정
- 샘플 뷰어에서 원격 스크립트 실행 차단

## 18.3 개인정보 제거

AI 전송 전 선택 옵션:

- 이메일 마스킹
- 전화번호 마스킹
- 주소 마스킹
- 이름 마스킹
- 주문번호 마스킹
- 쿠키/토큰 마스킹

기본값은 모두 켜짐이다. 마스킹 후 DOM selector 구조는 유지한다.

---

# 19. IPC 계약

preload는 `window.adminApi`만 노출한다.

## 19.1 프로젝트

```js
selectProject()
openRecentProject(path)
inspectProject(path)
getProjectStatus()
openPath(relativePath)
```

## 19.2 설정

```js
loadSettings()
saveSettings(partialSettings)
saveZ.ai GLMCredentials(payload)
testZ.ai GLMConnection(payload)
```

## 19.3 파일 선택

```js
pickSamples({ type, maxFiles: 2 })
pickAnswerExcel()
pickRuleFile()
```

renderer가 임의 절대경로를 main에 전달하여 읽게 하지 말고, file picker가 발급한 허용 handle 또는 검증된 경로만 사용한다.

## 19.4 규칙

```js
listRules()
getRule(id)
validateRule(rule)
compareRule(id, draft)
saveRule(draft, options)
deleteRule(id, options)
cloneRule(id, newId)
```

## 19.5 생성

```js
startAiGeneration(request)
cancelOperation(operationId)
startMapping(request)
previewExtraction(request)
```

## 19.6 검증·배포

```js
verifyRule(request)
verifyAll(options)
rebuildRulesBundle(options)
inspectBuiltin()
registerBuiltin(ruleIds)
inspectGit()
commitChanges(request)
pushCommit(request)
```

## 19.7 이벤트

```js
onOperationProgress(callback)
onOperationLog(callback)
onOperationComplete(callback)
onProjectChanged(callback)
```

모든 구독 API는 unsubscribe 함수를 반환해야 한다.

---

# 20. 서비스 인터페이스

## 20.1 RuleService

```js
class RuleService {
  list()
  read(id)
  validate(rule)
  normalize(rule)
  diff(id, draft)
  planWrite(draft, options)
  planDelete(id, options)
}
```

## 20.2 VerifyService

```js
class VerifyService {
  verifySyntax(rule)
  verifySchema(rule)
  verifyAgainstSample(rule, sample)
  compareWithExpected(actual, expected, options)
  verifyProjectConsistency()
}
```

## 20.3 ZaiCodingPlanService

```js
class ZaiCodingPlanService {
  detectSupportedTools()
  listModels(config)
  testConnection(config)
  generateRule(request, signal)
  repairRule(request, signal)
}

class ZaiToolBridge {
  detectAdapters()
  testAdapter(adapterId, config)
  runStructuredTask(adapterId, request, signal)
  normalizeOutput(raw)
}
```

## 20.4 TransactionService

```js
class TransactionService {
  createPlan(changes)
  preview(plan)
  apply(plan)
  rollback(transactionId)
  listHistory()
}
```

## 20.5 GitService

```js
class GitService {
  detect()
  status()
  diff(paths)
  stage(paths)
  commit(message)
  push(remote, branch)
}
```

각 서비스는 UI 메시지와 내부 오류를 분리한다. 오류 객체에는 `code`, `userMessage`, `technicalDetail`, `recoverable`을 포함한다.

---

# 21. 설정 데이터

```json
{
  "schemaVersion": 1,
  "recentProjects": [],
  "lastProject": "",
  "zaiCodingPlan": {
    "mode": "supported-tool-bridge",
    "adapter": "opencode",
    "encryptedApiKey": "",
    "baseUrl": "https://api.z.ai/api/coding/paas/v4",
    "model": "GLM-5.3",
    "fallbackModels": ["GLM-5.3-Flash"],
    "allowFallback": true,
    "allowDirectApi": false,
    "timeoutMs": 180000,
    "maxRepairAttempts": 3
  },
  "git": {
    "enabled": true,
    "remote": "origin",
    "autoPush": false
  },
  "sync": {
    "analysisRules": true,
    "userRules": false,
    "userRulesPath": ""
  },
  "ui": {
    "theme": "system",
    "logPanelOpen": true
  },
  "privacy": {
    "maskEmail": true,
    "maskPhone": true,
    "maskAddress": true,
    "maskName": true,
    "maskOrderId": true
  }
}
```

설정 저장 위치:

```text
%APPDATA%\쇼핑몰 규칙 관리자\settings.json
```

---

# 22. 오류 코드

| 코드 | 의미 |
|---|---|
| `PROJECT_NOT_FOUND` | 프로젝트 루트 없음 |
| `PROJECT_STRUCTURE_INVALID` | 필수 파일/폴더 없음 |
| `PROJECT_LOCKED` | 다른 관리자 작업이 진행 중 |
| `RULE_ID_INVALID` | 규칙 ID 형식 오류 |
| `RULE_CONFLICT` | 동일 ID 수동 규칙 충돌 |
| `RULE_SCHEMA_INVALID` | 스키마 오류 |
| `RULE_EXTRACTION_EMPTY` | 추출 0건 |
| `RULE_EXPECTED_MISMATCH` | 정답 건수/총액 불일치 |
| `RULE_UNCHECKED_INCLUDED` | 체크 안 된 장바구니 품목 포함 |
| `BUNDLE_SYNC_FAILED` | rules.json 동기화 실패 |
| `BUILTIN_UPDATE_FAILED` | rules.js 수정 실패 |
| `ZAI_AUTH_FAILED` | API 인증 실패 |
| `ZAI_RATE_LIMITED` | 요청 제한 |
| `ZAI_UNAVAILABLE` | 서버 과부하/일시 장애 |
| `ZAI_INVALID_RESPONSE` | JSON 규칙 응답 아님 |
| `ZAI_TOOL_NOT_FOUND` | 지원 코딩 도구를 찾을 수 없음 |
| `ZAI_TOOL_VERSION_UNSUPPORTED` | 코딩 도구 버전이 지원 범위 밖 |
| `ZAI_CODING_ENDPOINT_INVALID` | Coding Plan 전용 endpoint 설정 오류 |
| `ZAI_PLAN_QUOTA_EXHAUSTED` | Coding Plan quota 소진 |
| `ZAI_POLICY_CONFIRMATION_REQUIRED` | 직접 호출 전 정책 확인 필요 |
| `GIT_NOT_FOUND` | Git 실행 파일 없음 |
| `GIT_DIRTY_CONFLICT` | 작업 대상 파일에 선행 수정 존재 |
| `GIT_COMMIT_FAILED` | 커밋 실패 |
| `GIT_PUSH_FAILED` | push 실패 |
| `TRANSACTION_APPLY_FAILED` | 파일 반영 실패 |
| `TRANSACTION_ROLLBACK_FAILED` | 자동 복구 실패 |

---

# 23. 테스트 명세

## 23.1 단위 테스트

### 규칙 스키마

- 정상 최소 규칙
- name 누락
- price 누락
- match 빈 배열
- 잘못된 ID
- 장바구니 checkedOnly 누락
- lineTotal
- optionRows
- selector 배송비 + freeOver

### 버전

- `1.0.8 → 1.0.9`
- `1.9.9 → 1.9.10`
- 잘못된 버전 차단
- 한 트랜잭션에서 한 번만 증가

### 정렬

- `mall-cart`가 `mall`보다 앞
- ORDER 등록 규칙 우선
- ORDER 미등록 규칙 안정 정렬
- 삭제된 ORDER 항목 skip

### Z.ai 응답 파싱

- 순수 객체
- 배열
- code fence
- 앞뒤 설명
- 깨진 JSON
- 잘못된 필드
- 다른 ID 반환 시 강제 교정

### 재시도

- 429 → 성공
- 503 3회 → 폴백 성공
- 401 → 즉시 중단
- 사용자 취소
- 타임아웃

### 트랜잭션

- 전체 성공
- 두 번째 파일 쓰기 실패 후 롤백
- bundle 검증 실패 후 롤백
- 기존 파일 백업
- 동일 작업 재실행

## 23.2 통합 테스트

1. 임시 저장소 fixture 생성
2. 신규 주문서 규칙 적용
3. 신규 장바구니 규칙 적용
4. source/analysis 동기화
5. bundle 생성
6. builtin 등록
7. 규칙 삭제
8. 롤백
9. Git 로컬 저장소 커밋
10. push는 mock remote로 검증

## 23.3 규칙 회귀 테스트

기존 프로젝트 명령을 관리자 UI 또는 child process를 통해 실행한다.

```powershell
node app\analysis\test-rule.js <rule.json> <capture.mhtml>
node app\analysis\test-cart-rules.js
node app\analysis\test-cart-fix.js
node app\analysis\test-feedback.js
node app\analysis\test-admin-verify.js
node app\analysis\test-option-rows.js
```

스크립트가 실제로 존재하는지 먼저 확인하고 없는 테스트는 `SKIPPED`로 표시하되, 필수 테스트 목록에서 누락된 경우 경고한다.

## 23.4 관리자 앱 E2E

시나리오:

- 앱 시작
- 프로젝트 자동 탐지
- 규칙 34개 및 bundle 버전 읽기
- 규칙 검색
- 샘플 열기
- 클릭 매핑 row/name 선택
- mock Z.ai GLM 생성
- 자동 검증 성공
- 실패 후 자가 수정 성공
- diff 확인
- 적용
- rollback
- builtin 미등록 탐지
- bundle 동기화 확인
- renderer error 0

E2E 결과 예:

```json
{
  "ok": true,
  "projectCheck": true,
  "ruleCount": 34,
  "bundleVersion": "1.0.8",
  "bundleSynced": true,
  "mappingCheck": {
    "rowClick": true,
    "nameClick": true
  },
  "generationCheck": true,
  "repairCheck": true,
  "transactionCheck": true,
  "rendererErrors": []
}
```

## 23.5 패키징 테스트

- Windows 10 x64
- Windows 11 x64
- 한글 사용자명 경로
- 공백 포함 경로
- 저장소 루트에서 실행
- 저장소 외부에서 실행 후 폴더 선택
- 시스템 Node 미설치
- 시스템 Git 미설치
- 네트워크 차단
- Z.ai GLM 429/503
- 읽기 전용 저장소
- 사용자용 앱과 동시 실행

---

# 24. 수용 기준

## 24.1 필수 기능

- [ ] 별도 Portable EXE로 실행된다.
- [ ] 사용자용 앱을 실행하지 않아도 동작한다.
- [ ] 프로젝트 폴더를 자동 탐지하거나 선택할 수 있다.
- [ ] 현재 `rules.json` 버전·규칙 수·동기화 상태를 표시한다.
- [ ] 규칙 목록 34건을 정상 읽을 수 있다.
- [ ] 주문서만, 장바구니만, 둘 다 생성할 수 있다.
- [ ] 화면 종류별 샘플 최대 2개를 받을 수 있다.
- [ ] `.xls`, `.xlsx` 정답을 읽을 수 있다.
- [ ] Z.ai Coding Plan API Key·모델 저장, 불러오기, 연결 확인이 된다.
- [ ] OpenCode 등 공식 지원 코딩 도구 브리지를 기본 연동으로 사용한다.
- [ ] Coding Plan 전용 Base URL과 일반 API Base URL을 구분한다.
- [ ] API가 없어도 DOM 프로파일·자동 후보·클릭 매핑으로 규칙을 완성할 수 있다.
- [ ] 한 번의 AI 요청에서 최대 3개 후보를 생성하고 로컬 검증으로 최적 후보를 선택할 수 있다.
- [ ] 429/500/503/504에 2/4/8초 재시도를 수행한다.
- [ ] 허용 시 대체 모델로 폴백한다.
- [ ] 생성 규칙의 스키마를 검증한다.
- [ ] 추출 0건을 실패로 판정한다.
- [ ] 정답 건수·총액을 비교한다.
- [ ] 실패 시 최대 3회 자가 수정한다.
- [ ] 클릭 매핑으로 규칙을 만들 수 있다.
- [ ] optionRows를 매핑할 수 있다.
- [ ] 기존 규칙을 편집·복제·삭제할 수 있다.
- [ ] 미등록 builtin을 탐지하고 등록할 수 있다.
- [ ] `rules.json` 객체 형식을 재생성한다.
- [ ] 규칙 생성·수정·삭제 시 patch 버전을 정책에 따라 증가시킨다.
- [ ] 작업 파일만 선택적으로 Git stage한다.
- [ ] commit과 push 결과를 분리 표시한다.
- [ ] 파일 적용 실패 시 자동 롤백한다.
- [ ] API Key가 로그에 노출되지 않는다.

## 24.2 회귀 품질

- [ ] 기존 사용자 앱 `npm run build` 성공
- [ ] 기존 E2E의 `adminCheck.ok === true`
- [ ] `rulesJsonSynced === true`
- [ ] renderer error 0
- [ ] 기존 장바구니 정답 대조 통과
- [ ] 기존 옵션 행 테스트 통과
- [ ] 기존 관리자 검증 테스트 통과

## 24.3 UX

- [ ] 위험 작업 전 변경 파일과 diff가 보인다.
- [ ] 삭제는 2단계 확인을 요구한다.
- [ ] 긴 작업의 현재 단계와 진행률이 보인다.
- [ ] 취소 가능한 네트워크 작업은 취소할 수 있다.
- [ ] 오류 메시지에 사용자가 취할 다음 행동이 포함된다.
- [ ] Git push 실패 시 로컬 결과가 보존되었음을 명확히 알린다.
- [ ] 초안, 프로젝트 적용, Git 배포 상태가 혼동되지 않는다.

---

# 25. 구현 단계

## Phase 0. 기준선 고정

작업:

- 기존 관리자 기능 관련 파일 목록 확정
- 기존 규칙 엔진 import 가능 여부 확인
- 현재 E2E 및 회귀 테스트 실행
- 현재 규칙 수, bundle 버전, Git 상태 기록
- 기존 관리자 IPC 목록 문서화

완료 조건:

- 기존 E2E 19개 샘플 오류 0
- `adminCheck.ok`
- `rulesJsonSynced`
- renderer error 0
- 기준 결과 JSON 보관

## Phase 1. 관리자 앱 골격

작업:

- `admin-stand-alone` Electron 앱 생성
- main/preload/renderer 분리
- 독립 app name/userData/single instance
- Tailwind/React/Zustand 구성
- Windows portable 빌드
- CSP와 보안 옵션 적용

완료 조건:

- dev 실행 성공
- production build 성공
- portable EXE 실행 성공
- 사용자용 앱과 동시 실행 가능

## Phase 2. 프로젝트 탐지와 대시보드

작업:

- 프로젝트 선택
- 자동 탐지
- 구조 검증
- 규칙 목록
- bundle 버전
- builtin 상태
- Git 상태
- 최근 프로젝트

완료 조건:

- 실제 저장소에서 규칙 34건, bundle 버전, synced 상태 표시

## Phase 3. 규칙 조회·편집·검증

작업:

- 규칙 목록
- JSON 편집기
- 구조화 폼
- 스키마 검증
- diff
- 샘플 추출
- 정답 비교

완료 조건:

- 기존 규칙을 수정하지 않고 열람·검증 가능
- 초안 변경이 실제 파일에 즉시 반영되지 않음

## Phase 4. 트랜잭션·백업·bundle

작업:

- 변경 계획
- 스냅샷
- 원자적 적용
- rollback
- source/analysis/user 동기화
- bundle 생성
- 버전 증가

완료 조건:

- 의도적 파일 쓰기 실패 테스트에서 원본 복구

## Phase 5. 클릭 매핑

작업:

- 안전한 MHTML/HTML 뷰어
- 피커 주입
- 6단계 매핑
- checkedOnly
- optionRows
- 미리보기

완료 조건:

- E2E mapping row/name 클릭 통과
- 합성 optionRows fixture 통과

## Phase 6. Z.ai GLM Coding Plan 연동

작업:

- Coding Plan Key 암호화 저장
- OpenCodeAdapter 구현
- 공식 지원 도구 탐지
- Coding Plan 전용 endpoint 설정 검사
- 모델 목록 또는 모델 유효성 검사
- 연결 확인
- DOM 프로파일 및 증거 패키지 전처리
- 단일 요청 복수 후보 생성
- 응답 파싱
- 로컬 후보 점수화
- 재시도
- 모델 폴백
- 무AI 경로
- 취소

완료 조건:

- mock 및 실제 연결 선택 테스트
- Key 로그 노출 없음
- 429/503 재시도 테스트 통과

## Phase 7. 자가 검증·수정

작업:

- `admin-verify.js` 재사용
- 0건 실패
- 정답 건수·총액
- 최대 3회 repair
- 검증 보고서

완료 조건:

- 1회 실패 후 수정 성공 fixture
- 3회 실패 후 배포 차단

## Phase 8. builtin·삭제·Git

작업:

- 미등록 탐지
- `rules.js` 안전 편집
- 삭제 트랜잭션
- Git selective stage
- commit
- push

완료 조건:

- `-cart` 우선순위 보장
- `git add .` 미사용
- push 실패 시 커밋 보존

## Phase 9. 전체 회귀 및 패키징

작업:

- 사용자 앱 build
- 기존 E2E
- 규칙 회귀
- 관리자 앱 E2E
- portable 패키징
- README와 운영 문서

완료 조건:

- 모든 필수 수용 기준 충족
- 배포 EXE와 검증 결과 제공

---

# 26. 예상 파일 변경 목록

## 신규

```text
admin-stand-alone/**
ADMIN_SATAD_ALONE.MD
```

## 공용화 시 수정 가능

```text
app/src/main/lib/admin.js
app/src/main/lib/admin-verify.js
app/src/main/lib/rules.js
app/analysis/make-rules-json.js
app/package.json
```

원칙:

- 기존 관리자 모달을 즉시 삭제하지 않는다.
- 독립 관리자 앱이 안정화된 뒤 F9 모달을 유지/읽기 전용 안내/제거 중 하나로 별도 결정한다.
- 1차 릴리스에서는 기존 F9 기능을 회귀 안전망으로 유지한다.
- 공용화 리팩터링으로 기존 기능이 깨지지 않도록 작은 커밋 단위로 작업한다.

---

# 27. 성능 요구사항

- 규칙 목록 초기 표시: 일반 저장소에서 2초 이내 목표
- 단일 HTML 10MB 로드: 5초 이내 목표
- 대형 MHTML 로드 중 UI 프리즈 방지
- 파일 전처리는 worker thread 또는 비동기 작업 권장
- 로그 10,000행 이상에서 가상 스크롤
- Z.ai 요청 중 렌더러 응답 유지
- 전체 규칙 검사 중 진행률 표시
- 대형 diff는 필요한 범위만 렌더링

---

# 28. 접근성 및 UI 세부

- 모든 버튼 키보드 접근 가능
- focus 표시
- 색상만으로 성공/실패 구분하지 않음
- 오류 메시지에 아이콘+텍스트
- 모달 focus trap
- ESC는 위험 작업을 즉시 확정하지 않고 취소 확인
- API Key 필드 자동완성 비활성 권장
- 진행 로그는 스크린리더용 live region 제공
- 최소 창 크기 지정
- Windows 배율 125%, 150% 확인
- 한국어 기본 UI
- 코드/ID/selector는 monospace
- 금액은 `ko-KR` 형식

---

# 29. 운영 절차

## 29.1 신규 쇼핑몰

1. 장바구니 또는 주문서 화면 확보
2. HTML/MHTML 최대 2개 준비
3. 정답 Excel 준비
4. AI 또는 클릭 매핑 생성
5. 자동 검증
6. 수동 결과 검토
7. 전체 회귀 테스트
8. 프로젝트 적용
9. 필요 시 builtin 등록
10. bundle 생성 및 버전 증가
11. Git commit/push
12. 사용자용 앱에서 업데이트 확인 테스트

## 29.2 쇼핑몰 개편 대응

1. 증상 범위 확인
2. 문제 캡처 확보
3. 기존 규칙으로 단독 테스트
4. selector 또는 가격/배송비 정책 수정
5. 정상·누락·수량·가격·옵션 fixture 검증
6. bundle 재생성
7. Git 배포
8. 변경 이력 기록

## 29.3 복구

1. 백업/복원 화면 진입
2. 작업 ID 선택
3. 변경 파일 목록 확인
4. 복원 미리보기
5. 복원
6. 동기화 및 회귀 테스트
7. 필요 시 Git revert는 별도 사용자 확인 후 수행

---

# 30. 결과 산출물

구현 완료 시 다음을 제공한다.

1. `admin-stand-alone/` 전체 소스
2. `ADMIN_SATAD_ALONE.MD`
3. 관리자 앱 README
4. 개발 실행 명령
5. 빌드 명령
6. portable 패키징 명령
7. 단위·통합·E2E 테스트
8. 테스트 결과 JSON
9. Windows portable EXE
10. 기존 사용자 앱 회귀 테스트 결과
11. 알려진 제한사항
12. 변경된 공용 모듈 목록
13. 보안 점검 결과
14. 운영자용 간단 매뉴얼

권장 명령:

```powershell
cd admin-stand-alone
npm install
npm run dev
npm run test
npm run test:e2e
npm run build

$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win portable --config.win.signAndEditExecutable=false
```

---

# 31. Definition of Done

다음 조건이 모두 충족되어야 완료로 본다.

1. 별도 Portable EXE가 사용자용 앱 없이 실행된다.
2. 실제 프로젝트를 선택하여 현재 규칙 34개와 `rules.json` v1.0.8을 읽고 동기화 상태를 표시한다.
3. 기존 관리자 모달의 핵심 기능이 독립 앱에서 모두 동작한다.
4. 신규 규칙 생성, 자가 검증·수정, 클릭 매핑, 옵션 행, 삭제, builtin 등록, bundle 생성, Git 배포가 검증된다.
5. 모든 변경은 적용 전 diff와 적용 후 검증을 제공한다.
6. 중간 실패 시 기존 규칙을 자동 복구한다.
7. API Key와 인증정보가 로그·Git·오류 보고서에 포함되지 않는다.
8. 기존 사용자 앱 빌드와 E2E가 통과한다.
9. `rulesJsonSynced === true`이다.
10. 관리자 앱 renderer 오류가 0이다.
11. Windows 10/11 portable 실행 검증이 완료된다.
12. 코드에 개발자 PC 절대경로가 남아 있지 않다.
13. `git add .`, force push, 임의 shell 실행을 사용하지 않는다.
14. 구현 및 운영 문서가 실제 UI와 일치한다.

---

# 32. 구현 시 금지사항

- 기존 규칙 스키마를 별도 관리자 앱 전용 형식으로 변경
- AI 응답 코드 실행
- 사용자 확인 없는 파일 삭제
- 백업 없는 `rules.js` 자동 수정
- 검증 실패 규칙의 자동 push
- API Key 평문 로그 출력
- 정책 확인 없이 Coding Plan Key를 일반 목적 API로 직접 사용
- Coding Plan Key를 일반 API endpoint `/api/paas/v4`에 전송
- Z.ai 코딩 도구에 저장소 전체 자동 수정 권한 부여
- HTML 안의 외부 script 실행
- renderer에서 Node.js 직접 접근
- `shell: true`로 Git 실행
- 저장소 전체 stage
- force push
- 절대경로 하드코딩
- 사용자용 앱의 userData를 기본 관리자 저장소로 사용
- 시스템 Node 설치를 전제
- Git push 실패 시 생성 파일을 자동 삭제
- 테스트 fixture를 사용자 확인 없이 삭제

---

# 33. Z.ai 작업 분해 지시

Z.ai는 다음 순서로 작업 계획을 제시한 후 구현한다.

1. **현황 조사**
   - 기존 관리자 UI, IPC, `admin.js`, `admin-verify.js`, picker, rules bundle 코드를 읽는다.
   - 실제 함수·IPC·경로·테스트 이름을 목록화한다.
2. **재사용 설계**
   - Electron 의존 로직과 순수 로직을 분리한다.
   - 복제 없이 공유할 모듈 경계를 정한다.
3. **변경 계획**
   - 신규 파일
   - 수정 파일
   - 위험 요소
   - 롤백 방법
   - 테스트 계획을 먼저 제시한다.
4. **작은 단계 구현**
   - 앱 골격
   - 프로젝트 탐지
   - 규칙 조회
   - 검증
   - 트랜잭션
   - 매핑
   - AI
   - Git 순서로 진행한다.
5. **단계별 테스트**
   - 각 단계 완료 후 관련 테스트를 실행한다.
   - 실패 상태에서 다음 단계로 넘어가지 않는다.
6. **최종 검수**
   - 본 문서의 수용 기준 체크리스트를 실제 결과로 채운다.
   - 생략하거나 미구현한 항목은 이유와 후속 계획을 명시한다.

Z.ai가 기존 코드와 본 문서 사이의 차이를 발견하면 임의로 추정하여 변경하지 말고 다음 형식으로 보고한다.

```text
[차이]
- 문서 기대:
- 실제 코드:
- 호환성 영향:
- 권장 처리:
- 수정 대상:
- 필요한 테스트:
```

---

# 34. 기준 자료

본 명세는 다음 프로젝트 자료를 기준으로 작성한다.

- `SUMMARY.MD`: 현재 버전과 최신 관리자 기능 변경 이력
- `ADMIN.md`: 기존 F9 관리자 모듈 요구사항
- Z.ai 공식 GLM Coding Plan Quick Start 및 Tool Integration 문서: Coding Plan Key, 공식 지원 도구, 전용 endpoint와 사용 범위
- `REPORT.MD`: 기술 스택, 아키텍처, 관리자 파이프라인
- `README.md`: 프로젝트 구조, 개발·빌드·E2E 명령
- `RPD.md`: 구현 이력과 클릭 매핑 요구사항
- `rules.json`: 실제 배포 규칙 형식과 규칙 스키마 사례
- `e2e-result.json`: 현재 E2E 기준 상태
- `AUTO_SELECT.MD`: 장바구니 규칙과 전체 쇼핑몰 호환 시 고려사항
- `Extension.MD`: 브라우저 캡처 채널 및 확장 연동 구조

---

# 35. 현재 기준선

본 명세 작성 시 확인된 기준선:

```text
사용자용 앱 버전: v1.49.9
rules.json 버전: v1.0.8
규칙 수: 34
adminCheck.ok: true
rulesJsonSynced: true
renderer errors: 0
매핑 E2E: rowClick/nameClick 성공
```

개발 시작 시 저장소의 실제 코드와 최신 E2E를 다시 실행하여 기준선을 갱신한다. 숫자나 버전이 증가한 경우 최신 실제 코드와 생성된 E2E 결과를 우선하되, 변경 사유를 작업 보고서에 기록한다.

# 36. Z.ai 공식 문서 기반 설정 요약

본 명세의 Z.ai 연동은 2026-09-30 기준 공식 문서의 다음 내용을 반영한다.

- GLM Coding Plan은 공식 지원 도구와 제품 환경에서 사용한다.
- OpenAI Chat Completions 프로토콜의 Coding Plan 전용 Base URL은 `https://api.z.ai/api/coding/paas/v4`이다.
- 일반 Z.ai API Base URL인 `https://api.z.ai/api/paas/v4`와 구분해야 한다.
- 인증은 `Authorization: Bearer <API_KEY>` 형식이다.
- Individual Plan과 Team Plan은 Key 발급 위치가 다르며 Team Plan Key는 다른 API Key와 상호 교환되지 않는다.
- 공식 문서에 표시되는 지원 모델과 사용 가능 모델은 Plan 및 시점에 따라 달라질 수 있으므로 연결 시 검증한다.
- 현재 공식 문서의 대표 Coding Plan 모델은 GLM-5.3 및 GLM-5.3-Flash이다.
- Coding Plan quota가 소진되면 일반 계정 잔액으로 자동 전환되지 않으며 Plan 갱신 주기를 확인해야 한다.

정책과 모델 목록은 바뀔 수 있으므로 프로그램에 `[공식 설정 다시 확인]` 기능 또는 운영 문서 링크 안내를 제공한다.
