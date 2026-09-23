import { app, BrowserWindow, ipcMain, dialog, protocol, shell, net, clipboard } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import * as cheerio from 'cheerio'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { loadDocument, getDoc, removeDoc, reextract, updateRows, listDocIds, rewriteCssUrls } from './lib/docstore.js'
import { allRules, saveUserRule, deleteUserRule, ruleById, renameRule } from './lib/rules.js'
import { readExcelRows, appendRows, createNewWorkbook, loadExcelFull } from './lib/excel.js'
import { startReceiver } from './lib/receiver.js'
import { PICKER_SCRIPT } from './lib/picker.js'
import { BROWSER_DATA, findBookmarkFiles, addBookmarkToFront, readCaptureBookmarkCount, isCaptureBookmarkAtFront } from './lib/bookmarks.js'
import { buildBookmarklet } from './lib/bookmarklet.js'
import { smartDecode } from './lib/mhtml.js'

const execFileAsync = promisify(execFile)

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app-mhtml',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

let mainWindow = null
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

function getSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(), 'utf-8'))
  } catch {
    return {}
  }
}

function setSetting(key, value) {
  const s = getSettings()
  s[key] = value
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2), 'utf-8')
}

function extensionFolder() {
  if (app.isPackaged) {
    const src = path.join(process.resourcesPath, 'extension')
    const dst = path.join(app.getPath('userData'), 'extension')
    try {
      fs.mkdirSync(dst, { recursive: true })
      for (const f of fs.readdirSync(src)) {
        fs.copyFileSync(path.join(src, f), path.join(dst, f))
      }
    } catch {}
    return dst
  }
  return path.join(app.getAppPath(), 'extension')
}

function manualFile() {
  if (app.isPackaged) {
    const dst = path.join(app.getPath('userData'), 'manual.pdf')
    try {
      const src = path.join(process.resourcesPath, 'resources', 'manual.pdf')
      if (fs.existsSync(src)) fs.copyFileSync(src, dst)
      if (fs.existsSync(dst)) return dst
    } catch {}
    return path.join(process.resourcesPath, 'resources', 'manual.pdf')
  }
  return path.join(app.getAppPath(), 'resources', 'manual.pdf')
}

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const RUN_NAME = 'AutoRequisitionGenerator'

async function regRun(args) {
  try {
    const { stdout } = await execFileAsync('reg.exe', args)
    return { ok: true, stdout: String(stdout || '') }
  } catch (e) {
    return { ok: false, err: String((e && e.stderr) || e.message || e) }
  }
}

function startupTarget() {
  // portable exe는 %TEMP%에 풀려 실행되므로 process.execPath 대신 원본 실행파일 위치를 등록
  const dir = process.env.PORTABLE_EXECUTABLE_DIR
  if (dir && fs.existsSync(dir)) {
    try {
      const exes = fs.readdirSync(dir).filter(f => /\.exe$/i.test(f))
      const hit = exes.find(f => /품의|Portable|AutoRequisition/i.test(f))
      if (hit) return `"${path.join(dir, hit)}"`
    } catch {}
  }
  return `"${process.execPath}"`
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    title: '자동 품의 요구 생성기',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setVisualZoomLevelLimits(1, 1)
  mainWindow.webContents.on('zoom-changed', (_e, dir) => {
    try {
      mainWindow.webContents.setZoomFactor(1)
      if (dir) useStoreToastZoomLocked()
    } catch {}
  })
  mainWindow.webContents.on('did-finish-load', () => {
    try { mainWindow.webContents.setZoomFactor(1) } catch {}
  })
}

function useStoreToastZoomLocked() {
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript('window.__store && window.__store.getState().toast("앱 화면 배율은 고정입니다 (뷰어 확대/축소 버튼 사용)", "info")').catch(() => {})
  }
}

function serveDoc(url) {
  const u = new URL(url)
  const docId = u.hostname
  const doc = getDoc(docId)
  if (!doc) return new Response('doc not found', { status: 404 })
  const pathname = decodeURIComponent(u.pathname.replace(/^\//, ''))
  if (!pathname) {
    let html = doc.html
    if (doc.sourceUrl && /^https?:/i.test(doc.sourceUrl)) {
      const baseTag = `<base href="${doc.sourceUrl.replace(/"/g, '&quot;')}">`
      if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m => m + baseTag)
      else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, m => m + baseTag)
      else html = baseTag + html
    }
    const measure = `<script>(function(){function rep(){try{parent.postMessage({type:'doc-size',height:Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0),width:Math.max(document.documentElement.scrollWidth,document.body?document.body.scrollWidth:0)},'*')}catch(e){}}rep();window.addEventListener('load',rep);setTimeout(rep,500);setTimeout(rep,2000);new MutationObserver(rep).observe(document.documentElement,{childList:true,subtree:true,attributes:true})})()</script>`
    // 캡처 시점 V체크를 뷰어에 그대로 재현 — MHTML은 checked 프로퍼티를 직렬화하지 않으므로
    // 박제된 data-arge-checked(익스텐션/북마크릿)·data-selected(쿠팡)를 로드 시 프로퍼티로 복원한다.
    // 원본 마크업의 checked 속성(defaultChecked)과 실제 상태가 어긋나 엉뚱한 항목이 체크로 보이는 것도 방지.
    const checkedState = `<script>(function(){try{document.querySelectorAll('input[type=checkbox][data-arge-checked]').forEach(function(el){el.checked=el.getAttribute('data-arge-checked')==='true'});document.querySelectorAll('[data-selected]').forEach(function(el){var on=el.getAttribute('data-selected')==='true';el.querySelectorAll('input[type=checkbox]').forEach(function(c){c.checked=on})})}catch(e){}})()</script>`
    const pan = `<script>(function(){var pan=null;function send(t,d){try{parent.postMessage(Object.assign({type:t},d||{}),'*')}catch(e){}}window.addEventListener('mousedown',function(e){if(e.button===1||e.button===2){pan=e.button;e.preventDefault();send('pan-start')}else if(pan!==null){pan=null;send('pan-end')}},true);window.addEventListener('mousemove',function(e){if(pan!==null)send('pan-move',{dx:e.movementX||0,dy:e.movementY||0})},true);window.addEventListener('mouseup',function(e){if(pan!==null){pan=null;send('pan-end')}},true);window.addEventListener('contextmenu',function(e){if(pan!==null)e.preventDefault()},true);window.addEventListener('auxclick',function(e){if(e.button===1)e.preventDefault()},true);window.addEventListener('blur',function(){if(pan!==null){pan=null;send('pan-end')}});window.addEventListener('wheel',function(e){send('doc-wheel',{dy:e.deltaY||0,x:e.clientX||0,y:e.clientY||0});e.preventDefault()},{passive:false,capture:true})})()</script>`
    if (u.searchParams.get('picker') === '1') {
      const inject = `<script>${PICKER_SCRIPT}</script>` + checkedState + pan + measure
      if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, inject + '</body>')
      else html += inject
    } else {
      const inject = checkedState + pan + measure
      if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, inject + '</body>')
      else html += inject
    }
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
  const idx = parseInt(pathname, 10)
  if (Number.isNaN(idx) || !doc.parts[idx]) return new Response('part not found', { status: 404 })
  const part = doc.parts[idx]
  let ct = part.contentType || 'application/octet-stream'
  const partCharset = /charset\s*=\s*"?([^";\s]+)"?/i.exec(part.rawContentType || '')?.[1] || null
  if (ct.startsWith('text/css')) {
    const css = rewriteCssUrls(smartDecode(part.data, partCharset), docId, doc.parts, part.contentLocation || doc.sourceUrl)
    return new Response(css, { headers: { 'Content-Type': 'text/css; charset=utf-8' } })
  }
  if (ct.startsWith('text/')) {
    const text = smartDecode(part.data, partCharset)
    return new Response(text, { headers: { 'Content-Type': `${ct}; charset=utf-8` } })
  }
  return new Response(part.data, { headers: { 'Content-Type': ct } })
}

