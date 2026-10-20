/* One component inspector over the existing C4 graph. No second model database. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id),unique=a=>[...new Set(a)],number=id=>$(id).value.trim()===''?null:Number($(id).value);
  const elt=(tag,text,cls)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;};
  const fields={previewOriginU:['sourceOrigin',0],previewOriginV:['sourceOrigin',1],previewWorldX:['worldOrigin',0],previewWorldY:['worldOrigin',1],previewWorldZ:['worldOrigin',2],previewScale:['metersPerSourceUnit'],previewRotation:['rotationDeg'],previewDepth:['depthMeters']};
  const issueText={source_evidence_mismatch:'مصدر التمثيل لا يطابق مرجع الاعتماد',source_record_missing:'سجل خط معتمد غير موجود في المصدر',source_command_missing_or_unsupported:'أمر رسم غير متاح للمعاينة',unsupported_source_clip:'حد قصّ يحتاج معالجة إضافية',source_clipping_required:'جزء من الخط خارج القصّ المعتمد',partial_record_has_no_approved_face:'حدود غير مكتملة: تبقى خطوطًا فقط',open_source_profile:'مسار مفتوح: يبقى خطوطًا فقط',open_source_subpath:'مسار مفتوح: يبقى خطوطًا فقط',no_explicit_closed_profile_for_extrusion:'العمق يحتاج حدودًا مغلقة معتمدة',depth_not_explicitly_approved:'مرجع العمق أو اتجاهه غير مكتمل',unsupported_profile_command:'نوع الحد غير مدعوم للتعبئة',self_intersecting_profile:'حدود متقاطعة: أُبقيت خطوطًا فقط',curved_profile_extrusion_not_supported:'امتداد الحدود المنحنية غير متاح',intersecting_or_touching_source_contours:'حدود متقاطعة أو متلامسة: أُبقيت خطوطًا فقط',complex_profile_extrusion_deferred:'حدود كثيفة: أُبقيت خطوطًا دون إنشاء عمق',degenerate_source_profile:'مساحة الحدود غير صالحة لإنشاء عمق'};
  class C4ComponentPreviewController{
    constructor(state,actions){
      this.S=state;this.a=actions;this.active=false;this.component=null;this.model=null;this.pages=new Map();this.token=0;this.loadedRevision=-1;this.timer=0;this.renderer=null;this.capture=null;
      this.wire();
    }
    reset(){this.token++;this.component=null;this.model=null;this.pages.clear();this.loadedRevision=-1;this.S.previewPick=null;this.cancelCapture();if(this.renderer)this.renderer.setModel(null);$('componentPreviewElement').replaceChildren(new Option('اختر مكوّنًا معتمدًا',''));this.renderEmpty();}
    invalidate(){this.loadedRevision=-1;if(this.active){clearTimeout(this.timer);this.timer=setTimeout(()=>this.load(),80);}}
    selectionChanged(){const selection=this.selection();$('approvePreviewGroup').disabled=!selection;$('approvePreviewGroup').title=selection?'اعتماد عضوية هذه الخطوط للمكوّن؛ الموضع والأبعاد تبقى بحسب مصادرها':'اختر مجموعة واحدة أو خطوط المكوّن في لوحة واحدة';}
    selection(){
      const S=this.S;
      if(!S.store||!S.page)return null;
      if(S.loose.size)return{page_id:S.page.id,item_ids:[...S.loose],bbox:this.a.currentItemBounds(S.loose),name:'مكوّن من '+this.a.sheetLabel(S.page)};
      const same=S.draft.filter(r=>r.page_id===S.page.id);
      if(same.length===1)return same[0];
      return S.draft.length===1?S.draft[0]:null;
    }
    async open(){
      this.active=true;this.S.history=false;
      $('draftContent').classList.add('hidden');$('historyContent').classList.add('hidden');$('commitPanel').classList.add('hidden');$('componentPreviewPanel').classList.remove('hidden');
      $('draftTab').classList.remove('active');$('historyTab').classList.remove('active');$('componentPreviewTab').classList.add('active');$('selectionHeading').textContent='محاكي المكوّن';
      document.body.classList.remove('inspector-collapsed');this.a.syncDesktopControls?.();
      if(this.a.isMobile()&&!$('selectionSidebar').classList.contains('mobile-open'))this.a.toggleMobilePanel('selectionSidebar','toggleSelections');
      if(!this.renderer)this.renderer=new root.C4ComponentPreviewRenderer($('componentPreviewViewport'),{onPick:wire=>this.pickWire(wire),onViewChange:view=>{$('componentPreviewView').value=view;}});
      this.selectionChanged();
      await this.load();requestAnimationFrame(()=>this.renderer?.resize());
    }
    close(){this.active=false;clearTimeout(this.timer);document.body.classList.remove('preview-expanded');$('expandComponentPreview').setAttribute('aria-pressed','false');$('componentPreviewPanel').classList.add('hidden');$('componentPreviewTab').classList.remove('active');this.cancelCapture();this.clearPick();}
    clearPick(){if(this.S.previewPick){this.S.previewPick=null;this.a.redraw();}$('previewSelectedLine').textContent='';}
    renderEmpty(message){
      this.cancelCapture();this.clearPick();
      $('componentPreviewStatus').textContent=message||'اختر مجموعة من المخطط واعتمد خطوطها للمعاينة. الخطوط المؤقتة لا تدخل التصوّر.';
      $('componentPreviewSources').replaceChildren();$('previewSourceSelect').replaceChildren(new Option('اختر تمثيلًا',''));$('previewSelectedLine').textContent='';this.populateFrame();this.renderer?.setModel(null);
    }
    async load(preferredId){
      if(!this.active||!this.S.store)return;
      const store=this.S.store,revision=Number(store.getMeta('revision')||0),token=++this.token;
      const components=store.listApprovedComponents(),select=$('componentPreviewElement'),previous=preferredId||select.value||$('targetElement').value;
      select.replaceChildren(new Option('اختر مكوّنًا معتمدًا',''));
      for(const c of components)select.add(new Option((c.name_ar||c.name||c.element_id)+' · '+c.representations.length+' تمثيل',c.element_id));
      const chosen=components.find(c=>c.element_id===previous)||components.find(c=>c.representations.some(r=>this.S.draft.some(d=>d.id===r.id)))||(components.length===1?components[0]:null);
      if(!chosen){this.component=null;this.model=null;this.pages.clear();this.renderEmpty(components.length?'اختر المكوّن المعتمد من القائمة.':undefined);return;}
      select.value=chosen.element_id;
      if(this.component?.element_id===chosen.element_id&&this.loadedRevision===revision&&this.model){this.renderModel();return;}
      const priorId=this.component?.element_id;if(priorId!==chosen.element_id){this.cancelCapture();this.clearPick();}this.component=chosen;this.model=null;this.pages.clear();$('componentPreviewStatus').textContent='جارٍ قراءة الخطوط المعتمدة ومراجعها…';
      try{
        const members=new Map();for(const rep of chosen.representations){if(!members.has(rep.page_id))members.set(rep.page_id,[]);members.get(rep.page_id).push(...rep.item_ids);}
        for(const [pageId,itemIds]of members){
          const packet=await this.a.getPagePacket(pageId);if(token!==this.token||store!==this.S.store)return;
          // Keep only the approved source records and their exact clip scopes.
          this.pages.set(pageId,{page:packet.page,rows:root.C4ComponentModel.selectApprovedRows(packet.rows,unique(itemIds)),source_sha256:packet.source_sha256,drawings_sha256:packet.drawings_sha256});
        }
        if(token!==this.token)return;
        this.model=root.C4ComponentModel.build({component:chosen,pages:this.pages,includeFaces:true,includeExtrusion:true});
        this.loadedRevision=revision;
        const sourceSelect=$('previewSourceSelect'),oldRep=sourceSelect.value;sourceSelect.replaceChildren();
        for(const rep of chosen.representations)sourceSelect.add(new Option(this.a.sheetLabel(this.a.pageOf(rep.page_id))+' · '+(rep.name_ar||rep.name||'تمثيل'),rep.id));
        if(chosen.representations.some(r=>r.id===oldRep))sourceSelect.value=oldRep;
        else{const here=chosen.representations.find(r=>r.page_id===this.S.page?.id);if(here)sourceSelect.value=here.id;}
        if(!this.model.wires.length)$('componentPreviewView').value='source';
        if(priorId!==chosen.element_id)$('previewSelectedLine').textContent='';
        this.populateFrame();this.renderModel();this.renderSources();this.selectionChanged();
      }catch(error){if(token===this.token){this.model=null;this.renderEmpty('تعذّرت قراءة معاينة المكوّن: '+error.message);this.a.showError(error);}}
    }
    representation(){return this.component?.representations.find(r=>r.id===$('previewSourceSelect').value)||null;}
    renderModel(){
      if(!this.model||!this.renderer)return;
      const view=$('componentPreviewView').value,fill=$('componentPreviewMode').value==='sourceFill',sourceId=$('previewSourceSelect').value,source=this.model.sourceViews.find(v=>v.representation_id===sourceId);
      this.renderer.setModel(this.model,{view,sourceRepresentationId:sourceId,fill,theme:this.a.resolvedTheme(),navigationDevice:this.S.navigationDevice||'auto'});
      const count=view==='source'?(source?.wires.length||0):this.model.wires.length,unresolved=this.model.unresolved.length;
      const prefix=view==='source'?'رسم المصدر · '+count.toLocaleString('ar-AE')+' ضلع معتمد':'تجميع المحاور المعتمدة · '+count.toLocaleString('ar-AE')+' ضلع';
      const placement=view==='source'?(source?.placement_status==='approved'?' · موضع التمثيل معتمد':' · الموضع ثلاثي الأبعاد غير معتمد'):(unresolved?' · '+unresolved+' تمثيل بانتظار الموضع والمقياس':'');
      const faces=view==='source'?source?.faces.length:this.model.faces.length;
      $('componentPreviewStatus').textContent=prefix+placement+(fill&&!faces?' · لا توجد حدود مغلقة مكتملة للتعبئة':'')+(this.model.issues.some(i=>i.severity!=='profile_only')?' · تفاصيل الأجزاء المستبعدة في المصادر':'');
      for(const option of $('componentPreviewView').options)if(option.value!=='source')option.disabled=!this.model.wires.length;
    }
    renderSources(){
      const host=$('componentPreviewSources');host.replaceChildren();
      for(const rep of this.component?.representations||[]){
        const page=this.a.pageOf(rep.page_id),view=this.model.sourceViews.find(v=>v.representation_id===rep.id),card=elt('div',null,'preview-source-card'),btn=elt('button',this.a.sheetLabel(page)+' · '+(rep.name_ar||rep.name||'تمثيل'),'small');
        btn.onclick=async()=>{this.cancelCapture();this.clearPick();$('previewSourceSelect').value=rep.id;this.populateFrame();$('componentPreviewView').value='source';this.renderModel();await this.a.openPage(rep.page_id,rep.bbox||rep.bbox_points);};
        card.append(btn,elt('p',rep.item_ids.length.toLocaleString('ar-AE')+' أمر معتمد · '+(view?.placement_status==='approved'?'موضع معتمد':'موضع غير معتمد')));
        const src=this.a.sourceOf(rep.source_id);card.append(elt('p',(src?.filename||'')+' · صفحة '+page?.page_number));
        const orient=rep.orientation?.orientation;card.append(elt('p',orient==='horizontal'?'المصدر يشير إلى مسقط أفقي؛ التموضع بحسب اعتمادك':orient==='vertical'?'المصدر يشير إلى واجهة أو قطاع؛ المحور بحسب اعتمادك':'اتجاه التمثيل لا يُحسم من عنوان اللوحة'));
        for(const code of unique((view?.issues||[]).map(i=>i.code)).slice(0,6))card.append(elt('p',issueText[code]||'جزء من التمثيل يحتاج معالجة قبل التعبئة أو التجميع'));
        host.append(card);
      }
    }
    populateFrame(){
      const rep=this.representation(),m=rep?.placement?.mapping||{};
      for(const[id,path]of Object.entries(fields)){const value=path.length===2?m[path[0]]?.[path[1]]:m[path[0]];$(id).value=Number.isFinite(value)?String(value):'';}
      $('previewPlane').value=m.plane||'';$('previewUSign').value=m.uSign===-1?'-1':'1';$('previewVSign').value=m.vSign===-1?'-1':'1';$('previewDepthDirection').value=m.depthDirection===-1?'-1':'1';
      $('previewReference').value=rep?.placement?.reference||rep?.placement?.approval_context?.reference||'';$('previewDepthReference').value=m.depthReference||'';$('previewKnownDistance').value='';
      $('previewApproveFrame').disabled=!rep;$('previewRevokeFrame').disabled=!rep||rep.placement?.status!=='approved';$('previewPickCalibration').disabled=!rep;$('previewPickOrigin').disabled=!rep;
    }
    mapping(){
      const m={plane:$('previewPlane').value||null,sourceOrigin:[number('previewOriginU'),number('previewOriginV')],worldOrigin:[number('previewWorldX'),number('previewWorldY'),number('previewWorldZ')],metersPerSourceUnit:number('previewScale'),rotationDeg:number('previewRotation'),uSign:Number($('previewUSign').value),vSign:Number($('previewVSign').value)};
      const depth=number('previewDepth');if(depth!==null)Object.assign(m,{depthMeters:depth,depthDirection:Number($('previewDepthDirection').value),depthApproved:true,depthReference:$('previewDepthReference').value.trim()});return m;
    }
    async saveFrame(){
      const rep=this.representation();if(!rep)return;
      try{
        const mapping=this.mapping(),reference=$('previewReference').value.trim(),valid=root.C4ComponentModel.validateFrame(mapping);
        if(!reference)throw Error('اكتب مرجع الموضع والمقياس من المخطط.');
        if(!valid.valid)throw Error('أكمل مستوى التمثيل، والأصل في الرسم والمشروع، والمقياس والدوران. القيمة المجهولة تبقى فارغة.');
        if(valid.extrusion.requested&&!valid.extrusion.valid)throw Error('لإضافة العمق أدخل قيمة موجبة، واتجاهًا، ومرجع البُعد المثبت.');
        this.S.store.saveRepresentationFrame(this.component.element_id,rep.id,mapping,{approve:true,reference});
        await this.changed();this.a.notify('حُفظ موضع التمثيل ومقياسه بمراجعه. أُضيفت الخطوط المعتمدة إلى التجميع.');
      }catch(error){this.a.showError(error);}
    }
    async revokeFrame(){const rep=this.representation();if(!rep)return;try{this.S.store.revokeRepresentationFrame(this.component.element_id,rep.id);await this.changed();this.a.notify('أُلغي اعتماد الموضع. بقيت خطوط المصدر المعتمدة محفوظة.');}catch(error){this.a.showError(error);}}
    async changed(preferredId){
      this.a.refreshGroupMaps();this.a.setDirty(true);this.a.renderDraft();this.a.renderHistory();this.a.redraw();await this.a.saveRecovery();clearTimeout(this.timer);this.loadedRevision=-1;await this.load(preferredId);
    }
    async approveSelection(){
      const selection=this.selection();if(!selection)return;
      try{const result=this.S.store.approveComponentGeometry(selection,{name:selection.name_ar||selection.name});await this.changed(result.component?.element_id||result.element?.id);this.a.notify('اعتمدت عضوية خطوط المكوّن للمعاينة. أضف موضعه ومقياسه من المصدر لتجميعه ثلاثي الأبعاد.');}catch(error){this.a.showError(error);}
    }
    async pickWire(wire){
      if(!wire?.item_id||!wire.page_id)return;
      this.cancelCapture();if(this.component?.representations.some(r=>r.id===wire.representation_id)&&$('previewSourceSelect').value!==wire.representation_id){$('previewSourceSelect').value=wire.representation_id;this.populateFrame();}
      const world=wire.points?.[0]?.length===3,pts=wire.points||[],origin=pts[0]||[],epsilon=1e-7;
      const horizontal=world&&pts.every(p=>Math.abs(p[2]-origin[2])<epsilon),vertical=world&&pts.every(p=>Math.abs(p[0]-origin[0])<epsilon&&Math.abs(p[1]-origin[1])<epsilon);
      const direction=world?(vertical?'عمودي في المشروع':horizontal?'أفقي في المشروع':'مائل في المشروع'):'اتجاه على لوحة المصدر فقط';
      $('previewSelectedLine').replaceChildren(elt('span',this.a.sheetLabel(this.a.pageOf(wire.page_id))+' · '+direction+' '),elt('bdi',wire.item_id));
      this.S.previewPick={page_id:wire.page_id,item_id:wire.item_id};
      if(this.S.page?.id!==wire.page_id)await this.a.openPage(wire.page_id);
      const item=this.a.getItem(wire.item_id);if(item)this.a.focusBounds(item.bbox);this.a.redraw();
    }
    cancelCapture(){this.capture=null;this.S.previewCapture=null;$('viewport').classList.remove('calibrating');}
    async beginCapture(kind){
      const rep=this.representation();if(!rep)return;
      const distance=number('previewKnownDistance');if(kind==='axis'&&!(distance>0)){this.a.notify('أدخل المسافة المثبتة بين نقطتي المعايرة بالمتر أولًا.',true);return;}
      if(this.S.page?.id!==rep.page_id&&!await this.a.openPage(rep.page_id))return;
      if(this.representation()?.id!==rep.id)return;
      document.body.classList.remove('preview-expanded');$('expandComponentPreview').setAttribute('aria-pressed','false');this.a.closeMobilePanels();this.a.setMode('select');
      const bbox=this.a.currentItemBounds(rep.item_ids);if(bbox)this.a.focusBounds(bbox);
      this.capture={kind,rep,distance,points:[]};this.S.previewCapture=q=>this.capturePoint(q);$('viewport').classList.add('calibrating');
      this.a.notify(kind==='axis'?'اختر نقطة الأصل ثم نقطة على اتجاه U الموجب، من نهايات الخطوط المعتمدة. Esc للإلغاء.':'اختر نقطة الأصل من نهاية خط معتمد. Esc للإلغاء.');
    }
    capturePoint(q){
      const capture=this.capture;if(!capture)return;
      if(this.S.page?.id!==capture.rep.page_id||this.representation()?.id!==capture.rep.id||this.representation()?.approval_signature!==capture.rep.approval_signature){this.cancelCapture();this.a.notify('تغيّر التمثيل. ابدأ التقاط المعايرة للتمثيل الحالي.');return;}
      const p=this.a.sourcePoint(q),tolerance=(this.S.pointerType==='touch'?14:9)/this.S.zoom;let best=null,distance=Infinity;
      for(const id of capture.rep.item_ids){const item=this.a.getItem(id);if(!item)continue;const c=item.command;let pts=[];
        if(c[0]==='l')pts=c.slice(1);else if(c[0]==='c')pts=[c[1],c[4]];else if(c[0]==='re'){const b=c[1];pts=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];}else if(c[0]==='qu')pts=c[1];
        for(const point of pts){const d=Math.hypot(p[0]-point[0],p[1]-point[1]);if(d<distance){distance=d;best={point,item_id:id};}}
      }
      if(!best||distance>tolerance){this.a.notify('قرّب واختر نهاية خط من خطوط هذا المكوّن المعتمدة.');return;}
      capture.points.push(best);this.S.previewPick={page_id:capture.rep.page_id,item_id:best.item_id};this.a.redraw();
      if(capture.points.length===1){$('previewOriginU').value=best.point[0];$('previewOriginV').value=best.point[1];if(capture.kind==='axis'){this.a.notify('التُقط الأصل. اختر النقطة الثانية على اتجاه U الموجب.');return;}}
      if(capture.kind==='axis'){
        const a=capture.points[0].point,b=capture.points[1].point,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
        if(length<1e-9){capture.points.pop();this.a.notify('اختر نقطة ثانية مختلفة.');return;}
        const us=Number($('previewUSign').value),vs=Number($('previewVSign').value);$('previewScale').value=String(capture.distance/length);$('previewRotation').value=String(-Math.atan2(vs*dy,us*dx)*180/Math.PI);
      }
      this.cancelCapture();$('componentPreviewCalibration').open=true;$('previewAdvancedFrameDetails').open=true;
      if(this.a.isMobile()&&!$('selectionSidebar').classList.contains('mobile-open'))this.a.toggleMobilePanel('selectionSidebar','toggleSelections');
      this.a.notify('التُقطت المعايرة. أكمل مستوى التمثيل وموضع الأصل ومرجعه، ثم اضغط «اعتماد الموضع والمقياس».');
    }
    wire(){
      $('openComponentPreview').onclick=() => this.open();$('componentPreviewTab').onclick=()=>this.open();$('closeComponentPreview').onclick=()=>this.a.switchSelectionTab(false);
      $('componentPreviewElement').onchange=()=>{this.cancelCapture();this.clearPick();this.loadedRevision=-1;this.load($('componentPreviewElement').value);};
      $('componentPreviewMode').onchange=()=>this.renderModel();$('componentPreviewView').onchange=()=>this.renderModel();
      $('previewSourceSelect').onchange=()=>{this.cancelCapture();this.populateFrame();this.renderModel();};
      $('componentPreviewFit').onclick=()=>this.renderer?.fit();
      $('expandComponentPreview').onclick=()=>{const expanded=document.body.classList.toggle('preview-expanded');$('expandComponentPreview').setAttribute('aria-pressed',String(expanded));requestAnimationFrame(()=>this.renderer?.resize());};
      $('approvePreviewGroup').onclick=()=>this.approveSelection();$('previewApproveFrame').onclick=()=>this.saveFrame();$('previewRevokeFrame').onclick=()=>this.revokeFrame();
      $('previewPickOrigin').onclick=()=>this.beginCapture('origin');$('previewPickCalibration').onclick=()=>this.beginCapture('axis');
      document.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.capture){e.preventDefault();e.stopImmediatePropagation();this.cancelCapture();this.a.notify('أُلغي التقاط المعايرة.');}},true);
      window.addEventListener('c4-db-ready',()=>{this.selectionChanged();if(this.active)this.load();});
    }
  }
  root.C4ComponentPreviewController=C4ComponentPreviewController;
})(globalThis);
