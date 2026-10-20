(function(){
'use strict';
const $=id=>document.getElementById(id);
const S={db:null,store:null,pages:[],sources:[],page:null,rows:[],words:[],groups:[],recordMap:new Map(),itemMap:new Map(),groupByRecord:new Map(),groupByItem:new Map(),grid:new Map(),large:[],draft:[],loose:new Set(),mode:'select',filter:'all',selectedMark:'',zoom:1,tx:0,ty:0,base:null,matrix:null,showHighlights:true,loading:0,renderTask:null,pdfDocCache:new Map(),pointer:null,touches:new Map(),space:false,dirty:false,fileName:'C4-Project.c4db',fileHandle:null,ready:false,saveRevision:0,focusBBox:null,persisted:false,history:false,sql:null,pdfjs:null,resources:null,renderVersion:0,restoring:false,pointerType:'mouse',approvedItems:new Set()};
window.C4_APP=S;
const V=window.C4VectorEngine;
Object.assign(S,{vector:null,views:new Map(),extent:'drawing',colorMode:'mono',lineweights:false,pickMode:'group',selectionOperation:'toggle',selectionHistory:[],context:null,hoverId:null,viewInfo:null,layerCounts:new Map(),groupDialogState:null,classCache:new Map(),classificationTarget:null});
Object.assign(S,{pageCache:new Map(),pagePending:new Map(),sourceMap:new Map(),pageMap:new Map(),pageClassCache:new Map(),pageListKey:null,selectionRevision:0,approvedRevision:0,visibilityVersion:0,selectionOpacity:.25,inverseMatrix:null,recoveryGraph:null,recoveryWrittenRevision:null,recoveryTask:null,recoveryRequested:false,preview:null,previewPick:null,previewCapture:null,metrics:{pageParses:0,pageCacheHits:0,graphExports:0,uiOnlySaves:0,graphSaves:0}});
Object.assign(S,{selectedElements:new Set(),selectionCache:null,selectionReview:null,reviewPick:null,workflowStage:'select',boxAnchor:null,lastPointerPoint:null});
const decoder=new TextDecoder(),pad=n=>String(n).padStart(6,'0');
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
const unique=a=>[...new Set(a)],sleep=()=>new Promise(r=>setTimeout(r,0));
function notify(message,error){$('toast').textContent=message;$('toast').className='toast'+(error?' error':'');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('toast').classList.add('hidden'),error?11000:6500);}
function busy(value,text){$('loading').classList.toggle('hidden',!value);if(text)$('loadingText').textContent=text;}
function showError(e){console.error(e);notify(e.message||String(e),true);}
function unb64(b64){const s=atob(b64),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;}
async function gunzip(bytes){const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return decoder.decode(await new Response(stream).arrayBuffer());}
function sourceOf(id){return S.sourceMap.get(id)||S.sources.find(s=>s.id===id);}
function pageOf(id){return S.pageMap.get(id)||S.pages.find(p=>p.id===id);}
function sheetLabel(p){if(!p)return '';const c=p.sheet_candidates;return p.knownSheetLabel||(Array.isArray(c)&&c.length?(c[0].text||c[0]):'صفحة '+p.page_number);}
function pageTitle(p){return p.title_candidate||p.titleCandidate||sourceOf(p.source_id)?.filename||'لوحة';}
function pageTags(p){return Array.isArray(p.door_tags)?p.door_tags:[];}
function displayName(g){return g.name_ar||g.name||g.mark||'مجموعة رسم';}
function itemId(r,i){return r.record_id+':i'+pad(i);}
function groupItems(g){if(Array.isArray(g.item_ids)&&g.item_ids.length)return g.item_ids;return S.store.getRepresentationItems(g.id);}
function pageIsDoor(p){return pageTags(p).length>0||p.doorTextMatch||p.doorLayerCount>0||/\bDOORS?\b/i.test(p.search_text||'');}
function apply(m,p){return[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];}
function invert(m){const d=m[0]*m[3]-m[1]*m[2];return[m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];}
function multiply(a,b){return[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function viewportPoint(e){const r=$('viewport').getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];}
function sourcePoint(q){return apply(S.inverseMatrix||invert(S.matrix),[(q[0]-S.tx)/S.zoom,(q[1]-S.ty)/S.zoom]);}
function bounds(points){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of points){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}return[x0,y0,x1,y1];}
function commandPoints(c){if(c[0]==='re'){const b=c[1];return[[b[0],b[1]],[b[2],b[3]]];}if(c[0]==='qu')return c[1];return c.slice(1).filter(p=>Array.isArray(p)&&typeof p[0]==='number');}
function pathFor(c){const p=new Path2D();if(c[0]==='l'){p.moveTo(...c[1]);p.lineTo(...c[2]);}else if(c[0]==='c'){p.moveTo(...c[1]);p.bezierCurveTo(...c[2],...c[3],...c[4]);}else if(c[0]==='re'){const b=c[1];p.rect(b[0],b[1],b[2]-b[0],b[3]-b[1]);}else if(c[0]==='qu'){const q=c[1];p.moveTo(...q[0]);p.lineTo(...q[1]);p.lineTo(...q[3]);p.lineTo(...q[2]);p.closePath();}return p;}
function bboxContains(b,p,t){return p[0]>=b[0]-t&&p[0]<=b[2]+t&&p[1]>=b[1]-t&&p[1]<=b[3]+t;}
function bboxInside(a,b){return a[0]>=b[0]&&a[1]>=b[1]&&a[2]<=b[2]&&a[3]<=b[3];}
function overlap(a,b){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
function commandDistance(c,p){const pts=commandPoints(c);if(!pts.length)return Infinity;let segments=[];if(c[0]==='c'){let prev=c[1];for(let i=1;i<=16;i++){const t=i/16,u=1-t;const q=[u*u*u*c[1][0]+3*u*u*t*c[2][0]+3*u*t*t*c[3][0]+t*t*t*c[4][0],u*u*u*c[1][1]+3*u*u*t*c[2][1]+3*u*t*t*c[3][1]+t*t*t*c[4][1]];segments.push([prev,q]);prev=q;}}else if(c[0]==='re'){const b=c[1],q=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];segments=q.map((a,i)=>[a,q[(i+1)%4]]);}else if(c[0]==='qu'){const q=[pts[0],pts[1],pts[3],pts[2]];segments=q.map((a,i)=>[a,q[(i+1)%4]]);}else segments=[[pts[0],pts[1]||pts[0]]];let best=Infinity;for(const[a,b]of segments){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));}return best;}
function indexGeometry(rows){S.rows=[];S.recordMap.clear();S.itemMap.clear();S.grid.clear();S.large=[];for(const row of rows){const d=row.drawing;if(!['s','f','fs'].includes(d.type)||!d.items?.length)continue;row._bbox=d.rect||bounds(d.items.flatMap(commandPoints));S.rows.push(row);S.recordMap.set(row.record_id,row);if(S.vector?.queryItems)continue;const b=row._bbox,x0=Math.floor(b[0]/64),x1=Math.floor(b[2]/64),y0=Math.floor(b[1]/64),y1=Math.floor(b[3]/64);if((x1-x0+1)*(y1-y0+1)>120){S.large.push(row);continue;}for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const k=x+','+y;let a=S.grid.get(k);if(!a)S.grid.set(k,a=[]);a.push(row);}}refreshGroupMaps();}

function refreshGroupMaps(){
  if(!S.page)return;
  S.approvedRevision++;
  S.groups=S.store.listGroups(S.page.id);S.groupByRecord.clear();S.groupByItem.clear();S.approvedItems.clear();
  for(const g of S.groups){
    if(g.item_ids?.length){for(const id of g.item_ids)S.groupByItem.set(id,g);}
    else for(const rid of g.record_ids||[])S.groupByRecord.set(rid,g);
    const unit=S.store.resolveSelectionUnit(g.id);if(unit.status==='resolved')for(const id of unit.pages.find(p=>p.page_id===S.page.id)?.item_ids||[])S.approvedItems.add(id);
  }
  for(const id of S.selectedElements)if(S.store.resolveSelectionUnit?.(id).status!=='resolved')S.selectedElements.delete(id);
  S.selectionCache=null;
}
function getItem(id){let item=S.itemMap.get(id);if(item)return item;const k=id.lastIndexOf(':i');if(k<0)return null;const row=S.recordMap.get(id.slice(0,k)),ix=Number(id.slice(k+2));if(!row||!row.drawing.items[ix])return null;const command=row.drawing.items[ix];item={id,row,index:ix,command,bbox:V.commandBounds(command)};S.itemMap.set(id,item);return item;}
function viewState(){
  const id=S.page?.id||'';
  if(!S.views.has(id))S.views.set(id,{hiddenItems:new Set(),hiddenLayers:new Set(),lockedLayers:new Set(),isolatedItems:null});
  return S.views.get(id);
}
function selectable(id,row){
  const v=viewState();
  if(!row){const it=getItem(id);if(!it)return false;row=it.row;}
  const layer=row.drawing.layer||'';
  if(v.hiddenItems.has(id)||v.hiddenLayers.has(layer)||v.lockedLayers.has(layer)||(v.isolatedItems&&!v.isolatedItems.has(id)))return false;
  if($('layerFilter').value&&layer!==$('layerFilter').value)return false;
  const category=$('categoryFilter').value,department=$('departmentFilter').value;if(category||department){const c=itemClassification(id);if(category&&(category==='unclassified'?c.status==='known':c.category!==category&&!(category==='hatch'&&c.graphic_kind==='hatch')))return false;if(department&&c.section!==department)return false;}
  return !S.vector?.isItemVisible||S.vector.isItemVisible(id,true);
}
function hitsAt(p){
  if(S.vector?.queryItems){
    const tolerance=(S.pointerType==='touch'?9:5)/S.zoom,box=[p[0]-tolerance,p[1]-tolerance,p[0]+tolerance,p[1]+tolerance],hits=[];
    for(const item of S.vector.queryItems(box,{selectable:true,layer:$('layerFilter').value||undefined})){
      if(!selectable(item.id,item.row))continue;
      const distance=V.commandDistance(item.command,p,Math.max(1e-8,.15/S.zoom));
      if(distance<=tolerance)hits.push({...item,distance});
    }
    return hits.sort((a,b)=>a.distance-b.distance||(b.row.ordinal||0)-(a.row.ordinal||0));
  }
  const tolerance=(S.pointerType==='touch'?9:5)/S.zoom,candidates=new Set(S.large),hits=[];
  for(let x=Math.floor((p[0]-tolerance)/64);x<=Math.floor((p[0]+tolerance)/64);x++)for(let y=Math.floor((p[1]-tolerance)/64);y<=Math.floor((p[1]+tolerance)/64);y++)for(const r of S.grid.get(x+','+y)||[])candidates.add(r);
  for(const row of candidates){
    if(!bboxContains(row._bbox,p,tolerance))continue;
    for(let i=0;i<row.drawing.items.length;i++){
      const id=itemId(row,i);if(!selectable(id,row))continue;
      const c=row.drawing.items[i],bb=V.commandBounds(c);if(!bboxContains(bb,p,tolerance))continue;
      const d=V.commandDistance(c,p,Math.max(1e-8,.15/S.zoom));
      if(d<=tolerance)hits.push({id,row,index:i,distance:d});
    }
  }
  return hits.sort((a,b)=>a.distance-b.distance||(b.row.ordinal||0)-(a.row.ordinal||0));
}
function hitTest(p){return hitsAt(p)[0]||null;}
function transformedBox(b){return bounds([[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]].map(p=>apply(S.matrix,p)));}

function isMobile(){return matchMedia('(max-width:930px)').matches;}
function resolvedTheme(){return document.documentElement.dataset.theme==='dark'||(document.documentElement.dataset.theme==='system'&&matchMedia('(prefers-color-scheme:dark)').matches)?'dark':'light';}
function redraw(){
  if(!S.page||!S.base||!S.vector)return;
  const highlights=[],selectionColor=resolvedTheme()==='dark'?'#66b4ff':'#007fff';
  if(S.showHighlights){
    highlights.push({ids:S.approvedItems,color:resolvedTheme()==='dark'?'#55bda2':'#277762',widthCSS:1.2,opacity:.5,revision:S.approvedRevision});
    for(const unit of selectionState().units){const local=unit.pages.find(p=>p.page_id===S.page.id);if(local)highlights.push({ids:local.item_ids,color:selectionColor,widthCSS:2,opacity:.95,fillOpacity:S.selectionOpacity,revision:S.selectionRevision+':'+unit.id,role:'selection',tinyMarkers:true,entity:{id:unit.id}});}
    for(const rep of S.draft)if(rep.page_id===S.page.id)highlights.push({ids:rep.item_ids,color:selectionColor,widthCSS:1.8,opacity:.9,fillOpacity:S.selectionOpacity,revision:S.selectionRevision+':'+stagedKey(rep),role:'selection',tinyMarkers:true,entity:{id:stagedKey(rep)}});
    highlights.push({ids:S.loose,color:selectionColor,widthCSS:1.8,opacity:.95,fillOpacity:S.selectionOpacity,revision:S.selectionRevision,role:'selection',tinyMarkers:true});
    if(S.reviewPick?.page_id===S.page.id)highlights.push({ids:[S.reviewPick.item_id],color:selectionColor,widthCSS:3,opacity:1,revision:S.reviewPick.item_id,role:'selection',tinyMarkers:true});
    if(S.previewPick?.page_id===S.page.id)highlights.push({ids:[S.previewPick.item_id],color:selectionColor,widthCSS:2.2,opacity:.95,revision:S.previewPick.item_id});
    if(S.context?.hit)highlights.push({ids:[S.context.hit.id],color:selectionColor,widthCSS:2,opacity:.8,revision:S.context.hit.id});
    else if(S.hoverId){const target=selectionTarget(S.hoverId);const ids=target.kind==='element'?target.unit.pages.find(p=>p.page_id===S.page.id)?.item_ids:target.group?groupItems(target.group):target.rep?.item_ids;highlights.push({ids:ids||[S.hoverId],color:selectionColor,widthCSS:1.6,opacity:.65,revision:S.hoverId+':'+S.pickMode});}
  }
  S.vector.render({zoom:S.zoom,tx:S.tx,ty:S.ty,width:$('viewport').clientWidth,height:$('viewport').clientHeight,...viewState(),visibilityVersion:S.visibilityVersion,drawingOnly:S.extent==='drawing',theme:resolvedTheme(),colorMode:S.colorMode,colors:S.colorMode,fineLine:!S.lineweights,highlightSets:highlights,focusBBox:S.focusBBox});
  renderSelectionMetrics();
}
function transformPaper(){
  if(!S.base)return;
  const label=S.zoom>=100?Math.round(S.zoom*100).toLocaleString('en-US')+'%':(Math.round(S.zoom*1000)/10)+'%';
  $('zoomLabel').textContent=label;if($('viewZoom'))$('viewZoom').textContent=label;
  if(!transformPaper.pending)transformPaper.pending=requestAnimationFrame(()=>{transformPaper.pending=0;redraw();});
}
function viewFitBounds(b){
  const v=$('viewport'),bb=b?transformedBox(b):[0,0,S.base.width,S.base.height];
  const pad=18,top=36,bottom=isMobile()?112:28,w=Math.max(1,v.clientWidth-pad*2),h=Math.max(1,v.clientHeight-top-bottom);
  S.zoom=Math.max(.005,Math.min(4096,w/Math.max(.01,bb[2]-bb[0]),h/Math.max(.01,bb[3]-bb[1])));
  S.tx=v.clientWidth/2-(bb[0]+bb[2])/2*S.zoom;S.ty=top+h/2-(bb[1]+bb[3])/2*S.zoom;
  transformPaper();scheduleRecovery();
}
function fit(){if(!S.base)return;viewFitBounds(S.extent==='drawing'?S.viewInfo?.drawingBounds:null);}
function zoomAt(factor,x,y){
  if(!S.base)return;const nz=Math.max(.005,Math.min(4096,S.zoom*factor)),ratio=nz/S.zoom;
  S.tx=x-(x-S.tx)*ratio;S.ty=y-(y-S.ty)*ratio;S.zoom=nz;transformPaper();
}
function focusBounds(b){
  if(!b||!S.base)return;const margin=Math.max(.02,Math.max(b[2]-b[0],b[3]-b[1])*.15);
  viewFitBounds([b[0]-margin,b[1]-margin,b[2]+margin,b[3]+margin]);
}
function scheduleRender(){transformPaper();}
async function pageResource(page,kind){
  const bytes=page[kind+'_gzip'];
  if(bytes?.length)return bytes;
  if(!S.resources)throw Error('بيانات خطوط اللوحة غير موجودة.');
  return S.resources.page(page.id,kind);
}

