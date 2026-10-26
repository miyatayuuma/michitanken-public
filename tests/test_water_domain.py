import gzip, importlib.util, json, math, tempfile, unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('domain',Path(__file__).parents[1]/'scripts/build-water-domain.py')
domain=importlib.util.module_from_spec(spec);spec.loader.exec_module(domain)

class WaterDomainTest(unittest.TestCase):
    def test_source_corner_omission_bank_bound_and_unchanged_land(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);data=root/'public/data';data.mkdir(parents=True)
            tiles=[dict(id='north',offset=[0,0],url='data/north.json'),dict(id='east',offset=[500,0],url='data/east.json')]
            manifest=dict(schema=1,size=500,center=dict(lat=0,lon=0),tiles=tiles)
            (data/'tiles.json').write_text(json.dumps(manifest));original={}
            for t in tiles:
                ox=t['offset'][0];values=[3+.002*(ox-250+c*125)+.003*(-250+r*125) for r in range(5) for c in range(5)]
                # Only one tile includes the source way. Archive geometry must
                # restore its real continuation across the neighbouring tile.
                f=dict(schema=2,size=500,center=dict(lat=0,lon=ox/6378137*180/math.pi),terrain=dict(size=500,count=5,min=min(values),max=max(values),elevations=values),osm=dict(roads=[],buildings=[],waterways=[],waterAreas=[dict(id=1,footprint=[[200,-80],[250,-80],[250,80],[200,80]])] if ox==0 else []))
                p=data/(t['id']+'.json');p.write_text(json.dumps(f));original[p]=p.read_bytes()
            source=root/'source.json.gz';source.write_bytes(gzip.compress(json.dumps(dict(center=manifest['center'],features=[dict(id='way/1',tags=dict(natural='water'),points=[[200,-80],[300,-80],[300,80],[200,80],[200,-80]])])).encode()))
            out=root/'meshes';report=root/'report.json';domain.compile_domain(root,source,out,report)
            parsed=[]
            for t in tiles:
                d=json.loads((out/(t['id']+'.json')).read_text());parsed.append(d)
                self.assertTrue(d['water']['indices'])
                for name,expected_area in [('water',8000),('terrain',242000)]:
                    mesh=d[name];p=mesh['positions'];area=0
                    for i in range(0,len(mesh['indices']),3):
                        points=[p[j*3:j*3+3] for j in mesh['indices'][i:i+3]]
                        a,b,c=points;foot=abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;area+=foot
                        if name=='terrain' and foot>1e-7:
                            for x,y,z in points:self.assertAlmostEqual(y+d['datum'],3+.002*(x+t['offset'][0])+.003*z,places=5)
                    self.assertAlmostEqual(area,expected_area,places=3)
                for i in range(0,len(d['water']['positions']),3):
                    x,y,z=d['water']['positions'][i:i+3]
                    self.assertLessEqual(y+d['datum'],3+.002*(x+t['offset'][0])+.003*z-.17999)
            for p,b in original.items():self.assertEqual(p.read_bytes(),b)
            r=json.loads(report.read_text());self.assertAlmostEqual(r['waterArea'],16000);self.assertAlmostEqual(r['waterArea'],r['sourceWaterArea'])
            a={round(parsed[0]['water']['positions'][i+2],6):parsed[0]['water']['positions'][i+1]+parsed[0]['datum'] for i in range(0,len(parsed[0]['water']['positions']),3) if abs(parsed[0]['water']['positions'][i]-250)<1e-6}
            b={round(parsed[1]['water']['positions'][i+2],6):parsed[1]['water']['positions'][i+1]+parsed[1]['datum'] for i in range(0,len(parsed[1]['water']['positions']),3) if abs(parsed[1]['water']['positions'][i]+250)<1e-6}
            self.assertTrue(a);self.assertEqual(a.keys(),b.keys())
            for z in a:self.assertAlmostEqual(a[z],b[z],places=5)
            with self.assertRaisesRegex(ValueError,'overwrite source'):domain.compile_domain(root,source,data,root/'second-report.json')

if __name__=='__main__':unittest.main()
