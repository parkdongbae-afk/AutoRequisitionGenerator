// 검증: ① naver-cart 규칙 실추출 ② charset 스마트디코딩 합성 케이스 ③ 전체 샘플 회귀
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import iconv from 'iconv-lite'
import { parseMhtml, decodeHtml, smartDecode } from '../src/main/lib/mhtml.js'
import { extractItems } from '../src/main/lib/extract.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..', '..')
const out = { cases: [], cart: null, regress: null }
const KO = '한글 테스트 품목 자동품의요구생성기 대한민국'

// ── ① naver-cart 규칙 실추출
{
  const rule = JSON.parse(fs.readFileSync(path.join(here, '..', 'src', 'main', 'lib', 'rules', 'naver-cart.json'), 'utf-8'))
  const parsed = parseMhtml(fs.readFileSync(path.join(root, 'shoping_cart', '장바구니.mhtml')))
  const html = decodeHtml(parsed.rootHtml)
  const res = extractItems(html, rule)
  out.cart = {
    itemCount: res.items.length,
    shippingFee: res.shippingFee,
    items: res.items.map(i => ({ name: i.name.slice(0, 40), qty: i.qty, unit: i.unitPrice, option: (i.option || '').slice(0, 30) }))
  }
}

// ── ② charset 합성 케이스
{
  const htmlBody = `<html><head><meta charset="euc-kr"></head><body><h1>${KO}</h1></body></html>`
  const eucBytes = iconv.encode(htmlBody, 'euc-kr')
  out.cases.push({
    case: 'A_euckr_bytes_euckr_meta',
    ok: smartDecode(eucBytes, null).includes(KO)
  })
  // 북마크릿 라운드트립 버그: 실제로는 UTF-8인데 meta만 euc-kr (과거 decodeHtmlBuffer가 파손시킴)
  const utfBytes = Buffer.from(`<html><head><meta charset="euc-kr"></head><body><h1>${KO}</h1></body></html>`, 'utf-8')
  out.cases.push({
    case: 'B_utf8_bytes_euckr_meta(stale)',
    ok: smartDecode(utfBytes, null).includes(KO)
  })
  // meta가 head의 긴 스크립트 뒤(구 스니프 4KB 초과)
  const pad = '<script>var x="' + 'a'.repeat(20000) + '";</script>'
  const deepMeta = Buffer.from(`<html><head>${pad}<meta charset="euc-kr"></head><body><h1>${KO}</h1></body></html>`, 'utf-8')
  const deepEuc = iconv.encode(`<html><head>${pad}<meta charset="euc-kr"></head><body><h1>${KO}</h1></body></html>`, 'euc-kr')
  out.cases.push({ case: 'C1_euckr_deepmeta', ok: smartDecode(deepEuc, null).includes(KO) })
  out.cases.push({ case: 'C2_utf8_deepmeta', ok: smartDecode(deepMeta, null).includes(KO) })
  // UTF-16LE BOM (iconv는 BOM을 자동으로 붙이지 않으므로 수동)
  const u16 = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    iconv.encode(`<html><head><meta charset="utf-16"></head><body><h1>${KO}</h1></body></html>`, 'utf-16le')
  ])
  out.cases.push({ case: 'D_utf16le_bom', ok: smartDecode(u16, null).includes(KO) })
  // MHTML: euc-kr 루트 파트 (헤더 charset 선언)
  const qp = (buf) => buf.toString('latin1').replace(/([=\r\n])/g, c => '=' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))
  const rootEuc = iconv.encode(`<html><head><meta charset="euc-kr"></head><body><h1>${KO}</h1></body></html>`, 'euc-kr')
  const mhtml = [
    'Content-Type: multipart/related; boundary="XYZ"',
    '',
    '--XYZ',
    'Content-Type: text/html; charset="euc-kr"',
    'Content-Location: https://example.co.kr/cart',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    qp(rootEuc),
    '',
    '--XYZ--',
    ''
  ].join('\r\n')
  const parsed = parseMhtml(Buffer.from(mhtml, 'latin1'))
  out.cases.push({
    case: 'E_mhtml_euckr_qp',
    ok: decodeHtml(parsed.rootHtml).includes(KO),
    location: parsed.rootHtml.location
  })
  // MHTML: 헤더 charset=euc-kr 인데 실제 UTF-8 (라벨 불신 케이스)
  const rootUtf = Buffer.from(`<html><head><meta charset="euc-kr"></head><body><h1>${KO}</h1></body></html>`, 'utf-8')
  const mhtml2 = mhtml.replace(qp(rootEuc), qp(rootUtf))
  const parsed2 = parseMhtml(Buffer.from(mhtml2, 'latin1'))
  out.cases.push({ case: 'F_mhtml_mislabeled_utf8', ok: decodeHtml(parsed2.rootHtml).includes(KO) })
}

// ── ③ 기존 샘플 회귀: 교체문자/매칭 동일성
{
  const rulesDir = path.join(here, '..', 'src', 'main', 'lib', 'rules')
  const load = (id) => JSON.parse(fs.readFileSync(path.join(rulesDir, id + '.json'), 'utf-8'))
  // rules.js의 builtin 배열 순서(=매칭 우선순위)와 동일하게
  const rules = ['gmarket', 'kyobo', 'naver', 'naver-cart', 'dreamdepot', 'icecreammall', 'alphamall', '11st', 'yes24', 'teachermall', 'auction', 'coupang', 'eleparts', 'ic114'].map(load)
  const matchRule = (url) => {
    for (const r of rules) for (const pat of r.match || []) if (url && url.includes(pat)) return r.id
    return null
  }
  const dir = path.join(root, 'shoping_cart')
  const files = fs.readdirSync(dir).filter(f => /\.mhtml?$/i.test(f))
  const newDir = path.join(dir, 'new')
  if (fs.existsSync(newDir)) for (const f of fs.readdirSync(newDir)) if (/\.mhtml?$/i.test(f)) files.push('new/' + f)
  out.regress = []
  for (const f of files) {
    try {
      const parsed = parseMhtml(fs.readFileSync(path.join(dir, f)))
      const html = decodeHtml(parsed.rootHtml)
      out.regress.push({
        fileName: f.slice(0, 24),
        rule: matchRule(parsed.rootHtml.location),
        bad: (html.match(/\ufffd/g) || []).length,
        hangul: (html.match(/[\uac00-\ud7a3]/g) || []).length
      })
    } catch (e) {
      out.regress.push({ fileName: f.slice(0, 24), error: String(e.message) })
    }
  }
}

fs.writeFileSync(path.join(here, 'verify-fixes.json'), JSON.stringify(out, null, 2), 'utf-8')
console.log('written')
