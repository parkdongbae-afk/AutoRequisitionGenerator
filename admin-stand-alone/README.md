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

# 단위·통합 테스트 (38건)
node --test tests/unit/*.test.js tests/integration/*.test.js

# E2E (실제 창으로 프로젝트 탐지·매핑 클릭·설정·생성·트랜잭션 롤백 검증)
npx electron . --e2e --e2e-out="$env:TEMP\rule-mgr-e2e.json"

# 저장소 지정(§8.1 1순위) — 패키지 exe에서도 동일하게 동작
npx electron . --e2e --project="C:\경로\저장소"
```

배포: `npx electron-builder --win portable` → `release\ShoppingMallRuleManager-Portable.exe`
(패키지 exe는 `--project` 지정 E2E까지 자동 검증 완료)

## 현재 구현 (v0.5.0)

- **검증 센터**(§7.7): [전체 검증] 한 번으로 JSON 문법·스키마(column 구조 포함)·ID 중복·
  파일명 불일치·장바구니 checkedOnly(§9.6 예외 몰은 설정으로 WARNING 강등)·match 중복·
  bundle 동기화·count 필드·버전 형식·**-cart 우선순위(§15.2)**를 심각도(ERROR/WARNING/
  INFO/PASS)별 보고 — no-op 스텁 규칙(never_match)은 INFO로 구분
- **규칙 비교**(§7.4): 두 규칙을 선택해 라인 diff로 비교
- **Shadow 픽스처 수집**(§19.2): selector×상품명×추출 정합성×화면종류 72케이스를 Jev로
  판정해 관리자 정답과 비교 기록 — 실사용 50건 전 자동 승인 임계값 데이터 확보
- **트랜잭션 백업·롤백**(§13.2·§16·§29.3): 저장·삭제 모두 스냅샷 → 임시 JSON 검증 →
  원자 적용 → 실패 시 자동 롤백(+bundle 재동기화). 삭제는 2단계 확인, 백업/복원 화면에서 되돌리기
- **변경 전후 diff**(§7.5·§6.4): 편집 패널 diff + 생성 결과 vs 기존 규칙 diff
- **자가 수정 3회 루프**(§11.3): 동일 JSON 중단·Jev reject 폐기·repairHistory 첨부
- **OpenCode 브리지 감지**(§10.3) · **프로젝트 탐지**(§8, --project CLI) ·
  **AI 생성 화면↔파이프라인**(§7.6·§14) · **클릭 매핑**(§12) ·
  **Jev 판정 게이트**(JEV.MD) · **TYPESAFE_API_KEY safeStorage**(§2.3) ·
  **규칙 관리**(편집·삭제·builtin·rules.json 재생성·Git 커밋)

## 공용 모듈(사용자 앱과 공유)

- `app/src/main/lib/admin-text.js` — 프롬프트 빌더·샘플/정답 파싱 순수 모듈.
  사용자 앱 admin.js가 re-export하므로 사용자 앱 API는 변하지 않는다.
- `app/src/main/lib/{mhtml,extract,picker,admin}.js` — 파서·규칙 엔진·피커·규칙 관리 재사용

## 다음 단계

실사용 Shadow 데이터 누적과 자동 승인 임계값 실측 활성화(§19.2 — 픽스처 72건은 보조 데이터),
전체 규칙 샘플 추출 검증(§7.7 뒤쪽 절반 — 캡처 fixture 필요), Git 배포 화면 분리(§7.8).

## 주의

- 사용자용 앱과 이름·userData·단일 인스턴스 잠금·수신 포트를 공유하지 않는다.
- `TYPESAFE_API_KEY`는 safeStorage 암호화 저장 또는 환경변수만 사용 — 코드·로그·Git 금지.
- Jev에 전체 HTML/MHTML을 전송하지 않는다(요약 데이터만).
- 생성 결과는 로컬 검증 실패 시 Jev 승인과 무관하게 배포가 차단된다.
- `rulesJsonSynced` 검사는 CRLF/LF를 정규화해 비교한다(git autocrlf 체크아웃 대응).
