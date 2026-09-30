# JEV.MD
# Z.ai Coding Plan과 Jev를 활용한 쇼핑몰 규칙 검증·판정 시스템 개발 명세

- **문서 목적:** Z.ai Coding Plan 코딩 에이전트가 Jev 연동 기능을 직접 구현할 수 있도록 제공하는 실행 명세
- **대상 프로젝트:** 자동 품의 요구 생성기 / 단독 실행형 쇼핑몰 규칙 관리자
- **작성일:** 2026-09-30
- **문서 버전:** 1.0.0
- **기본 언어:** JavaScript ESM
- **실행 환경:** Electron 내장 Node.js 20, Windows 10/11 x64

---

# 0. Z.ai Coding Plan에 전달할 최상위 지시문

현재 프로젝트에 TypeSafe Jev 기반의 규칙 평가 시스템을 추가한다.

다음 원칙을 반드시 따른다.

1. Z.ai GLM은 쇼핑몰 규칙 JSON의 생성과 수정만 담당한다.
2. Jev는 규칙 JSON이나 코드를 직접 생성하지 않는다.
3. Jev는 후보 선택, 의미적 품질 평가, 실패 원인 분류, 배포 가능 여부 판정만 담당한다.
4. 품목 건수, 수량, 단가, 합계, 배송비, 오차율, JSON 스키마, CSS selector 실행 결과는 기존 JavaScript 코드로 검증한다.
5. Z.ai Coding Plan API Key와 TypeSafe API Key는 서로 다른 별도 키로 관리한다.
6. Jev 결과만으로 규칙을 자동 배포하지 않는다.
7. 정확한 로컬 검증을 모두 통과한 규칙만 Jev 의미 검증 대상으로 보낸다.
8. Jev 신뢰도가 낮으면 자동 배포하지 않고 GLM 수정 또는 관리자 검토로 보낸다.
9. 초기 도입은 Shadow Mode로 운영하여 Jev 판정과 관리자 판정을 비교한다.
10. 구현 전에 현재 프로젝트 구조와 기존 규칙 검증 모듈을 조사하고 변경 계획을 먼저 제시한다.
11. 기존 테스트가 실패한 상태에서는 다음 단계로 진행하지 않는다.
12. API Key, 쿠키, 주문자 개인정보, 인증 헤더를 로그나 Git에 기록하지 않는다.

---

# 1. 핵심 개념

## 1.1 역할 구분

| 구성 요소 | 역할 |
|---|---|
| Z.ai GLM Coding Plan | 코드 작성, 규칙 후보 생성, 규칙 수정, 실패 원인 설명 |
| TypeSafe Jev | 후보 선택, 품질 평가, 위험 판정, 승인·수정·검토·거절 결정 |
| 기존 JavaScript 검증기 | 건수·가격·총액 계산, 스키마 검사, selector 실행, 정답 비교 |
| 관리자 | 신뢰도가 낮거나 위험한 결과의 최종 승인 |

Jev는 코드나 긴 텍스트를 생성하는 일반 LLM으로 사용하지 않는다. Jev는 미리 정의된 선택지, 점수 또는 참·거짓 확률을 반환하는 구조화된 의사결정 모델로 사용한다.

## 1.2 권장 전체 구조

```text
Z.ai GLM
  └─ 쇼핑몰 규칙 JSON 후보 최대 3개 생성
       ↓
기존 로컬 규칙 엔진
  ├─ JSON 스키마 검사
  ├─ HTML/MHTML 추출 실행
  ├─ 정답 Excel 건수·수량·총액 비교
  ├─ checkedOnly 검사
  ├─ 배송비 검사
  └─ optionRows 검사
       ↓
Jev
  ├─ selector 안정성 평가
  ├─ 상품명 품질 평가
  ├─ 실패 원인 분류
  ├─ 수정 전략 선택
  └─ 배포 가능성 판정
       ↓
코드 기반 최종 게이트
  ├─ 자동 승인
  ├─ GLM 수정 요청
  ├─ 관리자 검토
  └─ 후보 폐기
```

---

# 2. API Key

두 종류의 API Key가 필요하다.

```text
ZAI_API_KEY       = Z.ai GLM Coding Plan용
TYPESAFE_API_KEY  = TypeSafe Jev용
```

Z.ai Coding Plan 사용량으로 Jev API를 호출할 수 없다고 가정한다. Jev는 TypeSafe API와 별도 인증키를 사용한다.

## 2.1 Windows PowerShell 임시 설정

현재 PowerShell 창에서만 사용한다.

```powershell
$env:ZAI_API_KEY="Z.ai-Coding-Plan-Key"
$env:TYPESAFE_API_KEY="TypeSafe-Jev-Key"
```

