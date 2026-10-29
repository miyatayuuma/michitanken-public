"""Independent stdlib geometry audit: no imports from the JS implementation.
Usage: python audit-spawn-safety.py ROOT AUDIT.json OUTPUT.json
"""
import sys,json,math,hashlib,pathlib,collections
root=pathlib.Path(sys.argv[1]);data=json.load(open(sys.argv[2]));manifest=json.load(open(root/'public/data/tiles.json'));buckets=collections.defaultdict(list);fields={};source_hashes={}
def read(p):
 b=(root/'public'/p).read_bytes();source_hashes[p]=hashlib.sha256(b).hexdigest();return json.loads(b)
def index(kind,pts,margin=0):
 xs,zs=zip(*pts)
 item=(kind,pts,margin)
 for ix in range(math.floor((min(xs)-margin)/40),math.floor((max(xs)+margin)/40)+1):
  for iz in range(math.floor((min(zs)-margin)/40),math.floor((max(zs)+margin)/40)+1):buckets[ix,iz].append(item)
for t in manifest['tiles']:
 f=read(t['url']);fields[t['id']]=f;ox,oz=t['offset'];shift=lambda pts:[[x+ox,z+oz] for x,z in pts]
 for key,kind in [('buildings','building'),('waterAreas','water')]:
  for a in f['osm'].get(key,[]):index(kind,shift(a['footprint']),1.5 if kind=='building' else 2.5)
 for key,kind,default,extra in [('roads','road',4,2.5),('railways','rail',8,3.5),('waterways','river',3,2.5)]:
  for a in f['osm'].get(key,[]):
   if kind=='river' and (a.get('tunnel') or a.get('layer',0)<0):continue
   index(kind,shift(a['points']),a.get('width',default)/2+extra)
def distance(x,z,a,b):
 ux,uz=b[0]-a[0],b[1]-a[1];den=ux*ux+uz*uz;t=max(0,min(1,((x-a[0])*ux+(z-a[1])*uz)/den)) if den else 0
 return math.hypot(x-a[0]-t*ux,z-a[1]-t*uz)
def inside(x,z,p):
 winding=0
 for a,b in zip(p,p[1:]+p[:1]):
  cross=(b[0]-a[0])*(z-a[1])-(x-a[0])*(b[1]-a[1])
  if a[1]<=z<b[1] and cross>0:winding+=1
  if b[1]<=z<a[1] and cross<0:winding-=1
 return winding!=0
errors=[];seen=set();associations=0
for c in data['candidates']:
 x,y,z=c['position'];t=next(t for t in manifest['tiles'] if t['id']==c['tileId']);ox,oz=t['offset'];g=fields[t['id']]['terrain'];n=g['count'];size=g['size'];ux=(x-ox+size/2)/size*(n-1);uz=(z-oz+size/2)/size*(n-1);col,row=math.floor(ux),math.floor(uz);fx,fz=ux-col,uz-row
 if not (0<=ux<n-1 and 0<=uz<n-1):errors.append([c['id'],'bounds']);continue
 a,b,cc,d=(g['elevations'][row*n+col],g['elevations'][row*n+col+1],g['elevations'][(row+1)*n+col],g['elevations'][(row+1)*n+col+1]);height=a+(b-a)*fx+(cc-a)*fz if fx+fz<=1 else d+(cc-d)*(1-fx)+(b-d)*(1-fz)
 if abs(y-height)>1e-8:errors.append([c['id'],'height'])
 if g['validRatio']!=1 or c['terrain']['slope']>data['policy']['maxSlope']:errors.append([c['id'],'terrain'])
 if c['id'] in seen:errors.append([c['id'],'duplicate'])
 seen.add(c['id']);associations+=bool(c['relatedPoiIds'])
 for kind,pts,margin in buckets[math.floor(x/40),math.floor(z/40)]:
  ring=kind in ['building','water'];edges=list(zip(pts,pts[1:]+pts[:1] if ring else pts[1:]));near=min(distance(x,z,a,b) for a,b in edges)
  if (ring and inside(x,z,pts)) or near<margin:errors.append([c['id'],kind]);break
 if c['terrain']['surface']!='dry-ground' or any(k in c['allowedObjectTypes'] for k in ['duck','fish']):errors.append([c['id'],'surface'])
summary={'status':'PASS' if not errors else 'FAIL','candidates':len(seen),'tiles':len(manifest['tiles']),'independentGeometry':'Python stdlib winding number and segment distances; original field footprints/widths','poiAssociated':associations,'sourceSHA256':source_hashes,'errors':errors}
pathlib.Path(sys.argv[3]).write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items() if k not in ['sourceSHA256','errors']}));assert not errors,errors[:10]