const pickMhtmlFiles = async (win) => {
  const r = await dialog.showOpenDialog(win, {
    title: 'MHTML/HTML 파일 선택',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '캡처 파일', extensions: ['mhtml', 'mht', 'html', 'htm'] }]
  })
  return r.canceled ? [] : r.filePaths
}

const pickMhtmlFolder = async (win) => {
  const r = await dialog.showOpenDialog(win, {
    title: '캡처 파일 폴더 선택',
    properties: ['openDirectory']
  })
  if (r.canceled || !r.filePaths.length) return []
  const dir = r.filePaths[0]
  return fs.readdirSync(dir)
    .filter(f => /\.(mhtml?|html?)$/i.test(f))
    .sort()
    .map(f => path.join(dir, f))
}

async function runE2E() {
  const results = []
  let dir = null
  if (process.env.E2E_DIR) {
    const cand = path.resolve(app.getAppPath(), process.env.E2E_DIR)
    if (fs.existsSync(cand)) dir = cand
  }
  if (!dir) {
    let probe = app.getAppPath()
    for (let i = 0; i < 4 && !dir; i++) {
      const cand = path.join(probe, '..', 'shoping_cart')
      if (fs.existsSync(cand)) dir = cand
      else probe = path.join(probe, '..')
    }
  }
  if (!dir) dir = 'shoping_cart'
  const files = fs.readdirSync(dir).filter(f => /\.mhtml?$/i.test(f))
  const allFiles = [...files]
  const loadedDocs = []
  const newDir = path.join(dir, 'new')
  if (fs.existsSync(newDir)) {
    for (const f of fs.readdirSync(newDir).filter(f => /\.mhtml?$/i.test(f))) allFiles.push(path.join('new', f))
  }
  for (const f of allFiles) {
    try {
      const doc = loadDocument(path.join(dir, f))
      loadedDocs.push(doc)
      results.push({ fileName: f, mall: doc.mallName, items: doc.itemCount, shipping: doc.shippingFee, err: doc.error || null, specs: doc.rows.filter(r => !r.isShipping).slice(0, 4).map(r => `${r.name.slice(0, 18)} => ${r.spec || '(빈칸)'}`) })
    } catch (e) {
      results.push({ fileName: f, mall: 'ERROR', items: 0, shipping: null, err: String(e.message || e) })
    }
  }
  let coupangCheckedOk = null
  const testOkNew = path.join(dir, '..', 'test_OK', 'new')
  if (fs.existsSync(testOkNew)) {
    const f = fs.readdirSync(testOkNew).find(x => /쿠팡/i.test(x) && /\.mhtml?$/i.test(x))
    if (f) {
      try {
        const doc = loadDocument(path.join(testOkNew, f))
        const itemRows = doc.rows.filter(r => !r.isShipping)
        const sum = itemRows.reduce((s, r) => s + r.roundedPrice * r.qty, 0)
        coupangCheckedOk = doc.ruleId === 'coupang' && itemRows.length === 4 && sum === 251770
        results.push({ fileName: `test_OK/new/${f}`, mall: doc.mallName, items: doc.itemCount, shipping: doc.shippingFee, err: doc.error || null, checkedOnly: coupangCheckedOk })
      } catch (e) {
        coupangCheckedOk = false
      }
    }
  }

  const docAny = listDocIds()[0]
  let protocolOk = null
  let pickerServed = null
  let checkedScriptOk = null
  if (docAny) {
    try {
      const res = await net.fetch(`app-mhtml://${docAny}/`)
      const body = await res.text()
      protocolOk = res.status === 200 && body.length > 1000
      checkedScriptOk = body.includes('data-arge-checked') && body.includes('data-selected')
      const pres = await net.fetch(`app-mhtml://${docAny}/?picker=1`)
      const pbody = await pres.text()
      pickerServed = pres.status === 200 && pbody.includes('picker-select') && pbody.includes('doc-size')
    } catch (e) {
      protocolOk = `ERR: ${e.message}`
    }
  }
  let cssPartCheck = null
  let shotInfo = null
  if (docAny) {
    try {
      const doc = getDoc(docAny)
      const checks = []
      for (let i = 0; i < doc.parts.length; i++) {
        if (!(doc.parts[i].contentType || '').startsWith('text/css')) continue
        const res = await net.fetch(`app-mhtml://${docAny}/${i}`)
        const body = await res.text()
        checks.push({ idx: i, status: res.status, len: body.length, head: body.slice(0, 50).replace(/\s+/g, ' ') })
      }
      cssPartCheck = checks
    } catch (e) {
      cssPartCheck = `ERR: ${e.message}`
    }
    if (process.env.E2E_SHOT) {
      try {
        for (let i = 0; i < 20; i++) {
          try {
            if (await mainWindow.webContents.executeJavaScript('!!(window.__store)')) break
          } catch {}
          await new Promise(r => setTimeout(r, 500))
        }
        mainWindow.webContents.send('mhtml-received', loadedDocs[0])
        await new Promise(r => setTimeout(r, 4500))
        const img = await mainWindow.webContents.capturePage()
        const buf = img.toPNG()
        fs.writeFileSync(process.env.E2E_SHOT, buf)
        shotInfo = { saved: process.env.E2E_SHOT, bytes: buf.length }
        // 프레임 내부 렌더링 상태 수치 검증 (스타일시트 적용 수, li 가로/세로 배치, 폰트)
        let frames = []
        try { frames = mainWindow.webContents.mainFrame.frames || [] } catch {}
        if (!frames.length) { try { frames = mainWindow.webContents.mainFrame.framesInSubtree || [] } catch {} }
        shotInfo.frameUrls = frames.map(f => String(f.url || '').slice(0, 60))
        const vf = frames.find(f => String(f.url || '').startsWith('app-mhtml://') && !String(f.url || '').includes('picker=1'))
        if (vf) {
          shotInfo.renderCheck = await vf.executeJavaScript(`(() => {
            const sheets = [...document.styleSheets].map(s => { try { return { href: (s.href || 'inline').slice(-46), rules: s.cssRules.length } } catch (e) { return { href: (s.href || 'inline').slice(-46), err: String(e.message).slice(0, 40) } } })
            const lis = [...document.querySelectorAll('ul li')]
            let horizontalNav = null
            if (lis.length >= 2) {
              const a = lis[0].getBoundingClientRect(), b = lis[1].getBoundingClientRect()
              horizontalNav = Math.abs(a.top - b.top) < Math.min(a.height || 1, b.height || 1) / 2
            }
            return { sheets, liCount: lis.length, horizontalNav, fontFamily: getComputedStyle(document.body).fontFamily.slice(0, 40) }
          })()`)
        }
      } catch (e) {
        shotInfo = `ERR: ${e.message}`
      }
    }
  }

  let receiverCheck = null
  if (globalThis.__receiverPort) {    try {
      const base = `http://127.0.0.1:${globalThis.__receiverPort}`
      const ping = await net.fetch(`${base}/ping`)
      const pingJson = JSON.parse(await ping.text())
      const bmInfo = JSON.parse(await (await net.fetch(`${base}/bookmark-info`)).text())
      const install = await net.fetch(`${base}/install`)
      const installHtml = await install.text()
      const sampleHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>t</title></head><body><ul class="list__goods-view"><li class="list-item"><div class="box__goods-info product__list"><div class="box__info"><div class="box__goods-name"><a class="text__goods-name"><span class="text__item-name">E2E테스트상품</span></a></div><div class="box__option"></div><div class="box__sum"><span class="text__title">수량</span><span class="text__sum--number">2개</span></div></div><div class="box__couponwrap"><span class="format-price"><strong class="text__value">2,000</strong><span class="text__unit">원</span></span></div></div></li></ul></body></html>'
      const post = await net.fetch(`${base}/html`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/html', 'X-Filename': encodeURIComponent('e2e테스트.html'), 'X-Source-Url': encodeURIComponent('https://checkout.gmarket.co.kr/ko/pc/checkout?e2e=1') },
        body: sampleHtml
      })
      const postJson = JSON.parse(await post.text())
      const inboxFile = postJson.file
      const captured = inboxFile ? loadDocument(inboxFile, { sourceUrl: 'https://checkout.gmarket.co.kr/ko/pc/checkout?e2e=1' }) : null
      receiverCheck = {
        ping: pingJson.ok === true,
        bookmarkInfo: bmInfo.ok === true && bmInfo.name === '🛒품의캡처' && String(bmInfo.url).startsWith('javascript:'),
        install: install.status === 200 && installHtml.includes('품의'),
        capture: !!captured && captured.mallName === 'G마켓' && captured.rows.length === 1 && captured.rows[0].name === 'E2E테스트상품' && captured.rows[0].qty === 2
      }
    } catch (e) {
      receiverCheck = `ERR: ${e.message}`
    }
  }
  const tmpXls = path.join(app.getPath('temp'), 'e2e_품목내역.xls')
  if (fs.existsSync(tmpXls)) fs.unlinkSync(tmpXls)
  createNewWorkbook(tmpXls)
  const appendRes = appendRows(tmpXls, [
    { name: 'E2E 품목', spec: '', unit: '개', qty: 2, price: 1570 },
    { name: '배송비', spec: '', unit: '식', qty: 1, price: 3000 }
  ])
  const readBack = readExcelRows(tmpXls)
  const excelOk = readBack.rows.length === 2 && readBack.rows[0][3] === 2 && readBack.rows[0][4] === 1570

  const tmpAgg = path.join(app.getPath('temp'), 'e2e_shipping_agg.xls')
  if (fs.existsSync(tmpAgg)) fs.unlinkSync(tmpAgg)
  createNewWorkbook(tmpAgg)
  appendRows(tmpAgg, [
    { name: 'E2E 품목', spec: '', unit: '개', qty: 1, price: 1000 },
    { name: '배송비', spec: '', unit: '식', qty: 1, price: 3000, isShipping: true },
    { name: '배송비', spec: '', unit: '식', qty: 2, price: 3000, isShipping: true },
    { name: '배송비', spec: '', unit: '식', qty: 1, price: 4000, isShipping: true }
  ])
  const aggBack = readExcelRows(tmpAgg)
  const shippingAggOk = aggBack.rows.length === 3
    && aggBack.rows[1][0] === '배송비' && aggBack.rows[1][3] === 3 && aggBack.rows[1][4] === 3000
    && aggBack.rows[2][0] === '배송비' && aggBack.rows[2][3] === 1 && aggBack.rows[2][4] === 4000

  const fullLoad = loadExcelFull(tmpAgg)
  const excelLoadOk = !!(fullLoad.picked
    && fullLoad.picked.items.length === 3
    && fullLoad.picked.items[0].name === 'E2E 품목' && fullLoad.picked.items[0].qty === 1
    && fullLoad.picked.items[1].isShipping === true && fullLoad.picked.items[1].qty === 3 && fullLoad.picked.items[1].roundedPrice === 3000
    && fullLoad.picked.items[2].isShipping === true && fullLoad.picked.items[2].qty === 1 && fullLoad.picked.items[2].roundedPrice === 4000)

  createNewWorkbook(tmpAgg)
  appendRows(tmpAgg, [
    { name: 'E2E 품목', spec: '', unit: '개', qty: 1, price: 1000 },
    { name: '배송비', spec: '', unit: '식', qty: 1, price: 3000, isShipping: true },
    { name: '배송비', spec: '', unit: '식', qty: 2, price: 3000, isShipping: true },
    { name: '배송비', spec: '', unit: '식', qty: 1, price: 4000, isShipping: true }
  ], { backup: false })
  const replaceBack = readExcelRows(tmpAgg)
  const excelReplaceOk = replaceBack.rows.length === 3

  const rendererCheck = await new Promise((resolve) => {
    const errs = []
    const onConsole = (_e, level, message) => {
      if (level >= 3) errs.push(String(message).slice(0, 200))
    }
    mainWindow.webContents.on('console-message', onConsole)
    const done = async () => {
      await new Promise(r => setTimeout(r, 2000))
      try {
        const state = await mainWindow.webContents.executeJavaScript(
          "(() => ({ rootChildren: (document.getElementById('root')||{children:[]}).children.length, hasHeader: !!document.querySelector('header'), footer: (document.querySelector('footer')||{textContent:''}).textContent.slice(0,60), tableCols: document.querySelectorAll('thead th').length }))()"
        )
        resolve({ errs: errs.slice(0, 5), ...state })
      } catch (e) {
        resolve({ errs: errs.slice(0, 5), fatal: String(e && e.message || e) })
      }
    }
    if (mainWindow.webContents.isLoadingMainFrame()) {
      mainWindow.webContents.once('did-finish-load', done)
    } else {
      done()
    }
    setTimeout(() => resolve({ errs: errs.slice(0, 5), fatal: 'did-finish-load timeout' }), 30000)
  })

  const mappingCheck = await new Promise((resolve) => {
    const done = async () => {
      try {
        const started = await mainWindow.webContents.executeJavaScript("window.__store && window.__store.getState().startMapping().then(() => 'ok')")
        if (started !== 'ok') { resolve({ started: false }); return }

        const sampleHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>mapping</title></head><body><ul class="list__goods-view"><li class="list-item"><div class="box__goods-info product__list"><div class="box__info"><div class="box__goods-name"><a class="text__goods-name"><span class="text__item-name">매핑테스트상품</span></a></div><div class="box__option"></div><div class="box__sum"><span class="text__title">수량</span><span class="text__sum--number">3개</span></div></div><div class="box__couponwrap"><span class="format-price"><strong class="text__value">5,000</strong><span class="text__unit">원</span></span></div></div></li></ul></body></html>'
        const mapFile = path.join(app.getPath('temp'), 'e2e-mapping-capture.html')
        fs.writeFileSync(mapFile, sampleHtml, 'utf-8')
        const doc = loadDocument(mapFile, { sourceUrl: 'https://maptest-mall.example.co.kr/order' })
        mainWindow.webContents.send('mhtml-received', doc)

        await new Promise(r => setTimeout(r, 3000))
        const st1 = await mainWindow.webContents.executeJavaScript("(() => { const m = window.__store.getState().mapping; return { waiting: m.waiting, captured: !!m.capturedDocId, step: m.step } })()")

        let frames = []
        try { frames = mainWindow.webContents.mainFrame.frames || [] } catch {}
        if (!frames.length) { try { frames = mainWindow.webContents.mainFrame.framesInSubtree || [] } catch {} }
        // 매핑 모달 iframe만 picker=1 — 좌측 뷰어 iframe(picker=0)을 잘못 고르지 않게
        const target = frames.find(f => String(f.url || '').startsWith('app-mhtml://') && String(f.url || '').includes('picker=1'))
        if (!target) { resolve({ started: true, ...st1, frame: 'not-found', frames: frames.map(f => String(f.url).slice(0, 40)) }); return }

        await target.executeJavaScript("document.querySelector('div.box__goods-info').click()")
        await new Promise(r => setTimeout(r, 500))
        // v1.6.13부터 행 클릭 후 단계가 자동 진행되지 않는다 — [다음] 버튼과 동일한 액션 호출
        await mainWindow.webContents.executeJavaScript("window.__store && window.__store.getState().setMappingStep('name')")
        await new Promise(r => setTimeout(r, 300))
        const st2 = await mainWindow.webContents.executeJavaScript("(() => { const m = window.__store.getState().mapping; return { rowSel: !!m.rowSelector, step: m.step } })()")

        await target.executeJavaScript("document.querySelector('.text__item-name').click()")
        await new Promise(r => setTimeout(r, 500))
        const st3 = await mainWindow.webContents.executeJavaScript("(() => { const m = window.__store.getState().mapping; return { namePick: !!(m.picks.name && m.picks.name.sampleText), nameText: m.picks.name ? m.picks.name.sampleText : '' } })()")

        resolve({
          started: true,
          waiting: st1.waiting === false && st1.captured === true,
          frame: 'ok',
          rowClick: st2.rowSel === true && st2.step === 'name',
          nameClick: st3.namePick === true && st3.nameText.includes('매핑테스트상품')
        })
      } catch (e) {
        resolve({ started: true, err: String(e && e.message || e) })
      }
    }
    if (mainWindow.webContents.isLoadingMainFrame()) mainWindow.webContents.once('did-finish-load', done)
    else done()
    setTimeout(() => resolve({ fatal: 'mapping timeout' }), 40000)
  })

  const payload = { results, protocolOk, checkedScriptOk, pickerServed, cssPartCheck, shotInfo, receiverCheck, appendRes, excelOk, shippingAggOk, excelLoadOk, excelReplaceOk, coupangCheckedOk, aggRows: aggBack.rows, readBack: readBack.rows, rendererCheck, mappingCheck }
  const outFile = process.env.E2E_OUT || path.join(app.getAppPath(), 'e2e-result.json')
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf-8')
  console.log('E2E_RESULT ' + JSON.stringify(payload))
  app.exit(0)
}

