import { isReviewPhoto, reviewLimits } from './stopReviews';

/** Re-encode locally: originals, filenames and EXIF/GPS metadata are never uploaded. */
export async function compressReviewPhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/i.test(file.type)) throw new Error('사진 파일을 선택해 주세요. JPG·PNG·WebP 형식을 권장해요.');
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('원본 사진은 한 장당 25MB 이하로 선택해 주세요.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('사진을 읽지 못했어요. JPG 또는 PNG 사진으로 다시 선택해 주세요.'));
      image.src = url;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('사진 크기를 확인하지 못했어요.');
    const canvas = document.createElement('canvas');
    for (const edge of [1280, 960, 720, 540, 400]) {
      const scale = Math.min(1, edge / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('사진 압축을 지원하지 않는 브라우저예요.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.65, 0.5]) {
        const photo = canvas.toDataURL('image/jpeg', quality);
        if (photo.length <= reviewLimits.photoBytes && isReviewPhoto(photo)) return photo;
      }
    }
    throw new Error('사진을 충분히 압축하지 못했어요. 다른 사진을 선택해 주세요.');
  } finally {
    image.onload = null;
    image.onerror = null;
    URL.revokeObjectURL(url);
  }
}
