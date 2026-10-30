/* Legendary Mayhem native runtime. Exact supported executable only; host Run only. */
(() => {
  'use strict';
  const profile=globalThis.MAYHEM_NATIVE_PROFILE,base=Process.mainModule.base;
  const F=off=>profile.fieldOffsets?.['0x'+off.toString(16)]??off;
  const E=off=>profile.enemyOffsets?.['0x'+off.toString(16)]??off;
  const at=name=>base.add(profile.functions[name]);
  const native=(name,result,args)=>new NativeFunction(at(name),result,args,{traps:'all'});
  const spawnBoss=native('bossSpawn','void',profile.bossSpawnHpArgument?['pointer','pointer','float']:['pointer','pointer']);
  const spawnMob=native('mobSpawn','void',['pointer','uint64','pointer']);
  const cast=native('hazardCast','void',['pointer','uint64','pointer']);
  const keepFighting=native('keepFighting','void',['pointer']);
  const swapPlayer=native('partySwap','void',['pointer','pointer']);
  const flush=native('flushMessages','void',['pointer']);
  const reserveUi=native('reserveUi','void',['pointer']);
  const emitEvent=native('emitEvent','void',['pointer','pointer']);
  const makePacket=native('packetMessage','void',['pointer','pointer']);
  const setField=native('setField','void',['pointer','uint16','uint32']);
  const writeGuid=native('writeGuid','void',['uint64','pointer']);
  const writeFields=native('writeFields','void',['pointer','pointer']);
  const reserve=native('reserveMessages','void',['pointer']);
  const allocate=native('allocate','pointer',['uint64','uint64']);
  const deallocate=native('deallocate','void',['pointer','uint64','uint64']);
  const bannerEvent=Memory.alloc(72),bannerKind=Memory.allocUtf8String('boss');
  let deferredEvents=[];
  const NULL=ptr(0),nonePosition=Memory.alloc(16),message=Memory.alloc(32),packet=Memory.alloc(32);
  nonePosition.writeByteArray(new Uint8Array(16));
  const defs=[],zones=[];
  const readString=(p,n)=>p.isNull()||n>8192?'':p.readUtf8String(n);
  for(let z=0;z<profile.zoneCount;z++){
    const p=base.add(profile.zoneTable+z*profile.zoneStride),bosses=p.add(0x88).readPointer();
    const row={index:z,key:readString(p.add(8).readPointer(),p.add(16).readU64().toNumber()),
      name:readString(p.add(24).readPointer(),p.add(32).readU64().toNumber()),
      keyPointer:p.add(8).readPointer(),keyLength:p.add(16).readU64().toNumber(),
      creatureCount:p.add(0x80).readU64().toNumber(),bosses:[]};
    if(p.add(0x90).readU64().toNumber()!==5)throw Error('Unsupported native boss catalog');
    for(let j=0;j<5;j++){
      const def=bosses.add(j*profile.bossStride),entry={pointer:def,zone:z,index:j,
        name:readString(def.readPointer(),def.add(8).readU64().toNumber()),final:!!def.add(100).readU8()};
      row.bosses.push(entry);defs.push(entry);
    }
    zones.push(row);
  }
  const definitionSet=new Set(defs.map(d=>String(d.pointer)));
  const schema=globalThis.MAYHEM_SCHEMA;
  let settings={...Object.fromEntries(Object.entries(schema).map(([k,v])=>[k,v[0]])),...globalThis.MAYHEM_SETTINGS};
  let controls={waves:true,events:true,hazards:true,fireworks:true,autoEndless:true,autoMap:true};
  let game=NULL,run=NULL,fault='',lastStatus=0,inMode=false,mayhemSpawning=false,batch=null;
  let scope=[],leases=new Map(),bossRegistry=new Map(),camp=new Map(),announcements=[],scaled=new Set(),bossDefinitions=new Map(),livingBossIds=new Set(),deadBossIds=new Set();
  let state,rewards=null,effects=null,permanentRewards=null,travel=null,income=null,population=null,tempo=null,affixes=null;
  // Shuffle bags avoid a fixed sequence and repeats before a pool is exhausted.
  function shuffleBag(random=Math.random){
    let bag=[],last=null;
    return {reset(){bag=[];last=null;},take(pool,excluded=null){
      if(!bag.length){bag=[...pool];for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}}
      const allowed=value=>value!==excluded&&value!==last;
      if(!allowed(bag[bag.length-1])){const i=bag.findIndex(allowed);if(i>=0)[bag[i],bag[bag.length-1]]=[bag[bag.length-1],bag[i]];}
      // A remaining current map is consumed; it must never become a no-op transfer.
      let value=bag.pop();if(value===excluded)return this.take(pool,excluded);last=value;return value;
    }};
  }
  const mapBag=shuffleBag(),bossBag=shuffleBag(),finalBag=shuffleBag();
  const normalPool=defs.map((d,i)=>i).filter(i=>!defs[i].final),endlessPool=defs.map((d,i)=>i);
  function nextBoss(){const code=state.endless?finalBag.take(endlessPool,state.lastBossCode):bossBag.take(normalPool);state.lastBossCode=code;return code;}
  function rotateMap(r,t){
    if(!controls.autoMap||!travel?.status().supported)return false;
    if(t>=state.nextMap-10&&t<state.nextMap&&state.mapWarning!==state.nextMap){state.mapWarning=state.nextMap;notice('Map shift in '+Math.ceil(state.nextMap-t)+' seconds — collect your drops!',3);}
    if(t<state.nextMap||t<state.mapRetryAt||!travel.status().canTravel)return false;
    const destination=mapBag.take(zones.map(z=>z.index),zoneIndex(r));
    travel.request(zones[destination].key);
    state.mapRetryAt=t+5;return true;
  }
  function reset(){
    mapBag.reset();bossBag.reset();finalBag.reset();
    if(rewards?.reset)rewards.reset();if(effects?.reset)effects.reset();income?.reset();population?.reset();tempo?.reset();affixes?.onTravel();
    for(const item of deferredEvents)dropEvent(item.event);deferredEvents=[];
    state={clock:0,wave:0,nextMap:180,mapChanges:0,mapWarning:0,mapRetryAt:0,lastBoss:null,lastBossCode:-1,nextWave:settings.bossInterval,finalCursor:0,affix:0,endless:false,nextHazard:settings.hazardInterval,
      shapeNext:0,shapedBursts:0,stormNext:0,barrageUntil:0,barrageNext:0,event:0,eventUntil:0,nextEvent:settings.eventFirst,eventCount:0,
      lastEvent:0,killCount:0,hazardBursts:0,campBursts:0,cursor:0,noticeUntil:0,transitionAt:0,transitions:0,goldAwards:0,lastGold:null};
    scope=[];leases.clear();bossRegistry.clear();camp.clear();scaled.clear();bossDefinitions.clear();livingBossIds.clear();deadBossIds.clear();announcements=[];
    definitionSet.clear();for(const def of defs)definitionSet.add(String(def.pointer));
  }
  reset();
  const number=(p,off)=>p.add(off).readU64().toNumber();
  const time=r=>r.add(F(0xbf4)).readFloat();
  const phase=r=>r.add(r.equals(run)?F(0xca2):F(0x98c)).readU8();
  const alive=e=>e.add(E(0xb0)).readU32()===0&&e.add(E(0x160)).readFloat()>0;
  const hazardSource=e=>alive(e)&&Number.isFinite(e.add(E(0x168)).readFloat())&&e.add(E(0x168)).readFloat()>0;
  const isBoss=e=>definitionSet.has(String(e.add(E(0x30)).readPointer()))&&e.add(E(0x18)).readS64().toString()!=='-1';
  const guid=e=>e.add(E(0xf0)).readU64().toString(16);
  function enemies(r){const n=number(r,F(0x590)),p=r.add(F(0x588)).readPointer();if(n>100000)throw Error('Invalid native enemy vector');return {n,p};}
  function players(r){
    const result=[r],ids=new Set([r.add(F(0x488)).readU64().toString()]);
    const n=Math.min(63,number(r,F(0x998))),p=r.add(F(0x990)).readPointer();
    for(let i=0;i<n;i++){const player=p.add(i*profile.partyStride),id=player.add(F(0x488)).readU64().toString();
      if(!ids.has(id)){ids.add(id);result.push(player);}}
    return result.filter(p=>p.add(F(0x508)).readFloat()>0);
  }
  function zoneIndex(r){const key=readString(r.add(F(0x2b8)).readPointer(),number(r,F(0x2c0)));return zones.findIndex(z=>z.key===key);}
  function scales(r,extra=false){
    const m=time(r)/60,hp=Math.min(300,6+.8*m+.24*m*m)*[.25,.5,.75,1][settings.healthPreset];
    const easy=Math.min(3.5,1.1+.045*m),brutal=Math.min(10,1.8+.12*m+.004*m*m);
    let damage=[easy,(easy+brutal)/2,brutal,brutal*1.35][settings.damagePreset];
    let health=hp,speed=Math.min(1.45,1.05+.008*m),cooldown=Math.max(.3,1/(1.25+.035*m));
    if(state.affix===1){speed=Math.min(1.65,speed*1.12);cooldown=Math.max(.25,cooldown*.85);health=Math.max(1,health*.9);}
    if(state.affix===2){cooldown=Math.max(.25,cooldown*.7);health=Math.max(1,health*.9);}
    if(state.affix===3){health=Math.max(1,health*.8);damage=Math.max(1,damage*.9);}
    if(extra){health*=3;damage*=1.3;speed*=1.05;cooldown*=.8;}
    return {health,damage,speed,cooldown,mobHealth:Math.min(40,1.8+.12*m+.018*m*m),
      mobDamage:Math.min(5,1.15+.04*m+.001*m*m)*(state.event===3?1.35:1),
      mobSpeed:Math.min(1.3,1+.004*m)*(state.event===3?1.2:1),gold:MAYHEM_INCOME.factor('gold',settings,m)*(state.event===1?2:1),xp:MAYHEM_INCOME.factor('xp',settings,m)};
  }
  // All three native income paths, after bonuses/sharing and before both
  // balance and earned counters. Refunds, prices and old balances stay native.
  for(const site of profile.goldAwards)Interceptor.attach(base.add(site.rva),function(){guarded(()=>{
    if(fault)return;const r=this.context[site.runRegister],amount=this.context[site.amountRegister||'rax'].toUInt32();
    const scaledAmount=Math.min(0xffffffff-r.add(F(0x510)).readU32(),0xffffffff-r.add(F(0x7bc)).readU32(),Math.ceil(amount*scales(r).gold));
    this.context[site.amountRegister||'rax']=ptr(scaledAmount);
    state.goldAwards++;state.lastGold={native:amount,scaled:scaledAmount,factor:scales(r).gold};
  });});
  function dropEvent(event){for(const offset of [0,24]){const capacity=event.add(offset).readU64().toNumber();if(capacity)deallocate(event.add(offset+8).readPointer(),capacity,1);}}
  function appendMessage(r,out){
    let n=number(r,F(0x650));if(n>=number(r,F(0x640)))reserve(r.add(F(0x640)));
    r.add(F(0x648)).readPointer().add(n*32).writeByteArray(out.readByteArray(32));r.add(F(0x650)).writeU64(n+1);
  }
  function notice(text,priority=1){
    if(announcements.some(a=>a.text===text))return;
    announcements.push({text,priority,expires:state.clock+20});
    announcements.sort((a,b)=>b.priority-a.priority);if(announcements.length>12)announcements.length=12;
  }
  function releaseNotice(r){
    if(state.clock<state.noticeUntil)return;
    announcements=announcements.filter(a=>a.expires>=state.clock);const a=announcements.shift();
    if(!a){const pending=deferredEvents.shift();if(pending){emitEvent(pending.run,pending.event);state.noticeUntil=state.clock+3;}return;}
    const text=Memory.allocUtf8String(a.text),length=Array.from(a.text).reduce((n,c)=>n+(c.codePointAt(0)<128?1:c.codePointAt(0)<2048?2:c.codePointAt(0)<65536?3:4),0);
    const owned=allocate(length,1);if(owned.isNull())return;owned.writeByteArray(text.readByteArray(length));
    bannerEvent.writeByteArray(new Uint8Array(72));bannerEvent.writeU64(length);bannerEvent.add(8).writePointer(owned);bannerEvent.add(16).writeU64(length);
    bannerEvent.add(32).writePointer(ptr(1));bannerEvent.add(48).writePointer(bannerKind);bannerEvent.add(56).writeU64(4);bannerEvent.add(64).writeU8(1);
    emitEvent(r,bannerEvent);
    if(effects)effects.announcement(r,a.priority);
    state.noticeUntil=state.clock+4;
  }
  const eventReplacement=new NativeCallback((r,event)=>{
    try{
      const kind=readString(event.add(48).readPointer(),number(event,56));
      if(r.equals(run)&&!['death','defeat','disconnect','error'].includes(kind)&&state.clock<state.noticeUntil){
        const copy=Memory.alloc(72);copy.writeByteArray(event.readByteArray(72));deferredEvents.push({run:r,event:copy});
        if(deferredEvents.length>16)dropEvent(deferredEvents.shift().event);
        return;
      }
    }catch(e){fail(e);}
    emitEvent(r,event);
  },'void',['pointer','pointer']);
  Interceptor.replace(at('emitEvent'),eventReplacement);
  function syncHealth(r,e){
    const fields=Memory.alloc(24);fields.writeByteArray(new Uint8Array(24));
    setField(fields,22,Math.min(0xffffffff,Math.ceil(Math.max(0,e.add(E(0x160)).readFloat()))));
    setField(fields,28,Math.min(0xffffffff,Math.ceil(e.add(E(0x164)).readFloat())));
    const bytes=allocate(1,1);if(bytes.isNull())throw Error('Unable to allocate native health update');bytes.writeU8(0);
    packet.writeByteArray(new Uint8Array(32));packet.writeU64(1);packet.add(8).writePointer(bytes);packet.add(16).writeU64(1);packet.add(24).writeU32(1);
    writeGuid(e.add(E(0xf0)).readU64(),packet);writeFields(fields,packet);makePacket(message,packet);appendMessage(r,message);
  }
  function queueEndless(r){
    const text=Memory.allocUtf8String('{"type":"endless"}'),length=18,owned=allocate(length,1);
    if(owned.isNull())throw Error('Unable to allocate native endless event');
    owned.writeByteArray(text.readByteArray(length));let n=number(r,F(0x668));
    if(n>=number(r,F(0x658)))reserveUi(r.add(F(0x658)));
    const item=r.add(F(0x660)).readPointer().add(n*24);item.writeU64(length);item.add(8).writePointer(owned);item.add(16).writeU64(length);r.add(F(0x668)).writeU64(n+1);flush(r);
  }
  function enqueueUi(r,value){
    const text=Memory.allocUtf8String(value),length=Array.from(value).reduce((n,c)=>n+(c.codePointAt(0)<128?1:c.codePointAt(0)<2048?2:c.codePointAt(0)<65536?3:4),0),owned=allocate(length,1);
    if(owned.isNull())throw Error('Unable to allocate native UI event');owned.writeByteArray(text.readByteArray(length));
    let n=number(r,F(0x668));if(n>=number(r,F(0x658)))reserveUi(r.add(F(0x658)));
    const item=r.add(F(0x660)).readPointer().add(n*24);item.writeU64(length);item.add(8).writePointer(owned);item.add(16).writeU64(length);r.add(F(0x668)).writeU64(n+1);
  }
  function continueEndless(r){
    const coop=r.add(F(0xc9d)).readU8()===1;
    if(r.add(F(0xca2)).readU8()===5&&r.add(F(0x508)).readFloat()>0)keepFighting(r);
    if(coop){
      const count=number(r,F(0x998)),party=r.add(F(0x990)).readPointer(),context=r.add(F(0xb98)).readU64();
      if(count>63)throw Error('Unsupported native party size');
      try{
        r.add(F(0xb98)).writeU64(0);queueEndless(r);
        for(let i=0;i<count;i++){
          const player=party.add(i*profile.partyStride);
          if(player.add(F(0x98c)).readU8()!==5)continue;
          swapPlayer(r,player);
          try{r.add(F(0xb98)).writeU64(i+1);if(r.add(F(0x508)).readFloat()>0)keepFighting(r);else r.add(F(0xca2)).writeU8(4);queueEndless(r);}
          finally{swapPlayer(r,player);}
        }
        r.add(F(0xca3)).writeU8(1);
      }finally{r.add(F(0xb98)).writeU64(context);}
    }
    if(r.add(F(0xc90)).readU8()){state.transitions++;state.transitionAt=0;notice('Endless unlocked — Mayhem bosses now grant native permanent rewards. Spend class Marks on gear upgrades between runs.',3);}
  }
  function freshStats(r,e,boss,extra,healthAlreadyScaled=false){
    const entityId=guid(e);if(scaled.has(entityId))return;scaled.add(entityId);
    const s=scales(r,extra),hp=healthAlreadyScaled?1:boss?s.health:s.mobHealth,damage=boss?s.damage:s.mobDamage,speed=boss?s.speed:s.mobSpeed;
    e.add(E(0x160)).writeFloat(Math.min(1e30,e.add(E(0x160)).readFloat()*hp));
    e.add(E(0x164)).writeFloat(Math.min(1e30,e.add(E(0x164)).readFloat()*hp));
    e.add(E(0x168)).writeFloat(Math.min(1e30,e.add(E(0x168)).readFloat()*damage));
    e.add(E(0x16c)).writeFloat(Math.min(20,e.add(E(0x16c)).readFloat()*speed));
    if(!boss)return;
    livingBossIds.add(entityId);
    e.add(E(0x170)).writeFloat(Math.max(.25,e.add(E(0x170)).readFloat()*s.cooldown));
    const timer=e.add(E(0x19c)).readFloat();e.add(E(0x19c)).writeFloat(time(r)+Math.max(0,timer-time(r))*s.cooldown);
    const p=e.add(E(0x20)).readPointer(),n=number(e,E(0x28));if(n>128)throw Error('Invalid boss timer vector');
    for(let i=0;i<n;i++)p.add(i*4).writeFloat(p.add(i*4).readFloat()*s.cooldown);
    const id=guid(e);if(extra)bossRegistry.set(id,{def:e.add(E(0x30)).readPointer(),spawned:state.clock});
    cloneAbilities(e,s.cooldown);
  }
  function cloneAbilities(e,multiplier){
    const n=number(e,E(0x40)),source=e.add(E(0x38)).readPointer();if(!n||n>128)return;
    const id=guid(e),previous=leases.get(id);if(previous?.copy.equals(source))return;
    const copy=Memory.alloc(n*profile.abilityStride);copy.writeByteArray(source.readByteArray(n*profile.abilityStride));
    for(let i=0;i<n;i++)copy.add(i*profile.abilityStride+48).writeFloat(Math.max(.25,copy.add(i*profile.abilityStride+48).readFloat()*multiplier));
    leases.set(id,{copy,multiplier});e.add(E(0x38)).writePointer(copy);
  }
  function fail(error){if(!fault){fault=String(error?.stack||error);send({kind:'fault',error:fault});}}
  function guarded(fn){try{return fn();}catch(e){fail(e);}}
  function constructorHook(name,boss){
    Interceptor.attach(at(name),{
      onEnter(args){this.r=args[0];this.before=number(this.r,F(0x590));this.def=boss?String(args[1]):null;
        this.scope={r:this.r,boss,extra:boss&&mayhemSpawning,healthInDefinition:boss&&bossDefinitions.has(this.def)};scope.push(this.scope);},
      onLeave(){guarded(()=>{const v=enemies(this.r);
        for(let i=this.before;i<v.n;i++){const e=v.p.add(i*profile.enemyStride);
          if((boss&&String(e.add(E(0x30)).readPointer())===this.def)||(!boss&&!isBoss(e)))freshStats(this.r,e,boss,this.scope.extra,this.scope.healthInDefinition);}
      });scope.pop();}
    });
  }
  constructorHook('bossSpawn',true);constructorHook('mobSpawn',false);
  const bits=new DataView(new ArrayBuffer(4));
  Interceptor.attach(at('entitySpawn'),{onEnter(args){guarded(()=>{
    const current=scope[scope.length-1];if(!current||current.healthInDefinition)return;bits.setUint32(0,args[5].toUInt32(),true);
    const s=scales(current.r,current.extra),hp=Math.min(1e30,bits.getFloat32(0,true)*(current.boss?s.health:s.mobHealth));
    bits.setFloat32(0,hp,true);args[5]=ptr(bits.getUint32(0,true));
  });}});
  Interceptor.attach(at('offer'),{onEnter(args){this.previous=batch;const r=args[0],m=time(r)/60;
    batch={r,count:0,quota:Math.min(3,Math.max(0,Math.floor((m-settings.legendaryStart)/settings.legendaryInterval)+1))};},
    onLeave(){batch=this.previous;}});
  Interceptor.attach(at('card'),{onEnter(args){guarded(()=>{
    if(!batch||!args[1].equals(batch.r)||args[2].readU64().toString(16)==='8000000000000004')return;
    if(batch.count++<batch.quota)args[3]=ptr(4);
  });}});
  Interceptor.attach(at('enemyAi'),{onLeave(){guarded(()=>{
    if(run.isNull()||fault)return;const v=enemies(run),living=new Set(),present=new Set();
    for(let i=0;i<v.n;i++){const e=v.p.add(i*profile.enemyStride);present.add(guid(e));if(!isBoss(e))continue;if(!alive(e)){if(livingBossIds.has(guid(e)))bossDied(run,guid(e),enemyPosition(run,e),bossRegistry.has(guid(e)));continue;}
      const id=guid(e);living.add(id);const lease=leases.get(id);if(lease)cloneAbilities(e,lease.multiplier);}
    for(const id of leases.keys())if(!living.has(id))leases.delete(id);
    livingBossIds=living;
    for(const id of scaled)if(!present.has(id))scaled.delete(id);
  });}});
  function enemyPosition(r,e){
    const duration=e.add(E(0x198)).readFloat(),start=e.add(E(0x194)).readFloat();
    const fraction=duration>0?Math.max(0,Math.min(1,(time(r)-start)/duration)):1;
    return [0,4,8].map(o=>{const a=e.add(E(0x17c+o)).readFloat(),b=e.add(E(0x188+o)).readFloat();return a+(b-a)*fraction;});
  }
  function bossDied(r,id,position,extra){
    if(deadBossIds.has(id))return;deadBossIds.add(id);livingBossIds.delete(id);bossRegistry.delete(id);state.killCount++;
    if(position){if(rewards)rewards.bossReward(r,position,extra?'mayhem':'boss');affixes?.bossDied(r,id,position);if(controls.fireworks&&effects)effects.death(r,'0x'+id,position,2085+(state.killCount-1)%4);}
  }
  Interceptor.attach(at('enemyDamage'),{
    onEnter(args){this.r=args[0];this.id=args[1].toString().slice(2);this.wasAlive=livingBossIds.has(this.id)&&!deadBossIds.has(this.id);this.position=null;this.extra=bossRegistry.has(this.id);
      if(this.wasAlive)guarded(()=>{const v=enemies(this.r);for(let i=0;i<v.n;i++){const e=v.p.add(i*profile.enemyStride);if(guid(e)===this.id){this.position=enemyPosition(this.r,e);break;}}});},
    onLeave(){if(!this.wasAlive)return;guarded(()=>{const v=enemies(this.r);let dead=true;
      for(let i=0;i<v.n;i++){const e=v.p.add(i*profile.enemyStride);if(e.add(E(0xf0)).readU64().toString(16)===this.id){dead=!alive(e);break;}}
      if(dead)bossDied(this.r,this.id,this.position,this.extra);
    });}
  });
  const hazard=Memory.alloc(56);hazard.writeByteArray(base.add(profile.hazardDefinition).readByteArray(56));
  hazard.add(8).writeFloat(2.5);hazard.add(16).writeFloat(2.5);
  const shapedTemplates=new Map();
  for(const def of defs){const n=number(def.pointer,24),p=def.pointer.add(16).readPointer();if(n>64)throw Error('Invalid boss ability catalog');
    for(let i=0;i<n;i++){const a=p.add(i*profile.abilityStride),kind=a.add(45).readU8();if((kind===8||kind===9)&&!shapedTemplates.has(kind)){const copy=Memory.alloc(56);copy.writeByteArray(a.readByteArray(56));shapedTemplates.set(kind,copy);}}}
  function extraAttack(r,target){
    if(!settings.extraHazards||state.clock<state.shapeNext||number(r,F(0x5c0))>=128)return;
    const v=enemies(r),centre=[0x4f0,0x4f4,0x4f8].map(o=>target.add(F(o)).readFloat());let nearest=-1,distance=24*24;
    for(let i=0;i<v.n;i++){const e=v.p.add(i*profile.enemyStride);if(!hazardSource(e))continue;const pos=enemyPosition(r,e),d=(pos[0]-centre[0])**2+(pos[1]-centre[1])**2;if(d<distance){distance=d;nearest=i;}}
    if(nearest<0)return;const kind=state.shapedBursts%2?9:8,a=shapedTemplates.get(kind);if(!a)return;
    const e=v.p.add(nearest*profile.enemyStride),hp=target.add(F(0x4a0)).readFloat(),multiplier=[.5,1,1.5,2][settings.hazardPreset]*(1+Math.min(3,time(r)/60*settings.hazardGrowth/100));
    let damage=e.add(E(0x168)).readFloat();if(isBoss(e)&&e.add(E(0x50)).readU8())damage*=1.4;
    const raw=Math.min(350,Math.max(35,hp*.25))*multiplier;
    a.add(4).writeFloat(kind===8?16:25);a.add(8).writeFloat(kind===8?65:3.5);a.add(12).writeFloat(2.5);a.add(16).writeFloat(raw/(r.add(F(0xc90)).readU8()?1:2)/Math.max(.001,damage));
    const offsets=[F(0x4f0),F(0x4f4),F(0x4f8)],saved=offsets.map(o=>r.add(o).readFloat());
    try{offsets.forEach((o,i)=>r.add(o).writeFloat(centre[i]));cast(r,nearest,a);}finally{offsets.forEach((o,i)=>r.add(o).writeFloat(saved[i]));}
    state.shapedBursts++;state.shapeNext=state.clock+3;
  }
  function emitHazards(r,target,index,intense,storm,stationary=false){
    const existing=number(r,F(0x5c0)),amount=Math.min(storm?settings.stormCount:intense?settings.barrageCount:settings.hazardCount,128-existing);if(amount<=0)return false;
    const source=r.add(F(0x588)).readPointer().add(index*profile.enemyStride),hp=target.add(F(0x4a0)).readFloat();
    const multiplier=[.5,1,1.5,2][settings.hazardPreset]*(1+Math.min(3,time(r)/60*settings.hazardGrowth/100));
    const raw=Math.min(intense?350:250,Math.max(intense?35:25,hp*(intense?.25:.2)))*multiplier;
    let damage=source.add(E(0x168)).readFloat();if(source.add(E(0x18)).readS64().toString()!=='-1'&&source.add(E(0x50)).readU8())damage*=1.4;
    hazard.add(4).writeU32(1);hazard.add(12).writeFloat(0);
    hazard.add(20).writeFloat(raw/(r.add(F(0xc90)).readU8()?1:2)/Math.max(.001,damage));
    const offsets=[F(0x4f0),F(0x4f4),F(0x4f8)],xyz=offsets.map(off=>r.add(off).readFloat());
    const centre=offsets.map(off=>target.add(off).readFloat());
    const kind=settings.hazardPattern||1+(state.hazardBursts%5);
    const points=globalThis.MAYHEM_PATTERNS.points(kind,amount,(state.hazardBursts%8)*Math.PI/4);
    try{for(const [dx,dy] of points){r.add(offsets[0]).writeFloat(centre[0]+dx);r.add(offsets[1]).writeFloat(centre[1]+dy);r.add(offsets[2]).writeFloat(centre[2]);cast(r,index,hazard);}}
    finally{offsets.forEach((off,i)=>r.add(off).writeFloat(xyz[i]));}
    if(intense||stationary)extraAttack(r,target);state.hazardBursts++;return true;
  }
  function affixBurst(r,options){
    const v=enemies(r);let index=-1;
    for(let i=0;i<v.n;i++)if(hazardSource(v.p.add(i*profile.enemyStride))){index=i;break;}
    const group=players(r);if(index<0||!group.length)return false;
    const source=v.p.add(index*profile.enemyStride);let damage=source.add(E(0x168)).readFloat();
    if(source.add(E(0x18)).readS64().toString()!=='-1'&&source.add(E(0x50)).readU8())damage*=1.4;
    const offsets=[F(0x4f0),F(0x4f4),F(0x4f8)],saved=offsets.map(o=>r.add(o).readFloat());let count=0;
    try{
      for(const player of (options.position?[group[0]]:group)){
        const centre=options.position||offsets.map(o=>player.add(o).readFloat());
        const raw=Math.min(250,Math.max(25,player.add(F(0x4a0)).readFloat()*.2))*options.damagePercent/100;
        hazard.add(4).writeU32(1);hazard.add(12).writeFloat(0);hazard.add(20).writeFloat(raw/(r.add(F(0xc90)).readU8()?1:2)/Math.max(.001,damage));
        const amount=Math.max(0,Math.min(options.count,128-number(r,F(0x5c0))));
        for(const [x,y] of MAYHEM_PATTERNS.points(options.pattern,amount,state.clock)){
          r.add(offsets[0]).writeFloat(centre[0]+x);r.add(offsets[1]).writeFloat(centre[1]+y);r.add(offsets[2]).writeFloat(centre[2]);cast(r,index,hazard);count++;
        }
      }
    }finally{offsets.forEach((o,i)=>r.add(o).writeFloat(saved[i]));}
    return count>0;
  }
  function hazards(r,v,bosses){
    const t=state.clock,storm=state.event===4&&t<state.eventUntil;
    if(!controls.hazards){camp.clear();state.nextHazard=t+settings.hazardInterval;state.stormNext=0;state.barrageNext=t+settings.barrageIntervalTenths/10;return;}
    if(!bosses.some(e=>bossRegistry.has(guid(e))))state.barrageUntil=0;
    const barrage=t<state.barrageUntil,intense=storm||barrage;
    if(!storm&&state.stormNext){state.stormNext=0;state.nextHazard=t+settings.hazardInterval;}
    let source=-1;for(let i=0;i<v.n;i++)if(hazardSource(v.p.add(i*profile.enemyStride))){source=i;break;}
    if(source<0)return;
    const due=storm?t>=state.stormNext:barrage?t>=state.barrageNext:t>=state.nextHazard;
    const group=players(r);let served=0;
    for(let i=0;i<group.length;i++){
      const p=group[(state.cursor+i)%group.length],id=p.add(F(0x488)).readU64().toString(),x=p.add(F(0x4f0)).readFloat(),y=p.add(F(0x4f4)).readFloat();
      let anchor=camp.get(id);if(!anchor){anchor={x,y,since:t,last:-8};camp.set(id,anchor);}
      if((x-anchor.x)**2+(y-anchor.y)**2>.25||phase(p)!==1){anchor.x=x;anchor.y=y;anchor.since=t;}
      const stationary=phase(p)===1&&t-anchor.since>=settings.campSeconds&&t-anchor.last>=8;
      if((due||stationary)&&emitHazards(r,p,source,intense,storm,stationary)){anchor.last=t;anchor.since=t;served++;if(stationary)state.campBursts++;}
    }
    if(due&&served){state.cursor=(state.cursor+served)%Math.max(1,group.length);
      if(storm)state.stormNext=t+settings.stormIntervalTenths/10;else if(barrage)state.barrageNext=t+settings.barrageIntervalTenths/10;else state.nextHazard=t+settings.hazardInterval;}
  }
  function summon(r,code){
    const def=defs[code];if(!def||def.final&&!state.endless)return false;
    const before=number(r,F(0x590));mayhemSpawning=true;
    // Keep the copied definition alive for the whole Run: native Enemy borrows
    // it for AI/death handling. Pre-scale HP so the native initial max-HP packet
    // agrees with the actual pool even when a reentrant FFI skips listeners.
    const copy=Memory.alloc(profile.bossStride);copy.writeByteArray(def.pointer.readByteArray(profile.bossStride));
    copy.add(84).writeFloat(Math.min(1e24,copy.add(84).readFloat()*scales(r,true).health));
    bossDefinitions.set(String(copy),{copy,original:def.pointer});definitionSet.add(String(copy));
    // NativeFunction deliberately bypasses listeners on its own target entry.
    // Wrap that call explicitly; nested visual/entity listeners still run.
    scope.push({r,boss:true,extra:true,healthInDefinition:true});
    try{if(profile.bossSpawnHpArgument)spawnBoss(r,copy,1.0);else spawnBoss(r,copy);}finally{scope.pop();mayhemSpawning=false;}
    const v=enemies(r);for(let i=before;i<v.n;i++){const e=v.p.add(i*profile.enemyStride);
      if(e.add(E(0x30)).readPointer().equals(copy))freshStats(r,e,true,true,true);}
    return number(r,F(0x590))>before;
  }
  function hunt(r){
    const home=zoneIndex(r),z=zones[(home+1+Math.floor(Math.random()*11))%12];
    const index=10+Math.floor(Math.random()*Math.max(1,z.creatureCount-10));
    const oldPointer=r.add(F(0x2b8)).readPointer(),oldLength=r.add(F(0x2c0)).readU64(),before=number(r,F(0x590));
    scope.push({r,boss:false,extra:false});
    try{r.add(F(0x2b8)).writePointer(z.keyPointer);r.add(F(0x2c0)).writeU64(z.keyLength);spawnMob(r,index,nonePosition);}
    finally{scope.pop();r.add(F(0x2b8)).writePointer(oldPointer);r.add(F(0x2c0)).writeU64(oldLength);}
    const v=enemies(r);for(let i=before;i<v.n;i++){const e=v.p.add(i*profile.enemyStride);if(!isBoss(e)){freshStats(r,e,false,false);syncHealth(r,e);}}
    return number(r,F(0x590))>before;
  }
  function events(r,bossCount){
    const t=state.clock;
    if(!controls.events||!settings.eventMask){state.event=0;state.eventUntil=0;state.nextEvent=t+settings.eventFirst;return;}
    if(state.event&&t>=state.eventUntil){state.event=0;state.eventUntil=0;state.nextEvent=t+settings.eventGapMin+Math.floor(Math.random()*(settings.eventGapMax-settings.eventGapMin+1));notice('Event complete.');return;}
    if(state.event||t<state.nextEvent)return;
    if(bossCount>=6||(state.affix===3&&t-state.lastSpawn<10)||state.nextWave-t<10||t<state.noticeUntil){state.nextEvent=t+1;return;}
    let available=[1,2,3,4,4].filter(kind=>settings.eventMask&(1<<(kind-1)));
    const distinct=new Set(available);if(distinct.size>1)available=available.filter(kind=>kind!==state.lastEvent);
    const kind=state.eventCount===0&&(settings.eventMask&8)?4:available[Math.floor(Math.random()*available.length)];
    if(kind===2&&!hunt(r)){state.nextEvent=t+10;return;}
    state.event=kind;state.lastEvent=kind;state.eventUntil=t+[0,settings.treasureDuration,settings.huntDuration,settings.berserkerDuration,settings.stormDuration][kind];state.eventCount++;
    if(kind===4)state.stormNext=t;
    notice(['','Treasure Rush — double pickups!','Guardian Hunt — a foreign rare arrives!','Berserker Rush — reinforcements accelerate!','Rune Storm — keep moving for '+settings.stormDuration+' seconds!'][kind],3);
  }
  function tick(r){
    if(fault||inMode)return;inMode=true;
    try{
      run=r;const t=time(r),p=r.add(F(0xca2)).readU8(),world=r.add(F(0xca3)).readU8();
      if(t+.5<state.clock||(p===0&&state.clock>0))reset();state.clock=t;
      if((r.add(F(0xc9d)).readU8()?world:p)!==1)return;
      tempo?.tick(r);
      state.endless=!!r.add(F(0xc90)).readU8()&&!!r.add(F(0xb10)).readU32();
      if(rotateMap(r,t))return;
      const v=enemies(r),bosses=[];for(let i=0;i<v.n;i++){const e=v.p.add(i*profile.enemyStride);if(isBoss(e)){if(alive(e))bosses.push(e);else if(livingBossIds.has(guid(e)))bossDied(r,guid(e),enemyPosition(r,e),bossRegistry.has(guid(e)));}}
      population?.tick(r);affixes?.tick(r);events(r,bosses.length);hazards(r,v,bosses);if(rewards)rewards.tick(r);if(effects?.tick)effects.tick(r);
      if(!controls.waves){state.nextWave=t+settings.bossInterval;return;}
      if(t<state.nextWave||bosses.length>=8)return;
      const extra=state.wave%4===3;state.affix=state.wave%4;
      const code=nextBoss();
      if(!summon(r,code))return;
      if(state.endless)state.finalCursor++;
      if(extra&&bosses.length<7){const second=nextBoss();
        if(summon(r,second)&&state.endless)state.finalCursor++;}
      state.lastBoss=defs[code].name;state.wave++;state.lastSpawn=t;state.nextWave=t+settings.bossInterval;state.barrageUntil=t+settings.barrageDuration;state.barrageNext=t;
      notice(['Crossroads','Frenzy','Spellstorm','Double Trouble'][state.affix]+' — '+defs[code].name+'! Dodge the arrival barrage.',3);
    }finally{inMode=false;}
  }
  Interceptor.attach(at('runTick'),{onEnter(args){guarded(()=>{run=args[0];travel?.tick(run);if(!travel?.status().busy)tick(run);});}});
  Interceptor.attach(at('gameUpdate'),{onEnter(args){game=args[0];},onLeave(){guarded(()=>{
    if(game.add(16).readU64().toString()==='2'){run=NULL;travel?.reset(true);state.transitionAt=0;return;}
    const r=game.add(16);run=r;
    const victoryPhase=r.add(F(0xc9d)).readU8()?r.add(F(0xca3)).readU8():r.add(F(0xca2)).readU8();
    if(controls.autoEndless&&victoryPhase===5&&r.add(F(0xb10)).readU32()&&!r.add(F(0xc90)).readU8()){
      if(!state.transitionAt)state.transitionAt=Date.now()+750;
      if(Date.now()>=state.transitionAt)continueEndless(r);
    }else state.transitionAt=0;
    releaseNotice(r);
  });}});
  if(globalThis.MAYHEM_PERMANENT_REWARDS)permanentRewards=globalThis.MAYHEM_PERMANENT_REWARDS.setup({profile,base,F,getState:()=>state,knownBoss:p=>bossDefinitions.get(String(p)),homeFinal:r=>{const z=zones[zoneIndex(r)];return z?z.bosses[4].pointer:null;}});
  if(globalThis.MAYHEM_REWARDS)rewards=globalThis.MAYHEM_REWARDS.setup({profile,base,F,native,guarded,notice,time,players,getSettings:()=>settings});
  if(globalThis.MAYHEM_EFFECTS)effects=globalThis.MAYHEM_EFFECTS.setup({base,profile,F,E,allocate,appendMessage,players,getSettings:()=>settings,guarded});
  income=MAYHEM_INCOME.setup({base,profile,getRun:()=>run,getSettings:()=>settings,time,guarded});
  population=MAYHEM_POPULATION.setup({base,profile,F,E,getRun:()=>run,getSettings:()=>settings,time,enemies,isBoss,guid,alive,guarded,notice});
  tempo=MAYHEM_TEMPO.setup({base,profile,getSettings:()=>settings,guarded,F,players,appendMessage,allocate,getGame:()=>game,canSync:()=>!travel?.status().busy});
  affixes=MAYHEM_AFFIXES.setup({base,profile,allocate,deallocate,appendMessage,enqueueUi,getSettings:()=>settings,time,enemies,guid,alive,isBoss,enemyPosition,notice,guarded,hunt,
    burst:affixBurst,bounty(r,position,amount){
      const group=players(r);if(!group.length||!rewards?.queue)return false;
      const centre=position||[0x4f0,0x4f4,0x4f8].map(o=>group[0].add(F(o)).readFloat());
      let sent=false;for(const [kind,n] of [[1,amount.gold],[0,amount.xp],...(amount.chest?[[2,1]]:[]),...(amount.powerup?[[3+Math.floor(Math.random()*4),1]]:[])])sent=rewards.queue(kind,n,centre)||sent;
      return sent;
    }});
  travel=AZS_MAP_TRAVEL.setup({profile,base,F,getRun:()=>run.isNull()?null:run,getGame:()=>game.isNull()?null:game,notice,onCommit(){
    state.mapChanges++;state.nextMap=time(run)+180;if(rewards?.onTravel)rewards.onTravel(run);
    population?.reset();tempo?.reset();affixes?.onTravel();
    for(const item of deferredEvents)dropEvent(item.event);deferredEvents=[];announcements=[];camp.clear();leases.clear();bossRegistry.clear();scaled.clear();bossDefinitions.clear();livingBossIds.clear();deadBossIds.clear();definitionSet.clear();for(const def of defs)definitionSet.add(String(def.pointer));
  }});
  function status(){
    let match=null;if(!run.isNull())guarded(()=>{match={clock:time(run),phase:run.add(F(0xca2)).readU8(),worldPhase:run.add(F(0xca3)).readU8(),coop:!!run.add(F(0xc9d)).readU8(),zone:zoneIndex(run)};});
    return {ready:!fault,fault,travel:travel.status(),settings:{...settings},controls:{...controls},state:{...state},rewards:rewards?.status?.()??null,income:income?.status?.()??null,population:population?.status?.()??null,tempo:tempo?.status?.()??null,affixes:affixes?.status?.()??null,permanentRewards:permanentRewards?.status?.()??null,match,scaling:run.isNull()?null:scales(run),native:true};
  }
  rpc.exports={
    status,travel(zone){if(fault)return false;return travel.request(zone);},
    configure(candidate){
      if(!candidate||Object.keys(candidate).length!==Object.keys(schema).length||
        Object.entries(schema).some(([key,spec])=>!Number.isInteger(candidate[key])||candidate[key]<spec[1]||candidate[key]>spec[2])||
        candidate.eventGapMin>candidate.eventGapMax||candidate.hasteDuration>=candidate.hasteInterval||
        candidate.xpBasePercent>candidate.xpCapPercent||candidate.goldBasePercent>candidate.goldCapPercent)return false;
      const t=state.clock;
      if(candidate.bossInterval!==settings.bossInterval)state.nextWave=t+candidate.bossInterval;
      if(candidate.hazardInterval!==settings.hazardInterval)state.nextHazard=t+candidate.hazardInterval;
      if(candidate.eventFirst!==settings.eventFirst&&state.eventCount===0)state.nextEvent=Math.max(t+1,candidate.eventFirst);
      if((candidate.eventGapMin!==settings.eventGapMin||candidate.eventGapMax!==settings.eventGapMax)&&!state.event&&state.eventCount>0)
        state.nextEvent=t+candidate.eventGapMin;
      settings={...candidate};population?.configure();return true;},
    control(name,enabled){
      if(!Object.hasOwn(controls,name))return false;
      enabled=!!enabled;
      if(name==='autoMap'&&controls.autoMap!==enabled){
        if(!enabled)travel?.cancelQueued?.();
        else {state.nextMap=state.clock+180;state.mapWarning=0;state.mapRetryAt=0;}
      }
      controls[name]=enabled;return true;
    }
  };
  setInterval(()=>{if(Date.now()-lastStatus<950)return;lastStatus=Date.now();send({kind:'status',...status()});},1000);
  send({kind:'ready',version:profile.version,catalog:zones.map(z=>({key:z.key,name:z.name,bosses:z.bosses.map(b=>b.name)}))});
})();
