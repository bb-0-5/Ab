import {runHouseComputation,type HouseEndpoint} from './house_compute';
import {makeSiteContextCacheKey,type GeoJsonFeatureCollection} from './site_context';
// ODbL-licensed source snapshots already checked into the ORIGINAL repo,
// not fabricated by a live service or the simulation.
import darwin from '../../site-context-cache/m12p4600_130p8400.geojson?raw';
import townsville from '../../site-context-cache/m23p7000_133p8800.geojson?raw';
import alice from '../../site-context-cache/m27p4700_153p0300.geojson?raw';
import sydney from '../../site-context-cache/m33p8700_151p2100.geojson?raw';
import bendigo from '../../site-context-cache/m36p7600_144p2800.geojson?raw';
import melbourne from '../../site-context-cache/m37p8100_144p9600.geojson?raw';
import hobart from '../../site-context-cache/m42p8800_147p3300.geojson?raw';

const SITE_SNAPSHOTS:Record<string,string>={
 m12p4600_130p8400:darwin,
 m23p7000_133p8800:townsville,
 m27p4700_153p0300:alice,
 m33p8700_151p2100:sydney,
 m36p7600_144p2800:bendigo,
 m37p8100_144p9600:melbourne,
 m42p8800_147p3300:hobart,
};
const siteCache=(body:unknown):GeoJsonFeatureCollection|null=>{
 if(!body||typeof body!=='object')return null;
 const location=(body as {location?:{latitudeDeg?:number;longitudeDeg?:number}}).location;
 if(!location)return null;
 const lat=Number(location.latitudeDeg),lon=Number(location.longitudeDeg);
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
 const raw=SITE_SNAPSHOTS[makeSiteContextCacheKey(lat,lon)];
 return raw?JSON.parse(raw) as GeoJsonFeatureCollection:null;
};

type Request={id:number;path:HouseEndpoint;body:unknown};
type Reply={id:number;ok:boolean;result?:unknown;error?:string};
self.onmessage=(event:MessageEvent<Request>)=>{
 const {id,path,body}=event.data;
 let reply:Reply;
 try{
  reply={id,ok:true,result:runHouseComputation(path,body,
   path==='/api/house/site-context'?siteCache(body):null)};
 }catch(e){
  reply={id,ok:false,error:e instanceof Error?e.message:'Engineering calculation failed'};
 }
 self.postMessage(reply);
};
