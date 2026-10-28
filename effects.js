/* Native packet effects. IDs verified against the shipped Data/patch.MPQ DBCs.
 * Source evidence: benilla-protocol/messages/spells.rs and sound/net.rs;
 * creature_anim/spell_visual.rs routes a pure DEST_LOCATION to GroundBurst.
 * These packets only play client visuals/audio; they do not cast game abilities.
 */
globalThis.MAYHEM_EFFECTS = (() => {
  'use strict';
  const SOUND = Object.freeze({warning:8959, ready:8960, reward:888});
  // Both rows have no cast kit and an ungated destination effect. This avoids
  // animating the host or relying on the dead boss remaining in GuidIndex.
  const DEST_SPELLS = Object.freeze([19473,24391]);
  function packedGuid(value) {
    let n=BigInt(value.toString()),mask=0;const bytes=[];
    for(let i=0;i<8;i++){const b=Number((n>>BigInt(i*8))&255n);if(b){mask|=1<<i;bytes.push(b);}}
    return [mask,...bytes];
  }
  function destinationPacket(caster,spell,xyz) {
    if(!Array.isArray(xyz)||xyz.length!==3||!xyz.every(Number.isFinite))throw new Error('Invalid effect position');
    const guid=packedGuid(caster),bytes=new Uint8Array(guid.length*2+22),v=new DataView(bytes.buffer);
    bytes.set(guid,0);bytes.set(guid,guid.length);let p=guid.length*2;
    v.setUint32(p,spell,true);p+=4;v.setUint16(p,0x100,true);p+=2;
    bytes[p++]=0;bytes[p++]=0; // No hits and no misses: visual only.
    v.setUint16(p,0x40,true);p+=2;
    for(const n of xyz){v.setFloat32(p,n,true);p+=4;}
    return bytes;
  }
  function setup(api) {
    const message=Memory.alloc(32);let lastSound=-Infinity,lastCelebration=-Infinity;
    function packet(r,opcode,bytes){
      const data=api.allocate(bytes.length,1);if(data.isNull())return false;
      data.writeByteArray(Array.from(bytes));message.writeU64(bytes.length);
      message.add(8).writePointer(data);message.add(16).writeU64(bytes.length);message.add(24).writeU64(opcode);
      api.appendMessage(r,message);return true;
    }
    function sound(r,id,minDelay=1200){
      if(api.getSettings&&api.getSettings().soundEnabled===0)return false;
      const now=Date.now();if(now-lastSound<minDelay)return false;
      const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,id,true);
      if(!packet(r,722,b))return false;lastSound=now;return true;
    }
    function announcement(r,priority){return sound(r,Number(priority)>=3?SOUND.warning:Number(priority)===2?SOUND.reward:SOUND.ready);}
    function reward(r){return sound(r,SOUND.reward);}
    function death(r,enemyGuid,xyz,kit=2085){
      // The old code attached every firework to the host. Use the boss GUID for
      // its rocket kit; then add durable destination bursts at its cached death
      // position, which continue even when the boss entity is immediately reaped.
      const now=Date.now();if(now-lastCelebration<180)return false;
      if(!Array.isArray(xyz)||xyz.length!==3||!xyz.every(Number.isFinite))return false;
      const caster=r.add(api.F(0x488)).readU64();
      const burst=destinationPacket(caster,DEST_SPELLS[0],xyz);
      const cap=destinationPacket(caster,DEST_SPELLS[1],[xyz[0],xyz[1],xyz[2]+0.25]);
      packet(r,306,burst);packet(r,306,cap);
      if(enemyGuid!==undefined&&enemyGuid!==null){
        const b=new Uint8Array(12),v=new DataView(b.buffer);
        v.setBigUint64(0,BigInt(enemyGuid.toString()),true);
        v.setUint32(8,[2084,2085,2086,2087,2088].includes(kit)?kit:2085,true);packet(r,499,b);
      }
      // The DBC's firework-boom row exists but its WAVs are absent from the
      // shipped MPQs. The included level-up chime provides a reliable reward cue.
      sound(r,SOUND.reward,700);lastCelebration=now;return true;
    }
    function reset(){lastSound=-Infinity;lastCelebration=-Infinity;}
    return {announcement,reward,death,reset};
  }
  return {setup,packedGuid,destinationPacket,SOUND,DEST_SPELLS};
})();
