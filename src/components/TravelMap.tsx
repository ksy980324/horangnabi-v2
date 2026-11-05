import { lazy, Suspense } from 'react';
import type { TravelMapProps } from './mapTypes';
const GoogleMap = lazy(() => import('./GoogleMap'));
const OpenMap = lazy(() => import('./OpenMap'));
const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? '';
export function TravelMap(props: TravelMapProps) {
  return <>
    {!apiKey && <p className="hint" role="status">Google 지도 연결 전입니다. 현재 무료 지도를 표시합니다.</p>}
    <Suspense fallback={<div className="map-wrap" role="status">지도를 준비하고 있어요.</div>}>
      {apiKey ? <GoogleMap {...props} apiKey={apiKey} mapId={import.meta.env.VITE_GOOGLE_MAP_ID?.trim() || 'DEMO_MAP_ID'}/> : <OpenMap {...props}/>}
    </Suspense>
  </>;
}
