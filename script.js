/*
 * Common JavaScript utilities for the Ideological Questionnaire website.
 *
 * This file defines functions to load data, compute ideological scores,
 * classify quadrants, rank ideologies and generate explanations. The
 * algorithms mirror those used in the original Python Tkinter
 * application, translated to JavaScript for use in the browser.
 */

// The JSON data is embedded directly into this script to avoid fetch()
// restrictions when loading via the file:// protocol. The content of
// ideologies.json and questions.json was read at build time.
const DATA = {
  ideologies: [],
  questions: [],
  loaded: false
};

// Embedded JSON data: defined in data.js. The variables `IDEOLOGIES` and
// `QUESTIONS` are provided as globals by data.js. Do not redeclare them
// here. loadData() will pick up those values when available.

/**
 * Load the embedded data from JSON files. Returns a promise that
 * resolves once both ideologies and questions have been fetched.
 */
async function loadData() {
  if (DATA.loaded) return;
  try {
    // Prefer embedded data loaded by data.js + questions_data.js.
    if (typeof IDEOLOGIES_DATA !== 'undefined') DATA.ideologies = IDEOLOGIES_DATA;
    else if (typeof IDEOLOGIES !== 'undefined') DATA.ideologies = IDEOLOGIES;

    if (typeof QUESTIONS_DATA !== 'undefined') DATA.questions = QUESTIONS_DATA;
    else if (typeof QUESTIONS !== 'undefined') DATA.questions = QUESTIONS;

    // Fallback for HTTP/GitHub Pages if the embedded globals are absent.
    if (!Array.isArray(DATA.ideologies) || DATA.ideologies.length === 0 ||
        !Array.isArray(DATA.questions) || DATA.questions.length === 0) {
      const [ideResp, qResp] = await Promise.all([
        fetch('ideologies.json'),
        fetch('questions.json')
      ]);
      if (!ideResp.ok) throw new Error(`Não foi possível carregar ideologies.json (${ideResp.status}).`);
      if (!qResp.ok) throw new Error(`Não foi possível carregar questions.json (${qResp.status}).`);
      DATA.ideologies = await ideResp.json();
      DATA.questions = await qResp.json();
    }

    if (!Array.isArray(DATA.ideologies) || DATA.ideologies.length === 0) {
      throw new Error('Dados de ideologias vazios ou inválidos.');
    }
    if (!Array.isArray(DATA.questions) || DATA.questions.length === 0) {
      throw new Error('Dados de perguntas vazios ou inválidos.');
    }
    DATA.loaded = true;
  } catch (err) {
    DATA.loaded = false;
    console.error(err);
    throw err;
  }
}

