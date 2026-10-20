/* Source labels establish a classification, never a physical instance or connection. */
(function(global){
  'use strict';
  const VERSION='c4.source-classification.v1';
  const SECTIONS=[
    {id:'architectural',label:'معماري'},{id:'structural',label:'إنشائي'},
    {id:'electrical',label:'كهربائي'},{id:'mechanical',label:'ميكانيكي'},
    {id:'sanitary',label:'صحي وإمداد وتصريف ومكافحة حريق'}
  ];
  const all=SECTIONS.map(s=>s.id);
  const CATEGORIES=[
    {id:'door',label:'باب',sections:['architectural']},
    {id:'window',label:'نافذة',sections:['architectural']},
    {id:'column',label:'عمود',sections:['structural','architectural']},
    {id:'beam',label:'جسر',sections:['structural']},
    {id:'slab',label:'بلاطة',sections:['structural']},
    {id:'wall',label:'جدار',sections:['architectural','structural']},
    {id:'stair',label:'درج',sections:['architectural','structural']},
    {id:'pile',label:'خازوق',sections:['structural']},
    {id:'raft',label:'لبشة',sections:['structural']},
    {id:'duct',label:'دكت',sections:['mechanical']},
    {id:'mechanical_equipment',label:'معدات ميكانيكية',sections:['mechanical']},
    {id:'chilled_water_pipe',label:'أنبوب مياه مبردة',sections:['mechanical']},
    {id:'lighting',label:'إنارة',sections:['electrical']},
    {id:'switch',label:'مفتاح كهربائي',sections:['electrical']},
    {id:'socket',label:'مقبس كهربائي',sections:['electrical']},
    {id:'cable',label:'كابل',sections:['electrical']},
    {id:'electrical_panel',label:'لوحة كهربائية',sections:['electrical']},
    {id:'water_pipe',label:'أنبوب إمداد مياه',sections:['sanitary']},
    {id:'drainage_pipe',label:'أنبوب تصريف',sections:['sanitary']},
    {id:'fire_pipe',label:'أنبوب مكافحة حريق',sections:['sanitary']},
    {id:'sanitary_fixture',label:'قطعة صحية',sections:['sanitary']},
    {id:'hatch',label:'تهشير رسومي',sections:all,domain:'source_graphics'},
    {id:'annotation',label:'تعليق أو رمز رسومي',sections:all,domain:'source_graphics'}
  ].map(c=>({...c,domain:c.domain || 'physical_category'}));
  const unique=a=>[...new Set(a)];
  function terminal(layer){return String(layer || '').split(/\$\d+\$|\|/).pop().trim().toUpperCase().replace(/\s+/g,' ');}
  function sourceSection(source,page){
    const title=String(page?.title_candidate || page?.titleCandidate || '').toUpperCase();
    if (/\b(DRAINAGE|WATER SUPPLY|STORM WATER|IRRIGATION|FIRE FIGHTING|FIREFIGHTING)\b/.test(title)) return {section:'sanitary',rule:'explicit_sheet_title',witness:title};
    if (/\b(AC LAYOUT|AC SCHEDULE|AC DETAILS|CHILLED WATER|SMOKE MANAGEMENT|VENTILATION|HVAC)\b/.test(title)) return {section:'mechanical',rule:'explicit_sheet_title',witness:title};
    const discipline=source?.discipline,name=String(source?.filename || '').toUpperCase();
    if (['architectural','structural','electrical','sanitary'].includes(discipline)) return {section:discipline,rule:'source_catalog_discipline',witness:source.filename};
    if (/^ARCH(?:\.|ITECTURAL)?\s*DRAWINGS?\b/.test(name))return {section:'architectural',rule:'explicit_source_filename',witness:source.filename};
    if (/^STRUCTUR(?:E|AL)\s*DRAWINGS?\b/.test(name))return {section:'structural',rule:'explicit_source_filename',witness:source.filename};
    if (/^ELECTRICAL\s*DRAWINGS?\b/.test(name))return {section:'electrical',rule:'explicit_source_filename',witness:source.filename};
    // The mechanical sources contain sanitary and firefighting sheets as well.
    return {section:null,rule:'unresolved_source_section',witness:null};
  }
  function classifyLayer(layer,source,page){
    const name=terminal(layer),fallback=sourceSection(source,page);
    let section=null,category=null,graphic_kind=null,rule=null;
    const annotation=/\b(TEXT|TAG|IDEN|DIM|NOTE|ANNOTATION|TBLOCK)\b|TITLE BLOCK|SHEET FRAME/.test(name);
    const hatch=/HATCH|HTCH|\bPATT\b/.test(name);
    if (annotation)graphic_kind='annotation';
    else if (hatch)graphic_kind='hatch';
    if (!annotation) {
      if (/^(?:A|AR)-(?:DOOR|DOORS|ELEV DOOR|SECTION DOOR|LOUVER DOOR)$/.test(name) || name==='DOOR') {section='architectural';category='door';rule='explicit_door_layer';}
      else if (/^S-(?:COLUMN|COLUMNS|COL|COLS|COL-HATCH|COLUMN HATCH|COLS-HATCH|COLS-HTCH-CONC|COLS-CONC-TRMD|COLS-CONC|CONC-COLUMNS-OVER)$/.test(name)) {section='structural';category='column';rule='explicit_structural_column_layer';}
      else if (/^A-(?:COLS|COLS-PATT|COLUMN(?:-\d+)?)$/.test(name)) {section='architectural';category='column';rule='explicit_architectural_column_layer';}
      else if (/^(?:A|AR)-(?:WINDOW|WINDOWS)$/.test(name)) {section='architectural';category='window';rule='explicit_window_layer';}
      else if (/^S-(?:BEAM|BEAMS)$/.test(name) || name==='BEAM' && fallback.section==='structural') {section='structural';category='beam';rule='explicit_beam_layer';}
      else if (/^S-(?:SLAB|SLABS)$/.test(name)) {section='structural';category='slab';rule='explicit_slab_layer';}
      else if (/^(?:A|AR)-WALL$/.test(name)) {section='architectural';category='wall';rule='explicit_architectural_wall_layer';}
      else if (/^S-WALL$/.test(name)) {section='structural';category='wall';rule='explicit_structural_wall_layer';}
      else if (/^(?:AC DUCT|MDUCT|PDF_DUCTS|M[-_](?:FA|LP|T\.EX|ADUCT|SADUCT|SP|EX)(?:_DUCT)?|AC-(?:EXTRACT DUCT TOILETS|FRESH AIR DUCT-TREATED))$/.test(name)) {section='mechanical';category='duct';rule='explicit_duct_layer';}
      else if (name==='AC CHWS PIPE') {section='mechanical';category='chilled_water_pipe';rule='explicit_chilled_water_pipe_layer';}
      else if (/^P_SANR_(?:DISCHARGE_PIPE|V_PIPE|PIPE_FITTING)$/.test(name)) {section='sanitary';category='drainage_pipe';rule='explicit_drainage_pipe_layer';}
      else if (/^(?:M_FF_PIPE|NAF-SPK-BRANCH PIPE)$/.test(name)) {section='sanitary';category='fire_pipe';rule='explicit_fire_pipe_layer';}
      else if (/^P_(?:WATR|WATER)_(?:COLD_|HOT_)?PIPE$/.test(name)) {section='sanitary';category='water_pipe';rule='explicit_water_pipe_layer';}
    }
    if (!section) {
      if (/^(?:A|AR)[-_]/.test(name)) {section='architectural';rule=rule || 'explicit_architectural_layer_prefix';}
      else if (/^S[-_]/.test(name)) {section='structural';rule=rule || 'explicit_structural_layer_prefix';}
      else if (/^P_SANR_/.test(name)) {section='sanitary';rule=rule || 'explicit_sanitary_layer_prefix';}
      else if (/^E[-_]/.test(name)) {section='electrical';rule=rule || 'explicit_electrical_layer_prefix';}
      else {section=fallback.section;rule=rule || fallback.rule;}
    }
    return {section,category,graphic_kind,status:category && section?'known':section || graphic_kind?'partial':'unknown',method:'source_evidence',rule_id:rule,rule_version:VERSION,layer:String(layer || ''),terminal_layer:name,evidence:{layer:String(layer || ''),terminal_layer:name,source_section_rule:fallback.rule,source_section_witness:fallback.witness},identity_established:false,engineering_validated:false};
  }
  function classifyKnownGroup(group,source,page){
    if (group?.representation_kind==='same_sheet_door_representation' && group.identity_scope==='single_occurrence_on_one_sheet')return {section:'architectural',category:'door',graphic_kind:null,status:'known',method:'source_evidence',rule_id:'existing_same_sheet_door_representation',rule_version:VERSION,evidence:{existing_group_id:group.id,source_word_id:group.source_word_id || null},identity_established:false,engineering_validated:false};
    const witnesses=group?.canonical_model_target?.source;
    if (group?.representation_kind==='existing_source_geometry_component' && Array.isArray(witnesses) && witnesses.length && witnesses.every(w=>/^BEAM drawing#\d+$/.test(w.locator || '')))return {section:'structural',category:'beam',graphic_kind:null,status:'known',method:'source_evidence',rule_id:'existing_beam_source_geometry_reference',rule_version:VERSION,evidence:{existing_group_id:group.id,locators:witnesses.map(w=>w.locator)},identity_established:false,engineering_validated:false};
    return null;
  }
  function combine(values){
    const rows=values || [],sections=unique(rows.map(v=>v.section).filter(Boolean)),categories=unique(rows.map(v=>v.category).filter(Boolean));
    const known=rows.filter(v=>v.status==='known'),knownSections=unique(known.map(v=>v.section).filter(Boolean)),knownCategories=unique(known.map(v=>v.category).filter(Boolean));
    const graphics=unique(rows.map(v=>v.graphic_kind).filter(Boolean)),conflict=rows.some(v=>v.status==='conflict') || knownSections.length>1 || knownCategories.length>1;
    return {section:knownSections.length===1?knownSections[0]:sections.length===1?sections[0]:null,category:knownCategories.length===1?knownCategories[0]:categories.length===1?categories[0]:null,graphic_kind:graphics.length===1?graphics[0]:null,status:conflict?'conflict':rows.length && rows.every(v=>v.status==='known') && sections.length===1 && categories.length===1?'known':sections.length || graphics.length?'partial':'unknown',method:'combined_source_membership',sections,categories,known_sections:knownSections,known_categories:knownCategories,unknown_count:rows.filter(v=>v.status!=='known').length,identity_established:false,engineering_validated:false};
  }
  function categoriesFor(section){return CATEGORIES.filter(c=>!section || c.sections.includes(section));}
  function valid(section,category){return SECTIONS.some(s=>s.id===section) && CATEGORIES.some(c=>c.id===category && c.sections.includes(section));}
  function ranges(numbers){
    const ordered=unique(numbers).sort((a,b)=>a-b),out=[];
    for (const n of ordered){const tail=out[out.length-1];if(tail && n===tail[1]+1)tail[1]=n;else out.push([n,n]);}return out;
  }
  const api={VERSION,SECTIONS,CATEGORIES,categoriesFor,valid,terminal,sourceSection,classifyLayer,classifyKnownGroup,combine,ranges};
  global.C4Classification=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
