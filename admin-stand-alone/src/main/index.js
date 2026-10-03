/*
 * 쇼핑몰 규칙 관리자 — 단독 실행형(ADMIN_SATAD_ALONE.MD)
 * 사용자용 앱과 이름·userData·단일 인스턴스 잠금·수신 포트를 공유하지 않는다(§4.2).
 */
import { app, BrowserWindow, ipcMain, dialog, protocol, net, safeStorage, shell, Notification, Menu } from 'electron'
import { createServer } from 'node:http'
import { join } from 'node:path'
import fs from 'node:fs'
import { detectBridge } from './services/zai-tool-bridge.js'
import { JevJudgeService } from './services/jev-judge-service.js'
import { detectProjectRoot, projectInfo } from './services/project-service.js'
import { rulesList, saveRule, deleteRuleTx, deleteRulePreview, registerBuiltinRules, rebuildRulesJson, resolveRepoRoot, gitCommit, listTransactions, rollbackTransaction } from './services/rules-service.js'
import { appendShadowRecord, readShadowRecords, resolveAdminDecision } from './services/shadow-store.js'
import {
  loadSettings, saveSettings, storeTypesafeKey, loadTypesafeKey, clearTypesafeKey,
  shadowStats, autoApproveAllowed, storeEmailPass, loadEmailPass
} from './services/settings-service.js'
import {
  openMappingSample, closeSample, serveSampleRequest,
  assembleMappingRule, previewMappingExtraction, isSampleFile
} from './services/mapping-service.js'
import { verifyProject } from './services/verification-service.js'
import { verifySamples } from './services/sample-verify-service.js'
import { runShadowFixtures } from './services/shadow-fixtures.js'
import { scanCaptureFolder, summarizeScan } from './services/sample-folder-service.js'
import { gitStatus, gitDiff, gitStage, gitCommit as gitCommitFiles, gitPush, gitAheadBehind, gitFileLastDate, gitRemoteVersions } from './services/git-service.js'
import { createLogStore, maskSecrets } from './services/log-service.js'
import { startReceiver, stopReceiver } from './services/receiver-service.js'
import { sampleHtmlText } from '../../../app/src/main/lib/admin-text.js'
import { listGeminiModels, testGeminiConnection, extractItemsWithGemini, DEFAULT_GEMINI_MODEL, lookupRpd, summarizeUpdate } from './services/gemini-service.js'
import {
  listShops as ucListShops, setShops as ucSetShops, loadUpdateState, runFullCheck, todayChangedCount, readUpdateLog,
  listPatterns as ucListPatterns, setPatterns as ucSetPatterns, resetPatterns as ucResetPatterns, PATTERN_CATEGORIES
} from './services/update-check-service.js'
import { storeGoogleKey, loadGoogleKey, clearGoogleKey } from './services/settings-service.js'
import {
  prepareGenerationRequest, runGeneration, applyGenerationResult
} from './services/generation-service.js'

const logStore = createLogStore()

const jevService = new JevJudgeService({
  keyProvider: () => loadTypesafeKey(app.getPath('userData'), { decryptFn: b => safeStorage.decryptString(b) })
    || process.env.TYPESAFE_API_KEY || ''
})

app.setName('쇼핑몰 규칙 관리자')
// E2E 격리 — 별도 userData로 잠금·설정 충돌을 피한다(사용자 실행 앱과 동시 E2E 가능)
const e2eUserDataArg = process.argv.find(a => a.startsWith('--e2e-user-data='))
if (e2eUserDataArg) {
  const dir = e2eUserDataArg.split('=').slice(1).join('=')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  app.setPath('userData', dir)
}
// admin-sample:// — 메모리의 샘플 문서만 서빙하는 안전 뷰어 프로토콜(§12.2)
protocol.registerSchemesAsPrivileged([
  { scheme: 'admin-sample', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

let mainWindow = null
let receiver = null

// 메뉴 — Mall(관리 쇼핑몰 링크: rules.json match 도메인)·Help(사용 설명서 PDF·버전 정보)
function buildAppMenu(repoRoot) {
  let mallItems = []
  if (repoRoot) {
    try {
      const bundle = JSON.parse(fs.readFileSync(join(repoRoot, 'rules.json'), 'utf-8'))
      mallItems = (bundle.rules || [])
        .filter(r => Array.isArray(r.match) && r.match.length)
        .map(r => ({
          label: `${r.name || r.id} — ${r.match[0]}`,
          click: () => { try { shell.openExternal(`https://${r.match[0]}`) } catch {} }
        }))
    } catch {}
  }
  const manualPath = app.isPackaged
    ? join(process.resourcesPath, 'resources', '쇼핑몰규칙관리자_사용설명서.pdf')
    : join(app.getAppPath(), 'resources', '쇼핑몰규칙관리자_사용설명서.pdf')
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Mall', submenu: mallItems.length ? mallItems : [{ label: '규칙 없음 — 홈 탭에서 저장소를 선택하세요', enabled: false }] },
    { label: 'Help', submenu: [
      { label: '사용 설명서 열기 (PDF)', click: () => { try { shell.openPath(manualPath) } catch {} } },
      { label: '버전 정보', click: () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('navigate-tab', 'versions') } }
    ] }
  ]))
}

// §7.9 — 운영 로그는 링 버퍼로 모아 하단 상태바·로그 패널에 중계한다
function opLog(level, step, message, detail = '') {
  const entry = logStore.append({ level, step, message: maskSecrets(message), detail: maskSecrets(detail) })
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('operation:log', entry)
  return entry
}

function createWindow({ show = true } = {}) {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 820,
    show,
    title: '쇼핑몰 규칙 관리자',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  // 렌더러 초기 오류도 놓치지 않게 — loadFile 이전에 리스너를 건다
  mainWindow.webContents.on('console-message', (_e, _lv, msg, line, sourceId) => {
    const m = String(msg)
    if (m.includes('[mapping-debug]')) { (resultMappingDebug = resultMappingDebug || []).push(m.split('[mapping-debug]')[1].trim()); return }
    if (/error/i.test(m)) (resultRendererErrors = resultRendererErrors || []).push(`${m.slice(0, 200)} @ ${String(sourceId || '').split(/[\\/]/).pop()}:${line}`)
  })
  mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  return mainWindow
}

let resultMappingDebug = null
let resultRendererErrors = null

