"""Windows GUI and isolated packaged-app diagnostics."""
from pathlib import Path
import json
import os
import queue
import sys
import tempfile
import threading
import tkinter as tk
from tkinter import messagebox
import webbrowser
from trainer_runtime import APP_NAME, VERSION, RESOURCE_ROOT, data_root, launch, verified_backup


def smoke_test(output):
    result = {'version': VERSION, 'packaged': bool(getattr(sys, 'frozen', False))}
    try:
        with tempfile.TemporaryDirectory(prefix='azs-trainer-test-') as folder:
            result['game'] = launch(lambda _: None, threading.Event(), headless=True, temporary_root=folder, smoke=True)
            text = 'isolated-backup-integrity-check'
            import hashlib
            record = {'text':text, 'sha256':hashlib.sha256(text.encode()).hexdigest()}
            saved = verified_backup(record, Path(folder)/'Backups')
            result['backupVerified'] = saved['verified'] and (Path(folder)/'Backups'/saved['filename']).read_text() == text
            result['success'] = result['game']['ready'] and result['game']['mayhem']=='object' and result['game']['defaults'] and result['game']['modeOnly'] and result['backupVerified']
    except Exception as error:
        result['success'] = False
        result['error'] = type(error).__name__ + ': ' + str(error)
    Path(output).write_text(json.dumps(result,indent=2),encoding='utf-8')
    return 0 if result['success'] else 1


def main():
    root = tk.Tk()
    root.title(APP_NAME + ' ' + VERSION)
    root.geometry('640x610')
    root.resizable(False, False)
    root.configure(bg='#101720')
    root.iconbitmap(str(RESOURCE_ROOT/'assets/wow.ico'))
    events = queue.Queue()
    stop = threading.Event()
    running = False
    closing = False
    gold, white, muted = '#e4bc69', '#eef3f8', '#b1c0cf'
    panel = tk.Frame(root,bg='#101720',padx=26,pady=20)
    panel.pack(fill='both',expand=True)
    icon = tk.PhotoImage(file=str(RESOURCE_ROOT/'assets/wow.png'))
    heading = tk.Frame(panel,bg='#101720');heading.pack(fill='x')
    tk.Label(heading,image=icon,bg='#101720').pack(side='left',padx=(0,12))
    tk.Label(heading,text='LEGENDARY MAYHEM',fg=gold,bg='#101720',font=('Segoe UI',19,'bold')).pack(anchor='w')
    tk.Label(panel,text='Custom game mode  '+VERSION,fg=muted,bg='#101720',font=('Segoe UI',11)).pack(anchor='w',pady=(4,14))
    tk.Label(panel,text='Cross-map bosses every 2 minutes\nTougher bosses · Hazards every 20 seconds + camping\nPre-match settings · Boss damage, Legendary timing, events',justify='left',fg=white,bg='#1b2734',padx=14,pady=12,font=('Segoe UI',11)).pack(fill='x')
    tk.Label(panel,text='Rune Storm · Treasure Rush · Guardian Hunt · Berserker Rush\nPriority game announcements · Boss-kill fireworks',justify='left',fg=white,bg='#101720',font=('Segoe UI',11)).pack(anchor='w',pady=12)
    tk.Label(panel,text='HOST runs this mode; friends join with the normal game.\nNormal gold costs. Defaults: Legendary guarantees at 0 / 10 / 20 minutes.\nSeparate local profile; import your save if wanted.',justify='left',fg=muted,bg='#101720',font=('Segoe UI',10)).pack(anchor='w')
    status = tk.StringVar(value='Ready. Requires Windows 10/11, current Edge or Chrome, and internet.')
    tk.Label(panel,textvariable=status,wraplength=580,justify='left',fg=gold,bg='#101720',font=('Segoe UI',10),height=3).pack(fill='x',pady=(14,6))

    def folder(name):
        path=data_root()/name;path.mkdir(parents=True,exist_ok=True);os.startfile(path)

    def worker():
        try:
            launch(lambda text:events.put(('status',text)),stop)
        except Exception as error:
            message=str(error)
            if 'ProcessSingleton' in message or 'profile' in message.lower() and 'lock' in message.lower():
                message='This Mayhem profile is already open. Close its existing browser window, then launch again.'
            events.put(('error',message))
        finally:
            events.put(('done',None))

    def start():
        nonlocal running
        if running:return
        running=True;stop.clear();play.configure(state='disabled');status.set('Starting Legendary Mayhem…')
        threading.Thread(target=worker,daemon=True,name='trainer-browser').start()

    play=tk.Button(panel,text='Launch Legendary Mayhem',command=start,bg='#715221',fg='white',activebackground='#936c2c',activeforeground='white',font=('Segoe UI',12,'bold'),relief='flat',pady=10)
    play.pack(fill='x',pady=(6,10))
    row=tk.Frame(panel,bg='#101720');row.pack(fill='x')
    for label,callback in [('Instructions',lambda:os.startfile(RESOURCE_ROOT/'README.txt')),('Backups',lambda:folder('Backups')),('Exported saves',lambda:folder('Exported Saves'))]:
        tk.Button(row,text=label,command=callback,bg='#263544',fg=white,relief='flat',font=('Segoe UI',10),padx=12,pady=6).pack(side='left',padx=(0,8))
    tk.Label(panel,text='Unofficial tool. Not affiliated with Blizzard or the game developer.\nClosing this launcher also closes its game browser.',justify='left',fg=muted,bg='#101720',font=('Segoe UI',9)).pack(anchor='w',pady=(14,0))

    def close():
        nonlocal closing
        if running:
            closing=True;stop.set();status.set('Closing the game browser…')
        else:root.destroy()

    def poll():
        nonlocal running
        try:
            while True:
                kind,text=events.get_nowait()
                if kind=='status':status.set(text)
                elif kind=='error':
                    status.set('Could not open Legendary Mayhem.');messagebox.showerror(APP_NAME,text,parent=root)
                elif kind=='done':
                    running=False;play.configure(state='normal')
                    if closing:root.destroy();return
                    status.set('Game closed. Your progress stays in this Windows account.')
        except queue.Empty:pass
        root.after(200,poll)
    root.protocol('WM_DELETE_WINDOW',close)
    root.after(200,poll)
    if '--ui-smoke-test' in sys.argv:root.after(1500,root.destroy)
    root.mainloop()


if __name__=='__main__':
    if len(sys.argv)==3 and sys.argv[1]=='--smoke-test':
        raise SystemExit(smoke_test(sys.argv[2]))
    main()
