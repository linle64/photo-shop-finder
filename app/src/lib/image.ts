/** 把照片缩到最长边 1024px 的 JPEG，返回 base64（不含 data: 前缀）。失败时抛出带中文说明的 Error。 */
export async function toJpegBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('这张图片无法打开，请换一张 JPG 或 PNG 照片。');
  });
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const jpeg = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.7));
  if (!jpeg) throw new Error('这张图片太大，处理失败，请换一张或缩小后再试。');
  const dataUrl = await new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(jpeg);
  });
  return dataUrl.split(',')[1];
}

/** 生成历史记录用的小缩略图（最长边 120px 的 JPEG data URL）。 */
export async function toThumbDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 120 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.6);
}