const gotLock = app.requestSingleInstanceLock('shopping-mall-rule-manager')
if (!gotLock) {
  try { fs.writeFileSync(join(app.getPath('temp'), 'rule-mgr-lock-fail.txt'), String(Date.now()), 'utf-8') } catch {}
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
  // 시작 오류가 조용히 죽지 않게 가시화한다 — whenReady 본문 예외는 창 없는 무한 대기로 이어진다
  process.on('unhandledRejection', e => console.error('[startup] unhandled:', e && e.message || e))
    const userDataDir = app.getPath('userData')

    protocol.handle('admin-sample', (request) => {
      const u = new URL(request.url)
      const token = u.hostname
      const served = serveSampleRequest(token, u)
      if (!served) return new Response('sample not found', { status: 404 })
      return new Response(served.data, {
        status: served.status || 200,
        headers: { 'content-type': served.contentType }
      })
    })

    // 브리지 감지(§10.3) · 설정(§21)
    ipcMain.handle('zai-bridge-status', () => detectBridge())
    ipcMain.handle('settings:get', () => {
      const s = loadSettings(userDataDir)
      delete s.jevKey
      return s
    })
    ipcMain.handle('settings:set', (_e, partial) => {
      const s = saveSettings(userDataDir, partial)
      delete s.jevKey
      return s
    })
    ipcMain.handle('settings:set-jev-key', (_e, plainKey) => {
      const r = storeTypesafeKey(userDataDir, plainKey, {
        encryptFn: k => safeStorage.encryptString(k)
      })
      return r
    })
    ipcMain.handle('settings:clear-jev-key', () => clearTypesafeKey(userDataDir))
    ipcMain.handle('settings:has-jev-key', () => {
      return { stored: !!loadTypesafeKey(userDataDir, { decryptFn: b => safeStorage.decryptString(b) }), env: !!process.env.TYPESAFE_API_KEY }
    })

    // Jev — renderer는 TypeSafe API를 직접 호출하지 않고 main 서비스만 경유한다(JEV.MD §21)
    ipcMain.handle('jev:get-status', () => {
      const stats = shadowStats(readShadowRecords(userDataDir))
      const settings = loadSettings(userDataDir)
      return {
        configured: jevService.isConfigured(),
        keyStored: !!settings.jevKey,
        shadowMode: !!(settings.jev && settings.jev.shadowMode),
        autoApprove: autoApproveAllowed(settings, stats),
        stats,
        endpoint: 'typesafe'
      }
    })
    ipcMain.handle('jev:test-connection', () => jevService.testConnection())
    // Shadow Mode — 판정을 기록만 하고 배포를 차단·승인하지 않는다(§19)
    ipcMain.handle('jev:judge-candidate', (_e, request) => {
      return jevService.judgeCandidate(request).then(jev => {
        appendShadowRecord(userDataDir, {
          ruleId: request && request.rule && request.rule.id,
          jevDecision: jev.answers && jev.answers.deployment_ready && jev.answers.deployment_ready.value,
          jevConfidence: jev.answers && jev.answers.deployment_ready && jev.answers.deployment_ready.confidence,
          localDecision: request && request.localDecision,
          adminDecision: request && request.adminDecision,
          notes: ''
        })
        return { jev, shadowRecorded: true }
      }).catch(e => ({ error: e.code || 'JEV_NETWORK_ERROR', message: e.message }))
    })
    ipcMain.handle('jev:get-shadow-results', () => readShadowRecords(userDataDir))

    // 프로젝트 탐지(§8.1 우선순위) — CLI 1순위 → 최근 프로젝트 2순위 → exe 위치 상승 탐색.
    // 패키지 exe는 %TEMP%에서 실행되므로 최근 프로젝트 복원이 없으면 매번 수동 선택이 필요하다.
    const projectArg = process.argv.find(a => a.startsWith('--project='))
    const cliProject = projectArg ? projectArg.split('=').slice(1).join('=') : ''
    let project = null
    const setProject = (root) => {
      project = root ? projectInfo(root) : null
      if (project) {
        const s = loadSettings(userDataDir)
        const recents = [project.repoRoot, ...(s.recentProjects || [])].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 5)
        saveSettings(userDataDir, { recentProjects: recents, lastProject: project.repoRoot })
      }
      try { buildAppMenu(project ? project.repoRoot : '') } catch {}
      return project
    }
    ipcMain.handle('project:detect', (_e, startDir) => {
      const recents = loadSettings(userDataDir).recentProjects || []
      const candidates = [startDir, cliProject, ...recents, join(app.getAppPath(), '..'), app.getAppPath()]
      for (const c of candidates) {
        if (!c) continue
        const root = detectProjectRoot(c)
        if (root) return setProject(root)
      }
      return setProject(null)
    })
    ipcMain.handle('project:choose', async () => {
      const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
      if (r.canceled || !r.filePaths.length) return project
      return setProject(r.filePaths[0])
    })
    ipcMain.handle('project:recent', () => loadSettings(userDataDir).recentProjects || [])

    ipcMain.handle('rules:list', () => (project ? rulesList() : []))
    ipcMain.handle('rules:read', (_e, id) => {
      if (!project || !/^[a-z0-9][a-z0-9-]*$/i.test(String(id))) return ''
      const p = join(project.rulesDir, `${id}.json`)
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
    })
    ipcMain.handle('rules:save', (_e, repoRoot, rule) => saveRule(userDataDir, repoRoot, rule))
    ipcMain.handle('rules:delete-preview', (_e, repoRoot, id) => deleteRulePreview(repoRoot, id))
    ipcMain.handle('rules:delete', (_e, id, repoRoot) => {
      const r = deleteRuleTx(userDataDir, repoRoot || (project ? project.repoRoot : resolveRepoRoot()), id, { bump: false })
      opLog(r.ok ? 'info' : 'warn', 'delete', r.ok ? `규칙 삭제 완료: ${id}` : `규칙 삭제 실패(${r.status}) — 자동 복구됨: ${id}`, (r.error || '').slice(0, 200))
      return r
    })
    ipcMain.handle('rules:builtin', () => registerBuiltinRules())
    ipcMain.handle('rules:rebuild-json', (_e, bump) => rebuildRulesJson(resolveRepoRoot(), { bump: !!bump }))
    ipcMain.handle('git:commit-rules', (_e, { repoRoot, files, message, push }) => gitCommit(repoRoot, files, message, { push, log: m => console.log('[git]', m) }))

    // 파일 선택 — picker가 발급한 경로만 renderer로 전달한다(§19.3)
    ipcMain.handle('pick:samples', async (_e, kind) => {
      const r = await dialog.showOpenDialog(mainWindow, {
        title: kind === 'answer' ? '정답 Excel 선택' : '샘플 HTML/MHTML 선택(최대 2개)',
        properties: ['openFile', ...(kind === 'answer' ? [] : ['multiSelections'])],
        filters: kind === 'answer'
          ? [{ name: 'Excel', extensions: ['xls', 'xlsx'] }]
          : [{ name: '캡처', extensions: ['html', 'htm', 'mhtml', 'mht'] }]
      })
      if (r.canceled) return []
      return r.filePaths
    })

    // 클릭 매핑(§12)
    ipcMain.handle('mapping:open-file', async () => {
      const r = await dialog.showOpenDialog(mainWindow, {
        title: '매핑 샘플 HTML/MHTML 열기',
        properties: ['openFile'],
        filters: [{ name: '캡처', extensions: ['html', 'htm', 'mhtml', 'mht'] }]
      })
      if (r.canceled || !r.filePaths.length) return null
      return openMappingSample(r.filePaths[0])
    })
    ipcMain.handle('mapping:open-path', (_e, p) => {
      if (!isSampleFile(p) || !fs.existsSync(p)) throw new Error('지원하지 않는 파일입니다')
      return openMappingSample(p)
    })
    ipcMain.handle('mapping:close', (_e, token) => closeSample(token))
    ipcMain.handle('mapping:assemble', (_e, req) => assembleMappingRule(req))
    ipcMain.handle('mapping:preview', (_e, req) => previewMappingExtraction(req))

    // AI 생성(§7.6 ↔ §14) — 진행은 operation:progress 이벤트로 중계한다
    ipcMain.handle('generate:validate', (_e, payload) => {
      const req = prepareGenerationRequest(payload, { repoRoot: project ? project.repoRoot : resolveRepoRoot() })
      return {
        contexts: req.contexts.map(c => ({ kind: c.kind, ruleId: c.ruleId, samples: c.samples.length, expectedItems: c.expected ? c.expected.items.length : null, similarNames: c.similarNames })),
        answerParsed: req.answerParsed
      }
    })
    ipcMain.handle('generate:start', async (_e, payload) => {
      const req = prepareGenerationRequest(payload, { repoRoot: project ? project.repoRoot : resolveRepoRoot() })
      return runGeneration(req, {
        model: payload.model || '',
        maxRepair: payload.maxRepair != null ? payload.maxRepair : 3,
        repoRoot: project ? project.repoRoot : resolveRepoRoot(),
        callAi: payload.mockAi ? mockAiFor(req) : undefined,
        callJev: payload.mockJev ? mockJev : undefined,
        onJudge: ({ rule, deterministic, jevRes }) => {
          // §19 실사용 수집 — 후보·수정 판정마다 Shadow 레코드 적재(adminDecision은 적용/폐기 시 확정).
          // E2E 스모크가 남긴 기록은 통계에서 제외되도록 notes에 태그를 남긴다.
          const isE2E = process.argv.includes('--e2e')
          const localPass = deterministic.extractionSucceeded && deterministic.countMatches && deterministic.totalWithinTolerance
          appendShadowRecord(userDataDir, {
            ruleId: rule.id,
            localDecision: localPass ? 'pass' : 'fail',
            jevDecision: jevRes && jevRes.answers && jevRes.answers.deployment_ready && jevRes.answers.deployment_ready.value,
            jevConfidence: jevRes && jevRes.answers && jevRes.answers.deployment_ready && jevRes.answers.deployment_ready.confidence,
            adminDecision: '',
            notes: isE2E ? 'e2e smoke' : '실사용 생성'
          })
        },
        onProgress: m => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('operation:progress', m)
          opLog(m.kind === 'cart' || m.kind === 'order' ? 'info' : 'info', 'generate', `[${m.kind || '-'}] ${m.message}`)
        }
      })
    })
    ipcMain.handle('generate:apply', (_e, { repoRoot, generation, options }) => applyGenerationResult(repoRoot, generation, { ...(options || {}), userDataDir }))

    // 트랜잭션 이력·복원(§13.2·§29.3)
    ipcMain.handle('tx:list', () => listTransactions(userDataDir))
    ipcMain.handle('tx:rollback', (_e, id) => {
      const r = rollbackTransaction(userDataDir, id)
      opLog(r.ok ? 'info' : 'warn', 'tx', r.ok ? `트랜잭션 되돌리기 완료: ${id}` : `되돌리기 실패: ${r.error || ''}`)
      return r
    })

    // 검증 센터(§7.7) + Shadow 픽스처 수집(§19.2)
    ipcMain.handle('verify:all', () => {
      const settings = loadSettings(userDataDir)
      return verifyProject(project ? project.repoRoot : resolveRepoRoot(), {
        checkedOnlyExcuses: (settings.verify && settings.verify.checkedOnlyExcuses) || []
      })
    })
    ipcMain.handle('generate:scan-folder', (_e, dir) => {
      const scan = scanCaptureFolder(dir)
      return { ...scan, summary: summarizeScan(scan) }
    })
    ipcMain.handle('shadow:collect-fixtures', () => runShadowFixtures({
      callJev: args => jevService.judgeCandidate(args),
      persist: rec => appendShadowRecord(userDataDir, rec),
      onProgress: m => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('operation:progress', m)
        opLog('info', 'shadow', m.message)
      }
    }))
    ipcMain.handle('shadow:resolve', (_e, ruleId, adminDecision) => resolveAdminDecision(userDataDir, ruleId, adminDecision))

    // 확장 프로그램 수신 서버(§7.6 확장 연동) — 127.0.0.1 전용, 사용자용 앱 포트(57330~35)와 분리
    startReceiver(join(userDataDir, 'inbox'), {
      log: m => {
        opLog('info', 'inbox', m)
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('inbox:new', { at: Date.now() })
      }
    }).then(r => {
      receiver = r
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('inbox:new', { port: r.port })
    }).catch(e => opLog('warn', 'inbox', `수신 서버 시작 실패 — ${String(e.message || e)}`))
    ipcMain.handle('inbox:list', () => {
      const scan = scanCaptureFolder(join(userDataDir, 'inbox'))
      return {
        mallName: scan.mallName,
        captures: scan.captures.map(c => {
          let meta = null
          const metaPath = c.path.replace(/\.(mhtml?|mht|html?)$/i, '.meta.json')
          try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) } catch {}
          return { ...c, metaPath, meta: meta || null }
        }),
        answers: scan.answers
      }
    })
    ipcMain.handle('extension:install', async () => {
      const src = fs.existsSync(join(process.resourcesPath || '', 'extension-장바구니주문서저장'))
        ? join(process.resourcesPath, 'extension-장바구니주문서저장')
        : join(app.getAppPath(), 'extension-장바구니주문서저장')
      const dest = join(userDataDir, 'extension-장바구니주문서저장')
      fs.cpSync(src, dest, { recursive: true })
      await shell.openPath(dest)
      return {
        dest,
        port: receiver ? receiver.port : null,
        guide: 'Chrome 주소창에 chrome://extensions → 개발자 모드 ON → [압축해제된 확장 프로그램을 로드] → 방금 연 폴더 선택.\n사용: 쇼핑몰 장바구니/주문서 화면에서 확장 아이콘 클릭 → 상태 확인 → [전송].'
      }
    })

    // 엑셀 정답 만들기(구글 API) — Key는 safeStorage 저장, 추출·모델 목록·연결 확인
    const googleKeyOf = () => loadGoogleKey(userDataDir, { decryptFn: b => safeStorage.decryptString(b) }) || process.env.GOOGLE_API_KEY || null
    ipcMain.handle('google:set-key', (_e, plain) => storeGoogleKey(userDataDir, plain, { encryptFn: k => safeStorage.encryptString(k) }))
    ipcMain.handle('google:clear-key', () => clearGoogleKey(userDataDir))
    ipcMain.handle('google:has-key', () => {
      const stored = !!loadGoogleKey(userDataDir, { decryptFn: b => safeStorage.decryptString(b) })
      return { stored, env: !!process.env.GOOGLE_API_KEY, configured: stored || !!process.env.GOOGLE_API_KEY }
    })
    ipcMain.handle('google:test', async (_e, keyArg) => {
      const key = String(keyArg || '').trim() || googleKeyOf()
      return testGeminiConnection(key)
    })
    ipcMain.handle('google:list-models', async (_e, keyArg) => {
      const key = String(keyArg || '').trim() || googleKeyOf()
      return listGeminiModels(key)
    })
    ipcMain.handle('answer:extract', async (_e, { model, file, image }) => {
      const key = googleKeyOf()
      const captures = []
      const imgs = []
      if (file) captures.push({ label: String(file).split(/[\\/]/).pop(), html: sampleHtmlText(file).html })
      if (image) imgs.push({ mimeType: image.mimeType || 'image/png', data: image.data })
      const usedModel = model || DEFAULT_GEMINI_MODEL
      const result = await extractItemsWithGemini({ apiKey: key, model: usedModel, captures, images: imgs })
      const today = new Date().toISOString().slice(0, 10)
      const prev = loadSettings(userDataDir).googleUsage
      const count = prev && prev.date === today ? (Number(prev.count) || 0) + 1 : 1
      saveSettings(userDataDir, { googleUsage: { date: today, count } })
      return { ...result, usage: { date: today, count, rpd: lookupRpd(usedModel) } }
    })
    ipcMain.handle('answer:pick-file', async () => {
      const r = await dialog.showOpenDialog(mainWindow, {
        title: '캡처 HTML/MHTML 선택(여러 개 가능)',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: '캡처', extensions: ['html', 'htm', 'mhtml', 'mht'] }]
      })
      return r.canceled ? [] : r.filePaths
    })
    ipcMain.handle('answer:save', async (_e, { items }) => {
      const XLSX = (await import('xlsx')).default
      const r = await dialog.showSaveDialog(mainWindow, {
        title: '정답 Excel 저장',
        defaultPath: `정답_품목내역_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xls`,
        filters: [{ name: 'Excel 97-2003', extensions: ['xls'] }]
      })
      if (r.canceled || !r.filePath) return { ok: false, canceled: true }
      const aoa = [['품목명', '규격', '단위', '수량', '예상단가']]
      for (const it of items) aoa.push([it.name, it.spec || '', it.unit || '개', Number(it.qty) || 1, Number(it.unitPrice) || 0])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '품목내역')
      XLSX.writeFile(wb, r.filePath, { bookType: 'xls' })
      return { ok: true, path: r.filePath, count: items.length }
    })
    ipcMain.handle('rules:read-file', (_e, p) => fs.readFileSync(p, 'utf-8'))
    ipcMain.handle('versions:get', async () => {
      const repo = project ? project.repoRoot : resolveRepoRoot()
      const altRoot = join(app.getAppPath(), '..')
      const readManifestMulti = rel => {
        for (const root of [repo, altRoot]) {
          try {
            const src = fs.readFileSync(join(root, ...rel), 'utf-8').replace(/^\uFEFF/, '')
            return JSON.parse(src).version || null
          } catch {}
        }
        return null
      }
      const readStatusBarVersion = () => {
        const re = /const APP_VERSION\s*=\s*['"]([^'"]+)['"]/
        for (const root of [repo, altRoot]) {
          try {
            const m = re.exec(fs.readFileSync(join(root, 'app', 'src', 'main', 'index.js'), 'utf-8'))
            if (m) return m[1]
          } catch {}
        }
        return null
      }
      const dateOf = rel => gitFileLastDate(repo, rel)
      const [capDate, autoDate, cartOrderDate, rulesDate, userAppDate, adminPkgDate] = await Promise.all([
        dateOf('app/extension/manifest.json'),
        dateOf('app/extension-autoselect/manifest.json'),
        dateOf('admin-stand-alone/extension-장바구니주문서저장/manifest.json'),
        dateOf('rules.json'),
        dateOf('app/src/main/index.js'),
        dateOf('admin-stand-alone/package.json')
      ])
      const extensions = [
        { name: '품의캡처', owner: 'user', version: readManifestMulti(['app', 'extension', 'manifest.json']), updatedAt: capDate },
        { name: '품의 자동 선택', owner: 'user', version: readManifestMulti(['app', 'extension-autoselect', 'manifest.json']), updatedAt: autoDate },
        { name: '장바구니/주문서 저장', owner: 'admin', version: readManifestMulti(['admin-stand-alone', 'extension-장바구니주문서저장', 'manifest.json']), updatedAt: cartOrderDate }
      ]
      return {
        app: app.getVersion(),
        adminAppUpdatedAt: adminPkgDate,
        electron: process.versions.electron || '',
        chrome: process.versions.chrome || '',
        node: process.versions.node || '',
        rulesVersion: project ? (project.rulesJsonVersion || null) : null,
        rulesUpdatedAt: rulesDate,
        repoFound: !!project,
        repoRoot: repo,
        userApp: { version: readStatusBarVersion(), updatedAt: userAppDate },
        extensions
      }
    })
    ipcMain.handle('versions:remote', async () => {
      const repo = project ? project.repoRoot : resolveRepoRoot()
      const files = [
        'app/extension/manifest.json',
        'app/extension-autoselect/manifest.json',
        'admin-stand-alone/extension-장바구니주문서저장/manifest.json',
        'app/src/main/index.js',
        'admin-stand-alone/package.json',
        'rules.json'
      ]
      return gitRemoteVersions(repo, { files })
    })

    // 업데이트 자동 확인(작업 지시서 — 하루 1회 규칙/공지 변경 감지 → Gemini 요약 → 알림)
    const emailConfigOf = () => {
      const s = loadSettings(userDataDir)
      const cfg = (s.updateCheck && s.updateCheck.email) || {}
      const pass = loadEmailPassSafe()
      return cfg.host && cfg.user && pass
        ? { host: cfg.host, port: Number(cfg.port) || 465, user: cfg.user, pass, to: cfg.to || cfg.user }
        : null
    }
    const loadEmailPassSafe = () => {
      try { return loadEmailPass(userDataDir, { decryptFn: b => safeStorage.decryptString(b) }) } catch { return null }
    }
    const sendUpdateEmail = async (changedList, changedCount, isTest = false) => {
      const cfg = emailConfigOf()
      if (!cfg) return 'skipped-not-configured'
      const nodemailer = (await import('nodemailer')).default
      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: { user: cfg.user, pass: cfg.pass }
      })
      const body = isTest
        ? [
            '이것은 SMTP 설정 테스트 메일입니다.',
            '',
            '실제 알림 메일 형식:',
            '제목: [쇼핑몰 규칙 변경 알림] 오늘 변경된 쇼핑몰: N개',
            '본문: 점검 일시 · 변경 쇼핑몰 이름/링크 · Gemini 요약 · 영향 포인트'
          ].join('\n')
        : [
            `점검 일시: ${new Date().toLocaleString('ko-KR')}`,
            `오늘 변경된 쇼핑몰: ${changedCount}개`,
            '',
            ...changedList.map(c => [
              `■ ${c.name} — ${c.url}`,
              c.summary ? `${c.summary.summary || ''}${c.summary.impact ? '\n[영향] ' + c.summary.impact : ''}` : '(Gemini 요약 없음 — Key 미설정 또는 요약 실패)',
              ''
            ].join('\n'))
          ].join('\n')
      await transporter.sendMail({
        from: cfg.user,
        to: cfg.to,
        subject: isTest
          ? '[쇼핑몰 규칙 관리자] 테스트 메일 — SMTP 설정 정상'
          : `[쇼핑몰 규칙 변경 알림] 오늘 변경된 쇼핑몰: ${changedCount}개`,
        text: body
      })
      return 'sent'
    }
    const geminiSummarizeUpdate = async (shopName, diffText, matched) => {
      const key = googleKeyOf()
      if (!key) return null
      try {
        return await summarizeUpdate({ apiKey: key, model: DEFAULT_GEMINI_MODEL, shopName, diffText, matched })
      } catch {
        return null
      }
    }
    const runUpdateCheckNow = async () => {
      const r = await runFullCheck(userDataDir, {
        callGemini: geminiSummarizeUpdate,
        sendEmail: sendUpdateEmail,
        onProgress: m => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('operation:progress', m)
          opLog('info', 'update-check', m)
        }
      })
      opLog('info', 'update-check', `전체 점검 완료 — ${r.total}몰 중 변경 ${r.changedCount}건 · Gemini ${r.geminiCalls}회 · 이메일 ${r.email}`)
      if (r.changedCount > 0) {
        try {
          new Notification({
            title: `[쇼핑몰 규칙 변경 알림] 오늘 변경된 쇼핑몰: ${r.changedCount}개`,
            body: `${r.changedList.map(c => c.name).join(', ')} — 업데이트 확인 탭을 확인해 주세요.`
          }).show()
        } catch {}
      }
      return r
    }
    ipcMain.handle('update-check:get-status', () => {
      const state = loadUpdateState(userDataDir)
      const shops = ucListShops(userDataDir).map(s => {
        const rec = state.shops[s.id] || {}
        return {
          id: s.id, name: s.name, url: s.url,
          status: rec.status || null,
          lastCheckedAt: rec.lastCheckedAt || null,
          lastChangedAt: rec.lastChangedAt || null,
          lastSummary: rec.lastSummary || null,
          lastMatchedPatterns: rec.lastMatchedPatterns || [],
          lastError: rec.lastError || null
        }
      })
      return {
        shops,
        lastFullCheckAt: state.lastFullCheckAt,
        lastFullCheckDate: state.lastFullCheckDate,
        todayChanged: todayChangedCount(state),
        log: readUpdateLog(userDataDir, 10)
      }
    })
    ipcMain.handle('update-check:set-shops', (_e, shops) => ucSetShops(userDataDir, shops))
    ipcMain.handle('update-check:run-now', () => runUpdateCheckNow())
    ipcMain.handle('update-check:set-email-pass', (_e, plain) => storeEmailPass(userDataDir, String(plain || '').trim(), { encryptFn: p => safeStorage.encryptString(p) }))
    ipcMain.handle('update-check:test-email', async () => {
      if (!emailConfigOf()) return { ok: false, message: 'SMTP 설정이 없습니다 — 이메일 알림 섹션에서 먼저 저장하세요' }
      try {
        await sendUpdateEmail([{ name: '테스트', url: '(테스트 발송)', summary: { summary: 'SMTP 설정이 정상 동작합니다.' } }], 1, true)
        return { ok: true, to: emailConfigOf().to }
      } catch (e) {
        return { ok: false, message: String(e.message || e).slice(0, 200) }
      }
    })
    ipcMain.handle('update-check:test-notification', () => {
      try {
        new Notification({
          title: '[쇼핑몰 규칙 변경 알림] 오늘 변경된 쇼핑몰: 1개',
          body: '(테스트) 데스크톱 알림이 정상 표시됩니다 — 업데이트 확인 탭을 확인해 주세요.'
        }).show()
        return { ok: true }
      } catch (e) {
        return { ok: false, message: String(e.message || e) }
      }
    })
    ipcMain.handle('update-check:patterns:get', () => ({ patterns: ucListPatterns(userDataDir), categories: PATTERN_CATEGORIES }))
    ipcMain.handle('update-check:patterns:set', (_e, patterns) => ucSetPatterns(userDataDir, patterns))
    ipcMain.handle('update-check:patterns:reset', () => ucResetPatterns(userDataDir))
    // 스케줄 — 지정 시각 이후 오늘 미실행이면 실행(어제 미실행 보완 포함). 10분 간격 체크.
    const ucTick = async () => {
      try {
        const s = loadSettings(userDataDir)
        const cfg = s.updateCheck || {}
        if (cfg.enabled === false) return
        const hour = Number(cfg.hour ?? 3)
        const now = new Date()
        const st = loadUpdateState(userDataDir)
        if (now.getHours() >= hour && st.lastFullCheckDate !== now.toISOString().slice(0, 10)) {
          if (!ucListShops(userDataDir).length) return
          await runUpdateCheckNow()
        }
      } catch (e) {
        opLog('warn', 'update-check', '스케줄 점검 실패: ' + String(e.message || e))
      }
    }
    setInterval(ucTick, 10 * 60 * 1000)
    setTimeout(ucTick, 45 * 1000)

    // 샘플 추출 검증(§7.7) + Git 배포(§7.8) — push 실패는 파일 적용 실패가 아니다(§17.5)
    ipcMain.handle('verify:samples', (_e, dir) => verifySamples(project ? project.repoRoot : resolveRepoRoot(), dir, {
      onProgress: m => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('operation:progress', m) }
    }))
    ipcMain.handle('pick:dir', async () => {
      const r = await dialog.showOpenDialog(mainWindow, { title: '캡처 폴더 선택', properties: ['openDirectory'] })
      return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
    })
    const repoOf = () => (project ? project.repoRoot : resolveRepoRoot())
    ipcMain.handle('git:status', () => gitStatus(repoOf()))
    ipcMain.handle('git:diff', (_e, paths) => gitDiff(repoOf(), paths))
    ipcMain.handle('git:stage', async (_e, paths) => {
      const r = await gitStage(repoOf(), paths)
      opLog('info', 'git', `stage 완료 — ${r.staged.length}파일`)
      return r
    })
    ipcMain.handle('git:commit', async (_e, message) => {
      const r = await gitCommitFiles(repoOf(), message)
      opLog('info', 'git', `커밋 완료: ${r.hash}`)
      return r
    })
    ipcMain.handle('git:push', async (_e, opts) => {
      const r = await gitPush(repoOf(), opts)
      opLog(r.ok ? 'info' : 'warn', 'git', r.ok ? `push 완료 (${r.branch})` : `push 실패 — 로컬 커밋 보존: ${r.error || ''}`)
      return r
    })
    ipcMain.handle('git:ahead', () => gitAheadBehind(repoOf()))

    // 작업 로그(§7.9) — 레벨 필터·내보내기(민감정보 마스킹)
    ipcMain.handle('log:list', (_e, filter) => logStore.list(filter || {}))
    ipcMain.handle('log:counts', () => logStore.counts())
    ipcMain.handle('log:export', async (_e, level) => {
      const r = await dialog.showSaveDialog(mainWindow, {
        title: '작업 로그 내보내기',
        defaultPath: `rule-manager-logs-${Date.now()}.txt`
      })
      if (r.canceled || !r.filePath) return { ok: false, canceled: true }
      fs.writeFileSync(r.filePath, maskSecrets(logStore.exportText({ level })), 'utf-8')
      return { ok: true, path: r.filePath, lines: logStore.list({ level }).length }
    })

    createWindow()

    // 이메일·데스크톱 알림 테스트 모드 — 결과를 파일로 출력하고 종료한다
    if (process.env.TEMP_EMAIL_PASS) {
      let out = {}
      try {
        const r = storeEmailPass(userDataDir, process.env.TEMP_EMAIL_PASS, { encryptFn: p => safeStorage.encryptString(p) })
        const dec = loadEmailPass(userDataDir, { decryptFn: b => safeStorage.decryptString(b) })
        out = { ok: r.ok === true, message: r.message || '', sameProcessDecrypt: dec === process.env.TEMP_EMAIL_PASS }
      } catch (e) {
        out = { ok: false, message: String(e.message || e) }
      }
      fs.writeFileSync(join(app.getPath('temp'), 'rule-mgr-set-pass.json'), JSON.stringify(out, null, 1), 'utf-8')
      app.exit(0)
    }
    if (process.argv.includes('--test-email')) {
      const outPath = join(app.getPath('temp'), 'rule-mgr-test-email.json')
      let out = {}
      try {
        new Notification({
          title: '[쇼핑몰 규칙 변경 알림] 오늘 변경된 쇼핑몰: 1개',
          body: '(테스트) 데스크톱 알림이 정상 표시됩니다 — 업데이트 확인 탭을 확인해 주세요.'
        }).show()
        out.notification = 'shown'
        if (!emailConfigOf()) {
          out = { ok: false, message: 'SMTP 설정 없음' }
        } else {
          await sendUpdateEmail([{ name: '테스트 쇼핑몰', url: '(테스트 발송)', summary: { summary: 'SMTP 설정이 정상 동작합니다.' } }], 1, true)
          out = { ok: true, to: emailConfigOf().to }
        }
      } catch (e) {
        out = { ok: false, message: String(e.message || e).slice(0, 200) }
      }
      const dbg = loadSettings(userDataDir)
      out.debug = {
        userDataDir,
        hasUpdateCheck: !!dbg.updateCheck,
        hasEmail: !!(dbg.updateCheck && dbg.updateCheck.email),
        hasPass: !!dbg.emailPass
      }
      fs.writeFileSync(outPath, JSON.stringify(out, null, 1), 'utf-8')
      opLog(out.ok ? 'info' : 'warn', 'update-check', `테스트 이메일: ${JSON.stringify(out)}`)
      app.exit(0)
    }

    // 스모크 모드: 브리지 감지 결과를 파일로 출력하고 종료한다(자동 검증용 — Windows에서
    // GUI 프로세스의 stdout은 콘솔에 붙지 않는다). 실패해도 반드시 결과 파일을 남긴다.
    if (process.argv.includes('--smoke')) {
      const outArg = process.argv.find(a => a.startsWith('--smoke-out='))
      const outPath = outArg ? outArg.split('=')[1] : join(app.getPath('temp'), 'rule-manager-smoke.json')
      let result
      try {
        const status = await detectBridge()
        result = {
          detected: status.detected,
          version: status.version,
          codingPlanAuth: status.codingPlanAuth,
          codingPlanModels: status.codingPlanModels.map(m => m.id),
          totalModels: status.models.length,
          modelError: status.modelError
        }
      } catch (e) {
        result = { detected: false, smokeError: String(e.message || e) }
      }
      fs.writeFileSync(outPath, JSON.stringify(result, null, 1))
      app.exit(0)
    }

    // E2E 모드(§23.4 축소판) — 프로젝트·매핑·설정·생성 파이프라인을 실제 창으로 검증하고
    // JSON 결과를 --e2e-out= 파일로 남긴다.
    if (process.argv.includes('--e2e')) {
      const outArg = process.argv.find(a => a.startsWith('--e2e-out='))
      const outPath = outArg ? outArg.split('=')[1] : join(app.getPath('temp'), 'rule-manager-e2e.json')
      try {
        await runE2E(outPath, userDataDir)
      } catch (e) {
        try { fs.writeFileSync(outPath, JSON.stringify({ fatal: 'runE2E 예외: ' + String(e && e.stack || e) }, null, 1)) } catch {}
        app.exit(1)
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (receiver) stopReceiver(receiver.server)
  app.quit()
})

