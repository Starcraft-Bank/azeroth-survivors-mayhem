/* Keep Endless Mayhem bosses eligible for the game's own permanent rewards. */
globalThis.MAYHEM_PERMANENT_REWARDS={setup({profile,base,F,getState,knownBoss,homeFinal}){
  const p=profile.permanentRewards;
  if(!p)return {status:()=>({supported:false,eligible:0})};
  let eligible=0;
  AZS_HOOKS.attach(base.add(p.bossReward),{onEnter(args){
    if(!getState().endless)return;
    const r=args[0],known=knownBoss(args[1]);
    if(!known||!r.add(F(0xc90)).readU8()||!r.add(F(0xb10)).readU32())return;
    const canonical=homeFinal(r,known);
    if(!canonical||canonical.isNull())return;
    // Change this reward call only. Enemy identity, win state and phases stay native.
    args[1]=canonical;eligible++;
  }});
  return {status:()=>({supported:true,eligible})};
}};
