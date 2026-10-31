"""Owned-process Windows overlay. Insert is sampled only while the game/panel is focused."""
import ctypes
import math,queue,threading
from ctypes import wintypes as w
import tkinter as tk
from tkinter import ttk
from settings import DEFAULTS, SCHEMA, PRESETS, CONTROLS, validate_settings

CHOICES={'hazardPattern':('Mixed','Scatter','Broken ring','Cross','Lanes','Spiral'),'banLuck':('Off','On'),'soundEnabled':('Off','On'),'extraHazards':('Off','On')}
CHOICES.update({k:('Off','On') for k in ['gameSpeedEnabled','hasteEnabled','xpScalingEnabled','goldScalingEnabled','affixesEnabled','runAffixesEnabled','idleEnabled']})
CHOICES['nativeAffixMode']=('Game default','Disabled','Custom')
BG='#101722'; CARD='#182334'; TEXT='#e6edf7'; MUTED='#99abc2'; GOLD='#ffd183'

class InsertHotkey:
    """Event-driven Insert only; other applications and other keys pass through."""
    def __init__(self,bridge,panel):
        self.events=queue.Queue();self.bridge=bridge;self.panel=panel;self.thread_id=0
        self.error='';self.stopping=False;self.down=False
        self.thread=threading.Thread(target=self.listen,daemon=True);self.thread.start()
    def listen(self):
        user=ctypes.WinDLL('user32',use_last_error=True);kernel=ctypes.WinDLL('kernel32',use_last_error=True)
        callback_type=ctypes.WINFUNCTYPE(ctypes.c_ssize_t,ctypes.c_int,w.WPARAM,w.LPARAM)
        user.SetWindowsHookExW.argtypes=[ctypes.c_int,callback_type,w.HINSTANCE,w.DWORD];user.SetWindowsHookExW.restype=w.HANDLE
        user.CallNextHookEx.argtypes=[w.HANDLE,ctypes.c_int,w.WPARAM,w.LPARAM];user.CallNextHookEx.restype=ctypes.c_ssize_t
        user.UnhookWindowsHookEx.argtypes=[w.HANDLE];user.GetMessageW.argtypes=[ctypes.POINTER(w.MSG),w.HWND,w.UINT,w.UINT]
        kernel.GetModuleHandleW.argtypes=[w.LPCWSTR];kernel.GetModuleHandleW.restype=w.HMODULE
        kernel.GetCurrentThreadId.restype=w.DWORD
        @callback_type
        def callback(code,event,data):
            if code>=0 and ctypes.cast(data,ctypes.POINTER(w.DWORD))[0]==0x2d:
                if event in (0x101,0x105):self.down=False
                elif event in (0x100,0x104):
                    first=not self.down;self.down=True
                    if self.bridge.hwnd and self.bridge.focused(self.panel):
                        if first:self.events.put(True)
                        return 1
            return user.CallNextHookEx(None,code,event,data)
        self.thread_id=kernel.GetCurrentThreadId()
        hook=user.SetWindowsHookExW(13,callback,kernel.GetModuleHandleW(None),0)
        if not hook:self.error='Insert shortcut unavailable. Use Open overlay on the launcher.';return
        try:
            msg=w.MSG()
            while not self.stopping and user.GetMessageW(ctypes.byref(msg),None,0,0)>0:pass
        finally:user.UnhookWindowsHookEx(hook)
    def stop(self):
        self.stopping=True
        if self.thread_id:
            api=ctypes.WinDLL('user32');api.PostThreadMessageW.argtypes=[w.DWORD,w.UINT,w.WPARAM,w.LPARAM]
            api.PostThreadMessageW(self.thread_id,0x12,0,0)

