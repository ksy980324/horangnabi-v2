import type { Place } from '../types';
import type { GeoPoint, MapView } from '../services/geo';
export type MapPoint = Place & { id: string; number: number };
export type TravelMapProps = {
  points: MapPoint[];
  selected?: string;
  onSelect?: (id: string) => void;
  onPick?: (place: Place) => void;
  fitKey?: string | number;
  connectPoints?: boolean;
  initialCenter?: GeoPoint;
  onViewChange?: (view: MapView) => void;
};
