/*
 * 쇼핑몰 규칙 관리자 — 단독 실행형(ADMIN_SATAD_ALONE.MD)
 * 사용자용 앱과 이름·userData·단일 인스턴스 잠금·수신 포트를 공유하지 않는다(§4.2).
 */
import { app, BrowserWindow, ipcMain, dialog, protocol, net, safeStorage } from 'electron'
import { join } from 'node:path'
import fs from 'node:fs'
import { detectBridge } from './services/zai-tool-bridge.js'
import { JevJudgeService } from './services/jev-judge-service.js'
import { detectProjectRoot, projectInfo } from './services/project-service.js'
import { rulesList, saveRule, deleteRuleTx, deleteRulePreview, registerBuiltinRules, rebuildRulesJson, resolveRepoRoot, gitCommit, listTransactions, rollbackTransaction } from './services/rules-service.js'
import { appendShadowRecord, readShadowRecords } from './services/shadow-store.js'
import {
  loadSettings, saveSettings, storeTypesafeKey, loadTypesafeKey, clearTypesafeKey,
  shadowStats, autoApproveAllowed
} from './services/settings-service.js'
import {
  openMappingSample, closeSample, serveSampleRequest,
  assembleMappingRule, previewMappingExtraction, isSampleFile
} from './services/mapping-service.js'
import { verifyProject } from './services/verification-service.js'
import { runShadowFixtures } from './services/shadow-fixtures.js'
import {
  prepareGenerationRequest, runGeneration, applyGenerationResult
} from './services/generation-service.js'

const jevService = new JevJudgeService({
  keyProvider: () => loadTypesafeKey(app.getPath('userData'), { decryptFn: b => safeStorage.decryptString(b) })
    || process.env.TYPESAFE_API_KEY || ''
})

