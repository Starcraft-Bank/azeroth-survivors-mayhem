"""Portable custom-mode runtime. All player data belongs to the current Windows user."""
from pathlib import Path
import hashlib
import os
import sys
import tempfile
import uuid
from urllib.parse import urlparse

APP_NAME = 'Azeroth Survivors Custom Mode'
VERSION = '0.4.1'
GAME_URL = 'https://wow.aethus.pl/'
RESOURCE_ROOT = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))


def data_root():
    base = os.environ.get('LOCALAPPDATA')
    if not base:
        raise RuntimeError('Windows LocalAppData is unavailable. No profile was opened.')
    return Path(base) / APP_NAME


def installed_browser():
    bases = [os.environ.get('PROGRAMFILES(X86)'), os.environ.get('PROGRAMFILES'), os.environ.get('LOCALAPPDATA')]
    for relative in ('Microsoft/Edge/Application/msedge.exe', 'Google/Chrome/Application/chrome.exe'):
        for base in bases:
            if base and (Path(base) / relative).is_file():
                return Path(base) / relative
    raise RuntimeError('Install or update Microsoft Edge or Google Chrome, then launch the mode again. Python is not required.')


def verified_backup(record, folder):
    text = record.get('text')
    if not isinstance(text, str) or not text or len(text) > 32_000_000:
        raise ValueError('Invalid backup save text.')
    data = text.encode('utf-8')
    digest = hashlib.sha256(data).hexdigest()
    if digest != record.get('sha256'):
        raise ValueError('Save backup checksum mismatch.')
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    filename = 'AzerothSurvivors pre-unlock ' + str(uuid.uuid4()) + '.sav'
    path = folder / filename
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=folder, suffix='.tmp', delete=False) as output:
            temporary = Path(output.name)
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        if temporary.read_bytes() != data:
            raise IOError('Save backup readback failed.')
        os.replace(temporary, path)
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise IOError('Final save backup verification failed.')
    finally:
        if temporary and temporary.exists():
            temporary.unlink()
    return {'verified': True, 'sha256': digest, 'filename': filename}


def launch(status, stop, *, headless=False, temporary_root=None, smoke=False):
    from playwright.sync_api import sync_playwright
    root = Path(temporary_root) if temporary_root else data_root()
    profile = root / 'Browser'
    profile.mkdir(parents=True, exist_ok=True)
    script = '\n'.join((RESOURCE_ROOT / 'extension' / name).read_text(encoding='utf-8')
                       for name in ('patch-data.js', 'save-backup.js', 'trainer.js', 'custom-mode.js'))
    browser = installed_browser()
    status('Opening ' + ('Edge' if browser.name == 'msedge.exe' else 'Chrome') + ' with a separate Mayhem profile…')
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(str(profile), executable_path=str(browser),
            headless=headless, no_viewport=not headless, accept_downloads=True,
            **({'args':['--enable-unsafe-webgpu'], 'viewport':{'width':1360,'height':860}} if headless else {}))
        try:
            def backup(source, record):
                address = urlparse(source['frame'].url)
                if address.scheme != 'https' or address.hostname != 'wow.aethus.pl':
                    raise ValueError('Backup requests are only accepted from the official game.')
                result = verified_backup(record, root / 'Backups')
                status('Pre-unlock backup verified and saved. The game is open.')
                return result

            def download(item):
                folder = root / 'Exported Saves'
                folder.mkdir(exist_ok=True)
                name = Path(item.suggested_filename).name
                path = folder / name
                if path.exists():
                    path = folder / (path.stem + '-' + str(uuid.uuid4()) + path.suffix)
                item.save_as(str(path))
                status('Save export retained. The game is open.')

            attached = set()
            def attach(page):
                if page not in attached:
                    page.on('download', download)
                    attached.add(page)

            context.expose_binding('__azs_storeBackup', backup)
            context.add_init_script(script=script)
            context.on('page', attach)
            page = context.pages[0] if context.pages else context.new_page()
            attach(page)
            page.goto(GAME_URL, wait_until='domcontentloaded', timeout=120000)
            status('Game open. Keep this launcher open while playing. Trainer controls are at the bottom right.')
            if smoke:
                page.wait_for_function('window.azsTrainer?.state.ready', timeout=180000)
                page.wait_for_function('!document.getElementById("wenilla-boot")', timeout=180000)
                return page.evaluate('({ready:azsTrainer.state.ready,status:azsTrainer.state.status,mayhem:typeof azsMayhem,defaults:azsMayhem.preferences.damagePreset===1&&azsMayhem.preferences.legendaryStart===0&&azsMayhem.preferences.legendaryInterval===10&&azsMayhem.preferences.eventMask===15,modeOnly:typeof azsTrainer.set==="undefined"&&!document.querySelector("#azs-trainer-panel").shadowRoot.querySelector("#god,#rapid,#spawner,#mayhem-testing"),backup:typeof AzsSaveBackup.create})')
            while context.pages and not stop.is_set():
                try:
                    context.pages[0].wait_for_timeout(500)
                except Exception:
                    if not context.pages:
                        break
            return None
        finally:
            context.close()
