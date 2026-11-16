import type { ActivityArea, ActivityChange, Trip, TripActivity } from '../types';

export const ACTIVITY_LIMIT=50;
const CHANGE_LIMIT=5;
const areas=['trip','stop','saved','reservation','packing','expense'];
const actions=['create','update','delete','reorder','check','uncheck','move'];
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=max;
export function validActivityLog(value:unknown):value is TripActivity[] {
  if(!Array.isArray(value)||value.length>ACTIVITY_LIMIT) return false;
  const ids=new Set<string>();
  return value.every(entry=>{
    if(!entry||!text(entry.id,128)||ids.has(entry.id)||!text(entry.actorId,128)||!text(entry.actorName,60)||!Number.isSafeInteger(entry.at)||entry.at<0||entry.at>8640000000000000||!Number.isSafeInteger(entry.more)||entry.more<0) return false;
    ids.add(entry.id);
    return Array.isArray(entry.changes)&&entry.changes.length>0&&entry.changes.length<=CHANGE_LIMIT&&entry.changes.every((change:ActivityChange)=>
      change&&areas.includes(change.area)&&actions.includes(change.action)&&text(change.label,120)
      &&Array.isArray(change.fields)&&change.fields.length<=8&&change.fields.every(field=>text(field,40))
      &&(change.date===undefined||(/^\d{4}-\d{2}-\d{2}$/.test(change.date)&&Number.isFinite(Date.parse(change.date+'T00:00:00Z'))&&new Date(change.date+'T00:00:00Z').toISOString().slice(0,10)===change.date)));
  });
}
function same(a:unknown,b:unknown):boolean {
  if(a===b) return true;
  if(Array.isArray(a)&&Array.isArray(b)) return a.length===b.length&&a.every((value,i)=>same(value,b[i]));
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)) {
    const left=a as Record<string,unknown>,right=b as Record<string,unknown>,keys=new Set([...Object.keys(left),...Object.keys(right)]);
    return [...keys].every(key=>same(left[key],right[key]));
  }
  return false;
}
const short=(value:string,max=120)=>value.length>max?value.slice(0,max-1)+'…':value;
function fieldsChanged(before:object,after:object) {
  const a=before as Record<string,unknown>,b=after as Record<string,unknown>;
  return [...new Set([...Object.keys(a),...Object.keys(b)])].filter(key=>key!=='id'&&!same(a[key],b[key]));
}
type Named={id:string;name:string};
function collectionChanges(area:ActivityArea,before:Named[],after:Named[]) {
  const old=new Map(before.map(item=>[item.id,item])),next=new Map(after.map(item=>[item.id,item]));
  return [...new Set([...old.keys(),...next.keys()])].flatMap(id=>{
    const a=old.get(id),b=next.get(id),fields=a&&b?fieldsChanged(a,b):[];
    if(a&&b&&!fields.length) return [];
    const item=(b??a)!;
    const date='date' in item&&typeof item.date==='string'?item.date:undefined;
    const change:ActivityChange={area,action:!a?'create':!b?'delete':'update',label:short(item.name),fields:fields.slice(0,8),...(date?{date}:{})};
    return [{id,change}];
  });
}