app.setName('쇼핑몰 규칙 관리자')
// admin-sample:// — 메모리의 샘플 문서만 서빙하는 안전 뷰어 프로토콜(§12.2)
protocol.registerSchemesAsPrivileged([
  { scheme: 'admin-sample', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

let mainWindow = null

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
  mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  return mainWindow
}

const gotLock = app.requestSingleInstanceLock('shopping-mall-rule-manager')
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
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

    // 프로젝트 탐지·규칙 목록(§8) — §8.1 1순위인 --project CLI 인자를 최우선으로 한다
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
      return project
    }
    ipcMain.handle('project:detect', (_e, startDir) => setProject(detectProjectRoot(startDir || cliProject || join(app.getAppPath(), '..'))))
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
      return deleteRuleTx(userDataDir, repoRoot || (project ? project.repoRoot : resolveRepoRoot()), id, { bump: false })
    })
    ipcMain.handle('rules:builtin', () => registerBuiltinRules())
    ipcMain.handle('rules:rebuild-json', (_e, bump) => rebuildRulesJson(resolveRepoRoot(), { bump: !!bump }))
    ipcMain.handle('git:commit', (_e, { repoRoot, files, message, push }) => gitCommit(repoRoot, files, message, { push, log: m => console.log('[git]', m) }))

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
      const req = prepareGenerationRequest(payload)
      return { contexts: req.contexts.map(c => ({ kind: c.kind, ruleId: c.ruleId, samples: c.samples.length, expectedItems: c.expected ? c.expected.items.length : null })) }
    })
    ipcMain.handle('generate:start', async (_e, payload) => {
      const req = prepareGenerationRequest(payload)
      return runGeneration(req, {
        model: payload.model || '',
        maxRepair: payload.maxRepair != null ? payload.maxRepair : 3,
        repoRoot: project ? project.repoRoot : resolveRepoRoot(),
        callAi: payload.mockAi ? mockAiFor(req) : undefined,
        callJev: payload.mockJev ? mockJev : undefined,
        onProgress: m => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('operation:progress', m) }
      })
    })
    ipcMain.handle('generate:apply', (_e, { repoRoot, generation, options }) => applyGenerationResult(repoRoot, generation, { ...(options || {}), userDataDir }))

    // 트랜잭션 이력·복원(§13.2·§29.3)
    ipcMain.handle('tx:list', () => listTransactions(userDataDir))
    ipcMain.handle('tx:rollback', (_e, id) => rollbackTransaction(userDataDir, id))

    // 검증 센터(§7.7) + Shadow 픽스처 수집(§19.2)
    ipcMain.handle('verify:all', () => {
      const settings = loadSettings(userDataDir)
      return verifyProject(project ? project.repoRoot : resolveRepoRoot(), {
        checkedOnlyExcuses: (settings.verify && settings.verify.checkedOnlyExcuses) || []
      })
    })
    ipcMain.handle('shadow:collect-fixtures', () => runShadowFixtures({
      callJev: args => jevService.judgeCandidate(args),
      persist: rec => appendShadowRecord(userDataDir, rec),
      onProgress: m => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('operation:progress', m) }
    }))

    createWindow()

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
      await runE2E(outPath, userDataDir)
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
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
  const result = { ok: false, rendererErrors: [] }
  const win = createWindow({ show: false })
  try {
    await new Promise(res => win.webContents.once('did-finish-load', res))
    win.webContents.on('console-message', (_e, _lv, msg, line, sourceId) => {
      if (/error/i.test(String(msg))) result.rendererErrors.push(`${String(msg).slice(0, 200)} @ ${String(sourceId || '').split(/[\\/]/).pop()}:${line}`)
    })

    // 1) 프로젝트 탐지·규칙 목록·bundle 버전(§8·§23.4)
    result.projectCheck = !!(await win.webContents.executeJavaScript('window.ruleMgr.projectDetect()'))
    if (result.projectCheck) {
      result.ruleCount = (await win.webContents.executeJavaScript('window.ruleMgr.rulesList()')).length
      result.bundleVersion = await win.webContents.executeJavaScript(
        'window.ruleMgr.projectDetect().then(p => p.rulesJsonVersion)'
      )
    }

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

    // 3) Jev 상태·Shadow 통계(§19)
    result.jevCheck = !!(await win.webContents.executeJavaScript(
      'window.ruleMgr.jev.getStatus().then(s => typeof s.configured === "boolean" && s.stats && s.autoApprove && s.autoApprove.allowed === false)'
    ))

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
      await win.webContents.executeJavaScript('window.__mgr && window.__mgr.startMapping(' + JSON.stringify(opened.token) + ', { isCart: true })')
      await waitFor(() => win.webContents.executeJavaScript('!!(window.__mgr && window.__mgr.state().pickerReady)'), 10000)
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

    // 5) 생성 파이프라인(§7.6 ↔ §14) — mock AI·Jev로 승인까지 + 임시 저장소 적용
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
    const gen = await win.webContents.executeJavaScript(`window.ruleMgr.generate.start({
      mallName: "E2E몰", baseId: "e2emall", kinds: ["order"],
      samplesByKind: { order: [${JSON.stringify(tmpHtml)}] },
      answerExcel: ${JSON.stringify(tmpXls)}, answerBasis: "order",
      mockAi: true, mockJev: true
    })`)
    result.generationCheck = {
      status: gen && gen.results && gen.results[0] && gen.results[0].status,
      decision: gen && gen.results && gen.results[0] && gen.results[0].decision
    }
    if (gen && gen.results && gen.results[0] && gen.results[0].rule) {
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

      // Shadow 픽스처(§19.2) — Key 없으면 전 케이스가 오류로 집계되는 우아한 처리 확인.
      // Key가 있으면 실제 API 72회 호출이 되므로 E2E에서는 생략한다.
      if (jevService.isConfigured()) {
        result.shadowFixtureCheck = 'skipped-key-present'
      } else {
        result.shadowFixtureCheck = !!(await win.webContents.executeJavaScript(
          'window.ruleMgr.shadowCollectFixtures().then(r => r.total === 72 && r.recorded === 0 && r.errors === 72)'
        ))
      }
    }
    // 입력 검증 차단(§7.6 — 샘플 없으면 실행 차단)
    result.generationInputGate = await win.webContents.executeJavaScript(
      'window.ruleMgr.generate.start({ mallName: "x", kinds: ["order"], samplesByKind: {}, answerExcel: null }).then(() => false).catch(e => String(e.message).includes("샘플"))'
    )

    result.ok = result.projectCheck && result.settingsCheck
      && (!enc || result.safeStorageRoundtrip) && result.jevCheck
      && result.mappingCheck.opened && result.mappingCheck.pickerServed
      && result.mappingCheck.rowClick && result.mappingCheck.nameClick
      && result.mappingCheck.checkedClick && result.mappingCheck.assemble
      && result.generationCheck.status === 'approved'
      && result.generationCheck.applied && result.generationInputGate
      && result.transactionCheck && result.transactionCheck.listed
      && result.transactionCheck.foundApplied && result.transactionCheck.rolledBack
      && result.transactionCheck.filesGone
      && result.deleteCheck && result.deleteCheck.deleted && result.deleteCheck.status === 'applied'
      && result.verificationCheck && result.shadowFixtureCheck
  } catch (e) {
    result.fatal = String(e && e.message || e)
  }
  fs.writeFileSync(outPath, JSON.stringify(result, null, 1), 'utf-8')
  app.exit(result.ok ? 0 : 1)
}

async function clickInSampleFrame(win, token, selector) {
  const findFrame = (frame) => {
    if (String(frame.url || '').includes(`admin-sample://${token}`)) return frame
    for (const f of frame.frames || []) {
      const hit = findFrame(f)
      if (hit) return hit
    }
    return null
  }
  const frame = findFrame(win.webContents.mainFrame)
  if (!frame) throw new Error('샘플 iframe을 찾지 못했습니다')
  await frame.executeJavaScript(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return false
    el.scrollIntoView()
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return true
  })()`)
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
