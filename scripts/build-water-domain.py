"""Compile source water masks, bank-bounded water and clipped DEM meshes.

Build dependency: shapely==2.1.2. No dependency is shipped to the browser.
Real inputs and every output remain PRIVATE. Original snapshots are read only.
"""
import argparse, gzip, hashlib, json, math, heapq
from pathlib import Path
import shapely
from shapely.geometry import Polygon, LineString, box
from shapely.ops import unary_union
from shapely.prepared import prep

FREEBOARD = .18
BANK_OVERLAP = .4  # bank face continues below opaque water, never above land
EPS = 1e-7

def refine_water(tris, attributes, max_edge=24):
    """Conforming refinement; midpoint Y stays on the original shared face.

    Interior shore/flow attributes are sampled independently of height. This
    keeps foam on the real shore, without introducing height T-junctions.
    """
    vertices=[];lookup={};faces={};edges={};queue=[];serial=0
    def vertex(p):
        key=(round(p[0],9),round(p[2],9))
        if key not in lookup:lookup[key]=len(vertices);vertices.append(p)
        return lookup[key]
    def add(ids):
        nonlocal serial
        serial+=1;faces[serial]=ids
        for a,b in zip(ids,ids[1:]+ids[:1]):
            edge=tuple(sorted((a,b)));edges.setdefault(edge,set()).add(serial);p=vertices[a];q=vertices[b];length=(p[0]-q[0])**2+(p[2]-q[2])**2
            if length>max_edge**2:heapq.heappush(queue,(-length,edge))
    def remove(id):
        ids=faces.pop(id)
        for a,b in zip(ids,ids[1:]+ids[:1]):
            edge=tuple(sorted((a,b)));edges[edge].remove(id)
            if not edges[edge]:del edges[edge]
    for tri in tris:add([vertex(p) for p in tri])
    while queue:
        _,edge=heapq.heappop(queue)
        if edge not in edges:continue
        a,b=edge;p=vertices[a];q=vertices[b];point=[(p[k]+q[k])/2 for k in range(3)];mid=vertex(point+attributes((point[0],point[2])))
        for id in list(edges[edge]):
            ids=faces[id];c=next(i for i in ids if i not in edge);remove(id);add([a,mid,c]);add([mid,b,c])
    return [[vertices[i] for i in ids] for ids in faces.values()]

def polygons(g):
    if g.is_empty: return []
    if g.geom_type == 'Polygon': return [g]
    if hasattr(g, 'geoms'): return [p for c in g.geoms for p in polygons(c)]
    return []

def triangles(g):
    return [list(t.exterior.coords)[:3] for p in polygons(g)
            for t in shapely.constrained_delaunay_triangles(p).geoms if t.area > 1e-10]

def signed_area(a,b,c): return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])

class Mesh:
    def __init__(self, datum, offset, water=False):
        self.datum,self.offset,self.water=datum,offset,water
        self.positions=[];self.index=[];self.lookup={};self.flow=[];self.station=[];self.lateral=[];self.shore=[]
    def vertex(self,p):
        x,y,z,*attrs=p
        key=tuple(round(v,6) for v in p)  # preserve separate attribute seams
        if key not in self.lookup:
            self.lookup[key]=len(self.positions)//3
            self.positions.extend([round(x-self.offset[0],6),round(y-self.datum,6),round(z-self.offset[1],6)])
            if self.water:
                self.flow.extend(attrs[:2]);self.station.append(attrs[2]);self.lateral.append(attrs[3]);self.shore.append(attrs[4])
        return self.lookup[key]
    def triangle(self,points):
        a,b,c=points
        if abs(signed_area((a[0],a[2]),(b[0],b[2]),(c[0],c[2])))<1e-10 and max(abs(a[1]-b[1]),abs(c[1]-b[1]))<1e-9:return
        if signed_area((a[0],a[2]),(b[0],b[2]),(c[0],c[2]))>0:points=[a,c,b]
        self.index.extend(self.vertex(p) for p in points)
    def data(self):
        result={'positions':self.positions,'indices':self.index}
        if self.water:result.update(flow=self.flow,station=self.station,lateral=self.lateral,shore=self.shore)
        return result

