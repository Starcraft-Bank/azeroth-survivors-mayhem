/* Native population budget, living-enemy cap and reversible movement tuning. */
(() => {
 'use strict';
 function capFor(native,density,fissionEnabled=false){
  const configured=Math.min(500,Math.max(1,Math.floor(native*density)));
  return {configured,cap:fissionEnabled===true?null:configured,bypass:fissionEnabled===true};
 }
 globalThis.MAYHEM_POPULATION={capFor,setup(api){
  const {base,profile,F,E,getRun,getSettings,time,enemies,isBoss,guid,alive,guarded,notice}=api,p=profile.population;
  if(!p)return {tick(){},reset(){},configure(){},status:()=>({supported:false})};
  const movement=new Map(),budgets=new Map(),listeners=[];
  let owner='',lastClock=-1,nextSpeed=0,hasteWasEnabled=false,hasteActive=false,nextHaste=0,hasteUntil=0;
  let budgetTicks=0,lastBudgetGain=0,lastAdjustedGain=0,hasteStarts=0;
  const percent=(key,lo,hi,fallback=100)=>Math.min(hi,Math.max(lo,Number(getSettings()[key]??fallback)))/100;
  function active(r){const current=getRun();return current&&!current.isNull()&&current.equals(r)&&r.add(r.add(F(0xc9d)).readU8()?F(0xca3):F(0xca2)).readU8()===1;}
  function reset(){capState.writeByteArray(new Uint8Array(24));movement.clear();budgets.clear();owner='';lastClock=-1;nextSpeed=0;hasteWasEnabled=false;hasteActive=false;nextHaste=0;hasteUntil=0;hasteStarts=0;}
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
  // Native detour: nested runTick listeners are suppressed by Frida. Override
  // Fission enables uncapped ordinary arrivals and offspring for this Run and
  // game thread. Disabled mode retains configured density. Preserve registers and
  // flags except RAX, then execute the original relocated cap comparison.
  const capState=Memory.alloc(72),capCode=Memory.alloc(Process.pageSize);capState.writeByteArray(new Uint8Array(72));
  const originalCap=AZS_HOOKS.replaceFast(base.add(p.mobCapCompare),capCode);
  Memory.patchCode(capCode,1024,code=>{
   const w=new X86Writer(code,{pc:capCode}),branch=(condition,label)=>w.putJccNearLabel(condition,label,'no-hint');
   w.putPushfx();for(const reg of ['rcx','rdx','r11'])w.putPushReg(reg);
   w.putMovRegAddress('r11',capState);w.putCmpRegOffsetPtrReg('r11',0,'rsi');branch('jne','tail');
   w.putMovRegOffsetPtrReg('r11',48,'rax');
   w.putCmpRegOffsetPtrReg('r11',8,'rsi');branch('jne','limited');
   w.putMovRegGsU32Ptr('rcx',0x48); // Windows x64 TEB.ClientId.UniqueThread
   w.putCmpRegOffsetPtrReg('r11',16,'rcx');branch('je','unlimited');w.putLabel('limited');
   w.putCmpRegI32('rax',1);branch('jb','tail');w.putCmpRegI32('rax',10000);branch('ja','tail');
   w.putMovRegOffsetPtrReg('r11',48,'rax');
   w.putMovRegRegOffsetPtr('rcx','r11',24);w.putBytes([0x48,0xf7,0xe1]); // mul rcx
   w.putMovRegU32('ecx',100);w.putBytes([0x48,0xf7,0xf1]); // div rcx
   w.putCmpRegI32('rax',1);branch('jae','minimum');w.putMovRegU32('eax',1);w.putLabel('minimum');
   w.putCmpRegI32('rax',500);branch('jbe','maximum');w.putMovRegU32('eax',500);w.putLabel('maximum');
   w.putMovRegOffsetPtrReg('r11',56,'rax');
   w.putJmpNearLabel('record');w.putLabel('unlimited');
   w.putMovRegU64('rax',uint64('0xffffffffffffffff'));
   w.putMovRegRegOffsetPtr('rcx','r11',40);w.putIncReg('rcx');w.putMovRegOffsetPtrReg('r11',40,'rcx');
   w.putLabel('record');w.putMovRegOffsetPtrReg('r11',64,'rax');
   w.putMovRegRegOffsetPtr('rcx','r11',32);w.putIncReg('rcx');w.putMovRegOffsetPtrReg('r11',32,'rcx');
   w.putLabel('tail');for(const reg of ['r11','rdx','rcx'])w.putPopReg(reg);w.putPopfx();w.putJmpAddress(originalCap);w.flush();
  });
  function uncapped(){const s=getSettings();return s.runAffixesEnabled===1&&!!(s.runAffixMask&32);}
  function updateCap(){const r=getRun(),current=r&&active(r)?r:ptr(0);capState.add(24).writeU64(Math.round(percent('mobDensityPercent',25,300)*100));capState.writePointer(current);capState.add(8).writePointer(uncapped()?current:ptr(0));}
  function withFission(r,fn){if(!active(r)||!uncapped())return false;updateCap();return fn();}
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
  function tick(r){if(!active(r)){updateCap();return;}const t=prepare(r);capState.add(16).writeU64(Process.getCurrentThreadId());updateCap();updateHaste(t);if(t>=nextSpeed){nextSpeed=t+.1;applyMovement(r);}}
  function configure(){nextSpeed=0;updateCap();}
  function status(){return {supported:true,hasteEnabled:getSettings().hasteEnabled===1,hasteActive,hasteUntil,nextHaste,hasteStarts,
   mobSpeedPercent:getSettings().mobSpeedPercent,bossSpeedPercent:getSettings().bossSpeedPercent,
   spawnRatePercent:getSettings().spawnRatePercent,mobDensityPercent:getSettings().mobDensityPercent,
   budgetTicks,densityChecks:capState.add(32).readU64().toNumber(),lastNativeCap:capState.add(48).readU64().toNumber(),lastAdjustedCap:capState.add(56).readU64().toNumber(),lastEffectiveCap:capState.add(64).readU64().equals(uint64('0xffffffffffffffff'))?null:capState.add(64).readU64().toNumber(),populationCapRemoved:uncapped(),fissionBypasses:capState.add(40).readU64().toNumber(),lastBudgetGain,lastAdjustedGain,trackedEnemies:movement.size};}
  return {tick,reset,configure,status,withFission,_nativeResources:[capCode,capState,originalCap]};
 }};
})();
