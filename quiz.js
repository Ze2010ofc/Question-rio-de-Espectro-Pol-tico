'use strict';

let qAnswers = {};
let qUser = null;
let qRanking = [];
const ANSWER_KEY = 'questionario_answers_integrado';

(function initQuiz(){
  if(!window.QI || !Array.isArray(QUESTIONS) || !QUESTIONS.length){
    const box=document.getElementById('questionsContainer');
    if(box) box.innerHTML='<section class="card"><h2>Erro ao carregar dados</h2><p>O ficheiro data.js não carregou corretamente. Confirma que index.html, questionario.html, style.css, app.js, quiz.js e data.js foram todos enviados para a raiz do GitHub Pages.</p></section>';
    return;
  }
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => openTab(btn.dataset.tab)));
  document.getElementById('backHomeBtn').addEventListener('click', () => { window.location.href = 'index.html'; });
  document.getElementById('shuffleQuestions').addEventListener('change', renderQuestions);
  document.getElementById('calculateBtn').addEventListener('click', computeResults);
  document.getElementById('recalculateBtn').addEventListener('click', computeResults);
  document.getElementById('resetBtn').addEventListener('click', resetAnswers);
  document.getElementById('exportJsonBtn').addEventListener('click', exportJson);
  document.getElementById('exportProfileBtn').addEventListener('click', exportProfileJson);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('exportTxtBtn').addEventListener('click', exportTxt);
  document.getElementById('printBtn').addEventListener('click', () => window.print());
  document.querySelectorAll('[data-export-canvas]').forEach(btn => btn.addEventListener('click', () => QI.downloadCanvas(btn.dataset.exportCanvas, `${btn.dataset.exportCanvas}_${QI.sanitizeFilenamePart(getUserLabel())}.png`)));
  try{ qAnswers = JSON.parse(localStorage.getItem(ANSWER_KEY) || '{}') || {}; }catch(e){ qAnswers = {}; }
  renderQuestions();
})();

