export const categories = ['관광', '맛집', '카페', '쇼핑', '숙소', '이동', '기타'] as const;
export type Category = typeof categories[number];
export type Place = { name: string; address: string; lat?: number; lng?: number; mapUrl?: string; photoUrl?: string };
export type StayEvent = 'checkIn' | 'start' | 'checkOut';
export type Stop = Place & { id: string; date: string; time: string; category: Category; memo: string; flightReservationId?: string; stayReservation?: { id: string; event: StayEvent } };
export type SavedPlace = Place & { id: string; category: Category; memo: string };
export type TripDestination = { countryCode: string; cityName: string; lat?: number; lng?: number };
export type PackingItem = { id: string; name: string; completed: boolean; completedBy?: string[] };
export type Expense = { id: string; name: string; date: string; currency: string; amount: number; paidBy: string; shared: boolean };
type ReservationDetails = { id: string; name: string; reference?: string; url?: string };
export type FlightDirection = 'outbound' | 'return';
export type Reservation = ReservationDetails & (
  { kind: 'flight'; direction?: FlightDirection; departure?: string; arrival?: string; departureAirport?: string; arrivalAirport?: string } |
  { kind: 'stay'; checkIn?: string; checkOut?: string; address?: string; lat?: number; lng?: number; mapUrl?: string }
);
export type Trip = { id: string; name: string; region: string; destination?: TripDestination; start: string; end: string; stops: Stop[]; savedPlaces?: SavedPlace[]; packingItems?: PackingItem[]; reservations?: Reservation[]; expenses?: Expense[] };
export type Database = { version: 1; trips: Trip[] };