def mesh_height(f,x,z):
    t=f['terrain'];n=t['count'];size=t['size'];h=size/2
    ux=max(0,min(n-1,(x/size+.5)*(n-1)));uz=max(0,min(n-1,(z/size+.5)*(n-1)))
    ix=min(n-2,math.floor(ux));iz=min(n-2,math.floor(uz));fx=ux-ix;fz=uz-iz;e=t['elevations']
    a,b,c,d=[e[j] for j in (iz*n+ix,iz*n+ix+1,(iz+1)*n+ix,(iz+1)*n+ix+1)]
    return a+(b-a)*fx+(c-a)*fz if fx+fz<=1 else d+(c-d)*(1-fx)+(b-d)*(1-fz)

def split_ring(coords, grids):
    out=[]
    for a,b in zip(coords,coords[1:]):
        ts={0.,1.}
        # Include every DEM plane break, plus short shore samples for flow attributes.
        for axis in (0,1,2):
            av=a[axis] if axis<2 else sum(a);bv=b[axis] if axis<2 else sum(b)
            if abs(av-bv)<EPS:continue
            for value in grids[axis]:
                u=(value-av)/(bv-av)
                if EPS<u<1-EPS:ts.add(u)
        length=math.dist(a,b)
        for i in range(1,max(1,math.ceil(length/2.5))):ts.add(i/math.ceil(length/2.5))
        for u in sorted(ts)[:-1]:
            p=(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u)
            if not out or math.dist(out[-1],p)>1e-6:out.append(p)
    return out

def clip_payload_triangle(vertices,rect):
    points=vertices
    for axis,edge,sign in [(0,rect[0],1),(0,rect[2],-1),(2,rect[1],1),(2,rect[3],-1)]:
        result=[]
        for a,b in zip(points,points[1:]+points[:1]):
            da=(a[axis]-edge)*sign;db=(b[axis]-edge)*sign
            if da>=-EPS:result.append(a)
            if (da>=-EPS)!=(db>=-EPS):
                u=da/(da-db);p=[x+(y-x)*u for x,y in zip(a,b)];p[axis]=edge;result.append(p)
        points=result
        if len(points)<3:return []
    return [[points[0],points[i],points[i+1]] for i in range(1,len(points)-1)]