## 2.2 Windows 사용자 환경변수 저장

```powershell
[Environment]::SetEnvironmentVariable(
  "TYPESAFE_API_KEY",
  "TypeSafe-Jev-Key",
  "User"
)
```

환경변수를 저장한 뒤 터미널과 OpenCode를 다시 실행한다.

## 2.3 프로그램 내부 저장

Electron 프로그램에서 Key 저장이 필요하면 다음 원칙을 적용한다.

- Electron `safeStorage` 사용
- 평문 설정 파일 저장 금지
- renderer에 API Key 원문 전달 금지
- 로그 마스킹
- Git 대상 파일에 Key 포함 금지
- 오류 객체에 Authorization 헤더 포함 금지
- command line 인자로 Key 전달 금지

---

# 3. Z.ai Coding Plan 설정

Z.ai Coding Plan은 OpenCode 등 공식 지원 코딩 도구를 통해 사용한다.

## 3.1 Coding Tool Helper

```powershell
npx @z_ai/coding-helper
```

화면에서 다음을 설정한다.

```text
1. GLM Coding Plan 선택
2. 가입한 지역 및 Plan 선택
3. Z.ai Coding Plan API Key 입력
4. OpenCode 선택
5. 설정 적용
```

설정 후 실행한다.

```powershell
opencode
```

---

# 4. TypeSafe Jev Skill 설치

프로젝트 루트에서 실행한다.

```powershell
cd C:\프로젝트경로
npx skills add typesafe-ai/skills --skill typesafe-ai
```

에이전트 선택 화면이 표시되면 OpenCode를 선택한다.

전역 설치가 필요한 경우:

```powershell
npx skills add typesafe-ai/skills --skill typesafe-ai -g
```

업데이트:

```powershell
npx skills update
```

---

# 5. OpenCode에 입력할 작업 요청

다음 프롬프트를 그대로 사용할 수 있다.

```text
TypeSafe skill을 사용해 줘.

현재 프로젝트는 Electron + JavaScript 프로젝트다.
Z.ai GLM은 쇼핑몰 파싱 규칙 후보를 생성하고,
TypeSafe Jev는 생성된 후보를 평가하는 judge로 사용한다.

Jev가 직접 코드를 생성하거나 수치 계산을 하지 않게 하고,
다음 역할만 수행하도록 설계하고 구현해 줘.

1. 규칙 후보의 selector 안정성 평가
2. 상품명 추출 결과의 의미적 품질 평가
3. 실패 원인 분류
4. 수정 전략 선택
5. 자동 배포 가능 여부 판정

건수, 수량, 단가, 합계, 배송비 계산은 기존 JavaScript 코드로 처리한다.
Jev 신뢰도가 낮으면 자동 배포하지 말고 GLM 수정 또는 관리자 검토로 보낸다.

TypeSafe API Key는 TYPESAFE_API_KEY 환경변수에서만 읽고,
코드, 로그, 설정 파일 또는 Git에 기록하지 마.

먼저 다음 작업을 수행해 줘.

1. 기존 프로젝트 구조 조사
2. 기존 규칙 생성·검증·Git 배포 흐름 조사
3. 재사용할 기존 함수 목록 작성
4. 신규 파일과 수정 파일 목록 작성
5. 보안 위험과 롤백 방법 작성
6. 단위·통합·E2E 테스트 계획 작성

위 계획을 먼저 보여주고 승인 전에는 기존 파일을 수정하지 마.
```

---

# 6. JavaScript SDK 설치

프로젝트의 실제 패키지 위치에서 설치한다.

```powershell
cd app
npm install @typesafe-ai/sdk
```

단독 관리자 앱이 별도 패키지인 경우:

```powershell
cd admin-stand-alone
npm install @typesafe-ai/sdk
```

SDK 버전은 실제 설치 가능한 안정 버전을 확인하고 `package.json`에 정확한 버전으로 고정한다.

```json
{
  "dependencies": {
    "@typesafe-ai/sdk": "<검증된-정확한-버전>"
  }
}
```

`latest`에만 의존하지 않는다.

---

# 7. 권장 파일 구조

```text
admin-stand-alone/
  src/
    main/
      services/
        zai-service.js
        jev-judge-service.js
        rule-verifier.js
        candidate-ranker.js
        decision-gate.js
        settings-service.js
      ipc/
        jev-ipc.js
    preload/
      index.js
    renderer/
      components/
        JevResultPanel.jsx
        RuleDecisionBadge.jsx
        ShadowModeCompare.jsx
  tests/
    unit/
      jev-judge-service.test.js
      candidate-ranker.test.js
      decision-gate.test.js
    integration/
      rule-judge-pipeline.test.js
    fixtures/
      jev/
```

