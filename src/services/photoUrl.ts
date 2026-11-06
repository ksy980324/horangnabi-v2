export const MAX_PHOTO_URL_LENGTH = 2048;

export function isPhotoUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_PHOTO_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}