def compile_domain(root, source_path, out, report_path):
    m=json.loads((root/'public/data/tiles.json').read_text());size=m['size'];half=size/2;snapshots=[];hashes={}
    inputs={(root/'public'/t['url']).resolve() for t in m['tiles']}|{(root/'public/data/tiles.json').resolve()}
    if source_path:inputs.add(source_path.resolve())
    if m.get('waterProfiles'):inputs.add((root/'public'/m['waterProfiles']).resolve())
    if report_path.resolve() in inputs or any((out/(t['id']+'.json')).resolve() in inputs for t in m['tiles']):raise ValueError('Output would overwrite source authority')
    for tile in m['tiles']:
        raw=(root/'public'/tile['url']).read_bytes();f=json.loads(raw);snapshots.append((tile,f));hashes[tile['id']]=hashlib.sha256(raw).hexdigest()
    bounds=(min(t['offset'][0]-half for t,f in snapshots),min(t['offset'][1]-half for t,f in snapshots),max(t['offset'][0]+half for t,f in snapshots),max(t['offset'][1]+half for t,f in snapshots));extent=box(*bounds)
    def ground(x,z):
        for t,f in snapshots:
            if abs(x-t['offset'][0])<=half+EPS and abs(z-t['offset'][1])<=half+EPS:return mesh_height(f,x-t['offset'][0],z-t['offset'][1])
        raise ValueError('Shore outside declared terrain')
    def canonical(p,t,f):
        return (t['offset'][0]+p[0]*math.cos(math.radians(m['center']['lat']))/math.cos(math.radians(f['center']['lat'])),t['offset'][1]+p[1])
    archived={};source_sha=None
    if source_path:
        raw=source_path.read_bytes();source_sha=hashlib.sha256(raw).hexdigest();s=json.loads(gzip.decompress(raw) if source_path.suffix=='.gz' else raw)
        if s['center']!=m['center']:raise ValueError('Source projection differs from declared origin')
        archived={int(f['id'].split('/')[1]):f for f in s['features'] if f['id'].startswith('way/') and len(f.get('points',[]))>=2}
    areas={};ways={}
    for t,f in snapshots:
        for a in f['osm']['waterAreas']:areas.setdefault(a['id'],[]).append(Polygon([canonical(p,t,f) for p in a['footprint']]))
        for w in f['osm']['waterways']:
            if w['tunnel'] or w['layer']<0:continue
            ways.setdefault(w['id'],{'meta':w,'lines':[]})['lines'].append(LineString([canonical(p,t,f) for p in w['points']]))
    source_areas=[]
    for id,parts in areas.items():
        feature=archived.get(id);g=Polygon(feature['points']) if feature and feature.get('tags',{}).get('natural')=='water' else unary_union(parts)
        source_areas.extend(polygons(shapely.make_valid(g).intersection(extent)))
    mapped=unary_union(source_areas);reaches=[]
    for id,w in ways.items():
        feature=archived.get(id);line=LineString(feature['points']) if feature and feature.get('tags',{}).get('waterway') else unary_union(w['lines'])
        # Use mapped bank polygons where available. Never draw an entire wide
        # centreline over a narrower authoritative water polygon.
        reach=line.intersection(extent).difference(mapped)
        reaches.extend(polygons(reach.buffer(max(.5,w['meta'].get('width',2.5))/2,cap_style=2,join_style=2).intersection(extent)))
    domain=shapely.make_valid(unary_union(source_areas+reaches));components=polygons(domain)
    grids=[set(),set(),set()]
    for t,f in snapshots:
        cell=size/(f['terrain']['count']-1);x0=t['offset'][0]-half;z0=t['offset'][1]-half;n=f['terrain']['count']
        grids[0].update(x0+i*cell for i in range(n));grids[1].update(z0+i*cell for i in range(n));grids[2].update(x0+z0+i*cell for i in range(1,2*n-2))
    grids=[sorted(v) for v in grids]
    profile_raw=(root/'public'/m['waterProfiles']).read_bytes() if m.get('waterProfiles') else None
    profiles=json.loads(profile_raw)['profiles'] if profile_raw else []
    path_segments=[]
    for p in profiles:
        for i,(a,b) in enumerate(zip(p['nodes'],p['nodes'][1:])):
            length=math.dist(a,b)
            if length>EPS:path_segments.append((a,b,length,p,p['lengths'][i]))
    def outer_edge(a,b):return any(abs(a[k]-edge)<1e-6 and abs(b[k]-edge)<1e-6 for k,edge in [(0,bounds[0]),(0,bounds[2]),(1,bounds[1]),(1,bounds[3])])
    all_water=[];all_banks=[];models=[];normalized=[]
    for number,component in enumerate(components):
        shell=split_ring(list(component.exterior.coords),grids);holes=[split_ring(list(r.coords),grids) for r in component.interiors];poly=Polygon(shell,holes);normalized.append(poly)
        shore_edges=[(a,b) for ring in [shell]+holes for a,b in zip(ring,ring[1:]+ring[:1]) if not outer_edge(a,b)]
        shore=unary_union([LineString([a,b]) for a,b in shore_edges]);shore_points={p for edge in shore_edges for p in edge}
        relevant=[s for s in path_segments if component.intersects(LineString([s[0],s[1]]))]
        fallback=min(ground(*p) for p in shore_points) if shore_points else min(ground(*p) for p in shell)
        def value(point):
            best=None
            for a,b,length,p,s0 in relevant:
                dx=b[0]-a[0];dz=b[1]-a[1];u=max(0,min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dz)/(length*length)));qx=a[0]+u*dx;qz=a[1]+u*dz;d=(point[0]-qx)**2+(point[1]-qz)**2
                if best is None or d<best[0]:best=(d,p,s0+u*length,dx/length,dz/length,(point[0]-qx)*(-dz/length)+(point[1]-qz)*dx/length)
            if best:
                d,p,s,dx,dz,lateral=best;direction=-1 if p['reverseFlow'] else 1
                return [p['start']+p['slope']*max(0,min(p['length'],s))+.18,dx*direction,dz*direction,s,lateral]
            return [fallback+.18,0,1,point[1],point[0]]
        values={p:value(p) for ring in [shell]+holes for p in ring}
        shift=min([0]+[ground(*p)-FREEBOARD-values[p][0] for p in shore_points])
        def payload(p):
            v=values.setdefault(p,value(p));return [p[0],v[0]+shift,p[1],*v[1:],shore.distance(shapely.Point(p))]
        source_triangles=[[payload(tuple(p)) for p in tri] for tri in triangles(poly)]
        used={(round(p[0],6),round(p[2],6)) for tri in source_triangles for p in tri}
        if any((round(p[0],6),round(p[1],6)) not in used for p in shore_points):raise ValueError('Triangulator dropped a bank constraint vertex')
        all_water.extend(refine_water(source_triangles,lambda p:[*value(p)[1:],shore.distance(shapely.Point(p))]))
        for a,b in shore_edges:
            ya=values[a][0]+shift;yb=values[b][0]+shift;ga=ground(*a);gb=ground(*b)
            pa=[a[0],ga,a[1]];pb=[b[0],gb,b[1]];qa=[a[0],ya-BANK_OVERLAP,a[1]];qb=[b[0],yb-BANK_OVERLAP,b[1]]
            all_banks.extend([[pa,pb,qa],[pb,qb,qa]])
        models.append({'component':number,'area':poly.area,'fitShift':shift,'shoreSamples':len(shore_points),'profileIds':sorted({s[3]['id'] for s in relevant}),'maximumWaterAboveBank':max((values[p][0]+shift-ground(*p) for p in shore_points),default=None)})
    domain=unary_union(normalized);prepared=prep(domain);out.mkdir(parents=True,exist_ok=True);tile_reports=[]
    for t,f in snapshots:
        ox,oz=t['offset'];rect=(ox-half,oz-half,ox+half,oz+half);mask=domain.intersection(box(*rect));ground_mesh=Mesh(f['terrain']['min'],t['offset']);water_mesh=Mesh(f['terrain']['min'],t['offset'],True)
        if not mask.is_empty:
            n=f['terrain']['count'];cell=size/(n-1);e=f['terrain']['elevations']
            for row in range(n-1):
                for col in range(n-1):
                    a=(ox-half+col*cell,oz-half+row*cell);b=(a[0]+cell,a[1]);c=(a[0],a[1]+cell);d=(b[0],c[1])
                    for xy in [[a,c,b],[b,c,d]]:
                        tri=Polygon(xy)
                        if not prepared.intersects(tri):pieces=[xy]
                        elif prepared.covers(tri):continue
                        else:pieces=triangles(tri.difference(domain))
                        for piece in pieces:ground_mesh.triangle([[x,mesh_height(f,x-ox,z-oz),z] for x,z in piece])
            for tri in all_water:
                if max(p[0] for p in tri)<rect[0] or min(p[0] for p in tri)>rect[2] or max(p[2] for p in tri)<rect[1] or min(p[2] for p in tri)>rect[3]:continue
                for piece in clip_payload_triangle(tri,rect):water_mesh.triangle(piece)
            for tri in all_banks:
                if max(p[0] for p in tri)<rect[0] or min(p[0] for p in tri)>rect[2] or max(p[2] for p in tri)<rect[1] or min(p[2] for p in tri)>rect[3]:continue
                for piece in clip_payload_triangle(tri,rect):ground_mesh.triangle(piece)
        coverage=[{'outer':[[x-ox,z-oz] for x,z in list(p.exterior.coords)[:-1]],'holes':[[[x-ox,z-oz] for x,z in list(r.coords)[:-1]] for r in p.interiors]} for p in polygons(mask)]
        data={'schema':1,'tileId':t['id'],'size':size,'datum':f['terrain']['min'],'sourceSHA256':hashes[t['id']],'terrain':ground_mesh.data() if not mask.is_empty else None,'water':water_mesh.data(),'coverage':coverage}
        raw=json.dumps(data,separators=(',',':'),allow_nan=False).encode();(out/(t['id']+'.json')).write_bytes(raw)
        tile_reports.append({'tile':t['id'],'landBankTriangles':len(ground_mesh.index)//3,'waterTriangles':len(water_mesh.index)//3,'waterArea':mask.area,'bytes':len(raw)})
        print(t['id'],tile_reports[-1],flush=True)
    report={'schema':1,'model':'whole-domain canonical triangulation; original DEM outside source water; minimally shifted source fit bounded by every real bank DEM face break; inferred bank faces below opaque water','freeboard':FREEBOARD,'maximumWaterEdge':24,'sourceArchiveSHA256':source_sha,'profileSHA256':hashlib.sha256(profile_raw).hexdigest() if profile_raw else None,'sourceSnapshots':hashes,'components':models,'tiles':tile_reports,'waterArea':domain.area,'sourceWaterArea':unary_union(source_areas+reaches).area}
    report_path.write_text(json.dumps(report,indent=2,allow_nan=False))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('root',type=Path);p.add_argument('out',type=Path);p.add_argument('report',type=Path);p.add_argument('--source',type=Path);a=p.parse_args();compile_domain(a.root,a.source,a.out,a.report)
