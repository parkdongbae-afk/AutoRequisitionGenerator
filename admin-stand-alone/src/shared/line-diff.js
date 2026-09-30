// 라인 단위 diff (§7.5 변경 전후 비교) — 의존 없는 순수 모듈, renderer·main 공용.
// 규칙 JSON은 수백 줄 이하이므로 O(n×m) LCS로 충분하다.
export function diffLines(beforeText, afterText, { context = 2 } = {}) {
  const a = String(beforeText || '').split(/\r?\n/)
  const b = String(afterText || '').split(/\r?\n/)
  const n = a.length
  const m = b.length
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const full = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      full.push({ type: 'same', text: a[i], aLine: i + 1, bLine: j + 1 })
      i++; j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      full.push({ type: 'del', text: a[i], aLine: i + 1 })
      i++
    } else {
      full.push({ type: 'add', text: b[j], bLine: j + 1 })
      j++
    }
  }
  while (i < n) { full.push({ type: 'del', text: a[i], aLine: i + 1 }); i++ }
  while (j < m) { full.push({ type: 'add', text: b[j], bLine: j + 1 }); j++ }

  if (full.length <= context * 2 + full.filter(h => h.type !== 'same').length) return full
  // 변경 주변 context 줄만 남기고 같은 줄은 접는다
  const keep = new Array(full.length).fill(false)
  full.forEach((h, idx) => {
    if (h.type === 'same') return
    for (let k = Math.max(0, idx - context); k <= Math.min(full.length - 1, idx + context); k++) keep[k] = true
  })
  const out = []
  let skipCount = 0
  full.forEach((h, idx) => {
    if (keep[idx]) {
      if (skipCount > 0) { out.push({ type: 'gap', text: `… 동일 ${skipCount}줄 …` }); skipCount = 0 }
      out.push(h)
    } else {
      skipCount++
    }
  })
  return out
}

export function diffSummary(lines) {
  const added = lines.filter(l => l.type === 'add').length
  const removed = lines.filter(l => l.type === 'del').length
  return { added, removed, changed: added + removed > 0 }
}