// A small, replaceable cache of source geometry, never another editable model.
async function parseDrawingRows(raw){
  const rows=[];let start=0,count=0,lastYield=performance.now();
  while(start<raw.length){let end=raw.indexOf('\n',start);if(end<0)end=raw.length;const line=raw.slice(start,end).trim();if(line)rows.push(JSON.parse(line));start=end+1;
    if(++count%1024===0&&performance.now()-lastYield>10){await sleep();lastYield=performance.now();}
  }
  return rows;
}
async function getPagePacket(id){
  const cached=S.pageCache.get(id);
  if(cached){S.pageCache.delete(id);S.pageCache.set(id,cached);S.metrics.pageCacheHits++;return cached;}
  if(S.pagePending.has(id))return S.pagePending.get(id);
  const store=S.store,resources=S.resources;
  const work=(async()=>{
    const page=store.getPage(id);if(!page)throw Error('لم تُعثر على اللوحة داخل القاعدة.');
    const [raw,rawText]=await Promise.all([pageResource(page,'drawings').then(gunzip),pageResource(page,'text').then(gunzip)]);
    const rows=await parseDrawingRows(raw),text=JSON.parse(rawText.trim());
    if(S.store!==store)throw Error('تغيّرت قاعدة المشروع أثناء تحميل اللوحة.');
    const result={page:Object.assign({},pageOf(id),page),rows,text,sourceBytes:raw.length+rawText.length,source_sha256:sourceOf(page.source_id)?.sha256,drawings_sha256:resources?.meta.pages[id]?.drawings?.sha256};
    S.metrics.pageParses++;S.pageCache.set(id,result);
    let size=[...S.pageCache.values()].reduce((n,p)=>n+p.sourceBytes,0);
    while(S.pageCache.size>1&&(S.pageCache.size>2||size>24*1024*1024)){const key=S.pageCache.keys().next().value;size-=S.pageCache.get(key).sourceBytes;S.pageCache.delete(key);}
    return result;
  })();
  S.pagePending.set(id,work);
  try{return await work;}finally{if(S.pagePending.get(id)===work)S.pagePending.delete(id);}
}

async function openPage(id,focus){
  if(!S.store)return false;
  if(S.page?.id===id&&S.base&&$('loading').classList.contains('hidden')){if(focus){S.focusBBox=focus;focusBounds(focus);}else fit();return true;}
  if(S.loose.size&&S.page?.id!==id){stageLoose();notify('أُضيف التحديد المؤقت إلى الاختيارات قبل الانتقال.');}
  const token=++S.loading;closeContext();busy(true,'جارٍ تحميل خطوط اللوحة ونصوصها…');
  try{
    const packet=await getPagePacket(id),page=packet.page;
    if(token!==S.loading)return false;
    S.page=Object.assign({},pageOf(id),page);S.base=null;S.focusBBox=null;S.loose.clear();S.hoverId=null;S.selectionHistory=[];
    const parsed=packet.rows,t=packet.text;S.words=t.words||[];
    if(!S.vector)S.vector=new V($('drawingSvg'));
    S.viewInfo=S.vector.load({page:S.page,rows:parsed,text:t});
    S.base={width:S.viewInfo.width,height:S.viewInfo.height};S.matrix=S.viewInfo.matrix;S.inverseMatrix=invert(S.matrix);S.visibilityVersion++;
    indexGeometry(parsed);const classificationResult=S.store.applyPageClassification(page.id,parsed);clearClassificationCache();if(classificationResult.changed)setDirty(true);S.layerCounts.clear();for(const row of S.rows){const layer=row.drawing.layer||'';S.layerCounts.set(layer,(S.layerCounts.get(layer)||0)+row.drawing.items.length);}
    $('paper').classList.add('hidden');$('welcome').classList.add('hidden');$('drawingSvg').classList.remove('hidden');
    $('sheetTitle').textContent=sheetLabel(S.page)+' · '+pageTitle(S.page);$('sheetPosition').textContent='لوحة '+S.page.page_number+' / '+sourceOf(page.source_id).page_count;
    const layers=[...S.layerCounts.keys()].sort();
    $('layerFilter').innerHTML='<option value="">كل الطبقات</option>'+layers.filter(Boolean).map(l=>'<option value="'+esc(l)+'">'+esc(l)+'</option>').join('');
    $('geometryStatus').textContent=S.rows.length.toLocaleString('ar-AE')+' مسار متجهي · '+S.groups.length.toLocaleString('ar-AE')+' مجموعة';
    renderPages();renderDraft();renderLocations();renderLayers();fit();if(focus){S.focusBBox=focus;focusBounds(focus);}redraw();
    if(token===S.loading){busy(false);$('viewHint').classList.remove('hidden');setTimeout(()=>$('viewHint').classList.add('hidden'),6000);}
    scheduleRecovery();window.dispatchEvent(new CustomEvent('c4-page-ready',{detail:{pageId:id}}));return true;
  }catch(e){if(token===S.loading){busy(false);showError(e);}return false;}
}
function renderLocations(){const box=$('tagLocations');box.innerHTML='';if(!S.page)return;const tags=pageTags(S.page).filter(t=>!S.selectedMark||t.mark===S.selectedMark);if(!tags.length){box.classList.add('hidden');return;}box.classList.remove('hidden');box.append(el('span','',S.selectedMark?'مواضع '+S.selectedMark+' في اللوحة:':'رموز أبواب في اللوحة:'));tags.slice(0,70).forEach((t,i)=>{const b=el('button','',t.mark+' · '+(i+1));b.title='انتقال إلى الرمز فقط؛ لا ينشئ ربطًا';b.onclick=()=>{S.focusBBox=t.bbox;focusBounds(t.bbox);};box.append(b);});}
function filteredPages(){const q=$('pageSearch').value.trim().toUpperCase(),source=$('sourceFilter').value,chosen=new Set(selectionState().pages.keys());let pages=S.pages.filter(p=>pageMatchesDepartment(p,$('departmentFilter').value)&&(!source||p.source_id===source)&&(!q||(p.search_text||'').toUpperCase().includes(q)||sheetLabel(p).toUpperCase().includes(q)||pageTitle(p).toUpperCase().includes(q))&&(S.filter!=='doors'||pageIsDoor(p))&&(S.filter!=='selected'||chosen.has(p.id)));if(S.filter==='doors'){pages=pages.slice().sort((a,b)=>{const score=p=>(pageTags(p).some(t=>t.mark===S.selectedMark)?100:0)+(pageTags(p).length?20:0)+(/SCHEDULE|DETAIL|DOOR/i.test(pageTitle(p))?10:0);return score(b)-score(a);});}return pages;}
function renderPages(){if(!S.store)return;const key=JSON.stringify([$ ('pageSearch').value,$('sourceFilter').value,$('departmentFilter').value,S.filter,S.selectedMark,[...selectionState().pages.keys()].sort()]);if(key===S.pageListKey){for(const card of $('pagesList').querySelectorAll('[data-page-id]'))card.classList.toggle('active',card.dataset.pageId===S.page?.id);return;}S.pageListKey=key;const pages=filteredPages();$('pageCount').textContent=pages.length+' / '+S.pages.length;$('candidateNote').classList.toggle('hidden',S.filter!=='doors');$('allPages').classList.toggle('active',S.filter==='all');$('doorPages').classList.toggle('active',S.filter==='doors');$('selectedPages').classList.toggle('active',S.filter==='selected');const container=$('pagesList');const frag=document.createDocumentFragment();let previous='';for(const p of pages){if(p.source_id!==previous){previous=p.source_id;frag.append(el('div','source-divider',sourceOf(p.source_id)?.filename||''));}const btn=el('button','page-card'+(S.page?.id===p.id?' active':''));btn.dataset.pageId=p.id;const tagList=unique(pageTags(p).map(t=>t.mark));btn.innerHTML='<div class="top"><span class="sheet">'+esc(sheetLabel(p))+'</span><span class="count-pill">'+p.page_number+'</span></div><div class="title" dir="auto">'+esc(pageTitle(p))+'</div><div class="source">'+esc(sourceOf(p.source_id)?.disciplineLabel||'')+(selectionState().pages.has(p.id)?' · ضمن اختياراتك':'')+'</div>'+(tagList.length?'<div class="tags">'+tagList.slice(0,9).map(t=>'<span class="tag'+(t===S.selectedMark?' match':'')+'">'+esc(t)+'</span>').join('')+(tagList.length>9?'<span class="tag">+'+(tagList.length-9)+'</span>':'')+'</div>':'');btn.onclick=()=>{const first=S.selectedMark?pageTags(p).find(t=>t.mark===S.selectedMark):null;openPage(p.id,first?.bbox);closeMobilePanels();};frag.append(btn);}if(!pages.length)frag.append(el('div','empty-list','لا توجد لوحات تطابق التصفية. يمكنك الرجوع إلى كل اللوحات.'));container.replaceChildren(frag);}

