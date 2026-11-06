import { useEffect, useState } from 'react';
import { ArrowUpRight, CalendarDays, MapPin, Pencil, Trash2 } from 'lucide-react';
import { datesBetween } from '../data';
import { loadTripCover, representativeTripPlace, type WikimediaPhoto } from '../services/wikimediaPhotos';
import type { Trip } from '../types';

export function TripCard({ trip, onOpen, onEdit, onDelete }: { trip: Trip; onOpen: () => void; onEdit: () => void; onDelete: () => void }) {
  const { destination, region } = trip;
  const { countryCode, cityName, lat, lng } = destination ?? {};
  const [photo, setPhoto] = useState<WikimediaPhoto>();
  useEffect(() => {
    let active = true;
    setPhoto(undefined);
    const city = countryCode && cityName ? { countryCode, cityName, lat, lng } : undefined;
    void loadTripCover({ destination: city, region }).then(cover => { if (active) setPhoto(cover); });
    return () => { active = false; };
  }, [countryCode, cityName, lat, lng, region]);
  const coverName = representativeTripPlace(trip)?.name || cityName;

  return <article className="trip-card">
    <button className="trip-open" onClick={onOpen}>
      <div className="trip-art">
        {photo ? <><img src={photo.url} alt="" className="trip-cover-photo" loading="lazy" referrerPolicy="no-referrer" onError={() => setPhoto(undefined)}/>{coverName && <span className="trip-cover-label">{coverName}</span>}</> : <><span className="art-sun"/><span className="art-hill back"/><span className="art-hill"/><span className="art-caption">OUR NEXT CHAPTER</span></>}
        <span className="trip-days">{datesBetween(trip.start, trip.end).length}일의 여행</span>
      </div>
      <div className="trip-body">
        <div className="eyebrow"><MapPin size={13}/>{trip.region}</div>
        <h3>{trip.name}<ArrowUpRight size={20}/></h3>
        <p className="muted"><CalendarDays size={14}/>{trip.start.replaceAll('-', '.')} — {trip.end.slice(5).replace('-', '.')}</p>
        <div className="trip-card-foot"><span>{trip.stops.length}개의 소중한 계획</span><span>일정 열기 →</span></div>
      </div>
    </button>
    <div className="trip-actions">
      <button className="text-button" onClick={onEdit}><Pencil size={14}/>수정</button>
      <button className="text-button" onClick={onDelete}><Trash2 size={14}/>삭제</button>
      {photo && <details className="trip-cover-credit"><summary>사진 출처</summary><a href={photo.source} target="_blank" rel="noopener noreferrer">{photo.author || 'Wikimedia Commons'}</a>{' · '}{photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a> : photo.license}</details>}
    </div>
  </article>;
}