기존 사용자 앱 안에 구현하는 경우 실제 프로젝트 구조에 맞게 배치한다.

---

# 8. Jev 서비스 책임

## 8.1 `jev-judge-service.js`

담당 기능:

- API Key 존재 여부 확인
- TypeSafe API 호출
- 요청 state 크기 제한
- 개인정보 마스킹
- Choice·Score·Noul 질문 구성
- 응답 구조 검증
- timeout
- 재시도
- 오류 정규화
- 로그 마스킹

담당하지 않는 기능:

- 파일 저장
- Git 실행
- 규칙 JSON 수정
- 금액 계산
- selector 실행
- 자동 배포

## 8.2 서비스 인터페이스

```js
class JevJudgeService {
  isConfigured()
  testConnection()
  judgeCandidate(input, options)
  classifyFailure(input, options)
  compareCandidates(input, options)
  evaluateDeployment(input, options)
}
```

---

# 9. HTTP API 구현 예시

SDK 변경 영향을 줄이기 위해 HTTP API를 직접 호출하는 어댑터를 둘 수 있다.

```js
const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

export async function judgeRuleCandidate({
  rule,
  extraction,
  expected,
  diagnostics,
  signal
}) {
  const apiKey = process.env.TYPESAFE_API_KEY;

  if (!apiKey) {
    throw new Error("TYPESAFE_API_KEY가 설정되지 않았습니다.");
  }

  const state = {
    rule: {
      id: rule.id,
      rowSelector: rule.rowSelector,
      checkedOnly: rule.checkedOnly,
      fields: rule.fields,
      optionRows: rule.optionRows,
      shipping: rule.shipping,
      priceIs: rule.priceIs
    },

    extraction: {
      itemNames: extraction.items.map((item) => item.name),
      emptyNameCount: extraction.items.filter(
        (item) => !item.name?.trim()
      ).length,
      selectorMatchCounts: diagnostics.selectorMatchCounts,
      suspiciousClassNames: diagnostics.suspiciousClassNames
    },

    expected: {
      itemNames: expected.items.map((item) => item.name)
    }
  };

  const response = await fetch(JEV_ENDPOINT, {
    method: "POST",
    signal,

    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      model: "jev-latest",

      state,

      questions: {
        selector_stable: {
          type: "noul",
          instructions:
            "이 규칙의 CSS selector가 임시 난수 class나 지나치게 구체적인 DOM 순서가 아니라 반복 사용 가능한 안정적인 구조에 기반하는가?",
          criteria: {
            true:
              "의미 있는 id, name, data attribute 또는 짧고 반복 가능한 구조를 사용한다.",
            false:
              "난수 class, 긴 절대 경로 또는 우연한 nth-child 구조에 크게 의존한다."
          }
        },

        name_quality: {
          type: "score",
          instructions:
            "추출된 상품명이 실제 상품을 구별할 수 있을 정도로 의미 있고 완전한가?",
          criteria: [
            "상품명이 비어 있거나 가격·버튼·배송 문구이다.",
            "일부 상품명은 맞지만 불필요한 문구가 많다.",
            "대부분 올바르지만 옵션이나 일부 정보가 부족하다.",
            "실제 상품을 명확히 구별할 수 있는 완전한 상품명이다."
          ]
        },

        failure_cause: {
          type: "choice",
          instructions:
            "현재 규칙에서 가장 가능성이 높은 실패 원인은 무엇인가?",
          criteria: {
            row_selector:
              "상품 행 선택자가 잘못되었거나 상품이 아닌 행을 포함한다.",
            name_selector:
              "상품명 선택자가 잘못되었다.",
            quantity_selector:
              "수량 선택자 또는 값 속성이 잘못되었다.",
            price_selector:
              "판매가, 할인 전 가격 또는 행 합계를 잘못 선택했다.",
            option_rows:
              "상품 아래의 별도 옵션 행을 처리해야 한다.",
            shipping:
              "배송비 선택자 또는 무료배송 조건이 잘못되었다.",
            checked_only:
              "체크된 장바구니 항목 필터가 잘못되었다.",
            no_semantic_problem:
              "의미적 추출 문제를 확인하기 어렵다."
          }
        },

        deployment_ready: {
          type: "choice",
          instructions:
            "정확한 수치 검증은 별도 코드에서 통과했다고 가정한다. 의미적 품질만 고려했을 때 이 규칙을 어떻게 처리해야 하는가?",
          criteria: {
            approve:
              "selector와 추출 이름이 안정적이며 배포해도 된다.",
            repair:
              "일부 의미적 문제가 있어 GLM에 수정 요청해야 한다.",
            human_review:
              "모델 판단만으로 결정하기 어려워 사람이 확인해야 한다.",
            reject:
              "규칙 구조가 명백히 잘못되어 폐기하고 다시 생성해야 한다."
          }
        }
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Jev API 오류: ${response.status} ${sanitize(body)}`
    );
  }

  const result = await response.json();

  validateJevResponse(result);

  return result;
}
```

실제 TypeSafe API 요청 스키마는 구현 시 설치된 SDK와 최신 공식 문서를 기준으로 다시 확인한다. 위 코드를 검증 없이 그대로 반영하지 않는다.

---

# 10. 개인정보 최소화

Jev에 전체 HTML이나 MHTML을 전송하지 않는다.

Jev에는 다음 요약 데이터만 전달한다.

```text
규칙 selector
추출된 상품명 일부
selector 일치 개수
빈 이름 개수
의심스러운 class 이름
정답 상품명 일부
로컬 테스트 결과 요약
```

제외 대상:

- 주문자 이름
- 전화번호
- 이메일
- 주소
- 주문번호 원문
- 로그인 토큰
- 쿠키
- HTML 전체
- API Key
- Authorization 헤더

---

# 11. 정확한 로컬 검증

다음 항목은 Jev가 아니라 코드가 판정한다.

## 11.1 JSON

- JSON 문법
- 필수 필드
- ID 형식
- 필드 타입
- 중복 ID
- 파일명과 ID 일치

## 11.2 추출

- 추출 예외
- 추출 0건
- 이름 누락
- 가격 0 또는 NaN
- 수량 0 이하
- 장바구니 unchecked 항목 포함
- optionRows 귀속
- 배송비 중복

## 11.3 정답 비교

- 품목 건수
- 수량
- 단가
- 배송비 제외 총액
- 배송비
- 허용 오차
- lineTotal 환산

## 11.4 프로젝트

- source rules
- analysis rules
- user rules
- `rules.json`
- builtin 등록
- 규칙 우선순위
- Git 변경 파일

---

# 12. 로컬 검증 결과 계약

```js
{
  schemaValid: true,
  extractionSucceeded: true,
  itemCount: 5,
  itemCountExpected: 5,
  countMatches: true,
  subtotal: 52000,
  subtotalExpected: 52000,
  totalWithinTolerance: true,
  shipping: 3000,
  shippingExpected: 3000,
  checkedOnlyValid: true,
  optionRowsValid: true,

  extraction: {
    items: []
  },

  diagnostics: {
    selectorMatchCounts: {
      rowSelector: 5,
      name: 5,
      qty: 5,
      price: 5
    },
    suspiciousClassNames: []
  },

  errors: [],
  warnings: []
}
```

---

# 13. 최종 승인 로직

```js
export function decideRuleAction({
  deterministic,
  jev
}) {
  if (!deterministic.schemaValid) {
    return {
      action: "reject",
      reason: "JSON 스키마 오류"
    };
  }

  if (!deterministic.extractionSucceeded) {
    return {
      action: "repair",
      reason: "규칙 실행 오류"
    };
  }

  if (deterministic.itemCount === 0) {
    return {
      action: "repair",
      reason: "추출 결과 0건"
    };
  }

  if (!deterministic.countMatches) {
    return {
      action: "repair",
      reason: "정답 품목 수 불일치"
    };
  }

  if (!deterministic.totalWithinTolerance) {
    return {
      action: "repair",
      reason: "정답 총액 불일치"
    };
  }

  if (!deterministic.checkedOnlyValid) {
    return {
      action: "repair",
      reason: "선택하지 않은 상품 포함"
    };
  }

  if (!deterministic.optionRowsValid) {
    return {
      action: "repair",
      reason: "옵션 행 추출 오류"
    };
  }

  const selectorStable =
    jev.answers.selector_stable.probability;

  const semanticDecision =
    jev.answers.deployment_ready.value;

  const semanticConfidence =
    jev.answers.deployment_ready.confidence;

  if (
    selectorStable >= 0.85 &&
    semanticDecision === "approve" &&
    semanticConfidence >= 0.8
  ) {
    return {
      action: "approve",
      reason: "정확 검증 및 의미 검증 통과"
    };
  }

  if (
    semanticDecision === "repair" &&
    semanticConfidence >= 0.7
  ) {
    return {
      action: "repair",
      reason:
        jev.answers.failure_cause?.value ??
        "의미적 품질 문제"
    };
  }

  if (semanticDecision === "reject") {
    return {
      action: "reject",
      reason: "규칙 구조가 의미적으로 부적합"
    };
  }

  return {
    action: "human_review",
    reason: "Jev 판단 신뢰도 부족"
  };
}
```

실제 Jev 응답의 property 이름은 SDK와 공식 API 응답을 확인하여 맞춘다.

---

# 14. GLM 수정 루프

```js
async function generateAndVerifyRule(input) {
  const candidates = await zaiService.generateCandidates({
    ...input,
    count: 3
  });

  const results = [];

  for (const rule of candidates) {
    const deterministic =
      await ruleVerifier.verify(
        rule,
        input.samples,
        input.expected
      );

    if (!deterministic.schemaValid) {
      results.push({
        rule,
        deterministic,
        decision: {
          action: "reject",
          reason: "스키마 오류"
        }
      });

      continue;
    }

    if (!passesMinimumDeterministicGate(deterministic)) {
      results.push({
        rule,
        deterministic,
        decision: {
          action: "repair",
          reason: deterministic.errors[0]
        }
      });

      continue;
    }

    const jev = await jevJudgeService.judgeCandidate({
      rule,
      extraction: deterministic.extraction,
      expected: input.expected,
      diagnostics: deterministic.diagnostics
    });

    const decision = decideRuleAction({
      deterministic,
      jev
    });

    results.push({
      rule,
      deterministic,
      jev,
      decision
    });
  }

  const approved = results
    .filter((result) => result.decision.action === "approve")
    .sort(compareCandidateScores)[0];

  if (approved) {
    return approved;
  }

  const repairTarget =
    selectBestRepairCandidate(results);

  if (!repairTarget) {
    return {
      status: "human_review",
      results
    };
  }

  const repairedRule = await zaiService.repairRule({
    previousRule: repairTarget.rule,
    deterministicErrors:
      repairTarget.deterministic.errors,
    semanticCause:
      repairTarget.jev?.answers
        ?.failure_cause?.value,
    semanticDecision:
      repairTarget.decision
  });

  return {
    status: "repaired",
    rule: repairedRule,
    previousResults: results
  };
}
```

수정된 규칙은 반드시 다시 로컬 검증과 Jev 평가를 거친다.

---

# 15. Jev가 적합한 작업

## 15.1 실패 원인 분류

선택지:

```text
row_selector
name_selector
quantity_selector
price_selector
option_rows
shipping
checked_only
no_semantic_problem
```

## 15.2 selector 안정성

다음 두 선택자 중 장기적으로 안정적인 selector를 평가할 수 있다.

불안정 가능성이 높은 예:

```css
div.css-1x92j3:nth-child(4) > span:nth-child(2)
```

상대적으로 안정적인 예:

```css
div.cart-item span.sale-price
```

## 15.3 상품명 품질

정상 예:

```text
코카콜라 제로 355ml 24캔
```

오류 예:

```text
삭제 관심상품 바로구매 19,900원
```

## 15.4 후보 규칙 선택

GLM이 만든 A·B·C 후보 중 의미적으로 가장 적절한 후보를 선택한다.

## 15.5 화면 종류 분류

- 장바구니
- 주문서
- 상품 상세
- 로그인 화면
- 오류 화면
- 로딩 중 화면

잘못된 샘플을 GLM에 전송하기 전에 차단하는 용도로 사용할 수 있다.

## 15.6 관리자 검토 필요 여부

- 신뢰도 높음: 자동 적용 후보
- 중간: GLM 자동 수정
- 낮음: 관리자 검토
- 명백한 오류: 폐기

---

# 16. Jev에 맡기면 안 되는 작업

다음은 반드시 코드로 처리한다.

- 품목 개수 계산
- 수량 합계
- 단가 계산
- 행 합계 ÷ 수량
- 배송비 합산
- 총액 2% 오차 계산
- JSON 파싱
- CSS selector 실행
- `rules.json` 규칙 수 검사
- 버전 증가
- Git 파일 목록 확인
- 테스트 성공·실패 판정
- 파일 쓰기
- Git commit·push
- 규칙 JSON 생성 및 수정

---

# 17. 후보 점수화

코드 기반 점수를 먼저 계산한다.

```text
총점 100점

