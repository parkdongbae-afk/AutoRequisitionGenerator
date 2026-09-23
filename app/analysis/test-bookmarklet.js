const { buildBookmarklet } = require('../src/main/lib/bookmarklet.js')
const code = buildBookmarklet(57330)
try {
  new Function(code)
  console.log('북마크릿 문법 OK, 길이:', code.length)
  const must = ['data-src', 'X-Source-Url', '/html', '127.0.0.1:57330']
  must.forEach(k => console.log(' 포함', k, ':', code.includes(k)))
} catch (e) {
  console.log('문법 오류:', e.message)
  console.log(code.slice(0, 300))
}
