function localParts(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  return { year, month, day, hour, minute, second }
}

/** Calendar date in local timezone (YYYY-MM-DD). */
export function localDateIso(date = new Date()): string {
  const { year, month, day } = localParts(date)
  return `${year}-${month}-${day}`
}

export function localTodayIso(): string {
  return localDateIso()
}

/** Local timestamp for filenames: YYYYMMDD-HHMMSS. */
export function localNowStamp(): string {
  const { year, month, day, hour, minute, second } = localParts()
  return `${year}${month}${day}-${hour}${minute}${second}`
}

/** Local clock for filenames that already carry a date: HHMMSS. */
export function localTimeStamp(date = new Date()): string {
  const { hour, minute, second } = localParts(date)
  return `${hour}${minute}${second}`
}