JSON 스키마 통과                   10점
추출 1건 이상                     10점
정답 건수 일치                    20점
정답 총액 허용 오차 이내          20점
모든 상품명 존재                  10점
모든 가격 양수                    10점
장바구니 checkedOnly 정상         10점
옵션 행 정상                       5점
배송비 정상                        5점
```

Jev 점수는 별도로 표시한다.

```text
selector 안정성
상품명 의미 품질
배포 가능 판정
판정 confidence
```

코드 점수와 Jev 결과를 하나의 불투명한 숫자로 합치지 않는다. 관리자가 각각 확인할 수 있게 한다.

---

# 18. 자동 승인 조건

초기 권장 조건:

```text
로컬 JSON 스키마 통과
AND
추출 결과 1건 이상
AND
정답 건수 일치
AND
정답 총액 허용 오차 이내
AND
checkedOnly 정상
AND
optionRows 정상
AND
두 개 샘플 교차 검증 성공
AND
Jev deployment_ready = approve
AND
Jev deployment confidence >= 0.80
AND
Jev selector_stable >= 0.85
```

하나라도 실패하면 자동 Git push를 금지한다.

---

# 19. Shadow Mode

초기에는 Jev가 실제 배포를 차단하거나 승인하지 않게 한다.

## 19.1 기록 형식

```json
{
  "ruleId": "example-cart",
  "localDecision": "pass",
  "jevDecision": "repair",
  "jevConfidence": 0.82,
  "adminDecision": "approve",
  "finalOutcome": "success",
  "notes": ""
}
```

## 19.2 수집 지표

- 관리자 판단과 Jev 일치율
- 잘못 승인한 비율
- 불필요하게 차단한 비율
- 실패 원인 분류 정확도
- GLM 수정 성공률
- selector 안정성 판정 정확도
- 호출당 비용
- 평균 지연시간

최소 50건, 권장 100건 이상의 실제 또는 fixture 결과를 수집한 뒤 자동 승인 여부를 결정한다.

---

# 20. UI 요구사항

## 20.1 Jev 설정

- TypeSafe API Key 저장
- API Key 표시/숨김
- 연결 테스트
- 모델명
- timeout
- Shadow Mode
- 자동 승인 사용
- confidence 임계값
- selector 안정성 임계값

## 20.2 결과 패널

```text
[정확한 로컬 검증]
✅ JSON 스키마
✅ 추출 건수 5/5
✅ 총액 52,000/52,000
✅ checkedOnly
✅ 배송비