function noteDoc(doc) {
  if (doc && doc.sourceUrl) setSetting('lastSourceUrl', doc.sourceUrl)
  return doc
}

function registerIpc() {
  ipcMain.handle('open-mhtml-files', async () => {
    const files = await pickMhtmlFiles(mainWindow)
    return files.map(f => {
      try {
        return noteDoc(loadDocument(f))
      } catch (e) {
        return { fileName: path.basename(f), error: String(e.message || e) }
      }
    })
  })

  ipcMain.handle('open-mhtml-folder', async () => {
    const files = await pickMhtmlFolder(mainWindow)
    return files.map(f => {
      try {
        return noteDoc(loadDocument(f))
      } catch (e) {
        return { fileName: path.basename(f), error: String(e.message || e) }
      }
    })
  })

  ipcMain.handle('load-mhtml-path', async (_e, filePath) => {
    try {
      return noteDoc(loadDocument(filePath))
    } catch (e) {
      return { fileName: path.basename(filePath), error: String(e.message || e) }
    }
  })

  ipcMain.handle('remove-doc', (_e, id) => removeDoc(id))

  ipcMain.handle('get-doc-url', (_e, id, picker) => {
    const doc = getDoc(id)
    if (!doc) return null
    return `app-mhtml://${id}/?picker=${picker ? 1 : 0}`
  })

  ipcMain.handle('reextract-doc', (_e, id, ruleId) => {
    const rule = ruleById(ruleId)
    if (!rule) return { error: '규칙을 찾을 수 없습니다' }
    return reextract(id, rule) || { error: '문서를 찾을 수 없습니다' }
  })

  ipcMain.handle('update-rows', (_e, id, rows) => updateRows(id, rows))

  ipcMain.handle('count-selector', (_e, id, selector, orientation, firstProductCol) => {
    const doc = getDoc(id)
    if (!doc || !selector) return { error: '문서 또는 선택자가 없습니다' }
    try {
      const $ = cheerio.load(doc.rawHtml)
      if (orientation === 'column') {
        let count = 0
        $(selector).each((_, table) => {
          let colCount = 0
          $(table).find('tr').each((__, tr) => {
            colCount = Math.max(colCount, $(tr).children('td,th').length)
          })
          count += Math.max(0, colCount - (firstProductCol || 0))
        })
        return { count }
      }
      return { count: $(selector).length }
    } catch {
      return { error: '선택자를 해석할 수 없습니다' }
    }
  })

  ipcMain.handle('list-rules', () => allRules().map(r => ({
    id: r.id, name: r.name, match: r.match, notes: r.notes || '', user: !!(r.user)
  })))

  ipcMain.handle('save-user-rule', (_e, rule) => {
    if (!rule.id || !/^[a-z0-9-]+$/.test(rule.id)) return { error: '규칙 ID는 영문 소문자/숫자/- 만 가능' }
    if (ruleById(rule.id)) return { error: '이미 존재하는 규칙 ID입니다' }
    rule.user = true
    saveUserRule(rule)
    return { ok: true }
  })

  ipcMain.handle('delete-user-rule', (_e, id) => {
    deleteUserRule(id)
    return { ok: true }
  })

  ipcMain.handle('rename-rule', (_e, id, name) => {
    try {
      renameRule(id, name)
      return { ok: true }
    } catch (e) {
      return { error: String(e.message || e) }
    }
  })

  ipcMain.handle('reject-doc', (_e, id) => {
    const doc = getDoc(id)
    if (!doc) return { ok: false }
    const inbox = globalThis.__inboxDir
    if (inbox && doc.filePath && path.dirname(doc.filePath) === inbox) {
      try { fs.unlinkSync(doc.filePath) } catch {}
      try { fs.unlinkSync(doc.filePath.replace(/\.(mhtml|html|htm)$/i, '') + '.url.txt') } catch {}
    }
    removeDoc(id)
    return { ok: true }
  })

  ipcMain.handle('alert-box', (_e, message) => {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['확인'],
      defaultId: 0,
      message: String(message || '')
    })
    return true
  })

  ipcMain.handle('read-excel', async (_e, filePath) => {
    const p = filePath || getSettings().excelPath || defaultXlsPath()
    if (!fs.existsSync(p)) return { error: `파일이 없습니다: ${p}`, path: p }
    try {
      const r = readExcelRows(p)
      setSetting('excelPath', p)
      return { path: p, ...r }
    } catch (e) {
      return { error: String(e.message || e), path: p }
    }
  })

  ipcMain.handle('pick-excel', async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: '품목내역 엑셀 파일 선택',
      filters: [{ name: 'Excel', extensions: ['xls', 'xlsx'] }]
    })
    if (r.canceled || !r.filePaths.length) return null
    return r.filePaths[0]
  })

  ipcMain.handle('load-excel-full', async (_e, filePath) => {
    try {
      if (!fs.existsSync(filePath)) return { error: `파일이 없습니다: ${filePath}`, path: filePath }
      const res = loadExcelFull(filePath)
      setSetting('excelPath', filePath)
      return { ok: true, path: filePath, ...res }
    } catch (e) {
      return { error: String(e.message || e), path: filePath }
    }
  })

  ipcMain.handle('excel-load-confirm', async (_e, fileName) => {
    const r = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['뒤에 추가', '교체', '취소'],
      defaultId: 0,
      cancelId: 2,
      message: `우측 테이블에 이미 품목이 있습니다.\n"${fileName}"의 품목을 어떻게 불러올까요?`
    })
    return ['append', 'replace', 'cancel'][r.response]
  })

  ipcMain.handle('append-excel', async (_e, rows, filePath) => {
    const p = filePath || getSettings().excelPath || defaultXlsPath()
    try {
      if (!fs.existsSync(p)) {
        fs.mkdirSync(path.dirname(p), { recursive: true })
        createNewWorkbook(p)
      }
      const res = appendRows(p, rows)
      setSetting('excelPath', p)
      return { ok: true, path: p, ...res }
    } catch (e) {
      return { error: String(e.message || e), path: p }
    }
  })

  ipcMain.handle('save-excel-as', async (_e, rows) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: '품목내역 저장 위치 선택',
      defaultPath: getSettings().excelPath || defaultXlsPath(),
      filters: [{ name: 'Excel (*.xls)', extensions: ['xls'] }]
    })
    if (r.canceled || !r.filePath) return { canceled: true }
    let p = r.filePath
    if (!/\.xls$/i.test(p)) p += '.xls'
    try {
      if (fs.existsSync(p)) {
        try { fs.copyFileSync(p, p + '.bak') } catch {}
        createNewWorkbook(p)
      } else {
        fs.mkdirSync(path.dirname(p), { recursive: true })
        createNewWorkbook(p)
      }
      const res = appendRows(p, rows, { backup: false })
      setSetting('excelPath', p)
      return { ok: true, path: p, replaced: true, ...res }
    } catch (e) {
      return { error: String(e.message || e), path: p }
    }
  })

  ipcMain.handle('get-settings', () => getSettings())
  ipcMain.handle('set-setting', (_e, k, v) => setSetting(k, v))

  ipcMain.handle('extension-info', () => ({ dir: extensionFolder() }))

  ipcMain.handle('copy-text', (_e, text) => {
    clipboard.writeText(String(text || ''))
    return true
  })

  ipcMain.handle('browser-action', async (_e, key, action) => {
    if (action === 'load-extension') {
      return { ok: true, note: '확장 프로그램 폴더 경로를 클립보드에 복사했습니다 — 확장 페이지에서 직접 로드해주세요' }
    }
    const b = await findBrowserByKey(key)
    if (!b) return { error: `${key === 'chrome' ? 'Chrome' : key === 'edge' ? 'Edge' : '웨일'} 브라우저를 찾을 수 없습니다` }
    // URL을 첫 인수로 단독 전달해야 확장 페이지로 이동함 (profile 플래그를 함께 넘기면
    // 실행 중 인스턴스로 릴레이될 때 URL이 무시되고 빈 창만 열림)
    const args = [b.extensionsPage, `--load-extension=${extensionFolder()}`]
    try {
      const child = spawn(b.exePath, args, { detached: true, stdio: 'ignore' })
      child.on('error', (err) => { console.error('browser-action spawn error:', err && err.message) })
      child.unref()
      return { ok: true, note: `${b.label} 확장 페이지를 열었습니다 (확장 자동 등록 시도)` }
    } catch (e) {
      return { error: String(e.message || e) }
    }
  })

  ipcMain.handle('add-bookmarklets', async () => {
    const url = buildBookmarklet(57330)
    // 프로필/실행마다 같은 guid를 재사용 — 프로필별 새 guid 생성은 동기화 복제의 원인
    const st = getSettings()
    let stableGuid = st.bookmarkGuid
    if (!stableGuid || !/^[0-9a-f-]{36}$/i.test(stableGuid)) {
      stableGuid = crypto.randomUUID()
      setSetting('bookmarkGuid', stableGuid)
    }
    const targets = BROWSER_DATA.filter(b => fs.existsSync(b.userDataDir))
    const sendProgress = (p) => {
      try { mainWindow && mainWindow.webContents.send('bookmark-progress', p) } catch {}
    }
    if (!targets.length) return { results: BROWSER_DATA.map(b => ({ browser: b.label, status: 'not-installed' })) }

    // 사전 중복 감지: 동기화가 옛 복제본을 계속 되살리는 상태면 파일 편집으론 못 이긴다 —
    // 브라우저의 북마크 관리자에서 1회 삭제(동기화 tombstone 전파)로 수렴시킨 뒤 진행
    const dupBefore = findBrowsersWithDuplicates(targets, url)
    if (dupBefore.length) {
      const r0 = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['북마크 관리자 열기', '그냥 계속'],
        defaultId: 0,
        cancelId: 1,
        message: `${dupBefore.map(b => b.label).join(', ')}에 🛒품의캡처 북마크가 2개 이상 있습니다.`,
        detail: '브라우저 동기화가 옛 복제본을 계속 되살리는 상태입니다.\n북마크 관리자에서 하나만 남기고 삭제하면 동기화 계정 전체에 삭제가 전파되어 다시 생기지 않습니다.\n(앱이 파일로 지워도 동기화가 되살리기 때문에 브라우저에서 직접 삭제해야 합니다)'
      })
      if (r0.response === 0) {
        for (const b of dupBefore) await openBookmarkManager(b.key)
        return { canceled: true, cleanupOpened: true }
      }
    }

    // 직전 실행 때 북마크가 있던 프로필이 지금 0개이고 브라우저가 실행 중이면
    // 사용자가 방금 북마크 관리자에서 삭제한 직후일 가능성이 크다 — 이 상태에서 앱이
    // 크롬을 강제종료하면 삭제(tombstone)가 동기화 서버에 올라가기 전에 죽어서
    // 옛 복제본이 다시 내려온다 (교사박동배 프로필 19개 부활 사고, v1.6.9)
    const prevCounts = getSettings().bookmarkCounts || {}
    const justDeleted = []
    for (const b of targets) {
      if (!(await isBrowserRunning(b.exeName))) continue
      for (const f of findBookmarkFiles(b.userDataDir)) {
        if ((prevCounts[f] || 0) > 0 && readCaptureBookmarkCount(f, '🛒품의캡처', url) === 0) {
          justDeleted.push(b.label)
          break
        }
      }
    }
    if (justDeleted.length) {
      const rw = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['취소하고 기다리기', '그래도 계속'],
        defaultId: 0,
        cancelId: 0,
        message: `${justDeleted.join(', ')}에서 방금 🛒품의캡처를 삭제하신 것 같습니다.`,
        detail: '삭제가 동기화 서버에 반영되기 전에 앱이 브라우저를 종료하면 옛 복제본이 다시 내려와 북마크가 계속 생깁니다.\n브라우저를 2~3분 더 열어두었다가 직접 닫은 뒤 이 버튼을 다시 눌러주세요.'
      })
      if (rw.response !== 1) return { canceled: true, syncWait: true }
    }

    const running = []
    for (const b of targets) {
      if (await isBrowserRunning(b.exeName)) running.push(b)
    }
    if (running.length) {
      const r = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['계속', '취소'],
        defaultId: 0,
        cancelId: 1,
        message: `실행 중인 브라우저(${running.map(b => b.label).join(', ')})를 닫고 북마크를 추가한 뒤 다시 열어드립니다.`,
        detail: '계속하면 해당 브라우저가 잠시 종료됩니다. 계속할까요?'
      })
      if (r.response !== 0) return { canceled: true }
      for (const b of running) {
        sendProgress({ phase: 'close', browser: b.label, index: 0, total: targets.length })
        await closeBrowserGracefully(b.exeName)
      }
    }

    const results = []
    const written = []
    for (const b of targets) {
      const files = findBookmarkFiles(b.userDataDir)
      let added = 0
      let already = 0
      const errs = []
      sendProgress({ phase: 'write', browser: b.label, index: results.length + 1, total: targets.length, profiles: files.length })
      if (await isBrowserRunning(b.exeName)) await closeBrowserGracefully(b.exeName)
      for (const f of files) {
        const r2 = addBookmarkToFront(f, '🛒품의캡처', url, stableGuid)
        if (r2.ok && r2.added) added++
        else if (r2.ok && r2.already) already++
        else errs.push(r2.error)
        if (r2.ok) written.push({ file: f, exeName: b.exeName })
      }
      results.push({
        browser: b.label,
        status: added || already ? 'ok' : 'fail',
        added,
        already,
        profiles: files.length,
        err: errs[0] || null
      })
    }
    const countsNow = {}
    for (const w of written) countsNow[w.file] = readCaptureBookmarkCount(w.file, '🛒품의캡처', url)
    setSetting('bookmarkCounts', countsNow)

    // 쓰기 되돌리기 검증: 백그라운드 프로세스(시작 부스트 등)가 종료 직후 옛 모델을
    // 다시 플러시해 우리 쓰기를 덮어쓰는 경우가 있다 — 완전 종료 후 재작성, 최대 3회
    for (let round = 0; round < 3; round++) {
      sendProgress({ phase: 'verify', browser: '', index: targets.length, total: targets.length })
      await new Promise(r => setTimeout(r, round === 0 ? 2500 : 3000))
      let clobbered = false
      for (const w of written) {
        if (!isCaptureBookmarkAtFront(w.file, '🛒품의캡처', url)) {
          clobbered = true
          await closeBrowserGracefully(w.exeName)
          addBookmarkToFront(w.file, '🛒품의캡처', url, stableGuid)
        }
      }
      if (!clobbered) break
    }

    // 재시작: 확장 플래그를 절대 붙이지 않는다 — v1.6.9가 --load-extension을 붙였더니
    // Chrome 153이 실제로 확장을 로드했고 self-heal이 무한 생성 루프를 일으켜
    // 북마크 361개가 만들어졌다 (2026-09-17 사고)
    for (const b of targets) {
      if (running.includes(b)) {
        const exe = await findBrowserByKey(b.key)
        if (exe) {
          try {
            const child = spawn(exe.exePath, [], { detached: true, stdio: 'ignore' })
            child.on('error', () => {})
            child.unref()
          } catch {}
        }
      }
    }
    sendProgress(null)
    if (results.some(r => r.status === 'ok')) {
      setTimeout(() => notifyResidualDuplicates(targets, url), 30000)
      try {
        await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: '북마크바 추가 완료',
          message: '북마크바 제일 앞에 🛒품의캡처를 넣었습니다.\n\n동기화(브라우저 로그인) 상태에서 북마크가 2개 이상 보이면\n북마크 관리자(Ctrl+Shift+O)에서 하나만 남기고 삭제해 주세요.\n한 번 삭제하면 동기화 계정 전체에 전파되어 다시 생기지 않습니다.'
        })
      } catch {}
    }
    return { results }
  })


  ipcMain.handle('startup-status', async () => {
    const r = await regRun(['query', RUN_KEY, '/v', RUN_NAME])
    const registered = r.ok && r.stdout.includes(RUN_NAME)
    let target = ''
    if (registered) {
      const m = /REG_SZ\s+(.+)$/m.exec(r.stdout)
      if (m) target = m[1].trim()
    }
    return { registered, target }
  })

  ipcMain.handle('startup-register', async () => {
    const cur = await ipcMain.invoke('startup-status')
    if (cur && cur.registered) return { ok: true, already: true }
    const r = await regRun(['add', RUN_KEY, '/v', RUN_NAME, '/t', 'REG_SZ', '/d', startupTarget(), '/f'])
    return r.ok ? { ok: true } : { ok: false, error: r.err }
  })

  ipcMain.handle('startup-remove', async () => {
    const r = await regRun(['delete', RUN_KEY, '/v', RUN_NAME, '/f'])
    if (!r.ok && /unable to find|cannot find/i.test(r.err || '')) return { ok: true, none: true }
    return r.ok ? { ok: true } : { ok: false, error: r.err }
  })

  ipcMain.handle('open-manual', () => shell.openPath(manualFile()))

  ipcMain.handle('open-extension-folder', () => {
    const dir = extensionFolder()
    clipboard.writeText(dir)
    shell.openPath(dir)
    return dir
  })

  ipcMain.handle('reveal-file', (_e, p) => shell.showItemInFolder(p))

  ipcMain.handle('setup-browsers', async () => {
    try {
      return await setupBrowsers({ openInstallPage: true })
    } catch (e) {
      return { error: String(e.message || e) }
    }
  })
}

