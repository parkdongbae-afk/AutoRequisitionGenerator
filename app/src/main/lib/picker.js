export const GUEST_PRELOAD_SOURCE = `
const { ipcRenderer } = require('electron')
;(function () {
  var mode = 'row'
  var rowSel = null
  var haveRow = false

  function cssPath(el, root, stripRowOrdinal) {
    if (!el || el === root || el === document.body || el === document.documentElement) return ''
    var parts = []
    var node = el
    while (node && node !== root && node !== document.body && node !== document.documentElement) {
      var sel = node.tagName.toLowerCase()
      if (node.id) { sel = '#' + node.id; parts.unshift(sel); break }
      var cls = (node.className && typeof node.className === 'string')
        ? node.className.trim().split(/\\s+/).filter(function (c) { return c && !/^[0-9]/.test(c) }).slice(0, 2)
        : []
      if (cls.length) sel += '.' + cls.join('.')
      var parent = node.parentNode
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName })
        if (same.length > 1) {
          if (stripRowOrdinal && sel === 'tr') { sel = 'tr' }
          else sel += ':nth-of-type(' + (same.indexOf(node) + 1) + ')'
        }
      }
      parts.unshift(sel)
      node = node.parentNode
    }
    return parts.join(' > ')
  }

  function inject() {
    if (window.__pickerInjected) return
    window.__pickerInjected = true
    var lastHover = null
    document.addEventListener('mouseover', function (e) {
      if (lastHover) lastHover.style.outline = ''
      lastHover = e.target
      if (lastHover && lastHover.style) {
        lastHover.style.outline = '2px solid #2563eb'
        lastHover.style.outlineOffset = '-2px'
      }
    }, true)
    document.addEventListener('click', function (e) {
      e.preventDefault()
      e.stopPropagation()
      var el = e.target
      if (el && el.closest && el.closest('a')) e.preventDefault()
      var payload
      if (mode === 'row' || mode === 'optionrow') {
        var rowEl = (el.closest && el.closest('tr')) ? el.closest('tr') : el
        rowSel = cssPath(rowEl, document.body, true)
        if (!rowSel) rowSel = rowEl.tagName.toLowerCase()
        haveRow = true
        payload = { kind: mode, selector: rowSel }
      } else {
        var base = haveRow ? rowSel : null
        var root = null
        try { root = base ? document.querySelector(base) : null } catch (err) {}
        var path = root ? cssPath(el, root) : cssPath(el, document.body)
        if (root && el === root) path = ''
        payload = { kind: mode, selector: path == null ? cssPath(el, document.body) : path, rowSelector: base }
      }
      payload.sampleText = ((el.innerText || '') + '').replace(/\\s+/g, ' ').trim().slice(0, 60)
      ipcRenderer.sendToHost('picker-select', payload)
    }, true)

    window.__pickerSetMode = function (m, rs) {
      mode = m
      if (rs) { rowSel = rs; haveRow = true }
    }
    ipcRenderer.sendToHost('picker-ready')
  }

  ipcRenderer.on('picker-mode', (_e, arg) => {
    if (window.__pickerSetMode) window.__pickerSetMode(arg.mode, arg.rowSelector)
  })

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject)
  else inject()
})()
`

export const PICKER_SCRIPT = `
(function () {
  var lastHover = null
  var lastSel = null
  function cssPath(el, root, stripRowOrdinal) {
    if (!el || !el.tagName) return ''
    if (!el || el === root || el === document.body) return ''
    var parts = []
    var node = el
    while (node && node !== root && node !== document.body && node !== document.documentElement) {
      var sel = node.tagName.toLowerCase()
      if (node.id) { sel = '#' + node.id; parts.unshift(sel); break }
      var cls = (node.className && typeof node.className === 'string')
        ? node.className.trim().split(/\\s+/).filter(function (c) { return c && !/^[0-9]/.test(c) }).slice(0, 2)
        : []
      if (cls.length) sel += '.' + cls.join('.')
      var parent = node.parentNode
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName })
        if (same.length > 1) {
          if (stripRowOrdinal && sel === 'tr') { sel = 'tr' }
          else sel += ':nth-of-type(' + (same.indexOf(node) + 1) + ')'
        }
      }
      parts.unshift(sel)
      node = node.parentNode
    }
    return parts.join(' > ')
  }
  function rel(el, rootSel) {
    var root = null
    try { root = rootSel ? document.querySelector(rootSel) : document.body } catch (e) { root = document.body }
    var p = cssPath(el, root)
    return p || (el === root ? '' : null)
  }
  var mode = 'row'
  var rowSel = null
  var haveRow = false
  document.addEventListener('mouseover', function (e) {
    if (lastHover) lastHover.style.outline = ''
    lastHover = e.target
    if (lastHover && lastHover.style) {
      lastHover.style.outline = '2px solid #2563eb'
      lastHover.style.outlineOffset = '-2px'
    }
  }, true)
  document.addEventListener('click', function (e) {
    e.preventDefault()
    e.stopPropagation()
    var el = e.target
    if (mode === 'row' || mode === 'optionrow') {
      // 테이블 몰 지원 — 셀(td) 클릭시 행(tr)으로 승격, cssPath에 tr 서수 생략 옵션을 넘겨
      // 모든 상품 행이 매치되는 rowSelector를 만든다(아인몰 실측 2026-10-03)
      var rowEl = (el.closest && el.closest('tr')) ? el.closest('tr') : el
      rowSel = cssPath(rowEl, document.body, true)
      if (!rowSel) rowSel = rowEl.tagName.toLowerCase()
      haveRow = true
      lastSel = { kind: mode, selector: rowSel }
      // 표 셀 좌표 — 열(column) 구분 쇼핑몰 규칙 생성용
      try {
        var td = el.closest ? el.closest('td,th') : null
        var tr = el.closest ? el.closest('tr') : null
        var tbl = el.closest ? el.closest('table') : null
        if (td && tr && tbl) {
          lastSel.table = { selector: cssPath(tbl, document.body) || 'table', rows: tbl.rows.length }
          lastSel.cell = { row: tr.rowIndex, col: td.cellIndex }
        }
      } catch (err) {}
    } else {
      var base = haveRow ? rowSel : null
      var root = null
      try { root = base ? document.querySelector(base) : null } catch (err) {}
      var path = root ? cssPath(el, root) : cssPath(el, document.body)
      if (root && el === root) path = ''
      lastSel = { kind: mode, selector: path == null ? cssPath(el, document.body) : path, rowSelector: base }
      try {
        var td2 = el.closest ? el.closest('td,th') : null
        var tr2 = el.closest ? el.closest('tr') : null
        var tbl2 = el.closest ? el.closest('table') : null
        if (td2 && tr2 && tbl2) {
          lastSel.table = { selector: cssPath(tbl2, document.body) || 'table', rows: tbl2.rows.length }
          lastSel.cell = { row: tr2.rowIndex, col: td2.cellIndex }
        }
      } catch (err) {}
    }
    if (lastSel) {
      lastSel.sampleText = (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 60)
      parent.postMessage({ type: 'picker-select', payload: lastSel }, '*')
    }
  }, true)
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'picker-mode') {
      mode = e.data.mode
      if (e.data.rowSelector) { rowSel = e.data.rowSelector; haveRow = true }
    }
  })
  parent.postMessage({ type: 'picker-ready' }, '*')
})()
`
