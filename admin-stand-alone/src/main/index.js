/*
 * 쇼핑몰 규칙 관리자 — 단독 실행형(ADMIN_SATAD_ALONE.MD)
 * 사용자용 앱과 이름·userData·단일 인스턴스 잠금·수신 포트를 공유하지 않는다(§4.2).
 */
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'node:path'
import fs from 'node:fs'
import { detectBridge } from './services/zai-tool-bridge.js'
import { JevJudgeService } from './services/jev-judge-service.js'
import { detectProjectRoot, projectInfo } from './services/project-service.js'
import { rulesList, saveRule, deleteRule, registerBuiltinRules, rebuildRulesJson, resolveRepoRoot, gitCommit } from './services/rules-service.js'
import { appendShadowRecord, readShadowRecords } from './services/shadow-store.js'

const jevService = new JevJudgeService()

app.setName('쇼핑몰 규칙 관리자')

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    title: '쇼핑몰 규칙 관리자',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
    ipcMain.handle('zai-bridge-status', () => detectBridge())
    // Jev — renderer는 TypeSafe API를 직접 호출하지 않고 main 서비스만 경유한다(JEV.MD §21)
    ipcMain.handle('jev:get-status', () => ({ configured: jevService.isConfigured(), shadowMode: true, endpoint: 'typesafe' }))
    ipcMain.handle('jev:test-connection', () => jevService.testConnection())
    // Shadow Mode — 판정을 기록만 하고 배포를 차단·승인하지 않는다(§19)
    ipcMain.handle('jev:judge-candidate', (_e, request) => {
      return jevService.judgeCandidate(request).then(jev => {
        appendShadowRecord(app.getPath('userData'), {
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
    ipcMain.handle('jev:get-shadow-results', () => readShadowRecords(app.getPath('userData')))
    // 프로젝트 탐지·규칙 목록(§8) — 기본은 관리자 앱 위치 기준 상위 저장소, 수동 선택도 허용
    let project = null
    ipcMain.handle('project:detect', (_e, startDir) => {
      const root = detectProjectRoot(startDir || path.resolve(app.getAppPath(), '..'))
      project = root ? projectInfo(root) : null
      return project
    })
    ipcMain.handle('project:choose', async () => {
      const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
      if (r.canceled || !r.filePaths.length) return project
      project = projectInfo(r.filePaths[0])
      return project
    })
    ipcMain.handle('rules:list', () => (project ? rulesList() : []))
    ipcMain.handle('rules:read', (_e, id) => {
      if (!project || !/^[a-z0-9][a-z0-9-]*$/i.test(String(id))) return ''
      const p = path.join(project.rulesDir, `${id}.json`)
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : ''
    })
    ipcMain.handle('rules:save', (_e, repoRoot, rule) => saveRule(repoRoot, rule))
    ipcMain.handle('rules:delete', (_e, id) => deleteRule({ id }, log))
    ipcMain.handle('rules:builtin', () => registerBuiltinRules())
    ipcMain.handle('rules:rebuild-json', (_e, bump) => rebuildRulesJson(resolveRepoRoot(), { bump: !!bump }))
    ipcMain.handle('git:commit', (_e, { repoRoot, files, message, push }) => gitCommit(repoRoot, files, message, { push, log: m => console.log('[git]', m) }))
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

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  app.quit()
})