function setMode(mode){
  S.mode=mode;['Select','Box','Pan'].forEach(m=>{const active=m.toLowerCase()===mode;for(const prefix of ['mode','quick'])if($(prefix+m)){$(prefix+m).classList.toggle('active',active);$(prefix+m).setAttribute('aria-pressed',String(active));}});
  $('viewport').style.cursor=mode==='pan'?'grab':mode==='box'?'crosshair':'default';
  $('toolStatus').textContent=mode==='pan'?'تحريك':mode==='box'?'إطار باتجاه السحب':'اختيار';
  $('viewHint').textContent=mode==='box'?'اسحب يمينًا للاحتواء الكامل أو يسارًا للتقاطع · Shift للإزالة · Esc لإلغاء التحديد':'نقرة تختار المكوّن · اسحب في الفراغ للتحديد · Option لخط منفرد · Esc للإلغاء';
  renderSelectionHUD();
}
function closeMobilePanels(){
  for(const id of ['pagesSidebar','selectionSidebar','viewToolbar'])$(id).classList.remove('mobile-open');
  document.body.classList.remove('mobile-panel-open');
  for(const id of ['togglePages','toggleSelections','mobileTools']){$(id).setAttribute('aria-expanded','false');$(id).classList.remove('active');}
  $('mobileCanvas').setAttribute('aria-pressed','true');$('mobileCanvas').classList.add('active');
}
function toggleMobilePanel(panel,button){
  const open=$(panel).classList.contains('mobile-open');closeMobilePanels();
  if(!open){$(panel).classList.add('mobile-open');document.body.classList.add('mobile-panel-open');$(button).setAttribute('aria-expanded','true');$(button).classList.add('active');$('mobileCanvas').setAttribute('aria-pressed','false');$('mobileCanvas').classList.remove('active');}
}
function applyTheme(value){
  const theme=['system','light','dark'].includes(value)?value:'system';
  document.documentElement.dataset.theme=theme;$('themeSelect').value=theme;
  try{localStorage.setItem('C4-theme',theme);}catch{}
  redraw();S.preview?.renderModel();
}
function currentItemBounds(ids){const a=[];for(const id of ids){const it=getItem(id);if(it)a.push([it.bbox[0],it.bbox[1]],[it.bbox[2],it.bbox[3]]);}return a.length?bounds(a):null;}
// Selection is a view of the existing graph. It never creates another identity.
function selectionState(){
  const key=[S.selectionRevision,S.page?.id,Number(S.store?.getMeta('revision')||0)].join(':');
  if(S.selectionCache?.key===key)return S.selectionCache;
  const units=[],pages=new Map(),local=new Set(S.loose),all=new Set(S.loose);
  const add=(pageId,ids)=>{if(!ids?.length)return;let set=pages.get(pageId);if(!set)pages.set(pageId,set=new Set());for(const id of ids){set.add(id);all.add(id);if(pageId===S.page?.id)local.add(id);}};
  if(S.page&&S.loose.size)add(S.page.id,[...S.loose]);
  for(const id of S.selectedElements||[]){const unit=S.store?.resolveSelectionUnit?.(id);if(unit?.status==='resolved'&&unit.kind==='element'){units.push(unit);for(const page of unit.pages)add(page.page_id,page.item_ids);}}
  for(const rep of S.draft)add(rep.page_id,rep.item_ids);
  S.selectionCache={key,units,pages,local,all};return S.selectionCache;
}
function selectionTarget(id,forceLine=false){
  if(forceLine||S.pickMode==='line')return{kind:'line',id,key:'line:'+id};
  const unit=S.store?.resolveSelectionUnit?.({page_id:S.page?.id,item_id:id});
  if(unit?.status==='ambiguous')return{kind:'ambiguous',id,key:'ambiguous:'+id,unit};
  if(unit?.status==='resolved'&&unit.kind==='element')return{kind:'element',id:unit.id,key:'element:'+unit.id,unit};
  const rep=S.draft.find(r=>r.page_id===S.page?.id&&r.item_ids.includes(id));
  if(rep)return{kind:'representation',id:stagedKey(rep),key:'representation:'+stagedKey(rep),rep};
  const item=getItem(id),group=S.groupByItem.get(id)||(item&&S.groupByRecord.get(item.row.record_id));
  return group?{kind:'group',id:group.id,key:'representation:'+group.id,group}:{kind:'line',id,key:'line:'+id};
}
function setElementSelection(unit,operation='toggle'){
  const selected=S.selectedElements.has(unit.id),remove=operation==='remove'||(operation==='toggle'&&selected);
  S.selectionCache=null;if(remove){S.selectedElements.delete(unit.id);return false;}
  S.selectedElements.add(unit.id);
  const ids=new Set(unit.item_ids),repIds=new Set(unit.representations.map(r=>r.id));
  S.draft=S.draft.filter(r=>!repIds.has(r.id)&&!r.item_ids.every(id=>ids.has(id)));
  for(const id of ids)S.loose.delete(id);
  S.selectionCache=null;return true;
}
function unpackSelectionForLine(id){
  if(!S.selectedElements.size&&!S.draft.length)return;
  for(const unit of selectionState().units){const local=unit.pages.find(p=>p.page_id===S.page?.id);if(local?.item_ids.includes(id)){S.selectedElements.delete(unit.id);for(const member of local.item_ids)S.loose.add(member);}}
  S.draft=S.draft.filter(rep=>{if(rep.page_id!==S.page?.id||!rep.item_ids.includes(id))return true;for(const member of rep.item_ids)S.loose.add(member);return false;});
  S.selectionCache=null;
}
function applySelectionTarget(target,operation){
  if(target.kind==='ambiguous')return false;
  if(target.kind==='element')return setElementSelection(target.unit,operation);
  if(target.group)return setKnown(target.group,operation);
  if(target.rep){const selected=S.draft.some(r=>stagedKey(r)===target.id);if(operation==='remove'||(operation==='toggle'&&selected)){S.draft=S.draft.filter(r=>stagedKey(r)!==target.id);return false;}if(!selected)S.draft.push(target.rep);return true;}
  unpackSelectionForLine(target.id);setLoose(target.id,operation);return S.loose.has(target.id);
}
function finishSelection(){S.reviewPick=null;S.selectionCache=null;renderDraft();renderPages();redraw();}
function selectTarget(target,operation=S.selectionOperation){
  if(target.kind==='ambiguous'){notify('لهذا الخط أكثر من هوية معتمدة متعارضة. راجع الروابط قبل اختيار المكوّن.',true);return;}
  rememberSelection();const added=applySelectionTarget(target,operation);
  if(target.kind==='element')showWorkflow('review');else showWorkflow('select');
  finishSelection();
  if(target.kind==='element'&&added)notify('المكوّن محدد كوحدة واحدة · '+target.unit.pages.length+' لوحات · '+target.unit.item_ids.length+' خط.');
}
function stagedKey(rep){return rep.id||rep.uiKey;}
function selectionSnapshot(){return{pageId:S.page?.id,loose:[...S.loose],selectedElements:[...S.selectedElements],draft:S.draft.map(r=>({...r,item_ids:[...r.item_ids]}))};}
function rememberSelection(){if(!S.page)return;S.selectionHistory.push(selectionSnapshot());if(S.selectionHistory.length>30)S.selectionHistory.shift();}
function undoSelection(){const old=S.selectionHistory.pop();if(!old||old.pageId!==S.page?.id)return;S.loose=new Set(old.loose);S.draft=old.draft;S.selectedElements=new Set(old.selectedElements||[]);finishSelection();}
function repForGroup(g){return{id:g.id,uiKey:g.id,page_id:g.page_id,item_ids:groupItems(g),record_ids:g.record_ids||[],name:displayName(g),mark:g.mark||null,bbox:g.bbox_points||g.bbox||currentItemBounds(groupItems(g)),source_kind:'known_group'};}
function setKnown(g,operation){
  S.selectionCache=null;
  const unit=S.store?.resolveSelectionUnit?.(g.id);if(unit?.status==='resolved'&&unit.kind==='element')return setElementSelection(unit,operation);
  if(unit?.status==='ambiguous')return false;
  const selected=S.draft.some(r=>r.id===g.id),remove=operation==='remove'||(operation==='toggle'&&selected);
  if(remove){S.draft=S.draft.filter(r=>r.id!==g.id);return false;}
  if(!selected)S.draft.push(repForGroup(g));
  for(const id of groupItems(g))S.loose.delete(id);
  return true;
}
function addKnown(g,operation){
  const unit=S.store?.resolveSelectionUnit?.(g.id);if(unit?.status==='resolved'&&unit.kind==='element'){selectTarget({kind:'element',unit,id:unit.id},operation||S.selectionOperation);return;}
  if(unit?.status==='ambiguous'){notify('لا يمكن اختيار المكوّن قبل حسم تعارض هويته.',true);return;}
  rememberSelection();const added=setKnown(g,operation||S.selectionOperation);
  if(added&&g.mark&&/^D\d+[A-Z]?$/i.test(g.mark)){S.selectedMark=g.mark;S.filter='doors';$('pageSearch').value='';$('sourceFilter').value='';renderLocations();}
  if(added&&!$('elementName').value)$('elementName').value=g.mark?'باب '+g.mark:displayName(g);
  switchSelectionTab(false);renderDraft();renderPages();redraw();
  notify(added?'المجموعة ضمن الاختيارات. يمكنك اختيار تمثيلها من لوحة أخرى.':'أُلغي تحديد المجموعة.');
}
function setLoose(id,operation){S.selectionCache=null;if(operation==='remove'||(operation==='toggle'&&S.loose.has(id)))S.loose.delete(id);else S.loose.add(id);}
function toggleLoose(id,replace){rememberSelection();if(replace)S.loose.clear();unpackSelectionForLine(id);setLoose(id,S.selectionOperation);finishSelection();}
function selectAt(q,forceLine){
  if(S.previewCapture){S.previewCapture(q);return;}
  if(!S.page)return;const hit=hitTest(sourcePoint(q));
  if(hit){const target=selectionTarget(hit.id,forceLine);
    if(target.group){addKnown(target.group);return;}
    selectTarget(target);return;
  }
  notify('لم يُلتقط خط قابل للاختيار هنا. قرّب الرسم أو استخدم الإطار.');
}
function boxSelect(start,end,options){
  if(!S.page)return 0;
  const a=sourcePoint(start),b=sourcePoint(end),rectangle=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])],crossing=end[0]<start[0];
  const operation=typeof options==='object'&&options?.operation?options.operation:S.selectionOperation;
  const fits=c=>crossing?V.commandCrossesBox(c,rectangle):V.commandInsideBox(c,rectangle);
  const targets=new Map();let ambiguous=0;
  const candidates=S.vector.queryItems(rectangle,{selectable:true,layer:$('layerFilter').value||undefined});
  for(const item of candidates){
      const {id,row,command}=item;if(!selectable(id,row)||!fits(command))continue;
      const target=selectionTarget(id);if(target.kind==='ambiguous'){ambiguous++;continue;}targets.set(target.key,target);
  }
  if(!crossing)for(const[key,target]of targets){
    if(target.kind==='line')continue;
    const ids=target.unit?target.unit.pages.find(p=>p.page_id===S.page.id)?.item_ids:target.group?groupItems(target.group):target.rep.item_ids;
    const items=(ids||[]).map(getItem).filter(it=>it&&selectable(it.id,it.row));
    if(!items.length||items.some(it=>!V.commandInsideBox(it.command,rectangle)))targets.delete(key);
  }
  if(!targets.size){notify(ambiguous?'التحديد يمر بخطوط ذات هويات متعارضة؛ راجع روابطها.':crossing?'لا يوجد خط ظاهر يقطعه الإطار.':'لا يوجد خط أو مكوّن داخل الإطار بالكامل.');return 0;}
  rememberSelection();for(const target of targets.values())applySelectionTarget(target,operation);
  finishSelection();return targets.size;
}
function stageLoose(){if(!S.loose.size)return;rememberSelection();const ids=[...S.loose].sort(),bbox=currentItemBounds(ids),name='تمثيل في '+sheetLabel(S.page);const doorLayer=ids.some(id=>/door/i.test(getItem(id)?.row.drawing.layer||''));S.draft.push({uiKey:'draft:'+crypto.randomUUID(),page_id:S.page.id,item_ids:ids,record_ids:unique(ids.map(id=>id.slice(0,id.lastIndexOf(':i')))),name,mark:null,bbox,source_kind:'manual_graphics'});if(doorLayer){S.filter='doors';$('sourceFilter').value='';}S.loose.clear();renderDraft();renderPages();redraw();notify('أُضيفت الخطوط كتمثيل مؤقت. الاعتماد يجمعه مع بقية الاختيارات.');}
async function copyText(text){try{await navigator.clipboard.writeText(text);}catch{const t=el('textarea');t.value=text;document.body.append(t);t.select();document.execCommand('copy');t.remove();}notify('نُسخ المعرّف الداخلي.');}
function renderDraft(){S.selectionRevision++;S.selectionCache=null;S.preview?.selectionChanged();renderSelectionHUD();scheduleRecovery();const n=S.draft.length;$('draftCount').textContent=n+' تمثيل';$('mobileDraftCount').textContent=n;$('looseBox').classList.toggle('hidden',!S.loose.size);$('looseCount').textContent=S.loose.size.toLocaleString('ar-AE');$('clearDraft').classList.toggle('hidden',!n);$('selectionInstruction').classList.toggle('hidden',n>0);const min=$('targetElement').value?1:2;$('commitLink').disabled=!S.store||n<min||S.loose.size>0;$('commitLink').textContent=n===1&&min===1?'اعتماد التمثيل الإضافي':n>=2?'اعتماد ربط '+n+' تمثيلات':'اعتماد الربط';const list=$('draftList');list.innerHTML='';for(const rep of S.draft){const p=pageOf(rep.page_id),card=el('div','draft-card'+(S.page?.id===rep.page_id?' current':'')),head=el('div','row between'),name=el('h3','',rep.name||rep.mark||'تمثيل عنصر'),remove=el('button','remove','×');remove.title='إزالة من الاختيارات';remove.onclick=()=>{rememberSelection();S.draft=S.draft.filter(r=>stagedKey(r)!==stagedKey(rep));renderDraft();renderPages();redraw();};head.append(name,remove);card.append(head);const where=el('button','quiet where',sheetLabel(p)+' · صفحة '+p?.page_number+' · '+(sourceOf(p?.source_id)?.disciplineLabel||''));where.style.padding='0';where.onclick=()=>openPage(rep.page_id,rep.bbox);card.append(where,el('div','meta',rep.item_ids.length.toLocaleString('ar-AE')+' أمر رسم · '+(rep.id?'مجموعة محفوظة':'تحديدك اليدوي')));if(rep.id){const idBox=el('div','id-box'),code=el('code','',rep.id),copy=el('button','','نسخ');code.title=rep.id;copy.onclick=()=>copyText(rep.id);idBox.append(code,copy);card.append(idBox);}const cls=S.store.getRepresentationClassification(rep),meta=el('div','row');meta.append(el('span','classification-badge '+(cls.status==='known'?'automatic':'unclassified'),classLabel(cls)),smallAction('تصنيف','تصنيف هذا التمثيل',()=>chooseClassification(rep)));card.append(meta);list.append(card);}refreshClassificationUI();}
function switchSelectionTab(history){S.preview?.close();S.history=history;if(history)S.workflowStage='review';else if(S.workflowStage==='review')S.workflowStage='select';$('draftTab').classList.toggle('active',!history);$('historyTab').classList.toggle('active',history);$('draftContent').classList.toggle('hidden',history);$('historyContent').classList.toggle('hidden',!history);$('commitPanel').classList.toggle('hidden',history);$('selectionHeading').textContent=history?'الروابط المعتمدة':'الاختيارات المؤقتة';if(history)renderHistory();renderWorkflow();}
function refreshTargets(){const old=$('targetElement').value,level=$('identityLevel').value,confirmed=S.store?.listConfirmed()||[],seen=new Set();$('targetElement').innerHTML='<option value="">عنصر جديد من هذه الاختيارات</option>';for(const c of confirmed){const id=c.element_id||c.canonical_element_id||c.target_id;const node=id?S.store.getNode(id):null;if(!node||seen.has(id))continue;seen.add(id);const nodeLevel=node.kind==='type'?'type':'instance';if(nodeLevel!==level)continue;const opt=el('option','',node.name_ar||node.name||id);opt.value=id;$('targetElement').append(opt);}$('targetElement').value=old;if(!$('targetElement').value)$('targetElement').value='';}
function renderHistory(){
  if(!S.store)return;const confirmations=S.store.listConfirmed(),byId=new Map();
  for(const c of confirmations){const id=c.element_id||c.canonical_element_id||c.target_id;if(!id)continue;if(!byId.has(id))byId.set(id,[]);byId.get(id).push(c);}
  $('historyCount').textContent=byId.size;$('undoLast').disabled=!confirmations.length;const list=$('historyList');list.replaceChildren();
  if(!byId.size)list.append(el('div','empty-list','تظهر هنا المكوّنات التي تعتمدها، وكل مكوّن تحت هوية واحدة.'));
  for(const [id,decisions]of [...byId].reverse()){
    const node=S.store.getNode(id),unit=S.store.resolveSelectionUnit(id),isType=node?.kind==='type',card=el('div','confirmed-card'),reps=unique(decisions.flatMap(c=>c.representation_ids||c.representations?.map(r=>r.id)||[]));
    card.append(el('strong','',node?.name_ar||node?.name||decisions[0].name||'مكوّن معتمد'),el('p','',reps.length+' تمثيلات · '+(isType?'نوع مشترك؛ العناصر مستقلة':'مكوّن واحد')+' · '+decisions.length+' اعتماد'));
    const row=el('div','row');
    if(unit.status==='resolved')row.append(smallAction('اختيار المكوّن','تحديد جميع تمثيلات هذا المكوّن',()=>{rememberSelection();setElementSelection(unit,'add');finishSelection();fitSelection();}));
    else if(unit.status==='ambiguous')card.append(el('p','warning','تعارض في هوية المكوّن؛ لا يُوسّع التحديد تلقائيًا.'));
    row.append(smallAction('إضافة تمثيل','إضافة تمثيلات إلى الهوية نفسها',()=>{$('identityLevel').value=isType?'type':'instance';refreshTargets();$('targetElement').value=id;$('elementName').value=node?.name_ar||node?.name||'';showWorkflow('link');renderDraft();}));
    card.append(row);list.append(card);
  }
  refreshTargets();
}
function setDirty(flag){S.dirty=flag;if(flag)S.persisted=false;S.preview?.invalidate();$('saveDb').disabled=!S.store;$('exportAnswers').disabled=!S.store;$('mobileExportAnswers').disabled=!S.store;const count=S.store?.listConfirmed().length||0;$('fileStatus').innerHTML='<span class="dot'+(flag?' dirty':'')+'"></span>'+(flag?'تغييرات بانتظار حفظ الملف':'قاعدة المشروع مفتوحة')+'<br>'+count+' اعتماد منك';}
function recoveryKey(){return'C4:'+S.store.getMeta('source_index')?.sha256;}
function recoveryDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('C4-working-recovery',1);req.onupgradeneeded=()=>req.result.createObjectStore('checkpoints');req.onerror=()=>reject(req.error);req.onsuccess=()=>resolve(req.result);});}
async function getRecovery(key){
  try{const db=await recoveryDb();return await new Promise((resolve,reject)=>{
    const tx=db.transaction('checkpoints','readonly'),bucket=tx.objectStore('checkpoints'),graph=bucket.get(key),ui=bucket.get(key+':ui');
    tx.oncomplete=()=>{db.close();const value=graph.result;if(value&&ui.result?.graph_revision===Number(value.revision))value.ui=ui.result.ui;resolve(value);};
    tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error||Error('انقطعت قراءة الاستئناف.'));};
  });}catch{return null;}
}

