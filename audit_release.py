"""Audit source and decompressed EXE contents before publishing a release."""
from pathlib import Path
import hashlib
import io
import json
import os
import re
import sys
import types
import zipfile
from PyInstaller.archive.readers import CArchiveReader

ROOT=Path(__file__).resolve().parent
EXE=ROOT/'dist/AzerothSurvivorsMayhemNative-0.9.6.exe'

def main():
    failures=[]
    scanned=0
    account=os.environ.get('USERNAME','')
    patterns=[('Windows user profile path',rb'[A-Za-z]:[\\/]Users[\\/](?!Public[\\/]|Default[\\/]|All Users[\\/])[^\\/\x00\r\n"\']{1,80}[\\/]'),
              ('GitHub token',rb'gh[pousr]_[A-Za-z0-9]{24,}'),
              ('fine-grained GitHub token',rb'github_pat_[A-Za-z0-9_]{30,}'),
              ('sealed game save',rb'RSE1:[A-Za-z0-9+/=]{40,}')]
    if account and len(account)>=3:
        patterns.append(('build-account identifier',rb'(?<![A-Za-z0-9_])'+re.escape(account.encode())+rb'(?![A-Za-z0-9_])'))
    compiled=[(name,re.compile(pattern,re.I)) for name,pattern in patterns]
    def scan(label,data):
        nonlocal scanned
        scanned+=1
        # Exact upstream Frida binary has a generic documentation example and
        # GitHub Actions runneradmin build paths. Neither is this user's data.
        if label=='EXE!frida\\_frida.pyd':
            expected='2157c0a2d83222cfb377e7c4526ac4fd117635ee3c883867af4e919d57d8a753'
            if hashlib.sha256(data).hexdigest()!=expected:failures.append({'file':label,'reason':'unexpected Frida runtime'})
            data=data.replace(b'C:'+b'/Users/'+b'runneradmin/',b'UPSTREAM_BUILD/').replace(b'C:'+bytes([92])+b'Users'+bytes([92])+b'...'+bytes([92]),b'DOC_EXAMPLE/')
        for candidate in [data,data.replace(b'\\\\',b'\\'),data.decode('utf-16le',errors='ignore').encode('utf-8')]:
            for name,pattern in compiled:
                if pattern.search(candidate):
                    failures.append({'file':label,'reason':name})
                    break
        if data.startswith(b'PK\x03\x04') and zipfile.is_zipfile(io.BytesIO(data)):
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                for name in archive.namelist():
                    if not name.endswith('/'):scan(label+'!'+name,archive.read(name))
    def code(label,obj):
        if isinstance(obj,types.CodeType):
            scan(label+':filename',obj.co_filename.encode())
            if any(x in obj.co_names for x in ('unlock_save','native_unlock')):failures.append({'file':label,'reason':'private collection code'})
            for index,value in enumerate(obj.co_consts):code(label+':const'+str(index),value)
        elif isinstance(obj,str):scan(label,obj.encode())
        elif isinstance(obj,bytes):scan(label,obj)
        elif isinstance(obj,(tuple,list)):
            for index,value in enumerate(obj):code(label+':item'+str(index),value)
    allowed={'map_travel.js','app.py','overlay.py','settings.py','compatibility.py','compatibility-manifest.json','native_runtime.py','agent.js','patterns.js','effects.js','permanent-rewards.js','rewards.js','native-profile.json','build_windows.py','audit_release.py','requirements-build.txt','README.md','README.txt','PRIVACY.md','LICENSE','THIRD_PARTY_NOTICES.md','.gitignore'}
    public=[]
    for path in sorted(ROOT.rglob('*')):
        if not path.is_file():continue
        relative=path.relative_to(ROOT)
        if relative.parts[0] in {'build','dist','.git','__pycache__'}:continue
        if relative.name.startswith(('test_','probe_')):continue
        if len(relative.parts)==1 and relative.name not in allowed:
            failures.append({'file':relative.as_posix(),'reason':'not in public source allowlist'});continue
        if len(relative.parts)>1 and relative.parts[0] not in {'assets','third_party_licenses'}:
            failures.append({'file':relative.as_posix(),'reason':'not in public source allowlist'});continue
        if path.suffix.lower() in {'.sav','.log','.db','.sqlite','.wasm','.har'}:
            failures.append({'file':relative.as_posix(),'reason':'private/development artifact type'});continue
        public.append(relative.as_posix());scan(relative.as_posix(),path.read_bytes())
    scan(EXE.name,EXE.read_bytes())
    forbidden=(b'private-unlock-catalog',b'unlock_save',b'Unlock everything',b'PrivateUnlockBackups')
    archive=CArchiveReader(str(EXE))
    for name,entry in archive.toc.items():
        if entry[-1]=='z':
            pyz=archive.open_embedded_archive(name)
            for module in pyz.toc:
                obj=pyz.extract(module)
                if isinstance(obj,types.CodeType):code(name+'!'+module,obj)
                elif isinstance(obj,bytes):scan(name+'!'+module,obj)
        else:
            payload=archive.extract(name)
            if isinstance(payload,bytes):
                scan('EXE!'+name,payload)
                if any(marker in payload for marker in forbidden):failures.append({'file':name,'reason':'private feature in public EXE'})
    failures=list({(item['file'],item['reason']):item for item in failures}.values())
    result={'passed':not failures,'version':'0.9.6','exe':EXE.name,'sha256':hashlib.sha256(EXE.read_bytes()).hexdigest(),
            'scannedPayloads':scanned,'publicSourceFiles':public,'findings':failures,
            'upstreamRuntimeExceptions':[{'file':'frida/_frida.pyd','sha256':'2157c0a2d83222cfb377e7c4526ac4fd117635ee3c883867af4e919d57d8a753','scope':'Exact unmodified upstream binary: generic documentation placeholder and GitHub Actions runneradmin build paths only; build-account and token scans still apply.'}],
            'checks':['allowlisted public source','decompressed EXE archive','Python module filenames and constants',
                      'embedded ZIP contents','Windows profile paths','build-account identifier','GitHub token patterns','sealed save payloads']}
    (ROOT/'dist/PRIVACY-AUDIT.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({'passed':result['passed'],'scannedPayloads':scanned,'findings':failures},indent=2))
    return 0 if result['passed'] else 1

if __name__=='__main__':raise SystemExit(main())
