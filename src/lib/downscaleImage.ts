/** Longest side, in pixels, an uploaded image is allowed to keep. */
export const MAX_IMAGE_EDGE = 1200

/** JPEG re-encode quality when an image has to be shrunk. */
const JPEG_QUALITY = 0.85

export interface Size {
  width: number
  height: number
}

/**
 * Scales `width` x `height` down so its longest side is at most `max`.
 *
 * Never enlarges, and never returns a zero dimension. Pure so the arithmetic can
 * be tested without the DOM.
 */
export function fitWithin(width: number, height: number, max: number): Size {
  const safeWidth = Math.max(Math.round(width), 1)
  const safeHeight = Math.max(Math.round(height), 1)
  const longest = Math.max(safeWidth, safeHeight)
  const limit = Math.max(Math.floor(max), 1)
  if (longest <= limit) {
    return { width: safeWidth, height: safeHeight }
  }
  const ratio = limit / longest
  return {
    width: Math.max(Math.round(safeWidth * ratio), 1),
    height: Math.max(Math.round(safeHeight * ratio), 1),
  }
}

function encodeCanvas(source: ImageBitmap, size: Size, type: string): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) {
    return Promise.resolve(null)
  }
  // Keep transparency for PNG; JPEG has none to keep.
  if (type !== 'image/jpeg') {
    context.clearRect(0, 0, size.width, size.height)
  }
  context.drawImage(source, 0, 0, size.width, size.height)
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      type,
      type === 'image/jpeg' ? JPEG_QUALITY : undefined,
    )
  })
}

/**
 * Shrinks an uploaded image before it is sent to the server.
 *
 * Shop logos, signatures, and BIS/QR images are printed at a few centimetres
 * wide, but cameras and phone scans produce many megapixels. The full-size file
 * is transferred, stored, and then decoded on every single print preview, which
 * is expensive on a slow machine. Anything already small enough is passed
 * through untouched.
 *
 * Never throws and never fails the upload: on any problem the original file is
 * returned.
 */
export async function downscaleImageFile(
  file: File,
  max: number = MAX_IMAGE_EDGE,
): Promise<File> {
  if (!/^image\/(png|jpe?g)$/i.test(file.type) || typeof createImageBitmap !== 'function') {
    return file
  }

  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const target = fitWithin(bitmap.width, bitmap.height, max)
    if (target.width === bitmap.width && target.height === bitmap.height) {
      return file
    }
    const blob = await encodeCanvas(bitmap, target, file.type)
    if (!blob || blob.size >= file.size) {
      return file
    }
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}