function uiCheckpoint(){return{pageId:S.page?.id||null,draft:S.draft,loose:[...S.loose],selectedElements:[...(S.selectedElements||[])],workflowStage:S.workflowStage||'select',mode:S.mode,selectedMark:S.selectedMark,filter:S.filter,name:$('elementName').value,identityLevel:$('identityLevel').value,target:$('targetElement').value,viewSettings:{extent:S.extent,colorMode:S.colorMode,lineweights:S.lineweights,pickMode:S.pickMode,selectionOperation:S.selectionOperation,department:$('departmentFilter').value,category:$('categoryFilter').value},camera:S.page?{pageId:S.page.id,zoom:S.zoom,tx:S.tx,ty:S.ty,width:$('viewport').clientWidth,height:$('viewport').clientHeight}:null,views:[...S.views].map(([id,v])=>[id,{hiddenItems:[...v.hiddenItems],hiddenLayers:[...v.hiddenLayers],lockedLayers:[...v.lockedLayers],isolatedItems:v.isolatedItems?[...v.isolatedItems]:null}])};}
function scheduleRecovery(){
  if(S.restoring||!S.store)return;
  clearTimeout(scheduleRecovery.timer);scheduleRecovery.timer=setTimeout(()=>saveRecovery(),750);
}
async function saveRecovery(){
  if(!S.store||S.restoring)return false;
  clearTimeout(scheduleRecovery.timer);
  S.recoveryRequested=true;
  if(S.recoveryTask)return S.recoveryTask;
  S.recoveryTask=(async()=>{
    let ok=true;
    while(S.recoveryRequested&&S.store&&!S.restoring){
      S.recoveryRequested=false;
      const store=S.store,key=recoveryKey(),revision=Number(store.getMeta('revision')||0),ui=uiCheckpoint(),writeGraph=revision!==S.recoveryWrittenRevision;
      let checkpoint=null;
      if(writeGraph){
        if(!S.recoveryGraph||Number(S.recoveryGraph.revision)!==revision){S.recoveryGraph=store.exportWorkingGraph();S.metrics.graphExports++;}
        checkpoint={...S.recoveryGraph,ui};
      }
      try{
        const db=await recoveryDb();await new Promise((resolve,reject)=>{
          const tx=db.transaction('checkpoints','readwrite'),bucket=tx.objectStore('checkpoints');
          if(checkpoint)bucket.put(checkpoint,key);
          bucket.put({graph_revision:revision,ui},key+':ui');
          tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error||Error('انقطع الحفظ.'));};
        });
        if(S.store===store){S.recoveryWrittenRevision=revision;S.persisted=Number(store.getMeta('revision')||0)===revision;S.metrics[writeGraph?'graphSaves':'uiOnlySaves']++;$('storageStatus').textContent='اختياراتك واعتماداتك محفوظة على هذا الجهاز · صدّر الاعتمادات لتسليمها';}
      }catch(e){ok=false;if(S.store===store){S.persisted=false;$('storageStatus').textContent='احفظ المشروع للاحتفاظ بالتغييرات';notify('تعذّر حفظ الاستئناف في المتصفح. احفظ المشروع قبل إغلاق الصفحة.',true);}break;}
    }
    return ok;
  })();
  try{return await S.recoveryTask;}finally{S.recoveryTask=null;}
}
async function commit(){
  if(S.draft.length<($('targetElement').value?1:2)||S.loose.size)return;
  const b=$('commitLink');b.disabled=true;
  try{
    const level=$('identityLevel').value,result=S.store.commitRepresentationLink(S.draft,{name:$('elementName').value.trim(),identityLevel:level,existingElementId:$('targetElement').value||undefined});
    const id=result.element?.id||result.confirmation?.element_id||$('targetElement').value;
    S.draft=[];S.loose.clear();S.selectedElements.clear();S.selectionCache=null;S.selectionHistory=[];
    if(level==='instance'&&id&&S.store.resolveSelectionUnit(id).status==='resolved')S.selectedElements.add(id);
    $('targetElement').value='';restoreVisibility(false);refreshGroupMaps();renderLayers();
    if(!result.unchanged)setDirty(true);
    renderDraft();renderHistory();renderPages();showWorkflow('review');redraw();await saveRecovery();
    notify(result.unchanged?'المطابقة معتمدة مسبقًا. المكوّن محدد كوحدة واحدة.':level==='instance'?'اعتُمد المكوّن وأصبح تحديده قروبًا واحدًا في جميع تمثيلاته.':'اعتُمد ربط النوع؛ تبقى العناصر المختلفة مستقلة.');
  }catch(e){showError(e);}finally{renderDraft();}
}
async function undo(){try{const r=S.store.undoLast();if(!r)return;setDirty(true);await saveRecovery();refreshGroupMaps();renderDraft();renderHistory();redraw();notify('أُلغي آخر اعتماد، وبقيت العلاقات السابقة محفوظة.');}catch(e){showError(e);}}
function download(data,name,type){const blob=data instanceof Blob?data:new Blob([data],{type:type||'application/octet-stream'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),120000);}
async function saveProject(){if(!S.db)return;busy(true,'جارٍ حفظ قاعدة المشروع الواحدة…');await sleep();try{const bytes=S.db.export();if(S.fileHandle){try{const writable=await S.fileHandle.createWritable();await writable.write(bytes);await writable.close();}catch(e){if(e.name==='AbortError')throw e;S.fileHandle=null;download(bytes,S.fileName);notify('حُفظت نسخة من قاعدة المشروع في التنزيلات.');}}else{download(bytes,S.fileName);notify('حُفظت قاعدة المشروع في التنزيلات. استخدم النسخة الأحدث عند الاستكمال.');}S.saveRevision=Number(S.store.getMeta('revision')||0);setDirty(false);await saveRecovery();$('storageStatus').textContent='حُفظت قاعدة المشروع · المعرّفات الحالية داخلية مؤقتة';}catch(e){showError(e);}finally{busy(false);}}
function exportAnswers(){if(!S.store)return;const report=S.store.exportAnswers();download(JSON.stringify(report,null,2),'C4-Approved-Links-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json','application/json');notify('صُدّرت اعتماداتك. ارفع ملف الإجابات إلى الوكيل لاستكمال العمل عليها.');}

async function openDatabase(file,handle){
  if(!S.ready)return false;
  if(S.recoveryTask)await S.recoveryTask;
  busy(true,'جارٍ فتح قاعدة المشروع…');S.restoring=true;clearTimeout(scheduleRecovery.timer);await sleep();
  try{
    const array=new Uint8Array(await file.arrayBuffer());if(decoder.decode(array.subarray(0,15))!=='SQLite format 3')throw Error('اختر ملف قاعدة المشروع C4-Project.c4db، وليس ملف البصمة أو JSON.');
    const db=new S.sql.Database(array),store=new window.C4Store(db),pages=store.catalog(),sources=store.getSources();
    if(!pages.length||!sources.length){db.close();throw Error('هذه القاعدة لا تحتوي لوحات C4.');}
    ++S.loading;++S.renderVersion;clearTimeout(scheduleRender.timer);
    if(S.renderTask){const old=S.renderTask;old.cancel();try{await old.promise;}catch{}S.renderTask=null;}
    if(S.db){for(const promise of S.pdfDocCache.values())promise.then(d=>d.destroy()).catch(()=>{});S.pdfDocCache.clear();S.resources?.clear();S.db.close();}
    S.db=db;S.store=store;S.pages=pages;S.sources=sources;S.fileName=file.name;S.fileHandle=handle||null;S.page=null;S.base=null;S.draft=[];S.loose.clear();S.selectedElements.clear();S.selectionCache=null;S.reviewPick=null;S.workflowStage='select';S.views.clear();S.selectionHistory=[];S.persisted=false;S.saveRevision=Number(store.getMeta('revision')||0);
    S.pageCache.clear();S.pagePending.clear();S.pageClassCache.clear();S.classCache.clear();S.pageListKey=null;S.recoveryGraph=null;S.recoveryWrittenRevision=null;S.recoveryRequested=false;S.previewPick=null;S.previewCapture=null;S.preview?.reset();
    const resources=store.getMeta('web_resources');
    S.resources=resources?new window.C4ResourceReader(resources,handle===C4_HOSTED_HANDLE?new URL('.',location.href).href:undefined):null;
    if(handle===C4_HOSTED_HANDLE)S.fileHandle=null;
    const metadataCatalog=store.getMeta('page_catalog')||[],sourceCatalog=store.getMeta('source_catalog')||[];
    S.pages=S.pages.map(p=>Object.assign({},metadataCatalog.find(m=>m.id===p.id)||{},p));S.sources=S.sources.map(s=>Object.assign({},sourceCatalog.find(m=>m.id===s.id)||{},s));
    S.pageMap=new Map(S.pages.map(p=>[p.id,p]));S.sourceMap=new Map(S.sources.map(s=>[s.id,s]));
    const backup=await getRecovery(recoveryKey());let ui=null;
    if(backup&&Number(backup.revision)>=S.saveRevision){
      try{if(Number(backup.revision)>S.saveRevision)store.restoreWorkingGraph(backup);ui=backup.ui||null;S.persisted=true;S.recoveryWrittenRevision=Number(backup.revision);if(Number(backup.revision)>S.saveRevision)notify('استُعيدت اعتماداتك المحفوظة على هذا الجهاز.');}
      catch(e){notify('توجد نسخة استئناف تعذّر تطبيقها: '+e.message,true);}
    }
    $('sourceFilter').innerHTML='<option value="">جميع الملفات</option>'+S.sources.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.filename)+'</option>').join('');
    if(ui){
      const settings=ui.viewSettings||{};
      S.extent=settings.extent==='sheet'?'sheet':'drawing';S.colorMode=settings.colorMode==='source'?'source':'mono';S.lineweights=!!settings.lineweights;S.pickMode=settings.pickMode==='line'?'line':'group';S.selectionOperation=['toggle','add','remove'].includes(settings.selectionOperation)?settings.selectionOperation:'toggle';
      for(const pair of ui.views||[]){if(!Array.isArray(pair)||!pageOf(pair[0])||!pair[1])continue;const v=pair[1];S.views.set(pair[0],{hiddenItems:new Set(v.hiddenItems||[]),hiddenLayers:new Set(v.hiddenLayers||[]),lockedLayers:new Set(v.lockedLayers||[]),isolatedItems:Array.isArray(v.isolatedItems)?new Set(v.isolatedItems):null});}
      syncViewControls();$('departmentFilter').value=settings.department||'';$('categoryFilter').value=settings.category||'';
      S.draft=Array.isArray(ui.draft)?ui.draft.filter(r=>pageOf(r.page_id)&&Array.isArray(r.item_ids)):[];
      S.selectedElements=new Set((ui.selectedElements||[]).filter(id=>store.resolveSelectionUnit(id).status==='resolved'));
      S.draft=S.draft.filter(rep=>{const unit=rep.id?store.resolveSelectionUnit(rep.id):null;if(unit?.status==='resolved'&&unit.kind==='element'){S.selectedElements.add(unit.id);return false;}return true;});
      S.workflowStage=['select','link','review'].includes(ui.workflowStage)?ui.workflowStage:'select';S.history=S.workflowStage==='review';
      S.selectedMark=ui.selectedMark||'';S.filter=['all','doors','selected'].includes(ui.filter)?ui.filter:'all';
      $('identityLevel').value=ui.identityLevel==='type'?'type':'instance';$('elementName').value=ui.name||'';
      if(['select','pan','box'].includes(ui.mode))setMode(ui.mode);
    }
    $('autoClassificationToggle').checked=store.isAutoClassificationEnabled();setDirty(Number(store.getMeta('revision')||0)>S.saveRevision);renderHistory();if(ui?.target)$('targetElement').value=ui.target;renderPages();
    const first=ui?.pageId&&pageOf(ui.pageId)?ui.pageId:store.getMeta('initial_page_id')||pages[0].id;
    const ok=await openPage(first);
    if(ui&&ok){S.loose=new Set((ui.loose||[]).filter(id=>typeof id==='string'&&getItem(id)));const c=ui.camera;if(c?.pageId===S.page.id&&[c.zoom,c.tx,c.ty,c.width,c.height].every(Number.isFinite)&&c.zoom>=.005&&c.zoom<=4096){S.zoom=c.zoom;S.tx=c.tx+($('viewport').clientWidth-c.width)/2;S.ty=c.ty+($('viewport').clientHeight-c.height)/2;transformPaper();}renderDraft();redraw();}
    switchSelectionTab(S.workflowStage==='review');renderWorkflow();S.restoring=false;scheduleRecovery();window.dispatchEvent(new Event('c4-db-ready'));return ok;
  }catch(e){S.restoring=false;busy(false);showError(e);return false;}
}
const C4_HOSTED_HANDLE={hosted:true};
async function loadHostedProject(){
  const config=window.C4_HOSTED_PROJECT;if(!config||!S.ready||loadHostedProject.active)return;
  loadHostedProject.active=true;$('welcomeOpen').disabled=true;$('engineError').classList.add('hidden');busy(true,'جارٍ تحميل فهرس المشروع…');
  try{
    const response=await fetch(new URL(config.url,document.baseURI));if(!response.ok)throw Error('تعذّر تحميل المشروع ('+response.status+').');
    let bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes[0]===31&&bytes[1]===139)bytes=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
    if(bytes.length!==config.bytes||hash!==config.sha256)throw Error('لم يكتمل تحميل فهرس المشروع. أعد المحاولة.');
    if(!await openDatabase(new File([bytes],'C4-Project.c4db'),C4_HOSTED_HANDLE))throw Error('تعذّر فتح اللوحة. تحقق من الاتصال ثم أعد المحاولة.');
  }catch(e){busy(false);$('welcome').classList.remove('hidden');$('engineError').classList.remove('hidden');$('engineError').textContent=e.message;$('welcomeOpen').textContent='إعادة فتح المشروع';}
  finally{loadHostedProject.active=false;$('welcomeOpen').disabled=false;}
}
function chooseDatabase(){if(!S.ready)return;$('dbInput').click();}

async function init(){
  try{
    const v=window.C4_VENDOR;S.sql=await initSqlJs({wasmBinary:unb64(v.sqlWasm)});
    if(!V)throw Error('محرّك الخطوط غير موجود.');
    if(!window.DecompressionStream)throw Error('يحتاج العارض متصفحًا حديثًا يدعم فتح البيانات المضغوطة.');
    S.ready=true;$('welcomeOpen').disabled=false;$('welcomeOpen').textContent=window.C4_HOSTED_PROJECT?'فتح مشروع C4':'فتح قاعدة المشروع';$('openDb').disabled=false;
    window.dispatchEvent(new Event('c4-engine-ready'));
    if(window.C4_HOSTED_PROJECT){$('welcomeSourceStep').textContent='يُفتح المشروع تلقائيًا، وتُحمّل خطوط اللوحة ونصوصها عند الحاجة.';$('welcomeFoot').textContent='اختياراتك محفوظة على هذا الجهاز. صدّر الاعتمادات لتسليمها.';await loadHostedProject();}
  }catch(e){$('engineError').classList.remove('hidden');$('engineError').textContent='تعذّر تجهيز العارض: '+e.message;$('welcomeOpen').textContent='تعذّر تجهيز العارض';console.error(e);}
}

