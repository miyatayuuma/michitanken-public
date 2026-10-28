#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
work=/tmp/mt11a-r2.g0OZpyXm
expected="${1:?PR head required}"
repo=miyatayuuma/michitanken-public
test -f "$work/live.json" && test -f "$work/restore.txt" && test -d "$work/dream/public/games/michitanken" || { echo 'ERROR: previous build workspace unavailable'; exit 1; }
actual=$(gh pr view 26 --repo "$repo" --json headRefOid --jq .headRefOid)
test "$actual" = "$expected" || { echo "ERROR: PR HEAD changed: $actual"; exit 1; }
export MT11A_WORK="$work"
export MT11A_TOKEN="$(gcloud auth print-access-token)"
python3 "$work/public/scripts/release-mt11a-guard.py" unchanged
cat "$work/restore.txt"
original="$work/dream/public-before-live-copy"
if [ ! -e "$original" ]; then
 staged="$(mktemp -d "$work/live-public.XXXXXXXX")"
 export MT11A_STAGE="$staged"
 python3 <<'PY'
import json, os
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request,urlopen
work=Path(os.environ['MT11A_WORK']);stage=Path(os.environ['MT11A_STAGE'])
paths=json.loads((work/'live.json').read_text())['paths']
paths=[p for p in paths if not p.startswith('/games/michitanken/')]
for p in paths:
 if not isinstance(p,str) or not p.startswith('/'): raise RuntimeError('invalid path')
 parts=p[1:].split('/')
 if any(not x or x in ('.','..') or '\\' in x or x.startswith('.') or x=='node_modules' for x in parts): raise RuntimeError('unsafe path')
 out=stage.joinpath(*parts);out.parent.mkdir(parents=True,exist_ok=True)
 req=Request('https://mygames-cb525.web.app'+quote(p,safe='/')+'?mt11a=1',headers={'Accept-Encoding':'identity','Cache-Control':'no-cache'})
 with urlopen(req,timeout=60) as response,out.open('xb') as dest:
  if response.status!=200: raise RuntimeError('live file unavailable')
  while block:=response.read(1024*1024): dest.write(block)
print('Live non-game files retrieved:',len(paths))
PY
 mkdir -p "$staged/games"
 cp -a "$work/dream/public/games/michitanken" "$staged/games/michitanken"
 python3 "$work/public/scripts/release-mt11a-guard.py" unchanged
 mv "$work/dream/public" "$original"
 mv "$staged" "$work/dream/public"
fi
python3 "$work/public/scripts/release-mt11a-guard.py" compare
unset MT11A_TOKEN
browser=''
for candidate in chromium chromium-browser google-chrome google-chrome-stable; do
 if command -v "$candidate" >/dev/null; then browser=$(command -v "$candidate"); break; fi
done
test -n "$browser" || { echo 'ERROR: Chromium unavailable; not deployed.'; exit 1; }
cd "$work/dream"
python3 -m http.server 18765 --bind 127.0.0.1 --directory public >"$work/http.log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
curl --silent --show-error --fail --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:18765/games/michitanken/ >/dev/null
"$browser" --headless --no-sandbox --disable-dev-shm-usage --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=60000 --dump-dom http://127.0.0.1:18765/games/michitanken/ >"$work/dom.html" 2>"$work/browser.log"
python3 "$work/public/scripts/release-mt11a-guard.py" boot
export MT11A_TOKEN="$(gcloud auth print-access-token)"
python3 "$work/public/scripts/release-mt11a-guard.py" unchanged
unset MT11A_TOKEN
echo 'Starting Firebase Hosting deployment.'
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 firebase deploy --only hosting --project mygames-cb525
echo 'Deploy complete; checking live HTTP responses.'
python3 "$work/public/scripts/release-mt11a-guard.py" online
cat "$work/restore.txt"
echo 'URL: https://mygames-cb525.web.app/play.html?game=michitanken'
