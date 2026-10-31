"""Small native launcher; mode settings live in the Insert overlay."""
from pathlib import Path
import argparse,json,os,queue,sys,threading
import tkinter as tk
from tkinter import filedialog,messagebox,ttk
from native_runtime import ROOT,VERSION,NativeGame,self_test,compatibility_check
from settings import CONTROLS,migrate_settings
from overlay import Overlay,BG,TEXT,GOLD
from updates import UpdateFooter
PREFS=Path(os.environ.get('LOCALAPPDATA',Path.home()))/'LegendaryMayhemNative'/'settings.json'

class App:
    def __init__(self,window):
        self.window=window;self.game=None;self.launching=False;self.saved={}
        try:self.saved=json.loads(PREFS.read_text(encoding='utf-8'))
        except (OSError,ValueError):pass
        self.current_settings=migrate_settings(self.saved.get('settings',{}))
        self.current_controls={k:self.saved.get('controls',{}).get(k,v) is True for k,v in CONTROLS.items()}
        window.title('Legendary Mayhem · Native '+VERSION);window.geometry('600x520');window.minsize(560,520)
        try:window.iconbitmap(str(ROOT/'assets/wow.ico'))
        except tk.TclError:pass
        window.configure(bg=BG);style=ttk.Style(window);style.theme_use('clam')
        style.configure('.',background='#182334',foreground=TEXT,font=('Segoe UI',10))
        style.configure('TFrame',background=BG);style.configure('TLabel',background=BG)
        style.configure('TNotebook',background=BG,borderwidth=0);style.configure('TNotebook.Tab',padding=(8,9))
        style.map('TNotebook.Tab',background=[('selected','#263b53')],foreground=[('selected',GOLD)])
        style.configure('TButton',padding=8)
        style.map('TButton',background=[('disabled','#17202c'),('active','#30465e')],foreground=[('disabled','#6b7b8e'),('active',TEXT)])
        style.map('TCheckbutton',background=[('active',BG)],foreground=[('active',TEXT)])
        window.option_add('*TCombobox*Listbox.background','#25384f');window.option_add('*TCombobox*Listbox.foreground',TEXT)
        style.configure('Accent.TButton',background='#c49a51',foreground='#101722',font=('Segoe UI',10,'bold'))
        style.map('Accent.TButton',background=[('active','#e5bc75')],foreground=[('active','#101722')])
        style.map('TCombobox',fieldbackground=[('readonly','#25384f')],foreground=[('readonly','#ffffff')])
        style.configure('TSpinbox',fieldbackground='#25384f',foreground=TEXT)
        frame=ttk.Frame(window,padding=24);frame.pack(fill='both',expand=True)
        ttk.Label(frame,text='LEGENDARY MAYHEM',font=('Segoe UI',22,'bold'),foreground=GOLD).pack(anchor='w')
        ttk.Label(frame,text='Native edition  /  '+VERSION).pack(anchor='w',pady=(0,16))
        ttk.Label(frame,text='Game executable · automatic compatibility detection').pack(anchor='w')
        row=ttk.Frame(frame);row.pack(fill='x',pady=(6,10))
        beside=Path(sys.executable).parent/'AzerothSurvivors.exe'
        self.path=tk.StringVar(value=self.saved.get('game','') or (str(beside) if beside.exists() else ''))
        self.path_entry=ttk.Entry(row,textvariable=self.path);self.path_entry.pack(side='left',fill='x',expand=True)
        self.browse=ttk.Button(row,text='Browse…',command=self.choose);self.browse.pack(side='right',padx=(8,0))
        self.status=tk.StringVar(value='Launch the game, then press INSERT to open the control panel.')
        ttk.Label(frame,textvariable=self.status,wraplength=530).pack(anchor='w',fill='x',pady=12)
        line=ttk.Frame(frame);line.pack(fill='x')
        self.launch=ttk.Button(line,text='Launch Mayhem',command=self.open_game,style='Accent.TButton');self.launch.pack(side='left')
        self.panel_button=ttk.Button(line,text='Open overlay',command=lambda:self.overlay.show(),state='disabled');self.panel_button.pack(side='left',padx=8)
        self.stop=ttk.Button(line,text='Close game',command=self.close_game,state='disabled');self.stop.pack(side='right')
        ttk.Label(frame,text='All settings are in the Insert overlay. Use windowed or borderless mode.\nKeep Mayhem open while playing.',wraplength=530).pack(anchor='w',pady=14)
        guide_row=ttk.Frame(frame);guide_row.pack(fill='x')
        ttk.Button(guide_row,text='Open guide',command=lambda:os.startfile(str(ROOT/'README.txt'))).pack(side='left')
        self.check_button=ttk.Button(guide_row,text='Optional diagnostics',command=self.check_compatibility);self.check_button.pack(side='right')
        self.updates=UpdateFooter(frame,VERSION,'Starcraft-Bank/azeroth-survivors-mayhem')
        self.checking=False;self.check_events=queue.Queue()
        self.overlay=Overlay(self,self.current_settings,self.current_controls)
        window.protocol('WM_DELETE_WINDOW',self.quit);window.after(200,self.poll)
    def check_compatibility(self):
        if self.checking:return
        self.checking=True;self.check_button.configure(state='disabled')
        path=self.path.get();report_path=PREFS.parent/'compatibility-report.json'
        self.status.set('Scanning the selected EXE without opening a game…')
        def worker():
            try:
                _,profile,report=compatibility_check(path,report_path)
                message=report['message']
                self.check_events.put(message+' Report: '+str(report_path))
            except Exception as e:self.check_events.put(str(e))
        threading.Thread(target=worker,daemon=True).start()
    def extend_session(self,page,overlay):pass
    def travel(self,zone):
        if not self.game or not self.game.ready:raise ValueError('Start a solo match or host a match first.')
        result=self.game.travel(zone)
        if not result or isinstance(result,dict) and result.get('ok') is False:
            raise ValueError((result.get('error') or result.get('reason') or 'Map transfer is unavailable.') if isinstance(result,dict) else 'Map transfer is unavailable.')
    def choose(self):
        path=filedialog.askopenfilename(title='Select AzerothSurvivors.exe',filetypes=[('Game executable','AzerothSurvivors.exe'),('Windows executable','*.exe')])
        if path:self.path.set(path);self.save()
    def save(self):
        PREFS.parent.mkdir(parents=True,exist_ok=True);temp=PREFS.with_suffix('.tmp')
        temp.write_text(json.dumps({'game':self.path.get(),'settings':self.current_settings,'controls':self.current_controls},indent=2),encoding='utf-8');temp.replace(PREFS)
    def set_control(self,name,value):
        if name not in CONTROLS or type(value) is not bool:raise ValueError('Invalid session control.')
        if self.game and self.game.ready and not self.game.control(name,value):raise ValueError('The game rejected this control.')
        self.current_controls[name]=value;self.save()
    def apply_settings(self,settings,controls):
        if self.game and self.game.ready:
            if not self.game.configure(settings):raise ValueError('The game rejected these settings.')
            for key,value in controls.items():
                if not self.game.control(key,value):raise ValueError('Could not apply session controls.')
        self.current_settings=dict(settings);self.current_controls=dict(controls);self.save()
    def open_game(self):
        if self.launching or self.game:return
        self.launching=True;self.launch.configure(state='disabled');self.browse.configure(state='disabled');self.path_entry.configure(state='disabled')
        self.status.set('Starting the game and initializing Mayhem…');self.save();self.game=NativeGame()
        path,settings,controls=self.path.get(),dict(self.current_settings),dict(self.current_controls);current=self.game
        def worker():
            try:
                current.start(path,settings)
                if current.ready:
                    for key,value in controls.items():current.control(key,value)
            except Exception as error:current.events.put({'kind':'launch-error','error':str(error)})
        threading.Thread(target=worker,daemon=True).start()
    def poll(self):
        try:
            result=self.check_events.get_nowait();self.checking=False;self.check_button.configure(state='normal')
            self.status.set(result.split(' Report:')[0])
            messagebox.showinfo('Compatibility result',result,parent=self.window)
        except queue.Empty:pass
        if self.game:
            try:
                while True:
                    item=self.game.events.get_nowait();kind=item.get('kind')
                    if kind=='ready':
                        self.launching=False;self.stop.configure(state='normal');self.panel_button.configure(state='normal');self.status.set(('UNVERIFIED BUILD. ' if self.game.unverified else '')+'Mayhem is running. Press INSERT for settings.')
                    elif kind=='degraded':
                        self.launching=False;self.stop.configure(state='normal');self.panel_button.configure(state='disabled');self.status.set(item['text'])
                    elif kind=='feature-unavailable':self.status.set(item['feature']+' unavailable; game continues.')
                    elif kind=='status':
                        self.overlay.update_status(item)
                        if item.get('fault'):self.status.set('Mode error. Relaunch the game: '+item['fault'].splitlines()[0])
                    elif kind in ('launch-error','closed'):
                        self.status.set(item.get('error') or ('The game closed unexpectedly.' if item.get('crashed') else 'Game closed. Ready to launch again.'))
                        self.game=None;self.launching=False;self.launch.configure(state='normal');self.stop.configure(state='disabled');self.panel_button.configure(state='disabled');self.browse.configure(state='normal');self.path_entry.configure(state='normal');self.overlay.update_travel({});self.overlay.hide(False);self.overlay.bridge.hwnd=None;break
                    elif kind=='fault':self.status.set('Native mode error: '+item['error'].splitlines()[0])
            except queue.Empty:pass
        self.window.after(200,self.poll)
    def close_game(self):
        if self.game and messagebox.askyesno('Close game?','This closes the game launched by Mayhem. Finish or leave your match first.'):self.game.close()
    def quit(self):
        if self.game and not messagebox.askyesno('Close Mayhem?','Closing Mayhem also closes its game. Finish or leave your match first.'):return
        if self.game:self.game.close()
        self.updates.close();self.overlay.hotkey.stop();self.window.destroy()

def main(app_class=App):
    parser=argparse.ArgumentParser();parser.add_argument('--self-test',action='store_true');parser.add_argument('--diagnose',action='store_true');parser.add_argument('--game');parser.add_argument('--report');parser.add_argument('--seconds',type=int,default=15);args=parser.parse_args()
    if args.diagnose:
        if not args.game or not args.report:parser.error('--diagnose requires --game and --report')
        try:
            _,profile,_=compatibility_check(args.game,args.report)
            raise SystemExit(0 if profile else 2)
        except (ValueError,OSError) as e:
            from compatibility import write_report
            write_report(args.report,{'compatible':False,'processAccessed':False,'message':('Could not read the selected executable.' if isinstance(e,OSError) else str(e))})
            raise SystemExit(2)
    if args.self_test:
        if not args.game or not args.report:parser.error('--self-test requires --game and --report')
        raise SystemExit(self_test(args.game,args.report,args.seconds))
    window=tk.Tk();app_class(window);window.mainloop()
if __name__=='__main__':main()
