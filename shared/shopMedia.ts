export function diskPathFromStored(filePath: string): string {
  return filePath.trim()
}

export function shopMediaSrc(filePath: string): string {
  const path = diskPathFromStored(filePath)
  if (
    path.startsWith('/uploads/') ||
    path.startsWith('data:') ||
    path.startsWith('blob:') ||
    path.startsWith('http://') ||
    path.startsWith('https://')
  ) {
    return path
  }
  const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const basename = slash >= 0 ? path.slice(slash + 1) : path
  return basename ? `/uploads/${basename}` : path
}