class GameWindow:
    def __init__(self):
        self.api=ctypes.WinDLL('user32',use_last_error=True)
        specs={
            'GetForegroundWindow':([],w.HWND), 'GetAncestor':([w.HWND,w.UINT],w.HWND),
            'GetWindowThreadProcessId':([w.HWND,ctypes.POINTER(w.DWORD)],w.DWORD),
            'IsWindowVisible':([w.HWND],w.BOOL), 'IsIconic':([w.HWND],w.BOOL),
            'GetAsyncKeyState':([ctypes.c_int],ctypes.c_short),
            'GetClientRect':([w.HWND,ctypes.POINTER(w.RECT)],w.BOOL),
            'ClientToScreen':([w.HWND,ctypes.POINTER(w.POINT)],w.BOOL),
            'SetForegroundWindow':([w.HWND],w.BOOL),
        }
        for name,(args,result) in specs.items():
            fn=getattr(self.api,name);fn.argtypes=args;fn.restype=result
        self.callback=ctypes.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)
        self.api.EnumWindows.argtypes=[self.callback,w.LPARAM];self.api.EnumWindows.restype=w.BOOL
        self.hwnd=None

    def owner(self,hwnd):
        pid=w.DWORD();self.api.GetWindowThreadProcessId(hwnd,ctypes.byref(pid));return pid.value

    def find(self,pid):
        matches=[]
        @self.callback
        def visit(hwnd,_):
            if self.owner(hwnd)==pid and self.api.IsWindowVisible(hwnd):
                r=w.RECT();self.api.GetClientRect(hwnd,ctypes.byref(r))
                if r.right>400 and r.bottom>250:matches.append((r.right*r.bottom,hwnd))
            return True
        self.api.EnumWindows(visit,0);self.hwnd=max(matches)[1] if matches else None
        return self.hwnd

    def rect(self):
        if not self.hwnd or self.api.IsIconic(self.hwnd):return None
        r=w.RECT();p=w.POINT()
        if not self.api.GetClientRect(self.hwnd,ctypes.byref(r)):return None
        self.api.ClientToScreen(self.hwnd,ctypes.byref(p))
        return p.x,p.y,r.right,r.bottom

    def focused(self,panel):
        hwnd=self.api.GetForegroundWindow()
        return bool(hwnd and (hwnd==self.hwnd or self.api.GetAncestor(hwnd,3)==self.api.GetAncestor(panel,3)))

    def insert_down(self):return bool(self.api.GetAsyncKeyState(0x2d)&0x8000)
    def focus_game(self):
        if self.hwnd:self.api.SetForegroundWindow(self.hwnd)


