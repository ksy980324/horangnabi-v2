import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { TravelMapProps } from './mapTypes';
import { koreanLabel } from '../services/mapLabels';
import { itineraryPath } from '../services/geo';
export default function OpenMap({ points, selected, onSelect, onPick, fitKey, connectPoints = false, initialCenter, onViewChange }: TravelMapProps) {
  const container = useRef<HTMLDivElement>(null), map = useRef<maplibregl.Map | null>(null);
  const callbacks = useRef({ onSelect, onPick, onViewChange });
  callbacks.current = { onSelect, onPick, onViewChange };
  const startCenter = useRef(initialCenter);
  const markerElements = useRef<{ id: string; button: HTMLButtonElement; marker: maplibregl.Marker }[]>([]);
  const hasMappedPoints = points.some(point => point.lat !== undefined && point.lng !== undefined);
  const [ready, setReady] = useState(false), [error, setError] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    let resizeObserver: ResizeObserver | undefined;
    const timer = window.setTimeout(() => setError(true), 15000);
    try {
      instance = new maplibregl.Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/liberty', center: startCenter.current ? [startCenter.current.lng, startCenter.current.lat] : [135.505, 34.681], zoom: 11, attributionControl: { compact: true } });
      map.current = instance;
      resizeObserver = new ResizeObserver(() => {
        if (container.current?.clientWidth) instance.resize();
      });
      resizeObserver.observe(container.current);
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      instance.on('load', () => {
        clearTimeout(timer); setError(false); setReady(true);
        for (const layer of instance.getStyle().layers ?? []) {
          if (layer.type !== 'symbol') continue;
          const label = koreanLabel(layer.layout?.['text-field']);
          if (label) instance.setLayoutProperty(layer.id, 'text-field', label);
        }
      });
      instance.on('error', () => setError(true));
      const reportView = () => {
        const center = instance.getCenter(), bounds = instance.getBounds();
        callbacks.current.onViewChange?.({ center: { lat: center.lat, lng: center.wrap().lng }, bounds: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() } });
      };
      instance.on('load', reportView);
      instance.on('moveend', reportView);
      instance.on('click', e => callbacks.current.onPick?.({ name: '지도에서 선택한 장소', address: '', lat: e.lngLat.lat, lng: e.lngLat.wrap().lng }));
    } catch { clearTimeout(timer); setError(true); }
    return () => { clearTimeout(timer); resizeObserver?.disconnect(); instance?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !map.current || !connectPoints) return;
    const path = itineraryPath(points);
    if (path.length < 2) return;
    const instance = map.current;
    instance.addSource('schedule-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: path.map(p => [p.lng, p.lat]) } } });
    const before = instance.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
    instance.addLayer({ id: 'schedule-route-line', source: 'schedule-route', type: 'line', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#16877f', 'line-width': 1.5, 'line-opacity': 0.8, 'line-dasharray': [2, 4] } }, before);
    return () => {
      if (!instance.getStyle()) return;
      if (instance.getLayer('schedule-route-line')) instance.removeLayer('schedule-route-line');
      if (instance.getSource('schedule-route')) instance.removeSource('schedule-route');
    };
  }, [points, ready, connectPoints]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const markers = points.filter(p => p.lat !== undefined && p.lng !== undefined).map(p => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'map-pin';
      button.textContent = String(p.number); button.setAttribute('aria-label', `${p.number}. ${p.name}`);
      button.addEventListener('click', e => { e.stopPropagation(); callbacks.current.onSelect?.(p.id); });
      const marker = new maplibregl.Marker({ element: button }).setLngLat([p.lng!, p.lat!]).addTo(map.current!);
      return { id: p.id, button, marker };
    });
    markerElements.current = markers;
    return () => {
      markerElements.current = [];
      markers.forEach(({ marker }) => marker.remove());
    };
  }, [points, ready]);
  useEffect(() => {
    for (const { id, button } of markerElements.current) button.classList.toggle('active', id === selected);
  }, [selected, points, ready]);
  useEffect(() => {
    if (!ready || !map.current) return;
    const valid = points.filter(p => p.lat !== undefined && p.lng !== undefined);
    if (!valid.length) {
      if (initialCenter) map.current.easeTo({ center: [initialCenter.lng, initialCenter.lat], zoom: 11, duration: 600 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds(); valid.forEach(p => bounds.extend([p.lng!, p.lat!]));
    map.current.fitBounds(bounds, { padding: 65, maxZoom: 14, duration: 600 });
    // Fit only on day changes, explicit fit action, or initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready, initialCenter?.lat, initialCenter?.lng, hasMappedPoints]);
  useEffect(() => {
    const p = points.find(p => p.id === selected);
    if (ready && p?.lat !== undefined && p.lng !== undefined) map.current?.flyTo({ center: [p.lng, p.lat], zoom: 15, duration: 700 });
  }, [selected, points, ready]);
  return <div className="map-wrap"><div ref={container} className="map-canvas" aria-label="여행 장소 지도"/>{error && <div className="map-error" role="status">지도를 불러오지 못했거나 일부 정보가 누락됐습니다. 일정은 계속 편집할 수 있어요.</div>}<a className="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap · OpenFreeMap · OpenMapTiles</a></div>;
}