[Jev 의미 검증]
Selector 안정성: 91%
상품명 품질: 4/4
판정: 승인
신뢰도: 87%

[최종 처리]
자동 적용 후보
```

## 20.3 낮은 신뢰도

```text
Jev가 이 규칙을 확실하게 판정하지 못했습니다.

판정: 관리자 검토
신뢰도: 54%
가능한 원인: 가격 또는 옵션 행 구조

[GLM에 수정 요청]
[직접 확인]
[후보 폐기]
```

---

# 21. IPC 계약

renderer가 TypeSafe API를 직접 호출하지 않는다.

preload:

```js
window.adminApi.jev = {
  getStatus: () => ipcRenderer.invoke("jev:get-status"),
  testConnection: () =>
    ipcRenderer.invoke("jev:test-connection"),
  judgeCandidate: (request) =>
    ipcRenderer.invoke("jev:judge-candidate", request),
  getShadowResults: () =>
    ipcRenderer.invoke("jev:get-shadow-results")
};
```

main:

```js
ipcMain.handle(
  "jev:judge-candidate",
  async (_event, request) => {
    validateJevRequest(request);

    return jevJudgeService.judgeCandidate(request);
  }
);
```

요구사항:

- renderer에서 임의 endpoint 지정 금지
- renderer에서 API Key 전달 금지
- 허용된 데이터 구조만 IPC로 수신
- HTML 전체 전달 금지
- 응답 크기 제한
- timeout 및 취소 지원

---

# 22. 오류 코드

| 코드 | 설명 |
|---|---|
| `JEV_NOT_CONFIGURED` | TypeSafe API Key 미설정 |
| `JEV_AUTH_FAILED` | 인증 실패 |
| `JEV_RATE_LIMITED` | 호출 제한 |
| `JEV_QUOTA_EXHAUSTED` | 사용량 소진 |
| `JEV_TIMEOUT` | 호출 시간 초과 |
| `JEV_NETWORK_ERROR` | 네트워크 오류 |
| `JEV_INVALID_RESPONSE` | 응답 구조 오류 |
| `JEV_STATE_TOO_LARGE` | 입력 state가 너무 큼 |
| `JEV_LOW_CONFIDENCE` | 판단 신뢰도 부족 |
| `JEV_DISABLED` | Jev 기능 비활성화 |
| `JEV_SHADOW_ONLY` | Shadow Mode로 자동 처리 금지 |

---

# 23. 실패 처리

## 23.1 Jev 연결 실패

Jev 연결 실패가 전체 규칙 생성 실패가 되면 안 된다.

기본 처리:

```text
로컬 검증 성공
Jev 연결 실패
→ 자동 배포 금지
→ 관리자 검토 상태
→ 규칙 초안은 유지
```

## 23.2 Z.ai 실패

```text
Z.ai GLM 생성 실패
→ 기존 결정론적 selector 후보 생성
→ 클릭 매핑 제공
→ Jev는 생성 기능을 대신하지 않음
```

## 23.3 두 서비스 모두 실패

```text
Z.ai 실패
Jev 실패
→ DOM 프로파일
→ 자동 selector 후보
→ 클릭 매핑
→ 로컬 정답 검증
→ 관리자 수동 승인
```

AI는 필수 의존성이 아니어야 한다.

---

# 24. 테스트

## 24.1 단위 테스트

### Jev 요청

- API Key 누락
- 정상 state
- 개인정보 제거
- HTML 전체 입력 차단
- timeout
- AbortController 취소
- 401
- 429
- 500
- 잘못된 JSON 응답

### 최종 게이트

- 로컬 실패 + Jev 승인 → repair 또는 reject
- 로컬 성공 + Jev 승인 → approve
- 로컬 성공 + Jev 낮은 신뢰도 → human review
- 로컬 성공 + Jev repair → repair
- Jev 오류 → human review
- Shadow Mode → 자동 배포 금지

### 개인정보

- 이메일 마스킹
- 전화번호 마스킹
- 주소 마스킹
- 주문번호 마스킹
- Authorization 로그 제외

## 24.2 통합 테스트

1. GLM 후보 3개 mock
2. 로컬 검증
3. Jev 응답 mock
4. 후보 선택
5. GLM repair 요청
6. 재검증
7. 승인
8. 트랜잭션 저장
9. Git stage 전 최종 게이트

## 24.3 E2E

```json
{
  "jevCheck": {
    "configured": true,
    "shadowMode": true,
    "requestSanitized": true,
    "candidateJudged": true,
    "lowConfidenceBlocked": true,
    "localFailureNotApproved": true
  },
  "rendererErrors": []
}
```

---

# 25. 구현 단계

## Phase 0 — 조사

- 기존 규칙 생성 흐름 확인
- 기존 `admin-verify.js` 확인
- 기존 `extract.js` 확인
- 기존 자동 수정 루프 확인
- 현재 E2E 기준선 기록
- 기존 API Key 저장 방식 확인

완료 조건:

- 재사용 함수 목록
- 변경 파일 목록
- 테스트 계획
- 롤백 계획 제출

## Phase 1 — Jev 연결

- 설정 UI
- safeStorage
- 연결 테스트
- `jev-judge-service.js`
- API 오류 정규화
- 로그 마스킹

완료 조건:

- Key가 renderer와 로그에 노출되지 않음
- 연결 성공·실패 UI 확인

## Phase 2 — 로컬 검증 계약

- 기존 검증 결과 표준화
- Jev 입력용 요약 생성
- 개인정보 제거
- state 크기 제한

완료 조건:

- 전체 HTML 없이 필요한 판단 정보만 생성

## Phase 3 — Shadow Mode

- selector 안정성
- 상품명 품질
- 배포 가능 판정
- 결과 기록
- 관리자 판단 비교

완료 조건:

- 실제 배포 흐름에 영향 없이 결과 수집

## Phase 4 — 실패 원인과 수정 루프

- 실패 원인 Choice
- GLM repair prompt 연결
- 수정 후 재검증
- 최대 수정 횟수 제한

완료 조건:

- 실패 원인이 GLM 수정 요청에 반영됨

## Phase 5 — 제한적 자동 승인

- 임계값 설정
- 자동 승인 게이트
- Git push 직전 재검사
- 낮은 신뢰도 차단

완료 조건:

- 로컬 검증 실패 규칙은 Jev 결과와 관계없이 배포 차단
- Shadow Mode 해제는 명시적 설정 필요

---

# 26. 수용 기준

- [ ] Z.ai GLM과 Jev의 역할이 분리되어 있다.
- [ ] `ZAI_API_KEY`와 `TYPESAFE_API_KEY`를 별도 관리한다.
- [ ] TypeSafe Key가 코드·로그·Git에 포함되지 않는다.
- [ ] Jev에 전체 HTML/MHTML을 전송하지 않는다.
- [ ] 정확한 수치 판정은 JavaScript 코드가 담당한다.
- [ ] Jev는 selector 안정성과 의미적 품질만 평가한다.
- [ ] 로컬 검증 실패 규칙을 Jev가 승인할 수 없다.
- [ ] Jev 연결 실패 시 규칙 초안이 손실되지 않는다.
- [ ] Jev 연결 실패 시 자동 배포가 차단된다.
- [ ] 낮은 confidence는 관리자 검토로 이동한다.
- [ ] Shadow Mode를 지원한다.
- [ ] Jev 결과를 GLM repair prompt에 전달할 수 있다.
- [ ] 후보 최대 3개를 비교할 수 있다.
- [ ] 기존 사용자 앱 회귀 테스트가 통과한다.
- [ ] renderer 오류가 0이다.
- [ ] Git push 전에 최종 검증을 다시 실행한다.

---

# 27. 금지사항

- Jev를 Z.ai Coding Plan 모델 이름으로 설정
- Z.ai API Key로 TypeSafe API 호출
- Jev에게 규칙 JSON 생성 요청
- Jev에게 코드 작성 요청
- Jev에게 정확한 금액 계산 위임
- Jev 결과만으로 자동 Git push
- 로컬 검증 실패를 Jev 승인으로 덮어쓰기
- API Key command line 전달
- 전체 HTML 또는 개인정보 전송
- Jev 오류 시 정상으로 간주
- 낮은 confidence 무시
- Shadow Mode 없이 즉시 자동 승인 활성화
- 기존 규칙 엔진과 다른 계산 정책 구현

---

# 28. 최종 권장 구조

```text
Z.ai GLM
= 규칙 생성·수정

