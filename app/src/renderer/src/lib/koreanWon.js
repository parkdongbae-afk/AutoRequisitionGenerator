// 숫자 → 한글 금액 (Proposal.md §5.3-1)
// 예: 1234560 → "백이십삼만사천오백육십" (다. 소요예산: 1,234,560원(금백이십삼만사천오백육십원))
export function wonToKorean(n) {
  n = Math.round(Number(n) || 0)
  if (n <= 0) return '영'
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
  const units = ['', '십', '백', '천']
  const bigs = ['', '만', '억', '조', '경']
  let out = ''
  let gi = 0
  while (n > 0 && gi < bigs.length) {
    const g = n % 10000
    n = Math.floor(n / 10000)
    if (g > 0) {
      let gs = ''
      let v = g
      for (let p = 0; p < 4; p++) {
        const digit = v % 10
        v = Math.floor(v / 10)
        if (digit > 0) {
          // 십·백·천 앞의 1은 "일"을 생략 (일십→십, 일백→백, 일천→천)
          gs = (digit === 1 && p > 0 ? '' : digits[digit]) + units[p] + gs
        }
      }
      out = gs + bigs[gi] + out
    }
    gi++
  }
  return out
}
