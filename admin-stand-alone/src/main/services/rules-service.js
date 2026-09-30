// 규칙 목록·삭제·builtin 등록·bundle 재생성 — 기존 admin.js 로직을 재사용한다(§4.1 권장안 A).
// 저장·Git의 순수 본문은 rule-files.js에 있어 node 테스트 가능하다.
import {
  listMalls, deleteMall, registerBuiltinRules, rebuildRulesJson, resolveRepoRoot
} from '../../../../app/src/main/lib/admin.js'

import { saveRule, gitCommit } from './rule-files.js'

export function rulesList() {
  return listMalls()
}

export { saveRule, gitCommit, deleteMall as deleteRule, registerBuiltinRules, rebuildRulesJson, resolveRepoRoot }
