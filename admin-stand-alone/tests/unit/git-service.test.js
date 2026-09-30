import test from 'node:test'
import assert from 'node:assert'
import { parsePorcelain, safePaths } from '../../src/main/services/git-service.js'

test('porcelain 파싱 — staged·변경·신규·충돌·rename', () => {
  const out = [
    'M  app/src/main/lib/rules/a.json',
    ' M rules.json',
    '?? _personal/notes.txt',
    'R  old.json -> new.json',
    'UU conflict.json',
    '   \t'
  ].join('\n')
  const files = parsePorcelain(out)
  assert.equal(files.length, 5)
  assert.deepEqual(
    files.map(f => [f.path, f.staged, f.worktree, f.untracked]),
    [
      ['app/src/main/lib/rules/a.json', true, false, false],
      ['rules.json', false, true, false],
      ['_personal/notes.txt', false, false, true],
      ['new.json', true, false, false],
      ['conflict.json', false, false, false]
    ]
  )
  assert.equal(files[3].renamedFrom, 'old.json')
  assert.equal(files[4].status, 'conflict')
})

test('safePaths — add ./-A/상대역행 인자 금지(§7.8)', () => {
  assert.deepEqual(safePaths(['rules.json', 'app/rules/b.json']), ['rules.json', 'app/rules/b.json'])
  for (const bad of [['.'], ['-A'], ['--all'], ['-u'], ['../escape'], []]) {
    assert.throws(() => safePaths(bad), /.*/)
  }
})
