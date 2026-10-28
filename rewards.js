/* Native reward mechanics. Version-specific sites are reviewed in profile.rewards. */
(() => {
  'use strict';
  globalThis.MAYHEM_REWARDS={setup(api){
    const {profile,base,F,guarded,notice,time,players,getSettings}=api,p=profile.rewards;
    if(!p)return {tick(){},bossReward(){},milestone(){},status:()=>({supported:false})};
    const loot=new NativeFunction(base.add(p.spawnLoot),'void',['pointer','uint32','uint32','pointer'],{traps:'all'});
    const xyz=Memory.alloc(12),maxQueue=80;
    let owner='',last=-1,nextPickup=0,nextChest=0,kills=0,tier=0,queued=[],spawned=0,pickups=0,chests=0,filtered=0,capped=0;
    const setting=(name,fallback)=>getSettings()[name]??fallback;
    function reset(r,t){owner=String(r);last=t;nextPickup=t+setting('pickupInterval',25);nextChest=t+setting('chestInterval',75);kills=0;tier=0;queued=[];spawned=0;pickups=0;chests=0;}
    for(const site of p.costSites)Interceptor.attach(base.add(site.rva),function(){guarded(()=>{
      const c=this.context,cap=Math.min(1000,Math.max(100,setting('rerollCap',1000)));
      const overflow=(c[site.overflowRegister].toUInt32()&1)!==0,value=c[site.costRegister].toUInt32();
      if(overflow||value>cap){c[site.costRegister]=ptr(cap);c[site.overflowRegister]=c[site.overflowRegister].and(ptr('0xfffffffffffffffe'));capped++;}
    });});
    // Skip a banned definition at the native candidate-loop boundary. The
    // game's own weighting, equipment limits, uniqueness and RNG remain intact.
    Interceptor.attach(base.add(p.jewelryLoop),function(){guarded(()=>{
      if(!setting('banLuck',1))return;
      let offset=this.context.r14.toUInt32();
      if(offset%p.jewelryStride||offset>p.jewelryCount*p.jewelryStride)throw Error('Invalid jewelry iterator');
      while(offset<p.jewelryCount*p.jewelryStride&&base.add(p.jewelryTable+offset+p.jewelryStatOffset).readU8()===p.luckStat){offset+=p.jewelryStride;filtered++;}
      this.context.r14=ptr(offset);
    });});
    const pos=player=>[0x4f0,0x4f4,0x4f8].map(o=>player.add(F(o)).readFloat());
    function queue(kind,amount,position){
      if(queued.length>=maxQueue||!Array.isArray(position)||position.length!==3||!position.every(Number.isFinite))return false;
      queued.push({kind,amount:Math.min(100000,Math.max(1,Math.floor(amount))),position:[...position]});return true;
    }
    function ring(r,kind,amount,radius=9){
      const group=players(r);group.forEach((player,i)=>{const v=pos(player),a=(i/Math.max(1,group.length))*Math.PI*2+Math.random()*Math.PI;v[0]+=Math.cos(a)*radius;v[1]+=Math.sin(a)*radius;queue(kind,amount,v);});
    }
    function milestone(r,position){tier++;queue(2,1,position||pos(r));queue(3+(tier%4),1,position||pos(r));notice('Mayhem bounty '+tier+' — bonus chest and power-up!',2);}
    function bossReward(r,position,kind='boss'){
      const t=time(r);if(owner!==String(r)||t<last-1)reset(r,t);
      const v=position||pos(r),m=Math.max(0,t/60),boost=(kind==='mayhem'?2:1)*(1+Math.min(tier,20)*.1);
      queue(1,Math.ceil((75+15*m)*boost),v);queue(0,Math.ceil((35+8*m)*boost),[v[0]+2,v[1],v[2]]);
      kills++;if(kills%Math.max(1,setting('rewardEvery',3))===0)milestone(r,[v[0]-2,v[1],v[2]]);
    }
    function tick(r){
      const t=time(r);if(owner!==String(r)||t<last-1)reset(r,t);last=t;
      if(t>=nextPickup){ring(r,3+Math.floor(Math.random()*4),1);nextPickup=t+setting('pickupInterval',25);}
      if(t>=nextChest){ring(r,2,1,12);nextChest=t+setting('chestInterval',75);}
      let budget=4;
      while(budget--&&queued.length){
        const count=r.add(p.lootLengthOffset).readU64().toNumber();if(count>=500)break;
        const item=queued.shift();item.position.forEach((n,i)=>xyz.add(i*4).writeFloat(n));loot(r,item.kind,item.amount,xyz);spawned++;if(item.kind===2)chests++;else if(item.kind>=3)pickups++;
      }
    }
    return {tick,bossReward,milestone,reset(){owner='';last=-1;queued=[];kills=0;tier=0;spawned=0;pickups=0;chests=0;},status:()=>({supported:true,kills,tier,queued:queued.length,spawned,pickups,chests,filtered,capped,nextPickup,nextChest})};
  }};
})();
