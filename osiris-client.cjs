'use strict';

const { isIP } = require('node:net');
const ORIGIN = 'https://osirisai.live';
const MAX_BYTES = 4 * 1024 * 1024;
const REGIONS = ['uk','us-west','us-east','us-central','canada','europe','netherlands','asia','bulgaria','greece','serbia','macedonia','turkey','romania','australia','italy','czechia','slovakia','germany','france','spain','poland','japan','switzerland','finland','sweden','hongkong','utah','iceland','taiwan','thailand','asia-live','newzealand','lithuania','edmonton','oregon','michigan','indiana','nevada','louisiana','florida','georgia','northcarolina','arizona','texas','latam-live','africa-live','europe-live','public-webcams-nl','public-webcams-europe','public-webcams-americas','public-webcams-rest'];
const FEEDS = [
  ['health','API-Status'], ['stats','Globale Zähler'], ['flights','Flugzeuge'], ['satellites','Satelliten'], ['space-weather','Weltraumwetter'],
  ['earthquakes','Erdbeben'], ['fires','Brände'], ['weather','Naturereignisse'], ['air-quality','Luftqualität'], ['radar','GPS-Störungen'], ['sentinel','Satellitenbilder'],
  ['conflicts','Konfliktberichte'], ['frontlines','Ukraine-Kartenstand'], ['gdelt','Weltberichte'], ['country-risk','Länderindikatoren'], ['region-dossier','Regionsdossier'],
  ['news','Nachrichten'], ['live-news','Nachrichtensender'], ['markets','Märkte'], ['crypto','Kryptopreise'], ['scm-suppliers','Lieferketten'],
  ['cctv','Öffentliche Webcams'], ['infrastructure','Infrastruktur'], ['maritime','Schiffe und Häfen'], ['arcgis','ArcGIS-Daten'],
  ['cyber-threats','Schwachstellen'], ['cyber-attacks','Botnet-Blockliste'], ['malware','Malware-Indikatoren'], ['oi/trending','Öffentliche Prognosemärkte'],
];
const PATHS = new Set(FEEDS.map(([id]) => '/api/' + id));
const KINDS = { earthquakes:'earthquakes', cameras:'cctv', ukraine:'frontlines', news:'news', weather:'weather', flights:'flights', ships:'maritime', stats:'stats' };
const TITLES = { earthquakes:'Erdbeben', cameras:'Öffentliche Webcams', ukraine:'Ukraine · Quellenlage', news:'Nachrichten', weather:'Naturereignisse', flights:'Flugzeuge', ships:'Schiffe und Häfen', stats:'Globale Zähler' };
const text = (value, max = 800) => String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, max);
const numeric = value => typeof value === 'number' && Number.isFinite(value);
const iso = value => { const n = typeof value === 'number' ? value : Date.parse(value),date=new Date(n); return Number.isFinite(date.getTime()) ? date.toISOString() : undefined; };
const rows = value => Array.isArray(value)?value.filter(row=>row&&typeof row==='object'&&!Array.isArray(row)):[];
function intelIntent(value){
  if(typeof value!=='string'||value.length>500)return null;const text=value.trim();
  if(/\berdbeben\b/i.test(text)&&/\b(?:heute|aktuell)\b/i.test(text)&&!/morgen|vorhersag|prognos|gestern|\b(?:vor|seit|jahr|monat|woche)\b|\d/i.test(text))return {kind:'earthquakes'};
  if(/\bukraine\b/i.test(text)&&/lage|situation|was passiert|zeige|zeig/i.test(text))return {kind:'ukraine'};
  if(!/zeige|zeig|öffne|ich will|ich möchte|gib|welche|suche?/i.test(text)||/(?:meine|deine|angeschlossene)\s+(?:webcam|kamera)/i.test(text))return null;
  const match=text.match(/\bwebcams?\s+(?:aus|in|von)\s+(.{2,100})/i);
  if(match){const query=match[1].replace(/\s+(?:angezeigt|anzeigen|sehen|bitte)\b.*$/i,'').replace(/[.!?]+$/,'').trim();if(query)return {kind:'cameras',query};}
  return null;
}
function publicUrl(value) {
  if (typeof value !== 'string' || value.length > 2000 || /[\x00-\x20\\]/.test(value)) return undefined;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port && u.port !== '443' || isIP(u.hostname.replace(/[\[\]]/g,'')) || !u.hostname.includes('.') || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(u.hostname)) return undefined;
    return u.href;
  } catch { return undefined; }
}
function location(lat, lon) { return numeric(lat) && numeric(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : {}; }
function mapLayers(front){
  const paths=[];let budget=6000;
  const features=Array.isArray(front?.map?.features)?front.map.features:[];
  for(const feature of features.slice(0,200)){
    const g=feature?.geometry;if(!g||!Array.isArray(g.coordinates)||!['LineString','MultiLineString','Polygon','MultiPolygon'].includes(g.type))continue;
    const lines=g.type==='LineString'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates.flat():g.coordinates;
    for(const line of Array.isArray(lines)?lines:[]){if(!Array.isArray(line)||line.length<2||budget<2)continue;const step=Math.max(1,Math.ceil(line.length/200)),points=[];
      for(let i=0;i<line.length&&points.length<budget;i+=step){const p=line[i];if(Array.isArray(p)&&numeric(p[0])&&numeric(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90)points.push([p[0],p[1]]);}
      if(points.length>=2){paths.push(points);budget-=points.length;}
    }
  }
  return paths.length?[{source:'DeepState',sourceTime:text(front.datetime,120),paths}]:[];
}
function berlinDate(epoch) { return new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Berlin', year:'numeric', month:'2-digit', day:'2-digit' }).format(epoch); }
function berlinMidnight(date) {
  const utc = Date.parse(date + 'T00:00:00Z');
  let instant = utc;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Berlin', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23' }).formatToParts(instant).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    const represented = Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);
    instant -= represented - utc;
  }
  return instant;
}
function berlinDayBounds(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) throw new Error('Ungültiges Datum. Bitte JJJJ-MM-TT verwenden.');
  const next = new Date(Date.parse(date+'T00:00:00Z') + 86400000).toISOString().slice(0,10);
  return { start:berlinMidnight(date), end:berlinMidnight(next) };
}
function distanceKm(lat, lon, point) {
  const rad = n=>n*Math.PI/180, dLat=rad(point.lat-lat), dLon=rad(point.lon-lon);
  const a=Math.sin(dLat/2)**2+Math.cos(rad(lat))*Math.cos(rad(point.lat))*Math.sin(dLon/2)**2;
  return 6371 * 2 * Math.asin(Math.min(1,Math.sqrt(a)));
}
function catalog() {
  return FEEDS.map(([id,title]) => ({ id, title, path:'/api/'+id, url:ORIGIN+'/api/'+id, supported:Object.values(KINDS).includes(id), documentation:'https://osirisai.live/docs', parameters:id==='sentinel'?['lat','lng','radius','days']:id==='region-dossier'?['lat','lng']:id==='arcgis'?['service','q','bbox']:id==='cctv'?['region','lat','lng','radius']:[] }));
}
function earthquakeItem(row, geojson=false) {
  const p=geojson?row.properties||{}:row, c=geojson?row.geometry?.coordinates:undefined;
  const time=iso(p.time);
  return { id:text(row.id,120),title:text(p.place||'Erdbeben',220),description:numeric(p.depth??c?.[2])?'Tiefe: '+(p.depth??c[2])+' km':'',...location(geojson?c?.[1]:p.lat,geojson?c?.[0]:p.lng),time,sourceTime:time,magnitude:geojson?p.mag:p.magnitude,depth:geojson?c?.[2]:p.depth,url:publicUrl(p.url),source:'USGS',eventType:p.type||'earthquake' };
}
function newsItem(row) {
  const precise = row.location_precision && !/anchor|country/.test(row.location_precision);
  return { id:text(row.id,120),title:text(row.title||'Bericht',250),description:text(row.summary||row.description),time:iso(row.published),sourceTime:iso(row.published),url:publicUrl(row.link),source:text(row.source_name||row.source,120),lean:text(row.lean,120),locationPrecision:text(row.location_precision,80),riskMethod:text(row.risk_method,80),...precise?location(row.coords?.[0],row.coords?.[1]):{} };
}
const cameraSourceAllowed = source => /^(?:Public Webcam|TfL|YouTube Live|SkylineWebcams|WSDOT|Caltrans|City of Ottawa|Quebec 511|511 Ontario|Ville MTL|DriveBC|ASFINAG|Rijkswaterstaat|Digitraffic|UDOT|ODOT|NDOT|TxDOT|LADOTD|MDOT|NZTA|NZ Transport Agency|Hong Kong Transport Department)$/i.test(source||'');
function cameraUrl(camera) {
  const external=publicUrl(camera.external_url); if(external) return external;
  const stream=publicUrl(camera.stream_url);
  if(stream && /youtube(?:-nocookie)?\.com/.test(new URL(stream).hostname)) { const id=new URL(stream).pathname.match(/^\/embed\/([\w-]+)$/)?.[1]; if(id) return 'https://www.youtube.com/watch?v='+id; }
  return publicUrl(camera.feed_url);
}
function createOsirisClient({ fetcher=globalThis.fetch, now=Date.now }={}) {
  const cache=new Map();
  async function request(url, signal) {
    signal?.throwIfAborted();
    const target=new URL(url);
    if (!(target.origin===ORIGIN && PATHS.has(target.pathname)) && !(target.origin==='https://earthquake.usgs.gov' && target.pathname==='/fdsnws/event/1/query')) throw new Error('API-Adresse ist nicht freigegeben.');
    const saved=cache.get(target.href); if(saved && now()-saved.at>=0 && now()-saved.at<60000) return saved;
    const timeout=AbortSignal.timeout(15000), combined=signal?AbortSignal.any([signal,timeout]):timeout;
    const response=await fetcher(target.href,{ method:'GET',redirect:'error',credentials:'omit',headers:{ Accept:'application/json' },signal:combined });
    combined.throwIfAborted();
    if(response.redirected) throw new Error('API-Weiterleitung wurde abgelehnt.');
    if(response.status===204) return { body:{features:[]},at:now() };
    if(!response.ok) throw new Error('API antwortet mit HTTP '+response.status+'.');
    if(Number(response.headers?.get('content-length'))>MAX_BYTES) { await response.body?.cancel().catch(()=>{}); throw new Error('API-Antwort ist zu groß (maximal 4 MiB).'); }
    const reader=response.body?.getReader(); if(!reader) throw new Error('API-Antwort enthält keine lesbaren Daten.');
    let size=0; const chunks=[];
    try {
      while(true) { combined.throwIfAborted(); const {value,done}=await reader.read(); if(done) break; size+=value.byteLength; if(size>MAX_BYTES) { await reader.cancel(); throw new Error('API-Antwort ist zu groß (maximal 4 MiB).'); } chunks.push(Buffer.from(value)); }
    } finally { reader.releaseLock(); }
    combined.throwIfAborted();
    const body=JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
    if(!body || typeof body!=='object' || Array.isArray(body)) throw new Error('Ungültige API-Daten.');
    if(body.error) throw new Error('Quelle nicht verfügbar: '+text(body.error,180));
    const result={body,at:now()}; cache.set(target.href,result);
    if(cache.size>32) cache.delete(cache.keys().next().value);
    return result;
  }
  async function query(payload={}, {signal}={}) {
    signal?.throwIfAborted();
    if(!payload || typeof payload!=='object' || Array.isArray(payload)) throw new Error('Ungültige Abfrage.');
    const allowed=new Set(['kind','query','region','lat','lon','radiusKm','date','feed']);
    if(Object.keys(payload).some(key=>!allowed.has(key))) throw new Error('Unbekanntes Abfragefeld.');
    const kind=payload.kind,feed=kind==='feed'?FEEDS.find(([id])=>id===payload.feed&&!Object.values(KINDS).includes(id)):null;
    if(!Object.hasOwn(KINDS,kind)&&!feed)throw new Error('Diese öffentliche Datenkategorie ist nicht integriert.');
    if(payload.feed!==undefined&&kind!=='feed')throw new Error('Feed benötigt die Datenkategorie feed.');
    if(payload.query!==undefined && (typeof payload.query!=='string' || payload.query.length>200)) throw new Error('Suchtext ist zu lang oder ungültig.');
    const q=text(payload.query,200).trim();
    const hasPoint=payload.lat!==undefined || payload.lon!==undefined;
    if(hasPoint && !Object.keys(location(payload.lat,payload.lon)).length) throw new Error('Breiten- und Längengrad sind ungültig.');
    const radius=payload.radiusKm??25;
    if(!numeric(radius)||radius<=0||radius>1000) throw new Error('Radius muss zwischen 0 und 1000 km liegen.');
    let region=payload.region;
    if(region!==undefined && (typeof region!=='string'||!region||region.split(',').length>4||region.split(',').some(r=>!REGIONS.includes(r)))) throw new Error('Unbekannte Kameraregion.');
    const result={kind,title:feed?feed[1]:TITLES[kind],items:[],fetchedAt:null,sources:[{name:'OSIRIS API',url:ORIGIN+'/docs'}],warning:'',query:q};
    if(feed){
      const url=new URL('/api/'+feed[0],ORIGIN),received=await request(url,signal),body=received.body;result.fetchedAt=new Date(received.at).toISOString();result.sourceTime=typeof body.timestamp==='string'?body.timestamp:undefined;
      result.sources.push({name:feed[1],url:url.href});const groups=Object.entries(body).filter(([,value])=>Array.isArray(value));
      for(const [group,rows]of groups)for(const row of rows.slice(0,100)){if(!row||typeof row!=='object')continue;const p=row.properties||row,c=row.geometry?.coordinates;result.items.push({id:text(row.id||p.id||p.name||group+'-'+result.items.length,120),title:text(p.title||p.name||p.callsign||p.id||group,220),description:text(JSON.stringify(row),600),source:text(p.source||feed[1],100),...location(p.lat??p.latitude??c?.[1],p.lng??p.lon??p.longitude??c?.[0]),url:publicUrl(p.url),time:iso(p.time||p.timestamp)});if(result.items.length>=100)break;}
      if(!groups.length)result.items=Object.entries(body).slice(0,30).map(([key,value])=>({id:key,title:text(key,180),description:text(JSON.stringify(value),600),source:feed[1]}));
      result.items=result.items.slice(0,100);result.warning='Öffentliche Quelldaten, allgemein aufbereitet. Quellenzeit und Abdeckung können unbekannt sein; keine unabhängig bestätigte Analyse.';return result;
    }
    if(kind==='cameras') {
      const places={london:'uk',berlin:'germany',münchen:'germany',munich:'germany',deutschland:'germany','germany':'germany',niederlande:'netherlands',netherlands:'netherlands',paris:'france',frankreich:'france',tokyo:'japan'};
      region ||= places[q.toLowerCase()];
      if(!region&&!hasPoint) return {...result,clarificationNeeded:true,clarification:'Bitte eine Quellenregion auswählen oder genaue Koordinaten angeben. Der Ort wird nicht geraten.',availableRegions:[...REGIONS]};
    }
    let endpoint=new URL('/api/'+KINDS[kind],ORIGIN);
    let bounds, historical=false;
    if(kind==='earthquakes') {
      const date=payload.date||berlinDate(now()); bounds=berlinDayBounds(date);
      if(bounds.start>now()) throw new Error('Für zukünftige Tage liegen keine Messungen vor.');
      historical=date!==berlinDate(now()) || now()-bounds.start>86400000;
      if(historical) { endpoint=new URL('https://earthquake.usgs.gov/fdsnws/event/1/query'); endpoint.search=new URLSearchParams({format:'geojson',starttime:new Date(bounds.start).toISOString(),endtime:new Date(Math.min(bounds.end-1,now())).toISOString(),eventtype:'earthquake',orderby:'magnitude',limit:'100'}).toString(); }
      result.title='Erdbeben · '+date+' · Europe/Berlin';
      result.sources.push({name:'USGS',url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php'});
    }
    if(kind==='cameras') { if(region) endpoint.searchParams.set('region',region); if(hasPoint) {endpoint.searchParams.set('lat',payload.lat);endpoint.searchParams.set('lng',payload.lon);endpoint.searchParams.set('radius',radius);} }
    if(kind==='ukraine') {
      const outcomes=await Promise.allSettled([request(endpoint,signal),request(new URL('/api/news',ORIGIN),signal)]);
      signal?.throwIfAborted();
      const successes=outcomes.filter(r=>r.status==='fulfilled').map(r=>r.value);
      if(!successes.length) throw outcomes[0].reason;
      result.fetchedAt=new Date(Math.min(...successes.map(r=>r.at))).toISOString();
      const front=outcomes[0].status==='fulfilled'?outcomes[0].value.body:null;
      const feed=outcomes[1].status==='fulfilled'?outcomes[1].value.body:null;
      if(front?.frontlines) result.items.push({id:'ukraine-frontline',title:'Ukraine · DeepState-Kartenstand',description:'Kartenstand aus DeepState; keine unabhängig bestätigte Lagebewertung.',source:'DeepState',sourceTime:text(front.frontlines.datetime,120),url:'https://deepstatemap.live/'});
      result.geoLayers=mapLayers(front?.frontlines);
      if(feed) result.items.push(...rows(feed.news).filter(row=>/ukrain|kyiv|kiew|russian invasion/i.test([row.title,row.summary,row.description].join(' '))).map(newsItem));
      result.sources.push({name:'DeepState',url:'https://deepstatemap.live/'},{name:'OSIRIS Nachrichtenquellen',url:ORIGIN+'/api/news'});
      result.warning='Berichte und Kartenstände sind Quellenangaben, keine unabhängige Bestätigung. Länderanker sind keine genauen Ereignisorte.';
      for(const outcome of outcomes) if(outcome.status==='rejected') result.warning+=' '+text(outcome.reason?.message,220);
      result.items=result.items.slice(0,100); return result;
    }
    const fetched=await request(endpoint,signal),body=fetched.body;
    result.fetchedAt=new Date(fetched.at).toISOString(); result.sourceTime=typeof body.timestamp==='string'?text(body.timestamp,120):undefined;
    if(kind==='earthquakes') {
      result.items=rows(historical?body.features:body.earthquakes).map(row=>earthquakeItem(row,historical)).filter(row=>numeric(row.magnitude)&&row.eventType==='earthquake'&&Date.parse(row.time)>=bounds.start&&Date.parse(row.time)<bounds.end&&Date.parse(row.time)<=now()).sort((a,b)=>b.magnitude-a.magnitude);
      result.warning=result.items.length?historical?'USGS-Katalog; gemeldete Magnituden können später korrigiert werden.':'OSIRIS liefert USGS-Ereignisse ab M2,5 aus den letzten 24 Stunden. Hier auf den heutigen Kalendertag gefiltert.':'Keine Erdbeben für diesen Tag in der abgefragten Quelle gemeldet.';
    } else if(kind==='cameras') {
      const countryWords=/^(deutschland|germany|niederlande|netherlands|frankreich)$/i.test(q);
      result.items=rows(body.cameras).filter(camera=>cameraSourceAllowed(camera.source)).map(camera=>({id:text(camera.id,120),title:text(camera.name,220),description:[text(camera.city,100),text(camera.country,100)].filter(Boolean).join(' · '),source:text(camera.source,100),url:cameraUrl(camera),...location(camera.lat,camera.lng)})).filter(camera=>camera.url&&(!q||countryWords||[camera.title,camera.description].join(' ').toLowerCase().includes(q.toLowerCase())));
      if(hasPoint) result.items=result.items.filter(item=>numeric(item.lat)&&numeric(item.lon)).map(item=>({...item,distanceKm:distanceKm(payload.lat,payload.lon,item)})).filter(item=>item.distanceKm<=radius).sort((a,b)=>a.distanceKm-b.distanceKm);
      result.availableRegions=[...REGIONS]; result.warning='Nur öffentlich veröffentlichte Betreiberquellen. Kameras öffnen erst nach einem Klick; Verfügbarkeit und Weiterverwendung hängen vom Betreiber ab.';
      if(Array.isArray(body.pendingRegions)&&body.pendingRegions.length) result.warning+=' Quellenregionen werden noch geladen: '+body.pendingRegions.slice(0,60).map(r=>text(r,40)).join(', ')+'.';
      if(!result.items.length) result.warning+=' Keine passende öffentliche Kamera in der abgefragten Region gefunden.';
    } else if(kind==='news') {
      result.items=rows(body.news).map(newsItem).filter(item=>!q||[item.title,item.description,item.source].join(' ').toLowerCase().includes(q.toLowerCase()));
      result.warning='Quellenperspektiven bleiben sichtbar. Berichte sind nicht unabhängig bestätigt; Länderanker werden nicht als Ereignisorte eingezeichnet.';
    } else if(kind==='weather') {
      result.items=rows(body.events).map(row=>{const g=rows(row.geometry).at(-1),c=g?.coordinates; return {id:text(row.id,120),title:text(row.title,220),description:text(row.category||row.area||rows(row.categories).map(c=>text(c.title,80)).join(' · ')),source:text(row.provider||'NASA EONET',100),sourceTime:iso(row.date||g?.date),time:iso(row.date||g?.date),url:publicUrl(row.source||row.sources?.[0]?.url),...numeric(row.lat)?location(row.lat,row.lng):g?.type==='Point'?location(c?.[1],c?.[0]):{}};}).filter(item=>!q||[item.title,item.description].join(' ').toLowerCase().includes(q.toLowerCase()));
      result.sources.push({name:'NASA EONET',url:'https://eonet.gsfc.nasa.gov/'},{name:'NOAA / NWS',url:'https://www.weather.gov/'},{name:'GDACS',url:'https://www.gdacs.org/'}); result.warning='Naturereignisse und behördliche Warnungen; keine allgemeine lokale Wettervorhersage.';
    } else if(kind==='flights') {
      for(const group of ['commercial_flights','private_flights','private_jets','military_flights']) for(const row of rows(body[group])) { const p=row.properties||row,c=row.geometry?.coordinates; result.items.push({id:text(row.id||p.icao24,120),title:text(p.callsign||p.registration||p.icao24||'Flugzeug',180),description:text(p.model||p.origin_country||p.country||group,180),source:text(body.source||'OSIRIS ADS-B',100),...location(p.lat??p.latitude??c?.[1],p.lng??p.longitude??c?.[0]),altitude:numeric(p.alt??p.altitude)?p.alt??p.altitude:undefined}); }
      result.items=result.items.filter(item=>!q||[item.title,item.description].join(' ').toLowerCase().includes(q.toLowerCase())); result.warning='ADS-B-Abdeckung ist unvollständig; fehlende Daten bedeuten keine bestätigte Abwesenheit.';
    } else if(kind==='ships') {
      for(const group of ['ships','ports','chokepoints']) for(const row of rows(body[group])) result.items.push({id:text(row.id||row.mmsi||row.name,120),title:text(row.name||row.label||'Maritime Daten',220),description:text(row.country||row.type||group,160),source:text(row.source||'OSIRIS maritime',100),...location(row.lat,row.lng??row.lon),url:publicUrl(row.url),time:iso(row.timestamp)});
      result.items=result.items.filter(item=>!q||[item.title,item.description].join(' ').toLowerCase().includes(q.toLowerCase())); result.warning='Häfen und Engstellen sind Referenzdaten; Schiffspositionen hängen von der jeweiligen Quelle ab.';
    } else if(kind==='stats') result.items=Object.entries(body.stats||{}).filter(([,value])=>numeric(value)).map(([key,value])=>({id:key,title:text(key,100),description:String(value),value,source:'OSIRIS'}));
    result.items=result.items.slice(0,100); return result;
  }
  return {query,catalog};
}

module.exports={createOsirisClient,berlinDayBounds,publicUrl,intelIntent};
