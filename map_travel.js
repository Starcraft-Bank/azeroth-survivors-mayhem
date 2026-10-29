/* Analysis-only native 0.127.0 transport helpers. Exact SHA256:
 * 3ef9d74c30bb6b435d739b3d960c8535486836c540e0d8c20f98549a6f1dcbbb.
 * Call synchronously on the native game thread. No UI or saves are changed here.
 * No Start/coopstart message is sent: that would reset guest reward validation time.
 */
globalThis.makeGuestTransfer127 = function ({base}) {
  const fn=(rva,result,args)=>new NativeFunction(base.add(rva),result,args,{traps:'all'});
  const encode=fn(0x5d14a90,'void',['pointer','pointer']);
  const flushPending=fn(0x5b91c30,'void',['pointer','pointer','pointer']);
  const free=fn(0x21d0,'void',['pointer','uint64','uint64']);
  const createHero=fn(0x5c19f70,'void',['pointer','pointer','uint8']);
  const sendLocal=fn(0x5bb2760,'void',['pointer','uint64','uint64','pointer']);
  const swap=fn(96788640,'void',['pointer','pointer']);
  const senders=new Map();
  function connections(game) {
    if(game.add(0xd98).readU32()!==3)throw Error('Expected native co-op host');
    const n=game.add(0xdd8).readU64().toNumber(),p=game.add(0xdd0).readPointer();
    if(n>63)throw Error('Invalid connection count');
    const rows=[];
    for(let i=0;i<n;i++){
      const row=p.add(i*0x4e8);
      if(row.readU8()===0||row.add(0x4e5).readU8()!==1)continue;
      rows.push({index:i,context:row.add(8).readU64().toNumber(),row});
    }
    return rows;
  }
  function sendEnum(game,context,message) {
    const matches=connections(game).filter(x=>x.context===context);
    if(matches.length!==1)throw Error('Expected exactly one live recipient for context '+context);
    const row=matches[0].row,obj=row.add(0x4c8).readPointer(),vt=row.add(0x4d0).readPointer();
    if(obj.isNull()||vt.isNull())throw Error('Missing recipient transport');
    flushPending(obj,vt,row.add(0x278));
    const out=Memory.alloc(24);out.writeByteArray(new Uint8Array(24));
    encode(out,message); // Borrows enum and its payload; output Vec owns its buffer.
    const cap=out.readU64(),data=out.add(8).readPointer(),length=out.add(16).readU64();
    try{
      const address=vt.add(0x18).readPointer(),key=address.toString();
      if(!senders.has(key))senders.set(key,new NativeFunction(address,'void',['pointer','pointer','uint64'],{traps:'all'}));
      senders.get(key)(obj,data,length);
    }finally{if(cap.compare(0)>0)free(data,cap,1);}
  }
  function sendPacket(game,context,packet) {
    // Borrow Packet32 body while serializer makes its owned wire buffer.
    const message=Memory.alloc(0x238);message.writeByteArray(new Uint8Array(0x238));
    message.writeU64(uint64('0x8000000000000006'));
    message.add(8).writeU64(packet.readU64());
    message.add(0x10).writePointer(packet.add(8).readPointer());
    message.add(0x18).writeU64(packet.add(0x10).readU64());
    message.add(0x20).writeU16(packet.add(0x18).readU16());
    sendEnum(game,context,message);
  }
  function heroToGuest(game,run,recipientContext,heroContext) {
    const n=run.add(0xa58).readU64().toNumber();
    if(n>63||heroContext<0||heroContext>n)throw Error('Invalid hero context');
    const saved=run.add(0xc78).readU64(),party=heroContext?run.add(0xa50).readPointer().add((heroContext-1)*2584):null;
    const out=Memory.alloc(32);out.writeByteArray(new Uint8Array(32));
    if(party)swap(run,party);
    try{
      run.add(0xc78).writeU64(heroContext);
      createHero(out,run,heroContext===recipientContext?1:0);
      try{sendPacket(game,recipientContext,out);}
      finally{const cap=out.readU64();if(cap.compare(0)>0)free(out.add(8).readPointer(),cap,1);}
    }finally{
      if(party)swap(run,party);
      run.add(0xc78).writeU64(saved);
    }
  }
  function localClients(game) {
    const n=game.add(0x1200).readU64().toNumber(),p=game.add(0x11f8).readPointer();
    if(n>63)throw Error('Invalid local client count');
    const rows=[];
    for(let i=0;i<n;i++)if(p.add(i*0xb0+0xa8).readU8()!==0)rows.push(i);
    return {p,n,active:rows};
  }
  function heroToLocal(game,run,heroContext) {
    const clients=localClients(game);
    if(clients.active.length!==1)throw Error('Expected exactly one active local engine client');
    const n=run.add(0xa58).readU64().toNumber();
    if(n>63||heroContext<0||heroContext>n)throw Error('Invalid hero context');
    const saved=run.add(0xc78).readU64(),party=heroContext?run.add(0xa50).readPointer().add((heroContext-1)*2584):null;
    const out=Memory.alloc(32);out.writeByteArray(new Uint8Array(32));
    if(party)swap(run,party);
    try{
      run.add(0xc78).writeU64(heroContext);
      createHero(out,run,heroContext===0?1:0);
      // Native sender consumes Packet32 body at5bb27e6..5bb27fc.
      sendLocal(clients.p,clients.n,clients.active[0],out);
    }finally{
      if(party)swap(run,party);
      run.add(0xc78).writeU64(saved);
    }
  }
  return {connections,sendPacket,heroToGuest,localClients,heroToLocal};
};