/* Text normalization: lower case, remove accents and special chars */
function normalize(text) {
  if (!text) return '';
  // Convert to string and lower case
  let s = String(text).trim().toLowerCase();
  // Remove accents
  s = s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  // Replace some special Portuguese chars
  s = s.replace(/ç/g, 'c');
  // Replace non alphanumeric (plus some punctuation) with space
  s = s.replace(/[^a-z0-9\s\-+/]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}


const SCORE_MAP = {1: -2, 2: -1, 3: 0, 4: 1, 5: 2};

const DISTANCE_WEIGHTS = {
  // Political Compass is useful, but it is partly derived from the same axes as the 8values scores.
  // These weights reduce double-counting and give cultural/civil/diplomatic dimensions more room.
  pc_econ: 0.85,
  pc_social: 0.85,
  equality: 1.10,
  progressive: 1.25,
  nation: 1.15,
  authority: 1.25
};

/**
 * Classify the quadrant on the political compass based on pc_econ and pc_social.
 */
function classifyQuadrant(pc_econ, pc_social) {
  const EPS = 1e-9;
  const eZero = Math.abs(pc_econ) <= EPS;
  const sZero = Math.abs(pc_social) <= EPS;
  if (eZero && sZero) return 'Centro';
  if (eZero) return pc_social > 0 ? 'Centro-autoritária' : 'Centro-libertária';
  if (sZero) return pc_econ > 0 ? 'Direita-centro' : 'Esquerda-centro';
  if (pc_econ < 0 && pc_social > 0) return 'Esquerda-autoritária';
  if (pc_econ < 0 && pc_social < 0) return 'Esquerda-libertária';
  if (pc_econ > 0 && pc_social > 0) return 'Direita-autoritária';
  return 'Direita-libertária';
}

/**
 * Compute the user result (equality, market, progressive, etc.) given answers.
 * Answers object maps question codes to selected values 1-5.
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numericEffect(q, key) {
  const aliases = {
    effect_econ: ['effect_econ', 'Efeito_Econ'],
    effect_dipl: ['effect_dipl', 'Efeito_Dipl'],
    effect_govt: ['effect_govt', 'Efeito_Govt'],
    effect_scty: ['effect_scty', 'Efeito_Scty']
  };
  for (const k of aliases[key]) {
    if (q[k] !== undefined && q[k] !== null && q[k] !== '') {
      const n = Number(q[k]);
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

/**
 * Compute the user result from the numeric effects defined in the Excel source.
 * The old paired-text scoring system was removed; scoring now uses only numeric effects.
 * Answers object maps question codes to selected values 1-5.
 */
function calculateUserResult(questions, answers) {
  const scoredQs = questions.filter(q => (q.question_type || 'spectrum') === 'spectrum');
  const sums = { econ: 0, dipl: 0, govt: 0, scty: 0 };
  const max = { econ: 0, dipl: 0, govt: 0, scty: 0 };
  let answeredCount = 0;

  scoredQs.forEach(q => {
    const effects = {
      econ: numericEffect(q, 'effect_econ'),
      dipl: numericEffect(q, 'effect_dipl'),
      govt: numericEffect(q, 'effect_govt'),
      scty: numericEffect(q, 'effect_scty')
    };
    Object.keys(effects).forEach(axis => {
      if (effects[axis] !== 0) max[axis] += 2 * Math.abs(effects[axis]);
    });

    const val = Number(answers[q.code]);
    if (!Number.isFinite(val)) return;
    answeredCount++;
    const delta = clamp(val, 1, 5) - 3;
    sums.econ += delta * effects.econ;
    sums.dipl += delta * effects.dipl;
    sums.govt += delta * effects.govt;
    sums.scty += delta * effects.scty;
  });

  function norm(axis) {
    if (!max[axis]) return 0;
    return clamp(10 * sums[axis] / max[axis], -10, 10);
  }

  const score_econ = norm('econ');
  const score_dipl = norm('dipl');
  const score_govt = norm('govt');
  const score_scty = norm('scty');

  const equality = clamp(50 + 5 * score_econ, 0, 100);
  const market = 100 - equality;
  const world = clamp(50 + 5 * score_dipl, 0, 100);
  const nation = 100 - world;
  const liberty = clamp(50 + 5 * score_govt, 0, 100);
  const authority = 100 - liberty;
  const progressive = clamp(50 + 5 * score_scty, 0, 100);
  const traditional = 100 - progressive;

  const pc_econ = clamp(-score_econ, -10, 10);
  const pc_social = clamp(-score_govt, -10, 10);

  return {
    pc_econ: parseFloat(pc_econ.toFixed(3)),
    pc_social: parseFloat(pc_social.toFixed(3)),
    score_econ: parseFloat(score_econ.toFixed(3)),
    score_dipl: parseFloat(score_dipl.toFixed(3)),
    score_govt: parseFloat(score_govt.toFixed(3)),
    score_scty: parseFloat(score_scty.toFixed(3)),
    equality: parseFloat(equality.toFixed(1)),
    market: parseFloat(market.toFixed(1)),
    progressive: parseFloat(progressive.toFixed(1)),
    traditional: parseFloat(traditional.toFixed(1)),
    nation: parseFloat(nation.toFixed(1)),
    world: parseFloat(world.toFixed(1)),
    authority: parseFloat(authority.toFixed(1)),
    liberty: parseFloat(liberty.toFixed(1)),
    quadrant: classifyQuadrant(pc_econ, pc_social),
    answered: answeredCount,
    total: scoredQs.length,
    raw_sums: sums,
    theoretical_max: max
  };
}

/**
 * Extract ideology mentions from a text. Used in affinity scores.
 */
function extractIdeologyMentions(text, ideologyNames) {
  const normText = normalize(text);
  if (!normText) return [];
  const found = [];
  // Sort by length descending to match longer names first
  const sorted = ideologyNames.slice().sort((a, b) => b.length - a.length);
  sorted.forEach(name => {
    const normName = normalize(name);
    if (normName.length < 4) return;
    const regex = new RegExp(`(?<![a-z0-9])${normName}(?![a-z0-9])`);
    if (regex.test(normText) && !found.includes(name)) {
      found.push(name);
    }
  });
  return found;
}

/**
 * Calculate affinity scores from filter and key questions.
 */
function calculateAffinityScores(questions, answers, ideologies) {
  const names = ideologies.map(i => i.name);
  const affinity = {};
  const relevantTypes = new Set(['filter','tiebreaker','key']);
  questions.forEach(q => {
    if (!relevantTypes.has(q.question_type) || !answers[q.code]) return;
    const raw = SCORE_MAP[answers[q.code]] ?? 0;
    if (raw === 0) return;
    const delta = raw / 2.0;
    let targetText = q.helps || '';
    if (q.question_type === 'key' && targetText.includes('|')) {
      targetText = targetText.split('|')[0];
    }
    const mentions = extractIdeologyMentions(targetText, names);
    mentions.forEach(name => {
      affinity[name] = (affinity[name] || 0) + delta;
    });
  });
  return affinity;
}

/**
 * Compute ideological distance between a user and an ideology.
 */
function calculateIdeologyDistance(user, ideology) {
  const uv = {
    pc_econ: user.pc_econ / 10.0,
    pc_social: user.pc_social / 10.0,
    equality: user.equality / 100.0,
    progressive: user.progressive / 100.0,
    nation: user.nation / 100.0,
    authority: user.authority / 100.0
  };
  const iv = {
    pc_econ: ideology.pc_econ_typical / 10.0,
    pc_social: ideology.pc_social_typical / 10.0,
    equality: ideology.equality / 100.0,
    progressive: ideology.progressive / 100.0,
    nation: ideology.nation / 100.0,
    authority: ideology.authority / 100.0
  };
  let total = 0;
  for (const key in DISTANCE_WEIGHTS) {
    const w = DISTANCE_WEIGHTS[key];
    const diff = uv[key] - iv[key];
    total += w * diff * diff;
  }
  return Math.sqrt(total);
}

/**
 * Convert a weighted distance into a stricter percentage-like similarity.
 * The previous linear conversion made many ideologies look 80-95% compatible even
 * when the match was weak. This curve keeps exact/near-exact matches high, but
 * separates moderate and distant profiles more clearly.
 */
const SIMILARITY_DISTANCE_SCALE = 0.55;
function similarityFromDistance(distance) {
  const d = Math.max(0, Number(distance) || 0);
  return 100 / (1 + Math.pow(d / SIMILARITY_DISTANCE_SCALE, 2));
}

/**
 * Soft cap for weakly differentiated user profiles.
 * If the user stays very close to the centre, ideology matches should be shown as
 * tentative instead of being forced into strong 80-95% results. The cap is soft,
 * so the ranking still preserves real distance order and does not create large ties.
 */
function softCapSimilarity(similarity, signal) {
  const s = clamp(Number(signal) || 0, 0, 1);
  let cap;
  if (s < 0.08) cap = 62 + 100 * s;
  else if (s < 0.18) cap = 70 + 85 * s;
  else if (s < 0.30) cap = 82 + 45 * s;
  else cap = 99.5;
  if (similarity <= cap) return similarity;
  return cap + (similarity - cap) * 0.15;
}

function confidenceLabel(signal) {
  const s = clamp(Number(signal) || 0, 0, 1);
  if (s < 0.05) return 'Muito baixa';
  if (s < 0.12) return 'Baixa';
  if (s < 0.25) return 'Moderada';
  return 'Alta';
}

/**
 * Small caution penalty for ideology profiles whose sources are low-confidence or speculative.
 * This does not remove them from the ranking; it only prevents weakly documented profiles from
 * looking as certain as well-documented ones.
 */
function ideologyReliabilityPenalty(ideology) {
  let penalty = 0;
  const conf = normalize(ideology.sources_confidence || '');
  const spec = normalize(ideology.speculative_status || '');
  if (conf.includes('baixa')) penalty -= 3.0;
  else if (conf.includes('media')) penalty -= 1.0;
  if (spec === 'sim' || spec.includes('sim')) penalty -= 2.0;
  else if (spec.includes('parcial')) penalty -= 0.8;
  return penalty;
}

/**
 * Signal strength: how clearly the profile moves away from the centre.
 * Uses both 8values axes and Political Compass coordinates. A low value means
 * the ideology list should be read as weak approximation, not as a strong match.
 */
function ideologicalSignalStrength(user) {
  const axisSignal = (Math.abs(user.equality - 50) + Math.abs(user.progressive - 50) +
                      Math.abs(user.nation - 50) + Math.abs(user.authority - 50)) / 200;
  const pcSignal = (Math.abs(user.pc_econ) + Math.abs(user.pc_social)) / 20;
  return clamp(0.65 * axisSignal + 0.35 * pcSignal, 0, 1);
}

/**
 * Rank ideologies for the user, returning an array sorted by similarity.
 * Ranking is based on weighted distance first. Affinity/key-question bonuses are
 * only secondary and never replace the distance calculation.
 */
function rankIdeologies(user, ideologies, affinityScores = {}) {
  const rows = [];
  const signal = ideologicalSignalStrength(user);
  ideologies.forEach(ide => {
    const distance = calculateIdeologyDistance(user, ide);
    const similarityBase = similarityFromDistance(distance);

    // Optional affinity bonus kept for future key/filter questions, but strongly limited.
    const affinityBonus = clamp((affinityScores[ide.name] || 0) * 1.2, -4, 4);

    // Small interval bonus if the user's PC point is inside the ideology's typical range.
    // It scales with signal so a completely neutral profile is not pushed into arbitrary ideologies.
    let rangeBonus = 0;
    if (ide.pc_econ_min <= user.pc_econ && user.pc_econ <= ide.pc_econ_max) rangeBonus += 1.2;
    if (ide.pc_social_min <= user.pc_social && user.pc_social <= ide.pc_social_max) rangeBonus += 1.2;
    rangeBonus *= signal;

    const reliabilityPenalty = ideologyReliabilityPenalty(ide);
    let adjusted = similarityBase + affinityBonus + rangeBonus;
    adjusted = softCapSimilarity(adjusted, signal);
    adjusted += reliabilityPenalty;
    adjusted = clamp(adjusted, 0, 99.9);

    const pcDistance = Math.hypot((user.pc_econ - ide.pc_econ_typical) / 20,
                                  (user.pc_social - ide.pc_social_typical) / 20);
    const valuesDistance = Math.hypot((user.equality - ide.equality) / 100,
                                      (user.progressive - ide.progressive) / 100,
                                      (user.nation - ide.nation) / 100,
                                      (user.authority - ide.authority) / 100);

    const calcQuadrant = classifyQuadrant(ide.pc_econ_typical, ide.pc_social_typical);
    rows.push({
      ideologia: ide.name,
      categoria: ide.category,
      quadrante: calcQuadrant,
      similaridade: parseFloat(adjusted.toFixed(1)),
      similaridade_base: parseFloat(similarityBase.toFixed(1)),
      pc_econ_tipico: ide.pc_econ_typical,
      pc_social_tipico: ide.pc_social_typical,
      igualdade: ide.equality,
      mercado: ide.market,
      progressista: ide.progressive,
      tradicionalista: ide.traditional,
      nacao: ide.nation,
      mundo: ide.world,
      autoritario: ide.authority,
      libertario: ide.liberty,
      distancia: parseFloat(distance.toFixed(4)),
      distancia_pc: parseFloat(pcDistance.toFixed(4)),
      distancia_valores: parseFloat(valuesDistance.toFixed(4)),
      sinal_usuario: parseFloat(signal.toFixed(4)),
      confianca_resultado: confidenceLabel(signal),
      bonus_afinidade: parseFloat(affinityBonus.toFixed(2)),
      bonus_intervalo: parseFloat(rangeBonus.toFixed(2)),
      penalizacao_fiabilidade: parseFloat(reliabilityPenalty.toFixed(2)),
      confianca_fontes: ide.sources_confidence || '',
      estado_especulativo: ide.speculative_status || '',
      mais_proxima: ide.closest,
      pergunta_chave: ide.key_question,
      descricao: ide.description
    });
  });

  // Sort by final similarity, then by real distance. This prevents ties from being decided by JSON order.
  rows.sort((a, b) => {
    if (b.similaridade !== a.similaridade) return b.similaridade - a.similaridade;
    if (a.distancia !== b.distancia) return a.distancia - b.distancia;
    if (a.distancia_pc !== b.distancia_pc) return a.distancia_pc - b.distancia_pc;
    return a.ideologia.localeCompare(b.ideologia, 'pt');
  });
  rows.forEach((r, i) => { r.posicao = i + 1; });
  return rows;
}

/**
 * Provide descriptive labels for each axis based on percentages. Mirrors
 * the label functions from Python (label_economico, label_diplomatico,
 * label_civil, label_social).
 */
function labelEconomico(eq) {
  const market = 100 - eq;
  if (eq >= 90) return 'Comunista / Coletivista extremo';
  if (eq >= 75) return 'Socialista';
  if (eq >= 60) return 'Social-democrata / Igualitário';
  if (market >= 90) return 'Capitalista laissez-faire';
  if (market >= 75) return 'Capitalista / Pró-mercado';
  if (market >= 60) return 'Liberal económico';
  return 'Economia mista / Moderado';
}

function labelDiplomatico(world, nation) {
  // Input: world pct, nation pct
  if (nation >= 90) return 'Ultranacionalista / Autárquico';
  if (nation >= 75) return 'Nacionalista';
  if (nation >= 60) return 'Soberanista';
  if (world >= 90) return 'Globalista / Cosmopolita';
  if (world >= 75) return 'Internacionalista';
  if (world >= 60) return 'Cooperativo / Internacionalista moderado';
  return 'Equilibrado';
}

function labelCivil(liberty, authority) {
  if (authority >= 90) return 'Totalitário';
  if (authority >= 75) return 'Autoritário';
  if (authority >= 60) return 'Parcialmente autoritário';
  if (liberty >= 90) return 'Anarquista / Ultra-libertário';
  if (liberty >= 75) return 'Libertário';
  if (liberty >= 60) return 'Democrático';
  return 'Moderado';
}

function labelSocial(progressive, traditional) {
  if (traditional >= 90) return 'Reacionário / Ultra-tradicionalista';
  if (traditional >= 75) return 'Tradicionalista';
  if (traditional >= 60) return 'Conservador';
  if (progressive >= 90) return 'Ultra-progressista / Revolucionário cultural';
  if (progressive >= 75) return 'Progressista';
  if (progressive >= 60) return 'Reformista / Socialmente liberal';
  return 'Moderado';
}

/**
 * Generate a human-readable explanation summarising the result and top ideologies.
 */
function generateExplanation(user, ranking) {
  if (!ranking.length) return 'Sem dados suficientes para gerar uma explicação.';
  const top1 = ranking[0];
  const alt = ranking[1];
  const signal = ideologicalSignalStrength(user);
  const econ = describePole(user.market, 'Mercado', 'Igualdade');
  const auth = describePole(user.authority, 'Autoridade', 'Liberdade');
  const nation = describePole(user.nation, 'Nação', 'Mundo');
  const trad = describePole(user.traditional, 'Tradicionalismo', 'Progressismo');
  const parts = [];
  if (signal < 0.05) {
    parts.push('As tuas respostas ficaram muito próximas do centro em quase todos os eixos; por isso, as ideologias abaixo são aproximações fracas e não um resultado forte.');
  } else if (signal < 0.12) {
    parts.push('O teu perfil tem baixa diferenciação ideológica; lê o top de ideologias como proximidades moderadas, não como identificação exata.');
  }
  parts.push(`A ideologia mais próxima foi ${top1.ideologia} (${top1.categoria}), com afinidade aproximada de ${Math.round(top1.similaridade)}%.`);
  parts.push(`No eixo económico mostras ${econ}; no eixo de autoridade, ${auth}.`);
  parts.push(`Em Nação vs Mundo há ${nation}, e em Progressismo vs Tradicionalismo, ${trad}.`);
  parts.push(`No Political Compass ficaste em (${user.pc_econ.toFixed(1)}, ${user.pc_social.toFixed(1)}), quadrante ${user.quadrant}; ${top1.ideologia} situa-se tipicamente em (${top1.pc_econ_tipico.toFixed(1)}, ${top1.pc_social_tipico.toFixed(1)}).`);
  if (top1.bonus_afinidade) {
    parts.push(`As perguntas-chave/filtros ajustaram a afinidade com ${top1.ideologia} em ${top1.bonus_afinidade.toFixed(1)} pontos.`);
  }
  if (top1.penalizacao_fiabilidade && top1.penalizacao_fiabilidade < 0) {
    parts.push(`Atenção: a ficha de ${top1.ideologia} tem fiabilidade documental ${top1.confianca_fontes || 'não indicada'}${top1.estado_especulativo ? ' e estado especulativo ' + top1.estado_especulativo : ''}; lê esta afinidade com cautela.`);
  }
  if (alt) {
    parts.push(`A alternativa seguinte é ${alt.ideologia} (${Math.round(alt.similaridade)}%).`);
  }
  if (top1.mais_proxima) {
    parts.push(`A tabela indica ${top1.mais_proxima} como ideologia comparável.`);
  }
  parts.push('Nota: as ideologias são perfis comparativos aproximados; os eixos calculados são a parte mais importante do resultado.');
  return parts.join(' ');
}

function describePole(pct, high, low) {
  if (pct >= 65) return `forte orientação para ${high}`;
  if (pct >= 55) return `ligeira orientação para ${high}`;
  if (pct <= 35) return `forte orientação para ${low}`;
  if (pct <= 45) return `ligeira orientação para ${low}`;
  return `equilíbrio entre ${high} e ${low}`;
}

// Export functions globally
window.ideologyUtils = {
  loadData,
  calculateUserResult,
  calculateAffinityScores,
  rankIdeologies,
  calculateIdeologyDistance,
  similarityFromDistance,
  ideologicalSignalStrength,
  ideologyReliabilityPenalty,
  generateExplanation,
  labelEconomico,
  labelDiplomatico,
  labelCivil,
  labelSocial
};