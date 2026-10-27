"""Build from an allowlisted source tree; never collect a browser profile or save."""
from pathlib import Path
import hashlib
import importlib.metadata
import os
import shutil
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parent
VERSION='0.4.1'
NAME='AzerothSurvivorsCustomMode-0.4.1'

def main():
    os.chdir(ROOT)
    build=ROOT/'build';build.mkdir(exist_ok=True)
    licenses=ROOT/'third_party_licenses';licenses.mkdir(exist_ok=True)
    for package in ['playwright','pyinstaller','greenlet','pyee','typing_extensions']:
        dist=importlib.metadata.distribution(package)
        for item in dist.files or []:
            if Path(item).name.upper().startswith(('LICENSE','COPYING','NOTICE','THIRDPARTYNOTICES')):
                source=dist.locate_file(item)
                if source.is_file():
                    name=package+'-'+'_'.join(Path(item).parts[-3:])
                    shutil.copyfile(source,licenses/name)
    for source,name in [(Path(sys.base_prefix)/'LICENSE.txt','Python-LICENSE.txt'),
                        (Path(sys.base_prefix)/'tcl/tcl8.6/license.terms','Tcl-license.terms'),
                        (Path(sys.base_prefix)/'tcl/tk8.6/license.terms','Tk-license.terms')]:
        if source.is_file():shutil.copyfile(source,licenses/name)
    version_file=build/'version-info.txt'
    version_file.write_text('''VSVersionInfo(ffi=FixedFileInfo(filevers=(0,4,1,0),prodvers=(0,4,1,0),mask=0x3f,flags=0,OS=0x40004,fileType=1,subtype=0,date=(0,0)),kids=[StringFileInfo([StringTable('040904B0',[StringStruct('CompanyName','Community project'),StringStruct('FileDescription','Azeroth Survivors community trainer'),StringStruct('FileVersion','0.4.1'),StringStruct('InternalName','AzerothSurvivorsCustomMode'),StringStruct('OriginalFilename','AzerothSurvivorsCustomMode.exe'),StringStruct('ProductName','Azeroth Survivors Custom Mode'),StringStruct('ProductVersion','0.4.1'),StringStruct('LegalCopyright','Community trainer code; third-party notices included')])]),VarFileInfo([VarStruct('Translation',[1033,1200])])])''',encoding='utf-8')
    command=[sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onefile','--windowed',
        '--name',NAME,'--icon',str(ROOT/'assets/wow.ico'),'--version-file',str(version_file),
        '--distpath','dist','--workpath','build/pyinstaller','--specpath','build',
        '--collect-all','playwright','--add-data',str(ROOT/'README.txt')+';.','--add-data',str(ROOT/'extension')+';extension','--add-data',str(ROOT/'assets')+';assets',
        '--add-data',str(licenses)+';third_party_licenses',str(ROOT/'app.py')]
    subprocess.run(command,check=True)
    exe=ROOT/'dist'/(NAME+'.exe')
    archive=ROOT/'dist'/f'AzerothSurvivorsCustomMode-{VERSION}-Windows-x64.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        z.write(exe,exe.name)
        for name in ['README.txt','PRIVACY.md','LICENSE','THIRD_PARTY_NOTICES.md']:
            z.write(ROOT/name,name)
        for path in sorted(licenses.iterdir()):
            if path.is_file():z.write(path,'third_party_licenses/'+path.name)
        z.write(ROOT/'assets/ATTRIBUTION.txt','third_party_licenses/WoW-icon-attribution.txt')
    checksums=''.join(hashlib.sha256(path.read_bytes()).hexdigest()+'  '+path.name+'\n' for path in [exe,archive])
    (ROOT/'dist/SHA256SUMS.txt').write_text(checksums,encoding='ascii')
    print('Built EXE and ZIP. Run audit_release.py before publishing.')

if __name__=='__main__':main()
