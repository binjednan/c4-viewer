/* C4's only editable graph is held in the supplied SQLite database. */
(function (global) {
  'use strict';
  const AUTHOR = 'C4 Drawing Linker';
  const ITEM = /^(pdf_[a-f0-9]+:p\d+):r\d+:i\d+$/;
  const classification = () => {
    if (global.C4Classification) return global.C4Classification;
    if (typeof require==='function') return require('./classification.js');
    fail('CLASSIFICATION_UNAVAILABLE','تعذّر تحميل قواعد الأقسام والفئات؛ لم يُعتمد ربط جديد.');
  };
  const json = value => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return value; }
  };
  const unique = values => [...new Set(values || [])];
  const fail = (code, message, details) => {
    const error = new Error(message); error.code = code; error.details = details; throw error;
  };
  const uuid = () => {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (!global.crypto || !global.crypto.getRandomValues) fail('NO_RANDOM', 'المتصفح لا يدعم إنشاء معرّف آمن.');
    global.crypto.getRandomValues(bytes); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const h = Array.from(bytes, n => n.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  };
  // Deterministic SHA-256 identities depend on source item IDs, never screen positions.
  function sha256(text) {
    const input = new TextEncoder().encode(text);
    const size = Math.ceil((input.length + 9) / 64) * 64;
    const bytes = new Uint8Array(size); bytes.set(input); bytes[input.length] = 128;
    const view = new DataView(bytes.buffer);
    view.setUint32(size - 8, Math.floor(input.length / 0x20000000));
    view.setUint32(size - 4, (input.length * 8) >>> 0);
    const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const r = (n, b) => (n >>> b) | (n << (32 - b));
    const w = new Uint32Array(64);
    for (let offset = 0; offset < size; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = w[i-15], b = w[i-2];
        w[i] = (w[i-16] + (r(a,7)^r(a,18)^(a>>>3)) + w[i-7] + (r(b,17)^r(b,19)^(b>>>10))) >>> 0;
      }
      let [a,b,c,d,e,f,g,z] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (z + (r(e,6)^r(e,11)^r(e,25)) + ((e&f)^(~e&g)) + k[i] + w[i]) >>> 0;
        const t2 = ((r(a,2)^r(a,13)^r(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0;
        z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
      }
      [a,b,c,d,e,f,g,z].forEach((n,i) => { h[i] = (h[i] + n) >>> 0; });
    }
    return h.map(n => n.toString(16).padStart(8,'0')).join('');
  }

  class C4Store {
    constructor(database) { this.db = database; this._groups = null; this._classificationCache=null; this._classificationCatalog=null; }
    _rows(sql, parameters = []) {
      const statement = this.db.prepare(sql), result = [];
      try { statement.bind(parameters); while (statement.step()) result.push(statement.getAsObject()); }
      finally { statement.free(); }
      return result;
    }
    _one(sql, parameters = []) { return this._rows(sql, parameters)[0] || null; }
    _run(sql, parameters = []) { this.db.run(sql, parameters); }
    _atomic(operation) {
      this.db.run('BEGIN TRANSACTION');
      try { const result = operation(); this.db.run('COMMIT'); this._groups = null; this._classificationCache=null; return result; }
      catch (error) { this.db.run('ROLLBACK'); this._groups = null; this._classificationCache=null; throw error; }
    }
    _bump() {
      this.setMeta('revision', Number(this.getMeta('revision') || 0) + 1);
      this.setMeta('last_modified_at_utc', new Date().toISOString());
    }
    getMeta(key) { const row = this._one('SELECT value FROM metadata WHERE key=?', [key]); return row ? json(row.value) : null; }
    setMeta(key, value) { this._run('INSERT OR REPLACE INTO metadata(key,value) VALUES(?,?)', [key, JSON.stringify(value)]); }
    getSources() { return this._rows('SELECT id,filename,sha256,page_count FROM sources ORDER BY filename'); }
    _page(row) {
      if (!row) return null;
      for (const key of ['frames','door_tags','sheet_candidates']) if (key in row) row[key] = json(row[key]);
      return row;
    }
    catalog() {
      return this._rows('SELECT id,source_id,page_number,width,height,rotation,frames,search_text,door_tags,sheet_candidates,title_candidate,pdf_label FROM pages ORDER BY source_id,page_number').map(row => this._page(row));
    }
    getPage(id) { return this._page(this._one('SELECT * FROM pages WHERE id=?', [id])); }
    getSourcePDF(id) { const row = this._one('SELECT pdf_bytes FROM sources WHERE id=?', [id]); return row ? row.pdf_bytes : null; }
    getNode(id) { const row = this._one('SELECT data FROM nodes WHERE id=?', [id]); return row ? json(row.data) : null; }
    getRelation(id) { const row = this._one('SELECT data FROM relations WHERE id=?', [id]); return row ? json(row.data) : null; }
    getRelationsForNode(id) { return this._rows('SELECT data FROM relations WHERE from_id=? OR to_id=?', [id,id]).map(row => json(row.data)); }
    listGroups(pageId, options={}) {
      if (!this._groups) {
        this._groups = new Map();
        for (const row of this._rows('SELECT data FROM nodes')) {
          const n = json(row.data);
          if (!n || !n.page_id || n.kind === 'source_graphic_item' || (!Array.isArray(n.record_ids) && !Array.isArray(n.item_ids))) continue;
          if (!this._groups.has(n.page_id)) this._groups.set(n.page_id, []);
          this._groups.get(n.page_id).push(n);
        }
      }
      const result=pageId ? [...(this._groups.get(pageId) || [])] : [...this._groups.values()].flat();
      if (options.includeSuppressed) return result;
      const suppressed=this._classificationState().groupOverrides;
      return result.filter(g=>!suppressed.get(g.id)?.suppressed);
    }
    getRepresentationItems(id) {
      return this._rows("SELECT from_id FROM relations WHERE type='hierarchy_member' AND to_id=?", [id]).map(row => row.from_id).filter(id => ITEM.test(id));
    }
    _identityRelations(id) {
      return this._rows("SELECT data FROM relations WHERE type='alternative_representation' AND from_id=?", [id]).map(row => json(row.data)).filter(r => r.created_by === AUTHOR && /^owner_confirmed_same_(element|type)_identity$/.test(r.scope || ''));
    }
    getElementForRepresentation(id) {
      const links = this._identityRelations(id), ids = unique(links.map(r => r.to_id));
      if (ids.length > 1) fail('MULTIPLE_IDENTITIES', 'هذه المجموعة مرتبطة بأكثر من هوية؛ يلزم تصحيح الربط قبل المتابعة.', {representation_id:id, element_ids:ids});
      return ids.length ? this.getNode(ids[0]) : null;
    }
    _normalize(selection) {
      if (!selection || typeof selection.page_id !== 'string') fail('INVALID_SELECTION', 'اختيار بلا مرجع لوحة.');
      if (!this._one('SELECT id FROM pages WHERE id=?', [selection.page_id])) fail('UNKNOWN_PAGE', 'اللوحة المختارة غير موجودة في قاعدة المشروع.');
      const existing = selection.id ? this.getNode(selection.id) : null;
      if (existing) {
        if (existing.page_id !== selection.page_id || existing.kind === 'source_graphic_item') fail('INVALID_GROUP', 'معرّف المجموعة لا يطابق اللوحة المختارة.');
        const items = unique([...(existing.item_ids || []), ...this.getRepresentationItems(existing.id)]).sort();
        if (!items.length) fail('EMPTY_GROUP', 'المجموعة المختارة لا تحتوي روابط خطوط محفوظة.');
        return {existing:true,id:existing.id,page_id:existing.page_id,item_ids:items,record_ids:unique(items.map(id=>id.slice(0,id.lastIndexOf(':i')))),name:existing.name_ar || existing.name || selection.name || existing.mark || 'مجموعة رسم',mark:existing.mark || selection.mark || null,bbox:existing.bbox_points || existing.bbox || selection.bbox || null,identity_level:selection.identity_level || null};
      }
      const items = unique(selection.item_ids).sort();
      if (!items.length) fail('EMPTY_SELECTION', 'حدد خطوطًا قبل إضافتها إلى الربط.');
      for (const id of items) {
        const match = typeof id === 'string' && id.match(ITEM);
        if (!match || match[1] !== selection.page_id) fail('INVALID_ITEM', 'كل مجموعة رسم يجب أن تحتوي معرّفات خطوط من لوحتها نفسها.', {item_id:id});
      }
      const signature = sha256(JSON.stringify({page_id:selection.page_id,item_ids:items}));
      const id = 'C4:RG:' + signature.slice(0,32), found = this.getNode(id);
      if (found) {
        if (JSON.stringify([...(found.item_ids || [])].sort()) !== JSON.stringify(items)) fail('IDENTITY_COLLISION', 'تعارض في معرّف المجموعة؛ لم يتغير الربط.');
        return this._normalize({...selection,id});
      }
      return {existing:false,id,page_id:selection.page_id,item_ids:items,record_ids:unique(items.map(id=>id.slice(0,id.lastIndexOf(':i')))),name:selection.name || selection.mark || 'مجموعة رسم محددة',mark:selection.mark || null,bbox:Array.isArray(selection.bbox) ? selection.bbox.slice() : null,identity_level:selection.identity_level || null};
    }
    _overlapTargets(items) {
      const result = new Map();
      for (let offset=0; offset<items.length; offset+=350) {
        const chunk=items.slice(offset,offset+350), placeholders=chunk.map(()=>'?').join(',');
        const rows=this._rows(`SELECT DISTINCT link.data FROM relations membership JOIN relations link ON membership.to_id=link.from_id WHERE membership.type='hierarchy_member' AND membership.from_id IN (${placeholders}) AND link.type='alternative_representation'`,chunk);
        for (const row of rows) { const r=json(row.data); if (r.created_by===AUTHOR && /^owner_confirmed_same_(element|type)_identity$/.test(r.scope || '')) result.set(r.id,r); }
      }
      return [...result.values()];
    }
    _insertNode(node, created) {
      if (this.getNode(node.id)) return false;
      this._run('INSERT INTO nodes(id,data) VALUES(?,?)',[node.id,JSON.stringify(node)]); created.push(node.id); return true;
    }
    _insertRelation(relation, created) {
      const found=this.getRelation(relation.id);
      if (found) {
        if (found.from_id!==relation.from_id || found.to_id!==relation.to_id || found.type!==relation.type) fail('RELATION_COLLISION','تعارض في معرّف العلاقة؛ لم يتغير الربط.');
        return false;
      }
      this._run('INSERT INTO relations(id,type,from_id,to_id,data) VALUES(?,?,?,?,?)',[relation.id,relation.type,relation.from_id,relation.to_id,JSON.stringify(relation)]);created.push(relation.id);return true;
    }
    _relation(type, fromId, toId, scope, decisionId, sources) {
      return {id:'C4REL:'+sha256(fromId+'\0'+type+'\0'+toId).slice(0,24),type,from_id:fromId,to_id:toId,direction:'from_to',sources,grade:4,status:'غير مفحوص',user_status:'معتمد',owner_confirmed:true,scope,record_class:'owner_confirmed_source_binding',engineering_validated:false,physical_assembly_asserted:false,decision_id:decisionId,created_by:AUTHOR};
    }
    _classificationContext(pageId) {
      if (!this._classificationCatalog) {
        const pageMeta=new Map((this.getMeta('page_catalog') || []).map(p=>[p.id,p]));
        const sourceMeta=new Map((this.getMeta('source_catalog') || []).map(s=>[s.id,s]));
        this._classificationCatalog={pages:new Map(this.catalog().map(p=>[p.id,{...pageMeta.get(p.id),...p}])),sources:new Map(this.getSources().map(s=>[s.id,{...sourceMeta.get(s.id),...s}])),resources:this.getMeta('web_resources')};
      }
      const page=this._classificationCatalog.pages.get(pageId);
      if (!page) fail('UNKNOWN_PAGE','اللوحة المختارة غير موجودة في قاعدة المشروع.');
      return {page,source:this._classificationCatalog.sources.get(page.source_id)};
    }
    _classificationState() {
      if (this._classificationCache) return this._classificationCache;
      const state={bindings:new Map(),pages:new Map(),representationItems:new Map(),groupOverrides:new Map(),enabled:true};
      for (const row of this._rows('SELECT data FROM nodes')) {
        const n=json(row.data);
        if (n.kind==='drawing_classification_policy') state.enabled=n.enabled!==false;
        if (n.kind==='drawing_group_override') state.groupOverrides.set(n.target_group_id,n);
        if (n.kind!=='drawing_classification') continue;
        state.bindings.set(n.target_key,n);
        if(n.target.kind==='representation' && ['owner','suppressed'].includes(n.mode))for(const itemId of n.target.item_ids || []){let bindings=state.representationItems.get(itemId);if(!bindings)state.representationItems.set(itemId,bindings=[]);bindings.push(n);}
        const pageId=n.target.page_id;
        if (!state.pages.has(pageId))state.pages.set(pageId,{layers:new Map(),ranges:[]});
        const p=state.pages.get(pageId);
        if (n.target.kind==='layer') {
          p.layers.set(n.target.layer,n);
          for (const range of n.source_membership?.record_ranges || [])p.ranges.push({first:range[0],last:range[1],binding:n});
        }
      }
      for (const p of state.pages.values())p.ranges.sort((a,b)=>a.first-b.first);
      this._classificationCache=state;return state;
    }
    _classificationTarget(input) {
      if (typeof input==='string') {
        const group=this.getNode(input);if (!group?.page_id)fail('INVALID_CLASSIFICATION_TARGET','اختر مجموعة رسم أو خطوطًا من لوحة واحدة.');
        input={id:input,page_id:group.page_id};
      }
      if (!input?.page_id)fail('INVALID_CLASSIFICATION_TARGET','مرجع اللوحة مطلوب للتصنيف.');
      this._classificationContext(input.page_id);
      if (Object.prototype.hasOwnProperty.call(input,'layer')) return {kind:'layer',page_id:input.page_id,layer:String(input.layer || '')};
      if (input.item_id) {
        const match=String(input.item_id).match(ITEM);
        if (!match || match[1]!==input.page_id)fail('INVALID_ITEM','معرّف الخط لا يطابق اللوحة.');
        return {kind:'item',page_id:input.page_id,item_id:input.item_id};
      }
      const rep=this._normalize(input);
      return {kind:'representation',page_id:rep.page_id,representation_id:rep.id,item_ids:rep.item_ids};
    }
    _classificationKey(target) {
      return target.kind==='layer'?target.page_id+'|layer|'+target.layer:target.kind==='item'?target.page_id+'|item|'+target.item_id:target.page_id+'|representation|'+target.representation_id;
    }
    _classificationWitness(target) {
      const {page,source}=this._classificationContext(target.page_id);
      return {file:source.filename,source_id:source.id,source_sha256:source.sha256,page:page.page_number,page_id:page.id,locator:target.kind==='layer'?'drawing.layer = '+JSON.stringify(target.layer):target.item_id || target.representation_id,resource_sha256:this._classificationCatalog.resources?.pages?.[page.id]?.drawings?.sha256 || null};
    }
    _classificationValue(binding, fallback) {
      if (binding?.mode==='suppressed')return {section:null,category:null,graphic_kind:null,status:'unknown',method:'owner_suppressed',suppressed:true,target:binding.target,sources:binding.sources || [],identity_established:false,engineering_validated:false};
      if (binding?.mode==='owner')return {...binding.classification,target:binding.target,sources:binding.sources || []};
      if (!this._classificationState().enabled)return {section:null,category:null,graphic_kind:null,status:'unknown',method:'automatic_classification_disabled',identity_established:false,engineering_validated:false};
      const value=binding?.classification || fallback;
      return value ? {...value,sources:binding?.sources || value.sources || []} : {section:null,category:null,graphic_kind:null,status:'unknown',method:'unresolved',identity_established:false,engineering_validated:false};
    }
    _explicitItemClassification(pageId, itemId) {
      const state=this._classificationState(),direct=state.bindings.get(pageId+'|item|'+itemId);
      const bindings=[...(state.representationItems.get(itemId) || []),...(direct?[direct]:[])];
      if(!bindings.length)return null;
      const owners=bindings.filter(b=>b.mode==='owner'),suppressed=bindings.filter(b=>b.mode==='suppressed');
      const ownerRevision=Math.max(-1,...owners.map(b=>Number(b.decision_revision || 0))),latestSuppression=suppressed.sort((a,b)=>Number(b.decision_revision || 0)-Number(a.decision_revision || 0))[0];
      if(latestSuppression && Number(latestSuppression.decision_revision || 0)>=ownerRevision)return this._classificationValue(latestSuppression);
      if(owners.length===1)return this._classificationValue(owners[0]);
      if(owners.length){const values=owners.map(b=>this._classificationValue(b));return {...classification().combine(values),method:'owner_classification',sources:values.flatMap(v=>v.sources || [])};}
      return null;
    }
    _writeClassification(binding) {
      this._run('INSERT OR REPLACE INTO nodes(id,data) VALUES(?,?)',[binding.id,JSON.stringify(binding)]);
      for (const r of this.getRelationsForNode(binding.id))if(r.classification_binding && r.from_id===binding.id)this._run('DELETE FROM relations WHERE id=?',[r.id]);
      if (binding.mode==='suppressed' || !binding.classification?.section)return;
      const c=binding.classification,sectionId='C4:SECTION:'+c.section;
      const section=classification().SECTIONS.find(s=>s.id===c.section);
      this._insertNode({id:sectionId,kind:'classification_section',section:c.section,name_ar:section.label,classification_only:true,engineering_validated:false,created_by:AUTHOR},[]);
      let parentId=sectionId;
      if (c.category) {
        parentId='C4:CATEGORY:'+c.section+':'+c.category;
        const category=classification().CATEGORIES.find(k=>k.id===c.category);
        this._insertNode({id:parentId,kind:'classification_category',section:c.section,category:c.category,name_ar:category?.label || c.category,domain:category?.domain || null,classification_only:true,engineering_validated:false,created_by:AUTHOR},[]);
        const tax=this._relation('hierarchy_member',parentId,sectionId,'classification_category_in_section',null,[{classification_registry:classification().VERSION}]);
        this._insertRelation({...tax,owner_confirmed:false,user_status:null,classification_binding:true,record_class:'classification_taxonomy'},[]);
      }
      const relation=this._relation('hierarchy_member',binding.id,parentId,'source_graphics_classification_only',binding.decision_id || null,binding.sources);
      this._insertRelation({...relation,owner_confirmed:binding.mode==='owner',user_status:binding.mode==='owner'?'معتمد':null,classification_binding:true,record_class:binding.mode==='owner'?'owner_classification':'source_evidence_classification'},[]);
    }
    applyPageClassification(pageId, rows) {
      const {page,source}=this._classificationContext(pageId),state=this._classificationState();
      if (!state.enabled)return {changed:false,summary:this.getPageClassification(pageId)};
      const layers=new Map();
      for (const row of rows || []) {
        if (!['s','f','fs'].includes(row.drawing?.type) || !row.drawing.items?.length)continue;
        const layer=String(row.drawing.layer || '');let entry=layers.get(layer);
        if (!entry)layers.set(layer,entry={ordinals:[],items:0});
        const match=String(row.record_id).match(/:r(\d+)$/);if(match)entry.ordinals.push(Number(match[1]));
        entry.items+=row.drawing.items.length;
      }
      const candidates=[];
      for (const [layer,entry] of layers) {
        const target={kind:'layer',page_id:pageId,layer},key=this._classificationKey(target),old=state.bindings.get(key);
        const value=classification().classifyLayer(layer,source,page);
        const membership={selector:'exact_source_layer_and_record_ranges',layer,record_ranges:classification().ranges(entry.ordinals),record_count:entry.ordinals.length,item_count:entry.items,override_precedence:'owner item and representation overrides supersede automatic layer membership; not a physical component'};
        const autoSignature=sha256(JSON.stringify({classification:value,source_membership:membership}));
        if(old && old.auto_signature===autoSignature)continue;
        const binding={...(old || {}),id:'C4:CLASS:'+sha256(key).slice(0,32),kind:'drawing_classification',target_key:key,target,mode:old?.mode==='owner'||old?.mode==='suppressed'?old.mode:'automatic',classification:old?.mode==='owner'||old?.mode==='suppressed'?old.classification:value,auto_candidate:value,auto_signature:autoSignature,source_membership:membership,sources:[this._classificationWitness(target)],classification_only:true,engineering_validated:false,created_by:AUTHOR,rule_version:classification().VERSION};
        candidates.push(binding);
      }
      if(candidates.length)this._atomic(()=>{for(const b of candidates)this._writeClassification(b);this._bump();});
      return {changed:candidates.length>0,bindings_written:candidates.length,summary:this.getPageClassification(pageId)};
    }
    getItemClassification(pageId, rowOrItemId) {
      const state=this._classificationState(),p=state.pages.get(pageId),isId=typeof rowOrItemId==='string';
      const itemId=isId?rowOrItemId:rowOrItemId?.item_id || rowOrItemId?.id;
      if(itemId && ITEM.test(itemId)) {
        const override=this._explicitItemClassification(pageId,itemId);
        if(override)return override;
      }
      let binding,layer;
      if(!isId && rowOrItemId?.drawing) {layer=String(rowOrItemId.drawing.layer || '');binding=p?.layers.get(layer);}
      else if(isId) {
        const match=rowOrItemId.match(/:r(\d+)(?::i\d+)?$/),ordinal=match?Number(match[1]):-1,ranges=p?.ranges || [];
        let lo=0,hi=ranges.length-1;
        while(lo<=hi){const mid=(lo+hi)>>1,range=ranges[mid];if(ordinal<range.first)hi=mid-1;else if(ordinal>range.last)lo=mid+1;else{binding=range.binding;layer=binding.target.layer;break;}}
      }
      if(binding)return this._classificationValue(binding);
      const {page,source}=this._classificationContext(pageId);
      return this._classificationValue(null,classification().classifyLayer(layer || '',source,page));
    }
    getRepresentationClassification(selection) {
      if(typeof selection==='string'){const n=this.getNode(selection);if(!n?.page_id)return this._classificationValue(null);selection={id:selection,page_id:n.page_id};}
      const rep=this._normalize(selection),state=this._classificationState();
      const override=state.bindings.get(rep.page_id+'|representation|'+rep.id);
      if(override?.mode==='suppressed')return this._classificationValue(override);
      if(override?.mode==='owner'){
        const values=rep.item_ids.map(id=>this._explicitItemClassification(rep.page_id,id) || this._classificationValue(override));
        return {...classification().combine(values),method:'owner_classification',sources:override.sources || []};
      }
      const {page,source}=this._classificationContext(rep.page_id),node=this.getNode(rep.id);
      const known=classification().classifyKnownGroup(node,source,page);
      if(known && state.enabled){
        const witness=this._classificationWitness({kind:'representation',page_id:rep.page_id,representation_id:rep.id});
        const itemOverrides=rep.item_ids.map(id=>this._explicitItemClassification(rep.page_id,id)).filter(Boolean);
        if(itemOverrides.length){const combined=classification().combine([known,...itemOverrides]);return {...combined,sources:[witness,...itemOverrides.flatMap(b=>b.sources || [])]};}
        return {...known,sources:[witness]};
      }
      const values=rep.item_ids.map(id=>this.getItemClassification(rep.page_id,id));
      return {...classification().combine(values),sources:unique(values.flatMap(v=>(v.sources || []).map(s=>JSON.stringify(s)))).map(s=>JSON.parse(s))};
    }
    setRepresentationClassification(selection, value) {
      const target=this._classificationTarget(selection);
      if(target.kind!=='representation')fail('INVALID_CLASSIFICATION_TARGET','اختر مجموعة أو خطوطًا من لوحة واحدة لتعيين القسم والفئة.');
      if(!classification().valid(value?.section,value?.category))fail('INVALID_CLASSIFICATION','اختر قسمًا وفئة متوافقين.');
      const state=this._classificationState(),key=this._classificationKey(target),old=state.bindings.get(key),current=this.getRepresentationClassification(selection);
      if(!['suppressed','owner'].includes(old?.mode) && current.status==='known' && (current.category!==value.category || current.section!==value.section))fail('CLASSIFICATION_CONFLICT','التصنيف المختار يخالف مرجع المصدر الواضح. ألغِ التصنيف التلقائي أولًا إذا ثبت لك خطؤه.',{current,requested:value});
      if(!['suppressed','owner'].includes(old?.mode) && ((current.known_categories || []).some(c=>c!==value.category) || (current.known_sections || []).some(s=>s!==value.section)))fail('CLASSIFICATION_CONFLICT','يخالف التصنيف أحد الشواهد الواضحة ضمن الاختيار. عدّل التحديد أو ألغِ التصنيف الخاطئ قبل المتابعة.',{current,requested:value});
      if(old?.mode!=='suppressed' && current.status==='conflict')fail('CLASSIFICATION_CONFLICT','المجموعة تضم فئات أو أقسامًا مختلفة. عدّل التحديد قبل تعيين فئة واحدة.',{current,requested:value});
      for(const link of this._overlapTargets(target.item_ids)){const element=this.getNode(link.to_id);if(element?.classification?.status==='known' && (element.classification.section!==value.section || element.classification.category!==value.category))fail('CLASSIFICATION_CONFLICT','ألغِ اعتماد الربط الحالي قبل تغيير فئة الخطوط إلى فئة تخالف العنصر المرتبط.',{element_id:element.id,classification:element.classification,requested:value});}
      const next={section:value.section,category:value.category,graphic_kind:classification().CATEGORIES.find(c=>c.id===value.category)?.domain==='source_graphics'?value.category:current.graphic_kind || null,status:'known',method:'owner_classification',identity_established:false,engineering_validated:false};
      if(old?.mode==='owner' && current.status==='known' && JSON.stringify(old.classification)===JSON.stringify(next))return {changed:false,classification:next};
      const binding={id:'C4:CLASS:'+sha256(key).slice(0,32),kind:'drawing_classification',target_key:key,target,mode:'owner',classification:next,sources:[{...this._classificationWitness(target),reference:'Explicit owner section and category classification'}],decision_id:'C4:CLASSIFY:'+uuid(),decision_revision:Number(this.getMeta('revision') || 0)+1,classification_only:true,engineering_validated:false,created_by:AUTHOR,updated_at:new Date().toISOString()};
      this._atomic(()=>{this._writeClassification(binding);this._bump();});return {changed:true,classification:next};
    }
    cancelAutoClassification(input) {
      const target=this._classificationTarget(input),key=this._classificationKey(target),old=this._classificationState().bindings.get(key);
      if(old?.mode==='suppressed' && (target.kind!=='item' || this._explicitItemClassification(target.page_id,target.item_id)?.method==='owner_suppressed'))return {changed:false,target};
      const binding={...(old || {}),id:'C4:CLASS:'+sha256(key).slice(0,32),kind:'drawing_classification',target_key:key,target,mode:'suppressed',classification:null,auto_candidate:old?.auto_candidate || (old?.mode==='automatic'?old.classification:null),sources:[{...this._classificationWitness(target),reference:'Owner cancelled this automatic classification'}],decision_id:'C4:CLASSIFY:'+uuid(),decision_revision:Number(this.getMeta('revision') || 0)+1,classification_only:true,engineering_validated:false,created_by:AUTHOR,updated_at:new Date().toISOString()};
      this._atomic(()=>{this._writeClassification(binding);this._bump();});return {changed:true,target};
    }
    restoreAutoClassification(input) {
      const target=this._classificationTarget(input),key=this._classificationKey(target),old=this._classificationState().bindings.get(key);
      if(!old || old.mode==='automatic')return {changed:false,target};
      this._atomic(()=>{
        for(const r of this.getRelationsForNode(old.id))if(r.classification_binding && r.from_id===old.id)this._run('DELETE FROM relations WHERE id=?',[r.id]);
        if(old.auto_candidate)this._writeClassification({...old,mode:'automatic',classification:old.auto_candidate});
        else this._run('DELETE FROM nodes WHERE id=?',[old.id]);
        this._bump();
      });return {changed:true,target};
    }
    setDrawingGroupSuppressed(id, suppressed=true) {
      const group=this.getNode(id);
      if(!group?.page_id || !group.record_ids && !group.item_ids)fail('INVALID_GROUP','اختر مجموعة رسم محفوظة.');
      const old=this._classificationState().groupOverrides.get(id);
      if(Boolean(old?.suppressed)===Boolean(suppressed))return {changed:false,group_id:id,suppressed:Boolean(suppressed)};
      const node={id:'C4:GROUPOV:'+sha256(id).slice(0,32),kind:'drawing_group_override',target_group_id:id,page_id:group.page_id,suppressed:Boolean(suppressed),scope:'source_group_selection_only',original_group_unchanged:true,created_by:AUTHOR,updated_at:new Date().toISOString()};
      this._atomic(()=>{this._run('INSERT OR REPLACE INTO nodes(id,data) VALUES(?,?)',[node.id,JSON.stringify(node)]);this._bump();});
      return {changed:true,group_id:id,suppressed:Boolean(suppressed)};
    }
    setAutoClassificationEnabled(enabled) {
      if(this._classificationState().enabled===Boolean(enabled))return {changed:false,enabled:Boolean(enabled)};
      const node={id:'C4:CLASS:POLICY',kind:'drawing_classification_policy',enabled:Boolean(enabled),policy_version:classification().VERSION,scope:'automatic source classifications only; owner assignments retained',created_by:AUTHOR};
      this._atomic(()=>{this._run('INSERT OR REPLACE INTO nodes(id,data) VALUES(?,?)',[node.id,JSON.stringify(node)]);this._bump();});return {changed:true,enabled:Boolean(enabled)};
    }
    isAutoClassificationEnabled() {return this._classificationState().enabled;}
    getAutoClassificationEnabled() {return this.isAutoClassificationEnabled();}
    getLayerClassification(pageId, layer) {
      const {page,source}=this._classificationContext(pageId),binding=this._classificationState().pages.get(pageId)?.layers.get(String(layer || ''));
      return this._classificationValue(binding,classification().classifyLayer(layer,source,page));
    }
    getPageClassification(pageId) {
      const {page,source}=this._classificationContext(pageId),state=this._classificationState(),p=state.pages.get(pageId),layers=[];
      const names=unique([...Object.keys(page.layers || {}),...[...(p?.layers?.keys() || [])]]);
      for(const layer of names){const binding=p?.layers.get(layer),value=this._classificationValue(binding,classification().classifyLayer(layer,source,page));layers.push({layer,...value,record_count:binding?.source_membership?.record_count ?? page.layers?.[layer] ?? 0,item_count:binding?.source_membership?.item_count ?? null,target:{page_id:pageId,layer}});}
      const manual=[...state.bindings.values()].filter(b=>b.target.page_id===pageId && b.mode==='owner').map(b=>b.classification);
      return {page_id:pageId,auto_enabled:state.enabled,source_section:classification().sourceSection(source,page).section,sections:unique([...layers,...manual].map(l=>l.section).filter(Boolean)),categories:unique([...layers,...manual].map(l=>l.category).filter(Boolean)),layers,manual_assignments:manual.length,classified_records:layers.filter(l=>l.status==='known').reduce((sum,l)=>sum+l.record_count,0),section_only_records:layers.filter(l=>l.section && !l.category).reduce((sum,l)=>sum+l.record_count,0),unknown_records:layers.filter(l=>!l.section && !l.category).reduce((sum,l)=>sum+l.record_count,0)};
    }
    getAutoClassificationSummary(pageId) {return this.getPageClassification(pageId);}
    validateRepresentationCompatibility(selections, options={}) {
      const values=(selections || []).map(s=>({selection:s,classification:this.getRepresentationClassification(s)}));
      if(options.existingElementId){
        const element=this.getNode(options.existingElementId);
        if(element?.classification?.status==='known')values.push({selection:{id:element.id},classification:element.classification});
        else {
          for(const row of this._rows("SELECT from_id FROM relations WHERE type='alternative_representation' AND to_id=?",[options.existingElementId]))values.push({selection:{id:row.from_id},classification:this.getRepresentationClassification(row.from_id)});
        }
      }
      if(values.some(v=>v.classification.status==='conflict'))fail('CLASSIFICATION_CONFLICT','أحد الاختيارات يجمع أقسامًا أو فئات مختلفة؛ صحّح المجموعة قبل اعتماد الربط.',{classifications:values});
      const known=values.filter(v=>v.classification.status==='known'),sections=unique(known.map(v=>v.classification.section)),categories=unique(known.map(v=>v.classification.category));
      if(sections.length>1 || categories.length>1)fail('INCOMPATIBLE_CLASSIFICATION','لا يمكن ربط اختيارات من أقسام أو فئات مختلفة كعنصر واحد. العمود لا يُربط بباب.',{classifications:values});
      if(!values.length || known.length!==values.length)fail('NEEDS_CLASSIFICATION','يوجد اختيار لم يثبت قسمه أو فئته. عيّن القسم والفئة لهذا الاختيار قبل اعتماد هوية مشتركة.',{classifications:values});
      const result={section:sections[0],category:categories[0],status:'known',method:'compatible_source_representations',identity_established:false,engineering_validated:false};
      if(options.category && options.category!==result.category || options.section && options.section!==result.section)fail('INCOMPATIBLE_CLASSIFICATION','القسم أو الفئة المطلوبة لا تطابق الاختيارات.',{classification:result,requested:{section:options.section,category:options.category}});
      return result;
    }
    createDrawingGroup(selection, options = {}) {
      const r=this._normalize({...selection,name:options.name || selection?.name});
      if (r.existing) return {unchanged:true,group:this.getNode(r.id),representation:r};
      const items=new Set(r.item_ids),overlaps=[];
      for (const group of this.listGroups(r.page_id)) {
        const members=unique([...(group.item_ids || []),...this.getRepresentationItems(group.id)]);
        const common=members.filter(id=>items.has(id));
        if (!common.length) continue;
        if (common.length===members.length && members.length===items.size) {
          return {unchanged:true,group,representation:this._normalize({...selection,id:group.id})};
        }
        if (group.created_by===AUTHOR) overlaps.push({id:group.id,name:group.name_ar || group.name || group.mark || 'مجموعة رسم',shared_items:common.length});
      }
      if (overlaps.length) fail('OVERLAPPING_DRAWING_GROUPS','بعض الخطوط ضمن مجموعة محفوظة. اختر المجموعة الموجودة، أو فكّها أولًا إن لم تكن مرتبطة.',{groups:overlaps});
      const assigned=unique(this._overlapTargets(r.item_ids).map(link=>link.to_id));
      if (assigned.length>1) fail('CONFLICTING_IDENTITIES','الخطوط المختارة مرتبطة بعناصر مختلفة؛ لم تُحفظ مجموعة تجمعها.',{element_ids:assigned});
      const now=new Date().toISOString(),decisionId='C4:GROUP:'+uuid();
      return this._atomic(()=>{
        const createdNodes=[],createdRelations=[];
        const page=this._one('SELECT p.source_id,p.page_number,s.filename,s.sha256 FROM pages p JOIN sources s ON s.id=p.source_id WHERE p.id=?',[r.page_id]);
        const witness={file:page.filename,source_id:page.source_id,source_sha256:page.sha256,page:page.page_number,page_id:r.page_id,locator:r.id,reference:'Explicit owner grouping of selected graphics on one sheet',decision_id:decisionId};
        const group={id:r.id,kind:'organizational_group',representation_kind:'owner_selected_source_graphics',identity_scope:'single_selection_on_one_sheet',page_id:r.page_id,name_ar:r.name,mark:r.mark,bbox_points:r.bbox,item_ids:r.item_ids,record_ids:r.record_ids,complete_geometry:false,source_membership_status:'owner_confirmed',canonical_model_target:{value:null,grade:4},user_saved_group:true,sources:[witness],owner_confirmed:true,engineering_validated:false,physical_assembly_asserted:false,created_by:AUTHOR,decision_id:decisionId,created_at:now};
        this._insertNode(group,createdNodes);
        for (const itemId of r.item_ids) {
          const recordId=itemId.slice(0,itemId.lastIndexOf(':i')),itemIndex=Number(itemId.slice(itemId.lastIndexOf(':i')+2));
          this._insertNode({id:itemId,kind:'source_graphic_item',page_id:r.page_id,record_id:recordId,item_index:itemIndex,geometry_reference:{record_id:recordId,item_index:itemIndex},physical_part_classification:null,created_by:AUTHOR,decision_id:decisionId},createdNodes);
          this._insertRelation(this._relation('hierarchy_member',itemId,r.id,'owner_confirmed_same_sheet_graphics_membership',decisionId,[{...witness,locator:itemId}]),createdRelations);
        }
        this._bump();return {unchanged:false,group,representation:{...r,existing:true}};
      });
    }
    renameDrawingGroup(id, name) {
      const group=this.getNode(id),label=String(name || '').trim();
      if (!group || group.created_by!==AUTHOR || !group.user_saved_group) fail('NOT_USER_DRAWING_GROUP','يمكن تغيير اسم المجموعة التي حفظتها في هذه الواجهة فقط.');
      if (!label) fail('EMPTY_GROUP_NAME','اكتب اسمًا للمجموعة.');
      if (group.name_ar===label) return {unchanged:true,group};
      return this._atomic(()=>{
        group.name_ar=label;group.updated_at=new Date().toISOString();
        this._run('UPDATE nodes SET data=? WHERE id=?',[JSON.stringify(group),id]);
        this._bump();return {unchanged:false,group};
      });
    }
    dissolveDrawingGroup(id) {
      const group=this.getNode(id);
      if (!group || group.created_by!==AUTHOR || !group.user_saved_group) fail('NOT_USER_DRAWING_GROUP','يمكن فك المجموعة التي حفظتها في هذه الواجهة فقط.');
      if (this._identityRelations(id).length) fail('GROUP_ALREADY_LINKED','ألغِ اعتماد ربط هذه المجموعة قبل فكّها.');
      const relations=this.getRelationsForNode(id);
      if (relations.some(r=>r.created_by!==AUTHOR || r.type!=='hierarchy_member' || r.to_id!==id)) fail('GROUP_HAS_DEPENDENCIES','توجد علاقات أخرى تعتمد على المجموعة؛ لم تُفك.');
      return this._atomic(()=>{
        for (const relation of relations) this._run('DELETE FROM relations WHERE id=?',[relation.id]);
        this._run('DELETE FROM nodes WHERE id=?',[id]);
        for (const itemId of group.item_ids || []) {
          const node=this.getNode(itemId);
          if (node?.created_by===AUTHOR && node.kind==='source_graphic_item' && !this._one('SELECT id FROM relations WHERE from_id=? OR to_id=? LIMIT 1',[itemId,itemId])) this._run('DELETE FROM nodes WHERE id=?',[itemId]);
        }
        this._bump();return {removed:true,group};
      });
    }
    commitRepresentationLink(selections, options = {}) {
      const reps=[...new Map((selections || []).map(s=>{const r=this._normalize(s);return [r.id,r];})).values()];
      const minimumRepresentations=options.existingElementId ? 1 : 2;
      if (reps.length<minimumRepresentations) fail('NEED_TWO_REPRESENTATIONS',options.existingElementId ? 'حدد تمثيلًا واحدًا على الأقل لإضافته إلى العنصر الموجود.' : 'أضف مجموعتين مختلفتين على الأقل، ثم اعتمد الربط.');
      const level=options.identityLevel==='type' ? 'type' : 'instance';
      const links=reps.flatMap(r=>this._identityRelations(r.id));
      const overlaps=this._overlapTargets(unique(reps.flatMap(r=>r.item_ids)));
      const assigned=unique([...links,...overlaps].map(r=>r.to_id));
      if (assigned.length>1) fail('CONFLICTING_IDENTITIES','بعض الاختيارات مرتبطة بعناصر مختلفة. ألغِ الربط المتعارض أولًا؛ لن تُدمج الهويات تلقائيًا.',{element_ids:assigned});
      if (options.existingElementId && assigned.length && assigned[0]!==options.existingElementId) fail('CONFLICTING_IDENTITY','أحد الاختيارات مرتبط بعنصر آخر؛ لم يتغير الربط.',{element_ids:assigned});
      let elementId=options.existingElementId || assigned[0] || null;
      let element=elementId ? this.getNode(elementId) : null;
      if (elementId && !element) fail('UNKNOWN_ELEMENT','هوية العنصر المطلوبة غير موجودة.');
      if (element && !['element','component','type'].includes(element.kind)) fail('INVALID_ELEMENT','اختر هوية عنصر أو نوع، وليس معرّف مجموعة رسم.');
      if (element && ((element.identity_level==='type' || element.kind==='type') !== (level==='type'))) fail('IDENTITY_LEVEL_MISMATCH','لا يمكن دمج هوية نوع مع هوية عنصر فردي.');
      if (element && reps.every(r=>this._identityRelations(r.id).some(link=>link.to_id===elementId))) {
        return {unchanged:true,element,representations:reps,confirmation:null};
      }
      const compatible=this.validateRepresentationCompatibility(reps,{...options,existingElementId:elementId});
      const now=new Date().toISOString(),decisionId='C4:CONF:'+uuid();
      return this._atomic(()=>{
        const createdNodes=[],createdRelations=[];
        if (!element) {
          elementId=(level==='type'?'C4:T:':'C4:E:')+uuid();
          element={id:elementId,kind:level==='type'?'type':'element',identity_level:level,name_ar:options.name || reps[0].name || 'عنصر مرتبط',section:compatible.section,category:compatible.category,classification:compatible,identity_domain:classification().CATEGORIES.find(c=>c.id===compatible.category)?.domain || null,identity_scope:level==='type'?'owner_declared_common_type':'owner_declared_common_element',created_by:AUTHOR,decision_id:decisionId,created_at:now,owner_confirmed:true,engineering_validated:false,dimensions:{value:null,grade:4},physical_geometry:{value:null,grade:4}};
          this._insertNode(element,createdNodes);
        }
        const witnesses=reps.map(r=>{
          const page=this._one('SELECT p.source_id,p.page_number,s.filename,s.sha256 FROM pages p JOIN sources s ON s.id=p.source_id WHERE p.id=?',[r.page_id]);
          return {file:page.filename,source_id:page.source_id,source_sha256:page.sha256,page:page.page_number,page_id:r.page_id,locator:r.id,reference:'Explicit owner selection and confirmation',decision_id:decisionId};
        });
        for (let i=0;i<reps.length;i++) {
          const r=reps[i];
          if (!r.existing) {
            const group={id:r.id,kind:'organizational_group',representation_kind:'owner_selected_source_graphics',identity_scope:'single_selection_on_one_sheet',page_id:r.page_id,name_ar:r.name,mark:r.mark,bbox_points:r.bbox,item_ids:r.item_ids,record_ids:r.record_ids,complete_geometry:false,source_membership_status:'owner_confirmed',canonical_model_target:{value:null,grade:4},created_by:AUTHOR,decision_id:decisionId,created_at:now};
            this._insertNode(group,createdNodes);
            for (const itemId of r.item_ids) {
              const recordId=itemId.slice(0,itemId.lastIndexOf(':i')),itemIndex=Number(itemId.slice(itemId.lastIndexOf(':i')+2));
              this._insertNode({id:itemId,kind:'source_graphic_item',page_id:r.page_id,record_id:recordId,item_index:itemIndex,geometry_reference:{record_id:recordId,item_index:itemIndex},physical_part_classification:null,created_by:AUTHOR,decision_id:decisionId},createdNodes);
              this._insertRelation(this._relation('hierarchy_member',itemId,r.id,'owner_confirmed_same_sheet_graphics_membership',decisionId,[{...witnesses[i],locator:itemId}]),createdRelations);
            }
          }
          this._insertRelation(this._relation('alternative_representation',r.id,elementId,level==='type'?'owner_confirmed_same_type_identity':'owner_confirmed_same_element_identity',decisionId,witnesses),createdRelations);
        }
        const confirmation={id:decisionId,status:'approved',approved_at:now,approved_by:'owner',action:level==='type'?'same_type_identity':'same_element_identity',identity_level:level,element_id:elementId,name:options.name || element.name_ar || null,section:compatible.section,category:compatible.category,representation_ids:reps.map(r=>r.id),representations:reps,sources:witnesses,created_node_ids:createdNodes,created_relation_ids:createdRelations,engineering_validated:false,source_of_truth:'current_project_database',created_by:AUTHOR};
        this._run('INSERT INTO confirmations(id,data) VALUES(?,?)',[decisionId,JSON.stringify(confirmation)]);
        this._bump();return {unchanged:false,element,representations:reps,confirmation};
      });
    }
    listConfirmed(includeUndone=false) {
      return this._rows('SELECT data FROM confirmations ORDER BY rowid').map(row=>json(row.data)).filter(c=>includeUndone || c.status==='approved');
    }
    undoConfirmation(id) {
      const active=this.listConfirmed(),latest=active[active.length-1];
      if (!latest || latest.id!==id) fail('UNDO_ORDER','التراجع متاح لآخر اعتماد أولًا، للحفاظ على الروابط التي تعتمد عليه.');
      return this._atomic(()=>{
        for (const relationId of latest.created_relation_ids || []) {
          const relation=this.getRelation(relationId);
          if (relation && relation.created_by===AUTHOR && relation.decision_id===id) this._run('DELETE FROM relations WHERE id=?',[relationId]);
        }
        for (const nodeId of [...(latest.created_node_ids || [])].reverse()) {
          const node=this.getNode(nodeId);
          if (node && node.created_by===AUTHOR && node.decision_id===id && !this._one('SELECT id FROM relations WHERE from_id=? OR to_id=? LIMIT 1',[nodeId,nodeId])) this._run('DELETE FROM nodes WHERE id=?',[nodeId]);
        }
        latest.status='undone';latest.undone_at=new Date().toISOString();
        this._run('UPDATE confirmations SET data=? WHERE id=?',[JSON.stringify(latest),id]);this._bump();return latest;
      });
    }
    undoLast() { const all=this.listConfirmed(); return all.length ? this.undoConfirmation(all[all.length-1].id) : null; }
    exportWorkingGraph() {
      return {schema:'c4.working-graph-checkpoint.v1',project:this.getMeta('project'),source_index:this.getMeta('source_index'),revision:Number(this.getMeta('revision')||0),last_modified_at_utc:this.getMeta('last_modified_at_utc'),nodes:this._rows('SELECT data FROM nodes').map(r=>json(r.data)).filter(n=>n.created_by===AUTHOR),relations:this._rows('SELECT data FROM relations').map(r=>json(r.data)).filter(r=>r.created_by===AUTHOR),confirmations:this.listConfirmed(true)};
    }
    restoreWorkingGraph(checkpoint) {
      if (!checkpoint || checkpoint.schema!=='c4.working-graph-checkpoint.v1') fail('INVALID_CHECKPOINT','صيغة استئناف العمل غير صحيحة.');
      const source=this.getMeta('source_index');
      if (!source || !checkpoint.source_index || source.sha256!==checkpoint.source_index.sha256) fail('WRONG_PROJECT','هذه الاعتمادات تخص نسخة أخرى من فهرس المشروع.');
      if (Number(checkpoint.revision)<Number(this.getMeta('revision')||0)) fail('OLDER_CHECKPOINT','النسخة المحفوظة أقدم من قاعدة المشروع المفتوحة.');
      const nodeIds=new Set((checkpoint.nodes||[]).map(n=>n.id));
      for (const n of checkpoint.nodes||[]) {
        if (n.created_by!==AUTHOR) fail('INVALID_CHECKPOINT','نسخة الاستئناف تحتوي تعديلًا خارج اعتمادات المستخدم.');
        const old=this.getNode(n.id);if (old && old.created_by!==AUTHOR) fail('BASE_NODE_CONFLICT','لن تُستبدل معرّفات المصدر الأصلية.');
      }
      for (const r of checkpoint.relations||[]) {
        if (r.created_by!==AUTHOR) fail('INVALID_CHECKPOINT','نسخة الاستئناف تحتوي علاقة غير معتمدة من هذه الواجهة.');
        const old=this.getRelation(r.id);if (old && old.created_by!==AUTHOR) fail('BASE_RELATION_CONFLICT','لن تُستبدل علاقات المصدر الأصلية.');
        if ((!nodeIds.has(r.from_id)&&!this.getNode(r.from_id)) || (!nodeIds.has(r.to_id)&&!this.getNode(r.to_id))) fail('MISSING_ENDPOINT','يوجد طرف علاقة مفقود في نسخة الاستئناف.');
      }
      return this._atomic(()=>{
        const current=this.exportWorkingGraph();
        for (const r of current.relations) this._run('DELETE FROM relations WHERE id=?',[r.id]);
        for (const n of current.nodes) if (!this._one('SELECT id FROM relations WHERE from_id=? OR to_id=? LIMIT 1',[n.id,n.id])) this._run('DELETE FROM nodes WHERE id=?',[n.id]);
        this._run('DELETE FROM confirmations');
        for (const n of checkpoint.nodes||[]) this._insertNode(n,[]);
        for (const r of checkpoint.relations||[]) this._insertRelation(r,[]);
        for (const c of checkpoint.confirmations||[]) {
          if (c.created_by!==AUTHOR) fail('INVALID_CHECKPOINT','سجل الاعتماد غير صحيح.');
          this._run('INSERT INTO confirmations(id,data) VALUES(?,?)',[c.id,JSON.stringify(c)]);
        }
        this.setMeta('revision',Number(checkpoint.revision));this.setMeta('last_modified_at_utc',checkpoint.last_modified_at_utc || null);
        return {restored:true,revision:Number(checkpoint.revision),confirmations:this.listConfirmed().length};
      });
    }
    exportAnswers() {
      const active=this.listConfirmed(),nodeIds=new Set(),relationIds=new Set();
      for (const c of active) {
        nodeIds.add(c.element_id);for (const id of c.representation_ids || []) nodeIds.add(id);
        for (const id of c.created_node_ids || []) nodeIds.add(id);
        for (const id of c.created_relation_ids || []) relationIds.add(id);
      }
      const drawingGroups=this.listGroups().filter(g=>g.created_by===AUTHOR && g.user_saved_group);
      for (const group of drawingGroups) {
        nodeIds.add(group.id);
        for (const relation of this.getRelationsForNode(group.id)) {
          if (relation.type==='hierarchy_member' && relation.to_id===group.id && relation.created_by===AUTHOR) relationIds.add(relation.id);
        }
      }
      const classificationNodes=this._rows('SELECT data FROM nodes').map(r=>json(r.data)).filter(n=>n.created_by===AUTHOR && ['drawing_classification','classification_section','classification_category','drawing_group_override','drawing_classification_policy'].includes(n.kind));
      for(const n of classificationNodes)nodeIds.add(n.id);
      for(const row of this._rows('SELECT data FROM relations')){const r=json(row.data);if(r.created_by===AUTHOR && r.classification_binding)relationIds.add(r.id);}
      const relations=[...relationIds].map(id=>this.getRelation(id)).filter(Boolean);
      for (const r of relations) { nodeIds.add(r.from_id);nodeIds.add(r.to_id); }
      return {schema:'c4.owner-confirmed-relations-receipt.v1',project:this.getMeta('project'),database_revision:Number(this.getMeta('revision')||0),exported_at:new Date().toISOString(),source_index:this.getMeta('source_index'),sources:this.getSources(),authoritative_database:this.getMeta('authoritative_database'),editing_policy:'Decision receipt exported from the one project database; not a second editable graph.',engineering_validated:false,owner_confirmation_scope:'Identity and selected source-graphics membership only; no dimensions, geometry completeness or physical assembly validation.',classification_policy:{version:classification().VERSION,automatic_enabled:this._classificationState().enabled,source_layer_bindings:'Exact original layer and record-range selectors; category membership only, never a physical component.',override_precedence:'Explicit owner item/representation decisions supersede automatic layer membership. A later cancellation makes a member unknown; a later owner assignment supersedes an earlier cancellation using decision_revision. Conflicting overlapping owner assignments remain conflicts. Original known groups respect member cancellations. Suppressed original groups remain unchanged and are omitted from automatic group selection.',unknown_identity_matching:'Blocked until explicitly classified; an unknown category is never a wildcard.'},active_confirmations:active,drawing_group_ids:drawingGroups.map(g=>g.id),classification_binding_ids:classificationNodes.filter(n=>n.kind==='drawing_classification').map(n=>n.id),group_overrides:classificationNodes.filter(n=>n.kind==='drawing_group_override'),undone_confirmation_ids:this.listConfirmed(true).filter(c=>c.status==='undone').map(c=>c.id),nodes:[...nodeIds].map(id=>this.getNode(id)).filter(Boolean),relations};
    }
  }
  C4Store.sha256=sha256;
  global.C4Store=C4Store;
  if (typeof module!=='undefined' && module.exports) module.exports=C4Store;
})(typeof window!=='undefined' ? window : globalThis);
