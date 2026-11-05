import { useEffect, useRef, useState } from 'react';
import type { TravelMapProps } from './mapTypes';
import { GOOGLE_MAP_ERROR, loadGoogleMaps, type GoogleMapInstance, type GoogleMapsApi } from '../services/googleMaps';
import { itineraryPath } from '../services/geo';

export default function GoogleMap({ points, selected, onSelect, onPick, fitKey, apiKey, mapId, connectPoints = false, initialCenter, onViewChange }: TravelMapProps & { apiKey: string; mapId: string }) {
  const container = useRef<HTMLDivElement>(null), map = useRef<GoogleMapInstance | null>(null);
  const callbacks = useRef({ onSelect, onPick, onViewChange }); callbacks.current = { onSelect, onPick, onViewChange };
  const startCenter = useRef(initialCenter);
  const hasMappedPoints = points.some(point => point.lat !== undefined && point.lng !== undefined);
  const [sdk, setSdk] = useState<GoogleMapsApi>(), [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let instance: GoogleMapInstance | undefined;
    let api: GoogleMapsApi | undefined;
    const authFailure = () => setError('Google 지도 인증에 실패했습니다. 연결 설정을 확인해 주세요. 일정은 계속 편집할 수 있어요.');
    window.addEventListener(GOOGLE_MAP_ERROR, authFailure);
    void loadGoogleMaps(apiKey).then(loadedApi => {
      if (cancelled || !container.current) return;
      api = loadedApi;
      instance = new api.Map(container.current, {
        center: startCenter.current ?? { lat: 34.681, lng: 135.505 }, zoom: 11, mapId,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        clickableIcons: false, gestureHandling: 'cooperative', zoomControl: true,
      });
      map.current = instance;
      instance.addListener('idle', () => {
        const center = instance?.getCenter()?.toJSON(), bounds = instance?.getBounds()?.toJSON();
        if (center && bounds) callbacks.current.onViewChange?.({ center, bounds });
      });
      instance.addListener('click', event => {
        const coordinates = event.latLng?.toJSON();
        if (coordinates) callbacks.current.onPick?.({ name: '지도에서 선택한 장소', address: '', ...coordinates });
      });
      setSdk(api);
    }).catch(() => {
      if (!cancelled) setError('Google 지도를 불러오지 못했습니다. 네트워크와 연결 설정을 확인해 주세요. 일정은 계속 편집할 수 있어요.');
    });
    return () => {
      cancelled = true;
      window.removeEventListener(GOOGLE_MAP_ERROR, authFailure);
      // The SDK has no destroy method. Remove listeners; React removes the container.
      if (instance && api) api.event.clearInstanceListeners(instance);
      map.current = null;
    };
  }, [apiKey, mapId]);

  useEffect(() => {
    if (!sdk || !map.current || !connectPoints) return;
    const path = itineraryPath(points);
    if (path.length < 2) return;
    const base = { map: map.current, path, geodesic: false, clickable: false };
    const line = new sdk.Polyline({ ...base, strokeColor: '#16877f', strokeOpacity: 0, strokeWeight: 1.5, zIndex: 2,
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeColor: '#16877f', strokeOpacity: 0.8, strokeWeight: 1.5, scale: 1.5 }, offset: '0', repeat: '9px' }],
    });
    return () => line.setMap(null);
  }, [points, sdk, connectPoints]);

  useEffect(() => {
    if (!sdk || !map.current) return;
    const markers = points.filter(p => p.lat !== undefined && p.lng !== undefined).map(p => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `map-pin ${p.id === selected ? 'active' : ''}`;
      button.textContent = String(p.number); button.setAttribute('aria-label', `${p.number}. ${p.name}`);
      const marker = new sdk.marker.AdvancedMarkerElement({ map: map.current!, position: { lat: p.lat!, lng: p.lng! }, content: button, title: `${p.number}. ${p.name}`, zIndex: p.id === selected ? 1000 : p.number });
      const select = (event: Event) => { event.stopPropagation(); callbacks.current.onSelect?.(p.id); };
      // DOM click also supports keyboard activation of the real button.
      button.addEventListener('click', select);
      marker.addListener('click', () => callbacks.current.onSelect?.(p.id));
      return { marker, button, select };
    });
    return () => markers.forEach(({ marker, button, select }) => { button.removeEventListener('click', select); sdk.event.clearInstanceListeners(marker); marker.map = null; });
  }, [points, selected, sdk]);

  useEffect(() => {
    if (!sdk || !map.current) return;
    const valid = points.filter(p => p.lat !== undefined && p.lng !== undefined);
    if (!valid.length) {
      if (initialCenter) { map.current.panTo(initialCenter); map.current.setZoom(11); }
      return;
    }
    const instance = map.current;
    if (valid.length === 1) { instance.panTo({ lat: valid[0].lat!, lng: valid[0].lng! }); instance.setZoom(14); return; }
    const bounds = new sdk.LatLngBounds();
    valid.forEach(p => bounds.extend({ lat: p.lat!, lng: p.lng! }));
    instance.fitBounds(bounds, 60);
    const listener = sdk.event.addListenerOnce(instance, 'idle', () => { if ((instance.getZoom() ?? 0) > 14) instance.setZoom(14); });
    return () => listener.remove();
    // Fit on day changes, explicit fit action, and initial load, not every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, sdk, initialCenter?.lat, initialCenter?.lng, hasMappedPoints]);

  useEffect(() => {
    const point = points.find(p => p.id === selected);
    if (sdk && point?.lat !== undefined && point.lng !== undefined) { map.current?.panTo({ lat: point.lat, lng: point.lng }); map.current?.setZoom(15); }
  }, [selected, points, sdk]);

  return <div className="map-wrap"><div className="map-canvas" ref={container} aria-label="Google 여행 장소 지도"/>{!sdk && !error && <div className="map-error" role="status">Google 지도를 불러오고 있어요.</div>}{error && <div className="map-error" role="alert">{error}</div>}</div>;
}