/* Analysis-only 0.127.0 helper. Evidence: protocol-5bf56d0.asm (Run drop),
 * protocol-5c4e0a0.asm (party ownership), protocol-5d16270.asm (snapshot clone).
 * Caller must run cleanup once at a native tick boundary, with no native iteration
 * active, immediately before the successful world transfer purges rendered objects.
 */
globalThis.makeTravelRewardsCleanup127=function({base,getIdentity}){
  const alloc=new NativeFunction(base.add(0x21c0),'pointer',['uint64','uint64']);
  const free=new NativeFunction(base.add(0x21d0),'void',['pointer','uint64','uint64']);
  const snapshotHook=Interceptor.attach(base.add(0x5d16270),{
    onEnter(args){
      const identity=getIdentity(args[1]);
      if(identity&&identity.originalZone){this.out=args[0];this.zone=identity.originalZone;}
    },
    onLeave(){
      if(!this.out)return;
      const out=this.out,cap=out.readU64(),old=out.add(8).readPointer(),len=out.add(16).readU64().toNumber();
      if(len<1||len>64)throw Error('Invalid native snapshot zone');
      if(old.readUtf8String(len)===this.zone)return;
      if(!/^[a-z0-9_]+$/.test(this.zone))throw Error('Invalid original zone');
      const temp=Memory.allocUtf8String(this.zone),owned=alloc(this.zone.length,1);
      if(owned.isNull())throw Error('Snapshot zone allocation failed');
      owned.writeByteArray(temp.readByteArray(this.zone.length));
      out.writeU64(this.zone.length);out.add(8).writePointer(owned);out.add(16).writeU64(this.zone.length);
      if(cap.compare(0)>0)free(old,cap,1);
    }
  });
  function plan(run){
    const vectors=[],drops=[];
    function vec(owner,offset,stride,label){
      const q=owner.add(offset),cap=q.readU64().toNumber(),n=q.add(16).readU64().toNumber(),p=q.add(8).readPointer();
      if(n>100000||cap<n||cap>1000000||(n&&p.isNull()))throw Error('Invalid '+label+' vector');
      const v={q,n,p,stride,label};vectors.push(v);return v;
    }
    function inner(e,offset,stride,alignment,optional){
      const cap=e.add(offset).readU64();
      if(optional&&cap.toString(16)==='ffffffffffffffff')return;
      const n=cap.toNumber();if(!n)return;
      if(n>1000000)throw Error('Invalid nested allocation');
      const p=e.add(offset+8).readPointer();if(p.isNull())throw Error('Missing nested allocation');
      drops.push({p,bytes:n*stride,alignment});
    }
    const enemy=vec(run,0x5b0,504,'enemies');
    for(let i=0;i<enemy.n;i++){
      const e=enemy.p.add(i*504);inner(e,0x18,4,4,true);inner(e,0,56,8,false);inner(e,0x58,4,4,true);
    }
    vec(run,0x5e0,128,'area hazards');vec(run,0x5f8,64,'world effects64');vec(run,0x610,32,'world effects32');
    vec(run,0x870,32,'native hazard indicators');
    const loot=vec(run,0x658,72,'loot/chests/powerups');
    for(let i=0;i<loot.n;i++)inner(loot.p.add(i*72),0,8,8,false);
    vec(run,0x6b8,40,'guardian records');
    vec(run,0x5c8,88,'host projectiles');vec(run,0x628,144,'host effects144');vec(run,0x640,120,'host effects120');
    const count=run.add(0xa58).readU64().toNumber(),party=run.add(0xa50).readPointer();
    if(count>63)throw Error('Invalid party count');
    for(let i=0;i<count;i++){
      const p=party.add(i*2584);
      if(p.readU32()===2)continue;
      vec(p,0x5e0,88,'guest projectiles');vec(p,0x5b0,144,'guest effects144');vec(p,0x5c8,120,'guest effects120');
    }
    return {vectors,drops};
  }
  function clearTransient(run){
    const p=plan(run),counts={}; // Validate every allocation before mutation.
    for(const v of p.vectors){counts[v.label]=(counts[v.label]||0)+v.n;v.q.add(16).writeU64(0);}
    for(const d of p.drops)free(d.p,d.bytes,d.alignment);
    // Outer allocations remain valid and reusable. Native death/reward routines never run.
    return counts;
  }
  function hazardIds(run){
    const p=plan(run),ids=new Set();
    for(const v of p.vectors){
      if(v.label==='area hazards')for(let i=0;i<v.n;i++){const e=v.p.add(i*128);if(e.add(0x7e).readU8()===1)ids.add(e.add(0x3c).readU32());}
      if(v.label==='native hazard indicators')for(let i=0;i<v.n;i++)ids.add(v.p.add(i*32+8).readU32());
    }
    return Array.from(ids);
  }
  return {clearTransient,hazardIds,inspect:run=>Object.fromEntries(plan(run).vectors.map(v=>[v.label,v.n])),detach(){snapshotHook.detach();}};
};

