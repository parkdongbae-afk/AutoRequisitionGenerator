# 쇼핑몰 규칙 관리자 (단독 실행형)

ADMIN_SATAD_ALONE.MD 명세의 단독 실행형 쇼핑몰 규칙 관리 프로그램. 사용자용 앱 없이
규칙 조회·편집·삭제, AI 생성(생성→검증→Jev 판정), 클릭 매핑, 트랜잭션 백업·복원,
builtin 등록, rules.json 재생성, Git 커밋을 수행한다.

## 실행

```powershell
npm install
npm run dev      # 개발
npm run build    # 번들
npm run smoke    # OpenCode 브리지 감지 스모크(--smoke-out= 파일 출력)

# 단위·통합 테스트 (30건)
node --test tests/unit/*.test.js tests/integration/*.test.js

# E2E (실제 창으로 프로젝트 탐지·매핑 클릭·설정·생성·트랜잭션 롤백 검증)
npx electron . --e2e --e2e-out="$env:TEMP\rule-mgr-e2e.json"

# 저장소 지정(§8.1 1순위) — 패키지 exe에서도 동일하게 동작
npx electron . --e2e --project="C:\경로\저장소"
```

배포: `npx electron-builder --win portable` → `release\ShoppingMallRuleManager-Portable.exe`
(패키지 exe는 `--project` 지정 E2E까지 자동 검증 완료)

## 현재 구현 (v0.4.0)

- **트랜잭션 백업·롤백**(§13.2·§16·§29.3): 저장·**삭제** 모두 스냅샷 → 임시 JSON 검증 →
  원자 적용 → 실패 시 자동 롤백(+bundle 재동기화). 삭제는 2단계 확인(대상 파일 표시·
  규칙 ID 직접 입력), 이력은 백업/복원 화면에서 되돌리기
- **변경 전후 diff**(§7.5·§6.4): 편집 패널 diff 보기(+n/−n 요약, context 접기) +
  생성 결과를 기존 규칙과 비교하는 diff(신규는 "기존 파일 없음" 표시)
- **자가 수정 3회 루프**(§11.3): 회차별 재검증 + Jev 재판정, 이전과 동일 JSON 반환 시
  즉시 중단(무한 반복 방지), Jev reject면 폐기, repairHistory를 결과에 첨부
- **OpenCode 브리지 감지**(§10.3): 설치·버전·모델 목록·Z.AI Coding Plan 인증 상태
- **프로젝트 탐지**(§8): --project CLI(1순위) → 자동 탐지 → 수동 선택, 최근 프로젝트 기억
- **AI 생성 화면 ↔ 파이프라인**(§7.6·§14): 프롬프트는 admin-text.js(스키마·few-shot) 재사용,
  GLM 후보 3개 → 로컬 검증 → Jev 판정 → 트랜잭션 적용
- **클릭 매핑**(§12): admin-sample:// 안전 뷰어 + 8단계 위자드 + 공통 선택자 도출 +
  input 수량 attr:value 자동 + 추출 미리보기
- **Jev 판정 게이트**(JEV.MD): decision-gate + Shadow Mode(§19) 통계·자동 승인 임계값 게이트
- **TYPESAFE_API_KEY safeStorage 저장**(JEV.MD §2.3)
- **규칙 관리**: 편집·삭제·builtin 등록·rules.json 재생성·Git 커밋

## 공용 모듈(사용자 앱과 공유)

- `app/src/main/lib/admin-text.js` — 프롬프트 빌더·샘플/정답 파싱 순수 모듈.
  사용자 앱 admin.js가 re-export하므로 사용자 앱 API는 변하지 않는다.
- `app/src/main/lib/{mhtml,extract,picker,admin}.js` — 파서·규칙 엔진·피커·규칙 관리 재사용

## 다음 단계

Shadow 데이터 50건 수집 후 자동 승인 임계값 실측 활성화(§19.2), 규칙 비교 선택 화면(§7.4),
검증 센터 통합(§7.7 — 전체 규칙 일괄 검증).

## 주의

- 사용자용 앱과 이름·userData·단일 인스턴스 잠금·수신 포트를 공유하지 않는다.
- `TYPESAFE_API_KEY`는 safeStorage 암호화 저장 또는 환경변수만 사용 — 코드·로그·Git 금지.
- Jev에 전체 HTML/MHTML을 전송하지 않는다(요약 데이터만).
- 생성 결과는 로컬 검증 실패 시 Jev 승인과 무관하게 배포가 차단된다.
- `rulesJsonSynced` 검사는 CRLF/LF를 정규화해 비교한다(git autocrlf 체크아웃 대응).
