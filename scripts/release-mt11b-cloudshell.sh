#!/usr/bin/env bash
# MT-11B pinned release; authenticated Google Cloud Shell only.
set -Eeuo pipefail
umask 077
PUB=c43302fd288c615860ef44c0653658511b5d6795
PRI=47f08a792077d9d526713f846d680918ca144b39
DREAM=581098659a51a775ab9e2e786ce1fba42a04afee
PROJECT=mygames-cb525
for c in gh git node npm python3 gcloud firebase curl tar; do command -v "$c" >/dev/null || { echo "STOP: missing $c"; exit 1; }; done
gh auth status >/dev/null
gh auth setup-git
work=$(mktemp -d "$HOME/mt11b-release-XXXXXXXX")
echo "WORK_DIR=$work"
git clone --quiet --depth 2 --branch feature/mt-11b-book-encounters https://github.com/miyatayuuma/michitanken-public.git "$work/public"
git -C "$work/public" checkout --quiet --detach "$PUB"
git clone --quiet --depth 1 --branch refactor/data-only-host-v2-20261028 https://github.com/miyatayuuma/michitanken.git "$work/private"
test "$(git -C "$work/public" rev-parse HEAD)" = "$PUB"
test "$(git -C "$work/private" rev-parse HEAD)" = "$PRI"
test -z "$(git -C "$work/public" status --porcelain)"
test -z "$(git -C "$work/private" status --porcelain)"
mkdir "$work/dream"
gh api "repos/miyatayuuma/dreamcore-games/tarball/$DREAM" | tar -xz --strip-components=1 -C "$work/dream"
test "$(node -p "require('$work/dream/mt10ab-release-lock.json').firebaseProject")" = "$PROJECT"
export MT11A_WORK="$work"
export MT11A_TOKEN="$(gcloud auth print-access-token)"
python3 "$work/public/scripts/release-mt11a-guard.py" snapshot
unset MT11A_TOKEN
cd "$work/public"
npm run integrated -- --private "$work/private" --public-sha "$PUB" --private-sha "$PRI" --out "$work/site" --build
python3 - "$work/site/dist" "$work/dream/public/games/michitanken" <<'PY'
import json,sys,shutil
from pathlib import Path
root=Path(sys.argv[1]);old=Path(sys.argv[2]);data=root/'data'
d=json.loads((data/'npcs.json').read_text())
assert d.get('schema')==1 and len(d['groups'])==5
assert sum(len(g['members']) for g in d['groups'])==10
assert {g['groupId'] for g in d['groups']}=={'king-cat','kiki-jiji','skipper','twins','zorori'}
assert (data/'site-config.json').is_file()
allow={'field.json','tiles.json','pois.json','player-sprite.json','tiles','vegetation','green-cover','exploration','exploration-map.json','sound.json','warps.json','road-supplement.json','water-profiles.json','surface-meshes','npcs.json','site-config.json'}
for p in data.iterdir():
 if p.name not in allow:
  if p.is_dir():shutil.rmtree(p)
  else:p.unlink()
if (old/'licenses').is_dir():shutil.copytree(old/'licenses',root/'licenses',dirs_exist_ok=True)
for p in root.rglob('*'):
 assert not p.is_symlink(),'symlink: '+str(p)
 assert not any(x in {'.git','node_modules','originals','scripts','tests','artifacts'} for x in p.relative_to(root).parts)
print('NPC 5 groups, 10 people; hosted-data allowlist: PASS')
PY
python3 "$work/public/scripts/release-mt11a-guard.py" integrate
export MT11A_TOKEN="$(gcloud auth print-access-token)"
python3 - <<'PY'
import os,json,urllib.request,urllib.parse,hashlib,pathlib
root=pathlib.Path(os.environ['MT11A_WORK'])
host=root/'dream'/'public';meta=json.loads((root/'live.json').read_text())
ver=meta['version'];old=set(meta['paths'])
headers={'Authorization':'Bearer '+os.environ['MT11A_TOKEN'],'Accept-Encoding':'identity'}
def load(url,auth=False):
 h=headers if auth else {'Accept-Encoding':'identity','Cache-Control':'no-cache'}
 with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=60) as r:return r.read()
