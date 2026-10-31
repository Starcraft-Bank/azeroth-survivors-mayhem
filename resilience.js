/* Best-effort feature initialization. No version or instruction-pattern gate. */
(() => {
 'use strict';
 const failures=[],seen=new Set();let current=null;
 function report(name,error){const reason=String(error?.message||error),key=name+': '+reason;
  if(!seen.has(key)){seen.add(key);failures.push(key);send({kind:'feature-unavailable',feature:name,error:reason});}
 }
 globalThis.AZS_FEATURE_FAILURES=failures;
 const attach=Interceptor.attach.bind(Interceptor),replace=Interceptor.replace.bind(Interceptor),replacements=new Map();
 const executable=address=>{if(!Process.findRangeByAddress(address)?.protection.includes('x'))throw Error('Hook address is not executable memory.');};
 globalThis.AZS_HOOKS={
  attach(address,...args){try{executable(address);const listener=attach(address,...args);current?.undo.push(()=>listener.detach());return listener;}
   catch(error){report(current?.name||'Hook '+address,error);return {detach(){}};}},
  replace(address,...args){try{executable(address);const key=String(address),previous=replacements.get(key),result=replace(address,...args);replacements.set(key,args);
    current?.undo.push(()=>{Interceptor.revert(address);if(previous){replace(address,...previous);replacements.set(key,previous);}else replacements.delete(key);});return result;}
   catch(error){report(current?.name||'Hook '+address,error);}}
 };
 function fallback(name){return new Proxy({}, {get(_,key){
  if(key==='status')return ()=>({supported:false,busy:false,canTravel:false,reason:name+' is unavailable.'});
  if(key==='catalog')return ()=>({zones:[],bosses:[],guardians:[]});
  if(key==='speed')return ()=>1;
  if(key==='request')return ()=>({ok:false,error:name+' is unavailable.'});
  return ()=>false;
 }});}
 const labels={MAYHEM_RUN_AFFIXES:'Run affixes',AZS_TRAINER_COMBAT:'Combat controls',AZS_TRAINER_ECONOMY:'Economy controls',AZS_TRAINER_ACTIONS:'Spawn and match actions',AZS_MAP_TRAVEL:'Map travel',MAYHEM_INCOME:'XP scaling',MAYHEM_POPULATION:'Population controls',MAYHEM_TEMPO:'Game speed',MAYHEM_AFFIXES:'Affixes',MAYHEM_REWARDS:'Bonus rewards',MAYHEM_PERMANENT_REWARDS:'Permanent rewards',MAYHEM_EFFECTS:'Death effects'};
 for(const [key,name] of Object.entries(labels)){
  const object=globalThis[key];if(!object?.setup)continue;const setup=object.setup;
  object.setup=function(api){const parent=current,context={name,undo:[]},disabled=fallback(name);let failed=false,instance;
   const defaults=Object.fromEntries(Object.entries(globalThis.AZS_SCHEMA||globalThis.MAYHEM_SCHEMA||{}).map(([k,v])=>[k,v[0]]));
   const invoke=fn=>{if(failed)return null;try{return fn();}catch(error){failed=true;report(name,error);return null;}};
   current=context;
   try{instance=setup({...api,...(api.guarded?{guarded:invoke}:{}),...(api.getSettings?{getSettings:()=>failed?defaults:api.getSettings()}: {})});}
   catch(error){failed=true;report(name,error);for(const undo of context.undo.reverse()){try{undo();}catch(_){}}return disabled;}
   finally{current=parent;}
   return new Proxy(instance,{get(target,key){if(failed)return disabled[key];const value=target[key];if(typeof value!=='function')return value;
    return (...args)=>{if(failed)return disabled[key](...args);try{return value.apply(target,args);}catch(error){failed=true;report(name,error);return disabled[key](...args);}};
   }});
  };
 }
})();
