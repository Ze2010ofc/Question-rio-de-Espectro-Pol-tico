'use strict';

const DATA = window.QUESTIONARIO_DATA || {ideologies: [], questions: []};
const IDEOLOGIES = DATA.ideologies || [];
const QUESTIONS = DATA.questions || [];
const EPS = 1e-9;
const SCORE_MAP = {1:-2,2:-1,3:0,4:1,5:2};
const SCALE_LABELS = {1:'Discordo totalmente',2:'Discordo parcialmente',3:'Neutro / depende',4:'Concordo parcialmente',5:'Concordo totalmente'};
const AXIS_OPPOSITE = {igualdade:'mercado', mercado:'igualdade', progressista:'tradicional', tradicional:'progressista', nacao:'mundo', mundo:'nacao', autoridade:'liberdade', liberdade:'autoridade'};
const AXIS_KEYWORDS = {
  igualdade:['igualdade','socializacao','redistribuicao','estado social','anti-rentista','antirentista'],
  mercado:['mercado','propriedade privada','capitalismo','empreendedorismo','livre mercado'],
  progressista:['progressismo','progressista','secularismo','tecnologico','modernizacao','mudancas culturais'],
  tradicional:['tradicao','tradicional','religiao','moral','familia','hierarquia cultural'],
  nacao:['nacao','soberania','nacional','patriotismo','autarquia','fronteiras'],
  mundo:['mundo','internacionalismo','global','cooperacao global','direitos humanos universais'],
  autoridade:['autoridade','autoritario','estado forte','partido unico','censura','policia','ordem'],
  liberdade:['liberdade','libertario','anti-autoridade','antiautoridade','pluralismo','direitos individuais','autonomia']
};
const SPECIAL_AXIS_RULES = {
  'georgismo':['igualdade'], 'corporativismo':['autoridade','tradicional'], 'ecologia anti-industrial':['tradicional','liberdade'],
  'metodo revolucionario':['autoridade'], 'anti-parlamentarismo':['autoridade'], 'localismo':['liberdade'],
  'centro cultural':['progressista','liberdade'], 'anti-modernidade':['tradicional'], 'restauracionismo':['tradicional','autoridade']
};
const DISTANCE_WEIGHTS = {pc_econ:1.4, pc_social:1.4, equality:1.0, progressive:1.0, nation:1.0, authority:1.2};
const COLORS = {
  bg:'#f3f4f7', panel:'#ffffff', border:'#d0d4dc', ink:'#1f2937', soft:'#475569', muted:'#94a3b8',
  user:'#d62728', ide:'#2563eb', bar:'#15803d', rank:'#2563eb', warn:'#b91c1c',
  pcBg:'#1f2230', pcGrid:'#3a3f55', pcAxis:'#9aa3c0', pcLabel:'#e3e6f0',
  qEA:'#a83232', qDA:'#2e5db4', qEL:'#2f8f4d', qDL:'#6a3a99',
  econL:'#c0392b', econR:'#1f6feb', diplL:'#7f5af0', diplR:'#0ea5e9', civL:'#16a34a', civR:'#dc2626', socL:'#a16207', socR:'#0891b2'
};

