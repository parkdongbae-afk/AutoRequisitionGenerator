import { contextBridge, ipcRenderer } from 'electron'

// 렌더러 초기 크래시 수집 — E2E·디버깅용(모든 페이지 스크립트보다 먼저 등록)
window.__errs = window.__errs || []
window.addEventListener('error', e => window.__errs.push('pageerror: ' + (e.message || e) + ' @ ' + String(e.filename || '').split(/[\\/]/).pop() + ':' + e.lineno))
window.addEventListener('unhandledrejection', e => window.__errs.push('unhandled: ' + String(e.reason && (e.reason.stack || e.reason.message) || e.reason).slice(0, 300)))

contextBridge.exposeInMainWorld('ruleMgr', {
  zaiBridgeStatus: () => ipcRenderer.invoke('zai-bridge-status'),
  projectDetect: startDir => ipcRenderer.invoke('project:detect', startDir),
  projectChoose: () => ipcRenderer.invoke('project:choose'),
  projectRecent: () => ipcRenderer.invoke('project:recent'),
  rulesList: () => ipcRenderer.invoke('rules:list'),
  rulesRead: id => ipcRenderer.invoke('rules:read', id),
  rulesSave: (repoRoot, rule) => ipcRenderer.invoke('rules:save', repoRoot, rule),
  rulesDelete: (id, repoRoot) => ipcRenderer.invoke('rules:delete', id, repoRoot),
  rulesDeletePreview: (repoRoot, id) => ipcRenderer.invoke('rules:delete-preview', repoRoot, id),
  rulesBuiltin: () => ipcRenderer.invoke('rules:builtin'),
  rulesRebuildJson: bump => ipcRenderer.invoke('rules:rebuild-json', bump),
  gitCommit: (repoRoot, files, message, push) => ipcRenderer.invoke('git:commit-rules', { repoRoot, files, message, push }),
  tx: {
    list: () => ipcRenderer.invoke('tx:list'),
    rollback: id => ipcRenderer.invoke('tx:rollback', id)
  },
  verifyAll: () => ipcRenderer.invoke('verify:all'),
  verifySamples: dir => ipcRenderer.invoke('verify:samples', dir),
  pickDir: () => ipcRenderer.invoke('pick:dir'),
  shadowCollectFixtures: () => ipcRenderer.invoke('shadow:collect-fixtures'),
  shadowResolve: (ruleId, adminDecision) => ipcRenderer.invoke('shadow:resolve', ruleId, adminDecision),
  inboxList: () => ipcRenderer.invoke('inbox:list'),
  onInbox: cb => {
    const h = () => cb()
    ipcRenderer.on('inbox:new', h)
    return () => ipcRenderer.removeListener('inbox:new', h)
  },
  extensionInstall: () => ipcRenderer.invoke('extension:install'),
  google: {
    setKey: plain => ipcRenderer.invoke('google:set-key', plain),
    clearKey: () => ipcRenderer.invoke('google:clear-key'),
    hasKey: () => ipcRenderer.invoke('google:has-key'),
    test: key => ipcRenderer.invoke('google:test', key),
    listModels: key => ipcRenderer.invoke('google:list-models', key)
  },
  answer: {
    extract: req => ipcRenderer.invoke('answer:extract', req),
    save: req => ipcRenderer.invoke('answer:save', req),
    pickFile: () => ipcRenderer.invoke('answer:pick-file')
  },
  git: {
    status: () => ipcRenderer.invoke('git:status'),
    diff: paths => ipcRenderer.invoke('git:diff', paths),
    stage: paths => ipcRenderer.invoke('git:stage', paths),
    commit: message => ipcRenderer.invoke('git:commit', message),
    push: opts => ipcRenderer.invoke('git:push', opts),
    ahead: () => ipcRenderer.invoke('git:ahead')
  },
  log: {
    list: filter => ipcRenderer.invoke('log:list', filter),
    counts: () => ipcRenderer.invoke('log:counts'),
    export: level => ipcRenderer.invoke('log:export', level),
    onLog: cb => {
      const h = (_e, m) => cb(m)
      ipcRenderer.on('operation:log', h)
      return () => ipcRenderer.removeListener('operation:log', h)
    }
  },
  pickSamples: () => ipcRenderer.invoke('pick:samples', 'sample'),
  pickAnswer: () => ipcRenderer.invoke('pick:samples', 'answer'),
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: partial => ipcRenderer.invoke('settings:set', partial),
    setJevKey: plain => ipcRenderer.invoke('settings:set-jev-key', plain),
    clearJevKey: () => ipcRenderer.invoke('settings:clear-jev-key'),
    hasJevKey: () => ipcRenderer.invoke('settings:has-jev-key')
  },
  mapping: {
    openFile: () => ipcRenderer.invoke('mapping:open-file'),
    openPath: p => ipcRenderer.invoke('mapping:open-path', p),
    close: token => ipcRenderer.invoke('mapping:close', token),
    assemble: req => ipcRenderer.invoke('mapping:assemble', req),
    preview: req => ipcRenderer.invoke('mapping:preview', req)
  },
  generate: {
    start: payload => ipcRenderer.invoke('generate:start', payload),
    validate: payload => ipcRenderer.invoke('generate:validate', payload),
    scanFolder: dir => ipcRenderer.invoke('generate:scan-folder', dir),
    apply: (repoRoot, generation, options) => ipcRenderer.invoke('generate:apply', { repoRoot, generation, options }),
    onProgress: cb => {
      const h = (_e, m) => cb(m)
      ipcRenderer.on('operation:progress', h)
      return () => ipcRenderer.removeListener('operation:progress', h)
    }
  },
  jev: {
    getStatus: () => ipcRenderer.invoke('jev:get-status'),
    testConnection: () => ipcRenderer.invoke('jev:test-connection'),
    judgeCandidate: request => ipcRenderer.invoke('jev:judge-candidate', request),
    getShadowResults: () => ipcRenderer.invoke('jev:get-shadow-results')
  }
})