function openTab(id){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.tab===id));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active', p.id===id));
  window.scrollTo(0,0);
}
function getRenderedQuestions(){
  let qs = QI.mainQuestions().slice();
  if(document.getElementById('shuffleQuestions').checked){ qs = shuffleDeterministic(qs); }
  return qs;
}
function shuffleDeterministic(arr){
  const a=arr.slice(); let seed=42;
  function rnd(){ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function renderQuestions(){
  const container=document.getElementById('questionsContainer'); container.innerHTML='';
  let lastSection=null;
  getRenderedQuestions().forEach(q=>{
    if(q.section!==lastSection){ const h=document.createElement('div'); h.className='question-section-title'; h.textContent=q.section; container.appendChild(h); lastSection=q.section; }
    const row=document.createElement('article'); row.className='question-row';
    row.innerHTML = `<div class="question-text">(${escapeHtml(q.code)}) ${escapeHtml(q.text)}</div>${q.axis_filter ? `<div class="axis-text">eixo / filtro: ${escapeHtml(q.axis_filter)}</div>` : ''}<div class="answers"></div>`;
    const answersDiv=row.querySelector('.answers');
    for(let k=1;k<=5;k++){
      const id=`q_${q.code}_${k}`;
      const label=document.createElement('label');
      label.innerHTML=`<input type="radio" name="${escapeHtml(q.code)}" id="${id}" value="${k}"> ${k} — ${SCALE_LABELS[k]}`;
      const input=label.querySelector('input');
      if(Number(qAnswers[q.code])===k) input.checked=true;
      input.addEventListener('change',()=>{ qAnswers[q.code]=k; saveAnswers(); updateProgress(); });
      answersDiv.appendChild(label);
    }
    container.appendChild(row);
  });
  updateProgress();
}
function saveAnswers(){ localStorage.setItem(ANSWER_KEY, JSON.stringify(qAnswers)); }
function updateProgress(){
  const total=QI.mainQuestions().length;
  const answered=Object.keys(qAnswers).filter(code => [1,2,3,4,5].includes(Number(qAnswers[code]))).length;
  document.getElementById('progressText').textContent=`Respondidas: ${answered} / ${total}`;
  const bar=document.getElementById('progressBar'); bar.max=Math.max(1,total); bar.value=answered;
}
function spectrumAnswered(){
  const spectrum = QUESTIONS.filter(q=>q.question_type==='spectrum').map(q=>q.code);
  return spectrum.filter(code => [1,2,3,4,5].includes(Number(qAnswers[code]))).length;
}
function computeResults(){
  const sp=spectrumAnswered();
  if(sp===0){ alert('Responde a pelo menos uma pergunta de espectro.'); return; }
  if(sp<20 && !confirm(`Respondeste apenas a ${sp} perguntas de espectro (recomendado: 20+). O resultado pode ser pouco fiável. Queres continuar mesmo assim?`)) return;
  qUser = QI.calculateUserResult(qAnswers);
  qRanking = QI.rankIdeologies(qUser, QI.calculateAffinityScores(qAnswers));
  drawResults();
  openTab('resultsPanel');
}
function drawResults(){
  const user=qUser, ranking=qRanking; if(!user) return;
  const partial = user.answered >= user.total ? '' : ` · parcial: ${user.answered}/${user.total}`;
  document.getElementById('resultSummary').textContent = `Economia ${QI.fmtSigned(user.pc_econ,2)} · Social ${QI.fmtSigned(user.pc_social,2)} · ${user.quadrant}${partial}`;
  if(ranking.length){ const t=ranking[0]; document.getElementById('resultSubtitle').textContent = `Ideologia mais próxima: ${t.ideologia} · ${t.similaridade.toFixed(1)}% · ${t.categoria}`; }
  document.getElementById('compassCoords').textContent = `Economic Left/Right: ${QI.fmtSigned(user.pc_econ,2)} · Social Libertarian/Authoritarian: ${QI.fmtSigned(user.pc_social,2)}`;
  QI.drawCompass(document.getElementById('compassCanvas'), user, ranking, {label:getUserLabel().toUpperCase()});
  buildCompassLegend(ranking);
  QI.drawValues(document.getElementById('valuesCanvas'), user);
  const topIde = ranking.length ? QI.findIdeologyByName(ranking[0].ideologia) : null;
  document.getElementById('radarUserLabel').textContent = getUserLabel();
  document.getElementById('radarTopLabel').textContent = topIde ? topIde.name : 'ideologia top 1';
  QI.drawRadar(document.getElementById('radarCanvas'), user, topIde);
  QI.drawTop(document.getElementById('topCanvas'), ranking);
  document.getElementById('resultReport').textContent = buildTextReport(user, ranking);
}
function buildCompassLegend(ranking){
  const div=document.getElementById('compassLegend'); div.innerHTML='<strong>Ideologias mais próximas:</strong>';
  ranking.slice(0,5).forEach((r,i)=>{ const line=document.createElement('div'); line.textContent = `${i+1}. ${r.ideologia} · ${r.similaridade.toFixed(1)}%`; div.appendChild(line); });
}
function buildTextReport(user, ranking){
  const lines=[];
  lines.push(QI.generateExplanation(user, ranking));
  lines.push('');
  lines.push('Rótulos dos eixos:');
  lines.push(`  Económico:    ${QI.labelEconomico(user.equality)} (Igualdade ${user.equality.toFixed(0)}% · Mercado ${user.market.toFixed(0)}%)`);
  lines.push(`  Diplomático:  ${QI.labelDiplomatico(user.world, user.nation)} (Nação ${user.nation.toFixed(0)}% · Mundo ${user.world.toFixed(0)}%)`);
  lines.push(`  Civil:        ${QI.labelCivil(user.liberty, user.authority)} (Liberdade ${user.liberty.toFixed(0)}% · Autoridade ${user.authority.toFixed(0)}%)`);
  lines.push(`  Social:       ${QI.labelSocial(user.progressive, user.traditional)} (Tradição ${user.traditional.toFixed(0)}% · Progresso ${user.progressive.toFixed(0)}%)`);
  lines.push('');
  lines.push('Top 10 ideologias:');
  ranking.slice(0,10).forEach(r => lines.push(`  ${String(r.posicao).padStart(2,' ')}. ${r.ideologia} — ${r.similaridade.toFixed(1)}% (${r.categoria})`));
  return lines.join('\n');
}
function fullPayload(){
  return {
    created_at: new Date().toISOString(),
    respondente: getUserLabel(),
    user_result: qUser,
    labels: qUser ? {economico:QI.labelEconomico(qUser.equality), diplomatico:QI.labelDiplomatico(qUser.world,qUser.nation), civil:QI.labelCivil(qUser.liberty,qUser.authority), social:QI.labelSocial(qUser.progressive,qUser.traditional)} : {},
    ranking: qRanking,
    answers: qAnswers,
    nota: 'Perfil comparativo/exportável. Não é diagnóstico científico nem avaliação moral.'
  };
}
function ensureResults(){ if(!qUser){ alert('Calcula os resultados primeiro.'); return false; } return true; }
function exportJson(){ if(!ensureResults()) return; QI.downloadText(`resultados_${QI.sanitizeFilenamePart(getUserLabel())}.json`, JSON.stringify(fullPayload(), null, 2), 'application/json;charset=utf-8'); }
function exportProfileJson(){
  if(!ensureResults()) return;
  const payload = {profile_type:'questionario_ideologico_user_profile', version:1, created_at:new Date().toISOString(), respondente:getUserLabel(), user_result:qUser, labels:fullPayload().labels, top_match:qRanking[0] || null, top_ideologies:qRanking.slice(0,10), answers:qAnswers, tiebreaker_answers:{}, nota:'Perfil comparativo/exportável. Não é diagnóstico científico nem avaliação moral.'};
  QI.downloadText(`perfil_ideologico_${QI.sanitizeFilenamePart(getUserLabel())}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
}
function exportCsv(){
  if(!ensureResults()) return;
  const headers=['posicao','ideologia','categoria','quadrante','similaridade','pc_econ_tipico','pc_social_tipico','igualdade','mercado','progressista','tradicionalista','nacao','mundo','autoritario','libertario'];
  const lines=[headers.join(';')];
  qRanking.forEach(r => lines.push(headers.map(h=>QI.csvEscape(r[h])).join(';')));
  QI.downloadText(`ranking_${QI.sanitizeFilenamePart(getUserLabel())}.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
}
function exportTxt(){ if(!ensureResults()) return; QI.downloadText(`relatorio_${QI.sanitizeFilenamePart(getUserLabel())}.txt`, buildFullTxtReport(), 'text/plain;charset=utf-8'); }
function buildFullTxtReport(){
  const user=qUser, ranking=qRanking; const lines=[];
  lines.push('QUESTIONARIO DE IDENTIFICACAO IDEOLOGICA - RELATORIO'); lines.push('='.repeat(55)); lines.push('');
  lines.push(`Respondente: ${getUserLabel()}`); lines.push(`Respostas usadas: ${user.answered} de ${user.total} perguntas de espectro.`); lines.push('');
  lines.push('POLITICAL COMPASS'); lines.push(`  Economico: ${QI.fmtSigned(user.pc_econ,2)}  (-10 esquerda / +10 direita)`); lines.push(`  Social:    ${QI.fmtSigned(user.pc_social,2)}  (-10 libertario / +10 autoritario)`); lines.push(`  Quadrante: ${user.quadrant}`); lines.push('');
  lines.push('VALORES TIPO 8VALUES'); lines.push(`  Igualdade ${user.equality.toFixed(0)}%  |  Mercado ${user.market.toFixed(0)}%`); lines.push(`  Progressista ${user.progressive.toFixed(0)}%  |  Tradicionalista ${user.traditional.toFixed(0)}%`); lines.push(`  Nacao ${user.nation.toFixed(0)}%  |  Mundo ${user.world.toFixed(0)}%`); lines.push(`  Autoritario ${user.authority.toFixed(0)}%  |  Libertario ${user.liberty.toFixed(0)}%`); lines.push('');
  lines.push('TOP 10 IDEOLOGIAS MAIS PROXIMAS'); ranking.slice(0,10).forEach(r=>lines.push(`  ${String(r.posicao).padStart(2,' ')}. ${r.ideologia} - ${r.similaridade.toFixed(0)}% (${r.categoria}; PC ${QI.fmtSigned(r.pc_econ_tipico,0)},${QI.fmtSigned(r.pc_social_tipico,0)})`)); lines.push(''); lines.push('EXPLICACAO'); lines.push(QI.generateExplanation(user, ranking)); lines.push(''); lines.push('Nota: ferramenta comparativa e educativa, nao e avaliacao cientifica nem moral.'); return lines.join('\n');
}
function resetAnswers(){ if(!confirm('Apagar todas as respostas dadas?')) return; qAnswers={}; qUser=null; qRanking=[]; saveAnswers(); renderQuestions(); document.getElementById('resultReport').textContent='Calcula os resultados primeiro.'; }
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
