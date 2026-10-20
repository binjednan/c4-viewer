/* Approved source geometry only. Native drawing coordinates are never a world frame. */
(function (global) {
  'use strict';
  const VERSION='c4.approved-component-model.v1', EPS=1e-8;
  const PLANES={XY:{u:[1,0,0],v:[0,1,0],normal:[0,0,1]},XZ:{u:[1,0,0],v:[0,0,1],normal:[0,1,0]},YZ:{u:[0,1,0],v:[0,0,1],normal:[1,0,0]}};
  const finite=v=>typeof v==='number' && Number.isFinite(v);
  const point=(p,n)=>Array.isArray(p) && p.length===n && p.every(finite);
  const same=(a,b)=>a.length===b.length && a.every((v,i)=>Math.abs(v-b[i])<=EPS);
  const clone=v=>JSON.parse(JSON.stringify(v));
  const unique=v=>[...new Set(v || [])];
  function validateFrame(mapping) {
    const m=mapping || {},errors=[],missing=[];
    const field=(key,test,message)=>{if(m[key]===null || m[key]===undefined || m[key]==='')missing.push(key);else if(!test(m[key]))errors.push({field:key,message});};
    field('plane',v=>Object.prototype.hasOwnProperty.call(PLANES,v),'Plane must be XY, XZ, or YZ.');
    field('sourceOrigin',v=>point(v,2),'Source origin requires two finite native coordinates.');
    field('worldOrigin',v=>point(v,3),'World origin requires all three finite coordinates in metres.');
    field('metersPerSourceUnit',v=>finite(v) && v>0,'Scale must be a finite positive metres/source-unit value.');
    field('rotationDeg',finite,'In-plane rotation must be explicitly supplied in degrees.');
    field('uSign',v=>v===1 || v===-1,'U direction must be explicitly +1 or -1.');
    field('vSign',v=>v===1 || v===-1,'V direction must be explicitly +1 or -1.');
    const depthRequested=m.depthMeters!==null && m.depthMeters!==undefined && m.depthMeters!=='';
    const depthErrors=[];
    if(depthRequested) {
      if(!finite(m.depthMeters) || m.depthMeters<=0)depthErrors.push('depthMeters');
      if(m.depthApproved!==true)depthErrors.push('depthApproved');
      if(typeof m.depthReference!=='string' || !m.depthReference.trim())depthErrors.push('depthReference');
      if(m.depthDirection!==1 && m.depthDirection!==-1)depthErrors.push('depthDirection');
    }
    const valid=!missing.length && !errors.length;
    return {valid,complete:valid,missing,errors,extrusion:{requested:depthRequested,valid:valid && depthRequested && !depthErrors.length,missing_or_invalid:depthErrors},coordinate_convention:'Native drawing coordinates; explicit source signs, in-plane rotation, scale and world origin. PDF page rotation is not a world transform.'};
  }
  function suggestOrientation(page) {
    const title=String(page?.title_candidate || page?.title || page?.drawing_title || '').trim();
    const plan=/\bPLAN(?:S)?\b|مسقط|مخطط\s+(?:الدور|الطابق|السطح|الأساس)/i.test(title);
    const vertical=/\b(?:ELEVATION(?:S)?|SECTION(?:S)?)\b|واجهة|واجهات|مقطع|قطاع/i.test(title);
    const ambiguous=/\b(?:DETAIL(?:S)?|SCHEDULE(?:S)?|DIAGRAM(?:S)?|ISOMETRIC|AXONOMETRIC)\b|تفصيل|تفاصيل|جدول|جداول|ايزومتري/i.test(title);
    const result={status:'unresolved',orientation:null,suggested_plane:null,source_title:title,method:'unambiguous_source_title_only',placement_approved:false,reason:'The title does not establish one source-view orientation.'};
    if(ambiguous || (plan && vertical))return {...result,reason:'A detail, schedule, diagram or mixed-view title does not establish the selected component view.'};
    if(plan)return {...result,status:'suggested',orientation:'horizontal',suggested_plane:'XY',reason:'Unambiguous plan title; scale, origin, elevation and alignment still require explicit approval.'};
    if(vertical)return {...result,status:'suggested',orientation:'vertical',reason:'Unambiguous section/elevation title; XZ versus YZ, scale and world placement remain unresolved.'};
    return result;
  }
  function transformPoint(p,m) {
    if(!point(p,2))throw new Error('A source point needs two finite coordinates.');
    const validation=validateFrame(m);if(!validation.valid){const e=new Error('Incomplete or invalid approved drawing frame.');e.code='INVALID_FRAME';e.details=validation;throw e;}
    return transformedPoint(p,m);
  }
  function transformedPoint(p,m) {
    const basis=PLANES[m.plane],t=m.rotationDeg*Math.PI/180,c=Math.cos(t),s=Math.sin(t);
    const u=(p[0]-m.sourceOrigin[0])*m.metersPerSourceUnit*m.uSign,v=(p[1]-m.sourceOrigin[1])*m.metersPerSourceUnit*m.vSign;
    const a=c*u-s*v,b=s*u+c*v;
    return m.worldOrigin.map((origin,i)=>origin+a*basis.u[i]+b*basis.v[i]);
  }
  const wireMap=(wire,fn)=>({...wire,points:wire.points.map(fn)});
  const faceMap=(face,fn)=>({...face,contours:face.contours.map(c=>({...c,edges:c.edges.map(w=>wireMap(w,fn))}))});
  function commandWires(command,meta) {
    if(!Array.isArray(command))return null;
    const kind=command[0];
    if(kind==='l' && point(command[1],2) && point(command[2],2))return [{...meta,kind:'line',points:[command[1].slice(),command[2].slice()]}];
    if(kind==='c' && command.slice(1).length===4 && command.slice(1).every(p=>point(p,2)))return [{...meta,kind:'cubic',points:command.slice(1).map(p=>p.slice())}];
    let points;
    if(kind==='re' && point(command[1],4)){
      const [x0,y0,x1,y1]=command[1];points=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];if(command[2]===-1)points.reverse();
    }else if(kind==='qu' && Array.isArray(command[1]) && command[1].length===4 && command[1].every(p=>point(p,2))){points=[0,1,3,2].map(i=>command[1][i].slice());}
    if(!points)return null;
    return points.map((p,i)=>({...meta,kind:'line',points:[p,points[(i+1)%4]],source_command:kind,render_edge_index:i,source_closed:true}));
  }
  // A face may use native closure only when every command in the source record was approved.
  function closedProfile(row,wiresByIndex,meta) {
    const d=row.drawing || {},commands=d.items || [],contours=[];let current=[];
    const finish=(allowClose)=>{
      if(!current.length)return true;
      const first=current[0].points[0],last=current[current.length-1].points.at(-1);
      if(!same(first,last)){
        if(!allowClose)return false;
        current.push({...meta,kind:'line',points:[last.slice(),first.slice()],item_id:current.at(-1).item_id,source_item_ids:unique(current.map(w=>w.item_id)),derivation:'source_close_path',source_close_path:true});
      }
      contours.push({closed:true,edges:current});current=[];return true;
    };
    for(let i=0;i<commands.length;i++) {
      const edges=wiresByIndex.get(i);if(!edges?.length)return {reason:'unsupported_profile_command'};
      if(commands[i][0]==='re' || commands[i][0]==='qu'){
        if(!finish(false))return {reason:'open_source_subpath'};
        contours.push({closed:true,edges});continue;
      }
      if(current.length && !same(current.at(-1).points.at(-1),edges[0].points[0]))if(!finish(false))return {reason:'open_source_subpath'};
      current.push(...edges);
    }
    if(!finish(d.closePath===true))return {reason:'open_source_profile'};
    if(!contours.length)return {reason:'empty_source_profile'};
    // Native winding and even-odd rules preserve holes instead of flattening contours.
    return {face:{...meta,contours,fillRule:d.even_odd===true?'evenodd':'nonzero',source_item_ids:unique([...wiresByIndex.values()].flat().map(w=>w.item_id)),planar:true,source_profile:true,source_paint_type:d.type,physical_surface_asserted:false,solid:false}};
  }
  function rectFromClip(row) {
    const commands=row.drawing?.items || [];if(commands.length!==1 || !['re','qu'].includes(commands[0][0]))return null;
    const edges=commandWires(commands[0],{});if(!edges)return null;
    const pts=edges.map(w=>w.points[0]),xs=unique(pts.map(p=>p[0])),ys=unique(pts.map(p=>p[1]));
    if(xs.length!==2 || ys.length!==2 || edges.some(w=>Math.abs(w.points[0][0]-w.points[1][0])>EPS && Math.abs(w.points[0][1]-w.points[1][1])>EPS))return null;
    return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  }
  function clippingStatus(wires,clips) {
    for(const clip of clips){const rect=clip.rect;if(!rect)return 'unsupported_source_clip';
      // Cubic curves lie in the convex hull of their control points; this containment test is conservative.
      if(wires.some(w=>w.points.some(p=>p[0]<rect[0]-EPS || p[0]>rect[2]+EPS || p[1]<rect[1]-EPS || p[1]>rect[3]+EPS)))return 'source_clipping_required';
    }return null;
  }
  function pageRecords(packet) {
    const rows=Array.isArray(packet?.rows)?packet.rows:[],records=new Map(),stack=[];
    for(const row of rows){const d=row.drawing || {},level=Number.isFinite(d.level)?d.level:0;while(stack.length && stack.at(-1).level>=level)stack.pop();
      if(d.type==='group' || d.type==='clip'){stack.push({level,kind:d.type,record_id:row.record_id,rect:d.type==='clip'?rectFromClip(row):null});continue;}
      const explicitClips=Array.isArray(row.source_clip_records)?row.source_clip_records.map(clip=>({kind:'clip',record_id:clip.record_id,rect:rectFromClip(clip)})):null;
      records.set(row.record_id,{row,clips:explicitClips || stack.filter(s=>s.kind==='clip')});
    }return records;
  }
  // Calculate clip scope before dropping unrelated paint records: a skipped paint record may end a scope.
  function selectApprovedRows(rows,itemIds) {
    const wanted=new Set((itemIds || []).map(id=>String(id).replace(/:i\d+$/,''))),selected=[],stack=[];
    for(const row of rows || []){const d=row.drawing || {},level=Number.isFinite(d.level)?d.level:0;while(stack.length && stack.at(-1).level>=level)stack.pop();
      if(d.type==='group' || d.type==='clip'){stack.push({level,row});continue;}
      if(wanted.has(row.record_id))selected.push({...row,source_clip_records:stack.filter(s=>s.row.drawing.type==='clip').map(s=>s.row)});
    }return selected;
  }
  function signedArea(vertices){let sum=0;for(let i=0;i<vertices.length;i++){const a=vertices[i],b=vertices[(i+1)%vertices.length];sum+=a[0]*b[1]-b[0]*a[1];}return sum/2;}
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  function onSegment(a,b,p){return Math.abs(cross(a,b,p))<=EPS && p[0]>=Math.min(a[0],b[0])-EPS && p[0]<=Math.max(a[0],b[0])+EPS && p[1]>=Math.min(a[1],b[1])-EPS && p[1]<=Math.max(a[1],b[1])+EPS;}
  function intersects(a,b,c,d){const x=cross(a,b,c),y=cross(a,b,d),z=cross(c,d,a),w=cross(c,d,b);return (x*y<0 && z*w<0) || onSegment(a,b,c) || onSegment(a,b,d) || onSegment(c,d,a) || onSegment(c,d,b);}
  function inside(p,polygon){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
  function extrusionBoundaries(face) {
    const contours=face.contours;
    if(contours.some(c=>c.edges.some(e=>e.kind!=='line')))return {reason:'curved_profile_extrusion_not_supported'};
    if(contours.reduce((sum,c)=>sum+c.edges.length,0)>512)return {reason:'complex_profile_extrusion_deferred'};
    const polygons=contours.map(c=>c.edges.map(e=>e.points[0]));
    if(polygons.some(p=>p.length<3 || Math.abs(signedArea(p))<=EPS || p.some((a,i)=>same(a,p[(i+1)%p.length]))))return {reason:'degenerate_source_profile'};
    // Refuse touching/intersecting profiles; do not guess whether they are holes or islands.
    for(let a=0;a<polygons.length;a++)for(let b=a;b<polygons.length;b++){
      const p=polygons[a],q=polygons[b];for(let i=0;i<p.length;i++)for(let j=0;j<q.length;j++){
        if(a===b && (i===j || (i+1)%p.length===j || (j+1)%p.length===i))continue;
        if(intersects(p[i],p[(i+1)%p.length],q[j],q[(j+1)%q.length]))return {reason:'intersecting_or_touching_source_contours'};
      }
    }
    const areas=polygons.map(signedArea),active=[];
    for(let i=0;i<polygons.length;i++){
      const containers=polygons.map((p,j)=>j!==i && inside(polygons[i][0],p)?j:-1).filter(j=>j>=0);
      const outsideFilled=face.fillRule==='evenodd' ? containers.length%2===1 : containers.reduce((sum,j)=>sum+Math.sign(areas[j]),0)!==0;
      const insideFilled=face.fillRule==='evenodd' ? !outsideFilled : (containers.reduce((sum,j)=>sum+Math.sign(areas[j]),0)+Math.sign(areas[i]))!==0;
      if(outsideFilled!==insideFilled)active.push(i);
    }
    return {indices:active};
  }
  function extrude(face,m,context,includeFaces) {
    const boundary=extrusionBoundaries(face);if(boundary.reason)return {status:'unresolved',reason:boundary.reason,wires:[],faces:[],...context};
    const shift=PLANES[m.plane].normal.map(n=>n*m.depthMeters*m.depthDirection),base=faceMap(face,p=>transformedPoint(p,m)),top=faceMap(base,p=>p.map((v,i)=>v+shift[i]));
    const meta={...context,derivation:'owner_approved_depth_extrusion',depth_meters:m.depthMeters,depth_direction:m.depthDirection,depth_reference:m.depthReference,physical_assembly_asserted:false,engineering_validated:false};
    const wires=[],faces=[];
    if(includeFaces){faces.push({...base,...meta,profile_role:'base_cap',solid_boundary:true},{...top,...meta,profile_role:'top_cap',solid_boundary:true});}
    for(const index of boundary.indices){const edges=base.contours[index].edges;
      for(let i=0;i<edges.length;i++){
        const edge=edges[i],a=edge.points[0],b=edge.points[1],at=a.map((v,j)=>v+shift[j]),bt=b.map((v,j)=>v+shift[j]);
        const topEdge={...edge,...meta,kind:'line',points:[at,bt],source_item_ids:edge.source_item_ids || [edge.item_id],profile_role:'top_edge'};
        const vertical={...edge,...meta,kind:'line',points:[a,at],source_item_ids:edge.source_item_ids || [edge.item_id],profile_role:'depth_edge'};
        wires.push(topEdge,vertical);
        if(includeFaces){const corners=[a,b,bt,at],sideEdges=corners.map((p,j)=>({...edge,...meta,kind:'line',points:[p,corners[(j+1)%4]]}));faces.push({...meta,contours:[{closed:true,edges:sideEdges}],fillRule:'nonzero',source_item_ids:edge.source_item_ids || [edge.item_id],planar:true,solid_boundary:true,profile_role:'side_face'});}
      }
    }
    return {...meta,status:'approved',wires,faces,boundary_contours:boundary.indices,holes_preserved:true};
  }
  function frameState(rep,elementId) {
    const placement=rep.placement || {},validation=validateFrame(placement.mapping),context=placement.approval_context || {},reasons=[];
    if(placement.status!=='approved')reasons.push('placement_'+(placement.status || 'unresolved'));
    if(!validation.valid)reasons.push(...validation.missing.map(f=>'missing_'+f),...validation.errors.map(e=>'invalid_'+e.field));
    if(context.element_id!==elementId || context.representation_id!==rep.id || context.page_id!==rep.page_id || context.source_id!==rep.source_id || context.source_sha256!==rep.source_sha256 || (rep.drawings_sha256 && context.drawings_sha256!==rep.drawings_sha256) || context.approval_signature!==rep.approval_signature)reasons.push('placement_evidence_mismatch');
    if(JSON.stringify(unique(context.item_ids).sort())!==JSON.stringify(unique(rep.item_ids).sort()))reasons.push('placement_membership_mismatch');
    if(!(context.decision_ids || []).some(id=>(rep.approved_decision_ids || []).includes(id)))reasons.push('placement_approval_inactive');
    return {valid:!reasons.length,reasons:unique(reasons),validation};
  }
  function boundsFor(wires,dimensions=3){let min=Array(dimensions).fill(Infinity),max=Array(dimensions).fill(-Infinity),count=0;for(const w of wires)for(const p of w.points){if(!point(p,dimensions))continue;count++;p.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});}return count?{min,max}:null;}
  function build({component,pages,includeFaces=false,includeExtrusion=false}={}) {
    const elementId=component?.element_id || component?.id || null,result={schema:VERSION,element_id:elementId,unit:'m',wires:[],faces:[],extrusions:[],sourceViews:[],unresolved:[],issues:[],bounds:null,engineering_validated:false};
    if(!component || component.approved!==true || !elementId){result.issues.push({code:'component_not_approved',message:'Only a component with active owner geometry/identity approval can be inspected.'});return result;}
    const cache=new Map();
    for(const rep of component.representations || []){
      const meta={representation_id:rep.id,page_id:rep.page_id,element_id:elementId},view={...meta,name:rep.name || rep.name_ar || rep.id,orientation:rep.orientation || {status:'unresolved'},unit:'native_source_unit',wires:[],faces:[],issues:[],status:'unresolved',source_id:rep.source_id,source_sha256:rep.source_sha256};
      result.sourceViews.push(view);
      const issue=(code,extra={})=>{const entry={...meta,code,...extra};view.issues.push(entry);result.issues.push(entry);return entry;};
      if(rep.approved!==true || !(rep.approved_decision_ids || []).length || !rep.approval_signature){issue('representation_not_approved');continue;}
      const packet=pages instanceof Map?pages.get(rep.page_id):pages?.[rep.page_id];
      if(!packet){issue('source_page_not_loaded');result.unresolved.push({...meta,reasons:['source_page_not_loaded']});continue;}
      const loadedPage=packet.page || {};
      if(loadedPage.id!==rep.page_id || (loadedPage.source_id && loadedPage.source_id!==rep.source_id) || !rep.source_sha256 || packet.source_sha256!==rep.source_sha256 || (rep.drawings_sha256 && rep.drawings_sha256!==packet.drawings_sha256)){
        issue('source_evidence_mismatch',{message:'Loaded source page/hash does not match the approved source snapshot.'});view.status='source_mismatch';result.unresolved.push({...meta,reasons:['source_evidence_mismatch']});continue;
      }
      if(!cache.has(rep.page_id))cache.set(rep.page_id,pageRecords(packet));const records=cache.get(rep.page_id),approved=new Set(rep.item_ids || []),byRecord=new Map(),profiles=[];
      for(const id of approved){const match=String(id).match(/^(.*:r\d+):i(\d+)$/);if(!match || !id.startsWith(rep.page_id+':r')){issue('invalid_approved_item_id',{item_id:id});continue;}if(!byRecord.has(match[1]))byRecord.set(match[1],[]);byRecord.get(match[1]).push({id,index:Number(match[2])});}
      for(const [recordId,selected] of byRecord){const record=records.get(recordId);if(!record){issue('source_record_missing',{record_id:recordId,item_ids:selected.map(i=>i.id)});continue;}
        const d=record.row.drawing || {},commands=d.items || [],wiresByIndex=new Map(),recordWires=[],profileMeta={...meta,record_id:recordId,source_sha256:rep.source_sha256};let unsafe=false;
        for(const selectedItem of selected){const edges=commandWires(commands[selectedItem.index],{...profileMeta,item_id:selectedItem.id,source_item_ids:[selectedItem.id],source_command_index:selectedItem.index});
          if(!edges){issue('source_command_missing_or_unsupported',{record_id:recordId,item_id:selectedItem.id});unsafe=true;continue;}
          const clipped=clippingStatus(edges,record.clips);
          if(clipped){issue(clipped,{record_id:recordId,item_id:selectedItem.id,clip_record_ids:record.clips.map(c=>c.record_id)});unsafe=true;continue;}
          wiresByIndex.set(selectedItem.index,edges);recordWires.push(...edges);
        }
        view.wires.push(...recordWires);
        if(!unsafe && commands.length && wiresByIndex.size===commands.length){const profile=closedProfile(record.row,wiresByIndex,profileMeta);
          if(profile.face){profiles.push(profile.face);const implied=profile.face.contours.flatMap(c=>c.edges).filter(e=>e.source_close_path);view.wires.push(...implied);if(includeFaces)view.faces.push(profile.face);}
          else if(includeFaces || includeExtrusion)issue(profile.reason,{record_id:recordId,severity:'profile_only'});
        }else if((includeFaces || includeExtrusion) && commands.length>wiresByIndex.size)issue('partial_record_has_no_approved_face',{record_id:recordId,severity:'profile_only'});
      }
      view.bounds=boundsFor(view.wires,2);view.status=view.issues.some(i=>i.severity!=='profile_only')?'source_partial':'approved_source_2d';
      const state=frameState(rep,elementId);view.placement_status=rep.placement?.status || 'incomplete';
      if(!state.valid){result.unresolved.push({...meta,reasons:state.reasons,orientation:view.orientation});continue;}
      const m=rep.placement.mapping,placementMeta={placement_id:rep.placement.id,placement_approved:true,approval_signature:rep.approval_signature};
      result.wires.push(...view.wires.map(w=>({...wireMap(w,p=>transformedPoint(p,m)),...placementMeta})));
      if(includeFaces)result.faces.push(...profiles.map(f=>({...faceMap(f,p=>transformedPoint(p,m)),...placementMeta,profile_role:'source_plane'})));
      if(includeExtrusion && state.validation.extrusion.requested){
        if(!state.validation.extrusion.valid){issue('depth_not_explicitly_approved',{missing_or_invalid:state.validation.extrusion.missing_or_invalid});result.extrusions.push({...meta,status:'unresolved',reason:'depth_not_explicitly_approved'});}
        else if(!profiles.length){issue('no_explicit_closed_profile_for_extrusion');result.extrusions.push({...meta,status:'unresolved',reason:'no_explicit_closed_profile_for_extrusion'});}
        else for(const profile of profiles){const output=extrude(profile,m,{...meta,...placementMeta,record_id:profile.record_id,source_item_ids:profile.source_item_ids},includeFaces);result.extrusions.push({...output,wires:undefined,faces:undefined});result.wires.push(...output.wires);if(includeFaces){if(output.status==='approved'){const baseIndex=result.faces.findIndex(f=>f.representation_id===rep.id && f.record_id===profile.record_id && f.profile_role==='source_plane');if(baseIndex>=0)result.faces.splice(baseIndex,1);}result.faces.push(...output.faces);}if(output.reason)issue(output.reason,{record_id:profile.record_id,severity:'extrusion_only'});}
      }
    }
    result.bounds=boundsFor(result.wires);return result;
  }
  const api={VERSION,PLANES,validateFrame,suggestOrientation,transformPoint,selectApprovedRows,build};
  global.C4ComponentModel=api;if(typeof module!=='undefined' && module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
