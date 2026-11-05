// Narrow interfaces for the official browser SDK; no extra runtime dependency.
export type Coordinates = { lat: number; lng: number };
export type GoogleListener = { remove(): void };
export type GoogleMapClick = { latLng?: { toJSON(): Coordinates }; stop?(): void };
export type GoogleMapInstance = {
  panTo(position: Coordinates): void;
  setZoom(zoom: number): void;
  getZoom(): number | undefined;
  getCenter(): { toJSON(): Coordinates } | undefined;
  getBounds(): { toJSON(): { west: number; south: number; east: number; north: number } } | undefined;
  fitBounds(bounds: GoogleBounds, padding: number): void;
  addListener(event: string, callback: (event: GoogleMapClick) => void): GoogleListener;
};
type GoogleBounds = { extend(position: Coordinates): GoogleBounds };
export type GoogleMarker = { map: GoogleMapInstance | null; addListener(event: string, callback: () => void): GoogleListener };
export type GoogleMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  LatLngBounds: new () => GoogleBounds;
  Polyline: new (options: { map: GoogleMapInstance; path: Coordinates[]; strokeColor: string; strokeOpacity: number; strokeWeight: number; geodesic: boolean; clickable: boolean; zIndex: number; icons?: { icon: { path: string; strokeColor: string; strokeOpacity: number; strokeWeight: number; scale: number }; offset: string; repeat: string }[] }) => { setMap(map: GoogleMapInstance | null): void };
  marker: { AdvancedMarkerElement: new (options: { map: GoogleMapInstance; position: Coordinates; content: HTMLElement; title: string; zIndex: number }) => GoogleMarker };
  event: { clearInstanceListeners(instance: unknown): void; addListenerOnce(instance: unknown, event: string, callback: () => void): GoogleListener };
};
type MapsWindow = Window & {
  google?: { maps?: GoogleMapsApi };
  horangnabiMapsLoader?: { promise?: Promise<GoogleMapsApi>; failure?: Error };
  horangnabiMapsReady?: () => void;
  gm_authFailure?: () => void;
};
export const GOOGLE_MAP_ERROR = 'horangnabi:google-map-error';

/** Share one script request across maps, StrictMode and development updates. */
export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (!apiKey.trim()) return Promise.reject(new Error('Google Maps API 키를 설정해 주세요.'));
  const host = window as MapsWindow;
  // Keep this on the page, not the Vite module: HMR must not load another SDK.
  const loader = host.horangnabiMapsLoader ??= {};
  if (loader.failure) return Promise.reject(loader.failure);
  if (loader.promise) return loader.promise;
  if (host.google?.maps?.Map && host.google.maps.marker?.AdvancedMarkerElement) {
    return loader.promise = Promise.resolve(host.google.maps);
  }
  loader.promise = new Promise((resolve, reject) => {
    const fail = () => {
      loader.failure = new Error('Google 지도를 불러오지 못했습니다. API 키, 결제 및 허용 주소 설정을 확인해 주세요.');
      window.dispatchEvent(new Event(GOOGLE_MAP_ERROR));
      reject(loader.failure);
    };
    const timer = window.setTimeout(fail, 20000);
    host.gm_authFailure = () => { clearTimeout(timer); fail(); };
    host.horangnabiMapsReady = () => {
      clearTimeout(timer);
      const maps = host.google?.maps;
      if (maps?.Map && maps.marker?.AdvancedMarkerElement) resolve(maps);
      else fail();
      delete host.horangnabiMapsReady;
    };
    const script = document.createElement('script');
    script.id = 'horangnabi-google-maps';
    const params = new URLSearchParams({ key: apiKey.trim(), v: 'quarterly', loading: 'async', libraries: 'marker', language: 'ko', region: 'KR', callback: 'horangnabiMapsReady' });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => { clearTimeout(timer); fail(); };
    document.head.append(script);
  });
  return loader.promise;
}