/* ---- E2E (ADMIN_SATAD_ALONE.MD §23.4) ---- */

const FIXTURE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>관리자E2E 몰</title></head>
<body><ul class="goods">
<li class="item"><div class="nm"><span class="t">테스트상품A</span></div><input class="cnt" value="2"><span class="pr">5,000원</span><input type="checkbox" class="ck"></li>
<li class="item"><div class="nm"><span class="t">테스트상품B</span></div><input class="cnt" value="1"><span class="pr">3,000원</span><input type="checkbox" class="ck"></li>
</ul></body></html>`

function mockAiFor(req) {
  return async ({ kind }) => {
    const ctx = req.contexts.find(c => c.kind === kind) || req.contexts[0]
    return JSON.stringify({
      id: ctx.ruleId,
      name: kind === 'cart' ? `${req.mallName} 장바구니` : req.mallName,
      match: ['e2e-mall.test'],
      rowSelector: 'li.item',
      priceIs: 'unit',
      fields: {
        name: { sel: '.t' },
        qty: { sel: '.cnt', attr: 'value', regex: '(\\d+)' },
        price: { sel: '.pr', regex: '([\\d,]+)원' }
      },
      shipping: { mode: 'none' }
    })
  }
}

function mockJev() {
  return {
    answers: {
      selector_stable: { probability: 0.92 },
      name_quality: { score: 4, confidence: 0.9 },
      failure_cause: { value: 'no_semantic_problem', confidence: 0.9 },
      deployment_ready: { value: 'approve', confidence: 0.88 }
    }
  }
}

async function runE2E(outPath, userDataDir) {
  const result = { ok: false, rendererErrors: [], breadcrumbs: [] }
  const win = createWindow({ show: false })
  const mark = name => {
    result.breadcrumbs.push(name)
    try { fs.writeFileSync(outPath, JSON.stringify(result, null, 1), 'utf-8') } catch {}
  }
  try {
    mark('start')
    await new Promise(res => {
      if (!win.webContents.isLoading()) return res()
      win.webContents.once('did-finish-load', res)
    })
    mark('loaded')
    // React 마운트 완료 대기 — did-finish-load는 HTML 로드만 의미하고 React 렌더는 별도 시점
    await waitFor(() => win.webContents.executeJavaScript('!!(document.getElementById("root") && document.getElementById("root").childElementCount > 0)'), 15000)
    await win.webContents.executeJavaScript(`window.__errs = [];
      window.addEventListener('error', e => window.__errs.push('pageerror: ' + (e.message || e)));
      window.addEventListener('unhandledrejection', e => window.__errs.push('unhandled: ' + String(e.reason && e.reason.message || e.reason)));`)
    mark('loaded')
    result.probe1 = await win.webContents.executeJavaScript(
      'window.__mgr ? JSON.stringify({ listeners: window.__mgr.state().listeners, emitCount: window.__mgr.state().emitCount }) : "no __mgr"'
    )
    // 1) 프로젝트 탐지·규칙 목록·bundle 버전(§8·§23.4)
    result.projectCheck = !!(await win.webContents.executeJavaScript('window.ruleMgr.projectDetect()'))
    if (result.projectCheck) {
      result.ruleCount = (await win.webContents.executeJavaScript('window.ruleMgr.rulesList()')).length
      result.bundleVersion = await win.webContents.executeJavaScript(
        'window.ruleMgr.projectDetect().then(p => p.rulesJsonVersion)'
      )
    }

    mark('project')
    // 2) 설정 + safeStorage Key 왕복(JEV.MD §2.3)
    result.settingsCheck = !!(await win.webContents.executeJavaScript(
      'window.ruleMgr.settings.set({ generation: { model: "e2e" } }).then(s => s.generation.model === "e2e")'
    ))
    const enc = safeStorage.isEncryptionAvailable()
    result.safeStorageAvailable = enc
    if (enc) {
      result.safeStorageRoundtrip = !!(await win.webContents.executeJavaScript(
        'window.ruleMgr.settings.setJevKey("e2e-secret-key-123").then(r => r.ok).then(() => window.ruleMgr.settings.hasJevKey())'
      ).then(r => r.stored))
      await win.webContents.executeJavaScript('window.ruleMgr.settings.clearJevKey()')
    }

    mark('settings')
    // 3) Jev 상태·Shadow 통계(§19)
    result.jevCheck = !!(await win.webContents.executeJavaScript(
      'window.ruleMgr.jev.getStatus().then(s => typeof s.configured === "boolean" && s.stats && s.autoApprove && s.autoApprove.allowed === false)'
    ))

    mark('jev')
    // 4) 클릭 매핑(§12) — 픽스처 파일 → 프로토콜 서빙 → 피커 클릭 → 규칙 조립
    const tmpHtml = join(app.getPath('temp'), `rule-mgr-e2e-${Date.now()}.html`)
    fs.writeFileSync(tmpHtml, FIXTURE_HTML)
    const opened = await win.webContents.executeJavaScript(`window.ruleMgr.mapping.openPath(${JSON.stringify(tmpHtml)})`)
    result.mappingCheck = { opened: !!opened }
    if (opened) {
      const served = await net.fetch(`admin-sample://${opened.token}/?picker=1`).then(r => r.text()).catch(() => '')
      const scriptTags = (served.match(/<script/gi) || []).length
      result.mappingCheck.pickerServed = served.includes('picker-select') && scriptTags === 1
      result.mappingCheck.scriptsStripped = !/<script[^>]+src=/.test(served) && served.includes('Content-Security-Policy')
      result.mappingCheck.subscriptionReady = await waitFor(() => win.webContents.executeJavaScript('window.__mappingSubscriptionReady === true'), 10000)
      await win.webContents.executeJavaScript('window.__mgr && window.__mgr.startMapping(' + JSON.stringify(opened.token) + ', { isCart: true })')
      result.mappingCheck.iframeFound = await waitFor(() => win.webContents.executeJavaScript(`[...document.querySelectorAll("iframe")].some(f => f.isConnected && f.src.includes(${JSON.stringify(opened.token)}))`), 10000)
      result.mappingCheck.pickerReady = await waitFor(() => win.webContents.executeJavaScript('!!(window.__mgr && window.__mgr.state().pickerReady)'), 10000)
      result.mappingCheck.domDump = await win.webContents.executeJavaScript(
        'JSON.stringify({ iframes: [...document.querySelectorAll("iframe")].map(f => ({ src: f.src.slice(0, 60), rect: f.getBoundingClientRect().toJSON() })), mgr: window.__mgr ? window.__mgr.state() : null, hasMgr: !!window.__mgr })'
      )
      // 프레임 트리 진단 — webContents 프레임 구조 확인
      const dumpFrames = (frame, depth) => {
        const out = []
        const walk = (f, d) => {
          out.push('  '.repeat(d) + (f.url || 'about:blank').slice(0, 80))
          for (const cf of f.frames) walk(cf, d + 1)
        }
        walk(frame, 0)
        return out
      }
      result.frameTree = dumpFrames(win.webContents.mainFrame)
      const setMode = async m => {
        await win.webContents.executeJavaScript(`window.__mgr && window.__mgr.setMode(${JSON.stringify(m)})`)
        await waitMs(120)
      }
      await clickInSampleFrame(win, opened.token, 'li.item')
      await waitMs(150)
      await setMode('name')
      await clickInSampleFrame(win, opened.token, '.t')
      await waitMs(150)
      await setMode('price')
      await clickInSampleFrame(win, opened.token, '.pr')
      await waitMs(150)
      await setMode('checked')
      await clickInSampleFrame(win, opened.token, '.ck')
      await waitMs(150)
      const st = await win.webContents.executeJavaScript('window.__mgr && window.__mgr.state()')
      result.mappingCheck.rowClick = !!(st && st.picks && st.picks.row)
      result.mappingCheck.nameClick = !!(st && st.picks && st.picks.name)
      result.mappingCheck.checkedClick = !!(st && st.picks && st.picks.checkedOnly)
      result.mappingCheck.picksKeys = st && st.picks ? Object.keys(st.picks) : []
      const assembled = await win.webContents.executeJavaScript(
        `window.__mgr.assemble({ baseId: "e2emall", name: "E2E몰", match: "e2e-mall.test", isCart: true })`
      )
      result.mappingCheck.assembleError = assembled && assembled.error
      result.mappingCheck.assemble = !!(assembled && assembled.rule && assembled.rule.checkedOnly && assembled.rule.rowSelector)
      const preview = await win.webContents.executeJavaScript(
        `window.__mgr.preview(${JSON.stringify(assembled.rule)})`
      )
      result.mappingCheck.previewCount = preview && preview.count
    }

    mark('mapping')
    // 5) 생성 파이프라인(§7.6 ↔ §14) — mock AI·Jev로 승인까지 + 임시 저장소 적용
    //    폴더 불러오기와 동일한 다중 샘플·캡처별 정답 payload를 사용한다
    const tmpHtml2 = join(app.getPath('temp'), `rule-mgr-e2e-free-${Date.now()}.html`)
    fs.writeFileSync(tmpHtml2, FIXTURE_HTML)
    const tmpRepo = join(app.getPath('temp'), `rule-mgr-repo-${Date.now()}`)
    const XLSX = (await import('xlsx')).default
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['품목명', '수량', '단가'],
      ['테스트상품A', 2, 5000],
      ['테스트상품B', 1, 3000]
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const tmpXls = join(app.getPath('temp'), `rule-mgr-e2e-answer-${Date.now()}.xlsx`)
    XLSX.writeFile(wb, tmpXls)
    const tmpXlsFree = join(app.getPath('temp'), `rule-mgr-e2e-answer-free-${Date.now()}.xlsx`)
    XLSX.writeFile(wb, tmpXlsFree)
    const gen = await win.webContents.executeJavaScript(`window.ruleMgr.generate.start({
      mallName: "E2E몰", baseId: "e2emall", kinds: ["order"],
      samplesByKind: { order: [
        { path: ${JSON.stringify(tmpHtml)}, answerPath: ${JSON.stringify(tmpXls)}, tag: "paid" },
        { path: ${JSON.stringify(tmpHtml2)}, answerPath: ${JSON.stringify(tmpXlsFree)}, tag: "free" }
      ] },
      answerExcel: ${JSON.stringify(tmpXls)}, answerBasis: "order",
      mockAi: true, mockJev: true
    })`)
    result.generationCheck = {
      status: gen && gen.results && gen.results[0] && gen.results[0].status,
      decision: gen && gen.results && gen.results[0] && gen.results[0].decision
    }
    if (gen && gen.results && gen.results[0] && gen.results[0].rule) {
      result.generationCheck.perSampleCount = gen.results[0].deterministic &&
        gen.results[0].deterministic.perSample && gen.results[0].deterministic.perSample.length
      // Shadow 실사용 수집(§19) — 판정이 자동 기록되고 관리자 승인으로 확정된다.
      // jev stats는 e2e 태그 레코드를 제외하므로 raw 레코드를 직접 검증한다.
      const sr = await win.webContents.executeJavaScript(
        'window.ruleMgr.shadowResolve("e2emall", "approve")'
      )
      const rawShadow = readShadowRecords(userDataDir)
      result.shadowResolveCheck = !!(sr && sr.updated >= 1
        && rawShadow.some(r => r.ruleId === 'e2emall' && r.adminDecision === 'approve'))
      result.shadowResolveDetail = { updated: sr && sr.updated, resolveError: sr && sr.error, rawCount: rawShadow.length }
      const applied = await win.webContents.executeJavaScript(
        `window.ruleMgr.generate.apply(${JSON.stringify(tmpRepo)}, ${JSON.stringify(gen)}, { apply: true, rebuildBundle: false })`
      )
      result.generationCheck.applied = applied.applied.length === 1
        && fs.existsSync(join(applied.applied[0].files[0]))
      // 트랜잭션(§13.2) — 적용 이력이 남고 되돌리면 신규 파일이 제거된다
      const txList = listTransactions(userDataDir)
      const mine = txList.find(t => t.status === 'applied' && t.changes.some(c => c.includes('e2emall')))
      result.transactionCheck = { listed: txList.length > 0, foundApplied: !!mine }
      if (mine) {
        const rb = rollbackTransaction(userDataDir, mine.id)
        result.transactionCheck.rolledBack = rb.ok === true
        result.transactionCheck.filesGone = !fs.existsSync(join(tmpRepo, 'app', 'src', 'main', 'lib', 'rules', 'e2emall.json'))
      }
      // 삭제 트랜잭션(§16) — 저장→삭제로 파일 제거와 이력 적재를 확인한다
      await win.webContents.executeJavaScript(`window.ruleMgr.rulesSave(${JSON.stringify(tmpRepo)}, ${JSON.stringify({ id: 'delcheck', name: 'delcheck', match: ['x.com'], rowSelector: 'div', fields: { name: { sel: '.n' }, price: { sel: '.p' } } })})`)
      const delRes = await win.webContents.executeJavaScript(`window.ruleMgr.rulesDelete("delcheck", ${JSON.stringify(tmpRepo)})`)
      result.deleteCheck = {
        deleted: !fs.existsSync(join(tmpRepo, 'app', 'src', 'main', 'lib', 'rules', 'delcheck.json')),
        status: delRes && delRes.status
      }

      // 검증 센터(§7.7) — 실제 저장소에서 ERROR 0·PASS 존재
      result.verificationCheck = !!(await win.webContents.executeJavaScript(
        'window.ruleMgr.verifyAll().then(r => r.summary && r.summary.ok && r.summary.PASS > 0)'
      ))

      // i버전 탭(§versions) — 품의캡처·사용자 앱 하단 버전 실측
      const vres = await win.webContents.executeJavaScript('window.ruleMgr.versions()')
      result.versionsCheck = !!vres.userApp.version && vres.extensions.some(x => x.name === '품의캡처' && x.version)
      result.versionsDetail = {
        userApp: vres.userApp.version,
        ext: vres.extensions.map(x => `${x.name}:${x.version}`),
        repoRoot: vres.repoRoot
      }

      // 업데이트 자동 확인(작업 지시서) — 로컬 페이지 첫점검(baseline) → 내용 변경 → 감지+diff 파이프라인
      let ucTestPage = '<html><body><h1>E2E몰 배송비 정책 안내</h1><p>기본배송비 2,500원. 5만원 이상 무료배송.</p></body></html>'
      const ucServer = createServer((req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(ucTestPage)
      })
      await new Promise(res => ucServer.listen(0, '127.0.0.1', res))
      try {
        const ucPort = ucServer.address().port
        await win.webContents.executeJavaScript(`window.ruleMgr.updateCheck.setShops([{ id: 'e2e-uc', name: 'E2E점검몰', url: 'http://127.0.0.1:${ucPort}/rules' }])`)
        const ucRun1 = await win.webContents.executeJavaScript('window.ruleMgr.updateCheck.runNow()')
        ucTestPage = ucTestPage.replace('기본배송비 2,500원', '기본배송비 3,000원 (2026-10-05 적용)')
        const ucRun2 = await win.webContents.executeJavaScript('window.ruleMgr.updateCheck.runNow()')
        const ucStatus = await win.webContents.executeJavaScript('window.ruleMgr.updateCheck.getStatus()')
        const ucMatched = (ucRun2.changedList || [])[0] && (ucRun2.changedList[0].matched || []).some(m => m.cat === 'policy')
        result.updateCheckCheck = !!(ucRun1.changedCount === 0 && ucRun1.geminiCalls === 0
          && ucRun2.changedCount === 1 && ucMatched && ucRun2.email === 'skipped-not-configured'
          && ucStatus.todayChanged >= 1)
        result.updateCheckDetail = {
          run1Changed: ucRun1.changedCount, run2Changed: ucRun2.changedCount,
          matched: (ucRun2.changedList || [])[0] ? (ucRun2.changedList[0].matched || []).map(m => `${m.p}(${m.cat})`) : [],
          gemini: ucRun2.geminiCalls, email: ucRun2.email, todayChanged: ucStatus.todayChanged
        }
      } finally {
        ucServer.close()
      }

      // Shadow 픽스처(§19.2) — Key 없으면 전 케이스가 오류로 집계되는 우아한 처리 확인.
      // Key가 있으면 실제 API 72회 호출이 되므로 E2E에서는 생략한다.
      if (jevService.isConfigured()) {
        result.shadowFixtureCheck = 'skipped-key-present'
      } else {
        result.shadowFixtureCheck = !!(await win.webContents.executeJavaScript(
          'window.ruleMgr.shadowCollectFixtures().then(r => r.total === 72 && r.recorded === 0 && r.errors === 72)'
        ))
      }

      mark('generate')
    mark('git')
    // Git 읽기 전용(§7.8) — 변경 없음(변이 작업은 E2E에서 수행하지 않는다)
      result.gitCheck = !!(await win.webContents.executeJavaScript(
        'window.ruleMgr.git.status().then(s => window.ruleMgr.git.ahead().then(ab => typeof s.branch === "string" && Array.isArray(s.files) && typeof ab.ahead === "number"))'
      ))

      // 샘플 추출 검증(§7.7) — 저장소의 Check/ 캡처 폴더가 있으면 실제로 돌려본다
      const checkDir = join(resolveRepoRoot(), 'Check')
      if (fs.existsSync(checkDir)) {
        mark('sampleverify-start')
        const sv = verifySamples(resolveRepoRoot(), checkDir)
        mark('sampleverify-end')
        result.sampleVerifyCheck = sv.scanned > 0 && Array.isArray(sv.results) && sv.results.every(x => x.verdict)
        result.sampleVerifySummary = sv.summary
      } else {
        result.sampleVerifyCheck = 'skipped-no-check-dir'
      }

      // 작업 로그(§7.9) — 생성 과정 로그가 버퍼에 쌓이고 필터·카운트가 동작한다
      result.logCheck = !!(await win.webContents.executeJavaScript(
        'window.ruleMgr.log.list({}).then(l => l.length > 0 && l.some(x => x.step === "generate")).then(() => window.ruleMgr.log.counts()).then(c => typeof c.error === "number")'
      ))
    }
    // 입력 검증 차단(§7.6 — 샘플 없으면 실행 차단)
    result.generationInputGate = await win.webContents.executeJavaScript(
      'window.ruleMgr.generate.start({ mallName: "x", kinds: ["order"], samplesByKind: {}, answerExcel: null }).then(() => false).catch(e => String(e.message).includes("샘플"))'
    )

    result.rendererErrors = (resultRendererErrors || []).concat(result.rendererErrors || [])
    result.ok = result.projectCheck && result.settingsCheck
      && (!enc || result.safeStorageRoundtrip) && result.jevCheck
      && result.mappingCheck.opened && result.mappingCheck.subscriptionReady
      && result.mappingCheck.iframeFound && result.mappingCheck.pickerServed
      && result.mappingCheck.rowClick && result.mappingCheck.nameClick
      && result.mappingCheck.checkedClick && result.mappingCheck.assemble
      && result.generationCheck.status === 'approved'
      && result.generationCheck.perSampleCount === 2
      && result.shadowResolveCheck
      && result.generationCheck.applied && result.generationInputGate
      && result.transactionCheck && result.transactionCheck.listed
      && result.transactionCheck.foundApplied && result.transactionCheck.rolledBack
      && result.transactionCheck.filesGone
      && result.deleteCheck && result.deleteCheck.deleted && result.deleteCheck.status === 'applied'
      && result.verificationCheck && result.shadowFixtureCheck
      && result.versionsCheck && result.updateCheckCheck
      && result.gitCheck && result.sampleVerifyCheck && result.logCheck
  } catch (e) {
    result.fatal = String(e && e.message || e)
  }
  fs.writeFileSync(outPath, JSON.stringify(result, null, 1), 'utf-8')
  app.exit(result.ok ? 0 : 1)
}

