/* Persistent encounter modifiers. All native ownership remains with the game. */
(() => {
 'use strict';
 const TIERS=[.75,1,1.25,1.5],NAMES=['Pack Tactics','Blood Frenzy','Revenant Legion','Nemesis Bond','Soul Debt'];
 function createModel(getSettings,random=Math.random){
  let rows=new Map(),neighbours=new Map(),pairs=new Map(),enraged=new Set(),revenants=new Set(),processed=new Set(),debt=0,epoch=0;
  let counts={prevented:0,frenzied:0,revived:0,bonds:0,enrages:0,payouts:0};
  const on=bit=>getSettings().runAffixesEnabled===1&&!!(getSettings().runAffixMask&(1<<bit));
  const tier=bit=>TIERS[getSettings()[['packPreset','frenzyPreset','revenantPreset','bondPreset','debtPreset'][bit]]??getSettings().runAffixPreset??1];
  function reset(){rows.clear();neighbours.clear();pairs.clear();enraged.clear();revenants.clear();processed.clear();debt=0;epoch++;counts={prevented:0,frenzied:0,revived:0,bonds:0,enrages:0,payouts:0};}
  function update(input){
   input=input.filter(x=>x.combatant!==false||x.boss);rows=new Map(input.map(x=>[x.id,x]));neighbours.clear();
   if(!getSettings().runAffixesEnabled){debt=0;pairs.clear();enraged.clear();return;}
   if(!on(3)){pairs.clear();enraged.clear();}if(!on(4))debt=0;
   for(const id of revenants)if(!rows.has(id))revenants.delete(id);
   for(const id of pairs.keys())if(!rows.has(id))pairs.delete(id);
   for(const id of enraged)if(!rows.has(id))enraged.delete(id);
   counts.frenzied=0;for(const row of rows.values())if(frenzy(row))counts.frenzied++;
   if(!on(0))return;
   const radius=getSettings().packRadius||12,buckets=new Map();
   for(const row of input){const cell=Math.floor(row.position[0]/radius)+':'+Math.floor(row.position[1]/radius);if(!buckets.has(cell))buckets.set(cell,[]);buckets.get(cell).push(row);}
   for(const row of input){let n=0;const x=Math.floor(row.position[0]/radius),y=Math.floor(row.position[1]/radius);
    outer:for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const other of buckets.get((x+dx)+':'+(y+dy))||[]){
     if(other.id===row.id)continue;const distance=(row.position[0]-other.position[0])**2+(row.position[1]-other.position[1])**2;
     if(distance<=radius*radius&&++n>=6)break outer;
    }neighbours.set(row.id,n);
   }
  }
  function frenzy(row){return on(1)&&row&&row.max>0&&row.hp>0&&row.hp/row.max*100<=getSettings().frenzyThreshold;}
  function incoming(id,amount){if(!on(0)||!Number.isFinite(amount)||amount<=0)return amount;
   const reduction=Math.min(.6,(neighbours.get(id)||0)*getSettings().packReduction/100*tier(0));if(reduction>0)counts.prevented++;
   return amount*(1-reduction);
  }
  function damage(id){let multiplier=1;if(frenzy(rows.get(id)))multiplier*=1+getSettings().frenzyBoost/100*tier(1);if(on(3)&&enraged.has(id))multiplier*=1+getSettings().bondRage/100*tier(3);if(on(4))multiplier*=1+debt/100;return multiplier;}
  function speed(id){let multiplier=1;if(frenzy(rows.get(id)))multiplier*=1+getSettings().frenzyBoost/100*tier(1);if(on(3)&&enraged.has(id))multiplier*=1+getSettings().bondRage/200*tier(3);return Math.min(4,multiplier);}
  function pair(ids){if(!on(3)||ids.length!==2||ids[0]===ids[1])return false;pairs.set(ids[0],ids[1]);pairs.set(ids[1],ids[0]);counts.bonds++;return true;}
  function kill(row){
   if(!row||processed.has(row.id))return [];processed.add(row.id);if(processed.size>8192)processed.delete(processed.values().next().value);
   rows.delete(row.id);neighbours.delete(row.id);const actions=[];
   if(!getSettings().runAffixesEnabled)return actions;
   const wasRevenant=revenants.delete(row.id);
   if(on(3)&&pairs.has(row.id)){const partner=pairs.get(row.id);pairs.delete(row.id);pairs.delete(partner);if(!processed.has(partner)){enraged.add(partner);counts.enrages++;actions.push({type:'rage',id:partner});}}
   if(row.boss){if(on(4)&&debt>0){actions.push({type:'bounty',position:row.position,gold:Math.ceil(debt*20),xp:Math.ceil(debt*10),chest:debt>=25,epoch});counts.payouts++;debt=0;}}
   else if(!wasRevenant&&row.combatant!==false){
    if(on(4))debt=Math.min(getSettings().debtCap,debt+getSettings().debtPerKill*tier(4));
    if(on(2)&&random()*100<Math.min(75,getSettings().revenantChance*tier(2)))actions.push({type:'revive',position:row.position,health:getSettings().revenantHealth/100,epoch});
   }else if(wasRevenant){actions.push({type:'bounty',position:row.position,gold:15,xp:10,chest:false,epoch});}
   return actions;
  }
  function revived(ids){for(const id of ids){revenants.add(id);counts.revived++;}}
  return {update,incoming,damage,speed,pair,kill,revived,reset,on,epoch:()=>epoch,status:()=>({enabled:getSettings().runAffixesEnabled===1,active:NAMES.filter((_,i)=>on(i)),debt,paired:pairs.size/2,revenants:revenants.size,...counts})};
 }
 globalThis.MAYHEM_RUN_AFFIXES={createModel,setup(api){
  const {profile,base,F,E,getRun,getSettings,time,enemies,isBoss,guid,alive,enemyPosition,guarded,notice}=api;
  const model=createModel(getSettings,api.random||Math.random),damageState=new Map(),queue=[];
  let owner='',last=-1,next=0,pointers=new Map(),vector='',length=-1,nextRevive=0;
  const address=base.add(profile.functions.enemyDamage),types=['pointer','uint64','float','uint32','uint32','uint32','uint32'];
  const original=new NativeFunction(address,'void',types,{traps:'all'});
  function index(r,force=false){const v=enemies(r);if(v.n>4096)throw Error('Run affixes require at most 4096 native enemies.');
   if(force||String(v.p)!==vector||v.n!==length){pointers.clear();for(let i=0;i<v.n;i++){const e=v.p.add(i*profile.enemyStride);pointers.set(guid(e),e);}vector=String(v.p);length=v.n;}return v;
  }
  function find(r,id){index(r);let e=pointers.get(id);if(e&&guid(e)===id)return e;index(r,true);return pointers.get(id)||null;}
  function record(r,e){const damage=e.add(E(0x168)).readFloat();return {id:guid(e),hp:e.add(E(0x160)).readFloat(),max:e.add(E(0x164)).readFloat(),boss:isBoss(e),combatant:Number.isFinite(damage)&&damage>0,position:enemyPosition(r,e)};}
  function enqueue(actions){for(const action of actions){if(action.type==='rage'){notice('Nemesis Bond — the surviving boss is enraged!',3);continue;}if(queue.length<32)queue.push(action);}}
  function killed(r,row){enqueue(model.kill(row));damageState.delete(row.id);}
  const replacement=new NativeCallback((r,id,amount,a,b,c,d)=>{
   let before=null,adjusted=amount;
   guarded(()=>{const current=getRun();if(!current||current.isNull()||!current.equals(r)||!getSettings().runAffixesEnabled)return;
    const e=find(r,id.toString(16));if(e&&alive(e)){before=record(r,e);adjusted=model.incoming(before.id,amount);}});
   original(r,id,adjusted,a,b,c,d);
   if(before)guarded(()=>{const e=find(r,before.id);if(!e||!alive(e))killed(r,before);});
  },'void',types);
  AZS_HOOKS.replace(address,replacement);
  function reset(){owner='';last=-1;next=0;nextRevive=0;vector='';length=-1;pointers.clear();damageState.clear();queue.length=0;model.reset();}
  function restore(r){const v=index(r,true);for(let i=0;i<v.n;i++){const e=v.p.add(i*profile.enemyStride),old=damageState.get(guid(e));if(old&&e.add(E(0x168)).readFloat()===old.applied)e.add(E(0x168)).writeFloat(old.natural);}damageState.clear();}
  function tick(r){const t=time(r);if(owner!==String(r)||t+.5<last){reset();owner=String(r);}last=t;if(t<next)return;next=t+.2;
   const v=index(r,true),input=[],seen=new Set();for(let i=0;i<v.n;i++){const e=v.p.add(i*profile.enemyStride);if(alive(e))input.push(record(r,e));}
   model.update(input);
   for(const row of input){const e=pointers.get(row.id),address=e.add(E(0x168)),value=address.readFloat(),old=damageState.get(row.id);seen.add(row.id);
    if(!Number.isFinite(value)||value<0)continue;const natural=old?(value===old.applied?old.natural:value/old.factor):value,factor=model.damage(row.id),applied=Math.fround(Math.min(1e24,natural*factor));
    if(value!==applied)address.writeFloat(applied);damageState.set(row.id,{natural,applied,factor});}
   for(const id of damageState.keys())if(!seen.has(id))damageState.delete(id);
   if(!getSettings().runAffixesEnabled){queue.length=0;return;}
   let budget=4;
   while(queue.length&&budget--){const item=queue[0];if(item.epoch!==model.epoch()){queue.shift();continue;}
    if(item.type==='revive'){
     if(!model.on(2)){queue.shift();continue;}if(t<nextRevive)break;nextRevive=t+.35;queue.shift();
     if(input.length>=500)continue;const ids=api.revive(r,item.position,item.health)||[];model.revived(ids);
    }else{queue.shift();if(api.bounty(r,item.position,item)!==false&&item.chest)notice('Soul Debt paid — claim your chest and bounty!',2);}
   }
  }
  return {tick,reset,configure(){next=0;},speed:e=>model.speed(guid(e)),wantsPair:()=>model.on(3),pair:ids=>model.pair(ids),
   bossDied(r,id,position){killed(r,{id,boss:true,position});},onTravel(){reset();},status:()=>({supported:true,...model.status(),pending:queue.length}),
   // Retain the native replacement, original and model for the script lifetime.
   retained:{original,replacement},restore};
 }};
})();
