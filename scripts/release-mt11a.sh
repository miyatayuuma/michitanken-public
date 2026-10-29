#!/usr/bin/env bash
# MT-11A-R2: production release. Stops before deployment on any failed guard.
set -Eeuo pipefail
umask 077
EXPECTED_HEAD="${1:?Expected PUBLIC PR HEAD is required}"
EXPECTED_PRIVATE_HEAD="${2:?Expected PRIVATE commit SHA is required}"
EXPECTED_DREAM_HEAD="${3:?Expected DreamCore commit SHA is required}"
DEPLOY_FLAG="${4:-}"
for value in "$EXPECTED_HEAD" "$EXPECTED_PRIVATE_HEAD" "$EXPECTED_DREAM_HEAD"; do
 [[ "$value" =~ ^[0-9a-f]{40}$ ]] || { echo 'ERROR: all three inputs must be full lowercase commit SHAs'; exit 1; }
done
[ -z "$DEPLOY_FLAG" ] || [ "$DEPLOY_FLAG" = "--deploy" ] || { echo 'ERROR: fourth argument must be --deploy'; exit 1; }
project=mygames-cb525
for cmd in gh git node npm python3 firebase gcloud curl tar; do
 command -v "$cmd" >/dev/null || { echo "Missing command: $cmd"; exit 1; }
done
tmpbase="${TMPDIR:-/tmp}"
avail=$(df -Pk "$tmpbase" | awk 'NR==2 {print $4}')
[ "$avail" -ge 1048576 ] || { echo 'ERROR: need at least 1 GiB free in TMPDIR.'; exit 1; }
work=$(mktemp -d "$tmpbase/mt11a-r2.XXXXXXXX")
echo "Release workspace: $work"
printf 'PUBLIC=%s\nPRIVATE=%s\nDREAM=%s\n' "$EXPECTED_HEAD" "$EXPECTED_PRIVATE_HEAD" "$EXPECTED_DREAM_HEAD" > "$work/source-refs.txt"
mkdir "$work/public" "$work/private" "$work/dream"
prhead=$(gh pr view 26 --repo miyatayuuma/michitanken-public --json headRefOid --jq .headRefOid)
[ "$prhead" = "$EXPECTED_HEAD" ] || { echo "ERROR: PR head changed: $prhead"; exit 1; }
# Stream archives rather than cloning histories or changing existing checkouts.
gh api "repos/miyatayuuma/michitanken-public/tarball/$EXPECTED_HEAD" | tar -xz --strip-components=1 -C "$work/public"
gh api "repos/miyatayuuma/michitanken/tarball/$EXPECTED_PRIVATE_HEAD" | tar -xz --strip-components=1 -C "$work/private"
gh api "repos/miyatayuuma/dreamcore-games/tarball/$EXPECTED_DREAM_HEAD" | tar -xz --strip-components=1 -C "$work/dream"
# The fetched PUBLIC commit is the game source; preserve this preflight/resume tool revision separately.
tool_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$tool_dir/resume-mt11a-release.sh" "$work/public/scripts/resume-mt11a-release.sh"
export MT11A_WORK="$work"
export MT11A_TOKEN="$(gcloud auth print-access-token)"
python3 "$work/public/scripts/release-mt11a-guard.py" snapshot
cat "$work/restore.txt"
unset MT11A_TOKEN
node "$work/public/scripts/assemble-production.mjs" --private "$work/private" --public "$work/public" --out "$work/site"
node "$work/public/scripts/verify-production-overlay.mjs" --private "$work/private" --public "$work/public" --site "$work/site"
cd "$work/site"
npm install --no-audit --no-fund
npm run build -- --base=/games/michitanken/
python3 "$work/public/scripts/release-mt11a-guard.py" integrate
export MT11A_TOKEN="$(gcloud auth print-access-token)"
python3 "$work/public/scripts/release-mt11a-guard.py" compare
unset MT11A_TOKEN
browser=''
for candidate in chromium chromium-browser google-chrome google-chrome-stable; do
 if command -v "$candidate" >/dev/null; then browser=$(command -v "$candidate"); break; fi
done
[ -n "$browser" ] || { echo 'ERROR: Chromium is required for the game startup check; no deployment occurred.'; exit 1; }
cd "$work/dream"
python3 -m http.server 18765 --bind 127.0.0.1 --directory public >"$work/http.log" 2>&1 &
server=$!
trap 'kill "$server" 2>/dev/null || true' EXIT
"$browser" --headless --no-sandbox --disable-dev-shm-usage --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=60000 --dump-dom http://127.0.0.1:18765/games/michitanken/ >"$work/dom.html" 2>"$work/browser.log"
python3 "$work/public/scripts/release-mt11a-guard.py" boot
export MT11A_TOKEN="$(gcloud auth print-access-token)"
python3 "$work/public/scripts/release-mt11a-guard.py" unchanged
unset MT11A_TOKEN
if [ "$DEPLOY_FLAG" != "--deploy" ]; then
 echo 'Release preflight complete; Firebase was NOT deployed.'
 echo "To continue from this verified workspace: bash $work/public/scripts/resume-mt11a-release.sh $work $EXPECTED_HEAD --deploy"
 exit 0
fi
echo 'Starting Firebase Hosting deployment.'
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 firebase deploy --only hosting --project "$project"
echo 'Firebase deploy completed; checking live HTTP responses.'
python3 "$work/public/scripts/release-mt11a-guard.py" online
echo "Deployment completed. Restore details: $work/restore.txt"
cat "$work/restore.txt"
echo 'URL: https://mygames-cb525.web.app/play.html?game=michitanken'