function selectionIds(){return selectionState().local;}
function setText(id,text){const node=$(id);if(node&&node.textContent!==String(text))node.textContent=String(text);}
function selectionMeasure(includeTinyIds=false){
  const ids=selectionIds();return S.vector?.measureSelection?S.vector.measureSelection(ids,{revision:S.selectionRevision,cacheKey:'selection-hud',zoom:S.zoom,tinyThresholdCSS:6,includeTinyIds,tinyIdsLimit:200}):{total:ids.size,visible:ids.size,tiny:0,hiddenCount:0,missingCount:0,inViewport:ids.size,tinyInViewport:0,bbox:currentItemBounds(ids),tinyIds:[]};
}
function renderSelectionMetrics(){
  if(!$('selectedLineCount'))return;
  const selected=selectionState(),count=selected.all.size,stats=S.page?selectionMeasure():{tiny:0,hiddenCount:0,inViewport:0,visible:0};
  setText('selectedLineCount',count.toLocaleString('ar-AE'));setText('selectedComponentCount',selected.units.length.toLocaleString('ar-AE'));setText('selectedPageCount',selected.pages.size.toLocaleString('ar-AE'));setText('smallSelectionCount',(stats.tiny||0).toLocaleString('ar-AE'));
  const outside=Math.max(0,(stats.visible||0)-(stats.inViewport??stats.visible??0)),hidden=Math.max(0,(stats.hiddenCount||0)-(stats.lockedCount||0));
  const message=!count?'اختر جزءًا من المكوّن أو اسحب إطارًا في الفراغ.':selected.local.size.toLocaleString('ar-AE')+' خط في هذه اللوحة'+(selected.pages.size>1?' · التحديد محفوظ في '+selected.pages.size+' لوحات':'')+(hidden?' · '+hidden+' مخفي':'')+(stats.lockedCount?' · '+stats.lockedCount+' مقفل':'')+(outside?' · '+outside+' خارج الشاشة':'')+(S.draft.length?' · '+S.draft.length+' مجموعة للربط':'');
  setText('selectionSummaryMessage',message);$('selectionBar').classList.toggle('has-selection',count>0);
  for(const id of ['selectionInspect','selectionClear'])if($(id))$(id).disabled=!count;
  if($('selectionFit'))$('selectionFit').disabled=!count;
  for(const id of ['selectionIsolate','selectionHide'])if($(id))$(id).disabled=!selected.local.size;
  if($('selectionTinyReview'))$('selectionTinyReview').disabled=!stats.tiny;
}
function renderSelectionHUD(){
  if(!$('selectionHUD'))return;
  const count=selectionIds().size,groups=S.draft.filter(r=>r.page_id===S.page?.id).length;
  $('selectionHUD').classList.toggle('hidden',!S.page||(!count&&!S.selectionHistory.length));
  $('selectionCount').textContent=count.toLocaleString('ar-AE')+' خط'+(groups?' · '+groups+' مجموعة':'');
  $('selectionModeHint').textContent=(S.pickMode==='line'?'اختيار الخطوط':'اختيار المجموعات')+' · '+({toggle:'تحديد / إلغاء',add:'إضافة للتحديد',remove:'إزالة من التحديد'}[S.selectionOperation]);
  $('quickGroup').disabled=!S.loose.size;$('quickStage').disabled=!S.loose.size;
  $('quickUndoSelection').disabled=!S.selectionHistory.length;
  if($('saveLooseGroup'))$('saveLooseGroup').disabled=!S.loose.size;
  const hidden=[...S.views.values()].reduce((n,v)=>n+v.hiddenItems.size+v.hiddenLayers.size+(v.isolatedItems?1:0),0);
  $('quickShowAll').classList.toggle('hidden',!hidden);$('quickHiddenCount').textContent=hidden;
  $('hiddenCount').textContent=hidden||'0';
  if($('selectionShowAll'))$('selectionShowAll').disabled=!hidden;
  renderSelectionMetrics();renderComponentInspector();renderWorkflow();
}
function showInspector(){
  document.body.classList.remove('inspector-collapsed');syncDesktopControls();
  if(isMobile()&&!$('selectionSidebar').classList.contains('mobile-open'))toggleMobilePanel('selectionSidebar','toggleSelections');
}
function showWorkflow(stage){
  const next=['select','link','review'].includes(stage)?stage:'select';
  switchSelectionTab(next==='review');S.workflowStage=next;showInspector();renderWorkflow();
}
function renderWorkflow(){
  if(!$('workflowSelect'))return;
  for(const [id,stage]of [['workflowSelect','select'],['workflowLink','link'],['workflowReview','review']]){$(id).classList.toggle('active',S.workflowStage===stage);$(id).setAttribute('aria-pressed',String(S.workflowStage===stage));}
  if(!S.preview?.active){$('commitPanel').classList.toggle('hidden',S.workflowStage!=='link');$('selectionHeading').textContent={select:'التحديد والتجميع',link:'ربط تمثيلات المكوّن',review:'مراجعة المكوّنات'}[S.workflowStage];}
}
function renderComponentInspector(){
  const panel=$('selectedComponentInspector');if(!panel)return;
  const units=selectionState().units;panel.classList.toggle('hidden',!units.length);if(!units.length)return;
  const signature=selectionState().key+':'+S.history;if(panel.dataset.selectionKey===signature)return;panel.dataset.selectionKey=signature;
  const one=units.length===1?units[0]:null;
  setText('selectedComponentName',one?.name||units.length+' مكوّنات محددة');setText('selectedComponentIdentity',one?.id||'هويات مستقلة محفوظة');
  const meta=$('selectedComponentMeta');meta.replaceChildren();
  const rows=one?[['القسم والفئة',classLabel({status:'known',section:one.section,category:one.category})],['التمثيلات',one.representations.length+' تمثيل في '+one.pages.length+' لوحات'],['الخطوط',one.item_ids.length.toLocaleString('ar-AE')+' خط'],['الاختيار','كل التمثيلات كوحدة واحدة']]:[['المكوّنات',units.length],['الاختيار','كل مكوّن يحتفظ بهويته وروابطه']];
  for(const [label,value]of rows){const tr=el('tr');tr.append(el('th','',label),el('td','',value));meta.append(tr);}
  const list=$('selectedComponentRepresentations');list.replaceChildren();
  if(one){
    const actions=el('div','row');actions.append(smallAction('إضافة تمثيل','إضافة تمثيل إلى المكوّن المحدد',()=>beginExtendElement(one)),smallAction('المحاكي','عرض المكوّن المحدد في المحاكي',()=>S.preview?.open(one.id)));list.append(actions);
    for(const rep of one.representations){const card=el('div','component-representation'),p=pageOf(rep.page_id),btn=el('button','quiet',sheetLabel(p)+' · '+(rep.name||'تمثيل المكوّن'));btn.onclick=()=>{openPage(rep.page_id,rep.bbox||rep.bbox_points);closeMobilePanels();};card.append(btn,el('small','',rep.item_ids.length+' خط · صفحة '+p?.page_number+(rep.page_id===S.page?.id?' · اللوحة الحالية':'')));list.append(card);}
  }else for(const unit of units){const btn=el('button','quiet',unit.name+' · '+unit.pages.length+' لوحات');btn.onclick=()=>{rememberSelection();S.selectedElements=new Set([unit.id]);finishSelection();};list.append(btn);}
  if($('selectedComponentReview'))$('selectedComponentReview').onclick=()=>openSelectionReview('all');
}
function beginExtendElement(unit){
  $('identityLevel').value='instance';refreshTargets();$('targetElement').value=unit.id;$('elementName').value=unit.name||'';showWorkflow('link');renderDraft();notify('اختر تمثيلًا إضافيًا؛ ثم اضغط اعتماد لإلحاقه بهذا المكوّن.');
}
function fitSelection(){const b=selectionMeasure().bbox||currentItemBounds(selectionIds());if(b)focusBounds(b);else if(selectionState().pages.size){const first=[...selectionState().pages.keys()][0];openPage(first).then(()=>focusBounds(currentItemBounds(selectionIds())));}else fit();}
function reviewEntries(){
  const entries=[],meta=new Map();for(const unit of selectionState().units)for(const rep of unit.representations)for(const id of rep.item_ids)if(!meta.has(id))meta.set(id,{component:unit.name,representation:rep.name||'',unitId:unit.id});
  for(const rep of S.draft)for(const id of rep.item_ids)if(!meta.has(id))meta.set(id,{representation:rep.name||'مجموعة اختيار'});
  for(const [pageId,ids]of selectionState().pages)for(const id of ids){const local=pageId===S.page?.id,item=local?getItem(id):null,b=item?.bbox,tiny=!!b&&Math.max(b[2]-b[0],b[3]-b[1])*S.zoom<6,hidden=local&&item&&S.vector?.isItemVisible?!S.vector.isItemVisible(id,false):false;entries.push({id,pageId,item,tiny,hidden,...meta.get(id)});}
  return entries;
}
function openSelectionReview(filter='all'){
  if(!selectionState().all.size){notify('لا يوجد تحديد للمراجعة.');return;}
  S.selectionReview={entries:reviewEntries(),limit:100};$('selectionReviewSearch').value='';$('selectionReviewFilter').value=filter;$('selectionReviewDialog').showModal();renderSelectionReview();
}
function renderSelectionReview(){
  if(!S.selectionReview)return;const filter=$('selectionReviewFilter').value,q=$('selectionReviewSearch').value.trim().toLocaleLowerCase();
  const entries=S.selectionReview.entries.filter(e=>(filter==='all'||filter==='tiny'&&e.tiny||filter==='hidden'&&e.hidden)&&(!q||[e.id,e.component,e.representation,sheetLabel(pageOf(e.pageId)),e.item?.row.drawing.layer].filter(Boolean).join(' ').toLocaleLowerCase().includes(q)));
  const list=$('selectionReviewList');list.replaceChildren();setText('selectionReviewInfo',entries.length+' خط'+(filter==='tiny'?' أصغر من 6 بكسلات في اللوحة الحالية':filter==='hidden'?' مخفي في اللوحة الحالية':' في التحديد')+' · إزالة الاختيار لا تفك الربط');
  for(const entry of entries.slice(0,S.selectionReview.limit)){
    const row=el('div','selection-review-row'),main=el('div','selection-review-main'),actions=el('div','selection-review-actions');
    main.append(el('strong','',entry.component||entry.representation||'خط منفرد'),el('small','',sheetLabel(pageOf(entry.pageId))+' · '+(entry.item?.row.drawing.layer||'خط من المصدر')+(entry.tiny?' · صغير جدًا':'')+(entry.hidden?' · مخفي':'')),el('bdi','id-box',entry.id));
    actions.append(smallAction('تقريب','الانتقال إلى هذا الخط',async()=>{$('selectionReviewDialog').close();await openPage(entry.pageId);if(entry.hidden)restoreVisibility(false);const item=getItem(entry.id);if(item){S.reviewPick={page_id:entry.pageId,item_id:entry.id};focusBounds(item.bbox);redraw();}}),smallAction('إزالة','إزالة هذا الخط من التحديد دون فك الربط',()=>removeReviewSelection(entry)));
    row.append(main,actions);list.append(row);
  }
  if(!entries.length)list.append(el('p','empty-list','لا توجد خطوط تطابق هذه المراجعة.'));
  if(entries.length>S.selectionReview.limit){const more=el('button','quiet','عرض 100 أخرى');more.onclick=()=>{S.selectionReview.limit+=100;renderSelectionReview();};list.append(more);}
}
function removeReviewSelection(entry){
  rememberSelection();
  if(entry.unitId){S.selectedElements.delete(entry.unitId);notify('أُلغي تحديد المكوّن كاملًا. اختيار خط منفرد متاح من وضع «خط».');}
  else{S.loose.delete(entry.id);S.draft=S.draft.filter(rep=>!rep.item_ids.includes(entry.id));}
  finishSelection();S.selectionReview.entries=reviewEntries();renderSelectionReview();
}
function syncViewControls(){
  $('pickMode').value=S.pickMode;$('selectionOperation').value=S.selectionOperation;
  $('drawingExtent').value=S.extent;$('drawingColors').value=S.colorMode;
  $('toggleLineweight').setAttribute('aria-pressed',String(!S.lineweights));$('toggleLineweight').textContent=S.lineweights?'سماكات المصدر':'سماكات رفيعة';
  $('quickPickLabel').textContent=S.pickMode==='line'?'خط':'مجموعة';
  $('quickPick').setAttribute('aria-label',S.pickMode==='line'?'اختيار الخطوط؛ اضغط للتبديل إلى المجموعات':'اختيار المجموعات؛ اضغط للتبديل إلى الخطوط');
  $('quickPick').setAttribute('aria-pressed',String(S.pickMode==='group'));
  renderSelectionHUD();
}
function afterViewChange(){S.hoverId=null;S.visibilityVersion++;redraw();renderLayers();renderSelectionHUD();scheduleRecovery();}
function restoreVisibility(announce=true){
  for(const v of S.views.values()){v.hiddenItems.clear();v.hiddenLayers.clear();v.isolatedItems=null;}
  closeContext();afterViewChange();if(announce)notify('ظهر كل ما أخفيته مؤقتًا في اللوحات.');
}
function hideItems(ids){
  const v=viewState();for(const id of ids)if(getItem(id))v.hiddenItems.add(id);
  closeContext();afterViewChange();notify('أُخفي التحديد مؤقتًا. يعود بعد اعتماد الربط أو «إظهار الكل».');
}
function isolateItems(ids){
  const chosen=new Set([...ids].filter(id=>getItem(id)));if(!chosen.size)return;
  const v=viewState();v.isolatedItems=chosen;for(const id of chosen)v.hiddenItems.delete(id);
  closeContext();afterViewChange();notify('عُزل التحديد مؤقتًا. «إظهار الكل» ينهي العزل.');
}
function layerAction(layer,action){
  const v=viewState();
  if(action==='visible'){if(v.hiddenLayers.has(layer))v.hiddenLayers.delete(layer);else v.hiddenLayers.add(layer);}
  else if(action==='lock'){if(v.lockedLayers.has(layer))v.lockedLayers.delete(layer);else v.lockedLayers.add(layer);}
  else if(action==='isolate'){v.hiddenLayers=new Set([...S.layerCounts.keys()].filter(l=>l!==layer));v.isolatedItems=null;}
  afterViewChange();
}
function smallAction(text,label,fn,pressed){
  const b=el('button','small',text);b.type='button';b.title=label;b.setAttribute('aria-label',label);b.onclick=fn;
  if(pressed!=null)b.setAttribute('aria-pressed',String(pressed));return b;
}
function renderLayers(){
  if(!$('layersList')||!S.page||!$('layersDialog').open)return;
  const q=$('layerSearch').value.trim().toLocaleLowerCase(),v=viewState(),layerList=$('layersList');layerList.innerHTML='';
  let n=0;
  for(const [name,count]of [...S.layerCounts].sort((a,b)=>a[0].localeCompare(b[0]))){
    if(q&&!name.toLocaleLowerCase().includes(q))continue;
    const row=el('div','layer-row'+(v.hiddenLayers.has(name)?' is-hidden':'')+(v.lockedLayers.has(name)?' is-locked':''));
    const layerClass=S.store.getLayerClassification(S.page.id,name),catFilter=$('categoryFilter').value,depFilter=$('departmentFilter').value;if(depFilter&&layerClass.section!==depFilter)continue;if(catFilter&&(catFilter==='unclassified'?layerClass.status==='known':layerClass.category!==catFilter&&!(catFilter==='hatch'&&layerClass.graphic_kind==='hatch')))continue;
    n++;const info=el('div','layer-name'),bdi=el('bdi','',name||'بلا اسم طبقة');bdi.dir='auto';info.append(bdi,el('small','',count.toLocaleString('ar-AE')+' أمر رسم'),el('small','classification-badge',classLabel(layerClass)));
    row.append(info,
      smallAction(v.hiddenLayers.has(name)?'إظهار':'إخفاء','تبديل ظهور الطبقة '+name,()=>layerAction(name,'visible'),!v.hiddenLayers.has(name)),
      smallAction(v.lockedLayers.has(name)?'مقفل':'قفل','قفل اختيار الطبقة '+name,()=>layerAction(name,'lock'),v.lockedLayers.has(name)),
      smallAction('عزل','عزل الطبقة '+name,()=>layerAction(name,'isolate')));
    layerList.append(row);
  }
  $('layerCount').textContent=n+' / '+S.layerCounts.size;
  if(!n)layerList.append(el('div','empty-list','لا توجد طبقة بهذا الاسم.'));
  const groupList=$('groupsList');groupList.innerHTML='';let gn=0;
  for(const g of S.groups){
    const name=displayName(g);if(q&&!name.toLocaleLowerCase().includes(q)&&!g.id.toLowerCase().includes(q))continue;gn++;
    const row=el('div','group-layer-row'),info=el('div','group-layer-name'),ids=groupItems(g),unit=S.store.resolveSelectionUnit(g.id),selected=unit.status==='resolved'?S.selectedElements.has(unit.id):S.draft.some(r=>r.id===g.id);
    info.append(el('strong','',name),el('small','',ids.length.toLocaleString('ar-AE')+' خط · '+(g.user_saved_group?'محفوظة منك':'مجموعة المصدر')));
    row.append(info,smallAction(selected?'إلغاء':'اختيار','تحديد المجموعة '+name,()=>{addKnown(g);renderLayers();},selected),
      smallAction('تركيز','تقريب المجموعة '+name,()=>{focusBounds(g.bbox_points||g.bbox||currentItemBounds(ids));$('layersDialog').close();}),
      smallAction('عزل','عزل المجموعة '+name,()=>{isolateItems(ids);$('layersDialog').close();}));
    if(!g.user_saved_group)row.append(smallAction('فك آلي','إلغاء التجميع الآلي '+name,()=>{try{S.store.setDrawingGroupSuppressed(g.id,true);S.draft=S.draft.filter(r=>r.id!==g.id);classificationChanged();notify('فُك التجميع الآلي في العرض. بقيت الخطوط ومعرّفاتها محفوظة.');}catch(e){showError(e);}}));
    if(g.user_saved_group){
      row.append(smallAction('اسم','تغيير اسم المجموعة '+name,()=>openGroupDialog(g)));
      if(unit.status==='unlinked'&&!unit.type_ids?.length)row.append(smallAction('فك','فك مجموعة الخطوط '+name,()=>{
        try{S.store.dissolveDrawingGroup(g.id);S.draft=S.draft.filter(r=>r.id!==g.id);S.selectionHistory=[];refreshGroupMaps();setDirty(true);saveRecovery();renderLayers();renderDraft();redraw();notify('فُك التجميع. بقيت الخطوط الأصلية كما هي.');}catch(e){showError(e);}
      }));
    }
    groupList.append(row);
  }
  const activeIds=new Set(S.groups.map(g=>g.id));for(const g of S.store.listGroups(S.page.id,{includeSuppressed:true})){if(activeIds.has(g.id))continue;const row=el('div','group-layer-row is-hidden'),name=displayName(g),info=el('div','group-layer-name');info.append(el('strong','',name),el('small','','تجميع آلي ألغيته'));row.append(info,smallAction('استرجاع','استرجاع التجميع '+name,()=>{try{S.store.setDrawingGroupSuppressed(g.id,false);classificationChanged();notify('استُعيد التجميع الأصلي بمعرّفاته نفسها.');}catch(e){showError(e);}}));groupList.append(row);}
  $('savedGroupCount').textContent=gn+' / '+S.groups.length;
  if(!gn)groupList.append(el('div','empty-list','حدّد خطوط المكوّن ثم اضغط «حفظ مجموعة».'));
}
function openLayers(){if(!S.page)return;closeContext();closeMobilePanels();$('layersDialog').showModal();renderLayers();}
function openGroupDialog(group){
  if(!group&&!S.loose.size){notify('حدّد خطوط المكوّن أولًا.');return;}
  closeContext();S.groupDialogState=group?{renameId:group.id}:{ids:[...S.loose],pageId:S.page.id};
  $('groupName').value=group?displayName(group):$('elementName').value.trim();$('groupDialogTitle').textContent=group?'تغيير اسم المجموعة':'حفظ مجموعة للمكوّن';const groupClass=S.store.getRepresentationClassification(group?.id||{page_id:S.page.id,item_ids:[...S.loose]});$('groupClassification').textContent=classLabel(groupClass);$('groupClassification').classList.toggle('warning',groupClass.status!=='known');
  $('groupSave').textContent=group?'حفظ الاسم':'حفظ مجموعة';$('groupDialog').showModal();
  requestAnimationFrame(()=>$('groupName').focus());
}
async function saveGroup(){
  const state=S.groupDialogState,name=$('groupName').value.trim()||('مجموعة في '+sheetLabel(S.page));if(!state)return;
  if(!name){$('groupName').focus();return;}
  $('groupSave').disabled=true;
  try{
    if(state.renameId){
      const result=S.store.renameDrawingGroup(state.renameId,name);
      for(const rep of S.draft)if(rep.id===state.renameId)rep.name=displayName(result.group);
    }else{
      if(state.pageId!==S.page?.id)throw Error('ارجع إلى لوحة التحديد لحفظ المجموعة.');
      const result=S.store.createDrawingGroup({page_id:state.pageId,item_ids:state.ids,bbox:currentItemBounds(state.ids),name},{name});
      S.loose.clear();setKnown(result.group,'add');
    }
    S.selectionHistory=[];refreshGroupMaps();setDirty(true);renderDraft();renderPages();renderLayers();redraw();
    await saveRecovery();$('groupDialog').close();S.groupDialogState=null;
    notify(state.renameId?'حُفظ الاسم وبقي المعرّف نفسه.':'حُفظت مجموعة المكوّن، وأُضيفت للاختيارات لربطها من اللوحات الأخرى.');
  }catch(e){showError(e);}finally{$('groupSave').disabled=false;}
}
function closeContext(){S.context=null;if($('contextMenu'))$('contextMenu').classList.add('hidden');if(S.page)redraw();}
function contextScope(){
  if(!S.context?.hit)return new Set();const selected=selectionIds(),id=S.context.hit.id;if(selected.has(id))return selected;
  const target=selectionTarget(id);if(target.kind==='element')return new Set(target.unit.pages.find(p=>p.page_id===S.page.id)?.item_ids||[]);
  if(target.group)return new Set(groupItems(target.group));if(target.rep)return new Set(target.rep.item_ids);return new Set([id]);
}
function updateContext(){
  if(!S.context)return;const {hit,hits,index}=S.context,g=S.groupByItem.get(hit.id)||S.groupByRecord.get(hit.row.record_id),ids=contextScope();
  $('contextTitle').textContent='خط '+(index+1)+' من '+hits.length+' في موضع الضغط';
  $('contextMeta').textContent=(hit.row.drawing.layer||'بلا اسم طبقة')+'\n'+hit.id;const cls=itemClassification(hit.id);$('contextClassification').textContent=classLabel(cls);$('contextClassificationCancel').classList.toggle('hidden',!['source_evidence','automatic'].includes(cls.method));
  $('contextToggle').textContent=S.loose.has(hit.id)?'إلغاء تحديد الخط':'تحديد هذا الخط';
  $('contextGroup').textContent=g?'اختيار المجموعة: '+displayName(g):'حفظ مجموعة للمكوّن';
  $('contextHide').textContent=ids.size>1?'إخفاء المحدد ('+ids.size+') مؤقتًا':'إخفاء هذا الخط مؤقتًا';
  $('contextIsolate').textContent=ids.size>1?'عزل المحدد ('+ids.size+')':'عزل هذا الخط';
  $('contextNext').disabled=hits.length<2;$('contextNext').textContent=hits.length>1?'الخط المتداخل التالي ('+(index+1)+'/'+hits.length+')':'لا يوجد خط متداخل آخر';
  redraw();
}
function openContext(q){
  if(!S.page)return false;const hits=hitsAt(sourcePoint(q));
  if(!hits.length){notify('اضغط مطولًا على خط ظاهر لفتح خياراته.');return false;}
  S.context={q,hits,index:0,hit:hits[0]};S.hoverId=null;const menu=$('contextMenu');menu.classList.remove('hidden');updateContext();
  const r=$('viewport').getBoundingClientRect(),w=menu.offsetWidth,h=menu.offsetHeight,vv=window.visualViewport;
  const maxW=vv?.width||innerWidth,maxH=vv?.height||innerHeight;
  menu.style.left=Math.max(12,Math.min(r.left+q[0]+12,maxW-w-12))+'px';menu.style.top=Math.max(12,Math.min(r.top+q[1]+16,maxH-h-12))+'px';
  return true;
}
function clearSelection(){if(selectionState().all.size)rememberSelection();S.loose.clear();S.draft=[];S.selectedElements.clear();S.reviewPick=null;S.previewPick=null;S.focusBBox=null;S.selectionCache=null;S.boxAnchor=null;closeContext();renderDraft();renderPages();redraw();}
function wireCad(){
  for(const mode of ['Select','Box','Pan'])$('quick'+mode).onclick=()=>{closeContext();setMode(mode.toLowerCase());scheduleRecovery();};
  $('quickPick').onclick=()=>{S.pickMode=S.pickMode==='line'?'group':'line';syncViewControls();scheduleRecovery();};
  $('pickMode').onchange=e=>{S.pickMode=e.target.value;syncViewControls();scheduleRecovery();};
  $('selectionOperation').onchange=e=>{S.selectionOperation=e.target.value;renderSelectionHUD();scheduleRecovery();};
  $('drawingExtent').onchange=e=>{S.extent=e.target.value;afterViewChange();fit();};
  $('drawingColors').onchange=e=>{S.colorMode=e.target.value;afterViewChange();};
  $('toggleLineweight').onclick=()=>{S.lineweights=!S.lineweights;syncViewControls();afterViewChange();};
  $('layerFilter').onchange=()=>{renderSelectionHUD();scheduleRecovery();};
  $('quickFit').onclick=fit;$('quickLayers').onclick=openLayers;$('openLayers').onclick=openLayers;
  $('quickGroup').onclick=()=>openGroupDialog();$('saveLooseGroup').onclick=()=>openGroupDialog();$('quickStage').onclick=stageLoose;
  $('quickClear').onclick=clearSelection;$('quickUndoSelection').onclick=undoSelection;
  $('quickShowAll').onclick=()=>restoreVisibility();$('showAllObjects').onclick=()=>restoreVisibility();
  $('allLayersVisible').onclick=()=>{const v=viewState();v.hiddenLayers.clear();v.lockedLayers.clear();afterViewChange();};
  $('closeLayers').onclick=()=>$('layersDialog').close();$('layerSearch').oninput=renderLayers;
  $('groupSave').onclick=saveGroup;$('groupCancel').onclick=()=>{$('groupDialog').close();S.groupDialogState=null;};
  $('groupName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();saveGroup();}};
  $('contextClose').onclick=closeContext;
  $('contextToggle').onclick=()=>{if(!S.context)return;const id=S.context.hit.id;rememberSelection();unpackSelectionForLine(id);setLoose(id,'toggle');closeContext();finishSelection();};
  $('contextGroup').onclick=()=>{if(!S.context)return;const hit=S.context.hit,unit=S.store.resolveSelectionUnit({page_id:S.page.id,item_id:hit.id}),g=S.groupByItem.get(hit.id)||S.groupByRecord.get(hit.row.record_id);if(unit.status==='resolved'){closeContext();selectTarget({kind:'element',unit,id:unit.id});}else if(g){closeContext();addKnown(g);}else{if(!S.loose.has(hit.id)){rememberSelection();S.loose.add(hit.id);}renderDraft();openGroupDialog();}};
  $('contextHide').onclick=()=>hideItems(contextScope());$('contextIsolate').onclick=()=>isolateItems(contextScope());
  $('contextZoom').onclick=()=>{const b=currentItemBounds(contextScope());closeContext();focusBounds(b);};
  $('contextNext').onclick=()=>{if(!S.context)return;S.context.index=(S.context.index+1)%S.context.hits.length;S.context.hit=S.context.hits[S.context.index];updateContext();};
  document.addEventListener('pointerdown',e=>{if(S.context&&!$('contextMenu').contains(e.target)&&!$('viewport').contains(e.target))closeContext();});
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{if(document.documentElement.dataset.theme==='system'){redraw();S.preview?.renderModel();}});
  syncViewControls();
}

