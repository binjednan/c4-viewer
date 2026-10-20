(function(global){
'use strict';
const NS='http://www.w3.org/2000/svg';
const EPS=1e-8;
const I=[1,0,0,1,0,0];
const node=(name,attrs={})=>{const n=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))if(v!=null)n.setAttribute(k,String(v));return n;};
const nfmt=x=>Number.isFinite(x)?String(Math.round(x*1e7)/1e7):'0';
const point=p=>nfmt(p[0])+' '+nfmt(p[1]);
const same=(a,b)=>a&&b&&Math.abs(a[0]-b[0])<EPS&&Math.abs(a[1]-b[1])<EPS;
const inside=(p,b,t=0)=>p[0]>=b[0]-t&&p[0]<=b[2]+t&&p[1]>=b[1]-t&&p[1]<=b[3]+t;
const overlap=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const contained=(a,b)=>a[0]>=b[0]-EPS&&a[1]>=b[1]-EPS&&a[2]<=b[2]+EPS&&a[3]<=b[3]+EPS;
const intersect=(a,b)=>[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];
const union=(a,b)=>!a?b.slice():[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])];
const valid=b=>b&&b.every(Number.isFinite)&&b[0]<=b[2]&&b[1]<=b[3];
const apply=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
const inv=m=>{const d=m[0]*m[3]-m[1]*m[2];return[m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d];};
const transformBox=(b,m)=>{let r=null;for(const p of [[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]]){const q=apply(m,p);r=union(r,[q[0],q[1],q[0],q[1]]);}return r;};
const idFor=(r,i)=>r.record_id+':i'+String(i).padStart(6,'0');
function points(c){if(c[0]==='re'){const b=c[1];return[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];}if(c[0]==='qu')return[c[1][0],c[1][1],c[1][3],c[1][2]];return c.slice(1).filter(p=>Array.isArray(p)&&typeof p[0]==='number');}
function bezier(c,t){const u=1-t;return[0,1].map(k=>u*u*u*c[1][k]+3*u*u*t*c[2][k]+3*u*t*t*c[3][k]+t*t*t*c[4][k]);}
function quadratic(a,b,c){if(Math.abs(a)<EPS)return Math.abs(b)<EPS?[]:[-c/b];const d=b*b-4*a*c;if(d<-EPS)return[];if(Math.abs(d)<EPS)return[-b/(2*a)];const s=Math.sqrt(Math.max(0,d)),q=-.5*(b+(b<0?-s:s));return q?[q/a,c/q]:[(-b+s)/(2*a),(-b-s)/(2*a)];}
function extrema(c,k){const p=c.slice(1).map(p=>p[k]);return quadratic(3*(-p[0]+3*p[1]-3*p[2]+p[3]),6*(p[0]-2*p[1]+p[2]),3*(p[1]-p[0])).filter(t=>t>0&&t<1);}
function commandBounds(c){let pp=points(c);if(c[0]==='c')pp=[c[1],c[4],...[...extrema(c,0),...extrema(c,1)].map(t=>bezier(c,t))];if(!pp.length)return[0,0,0,0];let b=null;for(const p of pp)b=union(b,[p[0],p[1],p[0],p[1]]);return b;}
function segmentCrossesBox(a,b,box){let lo=0,hi=1;for(let k=0;k<2;k++){const d=b[k]-a[k];if(Math.abs(d)<EPS){if(a[k]<box[k]-EPS||a[k]>box[k+2]+EPS)return false;}else{let t0=(box[k]-a[k])/d,t1=(box[k+2]-a[k])/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi+EPS)return false;}}return true;}
function cubicRootsAt(c,k,v){const stops=[0,...extrema(c,k).sort((a,b)=>a-b),1],out=[];const f=t=>bezier(c,t)[k]-v;for(let j=0;j<stops.length-1;j++){let a=stops[j],b=stops[j+1],fa=f(a),fb=f(b);if(Math.abs(fa)<1e-7)out.push(a);if(Math.abs(fb)<1e-7)out.push(b);if(fa*fb>=0)continue;for(let z=0;z<48;z++){const m=(a+b)/2,fm=f(m);if(fa*fm<=0){b=m;fb=fm;}else{a=m;fa=fm;}}out.push((a+b)/2);}return out;}
function commandCrossesBox(c,b){if(!overlap(commandBounds(c),b))return false;const pp=points(c);if(c[0]==='c'){if(inside(c[1],b)||inside(c[4],b))return true;for(let k=0;k<2;k++)for(const v of[b[k],b[k+2]])for(const t of cubicRootsAt(c,k,v))if(inside(bezier(c,t),b,1e-7))return true;return false;}if(pp.length===1)return inside(pp[0],b);for(let i=0;i<pp.length-1;i++)if(segmentCrossesBox(pp[i],pp[i+1],b))return true;return(c[0]==='qu'||c[0]==='re')&&segmentCrossesBox(pp[pp.length-1],pp[0],b);}
function commandInsideBox(c,b){return contained(commandBounds(c),b);}
function segmentDistance(a,b,p){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function splitCubic(c){const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2],a=mid(c[1],c[2]),b=mid(c[2],c[3]),d=mid(c[3],c[4]),e=mid(a,b),f=mid(b,d),g=mid(e,f);return[['c',c[1],a,e,g],['c',g,f,d,c[4]]];}
function commandDistance(c,p,tolerance=.02){
  if(c[0]!=='c'){const pp=points(c);let d=Infinity;for(let j=0;j<pp.length-1;j++)d=Math.min(d,segmentDistance(pp[j],pp[j+1],p));if(c[0]==='re'||c[0]==='qu')d=Math.min(d,segmentDistance(pp[pp.length-1],pp[0],p));return d;}
  const distance=q=>Math.hypot(q[0]-p[0],q[1]-p[1]);
  const boxDistance=b=>Math.hypot(Math.max(b[0]-p[0],0,p[0]-b[2]),Math.max(b[1]-p[1],0,p[1]-b[3]));
  const stack=[[c,0]],accuracy=Math.max(1e-7,tolerance);let best=Math.min(distance(c[1]),distance(c[4]));
  while(stack.length){
    const[q,level]=stack.pop();if(boxDistance(commandBounds(q))>best+accuracy)continue;
    const flat=Math.max(segmentDistance(q[1],q[4],q[2]),segmentDistance(q[1],q[4],q[3]));
    if(flat<=accuracy||level>=22){best=Math.min(best,segmentDistance(q[1],q[4],p));if(best===0)return 0;continue;}
    const ss=splitCubic(q);best=Math.min(best,distance(ss[0][4]));if(best===0)return 0;
    const d0=boxDistance(commandBounds(ss[0])),d1=boxDistance(commandBounds(ss[1]));
    if(d0<d1){stack.push([ss[1],level+1],[ss[0],level+1]);}else{stack.push([ss[0],level+1],[ss[1],level+1]);}
  }
  return best;
}
function pathData(commands,close=false){let d='',last=null;for(const c of commands){if(c[0]==='l'){if(!same(last,c[1]))d+='M'+point(c[1]);d+='L'+point(c[2]);last=c[2];}else if(c[0]==='c'){if(!same(last,c[1]))d+='M'+point(c[1]);d+='C'+point(c[2])+' '+point(c[3])+' '+point(c[4]);last=c[4];}else if(c[0]==='re'||c[0]==='qu'){let pp=points(c);if(c[0]==='re'&&c[2]===-1)pp=pp.slice().reverse();d+='M'+point(pp[0])+pp.slice(1).map(p=>'L'+point(p)).join('')+'Z';last=null;}}if(close&&last)d+='Z';return d;}
function color(rgb,dark=false,mode='mono'){if(!Array.isArray(rgb))rgb=[0,0,0];let r=rgb[0]||0,g=rgb.length===1?r:rgb[1]||0,b=rgb.length===1?r:rgb[2]||0;if(mode!=='source'){const l=.2126*r+.7152*g+.0722*b,fg=dark?[226,232,240]:[23,27,34],bg=dark?[18,25,35]:[245,247,251];[r,g,b]=fg.map((v,i)=>(v+(bg[i]-v)*l)/255);}return'rgb('+[r,g,b].map(x=>Math.round(Math.max(0,Math.min(1,x))*255)).join(',')+')';}
function intColor(v,dark,mode){return color([(v>>16&255)/255,(v>>8&255)/255,(v&255)/255],dark,mode);}
function dash(d){const m=/\[([^\]]*)\]\s*([-+.\deE]*)/.exec(d||'');return m?{array:m[1].trim().split(/[ ,]+/).map(Number).filter(Number.isFinite),offset:Number(m[2])||0}:{array:[],offset:0};}
function fontFamily(font){if(/Courier|Mono/i.test(font))return'Courier New,monospace';if(/Times/i.test(font))return'Times New Roman,serif';if(/CenturyGothic/i.test(font))return'Century Gothic,Arial,sans-serif';if(/Century/i.test(font))return'Century,Century Schoolbook,Times New Roman,serif';if(/Verdana/i.test(font))return'Verdana,Arial,sans-serif';if(/Tahoma/i.test(font))return'Tahoma,Arial,sans-serif';if(/Calibri/i.test(font))return'Calibri,Arial,sans-serif';if(/ArialNarrow|Condensed/i.test(font))return'Arial Narrow,Roboto Condensed,Arial,sans-serif';return'Arial,Helvetica,sans-serif';}
function textSpans(text){const out=[];for(const b of text?.text_blocks?.blocks||[])for(const l of b.lines||[])for(const s of l.spans||[])if(s.text&&valid(s.bbox))out.push({...s,dir:l.dir||[1,0],blockNumber:b.number});if(!out.length)for(const w of text?.words||[])if(w[4])out.push({text:w[4],bbox:w.slice(0,4),origin:[w[0],w[3]],size:w[3]-w[1],color:0,font:'Arial',dir:[1,0],alpha:255});return out;}
function rectangleOf(c){if(c[0]==='re')return c[1].slice();if(c[0]!=='qu')return null;const pp=points(c),b=commandBounds(c);if(pp.every(p=>(Math.abs(p[0]-b[0])<.02||Math.abs(p[0]-b[2])<.02)&&(Math.abs(p[1]-b[1])<.02||Math.abs(p[1]-b[3])<.02)))return b;return null;}
function cropEvidence(rows,spans,frame){const w=frame[2]-frame[0],h=frame[3]-frame[1],labels=spans.filter(s=>/DRAWING\s*(?:TITLE|NO|NUMBER)|GENERAL\s*NOTES|OWNER\s*:/i.test(s.text)),core=labels.filter(s=>/DRAWING\s*(?:TITLE|NO|NUMBER)/i.test(s.text)),anchors=core.length>=2?core:labels,right=anchors.filter(s=>s.bbox[0]>frame[0]+w*.64),bottom=anchors.filter(s=>s.bbox[1]>frame[1]+h*.66);let crop=frame.slice(),outer=null;const excludedRecords=new Set(),evidence=[];for(const r of rows){for(const c of r.drawing.items||[]){const b=rectangleOf(c);if(b&&r.drawing.items.length===1&&b[0]<frame[0]+w*.06&&b[1]<frame[1]+h*.06&&b[2]>frame[2]-w*.06&&b[3]>frame[3]-h*.06&&contained(b,[frame[0]-1,frame[1]-1,frame[2]+1,frame[3]+1])){if(!outer||(b[2]-b[0])*(b[3]-b[1])<(outer[2]-outer[0])*(outer[3]-outer[1]))outer=b;excludedRecords.add(r.record_id);evidence.push({kind:'outer_frame',record_id:r.record_id,bounds:b});}}}
  if(outer)crop=[outer[0]+.5,outer[1]+.5,outer[2]-.5,outer[3]-.5];let separator=null;
  if(right.length>=2){const anchor=Math.min(...right.map(s=>s.bbox[0]));for(const r of rows)for(const c of r.drawing.items||[]){if(c[0]!=='l')continue;const b=commandBounds(c);if(b[2]-b[0]<.04&&b[3]-b[1]>.62*h&&b[0]<=anchor+1&&b[0]>=anchor-.06*w&&(!separator||b[0]>separator.b[0]))separator={r,b,axis:'x'};}}
  if(!separator&&bottom.length>=2){const anchor=Math.min(...bottom.map(s=>s.bbox[1]));for(const r of rows)for(const c of r.drawing.items||[]){if(c[0]!=='l')continue;const b=commandBounds(c);if(b[3]-b[1]<.04&&b[2]-b[0]>.62*w&&b[1]<=anchor+1&&b[1]>=anchor-.08*h&&(!separator||b[1]>separator.b[1]))separator={r,b,axis:'y'};}}
  if(separator){crop[separator.axis==='x'?2:3]=separator.b[separator.axis==='x'?0:1]-.5;if(separator.r.drawing.items.length===1)excludedRecords.add(separator.r.record_id);const axis=separator.axis==='x'?0:1,edge=separator.b[axis];for(const r of rows){const b=r.drawing.rect;if(b&&b[axis]>=edge-1&&b[axis+2]>edge+.5)excludedRecords.add(r.record_id);}evidence.push({kind:'title_block_separator',axis:separator.axis,record_id:separator.r.record_id,bounds:separator.b});evidence.push(...(separator.axis==='x'?right:bottom).map(s=>({kind:'native_text_witness',text:s.text,bbox:s.bbox})));}
  return{bounds:crop,excludedRecords,detected:!!separator,outerFrameDetected:!!outer,evidence,method:separator?'native-title-labels-and-separator':outer?'outer-frame-only':'full-source-extent',reversible:true};}
