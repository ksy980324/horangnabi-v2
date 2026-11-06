import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, MapPin, Pencil, Trash2 } from 'lucide-react';
import { datesBetween } from '../data';
import { loadTripCover, representativeTripPlace, type WikimediaPhoto } from '../services/wikimediaPhotos';
import type { Trip } from '../types';

export function TripCard({ trip, featured = false, onOpen, onEdit, onDelete }: { trip: Trip; featured?: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const { destination, region } = trip;
  const { countryCode, cityName, lat, lng } = destination ?? {};
  const card = useRef<HTMLElement>(null);
  const representative = representativeTripPlace(trip);
  const [lookupPhoto, setLookupPhoto] = useState<WikimediaPhoto>();
  const [failedUrl, setFailedUrl] = useState('');
  useEffect(() => {
    setLookupPhoto(undefined);
    if (representative || !countryCode || !cityName) return;
    let active = true;
    const load = () => { void loadTripCover({ countryCode, cityName, lat, lng }).then(cover => { if (active) setLookupPhoto(cover); }); };
    const element = card.current;
    const observer = element && typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: '120px' }) : undefined;
    if (observer && element && !featured) observer.observe(element);
    else load();
    return () => { active = false; observer?.disconnect(); };
  }, [representative, featured, countryCode, cityName, lat, lng]);
  const candidate = representative?.photo ?? lookupPhoto;
  const photo = candidate?.url === failedUrl ? undefined : candidate;
  const coverName = representative?.name || cityName;
  const endDate = trip.start.slice(0, 4) === trip.end.slice(0, 4) ? trip.end.slice(5) : trip.end;
  const dateRange = `${trip.start.replaceAll('-', '.')} — ${endDate.replaceAll('-', '.')}`;

  return <article className={`trip-card${featured ? ' trip-card-featured' : ''}`} ref={card}>
    <button className="trip-open" onClick={onOpen}>
      <div className="trip-art">
        {photo ? <><img key={photo.url} src={photo.url} alt="" className="trip-cover-photo" loading={featured ? 'eager' : 'lazy'} decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(photo.url)}/>{!featured && coverName && <span className="trip-cover-label">{coverName}</span>}</> : <><span className="art-sun"/><span className="art-hill back"/><span className="art-hill"/>{!featured && <span className="art-caption">OUR NEXT CHAPTER</span>}</>}
        {featured ? <div className="trip-featured-caption">
          <p><MapPin size={14} aria-hidden="true"/>{trip.region}</p>
          <h2>{trip.name}</h2>
          <p><CalendarDays size={14} aria-hidden="true"/>{dateRange}</p>
          <ArrowUpRight className="trip-featured-arrow" size={22} aria-hidden="true"/>
        </div> : <span className="trip-days">{datesBetween(trip.start, trip.end).length}일의 여행</span>}
      </div>
      {!featured && <div className="trip-body">
        <div className="eyebrow"><MapPin size={13}/>{trip.region}</div>
        <h3>{trip.name}<ArrowUpRight size={20}/></h3>
        <p className="muted"><CalendarDays size={14}/>{dateRange}</p>
        <div className="trip-card-foot"><span>{trip.stops.length}개의 소중한 계획</span><span>일정 열기 →</span></div>
      </div>}
    </button>
    <div className="trip-actions">
      <button className="text-button" onClick={onEdit}><Pencil size={14}/>수정</button>
      <button className="text-button" onClick={onDelete}><Trash2 size={14}/>삭제</button>
      {photo && <details className="trip-cover-credit"><summary>사진 출처</summary><a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.author || 'Wikimedia Commons'}</a>{' · '}{photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> : photo.license}</details>}
    </div>
  </article>;
}
