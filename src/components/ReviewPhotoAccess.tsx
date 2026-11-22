import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isReviewPhoto } from '../services/stopReviews';

type PhotoAccess = { key: string; read: (photo: string) => Promise<string> };
const inlineAccess: PhotoAccess = { key: 'local', read: async photo => {
  if (!isReviewPhoto(photo)) throw new Error('이 사진을 볼 수 있는 여행을 다시 열어 주세요.');
  return photo;
} };
const Context = createContext<PhotoAccess>(inlineAccess);
export const useReviewPhotoAccess = () => useContext(Context);

export function ReviewPhotoAccess({ userId, tripId, children }: { userId?: string; tripId?: string; children: ReactNode }) {
  const access = useMemo<PhotoAccess>(() => {
    const cache = new Map<string, Promise<string>>();
    return { key: `${userId ?? ''}:${tripId ?? ''}`, read: photo => {
      if (isReviewPhoto(photo)) return Promise.resolve(photo);
      if (!userId || !tripId) return inlineAccess.read(photo);
      const cached = cache.get(photo);
      if (cached) return cached;
      const result = import('../services/firebaseReviewPhotos').then(module => module.readSharedReviewPhoto(userId, tripId, photo)).catch(error => { cache.delete(photo); throw error; });
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(photo, result);
      return result;
    } };
  }, [userId, tripId]);
  return <Context.Provider value={access}>{children}</Context.Provider>;
}

export function useReviewPhotoSource(photo: string) {
  const access = useReviewPhotoAccess();
  const key = access.key + ':' + photo;
  const [state, setState] = useState({ key: '', source: '', error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (isReviewPhoto(photo)) return;
    let active = true;
    setState({ key, source: '', error: '' });
    void access.read(photo).then(source => { if (active) setState({ key, source, error: '' }); }, () => {
      if (active) setState({ key, source: '', error: '사진을 불러오지 못했어요.' });
    });
    return () => { active = false; };
  }, [access, photo, key, attempt]);
  return { source: isReviewPhoto(photo) ? photo : state.key === key ? state.source : '', error: state.key === key ? state.error : '', retry: () => setAttempt(value => value + 1) };
}

export function ReviewPhotoImage({ photo, alt }: { photo: string; alt: string }) {
  const { source, error, retry } = useReviewPhotoSource(photo);
  return source ? <img src={source} loading="lazy" alt={alt}/> : <span role="status">{error || '사진을 불러오고 있어요.'}{error && <button type="button" className="text-button" onClick={retry}>다시 시도</button>}</span>;
}
