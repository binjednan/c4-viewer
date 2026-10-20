(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.C4ComponentPreviewRenderer=api.C4ComponentPreviewRenderer;
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const VIEWS=new Set(['source','iso','top','front','right']);
  const ISO_PITCH=Math.asin(1/Math.sqrt(3));
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const finitePoint=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&(p.length<3||Number.isFinite(p[2]));
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*(b[2]||0);
  const samePoint=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
  function basisFor(view,yaw=-Math.PI/4,pitch=ISO_PITCH,orbit=false){
    if(view==='source')return{right:[1,0,0],down:[0,1,0],depth:[0,0,1],source:true};
    if(!orbit&&view==='top')return{right:[1,0,0],down:[0,-1,0],depth:[0,0,1]};
    if(!orbit&&view==='front')return{right:[1,0,0],down:[0,0,-1],depth:[0,-1,0]};
    if(!orbit&&view==='right')return{right:[0,1,0],down:[0,0,-1],depth:[1,0,0]};
    const c=Math.cos(yaw),s=Math.sin(yaw),ce=Math.cos(pitch),se=Math.sin(pitch);
    return{right:[-s,c,0],down:[se*c,se*s,-ce],depth:[ce*c,ce*s,se]};
  }
  function projectPoint(point,basis,pivot=[0,0,0]){
    if(basis.source)return[point[0],point[1],0];
    const p=[point[0]-pivot[0],point[1]-pivot[1],(point[2]||0)-pivot[2]];
    return[dot(basis.right,p),dot(basis.down,p),dot(basis.depth,p)];
  }
  function cubicAt(points,t){
    const u=1-t,a=u*u*u,b=3*u*u*t,c=3*u*t*t,d=t*t*t;
    return[0,1].map(k=>a*points[0][k]+b*points[1][k]+c*points[2][k]+d*points[3][k]);
  }
  function cubicExtrema(a,b,c,d){
    const A=-a+3*b-3*c+d,B=2*(a-2*b+c),C=b-a,out=[];
    if(Math.abs(A)<1e-14){if(Math.abs(B)>1e-14){const t=-C/B;if(t>0&&t<1)out.push(t);}return out;}
    const disc=B*B-4*A*C;if(disc<0)return out;
    const r=Math.sqrt(disc);for(const t of [(-B+r)/(2*A),(-B-r)/(2*A)])if(t>0&&t<1)out.push(t);
    return out;
  }
  function primitiveBounds(kind,points){
    const samples=[points[0],points[points.length-1]];
    if(kind==='cubic')for(let k=0;k<2;k++)for(const t of cubicExtrema(...points.map(p=>p[k])))samples.push(cubicAt(points,t));
    return[Math.min(...samples.map(p=>p[0])),Math.min(...samples.map(p=>p[1])),Math.max(...samples.map(p=>p[0])),Math.max(...samples.map(p=>p[1]))];
  }
  function segmentDistance(p,a,b){
    const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d,0,1):0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
  }
  function splitCubic(p){
    const m=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2],a=m(p[0],p[1]),b=m(p[1],p[2]),c=m(p[2],p[3]),d=m(a,b),e=m(b,c),f=m(d,e);
    return[[p[0],a,d,f],[f,e,c,p[3]]];
  }
  function primitiveDistance(kind,points,p,tolerance=.25){
    if(kind==='line')return segmentDistance(p,points[0],points[1]);
    let best=Infinity;const pending=[[points,0]];
    while(pending.length){
      const [q,depth]=pending.pop();
      const flat=Math.max(segmentDistance(q[1],q[0],q[3]),segmentDistance(q[2],q[0],q[3]));
      if(flat<=tolerance||depth>=14){best=Math.min(best,segmentDistance(p,q[0],q[3]));continue;}
      const [a,b]=splitCubic(q);pending.push([b,depth+1],[a,depth+1]);
    }
    return best;
  }
  function validWire(w){return w&&(w.kind==='line'||w.kind==='cubic')&&Array.isArray(w.points)&&w.points.length===(w.kind==='line'?2:4)&&w.points.every(finitePoint);}
  const overlaps=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
  function unionBounds(boxes){
    if(!boxes.length)return null;const b=[Infinity,Infinity,-Infinity,-Infinity];
    for(const a of boxes){b[0]=Math.min(b[0],a[0]);b[1]=Math.min(b[1],a[1]);b[2]=Math.max(b[2],a[2]);b[3]=Math.max(b[3],a[3]);}return b;
  }
  function colorValue(value,fallback){
    if(Array.isArray(value)&&value.length===3&&value.every(Number.isFinite)){
      const factor=Math.max(...value)<=1?255:1;return'rgb('+value.map(v=>Math.round(clamp(v*factor,0,255))).join(',')+')';
    }
    return typeof value==='string'&&/^(#[\da-f]{3,8}|rgba?\([\d\s.,%/]+\))$/i.test(value)?value:fallback;
  }
  class C4ComponentPreviewRenderer{
    constructor(host,options={}){
      if(!host)throw new TypeError('A component preview host is required.');
      this.host=host;this.onPick=typeof options.onPick==='function'?options.onPick:()=>{};
      this.onViewChange=typeof options.onViewChange==='function'?options.onViewChange:null;
      this.wheelMode=options.wheelMode||'auto';this.navigationDevice=options.navigationDevice||'auto';this.view='source';this.theme='light';this.fill=false;this.model=null;this.sourceRepresentationId=null;
      this.width=0;this.height=0;this.dpr=1;this.center=[0,0];this.pan=[0,0];this.zoomRatio=1;this.fitScale=1;
      this.yaw=-Math.PI/4;this.pitch=ISO_PITCH;this.orbit=false;this.pivot=[0,0,0];
      this.projected=[];this.projectedFaces=[];this.projectedBounds=null;this.selectedWire=null;this.pointers=new Map();this.gesture=null;this.destroyed=false;
      this.frame=null;this.drawCount=0;this.lastRenderStats={visibleWires:0,faces:0,drawCount:0};this._listeners=[];
      this._raf=options.requestAnimationFrame||(root.requestAnimationFrame?root.requestAnimationFrame.bind(root):fn=>setTimeout(fn,16));
      this._caf=options.cancelAnimationFrame||(root.cancelAnimationFrame?root.cancelAnimationFrame.bind(root):clearTimeout);
      const doc=host.ownerDocument||root.document;this.canvas=doc.createElement('canvas');
      this.canvas.className='component-preview-canvas';this.canvas.tabIndex=0;
      this.canvas.setAttribute('aria-label','خطوط المكوّن المعتمدة؛ اسحب للتحكم بالمنظور واضغط على خط لاختياره');
      Object.assign(this.canvas.style,{position:'absolute',inset:'0',display:'block',width:'100%',height:'100%',touchAction:'none'});
      host.appendChild(this.canvas);this.ctx=this.canvas.getContext('2d',{alpha:true});
      if(!this.ctx){this.canvas.remove();throw new Error('Canvas2D is unavailable for the component preview.');}
      this._bind();
      if(typeof root.ResizeObserver==='function'){this.observer=new root.ResizeObserver(()=>this.resize());this.observer.observe(host);}
      else if(root.addEventListener)this._listen(root,'resize',()=>this.resize());
      this.resize();
    }
    _listen(target,type,fn,options){target.addEventListener(type,fn,options);this._listeners.push([target,type,fn,options]);}
    _request(){if(this.destroyed||this.frame!==null)return;this.frame=this._raf(()=>{this.frame=null;if(!this.destroyed)this._draw();});}
    _angles(view){
      this.orbit=false;
      if(view==='top'){this.yaw=-Math.PI/2;this.pitch=Math.PI/2;}
      else if(view==='front'){this.yaw=-Math.PI/2;this.pitch=0;}
      else if(view==='right'){this.yaw=0;this.pitch=0;}
      else{this.yaw=-Math.PI/4;this.pitch=ISO_PITCH;}
    }
    setModel(model,options={}){
      const view=options.view||this.view;if(!VIEWS.has(view))throw new TypeError('Unknown component preview view: '+view);
      const sources=Array.isArray(model?.sourceViews)?model.sourceViews:[];
      let rep=Object.prototype.hasOwnProperty.call(options,'sourceRepresentationId')?options.sourceRepresentationId:this.sourceRepresentationId;
      if(!Object.prototype.hasOwnProperty.call(options,'sourceRepresentationId')&&!sources.some(s=>s.representation_id===rep))rep=sources[0]?.representation_id||null;
      const reset=model!==this.model||view!==this.view||rep!==this.sourceRepresentationId;
      this.model=model||null;this.sourceRepresentationId=rep;this.view=view;
      if('fill'in options)this.fill=!!options.fill;if('theme'in options)this.theme=options.theme==='dark'?'dark':'light';
      if('navigationDevice'in options&&['auto','trackpad','mouse'].includes(options.navigationDevice))this.navigationDevice=options.navigationDevice;
      if(reset){this.selectedWire=null;this._angles(view);this._rebuild();this.fit();}else this._request();
      return this;
    }
    setView(view){
      if(!VIEWS.has(view))throw new TypeError('Unknown component preview view: '+view);
      this.view=view;this._angles(view);this._rebuild();this.fit();return this;
    }
    setWheelMode(mode){if(!['auto','pan','zoom'].includes(mode))throw new TypeError('Unknown wheel mode.');this.wheelMode=mode;return this;}
    _rawGeometry(){
      if(this.view==='source'){
        const source=(this.model?.sourceViews||[]).find(s=>s.representation_id===this.sourceRepresentationId);
        return{wires:source?.wires||[],faces:source?.faces||[]};
      }
      return{wires:this.model?.wires||[],faces:this.model?.faces||[]};
    }
    _rebuild(){
      const geometry=this._rawGeometry(),hasDimensions=w=>validWire(w)&&(this.view==='source'||w.points.every(p=>p.length===3)),rawWires=geometry.wires.filter(hasDimensions),bounds3=this.model?.bounds;
      this.basis=basisFor(this.view,this.yaw,this.pitch,this.orbit);
      if(this.view==='source')this.pivot=[0,0,0];
      else if(bounds3&&finitePoint(bounds3.min)&&finitePoint(bounds3.max)&&bounds3.min.length===3&&bounds3.max.length===3)this.pivot=[0,1,2].map(k=>(bounds3.min[k]+bounds3.max[k])/2);
      else{
        const b=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
        for(const w of rawWires)for(const p of w.points)for(let k=0;k<3;k++){b[k]=Math.min(b[k],p[k]||0);b[k+3]=Math.max(b[k+3],p[k]||0);}
        this.pivot=Number.isFinite(b[0])?[0,1,2].map(k=>(b[k]+b[k+3])/2):[0,0,0];
      }
      const cache=new Map(),project=w=>{
        if(cache.has(w))return cache.get(w);if(!hasDimensions(w))return null;
        const points=w.points.map(p=>projectPoint(p,this.basis,this.pivot)),out={wire:w,kind:w.kind,points,bounds:primitiveBounds(w.kind,points),depth:points.reduce((n,p)=>n+p[2],0)/points.length};
        cache.set(w,out);return out;
      };
      this.projected=rawWires.map(project);this.projectedFaces=[];
      for(const face of geometry.faces){
        if(!Array.isArray(face.contours)||!face.contours.length)continue;const contours=[];let valid=true;
        for(const contour of face.contours){
          if(contour.closed!==true||!Array.isArray(contour.edges)||!contour.edges.length){valid=false;break;}
          const edges=contour.edges.map(project);if(edges.some(e=>!e)){valid=false;break;}contours.push(edges);
        }
        if(!valid)continue;
        const edges=contours.flat(),b=unionBounds(edges.map(e=>e.bounds));
        this.projectedFaces.push({face,contours,bounds:b,depth:edges.reduce((n,e)=>n+e.depth,0)/edges.length});
      }
      this.projectedFaces.sort((a,b)=>a.depth-b.depth);
      this.projectedBounds=unionBounds([...this.projected.map(w=>w.bounds),...this.projectedFaces.map(f=>f.bounds)]);
    }
    _updateFitScale(){
      const b=this.projectedBounds;if(!b){this.fitScale=1;return;}
      const w=Math.max(1e-12,b[2]-b[0]),h=Math.max(1e-12,b[3]-b[1]);
      this.fitScale=Math.max(1e-12,Math.min(Math.max(1,this.width-42)/w,Math.max(1,this.height-52)/h));
    }
    fit(){
      const b=this.projectedBounds;this.center=b?[(b[0]+b[2])/2,(b[1]+b[3])/2]:[0,0];
      this._updateFitScale();this.zoomRatio=1;this.pan=[0,0];this._request();return this;
    }
    resize(){
      if(this.destroyed)return;
      const rect=this.host.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width||this.host.clientWidth||1)),h=Math.max(1,Math.round(rect.height||this.host.clientHeight||1)),dpr=clamp(Number(root.devicePixelRatio)||1,1,3);
      if(w===this.width&&h===this.height&&dpr===this.dpr)return;
      if(this.width>1)this.pan[0]*=w/this.width;if(this.height>1)this.pan[1]*=h/this.height;
      this.width=w;this.height=h;this.dpr=dpr;this.canvas.width=Math.max(1,Math.round(w*dpr));this.canvas.height=Math.max(1,Math.round(h*dpr));
      this._updateFitScale();this._request();
    }
    get scale(){return this.fitScale*this.zoomRatio;}
    _screen(p){return[(p[0]-this.center[0])*this.scale+this.width/2+this.pan[0],(p[1]-this.center[1])*this.scale+this.height/2+this.pan[1]];}
    _visibleBox(){const s=this.scale;return[this.center[0]+(-this.width/2-this.pan[0]-8)/s,this.center[1]+(-this.height/2-this.pan[1]-8)/s,this.center[0]+(this.width/2-this.pan[0]+8)/s,this.center[1]+(this.height/2-this.pan[1]+8)/s];}
    _appendPath(ctx,pw,connect=false){
      const p=pw.points.map(v=>this._screen(v));if(!connect)ctx.moveTo(p[0][0],p[0][1]);
      if(pw.kind==='cubic')ctx.bezierCurveTo(p[1][0],p[1][1],p[2][0],p[2][1],p[3][0],p[3][1]);else ctx.lineTo(p[1][0],p[1][1]);
    }
    _draw(){
      const ctx=this.ctx,d=this.dpr;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.setTransform(d,0,0,d,0,0);
      const dark=this.theme==='dark',wireColor=dark?'#d1dfef':'#33465a',fillColor=dark?'#8cb9e5':'#588eae',visible=this._visibleBox();
      ctx.lineCap='round';ctx.lineJoin='round';let faceCount=0,wireCount=0;
      if(this.fill)for(const pf of this.projectedFaces){
        if(!overlaps(pf.bounds,visible))continue;ctx.beginPath();
        for(const contour of pf.contours){let previous=null;
          for(const edge of contour){this._appendPath(ctx,edge,!!previous&&samePoint(previous,edge.points[0]));previous=edge.points[edge.points.length-1];}
          ctx.closePath();
        }
        ctx.globalAlpha=.16;ctx.fillStyle=colorValue(pf.face.fill||pf.face.color||pf.face.source_fill,fillColor);ctx.fill(pf.face.fillRule==='evenodd'?'evenodd':'nonzero');faceCount++;
      }
      ctx.globalAlpha=1;ctx.strokeStyle=wireColor;ctx.lineWidth=1.15;ctx.beginPath();
      for(const w of this.projected){if(!overlaps(w.bounds,visible))continue;this._appendPath(ctx,w);wireCount++;}if(wireCount)ctx.stroke();
      const selected=this.selectedWire&&this.projected.find(p=>p.wire===this.selectedWire);
      if(selected&&overlaps(selected.bounds,visible)){ctx.beginPath();this._appendPath(ctx,selected);ctx.strokeStyle='#007fff';ctx.globalAlpha=.85;ctx.lineWidth=2.6;ctx.stroke();ctx.globalAlpha=1;}
      if(this.projectedBounds)this._drawAxes(ctx,dark);
      this.drawCount++;this.lastRenderStats={visibleWires:wireCount,totalWires:this.projected.length,faces:faceCount,drawCount:this.drawCount,view:this.view,scale:this.scale,dpr:this.dpr};
    }
    _drawAxes(ctx,dark){
      const x=this.width-39,y=this.height-37,size=24,source=this.view==='source';
      const axes=source?[{label:'U',p:[1,0],color:'#b75b63'},{label:'V',p:[0,1],color:'#479566'}]:[
        {label:'X',p:[this.basis.right[0],this.basis.down[0]],color:'#c96770'},
        {label:'Y',p:[this.basis.right[1],this.basis.down[1]],color:'#449367'},
        {label:'Z',p:[this.basis.right[2],this.basis.down[2]],color:'#498ade'}];
      ctx.save();ctx.globalAlpha=.95;ctx.lineWidth=1.3;ctx.font='10px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      for(const a of axes){const dx=a.p[0]*size,dy=a.p[1]*size,len=Math.hypot(dx,dy);if(len<1)continue;
        ctx.strokeStyle=a.color;ctx.fillStyle=a.color;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);ctx.stroke();ctx.fillText(a.label,x+dx*1.28,y+dy*1.28);
      }
      ctx.fillStyle=dark?'#9daebe':'#8391a0';ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    pick(x,y,tolerance=6){
      let hit=null,best=tolerance;
      for(let i=this.projected.length-1;i>=0;i--){
        const wire=this.projected[i],a=this._screen([wire.bounds[0],wire.bounds[1]]),b=this._screen([wire.bounds[2],wire.bounds[3]]);
        if(x<a[0]-tolerance||x>b[0]+tolerance||y<a[1]-tolerance||y>b[1]+tolerance)continue;
        const distance=primitiveDistance(wire.kind,wire.points.map(p=>this._screen(p)),[x,y],.2);
        if(distance<best||(distance===best&&wire.depth>(hit?.depth??-Infinity))){best=distance;hit=wire;}
      }
      return hit?.wire||null;
    }
    _pick(x,y,touch){const wire=this.pick(x,y,touch?9:5);if(!wire)return;this.selectedWire=wire;this._request();this.onPick(wire);}
    _zoomAt(factor,x,y){
      const next=clamp(this.zoomRatio*factor,.02,10000),ratio=next/this.zoomRatio;if(!Number.isFinite(ratio)||ratio===1)return;
      this.pan[0]=x-this.width/2-ratio*(x-this.width/2-this.pan[0]);this.pan[1]=y-this.height/2-ratio*(y-this.height/2-this.pan[1]);this.zoomRatio=next;this._request();
    }
    _orbit(dx,dy){
      if(this.view==='source')return;const wasNamed=!this.orbit;
      this.yaw-=dx*.009;this.pitch=clamp(this.pitch+dy*.009,-Math.PI/2+.005,Math.PI/2-.005);this.orbit=true;this.view='iso';
      this._rebuild();this._request();
      if(wasNamed){if(this.onViewChange)this.onViewChange('iso');if(typeof root.CustomEvent==='function')this.host.dispatchEvent(new root.CustomEvent('c4-preview-view-change',{detail:{view:'iso',orbit:true},bubbles:true}));}
    }
    _point(e){const r=this.canvas.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top];}
    _multi(){const p=[...this.pointers.values()],center=[p.reduce((n,q)=>n+q[0],0)/p.length,p.reduce((n,q)=>n+q[1],0)/p.length];return{center,distance:p.length>1?Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]):0};}
    _bind(){
      const canvas=this.canvas;
      this._listen(canvas,'pointerdown',e=>{
        if(e.button===2)return;e.preventDefault();const p=this._point(e);this.pointers.set(e.pointerId,p);try{canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});}catch{}
        if(this.pointers.size>1){this.gesture={multi:true,moved:true,...this._multi()};return;}
        this.gesture={id:e.pointerId,start:p,last:p,moved:false,touch:e.pointerType==='touch',button:e.button||0,kind:this.view==='source'?'pan':e.button===1?(e.shiftKey?'orbit':'pan'):e.shiftKey?'pan':'orbit'};
      });
      this._listen(canvas,'pointermove',e=>{
        if(!this.pointers.has(e.pointerId))return;e.preventDefault();const p=this._point(e);this.pointers.set(e.pointerId,p);let g=this.gesture;if(!g)return;
        if(this.pointers.size>1){
          const now=this._multi();if(!g.multi){this.gesture={multi:true,moved:true,...now};return;}
          const dx=now.center[0]-g.center[0],dy=now.center[1]-g.center[1];
          if(this.pointers.size>=3&&this.view!=='source')this._orbit(dx,dy);
          else{if(g.distance>1&&now.distance>1)this._zoomAt(now.distance/g.distance,g.center[0],g.center[1]);this.pan[0]+=dx;this.pan[1]+=dy;this._request();}
          Object.assign(g,now);return;
        }
        if(!g.moved&&Math.hypot(p[0]-g.start[0],p[1]-g.start[1])<(g.touch?6:3))return;
        const dx=p[0]-g.last[0],dy=p[1]-g.last[1];g.moved=true;g.last=p;
        const pan=this.view==='source'||(g.button===1?!e.shiftKey:(g.kind==='pan'||e.shiftKey));
        if(pan){this.pan[0]+=dx;this.pan[1]+=dy;this._request();}else this._orbit(dx,dy);
      });
      const end=(e,cancel)=>{
        if(!this.pointers.has(e.pointerId))return;const g=this.gesture;this.pointers.delete(e.pointerId);try{canvas.releasePointerCapture(e.pointerId);}catch{}
        if(this.pointers.size>1){this.gesture={multi:true,moved:true,...this._multi()};return;}
        if(this.pointers.size===1){const [id,p]=[...this.pointers.entries()][0];this.gesture={id,start:p,last:p,moved:true,touch:true,kind:'pan'};return;}
        this.gesture=null;if(!cancel&&g&&!g.multi&&!g.moved&&g.button!==1){const p=this._point(e);this._pick(p[0],p[1],g.touch);}
      };
      this._listen(canvas,'pointerup',e=>end(e,false));this._listen(canvas,'pointercancel',e=>end(e,true));
      this._listen(canvas,'contextmenu',e=>e.preventDefault());
      this._listen(canvas,'wheel',e=>{
        e.preventDefault();const p=this._point(e),lineMode=(e.deltaMode||0)!==0,clearTick=lineMode||(e.deltaX===0&&Math.abs(e.deltaY)>=50&&Number.isInteger(e.deltaY));
        const device=this.wheelMode==='zoom'?'mouse':this.wheelMode==='pan'?'trackpad':this.navigationDevice;
        const zoom=e.ctrlKey||e.metaKey||device==='mouse'||(device==='auto'&&clearTick);
        if(zoom){const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.height:1),strength=(e.ctrlKey||e.metaKey)?0.008:0.0018;this._zoomAt(Math.exp(clamp(-delta*strength,-1.5,1.5)),p[0],p[1]);}
        else{this.pan[0]-=e.deltaX;this.pan[1]-=e.deltaY;this._request();}
      },{passive:false});
      this._listen(canvas,'keydown',e=>{if(e.key==='f'||e.key==='F'||e.key==='Home'){e.preventDefault();this.fit();}else if(e.key==='+'||e.key==='='){e.preventDefault();this._zoomAt(1.25,this.width/2,this.height/2);}else if(e.key==='-'){e.preventDefault();this._zoomAt(.8,this.width/2,this.height/2);}});
      if(root.addEventListener)this._listen(root,'blur',()=>{this.pointers.clear();this.gesture=null;});
    }
    destroy(){
      if(this.destroyed)return;this.destroyed=true;if(this.frame!==null)this._caf(this.frame);this.frame=null;this.observer?.disconnect();
      for(const [target,type,fn,options]of this._listeners)target.removeEventListener(type,fn,options);this._listeners=[];
      this.pointers.clear();this.gesture=null;this.canvas.remove();this.model=null;this.projected=[];this.projectedFaces=[];
    }
  }
  return{C4ComponentPreviewRenderer,basisFor,projectPoint,cubicAt,primitiveBounds,primitiveDistance,segmentDistance};
});
