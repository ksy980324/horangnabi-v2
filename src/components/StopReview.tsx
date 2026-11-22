import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import type { Stop, StopReview as Review } from '../types';
import { compressReviewPhoto } from '../services/reviewPhotos';
import { reviewLimits, tripReviewPhotoBytes } from '../services/stopReviews';
import type { Trip } from '../types';
import { Modal } from './Modal';
import { ReviewPhoto } from './StopReviewPreview';

export function StopReviewForm({ stop, trip, busy, status, shared, onClose, onSave }: {
  stop: Stop; trip: Trip; busy: boolean; status?: string; shared: boolean;
  onClose: () => void; onSave: (review: Review) => void;
}) {
  const [text, setText] = useState(stop.review?.text ?? '');
  const [photos, setPhotos] = useState(stop.review?.photos ?? []);
  const [processing, setProcessing] = useState(false), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null), working = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const used = tripReviewPhotoBytes(trip) - (trip.stops.find(item => item.id === stop.id)?.review?.photos.reduce((sum, photo) => sum + photo.length, 0) ?? 0) + photos.reduce((sum, photo) => sum + photo.length, 0);
  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const photoInput = event.currentTarget;
    const files = Array.from(photoInput.files ?? []);
    if (!files.length || working.current || busy) return;
    if (files.length + photos.length > reviewLimits.photos) { photoInput.value = ''; return setError('사진은 일정당 최대 3장까지 첨부할 수 있어요.'); }
    working.current = true; setProcessing(true); setError('');
    try {
      const added: string[] = [];
      for (const file of files) {
        added.push(await compressReviewPhoto(file));
        if (!alive.current) return;
      }
      if (used + added.reduce((sum, photo) => sum + photo.length, 0) > reviewLimits.tripPhotoBytes) throw new Error('여행의 후기 사진 용량이 가득 찼어요. 기존 사진을 줄인 뒤 다시 첨부해 주세요.');
      setPhotos(current => [...current, ...added]);
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : '사진을 준비하지 못했어요.');
    } finally {
      photoInput.value = '';
      working.current = false;
      if (alive.current) setProcessing(false);
    }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (!busy && !working.current) { setError(''); onSave({ text, photos }); }
  }
  return <Modal title="방문 후기" busy={busy || processing} busyMessage={processing ? '사진을 압축하고 있어요.' : undefined} status={status} onClose={onClose}>
    <form className="form stop-review-form" onSubmit={save}>
      <div><strong>{stop.name}</strong><p className="muted">{shared ? '여행 참여자 모두가 함께 보고 수정하는 후기예요.' : '이 기기의 여행에 저장돼요.'} 교통편 메모와 따로 보관해요.</p></div>
      <fieldset className="editor-fields" disabled={busy || processing}>
        <label>후기<textarea autoFocus rows={6} maxLength={reviewLimits.text} value={text} onChange={event => setText(event.target.value)} placeholder="어땠나요? 좋았던 점과 다음에 기억할 것을 적어보세요."/></label>
        <span className="muted review-text-count">{text.length.toLocaleString()} / 3,000자</span>
        <div className="review-photos">{photos.map((photo, index) => <ReviewPhoto key={index} photo={photo} index={index}>
          <button type="button" className="text-button danger" aria-label={`후기 사진 ${index + 1} 삭제`} onClick={() => { setPhotos(items => items.filter((_, i) => i !== index)); setError(''); }}><Trash2 size={14}/>삭제</button>
        </ReviewPhoto>)}</div>
        <input ref={input} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/heic-sequence,image/heif-sequence,.jpg,.jpeg,.png,.webp,.avif,.heic,.heif" onChange={event => void addPhotos(event)}/>
        <button type="button" className="secondary" disabled={photos.length >= reviewLimits.photos} onClick={() => input.current?.click()}><Camera size={16}/>사진 첨부 · {photos.length}/3</button>
        <p className="muted">HEIC·HEIF 사진도 기기에서 변환·압축해 저장해요. 일정당 최대 3장 · 여행 전체 사진 {Math.ceil(used / 1024)}/600KB. 원본은 별도로 보관해 주세요.</p>
        {stop.review && <button type="button" className="text-button danger" onClick={() => { if (confirm('이 일정의 후기와 사진을 모두 비울까요? 저장을 눌러야 반영돼요.')) { setText(''); setPhotos([]); setError(''); } }}>후기 비우기</button>}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy || processing}>{processing ? '사진 준비 중' : '후기 저장'}</button>
    </form>
  </Modal>;
}

