"""Offline native compatibility discovery. Never executes or attaches to a game.

Instruction patterns locate hooks. A reviewed adapter's normalized loaded-image
identity must ALSO match before its ABI, field offsets or data tables are used.
Changed logic with familiar function prologues is discovery, not compatibility.
"""
from pathlib import Path
import hashlib,json,re,struct
import pefile

MAX_IMAGE=256*1024*1024

def parse_image(data):
    if len(data)>512*1024*1024:raise ValueError('Executable exceeds the supported analysis size.')
    try:pe=pefile.PE(data=data,fast_load=True)
    except pefile.PEFormatError as e:raise ValueError('Not a valid native Windows executable.') from e
    if pe.FILE_HEADER.Machine!=0x8664 or pe.OPTIONAL_HEADER.Magic!=0x20b:
        raise ValueError('Select a native Windows x64 game executable.')
    if not 0<pe.OPTIONAL_HEADER.SizeOfImage<=MAX_IMAGE:raise ValueError('Invalid native image size.')
    headers=pe.OPTIONAL_HEADER.SizeOfHeaders
    if headers>len(data) or headers>pe.OPTIONAL_HEADER.SizeOfImage:raise ValueError('Truncated PE headers.')
    ranges=[]
    for s in pe.sections:
        start=s.VirtualAddress;size=max(s.Misc_VirtualSize,s.SizeOfRawData)
        if start<headers or start+size>pe.OPTIONAL_HEADER.SizeOfImage:
            raise ValueError('Invalid PE section layout.')
        if s.SizeOfRawData and s.PointerToRawData+s.SizeOfRawData>len(data):raise ValueError('Truncated PE section.')
        ranges.append((start,start+size))
    ranges.sort()
    if any(b>c for (a,b),(c,d) in zip(ranges,ranges[1:])):raise ValueError('Overlapping PE sections.')
    return pe

def normalized_identity(data,pe=None):
    """Ignore only loader-neutral packaging fields and correct preferred-base rebases.

    All mapped instructions, data, resources, imports, unwind metadata and section
    layout remain checked. Appended signatures/overlays are not mapped by Windows.
    Only DIR64 entries declared by the actual relocation directory are normalized.
    """
    pe=pe or parse_image(data)
    mapped=bytearray(pe.get_memory_mapped_image(max_virtual_address=MAX_IMAGE))
    if len(mapped)>MAX_IMAGE:raise ValueError('Oversized native image.')
    directory=pe.OPTIONAL_HEADER.DATA_DIRECTORY[5]
    cursor=directory.VirtualAddress;end=cursor+directory.Size
    if end>len(mapped):raise ValueError('Truncated relocation directory.')
    locations=[]
    while cursor<end:
        if cursor+8>end:raise ValueError('Truncated relocation block.')
        page,size=struct.unpack_from('<II',mapped,cursor)
        if size<8 or size%2 or cursor+size>end:raise ValueError('Invalid relocation block.')
        for (entry,) in struct.iter_unpack('<H',mapped[cursor+8:cursor+size]):
            kind=entry>>12
            if not kind:continue
            if kind!=10:raise ValueError('Unsupported relocation type.')
            locations.append(page+(entry&0xfff))
        cursor+=size
    previous=pe.OPTIONAL_HEADER.SizeOfHeaders
    for offset in sorted(locations):
        if offset<previous or offset+8>len(mapped) or (offset<end and offset+8>directory.VirtualAddress):
            raise ValueError('Invalid or overlapping relocation target.')
        value=struct.unpack_from('<Q',mapped,offset)[0]
        struct.pack_into('<Q',mapped,offset,(value-pe.OPTIONAL_HEADER.ImageBase)&0xffffffffffffffff)
        previous=offset+8
    fields=[(pe.FILE_HEADER.get_field_absolute_offset('TimeDateStamp'),4),
            (pe.OPTIONAL_HEADER.get_field_absolute_offset('CheckSum'),4),
            (pe.OPTIONAL_HEADER.get_field_absolute_offset('ImageBase'),8),
            (pe.OPTIONAL_HEADER.DATA_DIRECTORY[4].get_file_offset(),8)]
    for offset,size in fields:mapped[offset:offset+size]=bytes(size)
    return hashlib.sha256(mapped).hexdigest()

