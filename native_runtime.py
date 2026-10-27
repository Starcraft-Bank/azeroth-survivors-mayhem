"""Launch and own one supported native game process; never patch files."""
from pathlib import Path
import hashlib,json,os,queue,sys,threading,time

ROOT=Path(getattr(sys,'_MEIPASS',Path(__file__).resolve().parent))
VERSION='0.7.0'
from settings import DEFAULTS, SCHEMA, validate_settings


def check_game(path):
    exe=Path(path).resolve(strict=True)
    profile=json.loads((ROOT/'native-profile.json').read_text(encoding='utf-8'))
    if not exe.is_file() or exe.stat().st_size!=profile['bytes']:
        raise ValueError('Select the supported AzerothSurvivors.exe (native 0.120.5, e0e2410c).')
    with exe.open('rb') as stream:digest=hashlib.file_digest(stream,'sha256').hexdigest()
    if digest!=profile['sha256']:
        raise ValueError('This native game build is unsupported. No hooks were installed. Use 0.120.5 (e0e2410c).')
    if not (exe.parent/'Data').is_dir():raise ValueError('The game needs its Data folder beside AzerothSurvivors.exe.')
    return exe,profile

class NativeGame:
    def __init__(self):
        self.events=queue.Queue();self.device=None;self.session=None;self.agent=None;self.pid=None
        self.ready=False;self.closed=threading.Event();self.lock=threading.RLock();self.latest=None

    def start(self,path,settings,environment=None):
        if not validate_settings(settings):raise ValueError('Invalid pre-match settings.')
        exe,profile=check_game(path)
        import frida
        with self.lock:
            if self.closed.is_set():raise RuntimeError('The launcher closed before the game started.')
            if self.pid:raise RuntimeError('The game is already running.')
            self.device=frida.get_local_device()
            # Prevent the game's updater from changing the checked build during
            # this session. Everything else uses the player's ordinary game/save.
            env=dict(os.environ,WOW_ROGUE_UPDATE_AUTO='0',WOW_ROGUE_UPDATE='0')
            if environment:env.update(environment)
            self.pid=self.device.spawn(str(exe),argv=[str(exe)],env=env,cwd=str(exe.parent))
            try:
                self.session=self.device.attach(self.pid)
                self.session.on('detached',self._detached)
                source='globalThis.MAYHEM_SCHEMA='+json.dumps(SCHEMA)+';\n'+'globalThis.MAYHEM_NATIVE_PROFILE='+json.dumps(profile)+';\nglobalThis.MAYHEM_SETTINGS='+json.dumps(settings)+';\n'+(ROOT/'agent.js').read_text(encoding='utf-8')
                self.agent=self.session.create_script(source,name='LegendaryMayhemNative')
                self.agent.on('message',self._message);self.agent.load()
                if not self.ready:raise RuntimeError('The native mode did not initialize; the game was not resumed.')
                self.device.resume(self.pid)
            except BaseException:
                self.close();raise

    def _message(self,message,data):
        if message.get('type')=='send':
            value=message['payload']
            if value.get('kind')=='ready':self.ready=True
            if value.get('kind')=='status':self.latest=value
            self.events.put(value)
        elif message.get('type')=='error':
            self.events.put(dict(kind='fault',error=message.get('description','Native runtime error')))

    def _detached(self,reason,crash=None):
        self.closed.set();self.ready=False
        self.events.put(dict(kind='closed',reason=reason,crashed=crash is not None))

    def configure(self,settings):
        if not validate_settings(settings):return False
        return self.agent.exports_sync.configure(settings)

    def control(self,name,value):return self.agent.exports_sync.control(name,bool(value))

    def close(self):
        # Enemy ability/definition slices borrow agent-owned memory. Terminate
        # our own child before unloading the session; never detach a live game.
        with self.lock:
            if self.pid and self.device:
                try:self.device.kill(self.pid)
                except Exception as error:
                    if type(error).__name__!='ProcessNotFoundError':raise
            self.pid=None;self.ready=False;self.closed.set()

def self_test(game,report,seconds=15):
    """Packaged launch check: isolated save, no combat/test memory writes."""
    target=Path(report).resolve();target.parent.mkdir(parents=True,exist_ok=True)
    session=NativeGame();result={'version':VERSION,'success':False}
    private=target.parent/'smoke-profile';private.mkdir(exist_ok=True)
    try:
        session.start(game,dict(DEFAULTS),dict(WOW_ROGUE_SAVE=str(private/'save.txt'),APPDATA=str(private/'Roaming'),LOCALAPPDATA=str(private/'Local')))
        end=time.monotonic()+seconds
        while time.monotonic()<end and not session.closed.is_set():time.sleep(.25)
        result.update(success=session.ready and bool(session.latest) and not session.latest.get('fault'),status=session.latest)
    except Exception as error:result['error']=str(error)
    finally:
        session.close();target.write_text(json.dumps(result,indent=2),encoding='utf-8')
    return 0 if result['success'] else 1
