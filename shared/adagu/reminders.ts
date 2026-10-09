/**
 * Adagu (pledge) reminder helpers shared by the server and the UI.
 *
 * The WhatsApp link is the only outward channel, so the URL is built in one
 * place and validated again before it is opened.
 */

export const DEFAULT_ADAGU_REMINDER_TEMPLATE =
  'Dear {name}, your Adagu {receiptNo} has an interest of Rs.{interestDue} due on {dueDate}. Kindly pay to avoid further charges.'

export type AdaguReminderVars = {
  name: string
  receiptNo: string
  interestDue: number
  dueDate: string
  principal?: number
  shopName?: string
}

export function renderAdaguReminder(template: string, vars: AdaguReminderVars): string {
  const money = (value: number) => value.toFixed(2)
  const replacements: Record<string, string> = {
    '{name}': vars.name,
    '{receiptNo}': vars.receiptNo,
    '{interestDue}': money(vars.interestDue),
    '{dueDate}': vars.dueDate,
    '{principal}': money(vars.principal ?? 0),
    '{shopName}': vars.shopName ?? '',
  }
  return template.replace(
    /\{(?:name|receiptNo|interestDue|dueDate|principal|shopName)\}/g,
    (token) => replacements[token] ?? token,
  )
}

/**
 * Indian WhatsApp numbers need a country code. Ten digits become `91XXXXXXXXXX`;
 * numbers that already carry the code are kept. Anything unusable returns null.
 */
export function normalizeWhatsAppPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  if (digits.length === 12 && digits.startsWith('91')) return digits
  return null
}

/**
 * Percent-encode a reminder body so the finished URL only contains characters
 * that are safe both for a browser and for the Windows `start` command.
 */
export function encodeWhatsAppText(text: string): string {
  return encodeURIComponent(text).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** Build a `https://wa.me/<number>?text=<message>` link, or null when unusable. */
export function buildAdaguWhatsAppUrl(
  phone: string,
  template: string,
  vars: AdaguReminderVars,
): string | null {
  const number = normalizeWhatsAppPhone(phone)
  if (!number) return null
  const message = renderAdaguReminder(template, vars).trim()
  if (!message) return null
  return `https://wa.me/${number}?text=${encodeWhatsAppText(message)}`
}

/**
 * Only links this app builds are allowed to be opened. Keeping the allowlist
 * tight is what makes the Windows `start` call safe.
 */
export const WHATSAPP_URL_PATTERN = /^https:\/\/wa\.me\/\d{10,15}\?text=[A-Za-z0-9%._~-]+$/

export function isSafeWhatsAppUrl(url: string): boolean {
  return WHATSAPP_URL_PATTERN.test(url)
}