class Overlay:
    def __init__(self,app,settings,controls):
        self.app=app;self.bridge=GameWindow();self.visible=False;self.down=False;self.last_geometry=None
        self.window=tk.Toplevel(app.window);self.window.withdraw();self.window.overrideredirect(True)
        self.window.configure(bg=GOLD);self.window.attributes('-topmost',True)
        self.window.bind('<Escape>',lambda e:self.hide())
        self.window.protocol('WM_DELETE_WINDOW',self.hide)
        self.hotkey=InsertHotkey(self.bridge,self.window.winfo_id())
        body=tk.Frame(self.window,bg=BG);body.pack(fill='both',expand=True,padx=1,pady=1)
        head=tk.Frame(body,bg=BG);head.pack(fill='x',padx=24,pady=(18,8))
        tk.Label(head,text='LEGENDARY  /  MAYHEM',bg=BG,fg=GOLD,font=('Segoe UI',17,'bold')).pack(side='left')
        tk.Button(head,text='INS  ×',command=self.hide,bg=CARD,fg=TEXT,relief='flat',bd=0,padx=12,pady=7).pack(side='right')
        self.summary=tk.StringVar(value='HOST CONTROL PANEL  ·  Ready')
        tk.Label(body,textvariable=self.summary,bg=BG,fg=MUTED,font=('Segoe UI',10),anchor='w').pack(fill='x',padx=24,pady=(0,14))
        self.tabs=ttk.Notebook(body);self.tabs.pack(fill='both',expand=True,padx=18)
        self.vars={key:tk.StringVar(value=PRESETS[value] if key.endswith('Preset') else CHOICES[key][value] if key in CHOICES else str(value)) for key,value in settings.items() if key not in ('eventMask','affixMask','nativeAffixMask','runAffixMask')}
        self.flags={key:tk.BooleanVar(value=value) for key,value in controls.items()}
        self.events=[tk.BooleanVar(value=bool(settings['eventMask']&(1<<i))) for i in range(4)]
        self.affix_flags={key:[tk.BooleanVar(value=bool(settings[key]&(1<<i))) for i in range(5 if key=='runAffixMask' else 3)] for key in ['affixMask','nativeAffixMask','runAffixMask']}
        self.pages={};self.sections={};self.affix_settings_panels={}
        for title in ['Combat','Population','Rewards','Affixes','Session']:
            outer=ttk.Frame(self.tabs);self.tabs.add(outer,text='  '+title+'  ')
            canvas=tk.Canvas(outer,bg=BG,highlightthickness=0)
            bar=ttk.Scrollbar(outer,orient='vertical',command=canvas.yview)
            bar.pack(side='right',fill='y');canvas.pack(side='left',fill='both',expand=True)
            page=ttk.Frame(canvas,padding=12);handle=canvas.create_window((0,0),window=page,anchor='nw')
            page.bind('<Configure>',lambda e,c=canvas:c.configure(scrollregion=c.bbox('all')))
            canvas.bind('<Configure>',lambda e,c=canvas,h=handle:c.itemconfigure(h,width=e.width))
            canvas.configure(yscrollcommand=bar.set);self.pages[title]=page
            def wheel(e,c=canvas):c.yview_scroll(-int(e.delta/120),'units');return 'break'
            # One toplevel binding routes the wheel to the selected page.
            outer._wheel=wheel
        self.window.bind('<MouseWheel>',self.scroll)
        p=self.pages['Combat']
        self.heading(p,'Boss encounters','Tune boss strength and the extra Mayhem wave schedule.')
        self.field(p,'Boss health','healthPreset');self.field(p,'Boss damage','damagePreset')
        self.field(p,'Boss movement · %','bossSpeedPercent')
        self.check(p,'Extra cross-map boss waves','waves')
        self.field(p,'Mayhem boss interval · seconds','bossInterval')
        self.note(p,'Health and damage changes affect new enemies. Movement affects living and newly spawned bosses. Existing bosses retain their health and damage scaling.')
        combat_page=self.pages['Combat']
        p=self.section(combat_page,'Arena hazards','Normal ground hazards remain separate from Rune Storm and affix difficulty.')
        self.check(p,'Arena hazards enabled','hazards')
        self.field(p,'Obstacle formation','hazardPattern');self.field(p,'Native cone and line attacks','extraHazards')
        for label,key in [('Obstacle damage','hazardPreset'),('Damage growth · % per minute','hazardGrowth'),('Normal circles · per player','hazardCount'),('Normal interval · seconds','hazardInterval')]:self.field(p,label,key)
        self.note(p,'2.5-second warnings; up to 128 circles shared across players. Normal hazards use 20% max HP (25–250) before obstacle difficulty, growth and defenses.')
        p=self.section(combat_page,'Boss arrival barrage','Ground hazards during the opening of a Mayhem boss fight.')
        for label,key in [('Circles · per player','barrageCount'),('Interval · tenths of a second','barrageIntervalTenths'),('Duration · seconds','barrageDuration')]:self.field(p,label,key)
        self.note(p,'Uses the Arena hazards switch and obstacle damage settings. 25 tenths = 2.5 seconds. Base damage: 25% max HP (35–350), before defenses.')
        p=self.section(combat_page,'Idle-player punishment','Separate from affixes: circles appear beneath players who stay still.')
        self.setting_toggle(p,'Idle-player punishment ON / OFF','idleEnabled')
        self.field(p,'Trigger after standing still · seconds','campSeconds')
        self.note(p,'Uses the obstacle count and damage settings above, with its own ON/OFF switch. It works even when arena hazards and affixes are OFF. Moving resets the timer; affix difficulty does not change idle punishment.')
        p=self.pages['Population']
        self.heading(p,'Normal enemies','Control how quickly mobs arrive, how many can be alive and how fast they move.')
        self.field(p,'Normal mob movement · %','mobSpeedPercent')
        self.field(p,'Mob spawn rate · %','spawnRatePercent')
        self.field(p,'Mob density · %','mobDensityPercent')
        self.note(p,'100% keeps the existing Mayhem rate. Spawn rate changes ordinary scheduled arrivals; boss waves and scripted summons keep their own schedules. Density changes the living-mob limit, capped at 500. Lowering it does not delete enemies.')
        p=self.pages['Rewards']
        self.heading(p,'Legendary choices','Up to three guaranteed Legendary choices at each level-up.')
        self.field(p,'First Legendary · minutes','legendaryStart')
        self.field(p,'Add a Legendary every · minutes','legendaryInterval')
        for kind,title in [('xp','Experience'),('gold','Gold')]:
            self.heading(p,title+' scaling','Applies to new income. Existing levels and balances are unchanged.')
            self.setting_toggle(p,title+' scaling ON / OFF',kind+'ScalingEnabled')
            self.field(p,'Starting rate · %',kind+'BasePercent');self.field(p,'Added percentage points / minute',kind+'GrowthPercent');self.field(p,'Maximum rate · %',kind+'CapPercent')
        self.note(p,'100% = normal income. Start 100%, add 10 per minute and cap at 300% to reach 2× at ten minutes and 3× at twenty. Treasure Rush doubles gold after this setting.')
        self.heading(p,'Loot and rerolls','Native collectibles, boss bounties and recurring chest milestones.')
        for label,key in [('Exclude Luck rings / trinkets','banLuck'),('Maximum reroll price · gold','rerollCap'),('Extra powerup interval · seconds','pickupInterval'),('Extra chest interval · seconds','chestInterval'),('Boss kills per chest milestone','rewardEvery')]:self.field(p,label,key)
        self.note(p,'Boss bounties and milestones reward longer runs. Luck filtering affects future ring/trinket choices; equipped items and amulet affixes remain unchanged.')
        affix_page=self.pages['Affixes']
        self.heading(affix_page,'Affixes','Every enabled Mayhem affix has its own difficulty and settings. Turn an affix on to show its controls.')
        self.affix_groups={}
        nav=ttk.Frame(affix_page);nav.pack(fill='x',pady=(0,10))
        for name in ['Persistent','Timed','Rewards','Native']:
            ttk.Button(nav,text=name,command=lambda n=name:self.jump_affix_group(n)).pack(side='left',padx=(0,5))
        p=ttk.Frame(affix_page);p.pack(fill='x');self.affix_groups['Persistent']=p
        self.heading(p,'Persistent combat affixes','Continuous modifiers. The master switch starts OFF.')
        self.setting_toggle(p,'Persistent affixes ON / OFF','runAffixesEnabled')
        entries=[
            ('Pack Tactics','Nearby enemies protect each other. Split packs to remove their protection.','packPreset',[('Protection radius · yards','packRadius'),('Damage reduction per ally · %','packReduction')]),
            ('Blood Frenzy','Wounded enemies gain damage and movement speed.','frenzyPreset',[('Trigger below health · %','frenzyThreshold'),('Speed and damage bonus · %','frenzyBoost')]),
            ('Revenant Legion','Some defeated normal mobs return as weaker revenants with bonus gold and XP. Revenants cannot revive again.','revenantPreset',[('Revenant chance · %','revenantChance'),('Revenant health · %','revenantHealth')]),
            ('Nemesis Bond','Mayhem bosses arrive as linked pairs. Defeating one enrages its surviving partner.','bondPreset',[('Partner enrage bonus · %','bondRage')]),
            ('Soul Debt','Normal kills build enemy strength and bank a bounty. Defeat a boss to receive the bounty and reset the debt.','debtPreset',[('Strength added per kill · %','debtPerKill'),('Maximum added strength · %','debtCap')]),
        ]
        for var,(title,detail,preset,fields) in zip(self.affix_flags['runAffixMask'],entries):
            ttk.Checkbutton(p,text=title,variable=var).pack(anchor='w',pady=(12,3));self.note(p,detail)
            settings_page=self.affix_settings(p,title,[self.vars['runAffixesEnabled'],var],lambda v=var:self.vars['runAffixesEnabled'].get()=='On' and v.get());self.field(settings_page,'Difficulty',preset)
            for label,key in fields:self.field(settings_page,label,key)
            if title=='Pack Tactics':self.note(settings_page,'Protection is capped at 60% damage reduction.')
            elif title=='Nemesis Bond':self.note(settings_page,'The surviving partner gains damage; its movement bonus is half as large. Difficulty scales the bonus.')
            elif title=='Soul Debt':self.note(settings_page,'The boss bounty pays gold and XP, plus a chest at 25% debt or more. Revenant kills do not add debt.')
        p=ttk.Frame(affix_page);p.pack(fill='x',pady=(16,0));self.affix_groups['Timed']=p
        self.heading(p,'Timed affixes','Select the rotation pool. Stampede runs independently on its own schedule.')
        self.check(p,'Timed affix rotation ON / OFF','events')
        schedule=self.affix_settings(p,'Timed affix rotation schedule',[self.flags['events'],*self.events],lambda:self.flags['events'].get() and any(v.get() for v in self.events))
        self.note(schedule,'Shared spacing between the selected rotation affixes.')
        self.field(schedule,'First rotation · seconds','eventFirst');self.field(schedule,'Minimum break · seconds','eventGapMin');self.field(schedule,'Maximum break · seconds','eventGapMax')
        self.note(schedule,'Breaks start after an affix ends. Busy boss moments can delay the next one. Rune Storm goes first when selected.')
        for var,(title,detail,preset,duration) in zip(self.events,[
            ('Treasure Rush','Temporarily increases gold pickups.','treasurePreset','treasureDuration'),
            ('Guardian Hunt','Summons a rare enemy from another map.','huntPreset','huntDuration'),
            ('Berserker Rush','Reinforcements gain extra strength and speed.','berserkerPreset','berserkerDuration'),
            ('Rune Storm','Mixed rune patterns force the party to keep moving. Its own difficulty sets rune count and damage.','stormPreset','stormDuration')]):
            ttk.Checkbutton(p,text=title,variable=var).pack(anchor='w',pady=(12,3));self.note(p,detail)
            settings_page=self.affix_settings(p,title,[self.flags['events'],var],lambda v=var:self.flags['events'].get() and v.get());self.field(settings_page,'Difficulty',preset);self.field(settings_page,'Duration · seconds',duration)
            if title=='Rune Storm':
                self.field(settings_page,'Burst interval · tenths','stormIntervalTenths')
                self.storm_summary=tk.StringVar();ttk.Label(settings_page,textvariable=self.storm_summary,wraplength=450,foreground=MUTED,justify='left').pack(fill='x',pady=8)
                self.vars['stormPreset'].trace_add('write',lambda *_:self.refresh_storm_summary());self.refresh_storm_summary()
                self.note(settings_page,'Rune Storm always uses mixed patterns. Idle-player punishment remains separate and unchanged. 25 tenths = 2.5 seconds.')
        self.setting_toggle(p,'Stampede ON / OFF · default OFF','hasteEnabled')
        self.note(p,'Temporarily accelerates mobs and bosses. Its schedule is independent of timed affix rotation.')
        settings_page=self.affix_settings(p,'Stampede',[self.vars['hasteEnabled']],lambda:self.vars['hasteEnabled'].get()=='On');self.field(settings_page,'Difficulty','hastePreset')
        for label,key in [('First Stampede · seconds','hasteFirst'),('Repeat every · seconds','hasteInterval'),('Duration · seconds','hasteDuration'),('Movement during Stampede · %','hasteSpeedPercent')]:self.field(settings_page,label,key)
        self.note(settings_page,'Duration must be shorter than the repeat interval. Turning OFF restores the configured movement speed.')
        p=ttk.Frame(affix_page);p.pack(fill='x',pady=(16,0));self.affix_groups['Rewards']=p
        self.heading(p,'Reward affixes','Additional challenges that pay out native loot. The master switch starts OFF.')
        self.setting_toggle(p,'Reward affixes ON / OFF','affixesEnabled')
        entries=[
            ('Rift Pulse','Dodge ground runes, then collect gold, XP and a power-up.','riftPreset',[('Repeat interval · seconds','riftInterval'),('Bonus rewards · %','riftBonusPercent')]),
            ('Death Echo','A defeated boss leaves dangerous corpse runes, followed by a chest and bounty.','echoPreset',[('Bonus rewards · %','echoBonusPercent')]),
            ('Nemesis Hunt','Defeat a summoned rare enemy for a chest and gold/XP bounty.','nemesisPreset',[('Repeat interval · seconds','nemesisInterval'),('Bonus rewards · %','nemesisBonusPercent')]),
        ]
        for var,(title,detail,preset,fields) in zip(self.affix_flags['affixMask'],entries):
            ttk.Checkbutton(p,text=title,variable=var).pack(anchor='w',pady=(12,3));self.note(p,detail)
            settings_page=self.affix_settings(p,title,[self.vars['affixesEnabled'],var],lambda v=var:self.vars['affixesEnabled'].get()=='On' and v.get());self.field(settings_page,'Difficulty',preset)
            for label,key in fields:self.field(settings_page,label,key)
            if title=='Death Echo':self.note(settings_page,'Triggers on boss deaths rather than on a repeat timer.')
        p=ttk.Frame(affix_page);p.pack(fill='x',pady=(16,0));self.affix_groups['Native']=p
        self.heading(p,'Native game affixes','Keep the game selection, disable it, or choose a custom combination.')
        self.field(p,'Native affix selection','nativeAffixMode')
        for var,(title,detail) in zip(self.affix_flags['nativeAffixMask'],[
            ('Bolstering','Enemy deaths strengthen nearby enemies.'),
            ('Sanguine','Slain elites leave pools that heal enemies.'),
            ('Explosive','Destroy explosive orbs before they detonate.')]):
            ttk.Checkbutton(p,text=title,variable=var).pack(anchor='w',pady=(12,3));self.note(p,detail)
        self.note(p,'Custom applies these boxes. Game default restores the original selection. Native Heroic rank and progression rewards remain tied to the lobby choice.')
        p=self.pages['Session']
        self.heading(p,'Shared game speed','Changes simulation, player movement, cooldowns and match timers for everyone.')
        self.setting_toggle(p,'Game speed ON / OFF · default OFF','gameSpeedEnabled')
        self.field(p,'Game speed · %','gameSpeedPercent')
        self.note(p,'Network deadlines and menu animations keep normal pacing. OFF restores current natural movement speeds.')
        self.heading(p,'Run flow and presentation','Session-wide options for the match you host.')
        self.check(p,'Automatically continue into Endless','autoEndless')
        self.field(p,'Announcement sounds','soundEnabled');self.check(p,'Boss-kill fireworks','fireworks')
        self.heading(p,'Automatic map rotation','A random map every three minutes of match time.')
        ttk.Checkbutton(p,text='Automatic map rotation ON / OFF',variable=self.flags['autoMap'],command=self.toggle_rotation).pack(anchor='w',pady=7)
        self.note(p,'Applies immediately and saves. ON starts a fresh three-minute countdown; an active transfer finishes safely. Rotation pauses during reward choices.')
        self.travel_info=tk.StringVar(value='Start a solo match or host a match to begin map rotation.')
        ttk.Label(p,textvariable=self.travel_info,wraplength=470,foreground=MUTED,justify='left').pack(fill='x',pady=(0,8))
        self.note(p,'The whole party keeps levels, items and match time. Waves and scaling continue; completion rewards stay tied to the original run.')
        self.note(p,'Insert opens/closes this panel. Use windowed or borderless mode. Online matches continue while the panel is open.')
        self.live=tk.StringVar(value='Waiting for game…')
        ttk.Label(p,textvariable=self.live,wraplength=475,justify='left').pack(fill='x',pady=14)
        app.extend_session(p,self)
        footer=tk.Frame(body,bg=BG);footer.pack(fill='x',padx=24,pady=16)
        self.feedback=tk.StringVar(value='Settings apply when you press Apply.')
        tk.Label(footer,textvariable=self.feedback,bg=BG,fg=MUTED,wraplength=490,anchor='w',justify='left').pack(fill='x',pady=(0,8))
        ttk.Button(footer,text='Restore defaults',command=self.restore).pack(side='left')
        ttk.Button(footer,text='Apply settings',command=self.apply,style='Accent.TButton').pack(side='right')
        self.tabs.select(0)
        self.window.after(50,self.poll)

    def affix_settings(self,p,title,variables,enabled):
        # Keep the values alive while hiding controls; toggling never resets preferences.
        anchor=ttk.Frame(p,height=1);anchor.pack(fill='x')
        frame=ttk.Frame(anchor,padding=(10,4))
        ttk.Label(frame,text=title+' settings',foreground=GOLD,font=('Segoe UI',10,'bold')).pack(anchor='w',pady=(2,5))
        def update(*_):
            if enabled():frame.pack(fill='x',pady=(2,8))
            else:
                frame.pack_forget();anchor.configure(height=1)
        for variable in variables:variable.trace_add('write',update)
        update();self.affix_settings_panels[title]={'frame':frame,'enabled':enabled,'update':update}
        return frame
    def refresh_storm_summary(self):
        tier=PRESETS.index(self.vars['stormPreset'].get())
        self.storm_summary.set(f'{PRESETS[tier]}: {[10,13,16,19][tier]} runes per player, per burst. Difficulty also scales rune damage.')
    def jump_affix_group(self,name):
        self.tabs.select(list(self.pages).index('Affixes'));self.window.update_idletasks()
        page=self.pages['Affixes'];canvas=page.master
        canvas.yview_moveto(max(0,self.affix_groups[name].winfo_y()-3)/max(1,page.winfo_height()))
    def section(self,p,title,detail,expanded=False):
        outer=ttk.Frame(p);outer.pack(fill='x',pady=(5,7))
        inner=ttk.Frame(outer,padding=(10,3));state={'open':expanded}
        def toggle():
            state['open']=not state['open'];button.configure(text=('− ' if state['open'] else '+ ')+title)
            if state['open']:inner.pack(fill='x')
            else:inner.pack_forget()
        button=ttk.Button(outer,text=('− ' if expanded else '+ ')+title,command=toggle);button.pack(fill='x')
        if detail:self.note(outer,detail)
        if expanded:inner.pack(fill='x')
        self.sections[title]={'frame':inner,'button':button,'state':state,'toggle':toggle}
        return inner
    def scroll(self,event):
        page=self.tabs.nametowidget(self.tabs.select());return page._wheel(event)
    def heading(self,p,title,subtitle):
        ttk.Label(p,text=title,font=('Segoe UI',12,'bold'),foreground=GOLD).pack(anchor='w',pady=(3,4))
        self.note(p,subtitle)
    def note(self,p,text):ttk.Label(p,text=text,wraplength=470,foreground=MUTED,justify='left').pack(anchor='w',fill='x',pady=(2,10))
    def check(self,p,label,key):ttk.Checkbutton(p,text=label,variable=self.flags[key]).pack(anchor='w',pady=7)
    def setting_toggle(self,p,label,key):ttk.Checkbutton(p,text=label,variable=self.vars[key],onvalue='On',offvalue='Off').pack(anchor='w',pady=7)
    def field(self,p,label,key):
        row=ttk.Frame(p);row.pack(fill='x',pady=6)
        ttk.Label(row,text=label).pack(side='left')
        if key.endswith('Preset'):box=ttk.Combobox(row,textvariable=self.vars[key],values=PRESETS,state='readonly',width=12)
        elif key in CHOICES:box=ttk.Combobox(row,textvariable=self.vars[key],values=CHOICES[key],state='readonly',width=12)
        else:
            _,lo,hi=SCHEMA[key];box=ttk.Spinbox(row,from_=lo,to=hi,textvariable=self.vars[key],width=12)
        box.pack(side='right')
    def values(self):
        values={k:PRESETS.index(v.get()) if k.endswith('Preset') else CHOICES[k].index(v.get()) if k in CHOICES else int(v.get()) for k,v in self.vars.items()}
        values['eventMask']=sum(1<<i for i,v in enumerate(self.events) if v.get())
        values.update({key:sum(1<<i for i,v in enumerate(flags) if v.get()) for key,flags in self.affix_flags.items()})
        values['stormCount']=[10,13,16,19][values['stormPreset']]
        if not validate_settings(values):raise ValueError('Check ranges: minimum break ≤ maximum; Stampede duration < repeat interval; income starting rates ≤ caps.')
        return values,{k:v.get() for k,v in self.flags.items()}
    def apply(self):
        try:
            settings,controls=self.values();self.app.apply_settings(settings,controls)
            self.feedback.set('Applied. Movement and pacing update live; income changes affect future awards.')
        except Exception as e:self.feedback.set(str(e))
    def restore(self):
        for k,v in self.vars.items():v.set(PRESETS[DEFAULTS[k]] if k.endswith('Preset') else CHOICES[k][DEFAULTS[k]] if k in CHOICES else str(DEFAULTS[k]))
        for v in self.events:v.set(True)
        for key,flags in self.affix_flags.items():
            for i,v in enumerate(flags):v.set(bool(DEFAULTS[key]&(1<<i)))
        for k,v in self.flags.items():v.set(CONTROLS[k])
        self.feedback.set('Defaults selected. Press Apply to use them.')
    def toggle_rotation(self):
        enabled=self.flags['autoMap'].get()
        try:
            self.app.set_control('autoMap',enabled)
            self.feedback.set('Map rotation ON. New three-minute countdown.' if enabled else 'Map rotation OFF. Staying on this map after any active transfer finishes.')
        except Exception as error:
            self.flags['autoMap'].set(self.app.current_controls.get('autoMap',True));self.feedback.set(str(error))
    def update_travel(self,state,rotation=None,match=None,enabled=True):
        state=state or {};rotation=rotation or {};catalog=state.get('catalog') or []
        if not match:
            self.travel_info.set('Start a solo match or host a match to begin map rotation.');return
        names=lambda value:next((z['name'] for z in catalog if value in (z['key'],z['id'])),str(value if value is not None else '—'))
        remaining=max(0,math.ceil(rotation.get('nextMap',180)-rotation.get('clock',0)))
        changes=max(0,int(rotation.get('mapChanges',0)))
        if state.get('busy'):reason='Moving the party…'
        elif not state.get('supported'):reason=state.get('reason') or 'Map rotation is unavailable for this game version.'
        elif not enabled:reason='Automatic map rotation is OFF. Waves and difficulty continue on this map.'
        elif match.get('phase')==2:reason='Paused during reward choices.'
        elif not state.get('canTravel'):reason=state.get('reason') or 'Waiting for play to resume.'
        else:reason='The next destination is chosen automatically.'
        countdown=f'{remaining//60:02}:{remaining%60:02}' if enabled else 'OFF'
        self.travel_info.set(f'Current: {names(state.get("currentZone"))} · Original: {names(state.get("originZone"))}\nNext change: {countdown} · Map changes: {changes}\n{reason}')
    def update_status(self,item):
        travel=dict(item.get('travel') or {})
        if item.get('fault'):travel.update(canTravel=False,reason='Resolve the mode error before transferring maps.')
        self.update_travel(travel,item.get('state'),item.get('match'),item.get('controls',{}).get('autoMap',True))
        state=item.get('state',{});match=item.get('match');clock=int(state.get('clock',0))
        self.summary.set(('ENDLESS' if state.get('endless') else 'HOST CONTROL PANEL')+f'  ·  {clock//60:02}:{clock%60:02}  ·  Wave {state.get("wave",0)}')
        if item.get('fault'):self.live.set('Mode error: '+item['fault'].splitlines()[0])
        elif match:
            event=['Quiet','Treasure Rush','Guardian Hunt','Berserker Rush','Rune Storm'][state.get('event',0)]
            self.live.set(f'Next boss: {max(0,int(state.get("nextWave",0)-clock))}s\nTimed affix: {event}\nBosses defeated: {state.get("killCount",0)}\nHazard bursts: {state.get("hazardBursts",0)}\nGold drops: ×{item["scaling"]["gold"]:.2f}')
            reward=item.get('rewards') or {}
            if reward.get('supported'):self.live.set(self.live.get()+f'\nBounty tier: {reward.get("tier",0)} · next chest in {max(1,item.get("settings",{}).get("rewardEvery",3))-reward.get("kills",0)%max(1,item.get("settings",{}).get("rewardEvery",3))} boss kills\nBonus drops: {reward.get("pickups",0)} powerups · {reward.get("chests",0)} chests')
            population=item.get('population') or {};tempo=item.get('tempo') or {};affixes=item.get('affixes') or {}
            self.live.set(self.live.get()+f'\nXP: ×{(item.get("scaling") or {}).get("xp",1):.2f} · Game speed: ×{tempo.get("factor",1):.2f}\nStampede: {"ACTIVE" if population.get("hasteActive") else "Waiting" if population.get("hasteEnabled") else "OFF"}\nNative affixes: {", ".join(affixes.get("nativeAffixes",[])) or "None"}\nReward affixes: {"ON" if affixes.get("enabled") else "OFF"} · Bonus bounties: {affixes.get("rewards",0)}')
            modifiers=item.get('runAffixes') or {}
            self.live.set(self.live.get()+'\nPersistent affixes: '+(', '.join(modifiers.get('active',[])) if modifiers.get('enabled') else 'OFF'))
            if modifiers.get('enabled'):self.live.set(self.live.get()+f'\nSoul Debt: {modifiers.get("debt",0):.0f}% · Active revenants: {modifiers.get("revenants",0)} · Linked bosses: {modifiers.get("paired",0)}')
            unavailable=[]
            if not (item.get('income') or {}).get('supported'):unavailable.append('XP scaling')
            if population.get('supported') is False:unavailable.append('population controls')
            if not affixes.get('supported'):unavailable.append('native affix selection')
            if tempo.get('movementSupported') is False:unavailable.append('player movement synchronization')
            if unavailable:self.live.set(self.live.get()+'\nUnavailable on this adapter: '+', '.join(unavailable))
            if affixes.get('nativeError'):self.live.set(self.live.get()+'\nNative affixes: '+affixes['nativeError'])
        else:self.live.set('Ready. Start a solo match or host a lobby normally.')
        errors=item.get('unavailableFeatures') or []
        if errors:
            names=list(dict.fromkeys(e.get('feature','Feature') for e in errors))
            self.live.set(self.live.get()+'\nUnavailable features: '+', '.join(names)+'\nOther controls remain available.')
    def show(self):
        if not self.app.game or not self.app.game.ready:return
        if not self.bridge.find(self.app.game.pid):return
        self.visible=True;self.place();self.window.deiconify();self.window.lift();self.window.focus_force()
    def hide(self,return_focus=True):
        self.visible=False;self.window.withdraw()
        if return_focus:self.bridge.focus_game()
    def place(self):
        rect=self.bridge.rect()
        if not rect:return
        x,y,width,height=rect;pw=min(720,width-24);ph=min(760,height-24)
        geometry=f'{max(420,pw)}x{max(360,ph)}+{max(0,x+width-pw-12)}+{max(0,y+12)}'
        if geometry!=self.last_geometry:self.window.geometry(geometry);self.last_geometry=geometry
    def poll(self):
        try:
            game=self.app.game
            if not game or not game.ready:
                if self.visible:self.hide(False)
                self.bridge.hwnd=None
            else:
                if not self.bridge.hwnd:self.bridge.find(game.pid)
                focused=self.bridge.focused(self.window.winfo_id())
                pressed=False
                try:
                    while True:self.hotkey.events.get_nowait();pressed=True
                except queue.Empty:pass
                if pressed and focused:
                    if self.visible:self.hide()
                    else:self.show()
                if self.hotkey.error:self.feedback.set(self.hotkey.error)
                if self.visible:
                    if not focused or not self.bridge.rect():self.hide(False)
                    else:self.place()
        finally:self.window.after(50,self.poll)
