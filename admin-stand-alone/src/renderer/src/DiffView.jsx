import React from 'react'
import { diffLines } from '../../shared/line-diff.js'

// §7.5 변경 전후 diff — 추가(초록)/삭제(빨강)/같음(회색) 라인 뷰
export default function DiffView({ before, after, maxHeight = 260 }) {
  const lines = diffLines(before, after)
  const color = { add: '#1a7f37', del: '#dc2626', same: '#64748b', gap: '#94a3b8' }
  const bg = { add: '#f0fdf4', del: '#fef2f2', same: 'transparent', gap: '#f8fafc' }
  return (
    <pre style={{ fontSize: 11, fontFamily: 'Consolas, monospace', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8, marginTop: 8, overflow: 'auto', maxHeight, margin: '8px 0 0' }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color: color[l.type], background: bg[l.type], whiteSpace: 'pre-wrap' }}>
          {l.type === 'add' ? '+ ' : l.type === 'del' ? '− ' : l.type === 'gap' ? '' : '  '}
          {l.text}
        </div>
      ))}
    </pre>
  )
}
