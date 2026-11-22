import { isReviewPhoto, reviewLimits } from './stopReviews';

const PHOTO_TIMEOUT_MS = 15000;
function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const finish = () => { clearTimeout(timer); image.onload = null; image.onerror = null; };
    const timer = setTimeout(() => { finish(); image.src = ''; reject(new Error('사진 읽기 시간이 초과됐어요. 사진을 기기에 저장한 뒤 다시 선택해 주세요.')); }, PHOTO_TIMEOUT_MS);
    image.onload = () => { finish(); resolve(image); };
    image.onerror = () => { finish(); reject(new Error('사진을 읽지 못했어요.')); };
    try { image.src = source; } catch (cause) { finish(); reject(cause); }
  });
}
function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const fail = () => reject(new Error('사진 파일에 접근하지 못했어요. 갤러리에서 사진을 기기에 저장한 뒤 다시 선택해 주세요.'));
    const finish = () => { clearTimeout(timer); reader.onload = null; reader.onerror = null; reader.onabort = null; };
    const timer = setTimeout(() => { finish(); reader.abort(); fail(); }, PHOTO_TIMEOUT_MS);
    reader.onload = () => { const result = reader.result; finish(); typeof result === 'string' ? resolve(result) : fail(); };
    reader.onerror = () => { finish(); fail(); }; reader.onabort = () => { finish(); fail(); };
    try { reader.readAsDataURL(file); } catch { finish(); fail(); }
  });
}

/** Decode locally, with a FileReader fallback for mobile file-provider/blob URL failures. */
export async function compressReviewPhoto(file: File): Promise<string> {
  const extension = file.name?.split('.').pop()?.toLowerCase();
  const extensions: Record<string,string> = {jpg:'jpeg',jpeg:'jpeg',png:'png',webp:'webp',avif:'avif',heic:'heic',heif:'heif'};
  const mime = (!file.type || file.type === 'application/octet-stream') && extension && extensions[extension] ? 'image/' + extensions[extension] : file.type;
  if (!/^image\/(jpeg|jpg|png|webp|avif|heic|heif|heic-sequence|heif-sequence)$/i.test(mime)) throw new Error('JPG·PNG·WebP·AVIF·HEIC·HEIF 사진 파일을 선택해 주세요.');
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('원본 사진은 한 장당 25MB 이하로 선택해 주세요.');
  const isHeic = /hei[cf]/i.test(mime) || extension === 'heic' || extension === 'heif';
  let url: string | undefined;
  let image: HTMLImageElement | HTMLCanvasElement;
  let converted: HTMLCanvasElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    try { url = URL.createObjectURL(file); image = await loadImage(url); }
    catch {
      if (isHeic) {
        const { decodeHeicPhoto } = await import('./heicPhotos');
        image = converted = await decodeHeicPhoto(file);
      } else {
        if (typeof FileReader === 'undefined') throw new Error('사진을 읽지 못했어요. JPG 또는 PNG 사진으로 다시 선택해 주세요.');
        const data = await readDataUrl(file);
        try { image = await loadImage(data); }
        catch {
          throw new Error('사진 내용을 해석하지 못했어요. 갤러리에서 편집 후 새 파일로 저장하거나 화면을 캡처한 사진을 다시 선택해 주세요.');
        }
      }
    }
    const width = converted ? converted.width : (image as HTMLImageElement).naturalWidth;
    const height = converted ? converted.height : (image as HTMLImageElement).naturalHeight;
    if (!width || !height) throw new Error('사진 크기를 확인하지 못했어요.');
    canvas = document.createElement('canvas');
    for (const edge of [1280, 960, 720, 540, 400]) {
      const scale = Math.min(1, edge / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
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
    if (url) URL.revokeObjectURL(url);
    if (converted) { converted.width = 1; converted.height = 1; }
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
