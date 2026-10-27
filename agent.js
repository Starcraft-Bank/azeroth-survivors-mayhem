/* Legendary Mayhem native runtime. Exact supported executable only; host Run only. */
(() => {
  'use strict';
  const profile=globalThis.MAYHEM_NATIVE_PROFILE,base=Process.mainModule.base;
  const at=name=>base.add(profile.functions[name]);
  const native=(name,result,args)=>new NativeFunction(at(name),result,args,{traps:'all'});
  const spawnBoss=native('bossSpawn','void',['pointer','pointer']);
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
  let controls={waves:true,events:true,hazards:true,fireworks:true,autoEndless:true};
  let game=NULL,run=NULL,fault='',lastStatus=0,inMode=false,mayhemSpawning=false,batch=null;
  let scope=[],leases=new Map(),bossRegistry=new Map(),camp=new Map(),announcements=[],scaled=new Set(),bossDefinitions=new Map(),livingBossIds=new Set(),deadBossIds=new Set();
  let state;
  function reset(){
    for(const item of deferredEvents)dropEvent(item.event);deferredEvents=[];
    state={clock:0,wave:0,nextWave:settings.bossInterval,finalCursor:0,affix:0,endless:false,nextHazard:settings.hazardInterval,
      stormNext:0,barrageUntil:0,barrageNext:0,event:0,eventUntil:0,nextEvent:settings.eventFirst,eventCount:0,
      lastEvent:0,killCount:0,hazardBursts:0,campBursts:0,cursor:0,noticeUntil:0,transitionAt:0,transitions:0,goldAwards:0,lastGold:null};
    scope=[];leases.clear();bossRegistry.clear();camp.clear();scaled.clear();bossDefinitions.clear();livingBossIds.clear();deadBossIds.clear();announcements=[];
    definitionSet.clear();for(const def of defs)definitionSet.add(String(def.pointer));
  }
  reset();
  const number=(p,off)=>p.add(off).readU64().toNumber();
  const time=r=>r.add(0xbf4).readFloat();
  const phase=r=>r.add(r.equals(run)?0xca2:0x98c).readU8();
  const alive=e=>e.add(0xb0).readU32()===0&&e.add(0x160).readFloat()>0;
  const isBoss=e=>definitionSet.has(String(e.add(0x30).readPointer()))&&e.add(0x18).readS64().toString()!=='-1';
  const guid=e=>e.add(0xf0).readU64().toString(16);
  function enemies(r){const n=number(r,0x590),p=r.add(0x588).readPointer();if(n>100000)throw Error('Invalid native enemy vector');return {n,p};}
  function players(r){
    const result=[r],ids=new Set([r.add(0x488).readU64().toString()]);
    const n=Math.min(63,number(r,0x998)),p=r.add(0x990).readPointer();
    for(let i=0;i<n;i++){const player=p.add(i*profile.partyStride),id=player.add(0x488).readU64().toString();
      if(!ids.has(id)){ids.add(id);result.push(player);}}
    return result.filter(p=>p.add(0x508).readFloat()>0);
  }
  function zoneIndex(r){const key=readString(r.add(0x2b8).readPointer(),number(r,0x2c0));return zones.findIndex(z=>z.key===key);}
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
      mobSpeed:Math.min(1.3,1+.004*m)*(state.event===3?1.2:1),gold:Math.min(8,1.25+.15*m)*(state.event===1?2:1)};
  }
  // All three native income paths, after bonuses/sharing and before both
  // balance and earned counters. Refunds, prices and old balances stay native.
  for(const site of profile.goldAwards)Interceptor.attach(base.add(site.rva),function(){guarded(()=>{
    if(fault)return;const r=this.context[site.runRegister],amount=this.context.rax.toUInt32();
    const scaledAmount=Math.min(0xffffffff-r.add(0x510).readU32(),0xffffffff-r.add(0x7bc).readU32(),Math.ceil(amount*scales(r).gold));
    this.context.rax=ptr(scaledAmount);
    state.goldAwards++;state.lastGold={native:amount,scaled:scaledAmount,factor:scales(r).gold};
  });});
  function dropEvent(event){for(const offset of [0,24]){const capacity=event.add(offset).readU64().toNumber();if(capacity)deallocate(event.add(offset+8).readPointer(),capacity,1);}}
  function appendMessage(r,out){
    let n=number(r,0x650);if(n>=number(r,0x640))reserve(r.add(0x640));
    r.add(0x648).readPointer().add(n*32).writeByteArray(out.readByteArray(32));r.add(0x650).writeU64(n+1);
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
  function firework(r,kit){
    const data=allocate(12,1);if(data.isNull())return;
    data.writeU64(r.add(0x488).readU64());data.add(8).writeU32(kit);
    // Message carries a raw SMSG_PLAY_SPELL_VISUAL packet. packetMessage is
    // specifically the UPDATE_OBJECT encoder and must not wrap this opcode.
    message.writeU64(12);message.add(8).writePointer(data);message.add(16).writeU64(12);message.add(24).writeU64(499);appendMessage(r,message);
  }
  function syncHealth(r,e){
    const fields=Memory.alloc(24);fields.writeByteArray(new Uint8Array(24));
    setField(fields,22,Math.min(0xffffffff,Math.ceil(Math.max(0,e.add(0x160).readFloat()))));
    setField(fields,28,Math.min(0xffffffff,Math.ceil(e.add(0x164).readFloat())));
    const bytes=allocate(1,1);if(bytes.isNull())throw Error('Unable to allocate native health update');bytes.writeU8(0);
    packet.writeByteArray(new Uint8Array(32));packet.writeU64(1);packet.add(8).writePointer(bytes);packet.add(16).writeU64(1);packet.add(24).writeU32(1);
    writeGuid(e.add(0xf0).readU64(),packet);writeFields(fields,packet);makePacket(message,packet);appendMessage(r,message);
  }
  function queueEndless(r){
    const text=Memory.allocUtf8String('{"type":"endless"}'),length=18,owned=allocate(length,1);
    if(owned.isNull())throw Error('Unable to allocate native endless event');
    owned.writeByteArray(text.readByteArray(length));let n=number(r,0x668);
    if(n>=number(r,0x658))reserveUi(r.add(0x658));
    const item=r.add(0x660).readPointer().add(n*24);item.writeU64(length);item.add(8).writePointer(owned);item.add(16).writeU64(length);r.add(0x668).writeU64(n+1);flush(r);
  }
  function continueEndless(r){
    const coop=r.add(0xc9d).readU8()===1;
    if(r.add(0xca2).readU8()===5&&r.add(0x508).readFloat()>0)keepFighting(r);
    if(coop){
      const count=number(r,0x998),party=r.add(0x990).readPointer(),context=r.add(0xb98).readU64();
      if(count>63)throw Error('Unsupported native party size');
      try{
        r.add(0xb98).writeU64(0);queueEndless(r);
        for(let i=0;i<count;i++){
          const player=party.add(i*profile.partyStride);
          if(player.add(0x98c).readU8()!==5)continue;
          swapPlayer(r,player);
          try{r.add(0xb98).writeU64(i+1);if(r.add(0x508).readFloat()>0)keepFighting(r);else r.add(0xca2).writeU8(4);queueEndless(r);}
          finally{swapPlayer(r,player);}
        }
        r.add(0xca3).writeU8(1);
      }finally{r.add(0xb98).writeU64(context);}
    }
    if(r.add(0xc90).readU8()){state.transitions++;state.transitionAt=0;}
  }
  function freshStats(r,e,boss,extra,healthAlreadyScaled=false){
    const entityId=guid(e);if(scaled.has(entityId))return;scaled.add(entityId);
    const s=scales(r,extra),hp=healthAlreadyScaled?1:boss?s.health:s.mobHealth,damage=boss?s.damage:s.mobDamage,speed=boss?s.speed:s.mobSpeed;
    e.add(0x160).writeFloat(Math.min(1e30,e.add(0x160).readFloat()*hp));
    e.add(0x164).writeFloat(Math.min(1e30,e.add(0x164).readFloat()*hp));
    e.add(0x168).writeFloat(Math.min(1e30,e.add(0x168).readFloat()*damage));
    e.add(0x16c).writeFloat(Math.min(20,e.add(0x16c).readFloat()*speed));
    if(!boss)return;
    livingBossIds.add(entityId);
    e.add(0x170).writeFloat(Math.max(.25,e.add(0x170).readFloat()*s.cooldown));
    const timer=e.add(0x19c).readFloat();e.add(0x19c).writeFloat(time(r)+Math.max(0,timer-time(r))*s.cooldown);
    const p=e.add(0x20).readPointer(),n=number(e,0x28);if(n>128)throw Error('Invalid boss timer vector');
    for(let i=0;i<n;i++)p.add(i*4).writeFloat(p.add(i*4).readFloat()*s.cooldown);
    const id=guid(e);if(extra)bossRegistry.set(id,{def:e.add(0x30).readPointer(),spawned:state.clock});
    cloneAbilities(e,s.cooldown);
  }
  function cloneAbilities(e,multiplier){
    const n=number(e,0x40),source=e.add(0x38).readPointer();if(!n||n>128)return;
    const id=guid(e),previous=leases.get(id);if(previous?.copy.equals(source))return;
    const copy=Memory.alloc(n*56);copy.writeByteArray(source.readByteArray(n*56));
    for(let i=0;i<n;i++)copy.add(i*56+48).writeFloat(Math.max(.25,copy.add(i*56+48).readFloat()*multiplier));
    leases.set(id,{copy,multiplier});e.add(0x38).writePointer(copy);
  }
  function fail(error){if(!fault){fault=String(error?.stack||error);send({kind:'fault',error:fault});}}
  function guarded(fn){try{return fn();}catch(e){fail(e);}}
  function constructorHook(name,boss){
    Interceptor.attach(at(name),{
      onEnter(args){this.r=args[0];this.before=number(this.r,0x590);this.def=boss?String(args[1]):null;
        this.scope={r:this.r,boss,extra:boss&&mayhemSpawning,healthInDefinition:boss&&bossDefinitions.has(this.def)};scope.push(this.scope);},
      onLeave(){guarded(()=>{const v=enemies(this.r);
        for(let i=this.before;i<v.n;i++){const e=v.p.add(i*480);
          if((boss&&String(e.add(0x30).readPointer())===this.def)||(!boss&&!isBoss(e)))freshStats(this.r,e,boss,this.scope.extra,this.scope.healthInDefinition);}
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
    for(let i=0;i<v.n;i++){const e=v.p.add(i*480);present.add(guid(e));if(!alive(e)||!isBoss(e))continue;
      const id=guid(e);living.add(id);const lease=leases.get(id);if(lease)cloneAbilities(e,lease.multiplier);}
    for(const id of leases.keys())if(!living.has(id))leases.delete(id);
    livingBossIds=living;
    for(const id of scaled)if(!present.has(id))scaled.delete(id);
  });}});
  Interceptor.attach(at('enemyDamage'),{
    onEnter(args){this.r=args[0];this.id=args[1].toString().slice(2);this.wasAlive=livingBossIds.has(this.id)&&!deadBossIds.has(this.id);},
    onLeave(){if(!this.wasAlive)return;guarded(()=>{const v=enemies(this.r);let dead=true;
      for(let i=0;i<v.n;i++){const e=v.p.add(i*480);if(e.add(0xf0).readU64().toString(16)===this.id){dead=!alive(e);break;}}
      if(dead){deadBossIds.add(this.id);livingBossIds.delete(this.id);bossRegistry.delete(this.id);state.killCount++;if(controls.fireworks)firework(this.r,2085+(state.killCount-1)%4);}
    });}
  });
  const hazard=Memory.alloc(56);hazard.writeByteArray(base.add(profile.hazardDefinition).readByteArray(56));
  hazard.add(8).writeFloat(2.5);hazard.add(16).writeFloat(2.5);
  function emitHazards(r,target,index,intense,storm){
    const existing=number(r,0x5c0),amount=Math.min(storm?settings.stormCount:intense?settings.barrageCount:settings.hazardCount,128-existing);if(amount<=0)return false;
    const source=r.add(0x588).readPointer().add(index*480),hp=target.add(0x4a0).readFloat();
    const multiplier=[.5,1,1.5,2][settings.hazardPreset]*(1+Math.min(3,time(r)/60*settings.hazardGrowth/100));
    const raw=Math.min(intense?350:250,Math.max(intense?35:25,hp*(intense?.25:.2)))*multiplier;
    let damage=source.add(0x168).readFloat();if(source.add(0x18).readS64().toString()!=='-1'&&source.add(0x50).readU8())damage*=1.4;
    hazard.add(4).writeU32(amount);hazard.add(20).writeFloat(raw/(r.add(0xc90).readU8()?1:2)/Math.max(.001,damage));
    const xyz=[0x4f0,0x4f4,0x4f8].map(off=>r.add(off).readFloat());
    try{[0x4f0,0x4f4,0x4f8].forEach(off=>r.add(off).writeFloat(target.add(off).readFloat()));cast(r,index,hazard);}
    finally{[0x4f0,0x4f4,0x4f8].forEach((off,i)=>r.add(off).writeFloat(xyz[i]));}
    state.hazardBursts++;return true;
  }
  function hazards(r,v,bosses){
    const t=state.clock,storm=state.event===4&&t<state.eventUntil;
    if(!controls.hazards){camp.clear();state.nextHazard=t+settings.hazardInterval;state.stormNext=0;state.barrageNext=t+settings.barrageIntervalTenths/10;return;}
    if(!bosses.some(e=>bossRegistry.has(guid(e))))state.barrageUntil=0;
    const barrage=t<state.barrageUntil,intense=storm||barrage;
    if(!storm&&state.stormNext){state.stormNext=0;state.nextHazard=t+settings.hazardInterval;}
    let source=-1;for(let i=0;i<v.n;i++)if(alive(v.p.add(i*480))){source=i;break;}
    if(source<0)return;
    const due=storm?t>=state.stormNext:barrage?t>=state.barrageNext:t>=state.nextHazard;
    const group=players(r);let served=0;
    for(let i=0;i<group.length;i++){
      const p=group[(state.cursor+i)%group.length],id=p.add(0x488).readU64().toString(),x=p.add(0x4f0).readFloat(),y=p.add(0x4f4).readFloat();
      let anchor=camp.get(id);if(!anchor){anchor={x,y,since:t,last:-8};camp.set(id,anchor);}
      if((x-anchor.x)**2+(y-anchor.y)**2>.25||phase(p)!==1){anchor.x=x;anchor.y=y;anchor.since=t;}
      const stationary=phase(p)===1&&t-anchor.since>=settings.campSeconds&&t-anchor.last>=8;
      if((due||stationary)&&emitHazards(r,p,source,intense,storm)){anchor.last=t;anchor.since=t;served++;if(stationary)state.campBursts++;}
    }
    if(due&&served){state.cursor=(state.cursor+served)%Math.max(1,group.length);
      if(storm)state.stormNext=t+settings.stormIntervalTenths/10;else if(barrage)state.barrageNext=t+settings.barrageIntervalTenths/10;else state.nextHazard=t+settings.hazardInterval;}
  }
  function summon(r,code){
    const def=defs[code];if(!def||def.final&&!state.endless)return false;
    const before=number(r,0x590);mayhemSpawning=true;
    // Keep the copied definition alive for the whole Run: native Enemy borrows
    // it for AI/death handling. Pre-scale HP so the native initial max-HP packet
    // agrees with the actual pool even when a reentrant FFI skips listeners.
    const copy=Memory.alloc(profile.bossStride);copy.writeByteArray(def.pointer.readByteArray(profile.bossStride));
    copy.add(84).writeFloat(Math.min(1e24,copy.add(84).readFloat()*scales(r,true).health));
    bossDefinitions.set(String(copy),{copy,original:def.pointer});definitionSet.add(String(copy));
    // NativeFunction deliberately bypasses listeners on its own target entry.
    // Wrap that call explicitly; nested visual/entity listeners still run.
    scope.push({r,boss:true,extra:true,healthInDefinition:true});
    try{spawnBoss(r,copy);}finally{scope.pop();mayhemSpawning=false;}
    const v=enemies(r);for(let i=before;i<v.n;i++){const e=v.p.add(i*480);
      if(e.add(0x30).readPointer().equals(copy))freshStats(r,e,true,true,true);}
    return number(r,0x590)>before;
  }
  function hunt(r){
    const home=zoneIndex(r),z=zones[(home+1+Math.floor(Math.random()*11))%12];
    const index=10+Math.floor(Math.random()*Math.max(1,z.creatureCount-10));
    const oldPointer=r.add(0x2b8).readPointer(),oldLength=r.add(0x2c0).readU64(),before=number(r,0x590);
    scope.push({r,boss:false,extra:false});
    try{r.add(0x2b8).writePointer(z.keyPointer);r.add(0x2c0).writeU64(z.keyLength);spawnMob(r,index,nonePosition);}
    finally{scope.pop();r.add(0x2b8).writePointer(oldPointer);r.add(0x2c0).writeU64(oldLength);}
    const v=enemies(r);for(let i=before;i<v.n;i++){const e=v.p.add(i*480);if(!isBoss(e)){freshStats(r,e,false,false);syncHealth(r,e);}}
    return number(r,0x590)>before;
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
      run=r;const t=time(r),p=r.add(0xca2).readU8(),world=r.add(0xca3).readU8();
      if(t+.5<state.clock||(p===0&&state.clock>0))reset();state.clock=t;
      if((r.add(0xc9d).readU8()?world:p)!==1)return;
      state.endless=!!r.add(0xc90).readU8()&&!!r.add(0xb10).readU32();
      const v=enemies(r),bosses=[];for(let i=0;i<v.n;i++){const e=v.p.add(i*480);if(alive(e)&&isBoss(e))bosses.push(e);}
      events(r,bosses.length);hazards(r,v,bosses);
      if(!controls.waves){state.nextWave=t+settings.bossInterval;return;}
      if(t<state.nextWave||bosses.length>=8)return;
      const zone=Math.max(0,zoneIndex(r)),extra=state.wave%4===3;state.affix=state.wave%4;
      const code=state.endless?((zone+state.finalCursor+1)%12)*5+4:((zone+state.wave+1)%12)*5+(state.wave+Math.floor(state.wave/12))%4;
      if(!summon(r,code))return;
      if(state.endless)state.finalCursor++;
      if(extra&&bosses.length<7){const second=state.endless?((zone+state.finalCursor+1)%12)*5+4:((zone+state.wave+7)%12)*5+(state.wave+Math.floor(state.wave/12))%4;
        if(summon(r,second)&&state.endless)state.finalCursor++;}
      state.wave++;state.lastSpawn=t;state.nextWave=t+settings.bossInterval;state.barrageUntil=t+settings.barrageDuration;state.barrageNext=t;
      notice(['Crossroads','Frenzy','Spellstorm','Double Trouble'][state.affix]+' — '+defs[code].name+'! Dodge the arrival barrage.',3);
    }finally{inMode=false;}
  }
  Interceptor.attach(at('runTick'),{onEnter(args){guarded(()=>tick(args[0]));}});
  Interceptor.attach(at('gameUpdate'),{onEnter(args){game=args[0];},onLeave(){guarded(()=>{
    if(game.add(16).readU64().toString()==='2'){run=NULL;state.transitionAt=0;return;}
    const r=game.add(16);run=r;
    const victoryPhase=r.add(0xc9d).readU8()?r.add(0xca3).readU8():r.add(0xca2).readU8();
    if(controls.autoEndless&&victoryPhase===5&&r.add(0xb10).readU32()&&!r.add(0xc90).readU8()){
      if(!state.transitionAt)state.transitionAt=Date.now()+750;
      if(Date.now()>=state.transitionAt)continueEndless(r);
    }else state.transitionAt=0;
    releaseNotice(r);
  });}});
  function status(){
    let match=null;if(!run.isNull())guarded(()=>{match={clock:time(run),phase:run.add(0xca2).readU8(),worldPhase:run.add(0xca3).readU8(),coop:!!run.add(0xc9d).readU8(),zone:zoneIndex(run)};});
    return {ready:!fault,fault,settings:{...settings},controls:{...controls},state:{...state},match,scaling:run.isNull()?null:scales(run),native:true};
  }
  rpc.exports={
    status,
    configure(candidate){
      if(!candidate||Object.keys(candidate).length!==Object.keys(schema).length||
        Object.entries(schema).some(([key,spec])=>!Number.isInteger(candidate[key])||candidate[key]<spec[1]||candidate[key]>spec[2])||
        candidate.eventGapMin>candidate.eventGapMax)return false;
      const t=state.clock;
      if(candidate.bossInterval!==settings.bossInterval)state.nextWave=t+candidate.bossInterval;
      if(candidate.hazardInterval!==settings.hazardInterval)state.nextHazard=t+candidate.hazardInterval;
      if(candidate.eventFirst!==settings.eventFirst&&state.eventCount===0)state.nextEvent=Math.max(t+1,candidate.eventFirst);
      if((candidate.eventGapMin!==settings.eventGapMin||candidate.eventGapMax!==settings.eventGapMax)&&!state.event&&state.eventCount>0)
        state.nextEvent=t+candidate.eventGapMin;
      settings={...candidate};return true;},
    control(name,enabled){if(!Object.hasOwn(controls,name))return false;controls[name]=!!enabled;return true;}
  };
  setInterval(()=>{if(Date.now()-lastStatus<950)return;lastStatus=Date.now();send({kind:'status',...status()});},1000);
  send({kind:'ready',version:profile.version,catalog:zones.map(z=>({key:z.key,name:z.name,bosses:z.bosses.map(b=>b.name)}))});
})();
