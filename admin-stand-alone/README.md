# 쇼핑몰 규칙 관리자 (단독 실행형)

ADMIN_SATAD_ALONE.MD 명세의 단독 실행형 쇼핑몰 규칙 관리 프로그램. 사용자용 앱 없이
규칙 조회·편집·삭제, AI 생성(생성→검증→Jev 판정), 클릭 매핑, builtin 등록,
rules.json 재생성, Git 커밋을 수행한다.

## 실행

```powershell
npm install
npm run dev      # 개발
npm run build    # 번들
npm run smoke    # OpenCode 브리지 감지 스모크(--smoke-out= 파일 출력)

# 단위·통합 테스트 (20건)
node --test tests/unit/*.test.js tests/integration/*.test.js

# E2E (실제 창으로 프로젝트 탐지·매핑 클릭·설정·생성 파이프라인 검증, JSON 결과 출력)
npx electron . --e2e --e2e-out="$env:TEMP\rule-mgr-e2e.json"
```

배포: `npx electron-builder --win portable` → `release\ShoppingMallRuleManager-Portable.exe`
(패키지 exe는 `--smoke` 까지 검증 — E2E는 저장소 탐지가 필요해 개발 트리에서 실행)

## 현재 구현 (v0.2.0)

- **OpenCode 브리지 감지**(§10.3 1순위): 설치·버전·모델 목록·Z.AI Coding Plan 인증 상태
- **프로젝트 탐지·규칙 목록**(§8): rules.json+.git 기준 상위 저장소 자동 탐지, 최근 프로젝트 기억
- **AI 생성 화면 ↔ 파이프라인 연결**(§7.6·§14): 쇼핑몰 이름/ID·주문서/장바구니 선택·
  화면 종류별 샘플 최대 2개·정답 Excel(+정답 기준 화면 선택) → 프롬프트는 기존
  `admin-text.js`(스키마 문서·few-shot) 재사용 → GLM 후보 3개 → 로컬 검증 → Jev 판정 →
  승인/수정 → 프로젝트 적용(rules.json 재생성·builtin·Git 선택)
- **클릭 매핑**(§12): admin-sample:// 안전 뷰어(원문 스크립트 전부 제거·CSP·피커만 주입·
  외부 네트워크 차단) + 8단계 위자드(행→상품명→수량→단가→배송비→체크박스→옵션행→확인) +
  2샘플 공통 선택자 도출 + input 수량 attr:value 자동 + 추출 미리보기 + 즉시 저장
- **Jev 판정 게이트**(JEV.MD): jev-judge-service(TypeSafe API, 마스킹·오류코드) + decision-gate
- **TYPESAFE_API_KEY safeStorage 저장**(JEV.MD §2.3): 설정 화면에서 저장·삭제, 환경변수 폴백
- **Shadow Mode + 자동 승인 임계값**(§19): 판정 기록(userData/shadow-mode.jsonl)·관리자
  판정 일치율 통계 · 비교 50건+ 일치율 충족 전 자동 승인 설정 자체가 불가(§19.2)
- **로컬 검증기**(§12 계약): rule-verifier — 기존 extract.js 재사용(권장안 A)
- **규칙 관리**: 편집(JSON)·삭제·builtin 등록·rules.json 재생성·Git 커밋

## 공용 모듈(사용자 앱과 공유)

- `app/src/main/lib/admin-text.js` — 프롬프트 빌더·샘플/정답 파싱 순수 모듈(신설).
  사용자 앱 admin.js가 re-export하므로 사용자 앱 API는 변하지 않는다.
- `app/src/main/lib/{mhtml,extract,picker,admin}.js` — 파서·규칙 엔진·피커·규칙 관리 재사용

## 다음 단계

트랜잭션 백업·롤백(§13.2), 규칙 비교(diff) 화면, Shadow 데이터 50건 수집 후 자동 승인 임계값
실측 활성화(§19.2), 패키지 exe 상태에서의 저장소 지정 E2E.

## 주의

- 사용자용 앱과 이름·userData·단일 인스턴스 잠금·수신 포트를 공유하지 않는다.
- `TYPESAFE_API_KEY`는 safeStorage 암호화 저장 또는 환경변수만 사용 — 코드·로그·Git 금지.
- Jev에 전체 HTML/MHTML을 전송하지 않는다(요약 데이터만).
- 생성 결과는 로컬 검증 실패 시 Jev 승인과 무관하게 배포가 차단된다.