const BROWSER_CANDIDATES = [
  { key: 'chrome', label: 'Chrome', exe: 'chrome.exe', paths: [
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ], flagBlockedAt: 137 },
  { key: 'edge', label: 'Edge', exe: 'msedge.exe', paths: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ] },
  { key: 'whale', label: 'Whale', exe: 'whale.exe', paths: [
    path.join(process.env.LOCALAPPDATA || '', 'Naver', 'Naver Whale', 'Application', 'whale.exe'),
    'C:\\Program Files\\Naver\\Naver Whale\\Application\\whale.exe',
    'C:\\Program Files (x86)\\Naver\\Naver Whale\\Application\\whale.exe'
  ] }
]

async function getFileVersion(exePath) {
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-Command',
      `(Get-Item -LiteralPath '${exePath.replace(/'/g, "''")}').VersionInfo.FileVersion`
    ])
    return stdout.trim()
  } catch {
    return ''
  }
}

async function createShortcut(lnkPath, target, args) {
  const ps = [
    `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnkPath.replace(/'/g, "''")}')`,
    `$s.TargetPath = '${target.replace(/'/g, "''")}'`,
    `$s.Arguments = '${args.replace(/'/g, "''")}'`,
    `$s.Save()`
  ].join('; ')
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', ps])
}

async function lookupAppPath(exe) {
  for (const root of ['HKLM', 'HKCU']) {
    try {
      const { stdout } = await execFileAsync('reg.exe', ['query', `${root}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`, '/ve'])
      const m = /REG_SZ\s+"?(\S+?\.exe)"?\s*$/im.exec(stdout.trim())
      if (m) {
        const p = m[1].replace(/"/g, '')
        if (fs.existsSync(p)) return p
      }
    } catch {}
  }
  return null
}

async function findBrowserByKey(key) {
  const cand = BROWSER_CANDIDATES.find(b => b.key === key)
  const meta = BROWSER_DATA.find(b => b.key === key)
  if (!cand || !meta) return null
  const exePath = cand.paths.find(p => p && fs.existsSync(p)) || (await lookupAppPath(cand.exe))
  if (!exePath) return null
  return { key, label: cand.label, exePath, extensionsPage: meta.extensionsPage }
}

async function isBrowserRunning(exeName) {
  try {
    const { stdout } = await execFileAsync('tasklist.exe', ['/FI', `IMAGENAME eq ${exeName}`, '/FO', 'CSV', '/NH'])
    return stdout.toLowerCase().includes(exeName.toLowerCase())
  } catch {
    return false
  }
}

async function closeBrowserGracefully(exeName) {
  try {
    await execFileAsync('taskkill.exe', ['/IM', exeName])
  } catch {}
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 400))
    if (!(await isBrowserRunning(exeName))) return true
  }
  // 백그라운드/시작 부스트 프로세스는 WM_CLOSE를 무시한다 — 강제 종료 후 완전 소멸 확인.
  // 살아 있는 채로 두면 옛 북마크 모델을 나중에 플러시해 외부 편집을 되돌린다.
  for (let i = 0; i < 3; i++) {
    try {
      await execFileAsync('taskkill.exe', ['/F', '/IM', exeName])
    } catch {}
    await new Promise(r => setTimeout(r, 600))
    if (!(await isBrowserRunning(exeName))) return true
  }
  return !(await isBrowserRunning(exeName))
}

