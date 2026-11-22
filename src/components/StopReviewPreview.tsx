import { useState, type ReactNode } from 'react';
import type { StopReview as Review } from '../types';
import { useReviewPhotoSource } from './ReviewPhotoAccess';

export function StopReviewPreview({ review }: { review: Review }) {
  return <section className="stop-review-preview" aria-label="방문 후기"><strong>방문 후기</strong>
    {review.text && <p>{review.text}</p>}
    {!!review.photos.length && <div className="review-photos">{review.photos.map((photo, index) => <ReviewPhoto key={index} photo={photo} index={index}/>)}</div>}
  </section>;
}

export function ReviewPhoto({ photo, index, children }: { photo: string; index: number; children?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const { source, error, retry } = useReviewPhotoSource(photo);
  return <figure className={expanded ? 'review-photo expanded' : 'review-photo'}>
    {source ? <button type="button" className="review-photo-toggle" aria-label={`후기 사진 ${index + 1} ${expanded ? '축소' : '확대'}`} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><img src={source} loading="lazy" alt={`후기 사진 ${index + 1}`}/></button> : <p role="status">{error || '사진을 불러오고 있어요.'}{error && <button type="button" onClick={retry}>다시 시도</button>}</p>}
    {expanded && source && <a className="text-button" href={source} download={`review-${index + 1}.jpg`}>사진 저장</a>}
    {children}
  </figure>;
}
