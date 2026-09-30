// 규칙 목록·삭제·builtin 등록·bundle 재생성 — 기존 admin.js 로직을 재사용한다(§4.1 권장안 A).
// Git의 순수 본문은 rule-files.js, 저장은 transaction-service.js(§13.2)로 node 테스트 가능하다.
import fs from 'node:fs'
import path from 'node:path'
import {
  listMalls, deleteMall, registerBuiltinRules, rebuildRulesJson, resolveRepoRoot
} from '../../../../app/src/main/lib/admin.js'

import { ruleChanges, deletionTargets, gitCommit } from './rule-files.js'
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

export function deleteRulePreview(repoRoot, id) {
  return deletionTargets(repoRoot, id)
}

// 규칙 삭제(§16) — 파일 삭제는 트랜잭션으로 스냅샷·자동 롤백을 보장하고,
// bundle 재생성은 적용 직후 검증(postValidate)에서 수행한다. 검증 실패 시 파일·bundle 모두 복구.
export function deleteRuleTx(userDataDir, repoRoot, id, { bump = false } = {}) {
  const targets = deletionTargets(repoRoot, id)
  let beforeCount = null
  let inBundle = false
  try {
    const bundle = JSON.parse(fs.readFileSync(path.join(repoRoot, 'rules.json'), 'utf-8'))
    beforeCount = bundle.rules.length
    inBundle = bundle.rules.some(r => r.id === id)
  } catch (e) {
    console.error('[delete] rules.json 읽기 실패 — bundle 검증 생략:', String(e.message || e))
  }
  const plan = createPlan(targets.map(p => ({ path: p, content: null })))
  let rebuilt = null
  const res = applyTransaction(userDataDir, plan, {
    postValidate: () => {
      if (beforeCount == null) return
      rebuilt = rebuildRulesJson(repoRoot, { bump })
      const expected = inBundle ? beforeCount - 1 : beforeCount
      if (rebuilt.count !== expected) {
        throw new Error(`bundle 규칙 수가 예상과 다릅니다: ${rebuilt.count} != ${expected}`)
      }
    }
  })
  if (!res.ok && rebuilt) {
    try {
      rebuildRulesJson(repoRoot, { bump: false })
    } catch (e) {
      console.error('[delete] 롤백 후 bundle 재동기화 실패 — 수동 rules.json 재생성 필요:', String(e.message || e))
    }
  }
  return { ...res, removed: targets }
}

export { gitCommit, ruleChanges, deletionTargets, deleteMall as deleteRule, registerBuiltinRules, rebuildRulesJson, resolveRepoRoot }
export { createPlan, applyTransaction, listTransactions, rollbackTransaction } from './transaction-service.js'