function findBrowsersWithDuplicates(targets, url) {
  return targets.filter(b =>
    findBookmarkFiles(b.userDataDir).some(f => readCaptureBookmarkCount(f, '🛒품의캡처', url) >= 2)
  )
}

async function openBookmarkManager(key) {
  const exe = await findBrowserByKey(key)
  if (!exe) return
  const managerUrl = key === 'edge'
    ? 'edge://bookmarks/?q=품의캡처'
    : key === 'whale'
      ? 'whale://bookmarks/?q=품의캡처'
      : 'chrome://bookmarks/?q=품의캡처'
  try {
    const child = spawn(exe.exePath, [managerUrl], { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
  } catch {}
}

function notifyResidualDuplicates(targets, url) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const dups = findBrowsersWithDuplicates(targets, url)
    if (!dups.length) return
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['북마크 관리자 열기', '확인'],
      defaultId: 0,
      cancelId: 1,
      message: `${dups.map(b => b.label).join(', ')}에 🛒품의캡처가 여전히 2개 이상 있습니다.`,
      detail: '브라우저 동기화가 옛 복제본을 다시 내려받은 것입니다.\n북마크 관리자에서 하나만 남기고 삭제하면 동기화 계정 전체에서 사라져 다시 생기지 않습니다.'
    }).then(r => {
      if (r.response === 0) for (const b of dups) openBookmarkManager(b.key)
    }).catch(() => {})
  } catch {}
}

