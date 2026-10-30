/* Optional native affix selection and bounded Mayhem challenge/reward pairs. */
(() => {
 'use strict';
 const names=['Bolstering','Sanguine','Explosive'];
 globalThis.MAYHEM_AFFIXES={setup(api){
  const {profile,base,allocate,deallocate,getSettings,time,enemies,guid,alive,isBoss,enemyPosition,notice,guarded}=api;
  const layout=profile.nativeAffixes,tracked=new Map(),pending=[];
  let owner='',last=-1,original=null,managed=false,active=[],nativeRank=0,nativeError='',next=0,lastKind=0,lastMask=0,wasEnabled=false;
  let pulses=0,echoes=0,hunts=0,rewards=0,changes=0,sequence=0;
  const tiers=[.75,1,1.35,1.7];
  function enabled(){return getSettings().affixesEnabled===1;}
  function readNative(r){
   const n=r.add(layout.length).readU64().toNumber(),cap=r.add(layout.capacity).readU64().toNumber(),p=r.add(layout.pointer).readPointer();
   if(n>3||cap<n||cap>64||(!p||p.isNull()))throw Error('Unexpected native affix vector; affix editing stopped.');
   const values=Array.from(new Uint8Array(p.readByteArray(n)));
   if(values.some(v=>v>2)||new Set(values).size!==values.length)throw Error('Unexpected native affix IDs; affix editing stopped.');
   return {values,p,cap};
  }
  function writeNative(r,values){
   const old=readNative(r);if(old.values.join(',')===values.join(','))return;
   // Native pool expiry is skipped when the affix list is empty. Remove both
   // replicated world objects and UI telegraphs before removing Sanguine.
   if(old.values.includes(1)&&!values.includes(1)&&layout.pools){
    const pool=layout.pools,n=r.add(pool.length).readU64().toNumber(),cap=r.add(pool.capacity).readU64().toNumber(),p=r.add(pool.pointer).readPointer();
    if(n>cap||n>4096||n&&p.isNull())throw Error('Unexpected native Sanguine pool vector.');
    if(n&&(!api.appendMessage||!api.enqueueUi))throw Error('Native pool cleanup is unavailable; Sanguine was left unchanged.');
    for(let i=0;i<n;i++){
     const row=p.add(i*32),id=row.readU64();
     if(id.toString()!=='0'){
      const bytes=allocate(32,1);if(bytes.isNull())throw Error('Unable to allocate native pool cleanup.');bytes.writeU64(id);
      const packet=Memory.alloc(32);packet.writeU64(32);packet.add(8).writePointer(bytes);packet.add(16).writeU64(8);packet.add(24).writeU32(170);api.appendMessage(r,packet);
     }
     api.enqueueUi(r,JSON.stringify({type:'hzend',id:row.add(8).readU32()}));
    }
    r.add(pool.length).writeU64(0);
   }
   const p=values.length?allocate(values.length,1):ptr(1);
   if(p.isNull())throw Error('Unable to allocate native affix selection.');
   if(values.length)p.writeByteArray(values);
   // The game's Vec owns native-allocator memory, never a Frida allocation.
   r.add(layout.capacity).writeU64(values.length);r.add(layout.pointer).writePointer(p);r.add(layout.length).writeU64(values.length);
   if(old.cap)deallocate(old.p,old.cap,1);changes++;
  }
  function nativeTick(r){
   if(!layout)return;
   const current=readNative(r);nativeRank=r.add(layout.heroic).readU8();
   if(nativeRank>5)throw Error('Unexpected native Heroic rank; affix editing stopped.');
   const s=getSettings(),mode=s.nativeAffixMode||0;
   if(mode===0){
    if(managed){writeNative(r,original);active=original.slice();managed=false;original=null;}
    else active=current.values.slice();
    return;
   }
   if(!managed){original=current.values.slice();managed=true;}
   const wanted=mode===1?[]:names.map((_,i)=>i).filter(i=>(s.nativeAffixMask||0)&(1<<i));
   writeNative(r,wanted);active=wanted;
  }
  function reset(r,t){owner=String(r);last=t;original=null;managed=false;active=[];nativeError='';tracked.clear();pending.length=0;next=t+getSettings().affixInterval;lastKind=0;wasEnabled=false;lastMask=0;sequence=0;pulses=0;echoes=0;hunts=0;rewards=0;changes=0;}
  function bounty(r,position,chest=false){
   const s=getSettings(),factor=tiers[s.affixPreset??1]*(1+(s.affixBonusPercent??25)/100);
   const amount={gold:Math.min(100000,Math.ceil((60+time(r)*.12)*factor)),xp:Math.min(100000,Math.ceil((30+time(r)*.06)*factor)),chest,powerup:!chest};
   if(api.bounty(r,position,amount)!==false){rewards++;return true;}return false;
  }
  function getTracked(r,id){const v=enemies(r);for(let i=0;i<v.n;i++){const e=v.p.add(i*profile.enemyStride);if(guid(e)===id)return e;}return null;}
  const listener=Interceptor.attach(base.add(profile.functions.enemyDamage),{
   onEnter(a){this.id=a[1].toString().replace(/^0x/,'');this.r=a[0];this.hunt=enabled()&&owner===String(this.r)&&tracked.get(this.id);},
   onLeave(){if(!this.hunt)return;guarded(()=>{
    if(!enabled()||owner!==String(this.r)||!tracked.has(this.id))return;
    const e=getTracked(this.r,this.id);if(e&&alive(e))return;
    tracked.delete(this.id);bounty(this.r,this.hunt.position,true);notice('Nemesis defeated — bonus chest and bounty!',2);
   });}
  });
  function challenge(r,t,kind){
   const tier=getSettings().affixPreset??1;
   if(kind===1){
    if(!api.burst(r,{count:3+tier,damagePercent:[75,100,125,150][tier],pattern:2,position:null}))return false;
    pulses++;notice('Rift Pulse — dodge the rings, then collect your bounty!',2);
    if(pending.length<16)pending.push({at:t+3,type:'reward',position:null,owner});return true;
   }
   if(kind===3){
    if(tracked.size>=2)return false;
    const before=enemies(r),seen=new Set();for(let i=0;i<before.n;i++)seen.add(guid(before.p.add(i*profile.enemyStride)));
    if(!api.hunt(r))return false;
    const after=enemies(r);let added=false;
    for(let i=0;i<after.n&&tracked.size<2;i++){const e=after.p.add(i*profile.enemyStride),id=guid(e);if(!seen.has(id)&&alive(e)&&!isBoss(e)){tracked.set(id,{position:enemyPosition(r,e),owner});added=true;}}
    if(added){hunts++;notice('Nemesis Hunt — defeat the foreign rare for a bonus chest!',2);}return added;
   }
   return false;
  }
  return {
   tick(r){
    const t=time(r),s=getSettings();if(owner!==String(r)||t+.5<last)reset(r,t);last=t;
    try{nativeTick(r);nativeError='';}catch(e){
     const message=String(e.message||e);active=[];
     if(message!==nativeError&&(managed||s.nativeAffixMode))notice('Native affix controls unavailable — other Mayhem features remain active.',2);
     nativeError=message;
    }
    if(!enabled()){pending.length=0;tracked.clear();next=t+s.affixInterval;wasEnabled=false;return;}
    const mask=s.affixMask??7;
    if(!wasEnabled||mask!==lastMask){next=t+s.affixInterval;wasEnabled=true;lastMask=mask;}
    for(let i=pending.length-1;i>=0;i--){const item=pending[i];if(item.owner!==owner){pending.splice(i,1);continue;}if(t<item.at)continue;
     pending.splice(i,1);if(item.type==='reward'){bounty(r,item.position,item.chest);continue;}
     if((mask&2)&&api.burst(r,{count:4+(s.affixPreset??1)*2,damagePercent:[75,100,125,150][s.affixPreset??1],pattern:2,position:item.position})){
      echoes++;if(pending.length<16)pending.push({at:t+3,type:'reward',position:item.position,chest:true,owner});
     }
    }
    if(t<next)return;
    const pool=[1,3].filter(k=>mask&(1<<(k-1)));if(pool.length>1&&pool.includes(lastKind))pool.splice(pool.indexOf(lastKind),1);
    const kind=pool[sequence++%Math.max(1,pool.length)];next=t+s.affixInterval;
    if(kind&&challenge(r,t,kind))lastKind=kind;
   },
   bossDied(r,id,position){
    if(!enabled()||!(getSettings().affixMask&2)||!position||pending.length>=16||owner!==String(r))return;
    // Each boss death is already deduplicated by the core's GUID registry.
    pending.push({at:time(r)+.1,type:'echo',position:[...position],owner});
    notice('Death Echo — leave the boss corpse, then claim its chest!',2);
   },
   onTravel(){tracked.clear();pending.length=0;},
   status(){return {supported:!!layout&&!nativeError,nativeRank,nativeError,nativeAffixes:active.map(i=>names[i]),nativeMode:getSettings().nativeAffixMode||0,
    nativeChanges:changes,enabled:enabled(),next,pulses,echoes,hunts,trackedHunts:tracked.size,rewards,pending:pending.length,
    nativeNote:nativeError|| (layout?'Native Heroic rank and its progression rewards are preserved.':'Native affix controls are unavailable for this adapter.')};}
  };
 }};
})();
