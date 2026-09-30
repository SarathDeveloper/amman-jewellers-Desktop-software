const ones = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]

const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ones[n]
  const t = Math.floor(n / 10)
  const o = n % 10
  return `${tens[t]}${o ? ` ${ones[o]}` : ''}`.trim()
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  const head = h ? `${ones[h]} Hundred` : ''
  const tail = rest ? twoDigits(rest) : ''
  return [head, tail].filter(Boolean).join(' ')
}

function indianNumberWords(n: number): string {
  if (n === 0) return 'Zero'
  const parts: string[] = []
  const crore = Math.floor(n / 10000000)
  n %= 10000000
  const lakh = Math.floor(n / 100000)
  n %= 100000
  const thousand = Math.floor(n / 1000)
  n %= 1000
  if (crore) parts.push(`${threeDigits(crore)} Crore`)
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`)
  if (n) parts.push(threeDigits(n))
  return parts.join(' ')
}

export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  let words = `Rupees ${indianNumberWords(rupees)}`
  if (paise > 0) {
    words += ` and ${twoDigits(paise)} Paise`
  }
  return `${words} Only`
}
