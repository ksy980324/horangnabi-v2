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
  return <>
    <span className="stop-photo-anchor" aria-hidden="true" ref={anchor}/>
    {url && url !== failedUrl && <figure className="stop-photo-frame">
      <img className="stop-photo" src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)}/>
      {!savedUrl && photo && <figcaption>
        <a href={photo.source} target="_blank" rel="noopener noreferrer" title={photo.author || 'Wikimedia Commons'}>{photo.author || 'Wikimedia Commons'}</a>
        {photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> : <span>{photo.license}</span>}
      </figcaption>}
    </figure>}
  </>;
}
