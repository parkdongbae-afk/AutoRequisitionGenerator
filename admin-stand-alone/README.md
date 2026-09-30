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

# 단위·통합 테스트 (43건)
node --test tests/unit/*.test.js tests/integration/*.test.js

# E2E (실제 창으로 프로젝트 탐지·매핑 클릭·설정·생성·트랜잭션 롤백 검증)
npx electron . --e2e --e2e-out="$env:TEMP\rule-mgr-e2e.json"

# 저장소 지정(§8.1 1순위) — 패키지 exe에서도 동일하게 동작
npx electron . --e2e --project="C:\경로\저장소"
```

배포: `npx electron-builder --win portable` → `release\ShoppingMallRuleManager-Portable.exe`
(패키지 exe는 `--project` 지정 E2E까지 자동 검증 완료)

## 현재 구현 (v0.6.0)

- **샘플 추출 검증**(§7.7 후반): 캡처 폴더(하위 포함, 최대 60개)를 훑어 문서↔규칙 매칭
  (URL cart 힌트로 -cart 규칙 우선) → 추출 실행 → 같은 폴더 정답 Excel과 건수·총액(2%) 대조 —
  0건·불일치 ERROR, 정답 없음/미매칭 INFO
- **배포/Git 화면**(§7.8): 변경 파일 목록(staged/변경/신규)·선택 stage(명시 파일만 —
  `add .`/`-A` 인자 자체 금지)·diff 미리보기·커밋 메시지·Commit/Push 분리(§17.5 —
  push 실패 시 로컬 커밋 보존 보고)·미푸시 커밋 수·force push 없음
- **검증 센터**(§7.7): JSON 문법·스키마(column 열구조 분기)·ID 중복·파일명 불일치·
  장바구니 checkedOnly(§9.6 예외 몰은 설정으로 WARNING 강등)·match 중복·bundle 동기화·
  **-cart 우선순위(§15.2)**를 ERROR/WARNING/INFO/PASS 등급 보고 — no-op 스텁(never_match)은 INFO
- **규칙 비교**(§7.4) · **Shadow 픽스처 수집**(§19.2, 72케이스) ·
  **트랜잭션 백업·롤백**(§13.2·§16) · **변경 전후 diff**(§7.5) · **자가 수정 3회 루프**(§11.3) ·
  **OpenCode 브리지**(§10.3) · **--project 탐지**(§8) · **AI 생성↔파이프라인**(§7.6·§14) ·
  **클릭 매핑**(§12) · **Jev 게이트**(JEV.MD) · **safeStorage**(§2.3) · 규칙 관리 전반

## 공용 모듈(사용자 앱과 공유)

- `app/src/main/lib/admin-text.js` — 프롬프트 빌더·샘플/정답 파싱 순수 모듈.
  사용자 앱 admin.js가 re-export하므로 사용자 앱 API는 변하지 않는다.
- `app/src/main/lib/{mhtml,extract,picker,admin}.js` — 파서·규칙 엔진·피커·규칙 관리 재사용

## 다음 단계

운영: 실사용 Shadow 데이터 누적 후 자동 승인 임계값 활성화(§19.2).
개발 여유: 검색·필터 확장(§7.4), 로그 화면(§7.9), 트랜잭션 임시 파일 구조 정리(§13.2 tmp).