TypeSafe Jev
= 실패 원인 분류·후보 평가·배포 게이트

JavaScript 검증기
= 건수·금액·수량·배송비·스키마 판정

관리자
= 낮은 신뢰도 결과 최종 확인
```

Jev를 Z.ai GLM 대신 사용하는 것이 아니다. Z.ai GLM이 만든 결과를 빠르게 심사하고, 수정 방향을 선택하며, 불확실한 결과를 관리자에게 보내는 Judge로 추가한다.

---

# 29. Z.ai Coding Plan 최종 실행 프롬프트

다음 프롬프트를 OpenCode에 붙여 넣고 작업을 시작한다.

```text
프로젝트 루트의 JEV.MD를 먼저 전부 읽어 줘.

JEV.MD를 이 작업의 최우선 개발 명세로 사용하되,
현재 실제 코드와 충돌하는 내용은 임의로 변경하지 말고 먼저 보고해 줘.

작업 순서:

1. 기존 프로젝트 구조 조사
2. 관리자 규칙 생성·검증·Git 배포 흐름 조사
3. Z.ai GLM과 Jev의 역할 분리 설계
4. TypeSafe API Key 안전 저장 설계
5. Jev Judge 서비스 설계
6. Shadow Mode 설계
7. 단위·통합·E2E 테스트 계획
8. 신규 파일·수정 파일 목록
9. 위험 요소와 롤백 방법