function classLabel(value){
  if(!value)return 'غير مصنف';
  if(value.status==='conflict')return 'فئات متعارضة';
  const section=C4Classification.SECTIONS.find(x=>x.id===value.section)?.label;
  const category=C4Classification.CATEGORIES.find(x=>x.id===value.category)?.label;
  const graphic=value.graphic_kind==='hatch'?'تهشير':value.graphic_kind==='annotation'?'نص أو رمز توضيحي':null;
  return [section,category||graphic||'فئة غير محسومة'].filter(Boolean).join(' · ')||'غير مصنف';
}
function itemClassification(id){
  let c=S.classCache.get(id);if(!c){c=S.store?.getItemClassification(S.page.id,id)||{status:'unknown'};S.classCache.set(id,c);}return c;
}
function classScope(){
  if(S.context?.hit)return{page_id:S.page.id,item_ids:[S.context.hit.id],bbox:currentItemBounds([S.context.hit.id])};
  return{page_id:S.page?.id,item_ids:[...selectionIds()],bbox:currentItemBounds(selectionIds())};
}
function selectionClassification(){
  if(!S.store||!S.page)return null;
  const values=selectionState().units.filter(u=>u.pages.some(p=>p.page_id===S.page.id)).map(u=>({status:'known',section:u.section,category:u.category}));
  for(const rep of S.draft)if(rep.page_id===S.page.id)values.push(S.store.getRepresentationClassification(rep));
  if(S.loose.size)values.push(S.store.getRepresentationClassification({page_id:S.page.id,item_ids:[...S.loose]}));
  return values.length?C4Classification.combine(values):null;
}
function refreshClassificationUI(){
  if(!S.store)return;
  const value=selectionClassification(),badge=$('classificationStatus');
  badge.textContent=value?classLabel(value):'';badge.classList.toggle('hidden',!value);badge.classList.toggle('warning',!!value&&value.status!=='known');
  const min=$('targetElement').value?1:2,values=S.draft.map(rep=>S.store.getRepresentationClassification(rep));
  const categories=unique(values.map(v=>v.category).filter(Boolean)),sections=unique(values.map(v=>v.section).filter(Boolean));
  const conflict=values.some(v=>v.status==='conflict')||categories.length>1||sections.length>1;
  const unresolved=values.some(v=>v.status!=='known'||!v.section||!v.category);
  const note=$('linkCompatibility');
  if(note){note.textContent=conflict?'الاختيارات من أقسام أو فئات مختلفة. لا يمكن اعتمادها كعنصر واحد.':unresolved?'صنّف الاختيارات غير المحسومة من زر «تصنيف» قبل اعتماد المطابقة.':values.length?'القسم والفئة متوافقان؛ اعتمادك يثبت أن التمثيلات للعنصر نفسه.':'';note.classList.toggle('warning',conflict||unresolved);}
  $('commitLink').disabled=!S.store||S.draft.length<min||S.loose.size>0||conflict||unresolved;
}
function clearClassificationCache(){S.classCache.clear();S.pageClassCache.clear();S.pageListKey=null;}
function classificationChanged(){
  clearClassificationCache();S.selectionHistory=[];refreshGroupMaps();setDirty(true);$('autoClassificationToggle').checked=S.store.isAutoClassificationEnabled();renderDraft();renderLayers();renderPages();redraw();saveRecovery();
}
function chooseClassification(selection){
  const chosen=selection||classScope();if(!chosen?.page_id||!chosen.item_ids?.length&&!chosen.id)return;
  const value=S.store.getRepresentationClassification(chosen);S.classificationTarget=chosen;closeContext();
  $('classificationDepartment').value=value.section||'';populateClassificationCategories(value.category);
  $('classificationTitle').textContent='تصنيف الاختيار';$('classificationDialog').showModal();
}
function populateClassificationCategories(category){
  const section=$('classificationDepartment').value;
  $('classificationCategory').innerHTML='<option value="">اختر الفئة</option>'+C4Classification.categoriesFor(section).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.label)+'</option>').join('');
  if(category)$('classificationCategory').value=category;
}
function saveClassification(){
  const target=S.classificationTarget,section=$('classificationDepartment').value,category=$('classificationCategory').value;
  if(!target||!section||!category){notify('اختر القسم والفئة لحفظ تصنيفك.');return;}
  try{S.store.setRepresentationClassification(target,{section,category});$('classificationDialog').close();S.classificationTarget=null;classificationChanged();notify('حُفظ التصنيف باختيارك، مع إبقاء مرجع الخطوط.');}catch(e){showError(e);}
}
function cancelContextClassification(){
  if(!S.context?.hit)return;
  try{S.store.cancelAutoClassification({page_id:S.page.id,item_id:S.context.hit.id});closeContext();classificationChanged();notify('أُلغي التصنيف الآلي لهذا الخط، وبقي غير محسوم.');}catch(e){showError(e);}
}
function pageMatchesDepartment(page,department){
  if(!department)return true;
  let value=S.pageClassCache.get(page.id);if(!value){value=S.store.getPageClassification(page.id);S.pageClassCache.set(page.id,value);}
  return value.sections.includes(department)||value.source_section===department;
}
function wireClassification(){
  const departments=C4Classification.SECTIONS.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.label)+'</option>').join('');
  $('departmentFilter').innerHTML='<option value="">جميع الأقسام</option>'+departments;
  $('classificationDepartment').innerHTML='<option value="">اختر القسم</option>'+departments;
  $('categoryFilter').innerHTML='<option value="">كل فئات الاختيار</option>'+C4Classification.CATEGORIES.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.label)+'</option>').join('')+'<option value="unclassified">غير محسوم</option>';
  $('departmentFilter').onchange=()=>{renderPages();renderLayers();renderSelectionHUD();scheduleRecovery();};
  $('categoryFilter').onchange=()=>{renderLayers();renderSelectionHUD();scheduleRecovery();};
  $('classificationDepartment').onchange=()=>populateClassificationCategories();
  $('classificationSave').onclick=saveClassification;$('classificationCancel').onclick=()=>{$('classificationDialog').close();S.classificationTarget=null;};
  $('contextClassify').onclick=()=>chooseClassification();$('contextClassificationCancel').onclick=cancelContextClassification;
  $('autoClassificationToggle').onchange=e=>{
    try{S.store.setAutoClassificationEnabled(e.target.checked);classificationChanged();notify(e.target.checked?'فُعّل التصنيف المبني على شواهد الطبقات.':'أُوقف التصنيف الآلي. تبقى تصنيفاتك اليدوية محفوظة.');}catch(error){showError(error);}
  };
}

