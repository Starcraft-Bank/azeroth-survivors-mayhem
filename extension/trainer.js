/* The patcher is also exercised under Node by test_patch.cjs. */
(() => {
  'use strict';
  const spec = globalThis.AZS_PATCH_SPEC;
  const hex = s => Uint8Array.from(s.match(/../g) || [], b => parseInt(b, 16));
  const concat = parts => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) { out.set(part, at); at += part.length; }
    return out;
  };
  const bytes = (...parts) => concat(parts);
  const leb = n => {
    const out = [];
    do { const b = n & 127; n = Math.floor(n / 128); out.push(b | (n ? 128 : 0)); } while (n);
    return Uint8Array.from(out);
  };
  const read = (b, p) => {
    let n = 0, shift = 0, c;
    do { c = b[p++]; n += (c & 127) * 2 ** shift; shift += 7; } while (c & 128);
    return [n, p];
  };
  const section = (id, body) => bytes(Uint8Array.of(id), leb(body.length), body);
  const hash = async b => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b)),
    n => n.toString(16).padStart(2, '0')).join('');
  const exportEntry = (name, kind, index) => {
    const s = new TextEncoder().encode(name);
    return bytes(leb(s.length), s, Uint8Array.of(kind), leb(index));
  };

  async function patch(input, testExports = false) {
    const b = input instanceof Uint8Array ? input : new Uint8Array(input);
    const digest = await hash(b);
    const spec = [globalThis.AZS_PATCH_SPEC, ...(globalThis.AZS_PATCH_SPEC.alternatives || [])].find(item => item.bytes === b.length && item.sha256 === digest);
    if (!spec) {
      throw new Error('Unsupported game build. No patch applied; this trainer needs updating.');
    }
    const output = [b.subarray(0, 8)];
    let p = 8, imports = 0;
    while (p < b.length) {
      const id = b[p], [length, start] = read(b, p + 1), end = start + length;
      let body = b.subarray(start, end);
      if (id === 2) {
        // WASM-bindgen's exact-build imports are all functions; verify, do not assume silently.
        let [n, q] = read(body, 0);
        for (let i = 0; i < n; i++) {
          let len; [len, q] = read(body, q); q += len;
          [len, q] = read(body, q); q += len;
          if (body[q++] !== 0) throw new Error('Unexpected non-function import.');
          [, q] = read(body, q); imports++;
        }
      } else if (id === 3) {
        const additions = spec.additionalFunctions || [];
        if (additions.length) {
          const [n, q] = read(body, 0);
          body = bytes(leb(n + additions.length), body.subarray(q), ...additions.map(f => leb(f.type)));
        }
      } else if (id === 6) {
        const [n, q] = read(body, 0);
        if (n !== spec.globalCount) throw new Error('Global layout mismatch.');
        body = bytes(leb(n + Object.keys(spec.globals).length), body.subarray(q), hex(spec.globalEntries));
      } else if (id === 7) {
        const [n, q] = read(body, 0);
        const extra = Object.entries(spec.globals).filter(([name]) => testExports || name === 'gamePointer' || name.startsWith('mode')).map(([name, index]) =>
          exportEntry('__azs_' + name, 3, index));
        for (const f of spec.additionalFunctions || []) if (f.export && (testExports || f.export === '__azs_mode_updateScaling')) extra.push(exportEntry(f.export, 0, f.index));
        if (testExports) {
          extra.push(exportEntry('__azs_test_hurt', 0, spec.nativeFunctions?.[1239] ?? 1239));
          extra.push(exportEntry('__azs_test_cast', 0, spec.nativeFunctions?.[927] ?? 927));
          extra.push(exportEntry('__azs_test_live_cast', 0, spec.nativeFunctions?.[1979] ?? 1979));
          extra.push(exportEntry('__azs_test_reroll', 0, spec.nativeFunctions?.[20355] ?? 20355));
          extra.push(exportEntry('__azs_test_chest', 0, spec.nativeFunctions?.[20954] ?? 20954));
          extra.push(exportEntry('__azs_test_gold_pickup', 0, spec.nativeFunctions?.[28509] ?? 28509));
          extra.push(exportEntry('__azs_test_xp_gain', 0, spec.nativeFunctions?.[3235] ?? 3235));
          extra.push(exportEntry('__azs_test_choice', 0, spec.nativeFunctions?.[1462] ?? 1462));
          extra.push(exportEntry('__azs_test_mob_spawn', 0, spec.nativeFunctions?.[5719] ?? 5719));
          extra.push(exportEntry('__azs_test_endless', 0, spec.nativeFunctions?.[39039] ?? 39039));
          extra.push(exportEntry('__azs_test_enemyDamage', 0, spec.nativeFunctions?.[953] ?? 953));
          extra.push(exportEntry('__azs_test_offer', 0, spec.nativeFunctions?.[2089] ?? 2089));
          extra.push(exportEntry('__azs_test_serialize', 0, spec.nativeFunctions?.[1048] ?? 1048));
          extra.push(exportEntry('__azs_test_unseal', 0, spec.nativeFunctions?.[27319] ?? 27319));
          extra.push(exportEntry('__azs_test_allocate', 0, spec.nativeFunctions?.[106160] ?? 106160));
        }
        body = bytes(leb(n + extra.length), body.subarray(q), ...extra);
      } else if (id === 10) {
        const [n, q] = read(body, 0);
        let at = q;
        const parts = [leb(n + (spec.additionalFunctions || []).length)];
        for (let i = 0; i < n; i++) {
          const [size, begin] = read(body, at);
          const edits = spec.edits.filter(e => e.function === i + imports);
          let fn = body.subarray(begin, begin + size);
          if (edits.length) {
            if (await hash(fn) !== spec.bodyHashes[i + imports]) throw new Error('Function mismatch.');
            for (const edit of edits.sort((a, b) => b.offset - a.offset)) {
              const before = hex(edit.before), after = hex(edit.after);
              if (before.some((v, j) => fn[edit.offset + j] !== v)) throw new Error('Patch anchor mismatch.');
              fn = bytes(fn.subarray(0, edit.offset), after, fn.subarray(edit.offset + before.length));
            }
          }
          parts.push(leb(fn.length), fn);
          at = begin + size;
        }
        for (const added of spec.additionalFunctions || []) {
          const fn = hex(added.body);
          parts.push(leb(fn.length), fn);
        }
        body = concat(parts);
      }
      output.push(section(id, body));
      p = end;
    }
    return bytes(...output);
  }
  globalThis.AzsPatch = { patch, spec };
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (location.hostname !== 'wow.aethus.pl' || window.top !== window.self) return;
  if (window.azsTrainer) return;

  // Runtime bridge and mode panel only. No manual actions or keyboard shortcuts.
  const original={compile:WebAssembly.compile.bind(WebAssembly),instantiate:WebAssembly.instantiate.bind(WebAssembly)};
  const state={ready:false,status:'Waiting for game…',runActive:false,runPhase:0,currentZone:0};
  let exports,host,root;
  const render=()=>{if(root)root.querySelector('#status').textContent=state.status;};
  const status=message=>{state.status=message;render();};
  for(const name of ['requestFullscreen','webkitRequestFullscreen']){
    const request=Element.prototype[name];
    if(typeof request==='function')Element.prototype[name]=function(...args){
      return request.apply(this instanceof HTMLCanvasElement && this.id==='benilla'?document.documentElement:this,args);
    };
  }
  const bind=result=>{
    const instance=result instanceof WebAssembly.Instance?result:result.instance;
    if(instance?.exports.__azs_modeEnabled){
      exports=instance.exports;state.ready=true;state.status='Ready · Legendary Mayhem';
      window.azsModeAttach?.(exports);render();
    }
    return result;
  };
  async function compile(input){
    const view=input instanceof ArrayBuffer?new Uint8Array(input):new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
    if(view.length<50_000_000)return original.compile(input);
    status('Checking game build…');
    try{
      const module=await original.compile(await patch(view));status('Custom mode compiled · starting game…');return module;
    }catch(error){
      state.ready=false;status(error.message);console.error('[Legendary Mayhem]',error);
      return original.compile(input);
    }
  }
  WebAssembly.compile=compile;
  WebAssembly.compileStreaming=async response=>compile(await (await response).arrayBuffer());
  WebAssembly.instantiate=async(source,imports,...rest)=>{
    if(source instanceof WebAssembly.Module)return bind(await original.instantiate(source,imports,...rest));
    const module=await compile(source),instance=await original.instantiate(module,imports,...rest);
    bind(instance);return {module,instance};
  };
  WebAssembly.instantiateStreaming=async(response,imports,...rest)=>WebAssembly.instantiate(await (await response).arrayBuffer(),imports,...rest);
  function pollRun(){
    if(!exports)return;
    const memory=exports.memory.buffer,game=exports.__azs_gamePointer.value>>>0,run=game+16,view=new DataView(memory);
    state.runActive=false;state.runPhase=0;
    if(game && run+2144<memory.byteLength && view.getBigUint64(run,true)!==2n){
      state.runPhase=view.getUint8(run+2138);
      state.runActive=[1,2].includes(state.runPhase) && view.getUint32(run+1920,true)!==0;
      const p=view.getUint32(run+184,true),n=view.getUint32(run+188,true);
      if(n<=64 && p+n<=memory.byteLength){
        const key=new TextDecoder().decode(new Uint8Array(memory,p,n));
        const zone=spec.catalog.findIndex(item=>item.key===key);if(zone>=0)state.currentZone=zone;
      }
    }
  }
  function mount(){
    if(!document.documentElement || host)return;
    host=document.createElement('div');host.id='azs-trainer-panel';
    host.style.cssText='position:fixed;inset:auto;bottom:12px;right:12px;margin:0;padding:0;border:0;background:transparent;z-index:2147483647;max-width:calc(100vw - 24px)';
    if(typeof host.showPopover==='function')host.popover='manual';
    root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      :host{color-scheme:dark}*{box-sizing:border-box}section{width:270px;max-height:calc(100dvh - 270px);overflow:auto;overscroll-behavior:contain;background:#121820f2;color:#eef5fc;border:1px solid #4d6174;border-radius:12px;padding:12px;font:13px/1.45 system-ui;box-shadow:0 8px 32px #0008}
      header{display:flex;justify-content:space-between;align-items:center;font-weight:650;position:sticky;top:-12px;background:#121820;padding:4px 0;z-index:1}header button{width:auto;padding:1px 8px;margin:0}
      #status{font-size:11px;color:#aec1d2;margin:7px 0;overflow-wrap:anywhere}button,select{font:inherit;color:inherit;border:1px solid #53677a;border-radius:6px;background:#25313e;padding:7px;cursor:pointer}button{width:100%;margin:4px 0;text-align:left}button:disabled{opacity:.5;cursor:default}label{display:block;margin-top:6px}select{width:100%;margin-top:4px}small{display:block;font-size:11px;color:#afbfcc;margin-top:8px}[hidden]{display:none!important}
      details{border:1px solid #53677a;border-radius:6px;padding:7px;margin:7px 0}summary{cursor:pointer;font-weight:600}
    </style><section aria-label="Legendary Mayhem custom mode"><header>LEGENDARY MAYHEM <button id="collapse" aria-label="Collapse mode panel">−</button></header><div id="body"><div id="status" role="status"></div></div></section>`;
    root.querySelector('#collapse').onclick=event=>{
      const body=root.querySelector('#body');body.hidden=!body.hidden;event.target.textContent=body.hidden?'+':'−';
    };
    document.documentElement.append(host);
    const raise=()=>{if(host.popover==='manual'){if(host.matches(':popover-open'))host.hidePopover();host.showPopover();}};
    raise();document.addEventListener('fullscreenchange',raise);document.addEventListener('webkitfullscreenchange',raise);render();
  }
  window.azsTrainer={get state(){return {...state};}};
  setInterval(pollRun,250);mount();
  if(!host)new MutationObserver((_,observer)=>{mount();if(host)observer.disconnect();}).observe(document,{childList:true,subtree:true});
})();
