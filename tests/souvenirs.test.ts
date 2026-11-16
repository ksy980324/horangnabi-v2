import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SouvenirItem, Trip } from '../src/types';
import { parseDatabase } from '../src/data';
import { isSouvenirItem, saveSouvenir, souvenirLimit } from '../src/services/souvenirs';
import { activityLabel, recordTripActivity } from '../src/services/activityLog';
import { Souvenirs, SouvenirForm } from '../src/components/Souvenirs';
const trip:Trip={id:'trip',name:'여행',region:'요나고',start:'2026-11-16',end:'2026-11-18',stops:[]};
const item:SouvenirItem={id:'gift',name:'과자',recipient:'부모님',quantity:2,memo:'공항에서 구매',purchased:false};
const restore=(value:unknown)=>parseDatabase({version:1,trips:[value]}).trips[0];

test('souvenirs add and edit immutably, preserve unrelated trip data and enforce the limit only for additions',()=>{
  const original={...trip,expenses:[{id:'e',name:'점심',date:trip.start,currency:'KRW',amount:12000,paidBy:'a',shared:true}]};
  const added=saveSouvenir(original,{...item,name:' 과자 ',recipient:' 부모님 ',memo:' 공항에서 구매 '});
  assert.deepEqual(added.souvenirs,[item]);assert.equal(added.expenses,original.expenses);assert.equal(original.souvenirs,undefined);
  const edited=saveSouvenir(added,{...item,quantity:3,purchased:true});
  assert.equal(edited.souvenirs!.length,1);assert.equal(edited.souvenirs![0].quantity,3);assert.equal(added.souvenirs![0].purchased,false);
  const full={...trip,souvenirs:Array.from({length:souvenirLimit},(_,i)=>({...item,id:String(i)}))};
  assert.throws(()=>saveSouvenir(full,item),/200/);
  assert.equal(saveSouvenir(full,{...item,id:'0',purchased:true}).souvenirs?.length,souvenirLimit);
  assert.throws(()=>saveSouvenir(trip,{...item,quantity:1.5}));
});

test('old trips and souvenir backups round-trip; malformed quantities, fields, IDs and oversized lists fail validation',()=>{
  assert.equal(restore(trip).souvenirs,undefined);
  assert.deepEqual(restore(JSON.parse(JSON.stringify({...trip,souvenirs:[item]}))).souvenirs,[item]);
  for(const quantity of [0,-1,1.5,1000,NaN])assert.equal(isSouvenirItem({...item,quantity}),false);
  for(const bad of [{...item,name:' '},{...item,recipient:'a'.repeat(101)},{...item,memo:'a'.repeat(1001)},{...item,purchased:'true'}])assert.throws(()=>restore({...trip,souvenirs:[bad]}));
  assert.throws(()=>restore({...trip,souvenirs:[item,item]}));
  assert.throws(()=>restore({...trip,souvenirs:Array.from({length:201},(_,i)=>({...item,id:String(i)}))}));
});

test('souvenir activity identifies purchases by ID even with identical names and never copies memo contents',()=>{
  const stamp={id:'added',actorId:'a',actorName:'나비',at:Date.now()};
  const added=recordTripActivity(trip,saveSouvenir(trip,item),stamp);
  assert.equal(activityLabel(added.activityLog![0].changes[0]),'기념품 추가');
  const before={...added,souvenirs:[item,{...item,id:'second',purchased:true}]};
  const checked=recordTripActivity(before,saveSouvenir(before,{...item,purchased:true}),{...stamp,id:'checked'});
  assert.equal(activityLabel(checked.activityLog![0].changes[0]),'기념품 구매 완료');
  const unchecked=recordTripActivity(checked,saveSouvenir(checked,{...item,id:'second',purchased:false}),{...stamp,id:'unchecked'});
  assert.equal(activityLabel(unchecked.activityLog![0].changes[0]),'기념품 구매 해제');
  const edited=recordTripActivity(unchecked,saveSouvenir(unchecked,{...item,memo:'private secret'}),{...stamp,id:'edited'});
  assert.ok(!JSON.stringify(edited.activityLog).includes('private secret'));
  const removed=recordTripActivity(added,{...added,souvenirs:[]},{...stamp,id:'removed'});
  assert.equal(activityLabel(removed.activityLog![0].changes[0]),'기념품 삭제');
  restore(checked);
});

test('souvenir list renders progress, recipient, quantity and safe text; form preserves purchased state presentation',()=>{
  const props={items:[{...item,purchased:true,memo:'<script>bad</script>'}],busy:true,onAdd:()=>{},onEdit:()=>{},onDelete:()=>{},onCheck:()=>{}};
  const list=renderToStaticMarkup(createElement(Souvenirs,props));
  assert.ok(list.includes('1개 중 1개 구매 완료'));assert.ok(list.includes('부모님'));assert.ok(list.includes('2개'));assert.ok(list.includes('checked=""'));assert.ok(list.includes('disabled=""'));
  assert.ok(!list.includes('<script>'));assert.ok(list.includes('&lt;script&gt;'));
  const form=renderToStaticMarkup(createElement(SouvenirForm,{item,busy:false,onSave:()=>{},onClose:()=>{}}));
  for(const label of ['기념품 수정','기념품 이름','받을 사람','수량','메모'])assert.ok(form.includes(label));
});
