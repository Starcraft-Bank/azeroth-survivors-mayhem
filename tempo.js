/* Host simulation time only. Network transport and Windows clocks stay native. */
(() => {
 'use strict';
 globalThis.MAYHEM_TEMPO={setup({base,profile,getSettings,guarded,F,players,appendMessage,allocate,getGame,canSync=()=>true}){
  const address=base.add(profile.functions.runTick);
  // Keep Mayhem's nested XP, gold, AI and spawn interceptors active while the
  // original simulation executes inside this callback.
  const original=new NativeFunction(address,'void',['pointer','float'],{traps:'all'});
  let calls=0,scaledCalls=0,lastFactor=1,depth=0,counter=0,movementPackets=0;
  const speeds=new Map(),transport=profile.mapTravelFunctions&&typeof globalThis.makeGuestTransfer127==='function'
   ?globalThis.makeGuestTransfer127({base,profile}):null;
  const packet=Memory.alloc(32);
  const factor=()=>{const s=getSettings();return s.gameSpeedEnabled===1&&Number.isFinite(s.gameSpeedPercent)?Math.max(.5,Math.min(2,s.gameSpeedPercent/100)):1;};
  function movementPacket(r,p,speed,recipients,game){
   const hex=p.add(F(0x488)).readU64().toString(16).padStart(16,'0');
   const bytes=Array.from({length:8},(_,i)=>parseInt(hex.slice(14-i*2,16-i*2),16));
   let mask=0,body=[];
   for(let i=0;i<8;i++)if(bytes[i]){mask|=1<<i;body.push(bytes[i]);}
   body.unshift(mask);
   const tail=new ArrayBuffer(8),v=new DataView(tail);counter=(counter+1)>>>0;
   v.setUint32(0,counter,true);v.setFloat32(4,speed,true);body.push(...new Uint8Array(tail));
   const payload=allocate(body.length,1);if(payload.isNull())throw Error('Unable to allocate native speed update');
   payload.writeByteArray(body);packet.writeByteArray(new Uint8Array(32));
   packet.writeU64(body.length);packet.add(8).writePointer(payload);packet.add(16).writeU64(body.length);packet.add(24).writeU32(0xe2);
   // Force-speed packets from the ordinary Run queue target its owner. Send
   // the same native packet explicitly to vanilla guests as well. Their client
   // updates UnitSpeeds and acknowledges its own actor through normal transport.
   try{for(const recipient of recipients)transport.sendPacket(game,recipient.context,packet);}
   finally{appendMessage(r,packet);} // Queue owns payload, including if a guest leaves during send.
   movementPackets++;
  }
  function tick(r){
   const scale=factor();if(!transport||(scale===1&&!speeds.size))return;
   if(!canSync())return;
   const game=getGame();if(!game||game.isNull())return;
   const role=profile.mapTravel?.gameOffsets?.['0xd98']??0xd98;
   const recipients=game.add(role).readU32()===3?transport.connections(game):[];
   const length=r.add(F(0x2c0)).readU64().toNumber();
   if(length>128)throw Error('Invalid native zone key while synchronizing speed');
   const zone=r.add(F(0x2b8)).readPointer().readUtf8String(length),now=Date.now(),present=new Set();
   for(const p of players(r)){
    const id=p.add(F(0x488)).readU64().toString(),natural=p.add(F(0x4a0)+20).readFloat();
    if(!Number.isFinite(natural)||natural<=0||natural>100)throw Error('Invalid native player speed');
    const speed=Math.fround(7*natural*scale),old=speeds.get(id);present.add(id);
    // Never change native stats. Recompute bonuses are retained, OFF restores
    // the current natural value, and refresh catches joins/recreated map actors.
    if(!old||old.speed!==speed||old.zone!==zone||now-old.sentAt>=1000){
     movementPacket(r,p,speed,recipients,game);speeds.set(id,{speed,zone,sentAt:now});
    }
   }
   for(const id of speeds.keys())if(!present.has(id))speeds.delete(id);
   if(scale===1)speeds.clear();
  }
  const replacement=new NativeCallback((run,dt)=>{
   let scale=1;
   if(depth===0)guarded(()=>{
    scale=factor();
   });
   calls++;lastFactor=scale;if(scale!==1)scaledCalls++;
   // Native runTick dispatches either solo simulation or authoritative co-op
   // simulation, including every guest actor. Do not scale network deadlines.
   depth++;
   try{original(run,dt*scale);}finally{depth--;}
  },'void',['pointer','float']);
  Interceptor.replace(address,replacement);
  return {tick,reset(){speeds.clear();},status(){return {enabled:getSettings().gameSpeedEnabled===1,factor:lastFactor,calls,scaledCalls,movementPackets,movementSupported:!!transport};},
          // Keep callback and original alive for the entire owned game session.
          retained:[original,replacement]};
 }};
})();
