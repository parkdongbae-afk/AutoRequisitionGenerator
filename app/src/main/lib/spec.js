const LABEL_PREFIX = /^(색상|옵션|사이즈|규격|선택0?\d*|size)\s*[:：]?\s*/i

function normalizeOption(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim()
  s = s.replace(LABEL_PREFIX, '').trim()
  if (!s || /^옵션\s*없음$|^없음$|^-$|^옵션없음$/i.test(s)) return ''
  return s.replace(/\(([가-힣]{1,3})\)/g, '$1 ').replace(/\s+/g, ' ').trim()
}

function unitLower(u) {
  return u === 'L' ? 'L' : u.toLowerCase()
}

const COUNT_PATTERNS = [
  [/(\d+)\s*(개입|개들이|페트|팩|캔|병|롤|정|타)(?![가-힣a-z])/gi, (m) => `${m[1]}개입`],
  [/(\d+)\s*(박스|상자|BOX)(?![가-힣])/gi, (m) => `${m[1]}상자`],
  [/(\d+)\s*세트(?![가-힣])/g, (m) => `${m[1]}세트`],
  [/(\d+)\s*종(?![가-힣])/g, (m) => `${m[1]}종`],
  [/(\d+)\s*색(?![가-힣])/g, (m) => `${m[1]}색`],
  [/(\d+)\s*호/g, (m) => `${m[1]}호`],
  [/(\d+)\s*매(?![가-힣])/g, (m) => `${m[1]}매`],
  [/(\d+)\s*(대용|대)(?![가-힣])/g, (m) => `${m[1]}${m[2]}`],
  [/(\d+)\s*인치(?![가-힣])/g, (m) => `${m[1]}인치`],
  [/(\d+)\s*개(?![가-힣])/g, (m) => `${m[1]}개`]
]

const RIGHT_MAP = { '개입': '개입', '개': '개', '팩': '개입', '페트': '개입', '매': '매', '권': '권', '캔': '개입', '병': '개입', '박스': '상자', '상자': '상자', '세트': '세트', '종': '종' }

function collect(text, tokens, basePos) {
  const ranges = []
  const overlaps = (start, end) => ranges.some(r => start < r[1] && end > r[0])
  const consume = (start, end) => ranges.push([start, end])

  let m
  const axnRe = /(\d+(?:\.\d+)?)\s*(ml|kg|cm|mm|g|m|l)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(개입|개|팩|페트|매|권|캔|병|박스|상자|세트|종|g|ml|kg|l)/gi
  while ((m = axnRe.exec(text))) {
    if (m[2]) {
      const key = `${m[1]}${unitLower(m[2])}`
      tokens.push({ key, text: key, pos: basePos + m.index })
    }
    const rUnit = RIGHT_MAP[m[4]] || unitLower(m[4] || '')
    const rKey = `${m[3]}${rUnit}`
    tokens.push({ key: rKey, text: rKey, pos: basePos + m.index })
    consume(m.index, m.index + m[0].length)
  }

  const dimRe = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(cm|mm|m)?(?![가-힣\d])/gi
  while ((m = dimRe.exec(text))) {
    if (overlaps(m.index, m.index + m[0].length)) continue
    const key = `${m[1]}x${m[2]}`
    tokens.push({ key, text: `${key}${m[3] ? unitLower(m[3]) : ''}`, pos: basePos + m.index })
    consume(m.index, m.index + m[0].length)
  }

  {
  const labeledRe = /(폭|너비|길이|높이|두께|지름|직경)\s*(\d+(?:\.\d+)?)\s*(cm|mm|ml|kg|g|m|l)\b/gi
    while ((m = labeledRe.exec(text))) {
      if (overlaps(m.index, m.index + m[0].length)) continue
      const key = `${m[1]}${m[2]}${unitLower(m[3])}`
      tokens.push({ key, text: `${m[1]} ${m[2]}${unitLower(m[3])}`, pos: basePos + m.index })
      consume(m.index, m.index + m[0].length)
    }
  }

  const valRe = /(\d+(?:\.\d+)?)\s*(ml|kg|cm|mm|L|g|m)\b/gi
  while ((m = valRe.exec(text))) {
    if (overlaps(m.index, m.index + m[0].length)) continue
    const key = `${m[1]}${unitLower(m[2])}`
    tokens.push({ key, text: key, pos: basePos + m.index })
    consume(m.index, m.index + m[0].length)
  }

  for (const [re, fmt] of COUNT_PATTERNS) {
    while ((m = re.exec(text))) {
      if (overlaps(m.index, m.index + m[0].length)) continue
      const key = fmt(m)
      tokens.push({ key, text: key, pos: basePos + m.index })
      consume(m.index, m.index + m[0].length)
    }
  }

  const paperRe = /\b(A[3456]|B[456])\b/g
  while ((m = paperRe.exec(text))) {
    if (overlaps(m.index, m.index + m[0].length)) continue
    tokens.push({ key: m[1], text: m[1], pos: basePos + m.index })
    consume(m.index, m.index + m[0].length)
  }
}

export function deriveSpec(name, option) {
  const opt = normalizeOption(option)
  const nameStr = String(name || '')
  const tokens = []

  if (opt) collect(opt, tokens, 0)
  const optLen = opt ? opt.length + 1 : 0
  collect(nameStr, tokens, optLen)

  const seen = new Set()
  const uniq = tokens.filter(t => t.key && !seen.has(t.key) && seen.add(t.key))
  uniq.sort((a, b) => a.pos - b.pos)

  if (uniq.length) {
    return uniq.slice(0, 5).map(t => t.text).join(', ')
  }

  if (opt && !/\d/.test(opt)) {
    const tailMatch = /\s\/\s*([^/]{2,30})\s*$/.exec(nameStr)
    if (tailMatch && tailMatch[1].includes('+')) {
      return `${opt}, ${tailMatch[1].trim()}`
    }
    return opt.slice(0, 40)
  }
  return ''
}
