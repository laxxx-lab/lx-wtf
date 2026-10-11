const test = require('node:test');
const assert = require('node:assert/strict');
const { createOsirisClient, berlinDayBounds } = require('../osiris-client.cjs');
test('public intelligence voice intents do not capture local camera or microphone controls',()=>{
  const {intelIntent}=require('../osiris-client.cjs');
  assert.deepEqual(intelIntent('Zeig mir eine Webcam aus London.'),{kind:'cameras',query:'London'});
  assert.deepEqual(intelIntent('Wo war das stärkste Erdbeben heute?'),{kind:'earthquakes'});
  assert.deepEqual(intelIntent('Zeig mir die Lage in der Ukraine.'),{kind:'ukraine'});
  for(const text of ['Mach meine Webcam aus und geh in Standby.','Schau durch meine Kamera.','Zeige mein Kamerabild.'])assert.equal(intelIntent(text),null);
});

test('earthquake requests for explicit dates and broader periods bypass the local today route',()=>{
  const {intelIntent}=require('../osiris-client.cjs');
  for(const question of ['Zeige die Erdbeben vom 1. Oktober 2026.','Wo war das stärkste Erdbeben dieses Jahr?','Zeige die stärksten Erdbeben letzte Woche.'])assert.equal(intelIntent(question),null,question);
});

