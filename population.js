/* Boss movement and optional Stampede. Native mob population is untouched. */
(() => {
 'use strict';
 globalThis.MAYHEM_POPULATION={
  capFor(native){return {configured:native,cap:native};},
  setup(api){
   const {profile,F,E,getRun,getSettings,time,enemies,isBoss,guid,alive,notice}=api;
   const movement=new Map();
   let owner='',lastClock=-1,nextSpeed=0,hasteWasEnabled=false,hasteActive=false,hasteUntil=0,nextHaste=0,hasteStarts=0;
   const percent=(key,lo,hi,fallback=100)=>Math.min(hi,Math.max(lo,Number(getSettings()[key]??fallback)))/100;
   function active(r){const current=getRun();return current&&!current.isNull()&&current.equals(r)&&r.add(r.add(F(0xc9d)).readU8()?F(0xca3):F(0xca2)).readU8()===1;}
   function reset(){movement.clear();owner='';lastClock=-1;nextSpeed=0;hasteWasEnabled=false;hasteActive=false;hasteUntil=0;nextHaste=0;hasteStarts=0;}
   function updateHaste(t){
    const s=getSettings(),enabled=s.hasteEnabled===1;
    if(enabled&&!hasteWasEnabled){nextHaste=t+Math.max(1,s.hasteFirst);hasteActive=false;hasteUntil=0;}
    if(!enabled&&hasteActive&&notice)notice('Stampede ended — enemy movement restored.',2);
    if(!enabled){hasteActive=false;hasteUntil=0;nextHaste=0;}
    if(enabled&&hasteActive&&t>=hasteUntil){hasteActive=false;if(notice)notice('Stampede ended — enemy movement restored.',2);}
    if(enabled&&!hasteActive&&t>=nextHaste){
     hasteActive=true;hasteUntil=t+s.hasteDuration;nextHaste=t+s.hasteInterval;hasteStarts++;
     if(notice)notice('Stampede! Enemies move '+s.hasteSpeedPercent+'% speed for '+s.hasteDuration+' seconds.',3);
    }
    hasteWasEnabled=enabled;
   }
   function applyMovement(r){
    const v=enemies(r),seen=new Set(),boost=hasteActive?Math.min(3,1+(percent('hasteSpeedPercent',100,300)-1)*[.75,1,1.25,1.5][getSettings().hastePreset??1]):1;
    for(let i=0;i<v.n;i++){
     const e=v.p.add(i*profile.enemyStride);if(!alive(e))continue;
     const boss=isBoss(e),id=guid(e);
     if(!boss&&!hasteActive&&!movement.has(id))continue;
     seen.add(id);const address=e.add(E(0x16c)),value=address.readFloat();
     if(!Number.isFinite(value)||value<=0||value>1000)continue;
     const previous=movement.get(id),natural=previous?(previous.applied===value?previous.natural:value/(previous.multiplier||1)):value;
     const multiplier=(boss?percent('bossSpeedPercent',50,300):1)*boost;
     const applied=Math.fround(Math.min(60,Math.max(.05,natural*multiplier)));
     if(value!==applied)address.writeFloat(applied);
     if(multiplier!==1||previous)movement.set(id,{natural,applied,multiplier});
    }
    for(const id of movement.keys())if(!seen.has(id))movement.delete(id);
   }
   function tick(r){if(!active(r))return;const t=time(r);if(owner!==String(r)||t<lastClock-1){reset();owner=String(r);}lastClock=t;updateHaste(t);if(t>=nextSpeed){nextSpeed=t+.1;applyMovement(r);}}
   function configure(){nextSpeed=0;}
   function status(){return {supported:true,hasteEnabled:getSettings().hasteEnabled===1,hasteActive,hasteUntil,nextHaste,hasteStarts,bossSpeedPercent:getSettings().bossSpeedPercent,trackedEnemies:movement.size,nativePopulationUnchanged:true};}
   return {tick,reset,configure,status};
  }
 };
})();
