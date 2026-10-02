import test from 'node:test'
import assert from 'node:assert'
import { buildOpenCodeCommand, DEFAULT_OPENCODE_MODEL } from '../../src/main/services/generate-and-verify.js'

test('모델 미선택(빈 값) → 기본 모델로 폴백한다', () => {
  for (const model of ['', '  ', undefined]) {
    const cmd = buildOpenCodeCommand(model)
    assert.ok(cmd.includes(`--model ${DEFAULT_OPENCODE_MODEL}`), `빈 모델에 기본값 적용: ${model}`)
  }
})

test('모델 지정 시 그대로 사용', () => {
  const cmd = buildOpenCodeCommand('zai-coding-plan/glm-5.3-flash')
  assert.ok(cmd.includes('--model zai-coding-plan/glm-5.3-flash'))
})

test('명령 형태 — 따옴표·공백 인자 없음(stdin 프롬프트 방식)', () => {
  const cmd = buildOpenCodeCommand('')
  assert.ok(!cmd.includes('"'), '명령 문자열에 따옴표가 없어야 한다(cmd 인자 변형 방지)')
  assert.ok(!/\s-p\s/.test(cmd), '-p는 password 옵션이므로 사용하면 안 된다')
  assert.equal(cmd, `opencode run --model ${DEFAULT_OPENCODE_MODEL}`)
})
