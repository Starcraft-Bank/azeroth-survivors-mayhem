/* Configurable host-awarded XP and gold. Does not modify existing balances. */
(() => {
 'use strict';
 function factor(kind,s,minutes){
  if(!s[kind+'ScalingEnabled'])return 1;
  const m=Number.isFinite(minutes)?Math.max(0,minutes):0;
  return Math.min(s[kind+'CapPercent'],s[kind+'BasePercent']+m*s[kind+'GrowthPercent'])/100;
 }
 globalThis.MAYHEM_INCOME={factor,setup({profile,base,getRun,getSettings,time,guarded}){
  const p=profile.income;let awards=0,calls=0,skipped=0,last=null;
  if(p)Interceptor.attach(base.add(p.xpAward),{onEnter(a){guarded(()=>{
   calls++;const r=getRun();if(!r||r.isNull()||!r.equals(a[0])){skipped++;return;}
   const s=getSettings(),amount=a[1].toUInt32(),multiplier=factor('xp',s,time(r)/60);
   const current=r.add(p.xpOffset).readU32();
   const value=Math.min(0xffffffff-current,Math.floor(amount*multiplier));
   a[1]=ptr(value);awards++;last={native:amount,scaled:value,factor:multiplier};
  });}});
  return {status:()=>({supported:!!p,calls,skipped,awards,last}),reset(){awards=0;calls=0;skipped=0;last=null;}};
 }};
})();