function syncDesktopControls(){
  for(const [id,cls]of [['togglePagesDesktop','pages-collapsed'],['toggleInspectorDesktop','inspector-collapsed']])$(id).setAttribute('aria-expanded',String(!document.body.classList.contains(cls)));
}
function workflowCommands(){return[
  {id:'select',label:'اختيار المكوّن',description:'اختيار القروب كاملًا أو الخط حسب وضع الاختيار',keys:'V · 1',run:()=>setMode('select')},
  {id:'box',label:'تحديد بإطار',description:'يسار إلى يمين: احتواء كامل؛ الاتجاه الآخر: تقاطع',keys:'B · 2',run:()=>setMode('box')},
  {id:'pan',label:'تحريك الرسم',description:'أو اضغط المسافة واسحب',keys:'H · 3',run:()=>setMode('pan')},
  {id:'pick',label:'تبديل اختيار المكوّن والخط',description:'تغيير أسلوب التحديد مع بقاء الروابط محفوظة',keys:'Ctrl+H',run:()=>{S.pickMode=S.pickMode==='group'?'line':'group';syncViewControls();redraw();scheduleRecovery();}},
  {id:'group',label:'حفظ قروب للمكوّن',description:'اجمع الخطوط المحددة في مجموعة محفوظة داخل اللوحة',keys:'G',enabled:()=>S.loose.size>0,run:()=>openGroupDialog()},
  {id:'stage',label:'إضافة التحديد إلى الربط',description:'تمثيل مؤقت يمكن جمعه مع تمثيلات من لوحات أخرى',keys:'Enter',enabled:()=>S.loose.size>0,run:()=>{stageLoose();showWorkflow('link');}},
  {id:'fit-selection',label:'تقريب التحديد',description:'إظهار جميع أجزاء التحديد الحالي في مساحة الرسم',keys:'F',enabled:()=>selectionState().all.size>0,run:fitSelection},
  {id:'fit-drawing',label:'ملاءمة الرسم كاملًا',description:'العودة إلى حدود المخطط',keys:'Home',run:fit},
  {id:'review',label:'مراجعة التحديد',description:'قائمة الخطوط واللوحات مع التقريب والإزالة من التحديد',keys:'R',enabled:()=>selectionState().all.size>0,run:()=>openSelectionReview('all')},
  {id:'tiny',label:'مراجعة الأجزاء الصغيرة',description:'راجع الخطوط المحددة الأصغر من 6 بكسلات على الشاشة',keys:'Shift+R',enabled:()=>!!S.page&&selectionMeasure().tiny>0,run:()=>openSelectionReview('tiny')},
  {id:'isolate',label:'عزل التحديد',description:'إظهار خطوط التحديد وحدها مؤقتًا',keys:'I',enabled:()=>selectionIds().size>0,run:()=>isolateItems(selectionIds())},
  {id:'hide',label:'إخفاء التحديد',description:'إخفاء مؤقت دون حذف أي خط',keys:'Shift+H',enabled:()=>selectionIds().size>0,run:()=>hideItems(selectionIds())},
  {id:'show-all',label:'إظهار الجميع وإنهاء العزل',description:'إعادة كل ما أُخفي مؤقتًا',keys:'Shift+I',run:()=>restoreVisibility()},
  {id:'layers',label:'الطبقات والمجموعات',description:'ظهور الطبقات وقفلها وتصنيفها ومجموعاتها',keys:'L',run:openLayers},
  {id:'overlap',label:'الخطوط المتداخلة تحت المؤشر',description:'اختر الخط المقصود بالأسهم ثم Enter',keys:'C',enabled:()=>!!S.lastPointerPoint,run:()=>openContext(S.lastPointerPoint)},
  {id:'link-workflow',label:'ربط تمثيلات المكوّن',description:'راجع الاختيارات ثم اعتمد هويتها المشتركة',keys:'',run:()=>showWorkflow('link')},
  {id:'commit',label:'اعتماد الربط',description:'يعمل بعد اكتمال الاختيارات وتوافق القسم والفئة',keys:'⌘/Ctrl+Enter',enabled:()=>S.workflowStage==='link'&&!$('commitLink').disabled,run:commit},
  {id:'history',label:'مراجعة المكوّنات المعتمدة',description:'هويات المكوّنات وتمثيلاتها المحفوظة',keys:'',run:()=>showWorkflow('review')},
  {id:'preview',label:'محاكي المكوّن',description:'تصور من الخطوط والمواضع المعتمدة',keys:'M',run:()=>S.preview?.open(selectionState().units.length===1?selectionState().units[0].id:undefined)},
  {id:'undo-selection',label:'تراجع عن التحديد',description:'استرجاع التحديد السابق؛ لا يلغي اعتماد الربط',keys:'⌘/Ctrl+Z',enabled:()=>S.selectionHistory.length>0,run:undoSelection},
  {id:'clear',label:'إلغاء التحديد كاملًا',description:'يلغي الاختيار عبر اللوحات وتبقى القروبات والروابط',keys:'Esc',enabled:()=>selectionState().all.size>0,run:clearSelection},
  {id:'save',label:'حفظ المشروع',description:'حفظ القاعدة بكل المجموعات والاعتمادات',keys:'⌘/Ctrl+S',enabled:()=>!!S.store,run:saveProject},
  {id:'pages',label:'إظهار أو طي قائمة اللوحات',description:'مساحة إضافية للرسم',keys:'',run:()=>isMobile()?toggleMobilePanel('pagesSidebar','togglePages'):$('togglePagesDesktop').click()},
  {id:'inspector',label:'إظهار أو طي المفتش',description:'التحديد والربط والمراجعة',keys:'',run:()=>isMobile()?toggleMobilePanel('selectionSidebar','toggleSelections'):$('toggleInspectorDesktop').click()},
  {id:'shortcuts',label:'اختصارات لوحة المفاتيح',description:'دليل الاختصارات المتاحة لهذا العارض',keys:'?',run:openShortcuts}
];}
function commandEnabled(command){return command.id==='shortcuts'||(!!S.page&&(!command.enabled||command.enabled()));}
function executeCommand(id){const command=workflowCommands().find(c=>c.id===id);if(!command||!commandEnabled(command))return false;if($('commandPalette').open)$('commandPalette').close();try{const value=command.run();if(value?.catch)value.catch(showError);}catch(error){showError(error);}return true;}
function renderCommands(){
  const q=$('commandSearch').value.trim().toLocaleLowerCase(),items=workflowCommands().filter(c=>!q||(c.label+' '+c.description+' '+c.keys+' '+c.id).toLocaleLowerCase().includes(q)),list=$('commandResults');list.replaceChildren();
  for(const item of items){const b=el('button','command-item'),text=el('span');b.type='button';b.disabled=!commandEnabled(item);b.dataset.commandId=item.id;text.append(el('strong','',item.label),el('small','',item.description));b.append(text,el('kbd','',item.keys));b.onclick=()=>executeCommand(item.id);list.append(b);}
  $('commandEmpty').classList.toggle('hidden',!!items.length);
}
function openCommandPalette(){closeContext();$('commandSearch').value='';$('commandPalette').showModal();renderCommands();$('commandSearch').focus();}
function openShortcuts(){
  const list=$('shortcutsList');list.replaceChildren();
  for(const item of workflowCommands().filter(c=>c.keys)){const row=el('div','shortcut-row');row.append(el('span','',item.label),el('kbd','',item.keys));list.append(row);}
  for(const [label,keys]of [['البحث في الأوامر','⌘/Ctrl+K'],['إزالة من التحديد عند النقر أو الإطار','Shift'],['اختيار خط داخل قروب مؤقتًا','Option / Alt'],['تحريك مؤقت للرسم','Space + سحب']]){const row=el('div','shortcut-row');row.append(el('span','',label),el('kbd','',keys));list.append(row);}
  $('shortcutsHelp').showModal();
}
function cancelInteractionAndSelection(){
  clearTimeout(S.pointer?.longTimer);S.pointer=null;S.touches.clear();S.space=false;S.boxAnchor=null;$('selectionBox').classList.add('hidden');
  for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  if(S.preview?.active){S.preview.close();switchSelectionTab(false);}S.preview?.cancelCapture();S.groupDialogState=null;S.classificationTarget=null;
  $('desktopViewSettings').open=false;closeMobilePanels();clearSelection();setMode('select');scheduleRecovery();
}
function handleWorkflowKey(e){
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancelInteractionAndSelection();return;}
  if(e.defaultPrevented||e.isComposing||e.repeat)return;
  const writing=e.target.closest?.('input,textarea,select,[contenteditable="true"]'),code=e.code||'',modified=e.metaKey||e.ctrlKey;
  if($('commandPalette').open){
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){const options=[...$('commandResults').querySelectorAll('button:not([disabled])')];if(options.length){e.preventDefault();const i=options.indexOf(document.activeElement),down=e.key==='ArrowDown',next=i<0?(down?0:options.length-1):(i+(down?1:-1)+options.length)%options.length;options[next].focus();}return;}
    if(e.key==='Enter'&&e.target===$('commandSearch')){e.preventDefault();$('commandResults').querySelector('button:not([disabled])')?.click();}return;
  }
  if(document.querySelector('dialog[open]'))return;
  if(writing)return;
  if(S.context&&['ArrowDown','ArrowUp','Enter'].includes(e.key)){e.preventDefault();if(e.key==='Enter'){const target=selectionTarget(S.context.hit.id,e.altKey);closeContext();selectTarget(target);}else{S.context.index=(S.context.index+(e.key==='ArrowDown'?1:-1)+S.context.hits.length)%S.context.hits.length;S.context.hit=S.context.hits[S.context.index];updateContext();}return;}
  if(modified&&code==='KeyK'){e.preventDefault();openCommandPalette();return;}
  if(e.ctrlKey&&!e.metaKey&&code==='KeyH'){e.preventDefault();executeCommand('pick');return;}
  if(modified){const id=code==='KeyS'?'save':code==='KeyZ'?'undo-selection':code==='KeyG'?'group':code==='Enter'?'commit':null;if(id){e.preventDefault();executeCommand(id);}return;}
  if(S.preview?.active&&e.target.closest?.('#componentPreviewPanel'))return;
  if(code==='Space'){if(!e.target.closest?.('button,a,summary')){S.space=true;e.preventDefault();$('viewport').style.cursor='grab';}return;}
  if(e.altKey)return;
  const id=code==='KeyV'||code==='Digit1'?'select':code==='KeyB'||code==='Digit2'?'box':code==='KeyH'?e.shiftKey?'hide':'pan':code==='Digit3'?'pan':code==='KeyG'?'group':code==='KeyF'?'fit-selection':code==='Home'?'fit-drawing':code==='KeyR'?e.shiftKey?'tiny':'review':code==='KeyI'?e.shiftKey?'show-all':'isolate':code==='KeyL'?'layers':code==='KeyC'?'overlap':code==='KeyM'?'preview':code==='Enter'&&!e.target.closest?.('button,a,summary')?'stage':e.key==='?'||code==='Slash'&&e.shiftKey?'shortcuts':null;
  if(id){e.preventDefault();if(id==='fit-selection'&&!selectionState().all.size)fit();else executeCommand(id);}
}
function wireWorkflow(){
  for(const [id,action]of [['selectionFit','fit-selection'],['selectionInspect','review'],['selectionTinyReview','tiny'],['selectionIsolate','isolate'],['selectionHide','hide'],['selectionShowAll','show-all'],['selectionClear','clear']])$(id).onclick=()=>executeCommand(action);
  for(const [id,stage]of [['workflowSelect','select'],['workflowLink','link'],['workflowReview','review']])$(id).onclick=()=>showWorkflow(stage);
  $('openCommandPalette').onclick=openCommandPalette;$('closeCommandPalette').onclick=()=>$('commandPalette').close();$('commandSearch').oninput=renderCommands;
  $('openShortcuts').onclick=openShortcuts;$('closeShortcuts').onclick=()=>$('shortcutsHelp').close();
  $('closeSelectionReview').onclick=()=>$('selectionReviewDialog').close();$('selectionReviewSearch').oninput=()=>{S.selectionReview.limit=100;renderSelectionReview();};$('selectionReviewFilter').onchange=()=>{S.selectionReview.limit=100;renderSelectionReview();};
  if($('selectionReviewShowAll'))$('selectionReviewShowAll').onclick=()=>{restoreVisibility();S.selectionReview.entries=reviewEntries();renderSelectionReview();};
  const hints={modeSelect:'اختيار · V',modeBox:'إطار · B',modePan:'تحريك · H',quickGroup:'حفظ قروب · G',selectionFit:'تقريب التحديد · F',selectionInspect:'مراجعة التحديد · R',selectionTinyReview:'مراجعة الصغير · Shift+R',selectionIsolate:'عزل · I',selectionHide:'إخفاء · Shift+H',selectionShowAll:'إظهار الجميع · Shift+I',selectionClear:'إلغاء التحديد كاملًا · Esc',openLayers:'طبقات · L',openCommandPalette:'الأوامر · ⌘/Ctrl+K',pickMode:'قروب / خط · Ctrl+H'};
  for(const [id,title]of Object.entries(hints))if($(id))$(id).title=title;
  $('viewport').tabIndex=0;document.addEventListener('keydown',handleWorkflowKey,true);
}
function wireDesktop(){
  let preferences={};try{preferences=JSON.parse(localStorage.getItem('C4-desktop-view')||'{}');}catch{}
  S.navigationDevice=['mouse','trackpad'].includes(preferences.device)?preferences.device:'auto';S.zoomSpeed=Number.isFinite(preferences.zoomSpeed)?Math.max(10,Math.min(70,preferences.zoomSpeed)):35;
  S.selectionOpacity=Number.isFinite(preferences.opacity)?Math.max(.1,Math.min(.7,preferences.opacity)):.25;
  if(preferences.pagesCollapsed)document.body.classList.add('pages-collapsed');if(preferences.inspectorCollapsed)document.body.classList.add('inspector-collapsed');
  const save=()=>{try{localStorage.setItem('C4-desktop-view',JSON.stringify({device:S.navigationDevice,zoomSpeed:S.zoomSpeed,opacity:S.selectionOpacity,pagesCollapsed:document.body.classList.contains('pages-collapsed'),inspectorCollapsed:document.body.classList.contains('inspector-collapsed')}));}catch{}scheduleRecovery();};
  for(const[id,cls]of [['togglePagesDesktop','pages-collapsed'],['toggleInspectorDesktop','inspector-collapsed']])$(id).onclick=()=>{document.body.classList.toggle(cls);syncDesktopControls();save();};
  const settings=$('desktopViewSettings').querySelector('.advanced-settings');
  const inputLabel=el('label','control-label','أداة التنقل'),device=el('select');device.id='navigationDevice';device.setAttribute('aria-label','أداة التنقل');
  for(const[value,label]of [['auto','تلقائي'],['trackpad','تراكباد الماك'],['mouse','ماوس بعجلة']])device.add(new Option(label,value));device.value=S.navigationDevice;inputLabel.append(device);settings.append(inputLabel);
  const speedLabel=el('label','control-label','سرعة التقريب'),speed=el('input');speed.id='navigationSpeed';speed.type='range';speed.min='10';speed.max='70';speed.value=String(S.zoomSpeed);speed.setAttribute('aria-label','سرعة التقريب');speedLabel.append(speed);settings.append(speedLabel);
  device.onchange=()=>{S.navigationDevice=device.value;S.preview?.renderModel();save();};speed.oninput=()=>{S.zoomSpeed=Number(speed.value);save();};
  const opacity=$('selectionOpacity'),updateOpacity=()=>{S.selectionOpacity=Number(opacity.value)/100;$('selectionOpacityValue').value=opacity.value+'٪';document.documentElement.style.setProperty('--selection-area-opacity',String(S.selectionOpacity));S.selectionRevision++;redraw();};opacity.value=String(S.selectionOpacity*100);updateOpacity();opacity.oninput=()=>{updateOpacity();save();};
  document.addEventListener('pointerdown',e=>{const details=$('desktopViewSettings');if(details.open&&!details.contains(e.target))details.open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')$('desktopViewSettings').open=false;});syncDesktopControls();
}
function createPreviewController(){
  return new window.C4ComponentPreviewController(S,{getPagePacket,openPage,sourcePoint,sourceOf,pageOf,sheetLabel,pageTitle,notify,showError,getItem,focusBounds,currentItemBounds,refreshGroupMaps,setDirty,renderDraft,renderHistory,redraw,saveRecovery,switchSelectionTab,isMobile,closeMobilePanels,toggleMobilePanel,resolvedTheme,setMode,syncDesktopControls});
}

function wire(){
  $('openDb').onclick=chooseDatabase;$('welcomeOpen').onclick=()=>window.C4_HOSTED_PROJECT?loadHostedProject():chooseDatabase();
  $('dbInput').onchange=e=>{const file=e.target.files[0];if(file)openDatabase(file,null);e.target.value='';};
  $('saveDb').onclick=saveProject;$('exportAnswers').onclick=exportAnswers;$('mobileExportAnswers').onclick=()=>{exportAnswers();closeMobilePanels();};
  $('helpButton').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();
  for(const mode of ['Select','Box','Pan'])$('mode'+mode).onclick=()=>{setMode(mode.toLowerCase());closeMobilePanels();scheduleRecovery();};
  $('toggleHighlights').onclick=()=>{S.showHighlights=!S.showHighlights;$('toggleHighlights').textContent=S.showHighlights?'التحديد ظاهر':'التحديد مخفي';$('toggleHighlights').setAttribute('aria-pressed',String(S.showHighlights));redraw();};
  $('fitPage').onclick=()=>{fit();closeMobilePanels();};
  $('zoomIn').onclick=()=>zoomAt(1.3,$('viewport').clientWidth/2,$('viewport').clientHeight/2);
  $('zoomOut').onclick=()=>zoomAt(1/1.3,$('viewport').clientWidth/2,$('viewport').clientHeight/2);
  $('pageSearch').oninput=()=>{clearTimeout(wire.searchTimer);wire.searchTimer=setTimeout(renderPages,140);};$('sourceFilter').onchange=renderPages;
  for(const[id,mode]of [['allPages','all'],['doorPages','doors'],['selectedPages','selected']])$(id).onclick=()=>{S.filter=mode;renderPages();scheduleRecovery();};
  $('stageLoose').onclick=stageLoose;$('clearLoose').onclick=()=>{rememberSelection();S.loose.clear();renderDraft();redraw();};
  $('clearDraft').onclick=()=>{rememberSelection();S.draft=[];renderDraft();renderPages();redraw();};
  $('draftTab').onclick=()=>showWorkflow('select');$('historyTab').onclick=()=>showWorkflow('review');
  $('identityLevel').onchange=()=>{refreshTargets();renderDraft();};$('targetElement').onchange=renderDraft;$('elementName').oninput=scheduleRecovery;
  $('commitLink').onclick=commit;$('undoLast').onclick=undo;
  $('togglePages').onclick=()=>toggleMobilePanel('pagesSidebar','togglePages');
  $('toggleSelections').onclick=()=>toggleMobilePanel('selectionSidebar','toggleSelections');
  $('mobileTools').onclick=()=>toggleMobilePanel('viewToolbar','mobileTools');
  for(const id of ['mobileCanvas','mobileBackdrop','closePages','closeSelections','closeTools'])$(id).onclick=closeMobilePanels;
  let theme='system';try{theme=localStorage.getItem('C4-theme')||theme;}catch{}applyTheme(theme);$('themeSelect').onchange=e=>applyTheme(e.target.value);
  wireCad();wireClassification();wireDesktop();wireWorkflow();setMode('select');closeMobilePanels();
  S.preview=createPreviewController();
  $('openComponentPreview').onclick=()=>executeCommand('preview');
  const viewport=$('viewport');
viewport.addEventListener('wheel',e=>{
    if(!S.page||!S.base||e.target.closest('button,select,input'))return;e.preventDefault();closeContext();const q=viewportPoint(e),multiplier=e.deltaMode===1?16:e.deltaMode===2?viewport.clientHeight:1;
    const wheel=S.navigationDevice==='mouse'||(S.navigationDevice!=='trackpad'&&(e.deltaMode!==0||(!e.deltaX&&Number.isInteger(e.deltaY)&&Math.abs(e.deltaY)>=50)));
    if(e.ctrlKey||e.metaKey||wheel)zoomAt(Math.exp(Math.max(-.7,Math.min(.7,-e.deltaY*multiplier*((e.ctrlKey||e.metaKey) ? .008 : .0018)*(S.zoomSpeed/35)))),q[0],q[1]);
    else if(e.shiftKey){S.tx-=e.deltaY*multiplier;transformPaper();}
    else{S.tx-=e.deltaX*multiplier;S.ty-=e.deltaY*multiplier;transformPaper();}
    scheduleRecovery();
  },{passive:false});
  viewport.addEventListener('pointerdown',e=>{
    if(!S.page||!S.base||!$('loading').classList.contains('hidden')||e.button===2||e.target.closest('button,select,input,nav,[role="menu"],.cad-dock,.selection-hud,.view-scale'))return;
    if(S.context)closeContext();
    const q=viewportPoint(e);S.lastPointerPoint=q;viewport.focus({preventScroll:true});S.pointerType=e.pointerType;S.touches.set(e.pointerId,q);viewport.setPointerCapture(e.pointerId);S.hoverId=null;
    if(S.touches.size>=2){
      clearTimeout(S.pointer?.longTimer);const t=[...S.touches.values()];
      S.pointer={pinch:true,distance:Math.max(1,Math.hypot(t[1][0]-t[0][0],t[1][1]-t[0][1])),center:[(t[0][0]+t[1][0])/2,(t[0][1]+t[1][1])/2]};
      $('selectionBox').classList.add('hidden');return;
    }
    const p=S.pointer={id:e.pointerId,start:q,last:q,tx:S.tx,ty:S.ty,moved:false,pan:S.mode==='pan'||S.space||e.button===1,box:S.mode==='box'||(S.mode==='select'&&e.pointerType!=='touch'&&!S.space&&e.button!==1&&!S.previewCapture&&!hitTest(sourcePoint(q))),operation:e.shiftKey?'remove':S.selectionOperation,force:e.altKey,touch:e.pointerType==='touch'};
    if(p.box){const b=$('selectionBox');b.className='selection-box window';b.dataset.mode='window';b.dataset.label='داخل بالكامل';b.style.left=q[0]+'px';b.style.top=q[1]+'px';b.style.width='0';b.style.height='0';}
    if(p.touch&&!S.previewCapture)p.longTimer=setTimeout(()=>{if(S.pointer===p&&!p.moved){p.handled=true;$('selectionBox').classList.add('hidden');openContext(p.start);}},480);
  });
  viewport.addEventListener('pointermove',e=>{
    if(e.target.closest('button,select,input')&&!S.pointer)return;
    const q=viewportPoint(e);S.lastPointerPoint=q;if(S.touches.has(e.pointerId))S.touches.set(e.pointerId,q);const p=S.pointer;
    if(!p){
      if(S.page&&e.pointerType==='mouse'&&!S.context){
        S.pointerType='mouse';clearTimeout(wire.hoverTimer);wire.hoverTimer=setTimeout(()=>{const id=hitTest(sourcePoint(q))?.id||null;if(id!==S.hoverId){S.hoverId=id;redraw();}},60);
      }
      return;
    }
    if(p.pinch&&S.touches.size>=2){
      const t=[...S.touches.values()],center=[(t[0][0]+t[1][0])/2,(t[0][1]+t[1][1])/2],distance=Math.max(1,Math.hypot(t[1][0]-t[0][0],t[1][1]-t[0][1]));
      S.tx+=center[0]-p.center[0];S.ty+=center[1]-p.center[1];zoomAt(distance/p.distance,center[0],center[1]);p.center=center;p.distance=distance;return;
    }
    if(p.pinch||e.pointerId!==p.id||p.handled)return;
    const dx=q[0]-p.start[0],dy=q[1]-p.start[1];
    if(Math.hypot(dx,dy)>(p.touch?7:3)){p.moved=true;clearTimeout(p.longTimer);}p.last=q;
    if(p.pan||(p.touch&&p.moved&&!p.box)){S.tx=p.tx+dx;S.ty=p.ty+dy;transformPaper();}
    else if(p.box){
      const b=$('selectionBox'),crossing=dx<0;b.classList.toggle('crossing',crossing);b.classList.toggle('window',!crossing);b.dataset.mode=crossing?'crossing':'window';b.dataset.label=crossing?'أي تقاطع':'داخل بالكامل';
      b.style.left=Math.min(q[0],p.start[0])+'px';b.style.top=Math.min(q[1],p.start[1])+'px';b.style.width=Math.abs(dx)+'px';b.style.height=Math.abs(dy)+'px';
    }
  });
  const end=e=>{
    const p=S.pointer;S.touches.delete(e.pointerId);if(!p)return;clearTimeout(p.longTimer);
    if(p.pinch){
      if(S.touches.size>=2){const t=[...S.touches.values()];p.center=[(t[0][0]+t[1][0])/2,(t[0][1]+t[1][1])/2];p.distance=Math.max(1,Math.hypot(t[1][0]-t[0][0],t[1][1]-t[0][1]));}
      else if(!S.touches.size){S.pointer=null;scheduleRecovery();}
      return;
    }
    if(e.pointerId!==p.id)return;S.pointer=null;$('selectionBox').classList.add('hidden');
    if(e.type==='pointercancel'||p.handled)return;
    if(p.box&&p.moved)boxSelect(p.start,p.last,{operation:p.operation});
    else if(!p.pan&&!p.moved){const previous=S.selectionOperation;S.selectionOperation=p.operation;selectAt(p.start,p.force);S.selectionOperation=previous;}
    scheduleRecovery();
  };
  viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);
  viewport.addEventListener('contextmenu',e=>{e.preventDefault();if(!e.target.closest('button,select,input')){S.pointerType=e.pointerType||'mouse';openContext(viewportPoint(e));}});
  viewport.addEventListener('pointerleave',()=>{clearTimeout(wire.hoverTimer);if(S.hoverId){S.hoverId=null;redraw();}});
  document.addEventListener('keyup',e=>{if(e.code==='Space'){S.space=false;setMode(S.mode);}});
  window.addEventListener('blur',()=>{S.space=false;clearTimeout(S.pointer?.longTimer);S.pointer=null;S.touches.clear();$('selectionBox').classList.add('hidden');});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveRecovery();});
  window.addEventListener('pagehide',()=>saveRecovery());
  window.addEventListener('beforeunload',e=>{if(S.dirty&&!S.persisted){e.preventDefault();e.returnValue='';}});
  let resizeTimer,lastSize=[viewport.clientWidth,viewport.clientHeight];
  new ResizeObserver(()=>{
    clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{
      const now=[viewport.clientWidth,viewport.clientHeight];
      if(S.base&&!S.pointer){S.tx+=(now[0]-lastSize[0])/2;S.ty+=(now[1]-lastSize[1])/2;transformPaper();scheduleRender();}
      lastSize=now;if(!matchMedia('(max-width:930px)').matches)closeMobilePanels();
    },180);
  }).observe(viewport);
  let drag=0;
  document.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();drag++;document.body.classList.add('drop-active');}});
  document.addEventListener('dragleave',()=>{if(--drag<=0)document.body.classList.remove('drop-active');});
  document.addEventListener('dragover',e=>e.preventDefault());
  document.addEventListener('drop',e=>{e.preventDefault();drag=0;document.body.classList.remove('drop-active');const file=e.dataTransfer.files[0];if(file)openDatabase(file,null);});
}
window.C4_ACTIONS={openDatabase,openPage,addKnown,selectionState,selectionTarget,selectionIds,setElementSelection,clearSelection,cancelInteractionAndSelection,handleWorkflowKey,executeCommand,showWorkflow,openSelectionReview,removeReviewSelection,selectionMeasure,stageLoose,commit,saveProject,exportAnswers,selectAt,boxSelect,fit,focusBounds,zoomAt,getItem,renderDraft,redraw,setMode,undo,undoSelection,openContext,closeContext,saveGroup,restoreVisibility,renderLayers,viewState,hitTest,hitsAt,selectable,hideItems,isolateItems,syncViewControls,saveRecovery,getPagePacket,parseDrawingRows};
wire();init();
})();