async function setupBrowsers({ openInstallPage = true } = {}) {
  const extDir = extensionFolder()
  const desktop = app.getPath('desktop')
  const results = []

  for (const b of BROWSER_CANDIDATES) {
    const exePath = b.paths.find(p => p && fs.existsSync(p)) || (await lookupAppPath(b.exe))
    if (!exePath) {
      results.push({ browser: b.label, status: 'not-installed' })
      continue
    }
    const version = await getFileVersion(exePath)
    const major = parseInt((version.split('.')[0] || ''), 10)
    if (b.flagBlockedAt && major >= b.flagBlockedAt) {
      results.push({ browser: b.label, status: 'bookmarklet-only', version, reason: `v${major}은(는) 확장 자동 적용 정책 제한` })
      continue
    }
    try {
      const lnk = path.join(desktop, `${b.label} - 품의 캡처.lnk`)
      await createShortcut(lnk, exePath, `--load-extension="${extDir}"`)
      results.push({ browser: b.label, status: 'shortcut-created', version, shortcut: lnk })
    } catch (e) {
      results.push({ browser: b.label, status: 'error', error: String(e.message || e) })
    }
  }

  let installOpened = false
  if (openInstallPage && globalThis.__receiverPort) {
    await shell.openExternal(`http://127.0.0.1:${globalThis.__receiverPort}/install`)
    installOpened = true
  }
  return { results, installOpened, extDir }
}