// Core factory appended to the independently validated transport helpers.
(() => {
  'use strict';
  globalThis.AZS_MAP_TRAVEL = {setup(api) {
    const {profile,base,getRun,getGame}=api, notice=api.notice||(()=>{});
    if(profile.sha256!=='3ef9d74c30bb6b435d739b3d960c8535486836c540e0d8c20f98549a6f1dcbbb') {
      const reason='Map travel requires the verified native 0.127.0 game';
      return {request(){throw Error(reason);},tick(){},reset(){},catalog(){return [];},status(){return {supported:false,busy:false,canTravel:false,reason,currentZone:'',originZone:'',catalog:[]};}};
    }
    const fn=(r,result,args)=>new NativeFunction(base.add(r),result,args,{traps:'all'});
    const alloc=fn(0x21c0,'pointer',['uint64','uint64']),free=fn(0x21d0,'void',['pointer','uint64','uint64']);
    const load=fn(0x5b9ae00,'pointer',['pointer','pointer','uint64','pointer','float','pointer','uint64']);
    const transport=makeGuestTransfer127({base});
    const reserveUi=fn(profile.functions.reserveUi,'void',['pointer']),flush=fn(profile.functions.flushMessages,'void',['pointer']);
    // Exact native Arc release: atomically decrement strong, call drop_slow(&Arc)
    // only on zero. drop_slow handles every World allocation and weak reference.
    const dropCode=Memory.alloc(Process.pageSize);
    Memory.protect(dropCode,Process.pageSize,'rwx');
    dropCode.writeByteArray([0x48,0x83,0xec,0x28,0x48,0x89,0x4c,0x24,0x20,0xf0,0x48,0xff,0x09,0x75,0x11,0x48,0x8d,0x4c,0x24,0x20,0x48,0xb8,0,0,0,0,0,0,0,0,0xff,0xd0,0x48,0x83,0xc4,0x28,0xc3]);
    dropCode.add(22).writePointer(base.add(0x5b81f10));
    Memory.protect(dropCode,Process.pageSize,'rx');
    const dropArc=new NativeFunction(dropCode,'void',['pointer'],{traps:'all'});
    const mapNames={0:'Azeroth',1:'Kalimdor',30:'PVPZone01',189:'MonasteryInstances',489:'PVPZone03',529:'PVPZone04',533:'Stratholme Raid'};
    const zones=[];
    for(let id=0;id<12;id++){
      const p=base.add(profile.zoneTable+id*profile.zoneStride),map=p.add(0xc0).readU32();
      const key=p.add(8).readPointer().readUtf8String(p.add(16).readU64().toNumber());
      const name=p.add(24).readPointer().readUtf8String(p.add(32).readU64().toNumber());
      if(!mapNames[map]||!/^[a-z0-9_]{1,32}$/.test(key))throw Error('Invalid map catalog');
      zones.push({id,key,name,map,p,xyz:[0xc8,0xcc,0xd0].map(x=>p.add(x).readFloat()),facing:p.add(0xd4).readFloat(),radius:p.add(0xd8).readFloat()});
    }
    let queued=null,pending=null,owner='',lastClock=-1,identityRun=null,originalZone='',lastError='',lastZone='',completed=0,nextAt=0,protectUntil=0,protectedHits=0;
    const protectedRun=r=>!!(identityRun&&r.equals(identityRun)&&Date.now()<protectUntil);
    globalThis.AZS_MAP_TRAVEL_PROTECTED=protectedRun;
    const damageCallbacks=[];
    if(api.externalDamageGuard!==true){
      const address=base.add(0x5c12330),types=['pointer','float','uint64','uint32'];
      const original=new NativeFunction(address,'void',types);
      const callback=new NativeCallback((r,damage,attacker,flags)=>{if(damage>0&&protectedRun(r)){protectedHits++;return;}original(r,damage,attacker,flags);},'void',types);
      damageCallbacks.push(original,callback);Interceptor.replace(address,callback);
    }
    const cleanup=makeTravelRewardsCleanup127({base,getIdentity:r=>identityRun&&r.equals(identityRun)?{originalZone}:null});
    const readKey=r=>r.add(0x2d0).readPointer().readUtf8String(r.add(0x2d8).readU64().toNumber());
    const catalog=()=>zones.map(({id,key,name,map})=>({id,key,name,map}));
    function reset(newMatch=false){queued=null;pending=null;lastError='';nextAt=0;if(newMatch){owner='';lastClock=-1;lastZone='';originalZone='';identityRun=null;completed=0;protectUntil=0;protectedHits=0;}}
    function state(r,g,requireLive){
      if(!r||r.isNull()||!g||g.isNull())throw Error('Start a match as the host first');
      if(g.add(0xd98).readU32()===1)throw Error('Only the host can change maps');
      if(r.add(0xc78).readU64().toString()!=='0')throw Error('Wait for the host simulation');
      if(requireLive&&r.add(0xd83).readU8()!==1)throw Error('Close choices and resume the match before travelling');
      const count=r.add(0xa58).readU64().toNumber(),members=r.add(0xa50).readPointer();
      if(!Number.isSafeInteger(count)||count<0||count>32)throw Error('Invalid party');
      const clients=transport.localClients(g);
      if(clients.active.length!==1)throw Error('Expected one active local game client');
      const recipients=g.add(0xd98).readU32()===3?transport.connections(g):[];
      if(recipients.some(x=>x.context<1||x.context>count)||new Set(recipients.map(x=>x.context)).size!==recipients.length)throw Error('Party recipients are inconsistent');
      if(requireLive&&recipients.some(x=>members.add((x.context-1)*0xa18+0xa14).readU8()===2))throw Error('Wait for every player to finish choosing an upgrade');
      return {count,members,recipients,clients};
    }
    function keySnapshot(p){const cap=p.add(0x2c8).readU64(),ptr=p.add(0x2d0).readPointer(),len=p.add(0x2d8).readU64();if(cap.toNumber()>1048576||len.toNumber()>32)throw Error('Invalid owned zone string');return {p,cap,ptr,len,xyz:[0,4,8,12].map(o=>p.add(0x520+o).readU32())};}
    function releaseKey(k){if(k.cap.compare(0)>0)free(k.ptr,k.cap,1);}
    function prepare(r,s,z){
      const result={arc:null,keys:[],old:[],oldArc:r.add(0xc18).readPointer(),committed:false};
      try{
        result.old.push(keySnapshot(r));for(let i=0;i<s.count;i++)result.old.push(keySnapshot(s.members.add(i*0xa18)));
        const owned=new Set();for(const old of result.old)if(old.cap.compare(0)>0){if(owned.has(old.ptr.toString()))throw Error('Unexpected shared owned zone string');owned.add(old.ptr.toString());}
        for(const old of result.old){const p=alloc(z.key.length,1);if(p.isNull())throw Error('Zone key allocation failed');p.writeByteArray(Array.from(z.key,c=>c.charCodeAt(0)));result.keys.push({ptr:p,cap:uint64(z.key.length)});}
        result.arc=alloc(0xd8,8);if(result.arc.isNull())throw Error('World allocation failed');
        result.arc.writeByteArray(new Uint8Array(0xd8));result.arc.writeU64(1);result.arc.add(8).writeU64(1);
        const name=Memory.allocUtf8String(mapNames[z.map]),xyz=Memory.alloc(12);z.xyz.forEach((v,i)=>xyz.add(i*4).writeFloat(v));
        const bounds=z.p.add(0xec).readU8()?z.p.add(0x58).readPointer():ptr(0);
        load(result.arc.add(0x10),name,mapNames[z.map].length,xyz,z.radius+20,bounds,z.p.add(0x60).readU64());
        result.loaded=true;
        const n=result.arc.add(0x20).readU64().toNumber();
        if(!Number.isSafeInteger(n)||n<1||n>10000000)throw Error('Destination terrain is unavailable');
        result.arc.add(0x18).readPointer().readU8();
        return result;
      }catch(e){disposePrepared(result);throw e;}
    }
    function disposePrepared(p){if(p.committed)return;for(const k of p.keys)releaseKey(k);p.keys=[];if(p.arc&&!p.arc.isNull()){if(p.loaded)dropArc(p.arc);else free(p.arc,0xd8,8);p.arc=null;}}
    function commit(r,p,z){
      try{
        for(let i=0;i<p.old.length;i++){const target=p.old[i].p,k=p.keys[i];target.add(0x2c8).writeU64(k.cap);target.add(0x2d0).writePointer(k.ptr);target.add(0x2d8).writeU64(z.key.length);z.xyz.forEach((v,n)=>target.add(0x520+n*4).writeFloat(v));target.add(0x52c).writeFloat(z.facing);}
        r.add(0xc18).writePointer(p.arc);
      }catch(e){for(const old of p.old){old.p.add(0x2c8).writeU64(old.cap);old.p.add(0x2d0).writePointer(old.ptr);old.p.add(0x2d8).writeU64(old.len);old.xyz.forEach((v,n)=>old.p.add(0x520+n*4).writeU32(v));}r.add(0xc18).writePointer(p.oldArc);disposePrepared(p);throw e;}
      p.committed=true;
      for(const old of p.old)releaseKey(old);
      dropArc(p.oldArc);
    }
    function loginPacket(z){const out=Memory.alloc(32),body=alloc(20,1);if(body.isNull())throw Error('Transfer packet allocation failed');out.writeByteArray(new Uint8Array(32));body.writeU32(z.map);z.xyz.forEach((v,i)=>body.add(4+i*4).writeFloat(v));body.add(16).writeFloat(z.facing);out.writeU64(20);out.add(8).writePointer(body);out.add(16).writeU64(20);out.add(24).writeU16(0x236);return out;}
    function endHazardUi(r,s,ids){
      if(!ids.length)return;
      const contexts=[0,...s.recipients.map(x=>x.context)],owned=[];
      // Allocate every payload before queueing any UI change.
      try{for(const context of contexts)for(const id of ids){const text=JSON.stringify({type:'hzend',id}),p=alloc(text.length,1);if(p.isNull())throw Error('Hazard cleanup allocation failed');p.writeByteArray(Array.from(text,c=>c.charCodeAt(0)));owned.push({context,p,n:text.length,moved:false});}}
      catch(e){for(const item of owned)free(item.p,item.n,1);throw e;}
      const saved=r.add(0xc78).readU64();
      try{for(const context of contexts){r.add(0xc78).writeU64(context);for(const item of owned){if(item.context!==context)continue;const n=r.add(0x698).readU64().toNumber();if(n>=r.add(0x688).readU64().toNumber())reserveUi(r.add(0x688));const target=r.add(0x690).readPointer().add(n*24);target.writeU64(item.n);target.add(8).writePointer(item.p);target.add(16).writeU64(item.n);r.add(0x698).writeU64(n+1);item.moved=true;}flush(r);}}
      finally{r.add(0xc78).writeU64(saved);for(const item of owned)if(!item.moved)free(item.p,item.n,1);}
    }
    const sendLocal=fn(0x5bb2760,'void',['pointer','uint64','uint64','pointer']);
    function sendLogin(g,s,packet){let consumed=false;const errors=[];try{for(const row of s.recipients){try{transport.sendPacket(g,row.context,packet);}catch(e){errors.push('Player '+row.context+': '+String(e.message||e));}}consumed=true;sendLocal(s.clients.p,s.clients.n,s.clients.active[0],packet);}finally{if(!consumed)free(packet.add(8).readPointer(),packet.readU64(),1);}return errors;}
    function request(zone){const z=typeof zone==='string'?zones.find(x=>x.key===zone):zones.find(x=>x.id===zone);if(!z)throw Error('Choose a valid destination');if(queued!==null||pending)throw Error('A map transfer is already in progress');if(Date.now()<nextAt)throw Error('Wait a few seconds between map transfers');state(getRun(),getGame(),true);queued=z.id;lastError='';return {queued:true,zone:z.name};}
    function tick(r){
      const g=getGame();if(!r||r.isNull()||!g||g.isNull())return;
      if(g.add(0xd98).readU32()===1)return;
      if(r.add(0xd83).readU8()===0){reset(true);return;}
      const clock=r.add(0xcc0).readFloat(),key=String(r)+':'+r.add(0x4b0).readU64().toString();
      if(owner&&(key!==owner||clock<lastClock-1)){reset(true);}owner=key;lastClock=clock;
      try{
        if(pending){if(Date.now()<pending.at)return;pending.attempts++;const s=state(r,g,false);for(let h=0;h<=s.count;h++)transport.heroToLocal(g,r,h);for(const row of s.recipients)for(let h=0;h<=s.count;h++)transport.heroToGuest(g,r,row.context,h);lastZone=pending.zone.name;pending=null;completed++;nextAt=Date.now()+5000;notice('Arrived in '+lastZone);return;}
        if(queued===null)return;
        const s=state(r,g,true),z=zones[queued];queued=null;
        if(readKey(r)===z.key)throw Error('Already in '+z.name);
        cleanup.inspect(r);const hazardIds=cleanup.hazardIds(r); // Validate before mutation.
        const origin=originalZone||readKey(r);
        const packet=loginPacket(z);let prepared;
        try{prepared=prepare(r,s,z);}catch(e){free(packet.add(8).readPointer(),packet.readU64(),1);throw e;}
        try{endHazardUi(r,s,hazardIds);commit(r,prepared,z);}catch(e){disposePrepared(prepared);free(packet.add(8).readPointer(),packet.readU64(),1);throw e;}
        originalZone=origin;identityRun=r;protectUntil=Date.now()+5000;
        try{cleanup.clearTransient(r);}catch(e){lastError='World moved, but old-entity cleanup reported: '+String(e.message||e);}
        if(api.onCommit){try{api.onCommit();}catch(e){lastError='World moved, but mode cleanup reported: '+String(e.message||e);}}
        pending={at:Date.now()+1200,zone:z,attempts:0};const sendErrors=sendLogin(g,s,packet);if(sendErrors.length)lastError=sendErrors.join('; ');notice('Travelling to '+z.name+(sendErrors.length?' (a guest disconnected during transfer)':''));
      }catch(e){queued=null;lastError=String(e.message||e);notice('Map travel: '+lastError);if(pending){if(pending.attempts>=3)pending=null;else pending.at=Date.now()+1200;}}
    }
    function status(){let reason='',currentZone='';const busy=queued!==null||!!pending;try{const r=getRun(),g=getGame();state(r,g,true);currentZone=readKey(r);if(busy)reason='A map transfer is in progress';else if(Date.now()<nextAt)reason='Wait a few seconds between transfers';}catch(e){reason=String(e.message||e);}return {supported:true,busy,canTravel:!reason,reason,currentZone,originZone:originalZone,catalog:catalog(),queued,completed,error:lastError,protectedHits,protectionSeconds:Math.max(0,(protectUntil-Date.now())/1000)};}
    // NativeFunction stores an address, not ownership of Memory.alloc storage.
    // Keep executable thunk memory explicitly rooted for the module's lifetime.
    return {request,tick,status,catalog,reset,_nativeResources:[dropCode,dropArc,...damageCallbacks]};
  }};
})();