def find_pattern(sections,pattern,mask):
    pattern=bytes.fromhex(pattern);mask=bytes.fromhex(mask)
    if not pattern or len(pattern)!=len(mask) or len(pattern)>4096 or any(x not in (0,255) for x in mask):
        raise ValueError('Invalid bundled instruction signature.')
    runs=list(re.finditer(b'\xff+',mask))
    if not runs:raise ValueError('Instruction signature has no fixed bytes.')
    anchor=max(runs,key=lambda m:m.end()-m.start());needle=pattern[anchor.start():anchor.end()]
    fixed=[(i,v) for i,v in enumerate(pattern) if mask[i]];matches=[]
    for rva,body in sections:
        offset=0
        while True:
            hit=body.find(needle,offset)
            if hit<0:break
            offset=hit+1;start=hit-anchor.start()
            if start>=0 and start+len(pattern)<=len(body) and all(body[start+i]==v for i,v in fixed):
                matches.append(rva+start)
                if len(matches)>=64:return matches
    return matches

def analyze_game(path,manifest_path):
    data=Path(path).read_bytes();pe=parse_image(data)
    manifest=json.loads(Path(manifest_path).read_text(encoding='utf-8'))
    if manifest.get('schema')!=1 or not manifest.get('adapters'):raise ValueError('Missing compatibility manifest.')
    digest=hashlib.sha256(data).hexdigest();runtime=normalized_identity(data,pe)
    sections=[(s.VirtualAddress,s.get_data()) for s in pe.sections if s.Characteristics&0x20000000]
    reports=[];selected=None
    for adapter in manifest['adapters']:
        rows={}
        for name,signature in adapter['signatures'].items():
            candidates=find_pattern(sections,signature['pattern'],signature['mask'])
            rows[name]={'candidates':candidates,'unique':len(candidates)==1,
                        'referencePresent':signature['rva'] in candidates}
        identity=runtime==adapter['runtimeSha256']
        expected=all(row['referencePresent'] for row in rows.values())
        accepted=identity and expected and bool(rows)
        reports.append({'version':adapter['profile']['version'],'runtimeEquivalent':identity,
                        'matched':sum(bool(v['candidates']) for v in rows.values()),
                        'total':len(rows),'hooks':rows,'accepted':accepted})
        if accepted:
            if selected is not None:raise ValueError('Ambiguous compatibility adapters.')
            selected=adapter['profile']
    report={'schema':1,'fileBytes':len(data),'fileSha256':digest,'runtimeSha256':runtime,
            'compatible':selected is not None,'adapters':reports,
            'method':'instruction patterns plus reviewed code/data/layout identity',
            'processAccessed':False}
    if selected:
        report['decision']='reviewed' if digest==selected['sha256'] else 'runtime-equivalent'
        report['version']=selected['version'];report['stamp']=selected['stamp']
        report['validation']=selected.get('validation','native-tested')
        report['message']='Compatible adapter detected automatically.'
        if report['validation']=='static-review-only':report['message']+=' Preview: native gameplay testing is pending.'
    else:
        best=max(reports,key=lambda r:r['matched'])
        report['decision']='adapter-required'
        report['message']=(f"Found {best['matched']}/{best['total']} hook patterns, but this build's code or data layout "
                           'is not verified. No game process was opened. Share the compatibility report to add support.')
    return selected,report

def write_report(path,report):
    target=Path(path);target.parent.mkdir(parents=True,exist_ok=True)
    temporary=target.with_suffix(target.suffix+'.tmp')
    temporary.write_text(json.dumps(report,indent=2),encoding='utf-8');temporary.replace(target)
