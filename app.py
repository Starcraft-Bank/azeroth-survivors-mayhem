"""Native Legendary Mayhem launcher. No browser or legacy cheat controls."""
from pathlib import Path
import argparse,json,os,queue,sys,threading
import tkinter as tk
from tkinter import filedialog,messagebox,ttk
from native_runtime import DEFAULTS,ROOT,VERSION,NativeGame,self_test,validate_settings

PRESETS=('Easy','Hard','Brutal','Insane')
PREFS=Path(os.environ.get('LOCALAPPDATA',Path.home()))/'LegendaryMayhemNative'/'settings.json'

class App:
    def __init__(self,window):
        self.window=window;self.game=None;self.launching=False;self.last_locked=None;self.controls=[]
        self.saved={}
        try:self.saved=json.loads(PREFS.read_text(encoding='utf-8'))
        except (OSError,ValueError):pass
        settings=self.saved.get('settings',{})
        if not validate_settings(settings):settings=dict(DEFAULTS)
        window.title('Legendary Mayhem · Native '+VERSION);window.geometry('640x810');window.minsize(620,800)
        try:window.iconbitmap(str(ROOT/'assets/wow.ico'))
        except tk.TclError:pass
        window.configure(bg='#101722');style=ttk.Style(window);style.theme_use('clam')
        style.configure('.',background='#172334',foreground='#e5edf8',font=('Segoe UI',10))
        style.configure('TFrame',background='#101722');style.configure('TLabel',background='#101722')
        style.configure('Title.TLabel',font=('Segoe UI',22,'bold'),foreground='#ffd275')
        style.configure('TButton',padding=8);style.map('TCombobox',fieldbackground=[('readonly','#25384f')],foreground=[('readonly','#ffffff')])
        frame=ttk.Frame(window,padding=22);frame.pack(fill='both',expand=True)
        ttk.Label(frame,text='LEGENDARY MAYHEM',style='Title.TLabel').pack(anchor='w')
        ttk.Label(frame,text='Native game mode · host runs the mode · '+VERSION).pack(anchor='w',pady=(0,16))
        ttk.Label(frame,text='Game executable (native 0.120.5 · e0e2410c)').pack(anchor='w')
        row=ttk.Frame(frame);row.pack(fill='x',pady=(5,12))
        beside=Path(sys.executable).parent/'AzerothSurvivors.exe'
        self.path=tk.StringVar(value=self.saved.get('game','') or (str(beside)if beside.exists()else''))
        self.path_entry=ttk.Entry(row,textvariable=self.path);self.path_entry.pack(side='left',fill='x',expand=True)
        self.browse=ttk.Button(row,text='Browse…',command=self.choose);self.browse.pack(side='right',padx=(8,0))
        self.panel=ttk.LabelFrame(frame,text='Pre-match settings',padding=12);self.panel.pack(fill='x')
        self.damage=tk.StringVar(value=PRESETS[settings['damagePreset']]);self.health=tk.StringVar(value=PRESETS[settings['healthPreset']])
        self.start=tk.IntVar(value=settings['legendaryStart']);self.interval=tk.IntVar(value=settings['legendaryInterval'])
        for label,var in [('Boss health',self.health),('Boss damage',self.damage)]:
            line=ttk.Frame(self.panel);line.pack(fill='x',pady=4);ttk.Label(line,text=label).pack(side='left')
            box=ttk.Combobox(line,textvariable=var,values=PRESETS,state='readonly',width=14);box.pack(side='right');self.controls.append(box)
        for label,var,minimum in [('First Legendary (minutes)',self.start,0),('Add another every (minutes)',self.interval,1)]:
            line=ttk.Frame(self.panel);line.pack(fill='x',pady=4);ttk.Label(line,text=label).pack(side='left')
            box=ttk.Spinbox(line,from_=minimum,to=30,textvariable=var,width=14,state='readonly');box.pack(side='right');self.controls.append(box)
        self.event_vars=[]
        for i,name in enumerate(['Treasure Rush','Guardian Hunt','Berserker Rush','Rune Storm']):
            var=tk.BooleanVar(value=bool(settings['eventMask']&(1<<i)));self.event_vars.append(var)
            box=ttk.Checkbutton(self.panel,text=name,variable=var);box.pack(anchor='w',pady=2);self.controls.append(box)
        self.defaults=ttk.Button(self.panel,text='Restore defaults',command=self.restore);self.defaults.pack(anchor='e',pady=(6,0));self.controls.append(self.defaults)
        self.status=tk.StringVar(value='Choose your game EXE, then launch. Settings lock during matches.')
        ttk.Label(frame,textvariable=self.status,wraplength=560).pack(anchor='w',fill='x',pady=14)
        line=ttk.Frame(frame);line.pack(fill='x')
        self.launch=ttk.Button(line,text='Launch native Mayhem',command=self.open_game);self.launch.pack(side='left')
        self.stop=ttk.Button(line,text='Close game',command=self.close_game,state='disabled');self.stop.pack(side='right')
        ttk.Label(frame,text='Bosses every 2 minutes · 30-second arrival barrages\nRune Storm: 8 circles/player every 2.5 seconds\nKeep this launcher open. Closing it also closes its game.',wraplength=560).pack(anchor='w',pady=14)
        ttk.Button(frame,text='Open guide',command=self.guide).pack(anchor='w')
        for var in [self.damage,self.health,self.start,self.interval,*self.event_vars]:var.trace_add('write',self.changed)
        window.protocol('WM_DELETE_WINDOW',self.quit);window.after(200,self.poll)

    def choose(self):
        path=filedialog.askopenfilename(title='Select AzerothSurvivors.exe',filetypes=[('Game executable','AzerothSurvivors.exe'),('Windows executable','*.exe')])
        if path:self.path.set(path);self.save()

    def settings(self):return dict(damagePreset=PRESETS.index(self.damage.get()),healthPreset=PRESETS.index(self.health.get()),legendaryStart=self.start.get(),legendaryInterval=self.interval.get(),eventMask=sum((1<<i)for i,v in enumerate(self.event_vars)if v.get()))
    def save(self):
        PREFS.parent.mkdir(parents=True,exist_ok=True);temp=PREFS.with_suffix('.tmp')
        temp.write_text(json.dumps({'game':self.path.get(),'settings':self.settings()},indent=2),encoding='utf-8');temp.replace(PREFS)
    def changed(self,*args):
        try:
            settings=self.settings()
            if not validate_settings(settings):return
            if self.game and self.game.ready and not self.game.configure(settings):return
            self.save()
        except (ValueError,tk.TclError,OSError):pass
    def restore(self):
        self.health.set('Insane');self.damage.set('Hard');self.start.set(0);self.interval.set(10)
        for var in self.event_vars:var.set(True)
    def guide(self):os.startfile(str(ROOT/'README.txt'))
    def open_game(self):
        if self.launching or self.game:return
        self.launching=True;self.launch.configure(state='disabled');self.browse.configure(state='disabled');self.path_entry.configure(state='disabled')
        self.status.set('Checking the native game and starting Mayhem…');self.save();self.game=NativeGame()
        # Capture Tk values on its owning thread.
        path,settings=self.path.get(),self.settings();current=self.game
        def worker():
            try:current.start(path,settings)
            except Exception as error:current.events.put({'kind':'launch-error','error':str(error)})
        threading.Thread(target=worker,daemon=True).start()
    def unlocked(self,enabled):
        if self.last_locked==enabled:return
        self.last_locked=enabled
        for widget in self.controls:widget.configure(state=('readonly'if isinstance(widget,(ttk.Combobox,ttk.Spinbox))else'normal')if enabled else'disabled')
    def poll(self):
        if self.game:
            try:
                while True:
                    item=self.game.events.get_nowait();kind=item.get('kind')
                    if kind=='ready':self.launching=False;self.stop.configure(state='normal');self.status.set('Native Mayhem ready. Host a lobby or start a solo match normally.')
                    elif kind=='status':
                        match=item.get('match');self.unlocked(not match or match['phase']==0)
                        if item.get('fault'):self.status.set('Mode error. Close the game and relaunch: '+item['fault'].splitlines()[0])
                        elif match:
                            clock=match['clock'];state=item['state'];self.status.set(f"{'Endless'if state['endless']else'Match'} {int(clock)//60}:{int(clock)%60:02} · wave {state['wave']} · gold ×{item['scaling']['gold']:.2f}\nNext boss in {max(0,int(state['nextWave']-clock))}s · {'Rune Storm active'if state['event']==4 else'events enabled'}")
                        else:self.status.set('Native Mayhem ready. Host a match; guests use the normal game.')
                    elif kind in ('launch-error','closed'):
                        self.status.set(item.get('error')or('The game closed unexpectedly.'if item.get('crashed')else'Game closed. Ready to launch again.'))
                        self.game=None;self.launching=False;self.launch.configure(state='normal');self.stop.configure(state='disabled');self.browse.configure(state='normal');self.path_entry.configure(state='normal');self.unlocked(True);break
                    elif kind=='fault':self.status.set('Native mode error: '+item['error'].splitlines()[0])
            except queue.Empty:pass
        self.window.after(200,self.poll)
    def close_game(self):
        if self.game and messagebox.askyesno('Close game?','This closes the game launched by Mayhem. Finish or leave your match first.'):self.game.close()
    def quit(self):
        if self.game and not messagebox.askyesno('Close Mayhem?','Closing Mayhem also closes its game. Finish or leave your match first.'):return
        if self.game:self.game.close()
        self.window.destroy()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--self-test',action='store_true');parser.add_argument('--game');parser.add_argument('--report');parser.add_argument('--seconds',type=int,default=15);args=parser.parse_args()
    if args.self_test:
        if not args.game or not args.report:parser.error('--self-test requires --game and --report')
        raise SystemExit(self_test(args.game,args.report,args.seconds))
    window=tk.Tk();app=App(window);window.mainloop()