const setKey=s=>s?Array.from(s).join('\x1f'):'';
const boundsCache=new WeakMap();
const nativeBounds=commandBounds;
commandBounds=function(c){let b=boundsCache.get(c);if(!b){b=nativeBounds(c);boundsCache.set(c,b);}return b;};
const optionNumber=(value,fallback,min,max)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
const countBelow=(items,limit)=>{let lo=0,hi=items.length;while(lo<hi){const mid=(lo+hi)>>1;if(items[mid].extent<=limit)lo=mid+1;else hi=mid;}return lo;};
function clippedSegment(a,b,box){
  let lo=0,hi=1;
  for(let k=0;k<2;k++){const d=b[k]-a[k];if(Math.abs(d)<1e-12){if(a[k]<box[k]||a[k]>box[k+2])return null;}else{let u=(box[k]-a[k])/d,v=(box[k+2]-a[k])/d;if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);if(lo>hi)return null;}}
  return[[a[0]+(b[0]-a[0])*lo,a[1]+(b[1]-a[1])*lo],[a[0]+(b[0]-a[0])*hi,a[1]+(b[1]-a[1])*hi]];
}

class C4VectorEngine{
  constructor(svg){
    if(!svg)throw Error('SVG element is required');
    this.svg=svg;this.uid='c4v'+Math.random().toString(36).slice(2,8);
    this.options={};this.info=null;this.invalid=true;
    svg.setAttribute('xmlns',NS);svg.setAttribute('aria-label','خطوط المخطط المتجهية');
    svg.style.touchAction='none';svg.style.userSelect='none';
    this.defs=node('defs');this.scene=node('g',{'data-role':'vector-drawing'});
    this.ink=node('g',{'data-role':'native-ink'});this.textInk=node('g',{'data-role':'native-text'});
    this.overlay=node('g',{'data-role':'selection-ink'});
    // Screen-size selection hints are decoration only: they never enter native geometry or hit testing.
    this.indicatorInk=node('g',{'data-role':'selection-indicators','pointer-events':'none','aria-hidden':'true'});
    this.scene.append(this.ink,this.textInk,this.overlay);svg.replaceChildren(this.defs,this.scene,this.indicatorInk);
    this.cacheLimits={batches:384,text:128};
  }
  load({page,rows,text}){
    this.page=page;this.rows=[];this.records=new Map();this.items=new Map();this.layerMap=new Map();
    this.grid=new Map();this.large=[];this.styles=new Map();this.batches=[];this.batchGrid=new Map();this.largeBatches=[];
    this.activeBatches=new Set();this.activeText=new Set();this.batchLRU=new Map();this.textLRU=new Map();
    this.overlays=[];this.focusNode=null;this.focusKey=null;this.queryEpoch=0;this.textGrid=new Map();this.largeText=[];this.spans=textSpans(text);
    this.selectionCache=new Map();this.selectionEpoch=0;this.currentViewport=null;this.indicatorNodes=new Map();this.indicatorKey=null;this.indicatorCull=null;this.indicatorOrigin=null;this.indicatorTransform=null;this.indicatorMarkers=[];this.indicatorStats=null;this.indicatorInk.replaceChildren();
    this.defs.replaceChildren();this.ink.replaceChildren();this.textInk.replaceChildren();this.overlay.replaceChildren();
    this.rootInk={node:this.ink,attached:[],root:true};this.rootText={node:this.textInk,attached:[],root:true};
    const frames=typeof page.frames==='string'?JSON.parse(page.frames):page.frames||{};
    this.matrix=(frames.rotation_matrix||I).slice();this.inverse=inv(this.matrix);
    const width=text?.text_blocks?.width||frames.cropbox?.[2]-frames.cropbox?.[0]||page.width;
    const height=text?.text_blocks?.height||frames.cropbox?.[3]-frames.cropbox?.[1]||page.height;
    this.sourceBounds=[0,0,width,height];
    const stack=[];let containerIndex=0;
    for(const row of rows){
      const d=row.drawing||{},level=d.level||0;
      while(stack.length&&stack[stack.length-1].level>=level)stack.pop();
      if(d.type==='clip'||d.type==='group'){
        const entry={level,type:d.type,id:this.uid+'-c'+containerIndex++,drawing:d,parent:stack[stack.length-1]||this.rootInk,node:null,attached:[],order:row.ordinal};
        if(d.type==='clip'){
          const cp=node('clipPath',{id:entry.id,clipPathUnits:'userSpaceOnUse'});
          cp.append(node('path',{d:pathData(d.items||[],d.closePath),'clip-rule':d.even_odd?'evenodd':'nonzero'}));this.defs.append(cp);
        }
        stack.push(entry);continue;
      }
      if(!['s','f','fs'].includes(d.type)||!d.items?.length)continue;
      const chain=stack.slice(),bbox=d.rect||d.items.reduce((b,c)=>union(b,commandBounds(c)),null);
      let clipped=bbox;for(const a of chain)if(a.type==='clip'&&a.drawing.scissor)clipped=intersect(clipped,a.drawing.scissor);
      const record={row,bbox,clipped,chain,parent:stack[stack.length-1]||this.rootInk,dash:dash(d.dashes),path:null,commandBounds:null,commandGrid:null,index:this.rows.length};
      this.rows.push(record);this.records.set(row.record_id,record);
      let layer=this.layerMap.get(d.layer||'');
      if(!layer){layer={name:d.layer||'',records:0,items:0,color:d.color||d.fill||[0,0,0]};this.layerMap.set(layer.name,layer);}
      layer.records++;layer.items+=d.items.length;
      this._index(this.grid,this.large,record,clipped,64,120);
      const key=[d.type,d.color?.join(','),d.fill?.join(','),d.stroke_opacity,d.fill_opacity,d.width,d.lineCap?.join?.(',')??d.lineCap,d.lineJoin,d.dashes,d.even_odd].join('|');
      let style=this.styles.get(key);
      if(!style){style={id:this.styles.size,drawing:d,dash:record.dash,variants:new Map()};this.styles.set(key,style);}
      record.style=style;
    }
    this.cropInfo=cropEvidence(this.rows.map(r=>r.row),this.spans,this.sourceBounds);
    this.cropNode=node('clipPath',{id:this.uid+'-drawing-crop',clipPathUnits:'userSpaceOnUse'});this.cropRect=node('rect');this.cropNode.append(this.cropRect);this.defs.append(this.cropNode);
    const crop=this.cropInfo.bounds;
    for(const[k,v]of Object.entries({x:crop[0],y:crop[1],width:crop[2]-crop[0],height:crop[3]-crop[1]}))this.cropRect.setAttribute(k,v);
    let db=null,last=null;
    for(const r of this.rows){
      r.excluded=this.cropInfo.excludedRecords.has(r.row.record_id);
      if(!r.excluded&&valid(r.clipped)&&overlap(r.clipped,crop))db=union(db,intersect(r.clipped,crop));
      const d=r.row.drawing,filled=d.type.includes('f'),transparentStroke=(d.stroke_opacity??1)<1;
      const close=last&&Math.max(0,r.bbox[0]-last.bbox[2],last.bbox[0]-r.bbox[2],r.bbox[1]-last.bbox[3],last.bbox[1]-r.bbox[3])<96;
      if(!last||filled||last.filled||transparentStroke||last.transparentStroke||last.style!==r.style||last.parent!==r.parent||last.layer!==(d.layer||'')||last.records.length>=256||!close){
        last={id:this.batches.length,order:r.row.ordinal,parent:r.parent,style:r.style,layer:d.layer||'',filled,transparentStroke,records:[],bbox:r.clipped.slice(),node:null,fullPath:null,drawingPath:null,geometryKey:null,styleKey:null,dynamic:false};
        this.batches.push(last);
      }
      last.records.push(r);last.bbox=union(last.bbox,r.clipped);last.dynamic||=d.type==='s'&&d.items.length>256&&!d.closePath;r.batch=last;
    }
    for(const b of this.batches)this._index(this.batchGrid,this.largeBatches,b,b.bbox,64,120);
    this.textEntries=this.spans.map((span,index)=>({id:index,order:index,span,bbox:span.bbox,parent:this.rootText,node:null,styleKey:null}));
    for(const s of this.textEntries){if(overlap(s.bbox,crop))db=union(db,intersect(s.bbox,crop));this._index(this.textGrid,this.largeText,s,s.bbox,64,120);}
    this.drawingBounds=db||crop;
    this.info={matrix:this.matrix.slice(),width:page.width,height:page.height,sourceBounds:this.sourceBounds.slice(),drawingBounds:this.drawingBounds.slice(),cropInfo:{...this.cropInfo,excludedRecords:[...this.cropInfo.excludedRecords]},layers:this.getLayers(),rows:this.rows.length,nativeSpans:this.spans.length,renderer:'direct-svg',fontPlacement:'native-spans-system-fonts'};
    this.options={};this.invalid=true;this.lastView=null;this.lastKey=null;this.lastStyleKey=null;this.lastTextKey=null;this.lastDimensions=null;this.lastTransform=null;this.lastDashZoom=null;this._visibilityKey=null;
    return this.info;
  }
  _index(grid,large,entry,b,cell=64,maxCells=120){
    if(!valid(b))return;const x0=Math.floor(b[0]/cell),x1=Math.floor(b[2]/cell),y0=Math.floor(b[1]/cell),y1=Math.floor(b[3]/cell);
    if((x1-x0+1)*(y1-y0+1)>maxCells){large.push(entry);return;}
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=x+','+y;let a=grid.get(key);if(!a)grid.set(key,a=[]);a.push(entry);}
  }
  _query(grid,large,all,b,cell=64,bboxKey='bbox'){
    if(!valid(b))return[];const stamp=++this.queryEpoch,result=[],x0=Math.floor(b[0]/cell),x1=Math.floor(b[2]/cell),y0=Math.floor(b[1]/cell),y1=Math.floor(b[3]/cell);
    const take=r=>{if(r._queryStamp===stamp)return;r._queryStamp=stamp;if(overlap(r[bboxKey],b))result.push(r);};
    if((x1-x0+1)*(y1-y0+1)>5000){for(const r of all)take(r);return result;}
    for(const r of large)take(r);
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(const r of grid.get(x+','+y)||[])take(r);
    return result;
  }
  invalidate(){this.invalid=true;this.selectionEpoch++;this.indicatorKey=null;for(const set of this.overlays)set.key=null;}
  getLayers(){return[...this.layerMap.values()].sort((a,b)=>a.name.localeCompare(b.name));}
  getRecord(rowOrId){return this.records.get(typeof rowOrId==='string'?rowOrId:rowOrId?.record_id);}
  isRowVisible(rowOrId,selectable=false){
    const r=this.getRecord(rowOrId);if(!r||!valid(r.clipped))return false;
    const o=this.options,layer=r.row.drawing.layer||'';
    if(o.hiddenLayers?.has(layer)||(selectable&&o.lockedLayers?.has(layer)))return false;
    return o.drawingOnly===false||(!r.excluded&&overlap(r.clipped,this.cropInfo.bounds));
  }
  getItem(id){
    let item=this.items.get(id);if(item)return item;
    const k=id.lastIndexOf(':i');if(k<0)return null;
    const record=this.records.get(id.slice(0,k)),index=Number(id.slice(k+2));if(!record||!record.row.drawing.items[index])return null;
    const command=record.row.drawing.items[index];item={id,row:record.row,record,index,command,bbox:commandBounds(command)};
    if(this.items.size>=50000)this.items.delete(this.items.keys().next().value);this.items.set(id,item);return item;
  }
  isItemVisible(id,selectable=false){
    const v=this.getItem(id);if(!v||!this.isRowVisible(v.row,selectable))return false;
    const o=this.options;if(o.hiddenItems?.has(id)||(o.isolatedItems&&!o.isolatedItems.has(id)))return false;
    const b=o.drawingOnly!==false?intersect(v.record.clipped,this.cropInfo.bounds):v.record.clipped;
    return valid(b)&&(contained(v.bbox,b)||commandCrossesBox(v.command,b));
  }
  visibleCandidates(b){return this._query(this.grid,this.large,this.rows,b,64,'clipped').sort((a,b)=>a.row.ordinal-b.row.ordinal);}
  _commandCandidates(record,b){
    const items=record.row.drawing.items;
    if(items.length<=64){const result=[];for(let i=0;i<items.length;i++)if(overlap(commandBounds(items[i]),b))result.push(i);return result;}
    let index=record.commandGrid;
    if(!index){
      const box=record.bbox,cell=Math.max(.5,Math.min(64,Math.max(box[2]-box[0],box[3]-box[1])*2/Math.sqrt(items.length)));
      index={grid:new Map(),large:[],all:[],cell};
      for(let i=0;i<items.length;i++){const item={index:i,bbox:commandBounds(items[i])};index.all.push(item);this._index(index.grid,index.large,item,item.bbox,cell,64);}
      record.commandGrid=index;
    }
    return this._query(index.grid,index.large,index.all,b,index.cell).map(v=>v.index);
  }
  queryItems(b,{selectable=false,layer=null}={}){
    const result=[];
    for(const record of this.visibleCandidates(b)){
      if(layer!=null&&record.row.drawing.layer!==layer)continue;
      if(!this.isRowVisible(record.row,selectable))continue;
      for(const index of this._commandCandidates(record,b)){
        const id=idFor(record.row,index);if(!this.isItemVisible(id,selectable))continue;
        const item=this.getItem(id);result.push({id:item.id,row:item.row,index:item.index,command:item.command,bbox:item.bbox});
      }
    }
    return result;
  }
  _selectionSnapshot(ids,revision,cached){
    const sourceKey=revision!=null?'revision:'+revision:setKey(ids);
    let s=cached;
    if(!s||s.sourceKey!==sourceKey){
      const seen=new Set(),members=[];let sourceBBox=null;
      for(const id of ids||[]){if(seen.has(id))continue;seen.add(id);if(typeof id!=='string')continue;const item=this.getItem(id);if(item){members.push(item);sourceBBox=union(sourceBBox,item.bbox);}}
      s={sourceKey,members,total:seen.size,sourceBBox,missingCount:seen.size-members.length,visibilityKey:null};
    }
    const o=this.options,key=this.selectionEpoch+'|'+(this._visibilityKey??[setKey(o.hiddenItems),setKey(o.hiddenLayers),setKey(o.lockedLayers),(o.isolatedItems?'isolated:':'all:')+setKey(o.isolatedItems)].join('|'))+'|'+(o.drawingOnly!==false);
    if(s.visibilityKey!==key){
      const visible=[];let bbox=null,lockedCount=0;
      for(const item of s.members){
        if(!this.isItemVisible(item.id,true)){if(o.lockedLayers?.has(item.row.drawing.layer||'')&&this.isItemVisible(item.id))lockedCount++;continue;}
        let b=intersect(item.bbox,item.record.clipped);if(o.drawingOnly!==false)b=intersect(b,this.cropInfo.bounds);if(!valid(b))continue;
        const viewBBox=transformBox(b,this.matrix),entry={id:item.id,item,bbox:b,viewBBox,extent:Math.max(viewBBox[2]-viewBBox[0],viewBBox[3]-viewBBox[1]),order:visible.length};
        visible.push(entry);bbox=union(bbox,b);
      }
      s.visible=visible;s.bySize=visible.slice().sort((a,b)=>a.extent-b.extent||a.order-b.order);s.bbox=bbox;s.lockedCount=lockedCount;s.hiddenCount=s.members.length-visible.length;s.visibilityKey=key;s.spatial=null;s.measurement=null;
    }
    return s;
  }
  _selectionQuery(s,b){
    if(!valid(b)||!s.bbox||!overlap(s.bbox,b))return[];
    if(contained(s.bbox,b))return s.visible;
    if(!s.spatial){const index={grid:new Map(),large:[]};for(const item of s.visible)this._index(index.grid,index.large,item,item.bbox,64,120);s.spatial=index;}
    return this._query(s.spatial.grid,s.spatial.large,s.visible,b);
  }
  _selectionMeasurement(s,options={}){
    const zoom=optionNumber(options.zoom,this.options.zoom||1,1e-9,1e9),threshold=optionNumber(options.tinyThresholdCSS,6,0,32),limit=threshold/zoom;
    const viewport=options.viewportBBox===undefined?this.currentViewport:options.viewportBBox,key=zoom+'|'+threshold+'|'+(valid(viewport)?viewport.map(nfmt).join(','):'all');
    if(!s.measurement||s.measurement.key!==key){
      const tiny=countBelow(s.bySize,limit);let inViewport=s.visible.length,tinyInViewport=tiny;
      if(valid(viewport)&&s.bbox&&!contained(s.bbox,viewport)){
        inViewport=0;tinyInViewport=0;
        for(const item of this._selectionQuery(s,viewport))if(contained(item.bbox,viewport)||commandCrossesBox(item.item.command,intersect(item.bbox,viewport))){inViewport++;if(item.extent<=limit)tinyInViewport++;}
      }
      s.measurement={key,value:{total:s.total,visible:s.visible.length,hiddenCount:s.hiddenCount,lockedCount:s.lockedCount,missingCount:s.missingCount,tiny,inViewport,tinyInViewport,bbox:s.bbox?.slice()||null,sourceBBox:s.sourceBBox?.slice()||null,zoom,tinyThresholdCSS:threshold}};
    }
    const result={...s.measurement.value,bbox:s.bbox?.slice()||null,sourceBBox:s.sourceBBox?.slice()||null};
    if(options.includeTinyIds){const cap=Math.floor(optionNumber(options.tinyIdsLimit,200,0,200));result.tinyIds=s.bySize.slice(0,Math.min(cap,result.tiny)).map(item=>item.id);result.tinyIdsTruncated=result.tiny>result.tinyIds.length;}
    if(options.includeVisibleIds){const cap=Math.floor(optionNumber(options.visibleIdsLimit,200,0,200));result.visibleIds=s.visible.slice(0,cap).map(item=>item.id);result.visibleIdsTruncated=s.visible.length>result.visibleIds.length;}
    return result;
  }
  // Pass a changing revision for mutable IDs; cacheKey allows a caller to recreate its Set cheaply.
  // Counts are complete. Optional ID lists are capped at 200; bbox describes visible source geometry.
  measureSelection(ids,options={}){
    if(!this.info)return{total:0,visible:0,hiddenCount:0,lockedCount:0,missingCount:0,tiny:0,inViewport:0,tinyInViewport:0,bbox:null,sourceBBox:null,...(options.includeTinyIds?{tinyIds:[],tinyIdsTruncated:false}:{})};
    const key=options.cacheKey??ids??'empty',snapshot=this._selectionSnapshot(ids,options.revision,this.selectionCache.get(key));
    this.selectionCache.delete(key);this.selectionCache.set(key,snapshot);while(this.selectionCache.size>8)this.selectionCache.delete(this.selectionCache.keys().next().value);
    return this._selectionMeasurement(snapshot,options);
  }
  _syncIndicatorPaths(buckets){
    for(const[key,old]of this.indicatorNodes)if(!buckets.has(key)){old.markers?.remove();old.frames?.remove();this.indicatorNodes.delete(key);}
    for(const[key,bucket]of buckets){
      let entry=this.indicatorNodes.get(key);if(!entry){entry={};this.indicatorNodes.set(key,entry);}
      for(const kind of ['frames','markers']){
        const d=bucket[kind].join('');if(!d){entry[kind]?.remove();entry[kind]=null;continue;}
        if(!entry[kind]){entry[kind]=node('path',{'data-role':kind==='frames'?'selection-entity-frames':'selection-locators',fill:'none',stroke:bucket.color,'stroke-width':kind==='frames'?1:1.5,'stroke-opacity':bucket.opacity*(kind==='frames'?.65:1),'stroke-linejoin':'miter','stroke-linecap':'square',...(kind==='frames'?{'stroke-dasharray':'4 3'}:{})});this.indicatorInk.append(entry[kind]);}
        if(entry[kind].getAttribute('d')!==d)entry[kind].setAttribute('d',d);
      }
    }
  }
  _drawSelectionIndicators(o,visibilityKey,viewport){
    const descriptors=[],sets=o.highlightSets||[],maxMarkers=Math.floor(optionNumber(o.selectionMarkerLimit,180,0,256));
    for(let index=0;index<sets.length;index++){
      const set=sets[index];if(set.role!=='selection'||(!set.tinyMarkers&&!set.entity))continue;
      const entry=this.overlays[index],entity=set.entity&&typeof set.entity==='object'?set.entity:null;
      const revision=set.revision!=null?set.revision+'|entity:'+(entity?.id??''):null;
      entry.selectionSnapshot=this._selectionSnapshot(set.ids,revision,entry.selectionSnapshot);
      descriptors.push({set,entity,snapshot:entry.selectionSnapshot,size:optionNumber(set.markerSizeCSS,8,5,14),threshold:optionNumber(set.tinyThresholdCSS,6,0,32),limit:Math.floor(optionNumber(set.markerLimit,maxMarkers,0,256))});
    }
    if(!descriptors.length){
      if(this.indicatorNodes.size)this._syncIndicatorPaths(new Map());this.indicatorKey=null;this.indicatorCull=null;this.indicatorMarkers=[];
      this.indicatorStats={markers:0,visibleMarkers:0,tinyMarkers:0,visibleTinyMarkers:0,entityFrames:0,tinySelected:0,tinyCandidates:0,clusteredTiny:0,limitedTiny:0,limitedEntities:0,markerLimit:maxMarkers,svgNodes:0};
      return this.indicatorStats;
    }
    const zoom=o.zoom,key=JSON.stringify([visibilityKey,this.selectionEpoch,zoom,o.width,o.height,maxMarkers,descriptors.map(d=>[d.snapshot.sourceKey,d.entity?.id??null,d.entity?.bbox??null,d.set.color,d.set.opacity,d.size,d.threshold,d.limit,!!d.set.tinyMarkers])]);
    if(this.indicatorKey!==key||!this.indicatorCull||!contained(viewport,this.indicatorCull)){
      const margin=96/zoom,cull=[viewport[0]-margin,viewport[1]-margin,viewport[2]+margin,viewport[3]+margin];
      const origin=apply(this.matrix,[(viewport[0]+viewport[2])/2,(viewport[1]+viewport[3])/2]),offset=[o.tx+zoom*origin[0],o.ty+zoom*origin[1]],clip=[-offset[0]-96,-offset[1]-96,o.width-offset[0]+96,o.height-offset[1]+96];
      const buckets=new Map(),occupied=new Map(),entities=new Set(),markers=[],stats={markers:0,visibleMarkers:0,tinyMarkers:0,visibleTinyMarkers:0,entityFrames:0,tinySelected:0,tinyCandidates:0,clusteredTiny:0,limitedTiny:0,limitedEntities:0,markerLimit:maxMarkers,svgNodes:0};
      const bucketFor=d=>{const color=d.set.color||'#2563eb',opacity=optionNumber(d.set.opacity,1,0,1),k=color+'|'+opacity;if(!buckets.has(k)){if(buckets.size>=8)return buckets.values().next().value;buckets.set(k,{color,opacity,frames:[],markers:[]});}return buckets.get(k);};
      const local=p=>[(p[0]-origin[0])*zoom,(p[1]-origin[1])*zoom];
      const square=(p,size)=>{const h=size/2;return'M'+point([p[0]-h,p[1]-h])+'h'+nfmt(size)+'v'+nfmt(size)+'h'+nfmt(-size)+'Z';};
      const addMarker=(d,p,kind)=>{const localPoint=local(p);bucketFor(d).markers.push(square(localPoint,d.size));markers.push({point:localPoint,half:d.size/2,kind});stats.markers++;if(kind==='tiny')stats.tinyMarkers++;};
      // A group is one selected entity: one frame and one centre square, never resize grips.
      for(const d of descriptors){
        const s=d.snapshot;stats.tinySelected+=countBelow(s.bySize,d.threshold/zoom);if(!d.entity||!s.bbox||!overlap(s.bbox,cull))continue;
        const identity=d.entity.id??s.sourceKey;if(entities.has(identity))continue;entities.add(identity);
        if(stats.entityFrames+stats.tinyMarkers>=maxMarkers||!d.limit){stats.limitedEntities++;continue;}
        const b=transformBox(s.bbox,this.matrix),a=local([b[0],b[1]]),z=local([b[2],b[3]]),frame=[a[0]-3,a[1]-3,z[0]+3,z[1]+3];
        const corners=[[frame[0],frame[1]],[frame[2],frame[1]],[frame[2],frame[3]],[frame[0],frame[3]]],parts=[];
        for(let k=0;k<4;k++){const segment=clippedSegment(corners[k],corners[(k+1)%4],clip);if(segment)parts.push('M'+point(segment[0])+'L'+point(segment[1]));}
        const centre=[(b[0]+b[2])/2,(b[1]+b[3])/2],lp=local(centre),centreVisible=inside(lp,clip);
        if(!parts.length&&!centreVisible)continue;
        if(parts.length)bucketFor(d).frames.push(parts.join(''));stats.entityFrames++;
        if(centreVisible)addMarker(d,centre,'entity');
      }
      // Locator candidates use the selection's own spatial index. They are batched and de-cluttered.
      for(const d of descriptors){
        if(d.entity||!d.set.tinyMarkers)continue;
        const s=d.snapshot,threshold=d.threshold/zoom,candidates=this._selectionQuery(s,cull),view=[-offset[0],-offset[1],o.width-offset[0],o.height-offset[1]];let drawn=0;
        // Spend the limited locator budget inside the viewport before keeping overscan locators.
        for(let pass=0;pass<2;pass++)for(const entry of candidates){
          if(entry.extent>threshold)continue;
          const p=[(entry.viewBBox[0]+entry.viewBBox[2])/2,(entry.viewBBox[1]+entry.viewBBox[3])/2],lp=local(p);if(!inside(lp,clip))continue;
          if(inside(lp,view,d.size/2)!==(pass===0))continue;
          stats.tinyCandidates++;
          const screen=[p[0]*zoom,p[1]*zoom],cx=Math.floor(screen[0]/18),cy=Math.floor(screen[1]/18);let crowded=false;
          for(let x=cx-1;x<=cx+1&&!crowded;x++)for(let y=cy-1;y<=cy+1&&!crowded;y++)for(const old of occupied.get(x+','+y)||[])if(Math.max(Math.abs(screen[0]-old.x),Math.abs(screen[1]-old.y))<(d.size+old.size)/2+3){crowded=true;break;}
          if(crowded){stats.clusteredTiny++;continue;}
          if(stats.entityFrames+stats.tinyMarkers>=maxMarkers||drawn>=d.limit){stats.limitedTiny++;continue;}
          const cell=cx+','+cy;let points=occupied.get(cell);if(!points)occupied.set(cell,points=[]);points.push({x:screen[0],y:screen[1],size:d.size});addMarker(d,p,'tiny');drawn++;
        }
      }
      this._syncIndicatorPaths(buckets);stats.svgNodes=[...this.indicatorNodes.values()].reduce((n,e)=>n+!!e.markers+!!e.frames,0);
      this.indicatorKey=key;this.indicatorCull=cull;this.indicatorOrigin=origin;this.indicatorMarkers=markers;this.indicatorStats=stats;
    }
    const origin=this.indicatorOrigin,offset=[o.tx+zoom*origin[0],o.ty+zoom*origin[1]],transform='translate('+point(offset)+')';
    if(this.indicatorTransform!==transform){this.indicatorInk.setAttribute('transform',transform);this.indicatorTransform=transform;}
    let visibleMarkers=0,visibleTinyMarkers=0;
    for(const marker of this.indicatorMarkers)if(inside([marker.point[0]+offset[0],marker.point[1]+offset[1]],[0,0,o.width,o.height],marker.half)){visibleMarkers++;if(marker.kind==='tiny')visibleTinyMarkers++;}
    this.indicatorStats.visibleMarkers=visibleMarkers;this.indicatorStats.visibleTinyMarkers=visibleTinyMarkers;
    return this.indicatorStats;
  }
  _style(style,o,locked=false,partial=false){
    const key=[o.theme,o.colorMode,o.fineLine!==false,locked,partial].join('|');let result=style.variants.get(key);if(result)return result;
    const d=style.drawing,hair=o.fineLine!==false,dark=o.theme==='dark',stroke=d.type.includes('s')||partial,fill=d.type.includes('f')&&!partial;
    const attrs={fill:fill?color(d.fill,dark,o.colorMode):'none','fill-opacity':d.fill_opacity??1,'fill-rule':d.even_odd?'evenodd':'nonzero',stroke:stroke?color(d.color||d.fill,dark,o.colorMode):'none','stroke-opacity':d.stroke_opacity??1,'stroke-width':hair?.75:(d.width||.75),'stroke-linecap':['butt','round','square'][Math.max(...(Array.isArray(d.lineCap)?d.lineCap:[d.lineCap||0]))]||'butt','stroke-linejoin':d.lineJoin===1?'round':d.lineJoin===2?'bevel':'miter','stroke-miterlimit':10,opacity:locked?.32:1};
    if(hair||!d.width)attrs['vector-effect']='non-scaling-stroke';
    if(style.dash.array.length){attrs['stroke-dasharray']=style.dash.array.map(nfmt).join(' ');attrs['stroke-dashoffset']=style.dash.offset;}
    result={key,attrs,nonScaling:!!attrs['vector-effect']};style.variants.set(key,result);return result;
  }
  _insert(entry,element){
    const parent=entry.parent,pnode=parent.root?parent.node:this._containerNode(parent),a=parent.attached;
    let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m].order<entry.order)lo=m+1;else hi=m;}
    if(a[lo]===entry)return;
    pnode.insertBefore(element,a[lo]?.node||null);a.splice(lo,0,entry);entry.node=element;
  }
  _containerNode(entry){
    if(entry.node)return entry.node;
    const d=entry.drawing,attrs=entry.type==='clip'?{'clip-path':'url(#'+entry.id+')'}:{opacity:d.opacity??1,style:d.blendmode&&d.blendmode!=='Normal'?'mix-blend-mode:'+String(d.blendmode).replace(/([a-z])([A-Z])/g,'$1-$2').toLowerCase()+(d.isolated?';isolation:isolate':''):d.isolated?'isolation:isolate':''};
    const g=node('g',attrs);this._insert(entry,g);return g;
  }
  _detach(entry){
    if(!entry.node?.parentNode)return;
    entry.node.remove();const parent=entry.parent,a=parent.attached;
    let lo=0,hi=a.length;while(lo<hi){const m=(lo+hi)>>1;if(a[m].order<entry.order)lo=m+1;else hi=m;}
    if(a[lo]===entry)a.splice(lo,1);
    if(!parent.root&&!a.length){this._detach(parent);parent.node=null;}
  }
  _remember(cache,entry,limit){
    cache.delete(entry.id);cache.set(entry.id,entry);
    while(cache.size>limit){const first=cache.keys().next().value,old=cache.get(first);cache.delete(first);if(!old.node?.parentNode){old.node=null;old.styleKey=null;old.geometryKey=null;}}
  }
  _updateVisibility(o,key){
    if(this._visibilityKey===key)return;this._visibilityKey=key;
    const map=ids=>{const result=new Map();for(const id of ids||[]){const k=id.lastIndexOf(':i');if(k<0)continue;const rid=id.slice(0,k);let s=result.get(rid);if(!s)result.set(rid,s=new Set());s.add(Number(id.slice(k+2)));}return result;};
    this.hiddenByRecord=map(o.hiddenItems);this.isolatedByRecord=o.isolatedItems?map(o.isolatedItems):null;
  }
  _prepareBatch(batch,o,cull,cullKey){
    let parts=[],key=o.drawingOnly===false?'full':'drawing',partial=false,count=0;
    const selected=[],dynamic=batch.dynamic&&o.zoom>2;
    for(const r of batch.records){
      if(!this.isRowVisible(r.row))continue;
      const hidden=this.hiddenByRecord.get(r.row.record_id),isolated=this.isolatedByRecord?.get(r.row.record_id);
      if(this.isolatedByRecord&&!isolated)continue;
      key+=';'+r.index+(hidden?'-'+[...hidden].join(','):'')+(isolated?'+'+[...isolated].join(','):'');
      selected.push({r,hidden,isolated});
    }
    if(dynamic)key+='@'+cullKey;
    if(batch.geometryKey===key&&batch.node)return batch.drawCount>0;
    for(const{r,hidden,isolated}of selected){
      const items=r.row.drawing.items,useCull=dynamic&&items.length>256&&!r.row.drawing.closePath;
      if(!hidden&&!isolated&&!useCull){if(r.path==null)r.path=pathData(items,r.row.drawing.closePath);parts.push(r.path);count++;continue;}
      let indices=useCull?this._commandCandidates(r,cull):items.map((_,i)=>i);
      indices=indices.filter(i=>!hidden?.has(i)&&(!isolated||isolated.has(i)));
      if(!indices.length)continue;
      indices.sort((a,b)=>a-b);const commands=indices.map(i=>items[i]);
      if(batch.filled&&indices.length!==items.length)partial=true;
      parts.push(pathData(commands,r.row.drawing.closePath&&indices.length===items.length));count++;
    }
    const d=parts.join('');batch.geometryKey=key;batch.partial=partial;batch.drawCount=count;
    if(!d)return false;
    if(!batch.node){batch.node=node('path',{'data-layer':batch.layer});batch.styleKey=null;}
    if(batch.pathValue!==d||batch.node.getAttribute('d')!==d){batch.node.setAttribute('d',d);batch.pathValue=d;}
    return true;
  }
  _textNode(entry,o){
    const s=entry.span;
    if(!entry.node){
      const dir=s.dir||[1,0],angle=Math.atan2(dir[1],dir[0])*180/Math.PI,origin=s.origin||[s.bbox[0],s.bbox[3]],a=Math.abs(dir[0]),b=Math.abs(dir[1]),bw=s.bbox[2]-s.bbox[0],bh=s.bbox[3]-s.bbox[1],fh=(s.ascender-s.descender)*s.size;
      const length=a>.999?bw:b>.999?bh:Number.isFinite(fh)?Math.max(.01,a>b?(bw-b*fh)/a:(bh-a*fh)/b):Math.max(bw,bh);
      entry.node=node('text',{transform:'translate('+point(origin)+') rotate('+nfmt(angle)+')',x:0,y:0,'font-size':s.size||bh,'font-family':fontFamily(s.font),'font-weight':(s.flags&16)?'700':'400','font-style':(s.flags&2)?'italic':'normal',opacity:(s.alpha??255)/255,textLength:Math.max(.01,length),lengthAdjust:'spacingAndGlyphs','xml:space':'preserve','data-font':s.font||'',direction:s.bidi===1?'rtl':'ltr'});entry.node.textContent=s.text;entry.styleKey=null;
    }
    const key=o.theme+'|'+o.colorMode;
    if(entry.styleKey!==key){entry.node.setAttribute('fill',intColor(s.color||0,o.theme==='dark',o.colorMode));entry.styleKey=key;}
    return entry.node;
  }
  _syncInk(cull,o){
    const found=this._query(this.batchGrid,this.largeBatches,this.batches,cull),next=new Set(),cullKey=cull.map(nfmt).join(',');
    let recordCount=0;
    for(const batch of found){
      if(o.hiddenLayers?.has(batch.layer))continue;
      if(!this._prepareBatch(batch,o,cull,cullKey))continue;
      const style=this._style(batch.style,o,o.lockedLayers?.has(batch.layer),batch.partial);
      if(batch.styleKey!==style.key){
        for(const[k,v]of Object.entries(style.attrs))batch.node.setAttribute(k,v);
        if(!style.nonScaling)batch.node.removeAttribute('vector-effect');batch.styleKey=style.key;batch.dashZoom=null;
      }
      batch.nonScaling=style.nonScaling;
      if(!batch.node.parentNode)this._insert(batch,batch.node);
      this.batchLRU.delete(batch.id);next.add(batch);recordCount+=batch.drawCount;
    }
    for(const batch of this.activeBatches)if(!next.has(batch)){this._detach(batch);this._remember(this.batchLRU,batch,this.cacheLimits.batches);}
    this.activeBatches=next;
    const nextText=new Set();
    if(!o.hideText)for(const entry of this._query(this.textGrid,this.largeText,this.textEntries,cull)){
      if(o.drawingOnly!==false&&!overlap(entry.bbox,this.cropInfo.bounds))continue;
      const n=this._textNode(entry,o);if(!n.parentNode)this._insert(entry,n);this.textLRU.delete(entry.id);nextText.add(entry);
    }
    for(const entry of this.activeText)if(!nextText.has(entry)){this._detach(entry);this._remember(this.textLRU,entry,this.cacheLimits.text);}
    this.activeText=nextText;
    const clip=o.drawingOnly!==false?'url(#'+this.uid+'-drawing-crop)':null;
    if(this._clip!==clip){for(const n of[this.ink,this.textInk,this.overlay]){if(clip)n.setAttribute('clip-path',clip);else n.removeAttribute('clip-path');}this._clip=clip;}
    this.stats={visibleRecords:recordCount,svgPaths:next.size,nativeSpans:nextText.size,sourceRecords:this.rows.length,renderer:'direct-svg',cachedBatches:this.batchLRU.size,cachedText:this.textLRU.size,totalBatches:this.batches.length};
  }
  _drawOverlay(o,visibilityKey){
    const sets=o.highlightSets||[];
    for(let i=0;i<sets.length;i++){
      const set=sets[i];let entry=this.overlays[i];
      if(!entry){entry={node:node('path',{'data-role':'selection-set',fill:'none','stroke-linecap':'round','stroke-linejoin':'round','vector-effect':'non-scaling-stroke'}),fillNode:null,key:null};this.overlay.append(entry.node);this.overlays[i]=entry;}
      const key=visibilityKey+'|fill:'+(set.fillOpacity>0)+'|'+(set.revision!=null?'revision:'+set.revision:setKey(set.ids));
      if(entry.key!==key){
        const parts=[],closed=[],byRecord=new Map();
        for(const id of set.ids||[]){if(!this.isItemVisible(id))continue;const item=this.getItem(id);if(!item)continue;parts.push(pathData([item.command]));if(set.fillOpacity>0){let a=byRecord.get(item.record);if(!a)byRecord.set(item.record,a=[]);a.push(item);}}
        for(const[r,items]of byRecord){if(items.length===r.row.drawing.items.length&&(r.row.drawing.closePath||r.row.drawing.type.includes('f')))closed.push(pathData(r.row.drawing.items,r.row.drawing.closePath));else for(const it of items)if(it.command[0]==='qu'||it.command[0]==='re')closed.push(pathData([it.command]));}
        entry.node.setAttribute('d',parts.join(''));entry.closed=closed.join('');entry.key=key;
      }
      const alpha=Math.max(0,Math.min(1,set.opacity??1)),styleKey=[set.color,set.widthCSS,alpha,set.fillOpacity].join('|');
      if(entry.styleKey!==styleKey){entry.node.setAttribute('stroke',set.color||'#2563eb');entry.node.setAttribute('stroke-width',set.widthCSS||2.5);entry.node.setAttribute('stroke-opacity',alpha);entry.styleKey=styleKey;}
      if(set.fillOpacity>0&&entry.closed){if(!entry.fillNode){entry.fillNode=node('path',{'data-role':'selection-fill',stroke:'none'});entry.fillValue=null;entry.fillStyle=null;this.overlay.insertBefore(entry.fillNode,entry.node);}if(entry.fillValue!==entry.closed){entry.fillNode.setAttribute('d',entry.closed);entry.fillValue=entry.closed;}const fillStyle=(set.color||'#2563eb')+'|'+set.fillOpacity;if(entry.fillStyle!==fillStyle){entry.fillNode.setAttribute('fill',set.color||'#2563eb');entry.fillNode.setAttribute('fill-opacity',Math.max(0,Math.min(1,set.fillOpacity)));entry.fillStyle=fillStyle;}}else if(entry.fillNode){entry.fillNode.remove();entry.fillNode=null;}
    }
    while(this.overlays.length>sets.length){const entry=this.overlays.pop();entry.node.remove();entry.fillNode?.remove();}
    const focusKey=JSON.stringify(o.focusBBox||null);
    if(focusKey!==this.focusKey){
      if(o.focusBBox){if(!this.focusNode){this.focusNode=node('rect',{fill:'#f59e0b','fill-opacity':.1,stroke:'#c07800','stroke-width':1.5,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke'});this.overlay.append(this.focusNode);}const b=o.focusBBox;for(const[k,v]of Object.entries({x:b[0],y:b[1],width:b[2]-b[0],height:b[3]-b[1]}))this.focusNode.setAttribute(k,v);}else if(this.focusNode){this.focusNode.remove();this.focusNode=null;}this.focusKey=focusKey;
    }
  }
  render(options){
    if(!this.info)return;
    const o={zoom:1,tx:0,ty:0,width:this.svg.clientWidth||1,height:this.svg.clientHeight||1,drawingOnly:true,fineLine:true,...options};this.options=o;
    const m=this.matrix,z=o.zoom,dimensions=o.width+' '+o.height;
    if(dimensions!==this.lastDimensions){this.svg.setAttribute('viewBox','0 0 '+dimensions);this.svg.setAttribute('width',o.width);this.svg.setAttribute('height',o.height);this.lastDimensions=dimensions;}
    const transform=[z*m[0],z*m[1],z*m[2],z*m[3],o.tx+z*m[4],o.ty+z*m[5]].map(nfmt).join(' ');
    if(transform!==this.lastTransform){this.scene.setAttribute('transform','matrix('+transform+')');this.lastTransform=transform;}
    const visibilityKey=o.visibilityVersion!=null?'version:'+o.visibilityVersion:[setKey(o.hiddenItems),setKey(o.hiddenLayers),setKey(o.lockedLayers),(o.isolatedItems?'isolated:':'all:')+setKey(o.isolatedItems)].join('\x1e');
    const key=[o.drawingOnly,o.fineLine,o.theme,o.colorMode,o.hideText,visibilityKey].join('|');
    this._updateVisibility(o,visibilityKey);
    const visible=transformBox([-o.tx/z,-o.ty/z,(o.width-o.tx)/z,(o.height-o.ty)/z],this.inverse);
    this.currentViewport=visible;
    const recull=this.invalid||key!==this.lastKey||!this.lastView||!contained(visible,this.lastView)||z>this.lastZoom*2.2||z<this.lastZoom/1.8;
    if(recull){const margin=Math.min(240,Math.max(120,Math.max(o.width,o.height)*.16))/z,cull=[visible[0]-margin,visible[1]-margin,visible[2]+margin,visible[3]+margin];this._syncInk(cull,o);this.lastView=cull;this.lastZoom=z;this.lastKey=key;this.invalid=false;this.svg.style.backgroundColor=o.colorMode==='source'?'#ffffff':o.theme==='dark'?'#121923':'#f5f7fb';}
    if(recull||this.lastDashZoom!==z){for(const b of this.activeBatches){if(!b.style.dash.array.length||!b.nonScaling||b.dashZoom===z)continue;b.node.setAttribute('stroke-dasharray',b.style.dash.array.map(v=>nfmt(v*z)).join(' '));b.node.setAttribute('stroke-dashoffset',nfmt(b.style.dash.offset*z));b.dashZoom=z;}this.lastDashZoom=z;}
    this._drawOverlay(o,visibilityKey+'|'+o.drawingOnly);
    this.stats.selectionIndicators=this._drawSelectionIndicators(o,visibilityKey+'|'+o.drawingOnly,visible);
    if(recull){this.svg.dataset.renderer='direct-svg';this.svg.dataset.visibleRecords=String(this.stats?.visibleRecords||0);}return this.stats;
  }
}

Object.assign(C4VectorEngine,{commandBounds,commandCrossesBox,commandInsideBox,commandDistance,pathData,apply,transformBox});
global.C4VectorEngine=C4VectorEngine;
})(typeof window!=='undefined'?window:globalThis);
