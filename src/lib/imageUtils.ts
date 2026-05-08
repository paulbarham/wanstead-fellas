export function cropAndResizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 400
      canvas.height = 400
      const ctx = canvas.getContext('2d')!

      const size = Math.min(img.width, img.height)
      const sx = (img.width - size) / 2
      // Bias crop toward top: centre the crop at 33% of image height to capture faces
      const idealCenterY = img.height * 0.33
      const sy = Math.max(0, Math.min(idealCenterY - size / 2, img.height - size))

      ctx.drawImage(img, sx, sy, size, size, 0, 0, 400, 400)
      URL.revokeObjectURL(url)

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob)
          else reject(new Error('Canvas toBlob failed'))
        },
        'image/jpeg',
        0.88
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}