function findFrame(frame, token) {
  if (String(frame.url || '').includes(`admin-sample://${token}`)) return frame
  for (const f of frame.frames || []) {
    const hit = findFrame(f, token)
    if (hit) return hit
  }
  return null
}

async function clickInSampleFrame(win, token, selector) {
  // iframe 마운트·로드·피커 준비에 시간이 걸릴 수 있어 재시도한다(E2E 안정화)
  const deadline = Date.now() + 15000
  let lastError = null
  while (Date.now() < deadline) {
    const frame = findFrame(win.webContents.mainFrame, token)
    if (frame) {
      const rectOk = await win.webContents.executeJavaScript(`(() => {
        const f = [...document.querySelectorAll('iframe')].find(f => f.src.includes(${JSON.stringify(token)}))
        if (!f || !f.isConnected) return false
        const r = f.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })()`).catch(() => false)
      if (rectOk) {
        try {
          const ok = await frame.executeJavaScript(`(() => {
            const el = document.querySelector(${JSON.stringify(selector)})
            if (!el) return false
            el.scrollIntoView()
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
            return true
          })()`)
          if (ok) return true
        } catch (e) {
          lastError = e
        }
      }
    }
    await waitMs(300)
  }
  throw new Error(`클릭 실패(${selector}): ${lastError ? lastError.message : '프레임 없음'}`)
}

function waitMs(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function waitFor(fn, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await fn()) return true
    await waitMs(200)
  }
  return false
}
