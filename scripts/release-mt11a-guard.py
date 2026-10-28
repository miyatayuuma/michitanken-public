import os,sys,json,urllib.request,urllib.parse,hashlib,pathlib,shutil,re
root=pathlib.Path(os.environ['MT11A_WORK'])
api='https://firebasehosting.googleapis.com/v1beta1/'
site='sites/mygames-cb525'
base='https://mygames-cb525.web.app'
def request(url,auth=False):
 headers={'Accept-Encoding':'identity','Cache-Control':'no-cache'}
 if auth: headers['Authorization']='Bearer '+os.environ['MT11A_TOKEN']
 with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=60) as r:
  if r.status!=200: raise RuntimeError('HTTP '+str(r.status))
  return r.read()
def get(path): return json.loads(request(api+path,True))
def version():
 c=get(site+'/channels/live')
 name=c.get('release',{}).get('version',{}).get('name','')
 if not name.startswith(site+'/versions/'): raise RuntimeError('live version unavailable')
 return name
def entries(ver):
 result=[]; token=''
 while True:
  suffix='?pageSize=1000'+('&pageToken='+urllib.parse.quote(token) if token else '')
  data=get(ver+'/files'+suffix)
  result.extend(x['path'] for x in data.get('files',[]) if x.get('status','ACTIVE')=='ACTIVE')
  token=data.get('nextPageToken')
  if not token: return result
def live(path):
 return request(base+urllib.parse.quote(path,safe='/')+'?mt11a=1')
def files(p):
 out={}
 for item in p.rglob('*'):
  if item.is_symlink(): raise RuntimeError('symlink refused')
  if item.is_file():
   rel=item.relative_to(p)
   if any(x.startswith('.') or x=='node_modules' for x in rel.parts): continue
   out['/'+rel.as_posix()]=item
 return out
def equal(a,b): return hashlib.sha256(a).digest()==hashlib.sha256(b).digest()
def snap():
 channel=get(site+'/channels/live'); ver=version()
 retention=channel.get('retainedReleaseCount')
 if retention is None or int(retention)<2: raise RuntimeError('rollback retention not confirmed (need >=2)')
 manifest=entries(ver)
 (root/'live.json').write_text(json.dumps({'version':ver,'paths':manifest},ensure_ascii=False))
 ident=ver.rsplit('/',1)[-1]
 (root/'restore.txt').write_text('Previous Hosting version: '+ver+'\nRestore command:\nfirebase hosting:clone mygames-cb525:@'+ident+' mygames-cb525:live --project mygames-cb525\n')
 print('Recorded live Hosting version:',ver)
def integrate():
 src=root/'site'/'dist'; dst=root/'dream'/'public'/'games'/'michitanken'
 if not src.is_dir() or not dst.is_dir(): raise RuntimeError('build or game directory absent')
 # The only directory removed is the fresh DreamCore archive in this task.
 shutil.rmtree(dst);shutil.copytree(src,dst)
 index=dst/'index.html'; html=index.read_text()
 if '</head>' not in html or '../../assets/audio-settings.js' in html: raise RuntimeError('unexpected built HTML')
 index.write_text(html.replace('</head>','<script src="../../assets/audio-settings.js"></script>\n</head>',1))
 for name in ('npc.js','npc-storage.js'):
  txt=(root/'public'/'src'/name).read_text()
  if re.search(r'\b(fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|postMessage\s*\()',txt):
   raise RuntimeError('NPC image module contains network messaging API')
 print('Built game and checked NPC image module network APIs.')
def compare():
 saved=json.loads((root/'live.json').read_text());ver=saved['version']
 if version()!=ver: raise RuntimeError('live version changed')
 # Only the simple, known DreamCore Hosting configuration is accepted.
 h=json.loads((root/'dream'/'firebase.json').read_text())['hosting']
 if h.get('public')!='public' or set(h)-{'public','ignore','headers'}: raise RuntimeError('unknown local Hosting configuration')
 actual=get(ver).get('config',{})
 expected={'headers':[{'glob':x['source'],'headers':{y['key']:y['value'] for y in x['headers']}} for x in h.get('headers',[])]}
 if actual!=expected: raise RuntimeError('live Hosting configuration differs from DreamCore')
 local=files(root/'dream'/'public'); remote=set(saved['paths']); prefix='/games/michitanken/'
 old={p for p in remote if not p.startswith(prefix)}
 new={p for p in local if not p.startswith(prefix)}
 if old!=new: raise RuntimeError('non-game files differ in number or path from live Hosting')
 for i,p in enumerate(sorted(old)):
  if not equal(local[p].read_bytes(),live(p)): raise RuntimeError('a non-game file differs from live Hosting')
 # Newly published or changed geographical data requires explicit review.
 pdata={p for p in local if p.startswith(prefix+'data/')}
 rdata={p for p in remote if p.startswith(prefix+'data/')}
 if pdata!=rdata: raise RuntimeError('game data files differ from live Hosting')
 for p in pdata:
  if not equal(local[p].read_bytes(),live(p)): raise RuntimeError('game data differs from live Hosting')
 print('Live configuration, other files and published game data match.')
def boot():
 html=(root/'dom.html').read_text()
 scene=re.search(r'<div\b[^>]*id="scene"[^>]*>',html)
 if not scene or not re.search(r'data-app-ready="true"',scene.group(0)): raise RuntimeError('game did not reach ready state')
 if not re.search(r'data-npc-visible="2"',scene.group(0)): raise RuntimeError('both NPCs not visible at startup')
 print('Game loaded and two NPCs became visible.')
def unchanged():
 if version()!=json.loads((root/'live.json').read_text())['version']: raise RuntimeError('live release changed during preparation')
def online():
 page=live('/play.html')
 if b'game-frame' not in page: raise RuntimeError('live play page unexpected')
 index=live('/games/michitanken/')
 if b'/games/michitanken/assets/' not in index: raise RuntimeError('live game response unexpected')
 print('Live play and game index HTTP responses confirmed; conversation still requires user verification.')
try:
 {'snapshot':snap,'integrate':integrate,'compare':compare,'boot':boot,'unchanged':unchanged,'online':online}[sys.argv[1]]()
except Exception as e:
 print('STOP:',str(e),file=sys.stderr);sys.exit(1)
