import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanCaptureFolder, summarizeScan, detectKind, detectShipTag } from '../../src/main/services/sample-folder-service.js'

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'mgr-scan-'))
  const mall = join(root, '무신사')
  const free = join(mall, '배송비무료')
  const paid = join(mall, '배송비발생')
  mkdirSync(free, { recursive: true })
  mkdirSync(paid, { recursive: true })
  writeFileSync(join(free, '장바구니.html'), '<html></html>', 'utf-8')
  writeFileSync(join(free, '장바구니.mhtml'), 'MIME-Version: 1.0', 'utf-8')
  writeFileSync(join(free, '주문서.mhtml'), 'MIME-Version: 1.0', 'utf-8')
  writeFileSync(join(free, '정답_품목.xlsx'), 'x', 'utf-8')
  writeFileSync(join(paid, '장바구니 2.mhtml'), 'MIME-Version: 1.0', 'utf-8')
  writeFileSync(join(paid, '주문서2.html'), '<html></html>', 'utf-8')
  writeFileSync(join(paid, '정답2.xlsx'), 'x', 'utf-8')
  return { root, mall, free, paid }
}

test('분류 — 파일명·폴더명으로 종류와 배송비 상태 판정', () => {
  assert.equal(detectKind('장바구니.mhtml'), 'cart')
  assert.equal(detectKind('주문을 확인하십시오 - AliExpress.mhtml'), 'order')
  assert.equal(detectKind('D:\\캡처\\주문서\\cart.html'), 'cart')
  assert.equal(detectShipTag('D:\\무신사\\배송비무료\\장바구니.mhtml'), 'free')
  assert.equal(detectShipTag('D:\\무신사\\배송비발생\\주문서.mhtml'), 'paid')
  assert.equal(detectShipTag('D:\\캡처\\장바구니.mhtml'), '')
})

test('스캔 — 종류별 분류·html/mhtml 중복 제거(mhtml 우선)·폴더별 정답 매칭', () => {
  const { mall } = setup()
  try {
    const scan = scanCaptureFolder(mall)
    const cart = scan.captures.filter(c => c.kind === 'cart')
    const order = scan.captures.filter(c => c.kind === 'order')
    assert.equal(cart.length, 2, '무료 1(중복 제거) + 발생 1')
    assert.equal(order.length, 2)
    const freeCart = cart.find(c => c.shipTag === 'free')
    assert.ok(freeCart.path.endsWith('.mhtml'), '중복은 mhtml 우선')
    assert.equal(cart.find(c => c.shipTag === 'paid').path.includes('배송비발생'), true)
    for (const c of cart) assert.ok(c.answerPath, '같은 폴더의 정답이 매칭되어야 한다')
    assert.equal(scan.answers.length, 2)
    assert.equal(scan.mallName, '무신사')
    const s = summarizeScan(scan)
    assert.equal(s.cart.free, 1)
    assert.equal(s.cart.paid, 1)
    assert.equal(s.answers, 2)
    assert.equal(s.total, 4)
    assert.equal(scan.merged, 1, 'html+mhtml 쌍 1개 병합')
  } finally { rmSync(mall, { recursive: true, force: true }) }
})

test('정답 1개 공용 — 하위 폴더에 정답이 없으면 루트 정답으로 폴백 매칭', () => {
  const root = mkdtempSync(join(tmpdir(), 'mgr-scan-shared-'))
  try {
    const mall = join(root, '무신사')
    for (const sub of ['배송비무료', '배송비발생']) {
      mkdirSync(join(mall, sub), { recursive: true })
      writeFileSync(join(mall, sub, '장바구니.mhtml'), 'MIME-Version: 1.0', 'utf-8')
    }
    writeFileSync(join(mall, '정답.xls'), 'x', 'utf-8')
    const scan = scanCaptureFolder(mall)
    assert.equal(scan.captures.length, 2)
    assert.ok(scan.captures.every(c => c.answerPath && c.answerPath.endsWith('정답.xls')), '루트 정답으로 폴백 매칭')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('빈 폴더 — 정상 빈 결과', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mgr-scan-empty-'))
  try {
    const scan = scanCaptureFolder(dir)
    assert.equal(scan.captures.length, 0)
    assert.equal(summarizeScan(scan).total, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
