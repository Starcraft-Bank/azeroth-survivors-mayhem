/* Native population budget, living-enemy cap and reversible movement tuning. */
(() => {
 'use strict';
 function capFor(native,density,reserved=0){
  const configured=Math.min(500,Math.max(1,Math.floor(native*density))),slots=Math.min(configured,2,Math.max(0,Math.floor(Number.isFinite(reserved)?reserved:0)));
  return {configured,reserved:slots,cap:configured-slots};
 }
 globalThis.MAYHEM_POPULATION={capFor,setup(api){
  const {base,profile,F,E,getRun,getSettings,time,enemies,isBoss,guid,alive,guarded,notice}=api,p=profile.population;
  if(!p)return {tick(){},reset(){},configure(){},status:()=>({supported:false})};
  const movement=new Map(),budgets=new Map(),listeners=[];
  let owner='',lastClock=-1,nextSpeed=0,hasteWasEnabled=false,hasteActive=false,nextHaste=0,hasteUntil=0;
  let budgetTicks=0,densityChecks=0,lastNativeCap=0,lastAdjustedCap=0,lastEffectiveCap=0,lastReservedSlots=0,lastBudgetGain=0,lastAdjustedGain=0,hasteStarts=0;
  const percent=(key,lo,hi,fallback=100)=>Math.min(hi,Math.max(lo,Number(getSettings()[key]??fallback)))/100;
  function active(r){const current=getRun();return current&&!current.isNull()&&current.equals(r)&&r.add(r.add(F(0xc9d)).readU8()?F(0xca3):F(0xca2)).readU8()===1;}
  function reset(){movement.clear();budgets.clear();owner='';lastClock=-1;nextSpeed=0;hasteWasEnabled=false;hasteActive=false;nextHaste=0;hasteUntil=0;hasteStarts=0;}
  function prepare(r){const t=time(r);if(owner!==String(r)||t<lastClock-1){reset();owner=String(r);}lastClock=t;return t;}
  // Scale the budget increment, not the accumulated balance, so repeated frames
  // never compound stored spawn credit. The scheduler still chooses native mobs.
  listeners.push(AZS_HOOKS.attach(base.add(p.spawnBudgetBefore),function(){guarded(()=>{
   const r=this.context[p.budgetRunRegister];if(!active(r))return;
   const value=r.add(p.spawnBudgetOffset).readFloat();if(!Number.isFinite(value)||value<0)return;
   budgets.set(this.threadId,{r,value});
  });}));
  listeners.push(AZS_HOOKS.attach(base.add(p.spawnBudgetAfter),function(){guarded(()=>{
   const previous=budgets.get(this.threadId);budgets.delete(this.threadId);
   if(!previous||!previous.r.equals(this.context[p.budgetRunRegister])||!active(previous.r))return;
   const address=previous.r.add(p.spawnBudgetOffset),value=address.readFloat(),gain=value-previous.value;
   if(!Number.isFinite(gain)||gain<0||gain>100000)return;
   const scaled=gain*percent('spawnRatePercent',25,300);address.writeFloat(Math.min(1000000,previous.value+scaled));
   budgetTicks++;lastBudgetGain=gain;lastAdjustedGain=scaled;
  });}));
  listeners.push(AZS_HOOKS.attach(base.add(p.mobCapCompare),function(){guarded(()=>{
   const r=this.context.rsi;if(!active(r))return;
   const native=this.context.rax.toUInt32();if(native<1||native>10000)return;
   // Pending Fission children claim existing capacity before ordinary refill.
   // Their scoped constructor bypasses this reservation, never the actual cap.
   const cap=capFor(native,percent('mobDensityPercent',25,300),api.reservedSlots?.()||0);
   this.context.rax=ptr(cap.cap);densityChecks++;lastNativeCap=native;lastAdjustedCap=cap.configured;lastEffectiveCap=cap.cap;lastReservedSlots=cap.reserved;
  });}));
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
    const id=guid(e);seen.add(id);const address=e.add(E(0x16c)),value=address.readFloat();
    if(!Number.isFinite(value)||value<=0||value>1000)continue;
    const previous=movement.get(id),natural=previous?(previous.applied===value?previous.natural:value/(previous.multiplier||1)):value;
    const modifier=api.extraSpeed?api.extraSpeed(e):1;
    const multiplier=percent(isBoss(e)?'bossSpeedPercent':'mobSpeedPercent',50,300)*boost*(typeof modifier==='number'&&Number.isFinite(modifier)&&modifier>0?modifier:1);
    const applied=Math.fround(Math.min(60,Math.max(.05,natural*multiplier)));
    if(value!==applied)address.writeFloat(applied);
    movement.set(id,{natural,applied,multiplier});
   }
   for(const id of movement.keys())if(!seen.has(id))movement.delete(id);
  }
  function tick(r){if(!active(r))return;const t=prepare(r);updateHaste(t);if(t>=nextSpeed){nextSpeed=t+.1;applyMovement(r);}}
  function configure(){nextSpeed=0;}
  function status(){return {supported:true,hasteEnabled:getSettings().hasteEnabled===1,hasteActive,hasteUntil,nextHaste,hasteStarts,
   mobSpeedPercent:getSettings().mobSpeedPercent,bossSpeedPercent:getSettings().bossSpeedPercent,
   spawnRatePercent:getSettings().spawnRatePercent,mobDensityPercent:getSettings().mobDensityPercent,
   budgetTicks,densityChecks,lastNativeCap,lastAdjustedCap,lastEffectiveCap,lastReservedSlots,lastBudgetGain,lastAdjustedGain,trackedEnemies:movement.size};}
  return {tick,reset,configure,status};
 }};
})();
