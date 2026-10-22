/**
 * Minimal OSM API v0.6 XML reader.
 * Supports the node, way, and tag subset used by the 500m field pipeline.
 * Does not interpret multipolygon relations.
 */
export function xmlAttributes(raw){
  const attrs={};
  for(const [,key,value] of raw.matchAll(/([\w:-]+)="([^"]*)"/g))attrs[key]=value;
  return attrs;
}
function tagsIn(body){
  const tags={};
  for(const match of body.matchAll(/<tag\b([^>]*?)\/>/g)){
    const attr=xmlAttributes(match[1]);
    if(attr.k)tags[attr.k]=attr.v;
  }
  return tags;
}
export function parseOsmXml(xml){
  if(!/<osm(?:\s|>)/.test(xml))throw Error('Unexpected OSM XML response');
  const elements=[];
  // Both self-closing nodes and nodes carrying tags (e.g. railway=level_crossing).
  for(const match of xml.matchAll(/<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g)){
    const attr=xmlAttributes(match[1]),id=Number(attr.id),lat=Number(attr.lat),lon=Number(attr.lon);
    if(!Number.isFinite(id)||!Number.isFinite(lat)||!Number.isFinite(lon))continue;
    elements.push({type:'node',id,lat,lon,tags:tagsIn(match[2]||'')});
  }
  for(const match of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)){
    const attr=xmlAttributes(match[1]),id=Number(attr.id);
    if(!Number.isFinite(id))continue;
    const nodes=[];
    for(const node of match[2].matchAll(/<nd\b([^>]*?)\/>/g))nodes.push(Number(xmlAttributes(node[1]).ref));
    elements.push({type:'way',id,nodes,tags:tagsIn(match[2])});
  }
  return {elements};
}
