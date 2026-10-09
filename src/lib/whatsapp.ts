import { formatCurrency, formatDisplayDate } from './format'

/**
 * Builds a WhatsApp click-to-chat link. Indian 10-digit numbers get the `91`
 * country code; anything else is used as-is.
 */
export function whatsappLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '')
  const withCountry = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`
}

/** Payment reminder for one overdue gold savings installment. */
export function goldSavingsReminderMessage(input: {
  shopName: string
  customerName: string
  accountNo: string
  dueDate: string
  amount: number
  installmentNo?: number
}): string {
  const shop = input.shopName.trim()
  const installment =
    input.installmentNo != null
      ? `installment #${input.installmentNo}`
      : 'the next installment'
  return [
    ...(shop ? [shop] : []),
    `Dear ${input.customerName},`,
    `Your gold savings account ${input.accountNo} has ${installment} of ${formatCurrency(
      input.amount,
    )} due on ${formatDisplayDate(input.dueDate)}.`,
    'Please pay at your convenience.',
  ].join('\n')
}
