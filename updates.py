"""Optional public release notice. Never downloads files or blocks game startup."""
import json
import http.client
import queue
import re
import threading
import urllib.error
import urllib.request
import webbrowser

REPOSITORIES = frozenset(('Starcraft-Bank/azeroth-survivors-mayhem',
                          'Starcraft-Bank/azeroth-survivors-trainer'))
MAX_RESPONSE = 64 * 1024


def version_number(value, installed=False):
    if not isinstance(value, str):
        raise ValueError('Invalid release version.')
    suffix = r'(?:-local)?' if installed else ''
    match = re.fullmatch(r'v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})' + suffix, value)
    if not match:
        raise ValueError('Invalid release version.')
    return tuple(int(part) for part in match.groups())


def release_result(payload, current_version, repository):
    if repository not in REPOSITORIES or not isinstance(payload, dict):
        raise ValueError('Invalid release response.')
    if payload.get('draft') is not False or payload.get('prerelease') is not False:
        raise ValueError('Not a public stable release.')
    tag = payload.get('tag_name')
    latest = version_number(tag)
    current = version_number(current_version, installed=True)
    url = 'https://github.com/' + repository + '/releases/tag/' + tag
    if payload.get('html_url') != url:
        raise ValueError('Unexpected release page.')
    name = '.'.join(map(str, latest))
    if latest > current:
        return {'state': 'available', 'text': 'App update available: ' + name,
                'version': name, 'url': url}
    if latest < current:
        return {'state': 'newer', 'text': 'Installed app is newer than the public release.',
                'version': name, 'url': None}
    return {'state': 'current', 'text': 'App is up to date (' + name + ').',
            'version': name, 'url': None}


def check_release(current_version, repository, opener=None):
    """Bounded read-only request; errors become quiet, retryable status text."""
    unavailable = {'state': 'unavailable', 'text': 'Update check unavailable. Try again.',
                   'version': None, 'url': None}
    try:
        if repository not in REPOSITORIES:
            return unavailable
        version_number(current_version, installed=True)
        request = urllib.request.Request(
            'https://api.github.com/repos/' + repository + '/releases/latest',
            headers={'Accept': 'application/vnd.github+json',
                     'User-Agent': 'Azeroth-Release-Notice',
                     'X-GitHub-Api-Version': '2022-11-28'})
        with (opener or urllib.request.urlopen)(request, timeout=5) as response:
            data = response.read(MAX_RESPONSE + 1)
        if len(data) > MAX_RESPONSE:
            return unavailable
        return release_result(json.loads(data.decode('utf-8')), current_version, repository)
    except urllib.error.HTTPError as error:
        error.close()
        if error.code in (403, 429):
            return dict(unavailable, text='GitHub update limit reached. Try again later.')
        return unavailable
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError,
            http.client.HTTPException, urllib.error.URLError):
        return unavailable


class UpdateFooter:
    """Only the Tk poll touches widgets; the daemon worker returns plain data."""
    def __init__(self, parent, current_version, repository):
        import tkinter as tk
        from tkinter import ttk
        self.parent = parent
        self.current_version = current_version
        self.repository = repository
        self.results = queue.Queue()
        self.closed = threading.Event()
        self.checking = False
        self.download_url = None
        self.frame = ttk.Frame(parent)
        self.frame.pack(fill='x', pady=(14, 0))
        ttk.Separator(self.frame).pack(fill='x', pady=(0, 8))
        self.status = tk.StringVar(master=parent, value='Checking for app updates…')
        ttk.Label(self.frame, textvariable=self.status, wraplength=520).pack(anchor='w')
        row = ttk.Frame(self.frame)
        row.pack(fill='x', pady=(6, 0))
        self.check_button = ttk.Button(row, text='Check for updates', command=self.check)
        self.check_button.pack(side='left')
        self.download_button = ttk.Button(row, text='Download update', command=self.download,
                                          state='disabled')
        self.download_button.pack(side='left', padx=(8, 0))
        self.start_id = parent.after(300, self.check)
        self.poll_id = parent.after(150, self.poll)

    def check(self):
        if self.closed.is_set() or self.checking:
            return
        self.checking = True
        self.check_button.configure(state='disabled')
        self.status.set('Checking for app updates…')
        def worker():
            result = check_release(self.current_version, self.repository)
            if not self.closed.is_set():
                self.results.put(result)
        threading.Thread(target=worker, daemon=True, name='release-notice').start()

    def poll(self):
        if self.closed.is_set():
            return
        try:
            while True:
                result = self.results.get_nowait()
                self.checking = False
                self.status.set(result['text'])
                self.download_url = result['url']
                self.check_button.configure(state='normal')
                self.download_button.configure(state='normal' if self.download_url else 'disabled')
        except queue.Empty:
            pass
        self.poll_id = self.parent.after(150, self.poll)

    def download(self):
        if self.download_url and not self.closed.is_set():
            webbrowser.open(self.download_url)

    def close(self):
        self.closed.set()
        for callback in (self.start_id, self.poll_id):
            try:
                self.parent.after_cancel(callback)
            except Exception:
                pass