먼저 구현 계획만 작성해 줘.
내 승인 전에는 기존 코드를 수정하지 마.

구현 시 필수 원칙:

- Z.ai GLM은 규칙을 생성·수정한다.
- Jev는 생성된 규칙을 평가한다.
- 정확한 건수·금액·수량·배송비 계산은 JavaScript 코드가 담당한다.
- Jev는 코드나 규칙 JSON을 생성하지 않는다.
- 로컬 검증을 통과하지 못한 규칙은 Jev 결과와 관계없이 배포하지 않는다.
- 낮은 confidence는 관리자 검토로 보낸다.
- 초기 구현은 Shadow Mode로 동작한다.
- TYPESAFE_API_KEY는 환경변수 또는 Electron safeStorage에서만 읽는다.
- API Key, 인증 헤더, 개인정보를 로그와 Git에 기록하지 않는다.
- 전체 HTML/MHTML을 Jev에 전송하지 않는다.
- 기존 회귀 테스트가 실패하면 다음 단계로 진행하지 않는다.
```

---

# 30. Definition of Done

다음 조건을 모두 만족해야 완료이다.

1. 프로젝트에서 Z.ai GLM과 Jev가 서로 다른 역할로 동작한다.
2. Jev Judge가 selector 안정성, 상품명 품질, 실패 원인, 배포 가능성을 평가한다.
3. 정확한 계산과 pass/fail 판정은 기존 JavaScript 검증기가 수행한다.
4. 로컬 검증 실패 규칙은 자동 배포되지 않는다.
5. Jev 장애 시 초안과 기존 규칙이 손실되지 않는다.
6. Shadow Mode 결과를 저장하고 관리자 판정과 비교할 수 있다.
7. 충분한 검증 데이터 전에는 자동 승인 기능이 기본 비활성화되어 있다.
8. 모든 API Key와 개인정보가 안전하게 보호된다.
9. 기존 사용자 앱과 관리자 앱의 테스트가 통과한다.
10. 구현 문서와 실제 UI·코드가 일치한다.