const now = Date.parse('2026-10-10T10:00:00Z');
const quake = (id, magnitude, time) => ({ id, magnitude, time: Date.parse(time), place: id, lat: 7.5, lng: -80.7, depth: 12, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/' + id });
const cameras = [
  { id: 'tfl-a', name: 'A406', city: 'London', country: 'UK', lat: 51.6, lng: -0.02, source: 'TfL', feed_url: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/a.jpg' },
  { id: 'tfl-b', name: 'Dundas', city: 'London', country: 'UK', lat: 51.5, lng: -0.12, source: 'TfL', external_url: 'https://tfl.gov.uk/traffic/status/' },
  { id: 'bad', name: 'Private', city: 'London', lat: 51.5, lng: -0.12, source: 'Private', stream_url: 'http://192.168.0.2/cam' },
];
function client(body, options = {}) {
  const calls = [];
  const instance = createOsirisClient({ now: () => now, fetcher: async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(typeof body === 'function' ? body(String(url)) : body), { headers: { 'content-type': 'application/json' } }); }, ...options });
  return { instance, calls };
}

test('today means the Berlin calendar day and strongest excludes yesterday and future events', async () => {
  const { instance } = client({ earthquakes: [quake('yesterday', 7.7, '2026-10-09T17:56:00Z'), quake('first', 4.3, '2026-10-09T22:00:00Z'), quake('strongest', 5.1, '2026-10-10T04:00:00Z'), quake('future', 8, '2026-10-10T15:00:00Z')], timestamp: '2026-10-10T09:59:00Z' });
  const result = await instance.query({ kind: 'earthquakes' });
  assert.deepEqual(result.items.map(item => item.id), ['strongest', 'first']);
  assert.equal(result.items[0].magnitude, 5.1);
  assert.equal(result.items[0].sourceTime, '2026-10-10T04:00:00.000Z');
  assert.equal(result.sourceTime, '2026-10-10T09:59:00Z');
});
test('Ukraine map retains bounded real geometry and its source time without inventing an event anchor',async()=>{
  const {instance}=client(url=>url.endsWith('/frontlines')?{frontlines:{datetime:'08.10 21:28',map:{type:'FeatureCollection',features:[{geometry:{type:'Polygon',coordinates:[[[30,50],[31,50],[31,51],[30,50]]]}},{geometry:{type:'Point',coordinates:[30,50]}},{geometry:{type:'LineString',coordinates:[[30,200],[31,201]]}}]}}}:{news:[]});
  const result=await instance.query({kind:'ukraine'});assert.equal(result.geoLayers.length,1);assert.equal(result.geoLayers[0].sourceTime,'08.10 21:28');assert.deepEqual(result.geoLayers[0].paths[0],[[30,50],[31,50],[31,51],[30,50]]);assert.equal(result.items[0].lat,undefined);
});
test('other catalog feeds remain fixed public GET requests and active or paid routes are refused',async()=>{
  const {instance,calls}=client({satellites:[{id:'iss',name:'ISS',lat:12,lng:24}],timestamp:'2026-10-10T09:58:00Z'});
  const result=await instance.query({kind:'feed',feed:'satellites'});assert.equal(result.items[0].title,'ISS');assert.equal(result.items[0].lat,12);assert.equal(calls[0].url,'https://osirisai.live/api/satellites');
  for(const feed of ['scanner','sdk/ingest','oi/runs','cctv','../private'])await assert.rejects(instance.query({kind:'feed',feed}));
});

test('Berlin day boundaries account for DST, including 25-hour days', () => {
  assert.deepEqual(berlinDayBounds('2026-10-25'), { start: Date.parse('2026-10-24T22:00:00Z'), end: Date.parse('2026-10-25T23:00:00Z') });
  assert.deepEqual(berlinDayBounds('2026-03-29'), { start: Date.parse('2026-03-28T23:00:00Z'), end: Date.parse('2026-03-29T22:00:00Z') });
});

test('historical days use the fixed official USGS query and never fabricate an earthquake', async () => {
  const { instance, calls } = client({ type: 'FeatureCollection', features: [] });
  const result = await instance.query({ kind: 'earthquakes', date: '2026-10-01' });
  assert.equal(result.items.length, 0);
  assert.match(result.warning, /Keine/);
  const target = new URL(calls[0].url);
  assert.equal(target.origin, 'https://earthquake.usgs.gov');
  assert.equal(target.searchParams.get('eventtype'), 'earthquake');
  assert.equal(target.searchParams.get('starttime'), '2026-09-30T22:00:00.000Z');
});

test('camera radius is enforced locally and nearest public cameras come first', async () => {
  const { instance } = client({ cameras, timestamp: '2026-10-09T12:00:00Z' });
  const result = await instance.query({ kind: 'cameras', region: 'uk', lat: 51.5, lon: -0.12, radiusKm: 5 });
  assert.deepEqual(result.items.map(item => item.id), ['tfl-b']);
  assert.equal(result.items[0].distanceKm, 0);
  assert.equal(result.sourceTime, '2026-10-09T12:00:00Z');
});

test('unknown camera places request a region or coordinates without a network guess', async () => {
  const { instance, calls } = client({ cameras });
  const result = await instance.query({ kind: 'cameras', query: 'A completely unknown village' });
  assert.equal(result.clarificationNeeded, true);
  assert.ok(result.availableRegions.includes('uk'));
  assert.equal(calls.length, 0);
});

test('60 second caching retains the original fetch time and respects an already aborted request', async () => {
  let time = now;
  const { instance, calls } = client({ news: [], timestamp: '2026-10-09T12:00:00Z' }, { now: () => time });
  const first = await instance.query({ kind: 'news' });
  time += 30000;
  const second = await instance.query({ kind: 'news' });
  assert.equal(calls.length, 1);
  assert.equal(second.fetchedAt, first.fetchedAt);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(instance.query({ kind: 'news' }, { signal: controller.signal }), { name: 'AbortError' });
  time += 31000;
  await instance.query({ kind: 'news' });
  assert.equal(calls.length, 2);
});

test('Ukraine retains report provenance, partisan labels and source frontend dates', async () => {
  const { instance } = client(url => url.endsWith('/frontlines') ? { frontlines: { id: 1791487695, datetime: '08.10 o 21:28', map: { type: 'FeatureCollection', features: [] } }, timestamp: '2026-10-10T09:54:20Z' } : { news: [{ id: 'story', title: 'Ukraine report', published: '2026-10-10T09:48:01Z', link: 'https://t.me/KyivIndependent_official/56041', source_name: 'Kyiv Independent', lean: 'Ukrainian newsroom', risk_method: 'keyword-count', location_precision: 'country-anchor', coords: [49.487, 31.272] }], timestamp: '2026-10-10T09:53:29Z' });
  const result = await instance.query({ kind: 'ukraine' });
  assert.equal(result.items[0].sourceTime, '08.10 o 21:28');
  const report = result.items.find(item => item.id === 'story');
  assert.equal(report.lean, 'Ukrainian newsroom');
  assert.equal(report.locationPrecision, 'country-anchor');
  assert.equal(report.lat, undefined, 'country anchors are not precise event locations');
  assert.match(result.warning, /Berichte/);
});

test('malformed frontline geometries do not discard available Ukraine reports', async () => {
  for (const features of [{not:'an array'},[null,{geometry:{type:'MultiPolygon'}},{geometry:{type:'Polygon',coordinates:'invalid'}}]]) {
    const {instance}=client(url=>url.endsWith('/frontlines')?{frontlines:{map:{features}}}:{news:[{title:'Ukraine report',source_name:'Example newsroom'}]});
    const result=await instance.query({kind:'ukraine'});
    assert.ok(result.items.some(item=>item.title==='Ukraine report'));
    assert.deepEqual(result.geoLayers,[]);
  }
});

test('rejects unknown kinds, arbitrary URLs, invalid regions and malformed coordinates', async () => {
  const { instance, calls } = client({});
  for (const payload of [{ kind: 'scanner' }, { kind: 'news', url: 'https://evil.test' }, { kind: 'cameras', region: 'london' }, { kind: 'cameras', region: 'uk', lat: 95, lon: 0 }]) await assert.rejects(instance.query(payload));
  assert.equal(calls.length, 0);
  assert.ok(instance.catalog().some(feed => feed.id === 'satellites'));
  assert.ok(instance.catalog().every(feed => !/scanner|osint|oi\/runs|ingest|ai\//.test(feed.path)));
});

test('oversized and redirected responses are rejected before consuming untrusted data', async () => {
  const large = createOsirisClient({ fetcher: async () => new Response('{}', { headers: { 'content-length': String(5 * 1024 * 1024) } }) });
  await assert.rejects(large.query({ kind: 'news' }), /groß/);
  const redirected = createOsirisClient({ fetcher: async () => ({ ok: true, redirected: true, headers: new Headers(), body: null }) });
  await assert.rejects(redirected.query({ kind: 'news' }), /Weiterleitung/);
  const streamed = createOsirisClient({ fetcher: async () => new Response(new Uint8Array(4 * 1024 * 1024 + 1)) });
  await assert.rejects(streamed.query({ kind: 'news' }), /groß/);
});

test('abort cancels an active fetch and all requests are anonymous GET with redirect rejection', async () => {
  const controller = new AbortController();
  const instance = createOsirisClient({ fetcher: async (_url, options) => {
    assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit'); assert.deepEqual(options.headers, { Accept: 'application/json' });
    controller.abort(); options.signal.throwIfAborted();
  } });
  await assert.rejects(instance.query({ kind: 'news' }, { signal: controller.signal }), { name: 'AbortError' });
});

test('actual normalized weather and ADS-B shapes preserve positions and provider dates', async () => {
  const weather = client({ events: [{ id:'nws-1', title:'Flood Warning', category:'weather', lat:30, lng:-90, date:'2026-10-09T12:00:00Z', provider:'NOAA/NWS', source:'https://api.weather.gov/alerts/one' }] });
  const result = await weather.instance.query({kind:'weather'});
  assert.equal(result.items[0].lat,30);
  assert.equal(result.items[0].source,'NOAA/NWS');
  assert.equal(result.items[0].sourceTime,'2026-10-09T12:00:00.000Z');
  const flights = client({ commercial_flights:[{callsign:'LH123',icao24:'abc123',lat:50,lng:8,alt:10000,model:'A320'}], source:'ADS-B' });
  const aircraft = await flights.instance.query({kind:'flights'});
  assert.equal(aircraft.items[0].altitude,10000);
  assert.equal(aircraft.items[0].description,'A320');
});

test('out-of-range numeric source times cannot discard otherwise valid generic feed observations',async()=>{
  const {instance}=client({satellites:[{id:'bad-time',name:'Invalid timestamp',time:1e20},{id:'good',name:'ISS',time:now}]});
  const result=await instance.query({kind:'feed',feed:'satellites'});
  assert.equal(result.items.find(item=>item.id==='bad-time')?.time,undefined);
  assert.equal(result.items.find(item=>item.id==='good')?.time,new Date(now).toISOString());
});

test('null entries in specialized feeds do not discard valid observations',async()=>{
  const cases=[
    [{kind:'earthquakes'},{earthquakes:[null,quake('good',4,'2026-10-10T04:00:00Z'),null]},'good'],
    [{kind:'news'},{news:[null,{id:'good',title:'Actual report',published:'2026-10-10T04:00:00Z'},null]},'good'],
    [{kind:'cameras',region:'uk'},{cameras:[null,cameras[0],null]},'tfl-a'],
    [{kind:'weather'},{events:[null,{id:'good',title:'Flood Warning',provider:'NOAA/NWS',lat:30,lng:-90},null]},'good'],
    [{kind:'flights'},{commercial_flights:[null,{id:'good',callsign:'LH123',lat:50,lng:8},null]},'good'],
    [{kind:'ships'},{ships:[null,{id:'good',name:'Public vessel',lat:50,lng:8},null]},'good'],
  ];
  for(const [payload,body,id]of cases){const {instance}=client(body);const result=await instance.query(payload);assert.deepEqual(result.items.map(item=>item.id),[id],payload.kind);}
});
