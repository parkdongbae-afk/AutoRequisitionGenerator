// 규칙 목록·삭제·builtin 등록·bundle 재생성 — 기존 admin.js 로직을 재사용한다(§4.1 권장안 A).
// Git의 순수 본문은 rule-files.js, 저장은 transaction-service.js(§13.2)로 node 테스트 가능하다.
import {
  listMalls, deleteMall, registerBuiltinRules, rebuildRulesJson, resolveRepoRoot
} from '../../../../app/src/main/lib/admin.js'

import { ruleChanges, gitCommit } from './rule-files.js'
import { createPlan, applyTransaction } from './transaction-service.js'

export function rulesList() {
  return listMalls()
}

// 규칙 저장 — 스냅샷·JSON 검증·원자 적용·실패 시 자동 롤백(§13.2)
export function saveRule(userDataDir, repoRoot, rule) {
  const plan = createPlan(ruleChanges(repoRoot, rule))
  const res = applyTransaction(userDataDir, plan)
  if (!res.ok) {
    const reason = res.status === 'validation_blocked' ? res.errors.join(' / ') : res.error
    throw new Error(`저장 실패(${res.status}): ${reason}`)
  }
  return { files: plan.changes.map(c => c.path), transactionId: res.id }
}

export { gitCommit, ruleChanges, deleteMall as deleteRule, registerBuiltinRules, rebuildRulesJson, resolveRepoRoot }
export { createPlan, applyTransaction, listTransactions, rollbackTransaction } from './transaction-service.js'
