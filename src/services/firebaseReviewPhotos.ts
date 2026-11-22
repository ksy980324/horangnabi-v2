import { doc, getDocFromServer } from 'firebase/firestore';
import { session } from './firebaseClient';
import { isReviewPhoto } from './stopReviews';
import { parseReviewPhotoReference } from './reviewPhotoReferences';

export function createBackupPhotoReader(userId: string) {
  const checked = new Set<string>();
  return async (tripId: string, photo: string) => {
    if (!checked.has(tripId)) {
      const { firestore } = session(userId);
      const parent = await getDocFromServer(doc(firestore, 'sharedTrips', tripId));
      if (!parent.exists() || !parent.data().memberIds?.includes(userId)) throw new Error('여행 참여 권한을 확인하지 못해 백업을 중단했어요.');
      checked.add(tripId);
    }
    return readSharedReviewPhoto(userId, tripId, photo);
  };
}

export async function readSharedReviewPhoto(userId: string, tripId: string, photo: string): Promise<string> {
  if (isReviewPhoto(photo)) return photo;
  const reference = parseReviewPhotoReference(photo);
  if (!reference) throw new Error('올바르지 않은 후기 사진입니다.');
  const { firestore } = session(userId);
  const snapshot = await getDocFromServer(doc(firestore, 'sharedTrips', tripId, 'photos', reference.id));
  const data = snapshot.data();
  if (!snapshot.exists() || !isReviewPhoto(data?.dataUrl) || data.dataUrl.length !== reference.bytes || data.bytes !== reference.bytes) throw new Error('사진을 불러오지 못했어요. 연결과 여행 참여 권한을 확인한 뒤 다시 시도해 주세요.');
  session(userId);
  return data.dataUrl;
}
