/*
 * 작업 로그 서비스 (ADMIN_SATAD_ALONE.MD §7.9)
 * 메모리 링 버퍼로 운영 로그를 모으고 레벨 필터·내보내기 형식을 제공한다.
 * Key·Authorization·쿠키 등은 상위에서 마스킹된 메시지만 들어온다(§7.9 무기록 값).
 */

export const LOG_MAX = 600

export function createLogStore({ max = LOG_MAX } = {}) {
  const entries = []
  return {
    append({ level = 'info', step = 'op', message, detail = '', file = '' }) {
      const entry = {
        timestamp: new Date().toISOString(),
        level,
        step,
        message: String(message || '').slice(0, 500),
        detail: String(detail || '').slice(0, 500),
        file
      }
      entries.push(entry)
      if (entries.length > max) entries.splice(0, entries.length - max)
      return entry
    },
    list({ level, step } = {}) {
      return entries.filter(e => (!level || level === 'ALL' || e.level === level) && (!step || e.step === step))
    },
    all() {
      return [...entries]
    },
    counts() {
      const c = { error: 0, warn: 0, info: 0, debug: 0 }
      for (const e of entries) if (c[e.level] != null) c[e.level]++
      return c
    },
    exportText({ level } = {}) {
      return this.list({ level })
        .map(e => `${e.timestamp} [${e.level.toUpperCase()}] (${e.step}) ${e.message}${e.detail ? ` — ${e.detail}` : ''}`)
        .join('\r\n')
    }
  }
}

// 내보내기 텍스트에 Key·토큰 흔적이 섞이면 마스킹한다(§7.9 이중 방어).
export function maskSecrets(text) {
  return String(text || '')
    .replace(/(Authorization\s*:\s*Bearer\s+)\S+/gi, '$1[마스킹]')
    .replace(/\b(sk-|ts-)[A-Za-z0-9_-]{8,}/g, '[마스킹]')
    .replace(/([A-Za-z0-9_-]{20,})\.(?:jsonl|key)/g, '[마스킹]')
}