api='https://firebasehosting.googleapis.com/v1beta1/'
channel=json.loads(load(api+'sites/mygames-cb525/channels/live',True))
assert channel['release']['version']['name']==ver,'Live Hosting changed'
local_conf=json.loads((root/'dream/firebase.json').read_text())['hosting']
assert local_conf.get('public')=='public' and set(local_conf)<={'public','ignore','headers'}
want={'headers':[{'glob':x['source'],'headers':{k['key']:k['value'] for k in x['headers']}} for x in local_conf.get('headers',[])]}
assert json.loads(load(api+ver,True)).get('config',{})==want,'Hosting config differs'
files={}
for p in host.rglob('*'):
 if p.is_symlink():raise RuntimeError('symlink in Hosting')
 if p.is_file() and not any(x.startswith('.') or x=='node_modules' for x in p.relative_to(host).parts):files['/'+p.relative_to(host).as_posix()]=p
prefix='/games/michitanken/'
old_other={p for p in old if not p.startswith(prefix)}
new_other={p for p in files if not p.startswith(prefix)}
assert old_other==new_other,'Other game/hub/PWA paths differ'
def live(p):
 return load('https://mygames-cb525.web.app'+urllib.parse.quote(p,safe='/')+'?mt11b=1')
def same(p):return hashlib.sha256(live(p)).digest()==hashlib.sha256(files[p].read_bytes()).digest()
for p in sorted(old_other):
 if not same(p):raise RuntimeError('Other game/hub/PWA modified: '+p)
old_data={p for p in old if p.startswith(prefix+'data/')}
new_data={p for p in files if p.startswith(prefix+'data/')}
assert old_data<=new_data,'Previously hosted game data missing'
assert new_data-old_data<={prefix+'data/npcs.json',prefix+'data/site-config.json'},'Unexpected new game data'
for p in sorted(old_data):
 if not same(p):raise RuntimeError('Existing game geographic/runtime data differs: '+p)
print('Other 7 games, hub, PWA, Hosting config, prior game data: PASS')
PY
python3 "$work/public/scripts/release-mt11a-guard.py" unchanged
unset MT11A_TOKEN
browser=''
for c in chromium chromium-browser google-chrome google-chrome-stable; do if command -v "$c" >/dev/null;then browser="$(command -v "$c")";break;fi;done
test -n "$browser" || { echo 'STOP: Chromium unavailable';exit 1; }
python3 -m http.server 18765 --bind 127.0.0.1 --directory "$work/dream/public" >"$work/server.log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
curl -fsS --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:18765/games/michitanken/ >/dev/null
"$browser" --headless --no-sandbox --disable-dev-shm-usage --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=60000 --dump-dom http://127.0.0.1:18765/games/michitanken/ >"$work/dom.html" 2>"$work/browser.log"
python3 - "$work/dom.html" <<'PY'
import sys,re,pathlib
html=pathlib.Path(sys.argv[1]).read_text()
m=re.search(r'<div\b[^>]*id="scene"[^>]*>',html)
assert m and 'data-app-ready="true"' in m.group(0),'Game did not reach ready'
assert 'data-npc-error="true"' not in m.group(0),'NPC startup failure'
print('Packaged game boot and NPC startup: PASS')
PY
export MT11A_TOKEN="$(gcloud auth print-access-token)"
python3 "$work/public/scripts/release-mt11a-guard.py" unchanged
unset MT11A_TOKEN
backup="pre-mt11b-$(date -u +%Y%m%d%H%M%S)-$$"
cd "$work/dream"
firebase hosting:clone "$PROJECT:live" "$PROJECT:$backup" --project "$PROJECT"
printf 'firebase hosting:clone %s:%s %s:live --project %s\n' "$PROJECT" "$backup" "$PROJECT" "$PROJECT" > "$work/ROLLBACK.txt"
echo "ROLLBACK_FILE=$work/ROLLBACK.txt"
echo "DEPLOY_DIR=$work/dream"
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 firebase deploy --only hosting --project "$PROJECT"
export MT11A_TOKEN="$(gcloud auth print-access-token)"
python3 "$work/public/scripts/release-mt11a-guard.py" online
unset MT11A_TOKEN
curl -fsS https://mygames-cb525.web.app/games/michitanken/data/npcs.json | python3 -c 'import json,sys;d=json.load(sys.stdin);assert len(d["groups"])==5 and sum(len(g["members"]) for g in d["groups"])==10;print("Published NPC data: PASS")'
echo MT11B_RELEASE=DEPLOY_COMPLETE
echo "WORK_DIR=$work"
echo URL=https://mygames-cb525.web.app/play.html?game=michitanken