function defaultXlsPath() {
  return path.join(app.getPath('desktop'), 'Automatic_generation_of_approval_requests_html', '품목내역(통합).xls')
}

const isE2E = !!process.env.E2E
let gotLock = true
if (isE2E) {
  app.setPath('userData', path.join(app.getPath('temp'), 'arge-e2e-userdata'))
} else {
  gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
  }
}

if (gotLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    protocol.handle('app-mhtml', (request) => serveDoc(request.url))
    registerIpc()
    try { extensionFolder() } catch {}
    globalThis.__inboxDir = path.join(app.getPath('userData'), 'inbox')
    try {
      const { server, port } = await startReceiver({
        onCapture: (file, sourceUrl) => {
          try {
            const doc = noteDoc(loadDocument(file, { sourceUrl }))
            mainWindow && mainWindow.webContents.send('mhtml-received', doc)
          } catch (e) {
            mainWindow && mainWindow.webContents.send('mhtml-received', { fileName: path.basename(file), error: String(e.message || e) })
          }
        }
      })
      globalThis.__receiverPort = port
    } catch (e) {
      globalThis.__receiverPort = null
    }
    createWindow()

    if (process.env.E2E) {
      runE2E().catch(e => {
        try {
          fs.writeFileSync(process.env.E2E_OUT || path.join(app.getAppPath(), 'e2e-result.json'), JSON.stringify({ fatal: String(e && e.stack || e) }))
        } catch {}
        app.exit(1)
      })
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  app.quit()
})
