import React from 'react'
import { useStore } from '../store'

const STEPS = [
  { key: 'row', label: '① 행 선택', desc: '각 상품이 담긴 행(영역)을 하나씩 클릭하세요 — 클릭할 때마다 공통 행 선택자가 자동 계산됩니다 (2개 이상 권장). 완료되면 [다음: 상품명 지정]을 누르세요' },
  { key: 'name', label: '② 상품명', desc: '선택한 행 안에서 상품명 텍스트를 클릭하세요' },
  { key: 'qty', label: '③ 수량', desc: '행 안에서 수량(숫자)을 클릭하세요 · 없으면 [건너뛰기]' },
  { key: 'price', label: '④ 주문금액', desc: '행 안에서 주문금액(해당 상품 가격)을 클릭하세요 — 예상단가는 주문금액÷수량으로 자동 계산됩니다' },
  { key: 'shipping', label: '⑤ 배송비', desc: '페이지에서 배송비 금액을 클릭하세요 · 없으면 [건너뛰기]' },
  { key: 'confirm', label: '⑥ 확인/저장', desc: '규칙 이름·URL 패턴을 확인하고 저장하세요' }
]

export default function MappingModal() {
  const mapping = useStore(s => s.mapping)
  const setMappingStep = useStore(s => s.setMappingStep)
  const setMappingField = useStore(s => s.setMappingField)
  const setOrientation = useStore(s => s.setOrientation)
  const saveMapping = useStore(s => s.saveMapping)
  const cancelMapping = useStore(s => s.cancelMapping)
  if (!mapping) return null

  const m = mapping
  const columnMode = m.orientation === 'column'
  const rowStepDesc = columnMode
    ? '표에서 첫 상품이 담긴 열의 아무 셀이나 클릭하세요 — 표와 상품 열이 지정됩니다'
    : '각 상품이 담긴 행(영역)을 하나씩 클릭하세요 — 클릭할 때마다 공통 행 선택자가 자동 계산됩니다 (2개 이상 권장). 완료되면 [다음: 상품명 지정]을 누르세요'
  const nameStepDesc = columnMode
    ? '표 안에서 상품명이 있는 셀을 클릭하세요 — 그 줄이 상품명 줄이 됩니다'
    : '선택한 행 안에서 상품명 텍스트를 클릭하세요'
  const pickBox = (k) => {
    const p = m.picks[k]
    return (
      <div className={`rounded border px-2 py-1 text-[11px] ${p ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-400'}`}>
        {p ? `✔ ${p.sampleText || p.selector || '(행 자체)'}` : '미지정'}
      </div>
    )
  }

  return (
    <div className="pointer-events-none fixed inset-y-0 right-0 z-40 flex w-1/2 justify-center bg-black/20 py-4" style={{ pointerEvents: 'none' }}>
      <div className="pointer-events-auto flex max-h-full w-[92%] flex-col rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-[14px] font-bold text-slate-800">🧭 새 쇼핑몰 규칙 만들기</h2>
          <button className="rounded px-2 py-0.5 text-[12px] text-slate-400 hover:bg-slate-100" onClick={cancelMapping}>✕ 닫기</button>
        </div>
        <div className="border-b border-blue-100 bg-blue-50 px-4 py-1.5 text-[11.5px] text-blue-800">
          {m.waiting
            ? <>캡처 대기 중 — 장바구니에 <b>2개 이상의 상품을 선택 하세요</b>. 그 후 본인 브라우저에서 <b>익스텐션</b> 또는 <b>🛒품의캡처</b>를 눌러주세요</>
            : <>좌측 <b>캡처 문서</b>에서 항목을 <b>클릭</b>하여 지정하세요</>}
        </div>
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 py-2">
          {STEPS.map(s => (
            <button
              key={s.key}
              onClick={() => setMappingStep(s.key)}
              className={`rounded px-2 py-1 text-[11px] ${m.step === s.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
          <p className="text-[12.5px] text-slate-600">
            {m.waiting
              ? '본인 브라우저(로그인 유지)에서 2개 이상의 상품을 담은 주문/장바구니 화면을 열고 익스텐션 또는 🛒품의캡처를 눌러주세요. 캡처가 도착하면 ①단계부터 시작합니다.'
              : m.step === 'row'
                ? rowStepDesc
                : m.step === 'name'
                  ? nameStepDesc
                  : (STEPS.find(s => s.key === m.step) || {}).desc}
          </p>
          {!m.waiting && m.step === 'row' && (
            <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[12px] text-slate-700">
              <span className="font-semibold">상품 구분:</span>
              <label className="flex cursor-pointer items-center gap-1">
                <input type="radio" name="orientation" checked={!columnMode} onChange={() => setOrientation('row')} />
                행 (세로 나열)
              </label>
              <label className="flex cursor-pointer items-center gap-1">
                <input type="radio" name="orientation" checked={columnMode} onChange={() => setOrientation('column')} />
                열 (표에서 가로 나열)
              </label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <div>
                <div className="mb-0.5 text-[11px] font-semibold text-slate-500">{columnMode ? '표(Table) 선택자' : '행(Row) 선택자'}</div>
                <div className="truncate rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700" title={(columnMode ? m.tableSelector : m.rowSelector) || ''}>
                  {(columnMode ? m.tableSelector : m.rowSelector) || '미지정'}
                </div>
                {columnMode && m.firstProductCol != null && (
                  <div className="mt-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                    첫 상품 열 #{m.firstProductCol + 1} · 상품명 줄 #{m.columnRows.name != null ? m.columnRows.name + 1 : '-'} · 가격 줄 #{m.columnRows.price != null ? m.columnRows.price + 1 : '-'}
                  </div>
                )}
              </div>
              <div>
                <div className="mb-0.5 text-[11px] font-semibold text-slate-500">상품 개수 (2 이상 권장)</div>
                <input
                  type="number"
                  min={2}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-[12px]"
                  value={m.productCount || ''}
                  placeholder="예: 3"
                  onChange={e => setMappingField('productCount', e.target.value)}
                />
              </div>
              {m.rowSelector && m.rowMatchCount != null && (() => {
                const n = parseInt(m.productCount, 10)
                const ok = n >= 2 && m.rowMatchCount === n
                return (
                  <div className={`rounded border px-2 py-1 text-[11px] ${ok ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
                    {ok
                      ? `✓ 행 선택자가 상품 ${n}개와 정확히 일치`
                      : `선택자 매칭 ${m.rowMatchCount}행${n >= 2 ? ` · 입력 ${n}개와 다름` : ''} — 더 바깥 영역을 클릭하면 넓어지고, 안쪽이면 좁아집니다`}
                  </div>
                )
              })()}
              {!m.waiting && m.step === 'row' && (
                <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11.5px] text-slate-600">
                  {columnMode
                    ? <span>{m.tableSelector ? '✓ 표 지정 완료' : '표 셀을 클릭하세요'}</span>
                    : <span>선택된 행: <b>{(m.rowSamples || []).length}</b>개</span>}
                  <button
                    className="ml-auto rounded bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={columnMode ? !m.tableSelector : !(m.rowSamples || []).length}
                    onClick={() => setMappingStep('name')}
                  >
                    다음: 상품명 지정 ▶
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {pickBox('name')}
              {pickBox('qty')}
              {pickBox('price')}
              {pickBox('shipping')}
            </div>
          </div>

          {(m.step === 'qty' || m.step === 'shipping') && (
            <button
              className="rounded border border-slate-300 px-3 py-1 text-[12px] text-slate-600 hover:bg-slate-100"
              onClick={() => setMappingStep(m.step === 'qty' ? 'price' : 'confirm')}
            >
              건너뛰기
            </button>
          )}

          {m.step === 'confirm' && (
            <div className="space-y-2 rounded border border-blue-200 bg-blue-50 p-3">
              <label className="block text-[12px]">
                규칙 이름 <input className="w-full rounded border border-slate-300 px-2 py-1" value={m.ruleName} onChange={e => setMappingField('ruleName', e.target.value)} />
              </label>
              <label className="block text-[12px]">
                규칙 ID (영문) <input className="w-full rounded border border-slate-300 px-2 py-1" value={m.ruleId} onChange={e => setMappingField('ruleId', e.target.value)} />
              </label>
              <label className="block text-[12px]">
                URL 패턴 (이 문자열이 주소에 포함되면 자동 적용 — 비워두면 캡처한 페이지 도메인 사용)
                <input className="w-full rounded border border-slate-300 px-2 py-1" value={m.matchPattern} onChange={e => setMappingField('matchPattern', e.target.value)} placeholder="예: somemall.co.kr" />
              </label>
              <button className="w-full rounded bg-blue-600 py-1.5 text-[13px] font-bold text-white hover:bg-blue-500" onClick={saveMapping}>
                규칙 저장하고 캡처 문서에 적용
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
