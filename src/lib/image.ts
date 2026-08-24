/**
 * Réduit une photo avant envoi : max 1600 px de côté, WebP qualité 0,8
 * (repli JPEG pour les navigateurs qui ne l'encodent pas).
 * En cas d'échec (format exotique), renvoie le fichier d'origine.
 */
export async function downscalePhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    const maxSide = 1600
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const toBlob = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.8))
    const webp = await toBlob('image/webp')
    if (webp && webp.type === 'image/webp') return webp
    const jpeg = await toBlob('image/jpeg')
    return jpeg ?? file
  } catch {
    return file
  }
}
