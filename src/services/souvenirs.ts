import type { SouvenirItem, Trip } from '../types';
export const souvenirLimit=200;
export function isSouvenirItem(value:unknown):value is SouvenirItem {
  if(!value||typeof value!=='object') return false;
  const item=value as SouvenirItem;
  return typeof item.id==='string'&&!!item.id.trim()&&item.id.length<=128
    &&typeof item.name==='string'&&!!item.name.trim()&&item.name.length<=150
    &&typeof item.recipient==='string'&&item.recipient.length<=100
    &&Number.isInteger(item.quantity)&&item.quantity>=1&&item.quantity<=999
    &&typeof item.memo==='string'&&item.memo.length<=1000&&typeof item.purchased==='boolean';
}
export function saveSouvenir(trip:Trip,item:SouvenirItem):Trip {
  const clean={...item,name:item.name.trim(),recipient:item.recipient.trim(),memo:item.memo.trim()};
  if(!isSouvenirItem(clean)) throw new Error('기념품 이름과 수량(1~999개)을 확인해 주세요.');
  const items=trip.souvenirs??[],exists=items.some(entry=>entry.id===item.id);
  if(!exists&&items.length>=souvenirLimit) throw new Error('기념품은 여행당 200개까지 등록할 수 있어요.');
  return {...trip,souvenirs:exists?items.map(entry=>entry.id===item.id?clean:entry):[...items,clean]};
}
