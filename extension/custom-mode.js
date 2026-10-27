/* Local-only Legendary Mayhem UI. Game-clock waves and mutations live in WASM. */
(() => {
  'use strict';
  if (location.hostname !== 'wow.aethus.pl' || window.top !== window.self) return;
  let wasm, root, panel, fault='', wasSettingsLocked;
  const preferenceKey='azs.mayhem.preferences.v1';
  const defaults={damagePreset:1,legendaryStart:0,legendaryInterval:10,eventMask:15};
  function validPreferences(candidate){
    return candidate && [0,1,2].includes(candidate.damagePreset) &&
      Number.isInteger(candidate.legendaryStart) && candidate.legendaryStart>=0 && candidate.legendaryStart<=30 &&
      Number.isInteger(candidate.legendaryInterval) && candidate.legendaryInterval>=1 && candidate.legendaryInterval<=30 &&
      Number.isInteger(candidate.eventMask) && candidate.eventMask>=0 && candidate.eventMask<=15;
  }
  let preferences={...defaults};
  try{const saved=JSON.parse(localStorage.getItem(preferenceKey));if(validPreferences(saved))preferences={...saved};}catch{}
  const capture=error=>{const message=String(error?.message||error||'');if(/unreachable|out of bounds|wasm|WebAssembly/i.test(message))fault=message.slice(0,180);};
  addEventListener('error',event=>capture(event.error||event.message));
  addEventListener('unhandledrejection',event=>capture(event.reason));
  function matchState(){
    if(!wasm)return {};
    const game=wasm.__azs_gamePointer.value>>>0,run=game+16,d=new DataView(wasm.memory.buffer);
    if(!game||run+2144>d.byteLength||d.getBigUint64(run,true)===2n)return {present:false,fault};
    return {present:true,phase:d.getUint8(run+2138),worldPhase:d.getUint8(run+2139),coop:!!d.getUint8(run+2133),
      nativeEndless:!!(d.getUint8(run+2120)&1),won:!!d.getUint32(run+368,true),fault};
  }
  const affixes=['Crossroads','Frenzy','Spellstorm','Double Trouble'];
  const events=['','Treasure Rush','Guardian Hunt','Berserker Rush','Rune Storm'];
  const catalog=AZS_PATCH_SPEC.catalog;
  const value=name=>wasm?.['__azs_'+name]?.value ?? 0;
  const set=(name,n)=>{if(wasm?.['__azs_'+name])wasm['__azs_'+name].value=n;};
  const settingsLocked=()=>{const match=matchState();return (!!match.present && match.phase!==0) || (!match.present && value('modeClock')>0);};
  function applyPreferences(){
    if(!wasm)return;
    set('modeDamagePreset',preferences.damagePreset);
    set('modeLegendaryStart',preferences.legendaryStart*60);
    set('modeLegendarySpacing',preferences.legendaryInterval*60);
    set('modeEventMask',preferences.eventMask);
    set('modeEventsEnabled',preferences.eventMask?1:0);
    wasm.__azs_mode_updateScaling(0);
    set('modeAnnouncedLegendaryStage',value('modeLegendaryCount'));
  }
  function fillSettings(){
    if(!panel)return;
    panel.querySelector('#pref-damage').value=String(preferences.damagePreset);
    panel.querySelector('#pref-legendary-start').value=String(preferences.legendaryStart);
    panel.querySelector('#pref-legendary-interval').value=String(preferences.legendaryInterval);
    for(const input of panel.querySelectorAll('[data-event-bit]'))input.checked=!!(preferences.eventMask&Number(input.dataset.eventBit));
  }
  function changePreferences(candidate){
    if(settingsLocked() || !validPreferences(candidate))return false;
    preferences={damagePreset:candidate.damagePreset,legendaryStart:candidate.legendaryStart,
      legendaryInterval:candidate.legendaryInterval,eventMask:candidate.eventMask};
    let saved=true;try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));}catch{saved=false;}
    applyPreferences();fillSettings();
    if(panel)panel.querySelector('#mode-setup-hint').textContent=saved?'Saved for your next match.':'Applied for this session; browser storage is unavailable.';
    return true;
  }
  const name=code=>{
    if(!Number.isInteger(code)||code<0)return '';
    const zone=catalog[Math.floor(code/5)];
    return zone ? (zone.bosses[code%5]?.name||'Boss')+' · '+zone.name : 'Boss';
  };
  const time=n=>{n=Math.max(0,Math.ceil(n));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
  function mount() {
    root=document.querySelector('#azs-trainer-panel')?.shadowRoot;
    if(!root||panel)return;
    root.querySelector('header').firstChild.textContent='LEGENDARY MAYHEM ';
    const style=document.createElement('style');style.textContent=`
      #mayhem{padding:10px;border:1px solid #a88648;border-radius:9px;background:linear-gradient(145deg,#192b3d,#211c31);margin:8px 0}
      #mayhem .top{display:flex;align-items:center;justify-content:space-between;gap:6px}#mayhem .phase{font-size:10px;padding:3px 5px;border:1px solid #6d8099;border-radius:5px;color:#c4d8f1}
      #mayhem .timer{font-size:26px;color:#ffe0a1;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.2;margin:8px 0 2px}
      #mayhem .mutator{color:#dfb6ff;margin:5px 0}#mayhem .next{font-size:12px;line-height:1.4;color:#edf5ff}
      #mayhem .metrics{font-size:11px;color:#bfd0df;line-height:1.6;margin:8px 0}#mayhem button{padding:6px;font-size:12px}
      #mayhem .defaults{color:#83e7ba;font-size:11px}#mayhem .hint{font-size:10px;color:#b8cadc;margin-top:6px}
      #mayhem .danger{color:#ffba82}#mayhem-help{font-size:11px}
      #mode-setup{margin:8px 0;padding:7px;border:1px solid #59677d;border-radius:6px}
      #mode-setup summary{cursor:pointer;color:#ffe0a1}#mode-setup fieldset{border:0;padding:0;margin:7px 0}
      #mode-setup label{display:block;margin:6px 0;font-size:11px}#mode-setup select{width:100%}
      #mode-setup input[type=number]{width:58px;padding:4px}#mode-setup .event-options{display:grid;grid-template-columns:1fr 1fr;gap:0 6px}
      #mode-setup .event-options label{font-size:10px}#mode-setup input[type=checkbox]{width:auto}
      #mode-setup fieldset:disabled{opacity:.6}
    `;root.append(style);
    panel=document.createElement('div');panel.id='mayhem';panel.innerHTML=`
      <div class="top"><b>LEGENDARY MAYHEM</b><span class="phase" id="mode-phase">HOST ONLY</span></div>
      <details id="mode-setup" open><summary id="mode-setup-summary">Pre-match settings</summary>
      <fieldset id="mode-setup-fields">
        <label>Boss damage<select id="pref-damage"><option value="0">Gentler — original curve</option><option value="1">Balanced — halfway (default)</option><option value="2">Brutal — previous build</option></select></label>
        <label>First guaranteed Legendary at <input id="pref-legendary-start" type="number" min="0" max="30" step="1" aria-label="First Legendary minute"> minutes</label>
        <label>Add another every <input id="pref-legendary-interval" type="number" min="1" max="30" step="1" aria-label="Legendary interval minutes"> minutes · max 3</label>
        <div class="event-options"><label><input type="checkbox" data-event-bit="8"> Rune Storm</label><label><input type="checkbox" data-event-bit="1"> Treasure Rush</label><label><input type="checkbox" data-event-bit="2"> Guardian Hunt</label><label><input type="checkbox" data-event-bit="4"> Berserker Rush</label></div>
        <button type="button" id="pref-defaults">Restore defaults</button>
      </fieldset><div class="hint" id="mode-setup-hint">Choose before starting. Settings lock for the match.</div></details>
      <div class="timer" id="mode-timer">2:00</div><div id="mode-caption">until the first extra wave</div>
      <div class="mutator" id="mode-mutator">Crossroads</div><div class="next" id="mode-next">Start a match on the host.</div>
      <div class="metrics" id="mode-metrics">Growing bosses · stronger mobs · native abilities</div>
      <div class="mutator" id="mode-event">Events begin after the match starts</div>
      <div class="defaults" id="mode-rewards">Gold drops ×1.25 · 1 guaranteed Legendary</div>
      <button id="mode-auto-endless">Automatic endless: ON</button><button id="mode-events">Random events: ON</button><button id="mode-pause">Pause extra waves</button><button id="mode-hazards">Arena hazards: ON</button><button id="mode-effects">Boss-kill fireworks: ON</button>
      <details id="mayhem-help"><summary>Mode rules</summary>
      <small>Run this custom mode on the HOST only. Friends join using the normal game.<br><br>
      Extra bosses every 2 minutes of game time. Wave warnings use the game's own announcements. Frenzy speeds bosses up; Spellstorm brings faster spells; every fourth wave is Double Trouble.<br><br>
      Defeating the map's final boss earns the normal victory rewards and automatically continues into endless for the party. Endless rotates through every map's final boss.<br><br>
      Ground hazards every 20 seconds, plus a warning when a player stays still for 6 seconds. Move out of the circles during their 2.5-second wind-up. These are damaging zones, not solid walls.<br><br>
      Rune Storm brings three rapid waves of warning circles. Treasure Rush doubles gold income for 30 seconds; Guardian Hunt adds a cross-map rare; Berserker Rush strengthens new reinforcements for 20 seconds. Events are spaced apart and avoid Double Trouble.<br><br>
      All bosses are much tougher; Mayhem bosses gain another 3× health, 30% damage and faster casts. Boss pressure is capped at 8 alive bosses.<br><br>
      Earn gold normally with a growing pickup bonus. <span id="mode-legendary-rule"></span> Remaining choices and gear use normal rarity.</small></details>`;
    const body=root.querySelector('#body'),status=root.querySelector('#status');
    status.after(panel);
    fillSettings();
    panel.querySelector('#mode-setup-fields').onchange=()=>{
      const start=panel.querySelector('#pref-legendary-start').value,interval=panel.querySelector('#pref-legendary-interval').value;
      const candidate={damagePreset:Number(panel.querySelector('#pref-damage').value),legendaryStart:start===''?NaN:Number(start),
        legendaryInterval:interval===''?NaN:Number(interval),eventMask:[...panel.querySelectorAll('[data-event-bit]:checked')].reduce((mask,input)=>mask|Number(input.dataset.eventBit),0)};
      if(!changePreferences(candidate)){fillSettings();panel.querySelector('#mode-setup-hint').textContent=settingsLocked()?'Settings are locked until you leave this match.':'Use whole minutes: start 0–30, interval 1–30.';}
    };
    panel.querySelector('#pref-defaults').onclick=()=>changePreferences({...defaults});
    panel.querySelector('#mode-auto-endless').onclick=()=>set('modeAutoEndless',value('modeAutoEndless')?0:1);
    panel.querySelector('#mode-events').onclick=()=>set('modeEventsEnabled',value('modeEventsEnabled')?0:1);
    panel.querySelector('#mode-pause').onclick=()=>set('modeWavesEnabled',value('modeWavesEnabled')?0:1);
    panel.querySelector('#mode-effects').onclick=()=>set('modeEffectsEnabled',value('modeEffectsEnabled')?0:1);
    panel.querySelector('#mode-hazards').onclick=()=>set('modeHazardsEnabled',value('modeHazardsEnabled')?0:1);
  }
  function update() {
    mount();if(!panel||!wasm)return;
    const wave=value('modeWave'),clock=value('modeClock'),endless=!!value('modeEndless'),
      active=azsTrainer.state.runActive,running=!!value('modeWavesEnabled'),blocked=!!value('modePressureBlocked'),
      next=value('modeNextBoss'),extra=value('modeNextExtra'),due=Math.max(0,value('modeNextDue')-clock),match=matchState();
    const locked=settingsLocked();
    panel.querySelector('#mode-setup-fields').disabled=locked;
    panel.querySelector('#mode-setup-summary').textContent=locked?'Match settings · locked':'Pre-match settings';
    if(wasSettingsLocked!==locked){panel.querySelector('#mode-setup').open=!locked;wasSettingsLocked=locked;}
    root.querySelector('#status').textContent=azsTrainer.state.ready?'Mayhem 0.4.1 · Host controls this match':azsTrainer.state.status;
    panel.querySelector('#mode-phase').textContent=endless?'ENDLESS UNLOCKED':'FINALS LOCKED';
    panel.querySelector('#mode-timer').textContent=fault?'GAME ERROR':!active?(match.present?'WAITING':'2:00'):!running?'PAUSED':blocked?'BOSS LIMIT':time(due);
    panel.querySelector('#mode-caption').textContent=fault?fault:active?'Wave '+(wave+1)+' · '+value('modeAliveBosses')+'/8 bosses alive':match.present?'Game phase '+match.phase+(match.coop?' · shared phase '+match.worldPhase:'')+' · progression retained':'Start a match on the host';
    panel.querySelector('#mode-mutator').textContent='Next: '+affixes[wave%4]+(extra>=0?' · 2 bosses':'');
    panel.querySelector('#mode-next').textContent=active?(blocked?'Defeat a boss to release the next wave.':name(next)+(extra>=0?' + '+name(extra):'')):'A different map arrives every two minutes.';
    panel.querySelector('#mode-metrics').textContent='Normal boss HP ×'+value('modeBossHp').toFixed(1)+' · Mayhem HP ×'+(value('modeBossHp')*3).toFixed(1)+
      '\nBoss damage ×'+value('modeBossDamage').toFixed(2)+' · Mayhem ×'+(value('modeBossDamage')*1.3).toFixed(2)+
      '\nNormal ability rate ×'+(1/Math.max(.01,value('modeBossCooldown'))).toFixed(2)+' · mobs HP ×'+value('modeMobHp').toFixed(2);
    panel.querySelector('#mode-metrics').style.whiteSpace='pre-line';
    panel.querySelector('#mode-rewards').textContent='Gold drops ×'+value('modeGoldMultiplier').toFixed(2)+' · '+(value('modeLegendaryCount')?value('modeLegendaryCount')+' guaranteed Legendary choice'+(value('modeLegendaryCount')>1?'s':''):'Legendary guarantee starts at '+time(preferences.legendaryStart*60));
    panel.querySelector('#mode-legendary-rule').textContent='New offers guarantee 1 Legendary '+(preferences.legendaryStart?'from '+preferences.legendaryStart+' minutes':'from the start')+', 2 from '+(preferences.legendaryStart+preferences.legendaryInterval)+', and 3 from '+(preferences.legendaryStart+2*preferences.legendaryInterval)+' minutes.';
    panel.querySelector('#mode-event').textContent=!preferences.eventMask?'No event types selected':!value('modeEventsEnabled')?'Events paused':value('modeEventKind')?events[value('modeEventKind')]+' · '+time(value('modeEventUntil')-clock)+' remaining':'Next event in '+time(value('modeNextEvent')-clock)+(value('modeEventCount')===0 && (preferences.eventMask&8)?' · Rune Storm':'');
    panel.querySelector('#mode-auto-endless').textContent='Automatic endless: '+(value('modeAutoEndless')?'ON':'OFF');
    panel.querySelector('#mode-events').textContent='Random events: '+(value('modeEventsEnabled')?'ON':'OFF');
    panel.querySelector('#mode-events').disabled=!preferences.eventMask;
    panel.querySelector('#mode-pause').textContent=running?'Pause extra waves':'Resume · next wave in 2 minutes';
    panel.querySelector('#mode-effects').textContent='Boss-kill fireworks: '+(value('modeEffectsEnabled')?'ON':'OFF');
    panel.querySelector('#mode-hazards').textContent='Arena hazards: '+(value('modeHazardsEnabled')?'ON':'OFF')+' · 20s + camping';
  }
  window.azsModeAttach=exports=>{wasm=exports;applyPreferences();update();};
  window.azsMayhem={get preferences(){return {...preferences};},setPreferences:changePreferences,get state(){return {wave:value('modeWave'),clock:value('modeClock'),endless:!!value('modeEndless'),settingsLocked:settingsLocked(),
    nextBoss:value('modeNextBoss'),nextExtra:value('modeNextExtra'),nextDue:value('modeNextDue'),bossesAlive:value('modeAliveBosses'),
    bossHp:value('modeBossHp'),bossDamage:value('modeBossDamage'),bossCooldown:value('modeBossCooldown'),
    mobHp:value('modeMobHp'),kills:value('modeKills'),wavesEnabled:!!value('modeWavesEnabled'),
    hazardBursts:value('modeHazardBursts'),campBursts:value('modeCampBursts'),nextHazard:value('modeNextHazard'),hazardsEnabled:!!value('modeHazardsEnabled'),
    goldMultiplier:value('modeGoldMultiplier'),legendaryChoices:value('modeLegendaryCount'),endlessRecoveries:value('modeEndlessRecoveries'),autoEndless:!!value('modeAutoEndless'),autoTransitions:value('modeAutoTransitions'),eventKind:value('modeEventKind'),eventUntil:value('modeEventUntil'),nextEvent:value('modeNextEvent'),eventCount:value('modeEventCount'),eventsEnabled:!!value('modeEventsEnabled'),huntTarget:value('modeHuntTarget'),huntCount:value('modeHuntCount'),match:matchState()};}};
  setInterval(update,200);mount();
})();
