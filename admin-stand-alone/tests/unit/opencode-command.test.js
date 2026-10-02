import test from 'node:test'
import assert from 'node:assert'
import { buildOpenCodeCommand, DEFAULT_OPENCODE_MODEL } from '../../src/main/services/generate-and-verify.js'

test('모델 미선택(빈 값) → 기본 모델로 폴백한다', () => {
  for (const model of ['', '  ', undefined]) {
    const cmd = buildOpenCodeCommand('C:\\tmp\\prompt.txt', model)
    assert.ok(cmd.includes(`--model ${DEFAULT_OPENCODE_MODEL}`), `빈 모델에 기본값 적용: ${model}`)
  }
})

test('모델 지정 시 그대로 사용', () => {
  const cmd = buildOpenCodeCommand('C:\\tmp\\p.txt', 'zai-coding-plan/glm-5.3-flash')
  assert.ok(cmd.includes('--model zai-coding-plan/glm-5.3-flash'))
})

test('명령 형태 — -p(비밀번호 옵션) 미사용·-f 마지막 배치·프롬프트 파일 인용', () => {
  const cmd = buildOpenCodeCommand('C:\\tmp\\prompt.txt', '')
  assert.ok(!/\s-p\s/.test(cmd), '-p는 password 옵션이므로 사용하면 안 된다')
  const fIdx = cmd.indexOf('-f "C:\\tmp\\prompt.txt"')
  assert.ok(fIdx > 0, '프롬프트 파일이 -f로 첨부된다')
  assert.equal(cmd.trim().endsWith(`-f "C:\\tmp\\prompt.txt"`), true, '-f는 반드시 마지막이어야 한다(뒤 인자 삼킴 방지)')
  assert.ok(cmd.includes('Output only the requested JSON'), '지시 메시지가 위치 인자로 먼저 온다')
})
