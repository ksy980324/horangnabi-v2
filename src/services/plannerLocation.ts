import type { Database } from '../types';
import { datesBetween } from '../data';
type PlannerView='schedule'|'saved'|'reservations'|'expenses'|'souvenirs';
export type PlannerLocation={tripId?:string;day?:string;view?:PlannerView;packingOpen?:boolean};
const key=(userId?:string)=>'horangnabi-v2:planner-location:'+(userId??'device');
export function readPlannerLocation(db:Database,userId?:string):PlannerLocation {
  try {
    const raw=JSON.parse(sessionStorage.getItem(key(userId))??'null') as PlannerLocation|null;
    const trip=db.trips.find(trip=>trip.id===raw?.tripId);
    if(!trip) return {};
    return {tripId:trip.id,day:typeof raw?.day==='string'&&datesBetween(trip.start,trip.end).includes(raw.day)?raw.day:trip.start,
      view:raw?.view&&['schedule','saved','reservations','souvenirs',...(userId?['expenses']:[])].includes(raw.view)?raw.view:'schedule',packingOpen:raw?.packingOpen===true};
  } catch {return {};}
}
export function savePlannerLocation(location:PlannerLocation,userId?:string) {
  try {sessionStorage.setItem(key(userId),JSON.stringify({tripId:location.tripId,day:location.day,view:location.view,packingOpen:location.packingOpen}));} catch {/* Screen restoration must not block editing. */}
}
export function clearPlannerLocation(userId?:string) {
  try {sessionStorage.removeItem(key(userId));} catch {/* Storage can be disabled by the browser. */}
}