export function tripChanges(before:Trip|undefined,after:Trip,actorId:string):ActivityChange[] {
  if(!before) return [{area:'trip',action:'create',label:short(after.name),fields:[]}];
  const changes:ActivityChange[]=[],tripFields=['name','region','start','end','destination'] as const;
  const changed=tripFields.filter(field=>!same(before[field],after[field]));
  if(changed.length) changes.push({area:'trip',action:'update',label:short(after.name),fields:changed});
  const reservations=collectionChanges('reservation',before.reservations??[],after.reservations??[]);
  changes.push(...reservations.map(item=>item.change));
  const changedReservations=new Set(reservations.map(item=>item.id));
  const oldStops=new Map(before.stops.map(item=>[item.id,item])),nextStops=new Map(after.stops.map(item=>[item.id,item]));
  const oldSaved=new Map((before.savedPlaces??[]).map(item=>[item.id,item])),nextSaved=new Map((after.savedPlaces??[]).map(item=>[item.id,item]));
  const moved=new Set([...oldSaved.keys()].filter(id=>!nextSaved.has(id)&&!oldStops.has(id)&&nextStops.has(id)));
  for(const id of moved) {const stop=nextStops.get(id)!;changes.push({area:'saved',action:'move',label:short(stop.name),fields:[],date:stop.date});}
  for(const {id,change} of collectionChanges('stop',before.stops,after.stops)) {
    const a=oldStops.get(id),b=nextStops.get(id);
    const linked=[a?.flightReservationId,b?.flightReservationId,a?.stayReservation?.id,b?.stayReservation?.id];
    if(!moved.has(id)&&!linked.some(id=>id&&changedReservations.has(id))) changes.push(change);
  }
  for(const {id,change} of collectionChanges('saved',before.savedPlaces??[],after.savedPlaces??[])) if(!moved.has(id)) changes.push(change);
  const oldOrders=new Map<string,string[]>(),nextOrders=new Map<string,string[]>();
  for(const stop of before.stops) if(nextStops.get(stop.id)?.date===stop.date) oldOrders.set(stop.date,[...(oldOrders.get(stop.date)??[]),stop.id]);
  for(const stop of after.stops) if(oldStops.get(stop.id)?.date===stop.date) nextOrders.set(stop.date,[...(nextOrders.get(stop.date)??[]),stop.id]);
  for(const [date,ids] of oldOrders) if(ids.length>1&&!same(ids,nextOrders.get(date))) changes.push({area:'stop',action:'reorder',label:'일정 순서',fields:[],date});
  for(const {id,change} of collectionChanges('packing',before.packingItems??[],after.packingItems??[])) {
    if(change.action==='update'&&!change.fields.includes('name')) {
      const item=after.packingItems!.find(item=>item.id===id)!;
      change.action=(item.completedBy?item.completedBy.includes(actorId):item.completed)?'check':'uncheck';change.fields=[];
    }
    changes.push(change);
  }
  changes.push(...collectionChanges('expense',before.expenses??[],after.expenses??[]).map(item=>item.change));
  return changes;
}

/** Use the latest transaction snapshot for history; never trust a stale editor's log. */
export function recordTripActivity(before:Trip|undefined,after:Trip,stamp:Omit<TripActivity,'changes'|'more'>):Trip {
  const history=before?.activityLog??[],changes=tripChanges(before,after,stamp.actorId);
  if(!changes.length||history.some(entry=>entry.id===stamp.id)) return {...after,activityLog:history};
  const entry:TripActivity={...stamp,actorName:short(stamp.actorName,60),changes:changes.slice(0,CHANGE_LIMIT),more:Math.max(0,changes.length-CHANGE_LIMIT)};
  return {...after,activityLog:[entry,...history].slice(0,ACTIVITY_LIMIT)};
}

export function activityLabel(change:ActivityChange) {
  const area:Record<string,string>={trip:'여행',stop:'일정',saved:'보관함',reservation:'예약',packing:'준비물',expense:'지출'};
  const action:Record<string,string>={create:'추가',update:'수정',delete:'삭제',reorder:'순서 변경',check:'준비 완료',uncheck:'준비 해제',move:'일정으로 이동'};
  return area[change.area]+' '+action[change.action];
}
export function activityFields(change:ActivityChange) {
  const labels:Record<string,string>={name:'이름',region:'여행지',start:'시작일',end:'종료일',destination:'여행지',date:'날짜',time:'시간',category:'분류',memo:'메모',address:'주소',lat:'위치',lng:'위치',mapUrl:'지도 링크',photoUrl:'사진',departure:'출발',arrival:'도착',departureAirport:'출발 공항',arrivalAirport:'도착 공항',checkIn:'체크인',checkOut:'체크아웃',direction:'항공편 방향',kind:'예약 종류',currency:'통화',amount:'금액',paidBy:'결제자',recordOnly:'단순 기록 여부',shared:'공동 지출 여부',flightReservationId:'연결 예약',stayReservation:'연결 예약'};
  return [...new Set(change.fields.map(field=>labels[field]).filter(Boolean))].join(' · ');
}