function normalizeText(value){
  if(value === null || value === undefined) return '';
  return String(value).trim().toLowerCase().replace(/ç/g,'c').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s\-+/]/g,' ').replace(/\s+/g,' ').trim();
}
function userDisplayText(name){ const clean = String(name || 'tu').replace(/\s+/g,' ').trim(); return clean ? clean.slice(0,60) : 'tu'; }
function sanitizeFilenamePart(text, fallback='tu'){
  const norm = normalizeText(text).replace(/\//g,'-').replace(/[^a-z0-9_-]+/g,'_').replace(/_+/g,'_').replace(/^_+|_+$/g,'');
  return (norm || fallback).slice(0,40);
}
function sourceSiteName(url){
  if(!url) return 'Fonte';
  try{ const host = new URL(url).hostname.toLowerCase().replace(/^www\./,''); const parts = host.split('.'); return parts.length >= 2 ? parts.slice(-2).join('.') : host; }
  catch(e){ return 'Abrir fonte'; }
}
function classifyQuadrant(pcEcon, pcSocial){
  const eZero = Math.abs(pcEcon) <= EPS, sZero = Math.abs(pcSocial) <= EPS;
  if(eZero && sZero) return 'Centro';
  if(eZero) return pcSocial > 0 ? 'Centro-autoritária' : 'Centro-libertária';
  if(sZero) return pcEcon > 0 ? 'Direita-centro' : 'Esquerda-centro';
  if(pcEcon < 0 && pcSocial > 0) return 'Esquerda-autoritária';
  if(pcEcon < 0 && pcSocial < 0) return 'Esquerda-libertária';
  if(pcEcon > 0 && pcSocial > 0) return 'Direita-autoritária';
  return 'Direita-libertária';
}
function safePercentage(a,b){ const total = a+b; if(Math.abs(total)<=EPS) return [50,50]; const pa = a/total*100; return [pa, 100-pa]; }
function detectAxes(axisFilterText){
  const norm = normalizeText(axisFilterText); const found = [];
  if(!norm) return found;
  for(const [key, axes] of Object.entries(SPECIAL_AXIS_RULES)){
    if(norm.includes(key)) axes.forEach(axis => { if(!found.includes(axis)) found.push(axis); });
  }
  for(const [axis, keywords] of Object.entries(AXIS_KEYWORDS)){
    if(keywords.some(kw => norm.includes(normalizeText(kw))) && !found.includes(axis)) found.push(axis);
  }
  return found;
}
function applyAxisScore(scores, axis, rawScore, weight=1){
  if(!(axis in AXIS_OPPOSITE)) return;
  const opposite = AXIS_OPPOSITE[axis];
  if(rawScore > 0) scores[axis] = (scores[axis] || 0) + rawScore * weight;
  else if(rawScore < 0) scores[opposite] = (scores[opposite] || 0) + Math.abs(rawScore) * weight;
}
function mainQuestions(){
  const types = ['spectrum','filter','key'];
  const out = [];
  types.forEach(t => QUESTIONS.filter(q => q.question_type === t).forEach(q => out.push(q)));
  return out;
}
function calculateUserResult(answers){
  const scores = {igualdade:0, mercado:0, progressista:0, tradicional:0, nacao:0, mundo:0, autoridade:0, liberdade:0};
  const spectrumQs = QUESTIONS.filter(q => q.question_type === 'spectrum');
  let answered = 0;
  spectrumQs.forEach(q => {
    if(!(q.code in answers)) return;
    answered++;
    const raw = SCORE_MAP[Number(answers[q.code])] || 0;
    const axes = detectAxes(q.axis_filter);
    if(!axes.length) return;
    const weight = 1 / axes.length;
    axes.forEach(axis => applyAxisScore(scores, axis, raw, weight));
  });
  const [equality, market] = safePercentage(scores.igualdade, scores.mercado);
  const [progressive, traditional] = safePercentage(scores.progressista, scores.tradicional);
  const [nation, world] = safePercentage(scores.nacao, scores.mundo);
  const [authority, liberty] = safePercentage(scores.autoridade, scores.liberdade);
  const pcEcon = (market - equality) / 10;
  const pcSocial = (authority - liberty) / 10;
  return {
    pc_econ: round(pcEcon,3), pc_social: round(pcSocial,3), equality: round(equality,1), market: round(market,1),
    progressive: round(progressive,1), traditional: round(traditional,1), nation: round(nation,1), world: round(world,1),
    authority: round(authority,1), liberty: round(liberty,1), quadrant: classifyQuadrant(pcEcon, pcSocial),
    answered, total: spectrumQs.length
  };
}
function round(v,d=0){ const m = Math.pow(10,d); return Math.round((Number(v)+Number.EPSILON)*m)/m; }
function extractIdeologyMentions(text, ideologyNames){
  const normText = normalizeText(text); if(!normText) return [];
  const found = [];
  ideologyNames.slice().sort((a,b)=>b.length-a.length).forEach(name => {
    const normName = normalizeText(name); if(normName.length < 4) return;
    const escaped = normName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re = new RegExp('(?<![a-z0-9])'+escaped+'(?![a-z0-9])');
    if(re.test(normText) && !found.includes(name)) found.push(name);
  });
  return found;
}
function calculateAffinityScores(answers){
  const names = IDEOLOGIES.map(i => i.name); const affinity = {};
  QUESTIONS.forEach(q => {
    if(!['filter','tiebreaker','key'].includes(q.question_type) || !(q.code in answers)) return;
    const raw = SCORE_MAP[Number(answers[q.code])] || 0; if(raw === 0) return;
    const delta = raw / 2;
    let targetText = q.helps || '';
    if(q.question_type === 'key' && targetText.includes('|')) targetText = targetText.split('|')[0];
    extractIdeologyMentions(targetText, names).forEach(name => { affinity[name] = (affinity[name] || 0) + delta; });
  });
  return affinity;
}
function maxPossibleDistance(){ let total=0; Object.entries(DISTANCE_WEIGHTS).forEach(([key,w])=>{ const maxDiff = ['pc_econ','pc_social'].includes(key) ? 2 : 1; total += w * maxDiff * maxDiff; }); return Math.sqrt(total); }
const MAX_DISTANCE = maxPossibleDistance();
function ideologicalSignalStrength(user){ return Math.max(0, Math.min(1, (Math.abs(user.equality-50)+Math.abs(user.progressive-50)+Math.abs(user.nation-50)+Math.abs(user.authority-50))/200)); }
function calculateIdeologyDistance(user, ide){
  const uv = {pc_econ:user.pc_econ/10, pc_social:user.pc_social/10, equality:user.equality/100, progressive:user.progressive/100, nation:user.nation/100, authority:user.authority/100};
  const iv = {pc_econ:ide.pc_econ_typical/10, pc_social:ide.pc_social_typical/10, equality:ide.equality/100, progressive:ide.progressive/100, nation:ide.nation/100, authority:ide.authority/100};
  let total=0; Object.entries(DISTANCE_WEIGHTS).forEach(([key,w]) => { total += w * Math.pow(uv[key]-iv[key],2); });
  return Math.sqrt(total);
}
function rankIdeologies(user, affinityScores){
  const signal = ideologicalSignalStrength(user);
  const rows = IDEOLOGIES.map(ide => {
    const distance = calculateIdeologyDistance(user, ide);
    const similarity = Math.max(0, 100 * (1 - distance / MAX_DISTANCE));
    const affinityBonus = (affinityScores[ide.name] || 0) * 3;
    let rangeBonus = 0;
    if(ide.pc_econ_min <= user.pc_econ && user.pc_econ <= ide.pc_econ_max) rangeBonus += 2;
    if(ide.pc_social_min <= user.pc_social && user.pc_social <= ide.pc_social_max) rangeBonus += 2;
    rangeBonus *= signal;
    let adjusted = similarity + affinityBonus + rangeBonus;
    if(signal < 0.05) adjusted = Math.min(adjusted,80); else if(signal < 0.15) adjusted = Math.min(adjusted,90); else adjusted = Math.min(adjusted,99.9);
    adjusted = Math.max(0, adjusted);
    return {
      ideologia: ide.name, categoria: ide.category, quadrante: classifyQuadrant(ide.pc_econ_typical, ide.pc_social_typical),
      similaridade: round(adjusted,1), similaridade_base: round(similarity,1), pc_econ_tipico: ide.pc_econ_typical, pc_social_tipico: ide.pc_social_typical,
      igualdade: ide.equality, mercado: ide.market, progressista: ide.progressive, tradicionalista: ide.traditional,
      nacao: ide.nation, mundo: ide.world, autoritario: ide.authority, libertario: ide.liberty,
      distancia: round(distance,4), bonus_afinidade: round(affinityBonus,2), bonus_intervalo: round(rangeBonus,2),
      mais_proxima: ide.closest, pergunta_chave: ide.key_question, descricao: ide.description,
      fonte_1_titulo: ide.source1_title, fonte_1_url: ide.source1_url, fonte_2_titulo: ide.source2_title, fonte_2_url: ide.source2_url,
      estado_documental: ide.documentary_status, d_pc_econ: round(user.pc_econ - ide.pc_econ_typical,1), d_pc_social: round(user.pc_social - ide.pc_social_typical,1)
    };
  });
  rows.sort((a,b)=>b.similaridade-a.similaridade);
  rows.forEach((r,i)=>r.posicao=i+1);
  return rows;
}
function labelEconomico(equality){ const market=100-equality; if(equality>=90) return 'Comunista / Coletivista extremo'; if(equality>=75) return 'Socialista'; if(equality>=60) return 'Social-democrata / Igualitário'; if(market>=90) return 'Capitalista laissez-faire'; if(market>=75) return 'Capitalista / Pró-mercado'; if(market>=60) return 'Liberal económico'; return 'Economia mista / Moderado'; }
function labelDiplomatico(world,nation){ if(nation>=90) return 'Ultranacionalista / Autárquico'; if(nation>=75) return 'Nacionalista'; if(nation>=60) return 'Soberanista'; if(world>=90) return 'Globalista / Cosmopolita'; if(world>=75) return 'Internacionalista'; if(world>=60) return 'Cooperativo / Internacionalista moderado'; return 'Equilibrado'; }
function labelCivil(liberty,authority){ if(authority>=90) return 'Totalitário'; if(authority>=75) return 'Autoritário'; if(authority>=60) return 'Parcialmente autoritário'; if(liberty>=90) return 'Anarquista / Ultra-libertário'; if(liberty>=75) return 'Libertário'; if(liberty>=60) return 'Democrático'; return 'Moderado'; }
function labelSocial(progressive,traditional){ if(traditional>=90) return 'Reacionário / Ultra-tradicionalista'; if(traditional>=75) return 'Tradicionalista'; if(traditional>=60) return 'Conservador'; if(progressive>=90) return 'Ultra-progressista / Revolucionário cultural'; if(progressive>=75) return 'Progressista'; if(progressive>=60) return 'Reformista / Socialmente liberal'; return 'Moderado'; }
function describePole(pct, high, low){ if(pct>=65) return `forte orientação para ${high}`; if(pct>=55) return `ligeira orientação para ${high}`; if(pct<=35) return `forte orientação para ${low}`; if(pct<=45) return `ligeira orientação para ${low}`; return `equilíbrio entre ${high} e ${low}`; }
function generateExplanation(user, ranking){
  if(!ranking.length) return 'Sem dados suficientes para gerar uma explicação.';
  const top1=ranking[0], alt=ranking[1];
  const parts = [
    `A ideologia mais próxima foi ${top1.ideologia} (${top1.categoria}), com semelhança de ${top1.similaridade.toFixed(0)}%.`,
    `No eixo económico mostras ${describePole(user.market,'Mercado','Igualdade')}; no eixo de autoridade, ${describePole(user.authority,'Autoridade','Liberdade')}.`,
    `Em Nação vs Mundo há ${describePole(user.nation,'Nação','Mundo')}, e em Progressismo vs Tradicionalismo, ${describePole(user.traditional,'Tradicionalismo','Progressismo')}.`,
    `No Political Compass ficaste em (${fmtSigned(user.pc_econ,1)}, ${fmtSigned(user.pc_social,1)}), quadrante ${user.quadrant}; ${top1.ideologia} situa-se tipicamente em (${fmtSigned(top1.pc_econ_tipico,1)}, ${fmtSigned(top1.pc_social_tipico,1)}).`
  ];
  if(top1.bonus_afinidade) parts.push(`As perguntas diferenciadoras integradas ajustaram a afinidade com ${top1.ideologia} em ${fmtSigned(top1.bonus_afinidade,1)} pontos.`);
  if(alt) parts.push(`A alternativa seguinte é ${alt.ideologia} (${alt.similaridade.toFixed(0)}%).`);
  if(top1.mais_proxima) parts.push(`A tabela indica ${top1.mais_proxima} como ideologia comparável.`);
  return parts.join(' ');
}
function fmtSigned(v,d=2){ const n=Number(v); return (n>=0?'+':'') + n.toFixed(d); }
function getUserLabel(){
  return userDisplayText(localStorage.getItem('questionario_user_label') || 'tu');
}
function setUserLabelFromInputs(){
  const mode = document.querySelector('input[name="nameMode"]:checked')?.value || 'tu';
  const custom = document.getElementById('customName')?.value || '';
  const label = mode === 'custom' ? userDisplayText(custom) : 'tu';
  localStorage.setItem('questionario_user_label', label);
  return label;
}
function downloadText(filename, text, mime='text/plain;charset=utf-8'){
  const blob = new Blob([text], {type:mime}); const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),500);
}
function downloadCanvas(canvasId, filename){
  const canvas = document.getElementById(canvasId); if(!canvas) return;
  const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = filename; a.click();
}
function csvEscape(v){ const s=String(v ?? ''); return /[",\n;]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }

function drawCompass(canvas, userOrIde, ranking=[], opts={}){
  if(!canvas) return; const c=canvas.getContext('2d'); const W=canvas.width,H=canvas.height; c.clearRect(0,0,W,H);
  c.fillStyle=COLORS.pcBg; c.fillRect(0,0,W,H);
  const m=50, x0=m, y0=m, x1=W-m, y1=H-m; const px=e=>x0+(e+10)/20*(x1-x0), py=s=>y0+(10-s)/20*(y1-y0); const cx=px(0), cy=py(0);
  c.fillStyle=COLORS.qEA; c.fillRect(x0,y0,cx-x0,cy-y0); c.fillStyle=COLORS.qDA; c.fillRect(cx,y0,x1-cx,cy-y0); c.fillStyle=COLORS.qEL; c.fillRect(x0,cy,cx-x0,y1-cy); c.fillStyle=COLORS.qDL; c.fillRect(cx,cy,x1-cx,y1-cy);
  c.strokeStyle=COLORS.pcGrid; c.lineWidth=1; for(let t=-10;t<=10;t+=2){ line(c,px(t),y0,px(t),y1); line(c,x0,py(t),x1,py(t)); }
  c.strokeStyle=COLORS.pcAxis; c.lineWidth=2; line(c,cx,y0,cx,y1); line(c,x0,cy,x1,cy); c.strokeRect(x0,y0,x1-x0,y1-y0);
  c.fillStyle=COLORS.pcLabel; c.font='700 16px Segoe UI, Arial'; c.textAlign='center'; c.fillText('Authoritarian', W/2, 28); c.fillText('Libertarian', W/2, H-15); c.textAlign='left'; c.fillText('Left', 18, H/2); c.textAlign='right'; c.fillText('Right', W-18, H/2);
  if(opts.title){ c.fillStyle=COLORS.pcLabel; c.font='700 14px Segoe UI, Arial'; c.textAlign='center'; c.fillText(opts.title, W/2, 18); }
  ranking.slice(0,5).forEach((r,idx)=>{ const x=px(r.pc_econ_tipico), y=py(r.pc_social_tipico); c.fillStyle='white'; c.strokeStyle='#1f2230'; c.lineWidth=2; c.beginPath(); c.arc(x,y,12,0,Math.PI*2); c.fill(); c.stroke(); c.fillStyle='#1f2230'; c.font='700 13px Segoe UI'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(String(idx+1),x,y); c.textBaseline='alphabetic'; });
  const pcEcon = userOrIde.pc_econ ?? userOrIde.pc_econ_typical; const pcSocial = userOrIde.pc_social ?? userOrIde.pc_social_typical;
  const label = opts.label || getUserLabel().toUpperCase(); const x=px(pcEcon), y=py(pcSocial);
  c.fillStyle='#facc15'; c.strokeStyle='#1f2230'; c.lineWidth=3; c.beginPath(); c.arc(x,y,14,0,Math.PI*2); c.fill(); c.stroke(); c.fillStyle='#1f2230'; c.beginPath(); c.arc(x,y,5,0,Math.PI*2); c.fill(); c.fillStyle='#facc15'; c.font='700 15px Segoe UI'; c.textAlign='left'; c.fillText(String(label).slice(0,28), Math.min(x+22,W-210), y-16);
}
function drawIdeologyCompass(canvas, ide){
  drawCompass(canvas, {pc_econ:ide.pc_econ_typical, pc_social:ide.pc_social_typical}, [], {label:ide.name.toUpperCase(), title:`Compasso Político — ${ide.name}`});
}
function drawValues(canvas, obj){
  if(!canvas) return; const c=canvas.getContext('2d'); const W=canvas.width,H=canvas.height; c.clearRect(0,0,W,H); c.fillStyle='white'; c.fillRect(0,0,W,H);
  const rows = [
    ['Eixo Económico','Igualdade',obj.equality,'Mercado',COLORS.econL,COLORS.econR,labelEconomico(obj.equality)],
    ['Eixo Diplomático','Nação',obj.nation,'Mundo',COLORS.diplL,COLORS.diplR,labelDiplomatico(obj.world,obj.nation)],
    ['Eixo Civil','Liberdade',obj.liberty,'Autoridade',COLORS.civL,COLORS.civR,labelCivil(obj.liberty,obj.authority)],
    ['Eixo Social','Tradição',obj.traditional,'Progresso',COLORS.socL,COLORS.socR,labelSocial(obj.progressive,obj.traditional)]
  ];
  const top=14, bot=14, rh=(H-top-bot)/4;
  rows.forEach((row,i)=>{ const [axis,la,va,lb,cl,cr,lbl]=row; const y=top+i*rh+4; c.fillStyle=COLORS.ink; c.font='700 18px Segoe UI'; c.textAlign='left'; c.fillText(axis,20,y+18); c.textAlign='right'; c.fillText(lbl,W-20,y+18); const mid=y+62; c.font='700 32px Segoe UI'; c.fillStyle=cl; c.textAlign='left'; c.fillText(`${Number(va).toFixed(0)}%`,20,mid); c.fillStyle=cr; c.textAlign='right'; c.fillText(`${(100-Number(va)).toFixed(0)}%`,W-20,mid); c.font='13px Segoe UI'; c.fillStyle=COLORS.soft; c.textAlign='left'; c.fillText(la,20,mid+28); c.textAlign='right'; c.fillText(lb,W-20,mid+28); const bx0=130,bx1=W-130,by=mid-20,bh=28,split=bx0+(bx1-bx0)*Math.max(0,Math.min(100,va))/100; c.fillStyle=cl; c.fillRect(bx0,by,split-bx0,bh); c.fillStyle=cr; c.fillRect(split,by,bx1-split,bh); c.strokeStyle='#3a3f55'; c.strokeRect(bx0,by,bx1-bx0,bh); });
}
function drawRadar(canvas, a, b=null, labels={a:'tu',b:'ideologia top 1'}){
  if(!canvas) return; const c=canvas.getContext('2d'); const W=canvas.width,H=canvas.height; c.clearRect(0,0,W,H); c.fillStyle='white'; c.fillRect(0,0,W,H);
  const cx=W/2, cy=H/2+8, R=Math.min(W,H)/2-80; const labs=['Igualdade','Progressista','Nação','Autoritário','Mercado','Tradicionalista','Mundo','Libertário']; const n=labs.length;
  c.strokeStyle='#dbe1ea'; c.lineWidth=1; [0.25,0.5,0.75,1].forEach(k=>{ c.beginPath(); for(let i=0;i<n;i++){ const ang=-Math.PI/2+2*Math.PI*i/n; const x=cx+R*k*Math.cos(ang), y=cy+R*k*Math.sin(ang); if(i===0)c.moveTo(x,y);else c.lineTo(x,y);} c.closePath(); c.stroke(); });
  labs.forEach((lab,i)=>{ const ang=-Math.PI/2+2*Math.PI*i/n; c.strokeStyle='#e8edf3'; line(c,cx,cy,cx+R*Math.cos(ang),cy+R*Math.sin(ang)); c.fillStyle=COLORS.soft; c.font='12px Segoe UI'; c.textAlign='center'; c.fillText(lab,cx+(R+30)*Math.cos(ang),cy+(R+30)*Math.sin(ang)); });
  function poly(obj,color){ const vals=[obj.equality,obj.progressive,obj.nation,obj.authority,obj.market,obj.traditional,obj.world,obj.liberty]; c.beginPath(); vals.forEach((v,i)=>{ const ang=-Math.PI/2+2*Math.PI*i/n; const r=R*Math.max(0,Math.min(100,v))/100; const x=cx+r*Math.cos(ang),y=cy+r*Math.sin(ang); if(i===0)c.moveTo(x,y);else c.lineTo(x,y); }); c.closePath(); c.strokeStyle=color; c.lineWidth=3; c.stroke(); }
  if(b) poly(b,COLORS.ide); if(a) poly(a,COLORS.user);
}
function drawTop(canvas, ranking){
  if(!canvas) return; const c=canvas.getContext('2d'); const W=canvas.width,H=canvas.height; c.clearRect(0,0,W,H); c.fillStyle='white'; c.fillRect(0,0,W,H); c.fillStyle=COLORS.ink; c.font='700 16px Segoe UI'; c.textAlign='center'; c.fillText('Top 10 ideologias por semelhança', W/2, 26);
  const xLabel=20,xBar=360,bw=W-xBar-100,topPad=54,botPad=14,rh=(H-topPad-botPad)/10;
  ranking.slice(0,10).forEach((r,i)=>{ const mid=topPad+i*rh+rh/2; c.fillStyle=COLORS.ink; c.font='15px Segoe UI'; c.textAlign='left'; c.fillText(`${String(r.posicao).padStart(2,' ')}. ${r.ideologia}`, xLabel, mid+5); c.fillStyle='#eef2f7'; c.fillRect(xBar,mid-12,bw,24); c.strokeStyle=COLORS.border; c.strokeRect(xBar,mid-12,bw,24); c.fillStyle=COLORS.rank; c.fillRect(xBar,mid-12,bw*r.similaridade/100,24); c.fillStyle=COLORS.ink; c.font='700 15px Segoe UI'; c.fillText(`${r.similaridade.toFixed(1)}%`, xBar+bw+14, mid+5); });
}
function line(c,x1,y1,x2,y2){ c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke(); }
function findIdeologyByName(name){ const key=normalizeText(name); return IDEOLOGIES.find(i => normalizeText(i.name) === key) || null; }
function subjectFromIdeology(ide){ return {tipo:'ideologia', nome:ide.name, categoria:ide.category || '—', quadrante:classifyQuadrant(ide.pc_econ_typical,ide.pc_social_typical), pc_econ:+ide.pc_econ_typical, pc_social:+ide.pc_social_typical, equality:+ide.equality, market:+ide.market, progressive:+ide.progressive, traditional:+ide.traditional, nation:+ide.nation, world:+ide.world, authority:+ide.authority, liberty:+ide.liberty, descricao:ide.description || '', mais_proxima:ide.closest || '—', labels:{economico:labelEconomico(+ide.equality), diplomatico:labelDiplomatico(+ide.world,+ide.nation), civil:labelCivil(+ide.liberty,+ide.authority), social:labelSocial(+ide.progressive,+ide.traditional)}}; }
function subjectFromUser(user,label='tu'){ return {tipo:'perfil', nome:userDisplayText(label), categoria:'Perfil importado / crenças pessoais', quadrante:user.quadrant, pc_econ:+user.pc_econ, pc_social:+user.pc_social, equality:+user.equality, market:+user.market, progressive:+user.progressive, traditional:+user.traditional, nation:+user.nation, world:+user.world, authority:+user.authority, liberty:+user.liberty, descricao:'Perfil calculado a partir das respostas do questionário.', mais_proxima:'—', labels:{economico:labelEconomico(+user.equality), diplomatico:labelDiplomatico(+user.world,+user.nation), civil:labelCivil(+user.liberty,+user.authority), social:labelSocial(+user.progressive,+user.traditional)}}; }
function subjectDistanceSimilarity(a,b){
  const av={pc_econ:a.pc_econ/10, pc_social:a.pc_social/10, equality:a.equality/100, progressive:a.progressive/100, nation:a.nation/100, authority:a.authority/100};
  const bv={pc_econ:b.pc_econ/10, pc_social:b.pc_social/10, equality:b.equality/100, progressive:b.progressive/100, nation:b.nation/100, authority:b.authority/100};
  let total=0; Object.entries(DISTANCE_WEIGHTS).forEach(([key,w])=>{total+=w*Math.pow(av[key]-bv[key],2)}); const dist=Math.sqrt(total); const sim=Math.max(0,Math.min(100,100*(1-dist/MAX_DISTANCE))); return [dist,sim];
}
function directionSentence(aName,bName,label,diff,positive,negative,unit='pontos'){ if(Math.abs(diff)<0.5) return `- ${label}: praticamente iguais.`; if(diff>0) return `- ${label}: ${aName} é ${Math.abs(diff).toFixed(1)} ${unit} mais ${positive} do que ${bName}.`; return `- ${label}: ${aName} é ${Math.abs(diff).toFixed(1)} ${unit} mais ${negative} do que ${bName}.`; }
function comparisonReading(a,b,sim){ let base; if(sim>=85) base='Os dois perfis são muito próximos no modelo do questionário. As diferenças são sobretudo de grau.'; else if(sim>=70) base='Os dois perfis têm proximidade relevante, mas já existem diferenças claras em alguns eixos.'; else if(sim>=50) base='Os dois perfis partilham alguns pontos, mas pertencem a zonas ideológicas bastante distintas.'; else base='Os dois perfis são distantes no modelo do questionário. A comparação deve ser lida mais como contraste do que como proximidade.'; const biggest=[['económica',Math.abs(a.pc_econ-b.pc_econ)],['civil/autoritária',Math.abs(a.pc_social-b.pc_social)],['igualdade vs mercado',Math.abs(a.equality-b.equality)],['progressismo vs tradição',Math.abs(a.progressive-b.progressive)],['nação vs mundo',Math.abs(a.nation-b.nation)],['autoridade vs liberdade',Math.abs(a.authority-b.authority)]].sort((x,y)=>y[1]-x[1])[0]; return `${base} A maior diferença aparece na dimensão ${biggest[0]}.`; }
function comparisonReport(a,b){
  const [dist,sim]=subjectDistanceSimilarity(a,b), aName=a.nome, bName=b.nome;
  const diffs=[['Political Compass económico',Math.abs(a.pc_econ-b.pc_econ),'pontos PC'],['Political Compass social',Math.abs(a.pc_social-b.pc_social),'pontos PC'],['Igualdade',Math.abs(a.equality-b.equality),'pontos percentuais'],['Mercado',Math.abs(a.market-b.market),'pontos percentuais'],['Progressismo',Math.abs(a.progressive-b.progressive),'pontos percentuais'],['Tradição',Math.abs(a.traditional-b.traditional),'pontos percentuais'],['Nação',Math.abs(a.nation-b.nation),'pontos percentuais'],['Mundo',Math.abs(a.world-b.world),'pontos percentuais'],['Autoridade',Math.abs(a.authority-b.authority),'pontos percentuais'],['Liberdade',Math.abs(a.liberty-b.liberty),'pontos percentuais']].sort((x,y)=>y[1]-x[1]);
  return [
    'COMPARAÇÃO','='.repeat(60),`${aName}  vs  ${bName}`,'',`Semelhança aproximada: ${sim.toFixed(1)}%`,`Distância normalizada: ${dist.toFixed(4)}`,'','RESUMO RÁPIDO',
    directionSentence(aName,bName,'Económico / PC',a.pc_econ-b.pc_econ,'à direita','à esquerda'),
    directionSentence(aName,bName,'Civil / PC',a.pc_social-b.pc_social,'autoritário','libertário'),
    directionSentence(aName,bName,'Igualdade',a.equality-b.equality,'igualitário','pró-mercado'),
    directionSentence(aName,bName,'Progressismo',a.progressive-b.progressive,'progressista','tradicionalista'),
    directionSentence(aName,bName,'Nação',a.nation-b.nation,'nacionalista','internacionalista/globalista'),
    directionSentence(aName,bName,'Autoridade',a.authority-b.authority,'autoritário','libertário'),'',
    'POLITICAL COMPASS',
    `  ${aName.slice(0,28).padEnd(28)} | Económico ${fmtSigned(a.pc_econ,2).padStart(7)} | Social ${fmtSigned(a.pc_social,2).padStart(7)} | ${a.quadrante}`,
    `  ${bName.slice(0,28).padEnd(28)} | Económico ${fmtSigned(b.pc_econ,2).padStart(7)} | Social ${fmtSigned(b.pc_social,2).padStart(7)} | ${b.quadrante}`,'',
    'VALORES TIPO 8VALUES',
    `  Eixo económico:     ${aName.slice(0,20)} ${a.equality.toFixed(0)} / ${a.market.toFixed(0)}     |     ${bName.slice(0,20)} ${b.equality.toFixed(0)} / ${b.market.toFixed(0)}`,
    '                      Igualdade / Mercado',
    `  Eixo social:        ${aName.slice(0,20)} ${a.progressive.toFixed(0)} / ${a.traditional.toFixed(0)}     |     ${bName.slice(0,20)} ${b.progressive.toFixed(0)} / ${b.traditional.toFixed(0)}`,
    '                      Progressismo / Tradição',
    `  Eixo diplomático:   ${aName.slice(0,20)} ${a.nation.toFixed(0)} / ${a.world.toFixed(0)}     |     ${bName.slice(0,20)} ${b.nation.toFixed(0)} / ${b.world.toFixed(0)}`,
    '                      Nação / Mundo',
    `  Eixo civil:         ${aName.slice(0,20)} ${a.authority.toFixed(0)} / ${a.liberty.toFixed(0)}     |     ${bName.slice(0,20)} ${b.authority.toFixed(0)} / ${b.liberty.toFixed(0)}`,
    '                      Autoridade / Liberdade','',
    'RÓTULOS APROXIMADOS',
    `  ${aName.slice(0,28).padEnd(28)} | Económico: ${a.labels.economico}`,
    `  ${bName.slice(0,28).padEnd(28)} | Económico: ${b.labels.economico}`,
    `  ${aName.slice(0,28).padEnd(28)} | Diplomático: ${a.labels.diplomatico}`,
    `  ${bName.slice(0,28).padEnd(28)} | Diplomático: ${b.labels.diplomatico}`,
    `  ${aName.slice(0,28).padEnd(28)} | Civil: ${a.labels.civil}`,
    `  ${bName.slice(0,28).padEnd(28)} | Civil: ${b.labels.civil}`,
    `  ${aName.slice(0,28).padEnd(28)} | Social: ${a.labels.social}`,
    `  ${bName.slice(0,28).padEnd(28)} | Social: ${b.labels.social}`,'','MAIORES DIFERENÇAS',
    ...diffs.slice(0,6).map(([label,value,unit])=>`  - ${label}: ${value.toFixed(1)} ${unit}`),'','LEITURA',comparisonReading(a,b,sim),'','Nota: esta comparação usa os valores internos do questionário. Não é uma avaliação moral, científica ou histórica definitiva.'
  ].join('\n');
}

(function initMainPage(){
  if(!document.getElementById('homeView')) return;
  const savedLabel = getUserLabel(); const customInput=document.getElementById('customName');
  const customRadio = document.querySelector('input[name="nameMode"][value="custom"]');
  if(customInput && customRadio && savedLabel !== 'tu'){ customRadio.checked=true; customInput.disabled=false; customInput.value=savedLabel; }
  document.querySelectorAll('input[name="nameMode"]').forEach(r => r.addEventListener('change', () => { if(customInput) customInput.disabled = document.querySelector('input[name="nameMode"]:checked').value !== 'custom'; setUserLabelFromInputs(); }));
  if(customInput) customInput.addEventListener('input', setUserLabelFromInputs);
  const openQuiz = document.getElementById('openQuizBtn');
  if(openQuiz){
    openQuiz.addEventListener('click', () => { setUserLabelFromInputs(); });
  }
  document.querySelectorAll('[data-open-view]').forEach(btn => btn.addEventListener('click', () => { if(btn.dataset.openView==='homeView') setUserLabelFromInputs(); openView(btn.dataset.openView); }));
  initLibrary(); initComparator();
})();
function openView(id){ document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); document.getElementById(id)?.classList.add('active'); window.scrollTo(0,0); }
let selectedIdeology = IDEOLOGIES[0] || null; let importedProfile=null, importedProfileLabel='perfil importado', importedProfileRanking=[];
function initLibrary(){
  const catSel=document.getElementById('categorySelect'); if(!catSel) return;
  const cats=['(todas)', ...Array.from(new Set(IDEOLOGIES.map(i=>i.category).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'pt'))];
  catSel.innerHTML=cats.map(c=>`<option>${escapeHtml(c)}</option>`).join('');
  document.getElementById('ideologySearch').addEventListener('input', refreshTable); catSel.addEventListener('change', refreshTable);
  document.getElementById('compareSelectedBtn').addEventListener('click',()=>{ if(selectedIdeology){ document.getElementById('compareA').value=selectedIdeology.name; openView('compareView'); }});
  document.getElementById('graphSelectedBtn').addEventListener('click',()=>{ if(selectedIdeology) drawIdeologyGraphs(selectedIdeology); document.getElementById('ideologyGraphs').scrollIntoView({behavior:'smooth'}); });
  refreshTable(); if(selectedIdeology) showIdeology(selectedIdeology);
}
function refreshTable(){
  const term=normalizeText(document.getElementById('ideologySearch').value); const cat=document.getElementById('categorySelect').value; const tbody=document.querySelector('#ideologyTable tbody'); tbody.innerHTML=''; let count=0;
  IDEOLOGIES.forEach(ide=>{ if(term && !normalizeText(ide.name).includes(term)) return; if(cat && cat!=='(todas)' && ide.category!==cat) return; count++; const tr=document.createElement('tr'); if(selectedIdeology && ide.name===selectedIdeology.name) tr.classList.add('selected'); tr.innerHTML=`<td>${escapeHtml(ide.name)}</td><td>${escapeHtml(ide.category)}</td><td>${escapeHtml(classifyQuadrant(ide.pc_econ_typical, ide.pc_social_typical))}</td><td>${fmtSigned(ide.pc_econ_typical,0)}</td><td>${fmtSigned(ide.pc_social_typical,0)}</td>`; tr.addEventListener('click',()=>showIdeology(ide)); tbody.appendChild(tr); });
  document.getElementById('ideologyCount').textContent=`${count} de ${IDEOLOGIES.length} ideologias`;
}
function showIdeology(ide){ selectedIdeology=ide; document.querySelectorAll('#ideologyTable tr').forEach(tr=>tr.classList.remove('selected')); refreshTableNoLoop(); document.getElementById('detailTitle').textContent=`${ide.name} — ${ide.category}`; const lines=[`Quadrante ${classifyQuadrant(ide.pc_econ_typical, ide.pc_social_typical)}`,`8values: Igual ${ide.equality.toFixed(0)}/Merc ${ide.market.toFixed(0)} · Prog ${ide.progressive.toFixed(0)}/Trad ${ide.traditional.toFixed(0)} · Nação ${ide.nation.toFixed(0)}/Mundo ${ide.world.toFixed(0)} · Aut ${ide.authority.toFixed(0)}/Lib ${ide.liberty.toFixed(0)}`,`Mais próxima: ${ide.closest || '—'}`,ide.description || '', ide.key_question ? `Pergunta diferenciadora: ${ide.key_question}` : '', ide.sources_confidence ? `Confiança das fontes: ${ide.sources_confidence}` : '', ide.documentary_status ? `Estatuto documental: ${ide.documentary_status}` : '', ide.speculative_status ? `Especulativa/por comparação: ${ide.speculative_status}` : '', ide.source1_title ? `Fonte 1: ${ide.source1_title} (${sourceSiteName(ide.source1_url)})` : '', ide.source2_title ? `Fonte 2: ${ide.source2_title} (${sourceSiteName(ide.source2_url)})` : '', ide.source_note ? `Nota de fontes: ${ide.source_note}` : ''].filter(Boolean); document.getElementById('detailText').textContent=lines.join('\n'); setSourceButtons(ide); drawIdeologyGraphs(ide); }
function refreshTableNoLoop(){ const rows=document.querySelectorAll('#ideologyTable tbody tr'); rows.forEach(row=>{ if(row.cells[0]?.textContent===selectedIdeology.name) row.classList.add('selected'); else row.classList.remove('selected'); }); }
function setSourceButtons(ide){ const div=document.getElementById('sourceButtons'); div.innerHTML=''; const sources=[]; [ide.source1_url,ide.source2_url].forEach(url=>{ if(url && !sources.includes(url)) sources.push(url); }); if(!sources.length){ div.textContent='Fontes: não há links associados a esta ideologia.'; return; } const strong=document.createElement('strong'); strong.textContent='Fontes usadas:'; div.appendChild(strong); const used={}; sources.forEach(url=>{ let label=sourceSiteName(url); used[label]=(used[label]||0)+1; if(used[label]>1) label += ` (${used[label]})`; const b=document.createElement('button'); b.className='btn'; b.textContent=label; b.addEventListener('click',()=>window.open(url,'_blank','noopener')); div.appendChild(b); }); }
function drawIdeologyGraphs(ide){ document.getElementById('graphsTitle').textContent=`Gráficos — ${ide.name}`; drawIdeologyCompass(document.getElementById('ideCompass'), ide); drawValues(document.getElementById('ideValues'), ide); const closest=findIdeologyByName(ide.closest); drawRadar(document.getElementById('ideRadar'), ide, closest && normalizeText(closest.name)!==normalizeText(ide.name)?closest:null, {a:ide.name,b:closest?.name}); }
function initComparator(){
  const a=document.getElementById('compareA'); if(!a) return; const b=document.getElementById('compareB'); const opts=IDEOLOGIES.map(i=>`<option>${escapeHtml(i.name)}</option>`).join(''); a.innerHTML=opts; b.innerHTML=opts; if(IDEOLOGIES[1]) b.value=IDEOLOGIES[1].name;
  document.getElementById('compareTwoBtn').addEventListener('click',()=>{ const ia=findIdeologyByName(a.value), ib=findIdeologyByName(b.value); if(!ia||!ib) return alert('Escolhe duas ideologias válidas.'); if(normalizeText(ia.name)===normalizeText(ib.name)) return alert('Escolhe duas ideologias diferentes.'); document.getElementById('compareTitle').textContent=`Comparação — ${ia.name} vs ${ib.name}`; document.getElementById('compareOutput').textContent=comparisonReport(subjectFromIdeology(ia), subjectFromIdeology(ib)); });
  document.getElementById('compareProfileBtn').addEventListener('click',()=>{ const ia=findIdeologyByName(a.value); if(!ia) return alert('Escolhe uma ideologia válida no campo Ideologia A.'); if(!importedProfile) return alert('Importa primeiro um ficheiro JSON de perfil.'); const sb=subjectFromUser(importedProfile,importedProfileLabel); document.getElementById('compareTitle').textContent=`Comparação — ${ia.name} vs ${sb.nome}`; document.getElementById('compareOutput').textContent=comparisonReport(subjectFromIdeology(ia), sb); });
  document.getElementById('profileFile').addEventListener('change',ev=>{ const file=ev.target.files[0]; if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try{ const data=JSON.parse(reader.result); const user=data.user_result || data.perfil || data.profile; if(!user) throw new Error('O ficheiro não contém a chave user_result.'); importedProfile=user; importedProfileLabel=data.respondente || data.nome || data.profile_name || 'perfil importado'; importedProfileRanking=data.top_ideologies || data.ranking || []; let top=''; if(importedProfileRanking.length && importedProfileRanking[0].ideologia) top=` · top: ${importedProfileRanking[0].ideologia}`; document.getElementById('profileStatus').textContent=`Perfil importado: ${userDisplayText(importedProfileLabel)}${top}`; }catch(e){ alert('Não foi possível importar o JSON: '+e.message); } }; reader.readAsText(file); });
}
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
window.QI = {calculateUserResult,calculateAffinityScores,rankIdeologies,generateExplanation,drawCompass,drawValues,drawRadar,drawTop,downloadText,downloadCanvas,fmtSigned,labelEconomico,labelDiplomatico,labelCivil,labelSocial,findIdeologyByName,sourceSiteName,sanitizeFilenamePart,mainQuestions,csvEscape};
