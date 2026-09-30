import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('ruleMgr', {
  zaiBridgeStatus: () => ipcRenderer.invoke('zai-bridge-status'),
  projectDetect: startDir => ipcRenderer.invoke('project:detect', startDir),
  projectChoose: () => ipcRenderer.invoke('project:choose'),
  rulesList: () => ipcRenderer.invoke('rules:list'),
  rulesRead: id => ipcRenderer.invoke('rules:read', id),
  rulesSave: (repoRoot, rule) => ipcRenderer.invoke('rules:save', repoRoot, rule),
  rulesDelete: id => ipcRenderer.invoke('rules:delete', id),
  rulesBuiltin: () => ipcRenderer.invoke('rules:builtin'),
  rulesRebuildJson: bump => ipcRenderer.invoke('rules:rebuild-json', bump),
  gitCommit: (repoRoot, files, message, push) => ipcRenderer.invoke('git:commit', { repoRoot, files, message, push }),
  jev: {
    getStatus: () => ipcRenderer.invoke('jev:get-status'),
    testConnection: () => ipcRenderer.invoke('jev:test-connection'),
    judgeCandidate: request => ipcRenderer.invoke('jev:judge-candidate', request),
    getShadowResults: () => ipcRenderer.invoke('jev:get-shadow-results')
  }
})
