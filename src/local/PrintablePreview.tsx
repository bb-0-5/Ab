import {useEffect,useRef,useState} from 'react';
import {AmbientLight,Color,DirectionalLight,DoubleSide,GridHelper,
 Mesh,MeshStandardMaterial,PerspectiveCamera,Scene,SRGBColorSpace,WebGLRenderer} from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {STLLoader} from 'three/examples/jsm/loaders/STLLoader.js';
import {panelSTL,type FabCandidate} from './fabrication';

/**
 * User-controlled, device-local preview of exactly the STL mesh being exported.
 * Rendering the same geometry avoids promising a full flying suit or
 * substituting a fantasy silhouette for the actual printable object.
 */
export default function PrintablePreview({candidate}:{candidate:FabCandidate}){
 const container=useRef<HTMLDivElement>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  const host=container.current;if(!host||!candidate.printable)return;
  let renderer:WebGLRenderer|undefined;
  let controls:OrbitControls|undefined;
  let ro:ResizeObserver|undefined;
  let geometry:ReturnType<STLLoader['parse']>|undefined;
  let material:MeshStandardMaterial|undefined;
  let raf=0;
  try{
   renderer=new WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
   renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.8));
   renderer.setClearColor(new Color('#091923'));
   renderer.outputColorSpace=SRGBColorSpace;
   renderer.domElement.style.width='100%';
   renderer.domElement.style.height='100%';
   renderer.domElement.setAttribute('aria-label','Interactive 3D view of the actual printable decorative frame');
   host.appendChild(renderer.domElement);

   geometry=new STLLoader().parse(new TextEncoder().encode(panelSTL(candidate)).buffer as ArrayBuffer);
   geometry.computeVertexNormals();geometry.center();
   const scene=new Scene();
   const camera=new PerspectiveCamera(42,1,0.01,5000);
   // Actual physical dimensions are millimetres; no fake scale cues.
   const r=Math.hypot(candidate.widthMm,candidate.lengthMm)/2;
   camera.up.set(0,0,1);
   camera.position.set(r*1.25,-r*1.6,r*1.3);
   camera.lookAt(0,0,0);
   scene.add(new AmbientLight(0xffffff,1.8));
   const sun=new DirectionalLight(0xffffff,3);
   sun.position.set(r,r,2*r);scene.add(sun);
   material=new MeshStandardMaterial({color:0x1d9db1,metalness:.08,roughness:.62,side:DoubleSide});
   const mesh=new Mesh(geometry,material);
   scene.add(mesh);
   const grid=new GridHelper(Math.max(candidate.widthMm,candidate.lengthMm)*1.5,18,0x365361,0x203f4d);
   grid.rotation.x=Math.PI/2;
   grid.position.z=-candidate.thicknessMm-2;
   scene.add(grid);
   controls=new OrbitControls(camera,renderer.domElement);
   controls.enableDamping=false;
   controls.enablePan=false;
   controls.minDistance=r*.55;
   controls.maxDistance=r*8;
   const draw=()=>renderer?.render(scene,camera);
   controls.addEventListener('change',draw);
   const resize=()=>{
    if(!renderer)return;
    const width=Math.max(1,host.clientWidth),height=Math.max(1,host.clientHeight);
    renderer.setSize(width,height,false);
    camera.aspect=width/height;camera.updateProjectionMatrix();
    cancelAnimationFrame(raf);raf=requestAnimationFrame(draw);
   };
   ro=new ResizeObserver(resize);
   ro.observe(host);
   resize();
  }catch(err){
   setError(err instanceof Error?err.message:'3D preview unavailable on this device.');
  }
  return ()=>{
   cancelAnimationFrame(raf);
   ro?.disconnect();
   controls?.dispose();
   geometry?.dispose();material?.dispose();
   if(renderer){
    renderer.dispose();
    renderer.domElement.remove();
   }
  };
 },[candidate]);
 return <div className="mt-4 rounded-2xl border border-cyan-500/30 bg-[#071923] p-3">
  <div className="flex flex-wrap justify-between gap-2">
   <strong className="text-sm text-cyan-100">Actual printable STL · interactive 3D</strong>
   <span className="text-xs text-slate-300">{candidate.widthMm} × {candidate.lengthMm} × {candidate.thicknessMm} mm</span>
  </div>
  {error?<p role="alert" className="mt-2 text-sm text-amber-200">{error} Download the STL and inspect it in your slicer instead.</p>:
   <div ref={container} className="mt-3 h-72 w-full touch-pan-y overflow-hidden rounded-xl" role="img"
    aria-label="Rotate and zoom the actual decorative mesh with a pointer or touch gesture"/>}
  <p className="mt-2 text-xs text-slate-400">Drag to orbit, scroll or pinch to zoom. This is the same mesh exported below, NOT a complete suit, tested structural part or flight hardware. Rendered on your device only.</p>
 </div>;
}
