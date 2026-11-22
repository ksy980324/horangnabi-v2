export const maxReviewPhotoBytes = 200 * 1024;
export function parseReviewPhotoReference(value: unknown): { id: string; bytes: number } | undefined {
  if (typeof value !== 'string') return;
  const match = /^review-photo:([a-f0-9]{32}):([1-9][0-9]{0,5})$/.exec(value);
  if (!match || Number(match[2]) > maxReviewPhotoBytes) return;
  return { id: match[1], bytes: Number(match[2]) };
}
export const reviewPhotoSize = (photo: string) => parseReviewPhotoReference(photo)?.bytes ?? photo.length;
