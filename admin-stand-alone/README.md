# 쇼핑몰 규칙 관리자 (단독 실행형)

ADMIN_SATAD_ALONE.MD 명세의 단독 실행형 쇼핑몰 규칙 관리 프로그램. 사용자용 앱 없이
규칙 조회·검증·AI 생성 판정을 수행한다.

## 실행

```powershell
npm install
npm run dev      # 개발
npm run build    # 번들
npm run smoke    # OpenCode 브리지 감지 스모크 테스트(--smoke-out= 파일로 결과 출력)
```

배포: `npx electron-builder --win portable` → `release\ShoppingMallRuleManager-Portable.exe`

## 현재 구현 (v0.1.0)

- **OpenCode 브리지 감지**(§10.3 1순위): 설치·버전·모델 목록·Z.AI Coding Plan 인증 상태
- **프로젝트 탐지·규칙 목록**(§8): rules.json+.git 기준 상위 저장소 자동 탐지, 규칙 표
- **Jev 판정 게이트**(JEV.MD): jev-judge-service(TypeSafe API, 마스킹·오류코드) + decision-gate
- **Shadow Mode**(§19): 판정 기록을 userData/shadow-mode.jsonl에 누적
- **로컬 검증기**(§12): rule-verifier — 기존 extract.js 재사용(권장안 A)
- **파이프라인**(§14): GLM 후보 3개 → 로컬 검증 → Jev 판정 → 승인/수정 결정

## 다음 단계

클릭 매핑 UI(§12), 규칙 편집·삭제, builtin 등록, Git 화면, 트랜잭션 백업(§13).

## 주의

- 사용자용 앱과 이름·userData·단일 인스턴스 잠금·수신 포트를 공유하지 않는다.
- `TYPESAFE_API_KEY`는 환경변수에서만 읽고 코드·로그·Git에 기록하지 않는다.
- Jev에 전체 HTML/MHTML을 전송하지 않는다(요약 데이터만).
