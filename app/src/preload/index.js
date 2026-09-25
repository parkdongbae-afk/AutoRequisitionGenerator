import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openMhtmlFiles: () => ipcRenderer.invoke('open-mhtml-files'),
  openMhtmlFolder: () => ipcRenderer.invoke('open-mhtml-folder'),
  loadMhtmlPath: (p) => ipcRenderer.invoke('load-mhtml-path', p),
  removeDoc: (id) => ipcRenderer.invoke('remove-doc', id),
  getDocUrl: (id, picker) => ipcRenderer.invoke('get-doc-url', id, picker),
  reextractDoc: (id, ruleId) => ipcRenderer.invoke('reextract-doc', id, ruleId),
  updateRows: (id, rows) => ipcRenderer.invoke('update-rows', id, rows),
  countSelector: (id, selector) => ipcRenderer.invoke('count-selector', id, selector),
  listRules: () => ipcRenderer.invoke('list-rules'),
  saveUserRule: (rule) => ipcRenderer.invoke('save-user-rule', rule),
  deleteUserRule: (id) => ipcRenderer.invoke('delete-user-rule', id),
  renameRule: (id, name) => ipcRenderer.invoke('rename-rule', id, name),
  rejectDoc: (id) => ipcRenderer.invoke('reject-doc', id),
  alertBox: (message) => ipcRenderer.invoke('alert-box', message),
  readExcel: (p) => ipcRenderer.invoke('read-excel', p),
  pickExcel: () => ipcRenderer.invoke('pick-excel'),
  loadExcelFull: (p) => ipcRenderer.invoke('load-excel-full', p),
  excelLoadConfirm: (fileName) => ipcRenderer.invoke('excel-load-confirm', fileName),
  appendExcel: (rows, p) => ipcRenderer.invoke('append-excel', rows, p),
  saveExcelAs: (rows) => ipcRenderer.invoke('save-excel-as', rows),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (k, v) => ipcRenderer.invoke('set-setting', k, v),
  openExtensionFolder: () => ipcRenderer.invoke('open-extension-folder'),
  setupBrowsers: () => ipcRenderer.invoke('setup-browsers'),
  extensionInfo: () => ipcRenderer.invoke('extension-info'),
  copyText: (t) => ipcRenderer.invoke('copy-text', t),
  browserAction: (key, action) => ipcRenderer.invoke('browser-action', key, action),
  addBookmarklets: (selection) => ipcRenderer.invoke('add-bookmarklets', selection),
  listBrowserProfiles: () => ipcRenderer.invoke('list-browser-profiles'),
  checkRuleUpdates: (url) => ipcRenderer.invoke('check-rule-updates', url),
  startupStatus: () => ipcRenderer.invoke('startup-status'),
  startupRegister: () => ipcRenderer.invoke('startup-register'),
  startupRemove: () => ipcRenderer.invoke('startup-remove'),
  openManual: () => ipcRenderer.invoke('open-manual'),
  openAdminManual: () => ipcRenderer.invoke('open-admin-manual'),
  runExtensionV2: () => ipcRenderer.invoke('run-extension-v2'),
  revealFile: (p) => ipcRenderer.invoke('reveal-file', p),
  adminPickFile: (kind) => ipcRenderer.invoke('admin-pick-file', kind),
  adminRun: (flow) => ipcRenderer.invoke('admin-run', flow),
  adminListMalls: () => ipcRenderer.invoke('admin-list-malls'),
  adminDeleteMall: (payload) => ipcRenderer.invoke('admin-delete-mall', payload),
  rulesVersion: () => ipcRenderer.invoke('rules-version'),
  onAdminLog: (cb) => {
    const handler = (_e, p) => cb(p)
    ipcRenderer.on('admin-log', handler)
    return () => ipcRenderer.removeListener('admin-log', handler)
  },
  onMhtmlReceived: (cb) => {
    const handler = (_e, doc) => cb(doc)
    ipcRenderer.on('mhtml-received', handler)
    return () => ipcRenderer.removeListener('mhtml-received', handler)
  },
  onBookmarkProgress: (cb) => {
    const handler = (_e, p) => cb(p)
    ipcRenderer.on('bookmark-progress', handler)
    return () => ipcRenderer.removeListener('bookmark-progress', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
