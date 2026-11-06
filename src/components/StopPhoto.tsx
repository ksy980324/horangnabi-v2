import { useEffect, useRef, useState } from 'react';
import { hasCoordinates } from '../services/geo';
import { isPhotoUrl } from '../services/photoUrl';
import { loadWikimediaPhoto, type WikimediaPhoto } from '../services/wikimediaPhotos';
import type { Place } from '../types';

export function StopPhoto({ name, lat, lng, photoUrl }: Place) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [photo, setPhoto] = useState<WikimediaPhoto>();
  const [failedUrl, setFailedUrl] = useState('');
  const savedUrl = isPhotoUrl(photoUrl) ? photoUrl : undefined;
  useEffect(() => {
    setPhoto(undefined);
    if (savedUrl || !hasCoordinates({ lat, lng })) return;
    let active = true;
    const load = () => { void loadWikimediaPhoto({ name, lat, lng }).then(result => { if (active) setPhoto(result); }); };
    const observer = typeof IntersectionObserver === 'function' && anchor.current ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: '120px' }) : undefined;
    if (observer && anchor.current) observer.observe(anchor.current);
    else load();
    return () => { active = false; observer?.disconnect(); };
  }, [name, lat, lng, savedUrl]);

  const url = savedUrl || photo?.url;
  const image = url && url !== failedUrl && <img className="stop-photo" src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)}/>;
  return <>
    <span className="stop-photo-anchor" aria-hidden="true" ref={anchor}/>
    {image && (savedUrl || !photo ? <div className="stop-photo-frame">{image}</div> : <details className="stop-photo-frame">
      <summary aria-label={`${name} 사진 출처 보기`} title="사진 출처 보기">{image}</summary>
      <div className="stop-photo-credit">
        <a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.author || 'Wikimedia Commons'}</a>
        {photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> : <span>{photo.license}</span>}
      </div>
    </details>)}
  </>;
}
