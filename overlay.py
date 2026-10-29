"""Owned-process Windows overlay. Insert is sampled only while the game/panel is focused."""
import ctypes
import math,queue,threading
from ctypes import wintypes as w
import tkinter as tk
from tkinter import ttk
from settings import DEFAULTS, SCHEMA, PRESETS, CONTROLS, validate_settings

CHOICES={'hazardPattern':('Mixed','Scatter','Broken ring','Cross','Lanes','Spiral'),'banLuck':('Off','On'),'soundEnabled':('Off','On'),'extraHazards':('Off','On')}
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
        self.vars={key:tk.StringVar(value=PRESETS[value] if key.endswith('Preset') else CHOICES[key][value] if key in CHOICES else str(value)) for key,value in settings.items() if key!='eventMask'}
        self.flags={key:tk.BooleanVar(value=value) for key,value in controls.items()}
        self.events=[tk.BooleanVar(value=bool(settings['eventMask']&(1<<i))) for i in range(4)]
        self.pages={}
        for title in ['Combat','Events','Hazards','Rewards','Session']:
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
        self.heading(p,'A harder world, on your terms','Changes affect newly spawned enemies and future rewards.')
        self.field(p,'Boss health','healthPreset');self.field(p,'Boss damage','damagePreset')
        self.field(p,'Mayhem boss interval · seconds','bossInterval')
        self.field(p,'First Legendary · minutes','legendaryStart')
        self.field(p,'Add a Legendary every · minutes','legendaryInterval')
        self.note(p,'Up to three guaranteed choices. Normal enemies still grow stronger over time. Existing bosses keep their current stats.')
        self.check(p,'Extra cross-map boss waves','waves')
        p=self.pages['Events']
        self.heading(p,'Keep the run unpredictable','Choose the event pool, timing and duration.')
        self.check(p,'Random events enabled','events')
        for var,name,key in zip(self.events,['Treasure Rush · double pickups','Guardian Hunt · foreign rare','Berserker Rush · stronger reinforcements','Rune Storm · dodge circles'],['treasureDuration','huntDuration','berserkerDuration','stormDuration']):
            ttk.Checkbutton(p,text=name,variable=var).pack(anchor='w',pady=(10,0))
            self.field(p,'Duration · seconds',key)
        self.field(p,'First event · seconds','eventFirst')
        self.field(p,'Minimum break · seconds','eventGapMin');self.field(p,'Maximum break · seconds','eventGapMax')
        self.note(p,'The break starts after an event ends. Busy boss moments can delay events. Rune Storm is first when enabled. Hunt spawns one rare; its duration controls the event window.')
        p=self.pages['Hazards']
        self.heading(p,'Make the whole party move','2.5-second warnings · maximum 128 active circles shared across players.')
        self.check(p,'Arena hazards enabled','hazards')
        self.field(p,'Obstacle formation','hazardPattern')
        self.field(p,'Native cone and line attacks','extraHazards')
        self.note(p,'Mixed rotates rings, crosses, lanes, spirals and scatter. Formations leave escape routes; these are damaging runes, not solid walls.')
        for label,key in [('Obstacle damage','hazardPreset'),('Damage growth · % per minute','hazardGrowth'),('Normal circles · per player','hazardCount'),('Normal interval · seconds','hazardInterval'),('Rune Storm circles · per player','stormCount'),('Rune Storm interval · tenths of a second','stormIntervalTenths'),('Boss barrage circles · per player','barrageCount'),('Boss barrage interval · tenths of a second','barrageIntervalTenths'),('Boss barrage duration · seconds','barrageDuration'),('Camping trigger · seconds still','campSeconds')]:self.field(p,label,key)
        self.note(p,'Easy 0.5× · Hard 1× · Brutal 1.5× · Insane 2×. Base damage: 20% max HP (25–250), or 25% (35–350) during storms/barrages, before defenses. Growth adds up to 4× over time. Example: 25 tenths = 2.5 seconds.')
        p=self.pages['Rewards']
        self.heading(p,'Give every boss a purpose','Boss bounties and recurring chest milestones use native collectible drops.')
        for label,key in [('Exclude Luck rings / trinkets','banLuck'),('Maximum reroll price · gold','rerollCap'),('Extra powerup interval · seconds','pickupInterval'),('Extra chest interval · seconds','chestInterval'),('Boss kills per chest milestone','rewardEvery')]:self.field(p,label,key)
        self.note(p,'A bounty drops at each defeated boss. Milestones increase bounty rewards during this run; loot and collection progress follow the game’s normal rules. Luck filtering covers future ring/trinket choices; amulet affixes and equipped items are unchanged.')
        p=self.pages['Session']
        self.heading(p,'Session controls','These controls affect the match you host.')
        self.field(p,'Announcement sounds','soundEnabled')
        self.check(p,'Boss-kill fireworks','fireworks');self.check(p,'Automatically continue into Endless','autoEndless')
        self.heading(p,'Automatic map rotation','A random map every three minutes of match time.')
        self.travel_info=tk.StringVar(value='Start a solo match or host a match to begin map rotation.')
        ttk.Label(p,textvariable=self.travel_info,wraplength=470,foreground=MUTED,justify='left').pack(fill='x',pady=(0,8))
        self.note(p,'Rotation pauses during reward choices and resumes when play continues. The whole party moves together, keeping player levels, items and match time. Waves and difficulty continue growing; completion rewards remain tied to the original run.')
        self.note(p,'Press Insert to show or hide this panel. It follows the game window and hides when you switch apps. Use windowed or borderless mode. Online matches continue while this panel is open.')
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

    def scroll(self,event):
        page=self.tabs.nametowidget(self.tabs.select());return page._wheel(event)
    def heading(self,p,title,subtitle):
        ttk.Label(p,text=title,font=('Segoe UI',12,'bold'),foreground=GOLD).pack(anchor='w',pady=(3,4))
        self.note(p,subtitle)
    def note(self,p,text):ttk.Label(p,text=text,wraplength=470,foreground=MUTED,justify='left').pack(anchor='w',fill='x',pady=(2,10))
    def check(self,p,label,key):ttk.Checkbutton(p,text=label,variable=self.flags[key]).pack(anchor='w',pady=7)
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
        if not validate_settings(values):raise ValueError('Check the values and ensure minimum event break is no greater than maximum.')
        return values,{k:v.get() for k,v in self.flags.items()}
    def apply(self):
        try:
            settings,controls=self.values();self.app.apply_settings(settings,controls)
            self.feedback.set('Applied. New spawns and future events use these settings.')
        except Exception as e:self.feedback.set(str(e))
    def restore(self):
        for k,v in self.vars.items():v.set(PRESETS[DEFAULTS[k]] if k.endswith('Preset') else CHOICES[k][DEFAULTS[k]] if k in CHOICES else str(DEFAULTS[k]))
        for v in self.events:v.set(True)
        for k,v in self.flags.items():v.set(CONTROLS[k])
        self.feedback.set('Defaults selected. Press Apply to use them.')
    def update_travel(self,state,rotation=None,match=None):
        state=state or {};rotation=rotation or {};catalog=state.get('catalog') or []
        if not match:
            self.travel_info.set('Start a solo match or host a match to begin map rotation.');return
        names=lambda value:next((z['name'] for z in catalog if value in (z['key'],z['id'])),str(value if value is not None else '—'))
        remaining=max(0,math.ceil(rotation.get('nextMap',180)-rotation.get('clock',0)))
        changes=max(0,int(rotation.get('mapChanges',0)))
        if state.get('busy'):reason='Moving the party…'
        elif not state.get('supported'):reason=state.get('reason') or 'Map rotation is unavailable for this game version.'
        elif match.get('phase')==2:reason='Paused during reward choices.'
        elif not state.get('canTravel'):reason=state.get('reason') or 'Waiting for play to resume.'
        else:reason='The next destination is chosen automatically.'
        self.travel_info.set(f'Current: {names(state.get("currentZone"))} · Original: {names(state.get("originZone"))}\nNext change: {remaining//60:02}:{remaining%60:02} · Map changes: {changes}\n{reason}')
    def update_status(self,item):
        travel=dict(item.get('travel') or {})
        if item.get('fault'):travel.update(canTravel=False,reason='Resolve the mode error before transferring maps.')
        self.update_travel(travel,item.get('state'),item.get('match'))
        state=item.get('state',{});match=item.get('match');clock=int(state.get('clock',0))
        self.summary.set(('ENDLESS' if state.get('endless') else 'HOST CONTROL PANEL')+f'  ·  {clock//60:02}:{clock%60:02}  ·  Wave {state.get("wave",0)}')
        if item.get('fault'):self.live.set('Mode error: '+item['fault'].splitlines()[0])
        elif match:
            event=['Quiet','Treasure Rush','Guardian Hunt','Berserker Rush','Rune Storm'][state.get('event',0)]
            self.live.set(f'Next boss: {max(0,int(state.get("nextWave",0)-clock))}s\nEvent: {event}\nBosses defeated: {state.get("killCount",0)}\nHazard bursts: {state.get("hazardBursts",0)}\nGold drops: ×{item["scaling"]["gold"]:.2f}')
            reward=item.get('rewards') or {}
            if reward.get('supported'):self.live.set(self.live.get()+f'\nBounty tier: {reward.get("tier",0)} · next chest in {max(1,item.get("settings",{}).get("rewardEvery",3))-reward.get("kills",0)%max(1,item.get("settings",{}).get("rewardEvery",3))} boss kills\nBonus drops: {reward.get("pickups",0)} powerups · {reward.get("chests",0)} chests')
        else:self.live.set('Ready. Start a solo match or host a lobby normally.')
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
        x,y,width,height=rect;pw=min(600,width-24);ph=min(760,height-24)
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
