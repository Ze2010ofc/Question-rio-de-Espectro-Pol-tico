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
  // If embedded data variables exist (in file:// context), use them.
  if (typeof IDEOLOGIES_DATA !== 'undefined' && typeof QUESTIONS_DATA !== 'undefined') {
    // Use data defined in ideologies_data.js and questions_data.js when loaded via file://.
    DATA.ideologies = IDEOLOGIES_DATA;
    DATA.questions = QUESTIONS_DATA;
    DATA.loaded = true;
    return;
  }
  // Backwards compatibility: if older embed variables exist, use them.
  if (typeof IDEOLOGIES !== 'undefined' && typeof QUESTIONS !== 'undefined') {
    DATA.ideologies = IDEOLOGIES;
    DATA.questions = QUESTIONS;
    DATA.loaded = true;
    return;
  }
  // Fallback: attempt to fetch from separate JSON files (works on HTTP domains)
  const [ideResp, qResp] = await Promise.all([
    fetch('ideologies.json'),
    fetch('questions.json')
  ]);
  DATA.ideologies = await ideResp.json();
  DATA.questions = await qResp.json();
  DATA.loaded = true;
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

/* Axis keywords and opposites mirroring Python constants */
const AXIS_OPPOSITE = {
  igualdade: 'mercado',
  mercado: 'igualdade',
  progressista: 'tradicional',
  tradicional: 'progressista',
  nacao: 'mundo',
  mundo: 'nacao',
  autoridade: 'liberdade',
  liberdade: 'autoridade'
};

const AXIS_KEYWORDS = {
  igualdade: ['igualdade','socializacao','redistribuicao','estado social','anti-rentista','antirentista'],
  mercado: ['mercado','propriedade privada','capitalismo','empreendedorismo','livre mercado'],
  progressista: ['progressismo','progressista','secularismo','tecnologico','modernizacao','mudancas culturais'],
  tradicional: ['tradicao','tradicional','religiao','moral','familia','hierarquia cultural'],
  nacao: ['nacao','soberania','nacional','patriotismo','autarquia','fronteiras'],
  mundo: ['mundo','internacionalismo','global','cooperacao global','direitos humanos universais'],
  autoridade: ['autoridade','autoritario','estado forte','partido unico','censura','policia','ordem'],
  liberdade: ['liberdade','libertario','anti-autoridade','antiautoridade','pluralismo','direitos individuais','autonomia']
};

const SPECIAL_AXIS_RULES = {
  georgismo: ['igualdade'],
  corporativismo: ['autoridade','tradicional'],
  'ecologia anti-industrial': ['tradicional','liberdade'],
  'metodo revolucionario': ['autoridade'],
  'anti-parlamentarismo': ['autoridade'],
  localismo: ['liberdade'],
  'centro cultural': ['progressista','liberdade'],
  'anti-modernidade': ['tradicional'],
  restauracionismo: ['tradicional','autoridade']
};

const SCORE_MAP = {1: -2, 2: -1, 3: 0, 4: 1, 5: 2};

const DISTANCE_WEIGHTS = {
  pc_econ: 1.4,
  pc_social: 1.4,
  equality: 1.0,
  progressive: 1.0,
  nation: 1.0,
  authority: 1.2
};

/**
 * Detect which axes a question relates to based on its axis_filter text.
 * Uses keyword matching and special rules from the original Python code.
 */
function detectAxes(axisFilter) {
  const norm = normalize(axisFilter);
  if (!norm) return [];
  const found = [];
  // Special rules first
  for (const [key, axes] of Object.entries(SPECIAL_AXIS_RULES)) {
    if (norm.includes(key)) {
      axes.forEach(ax => { if (!found.includes(ax)) found.push(ax); });
    }
  }
  // General keywords
  for (const [axis, keywords] of Object.entries(AXIS_KEYWORDS)) {
    for (const kw of keywords) {
      if (norm.includes(normalize(kw))) {
        if (!found.includes(axis)) found.push(axis);
        break;
      }
    }
  }
  return found;
}

/**
 * Apply raw score to axis scores object.
 */
function applyAxisScore(scores, axis, raw, weight = 1.0) {
  const opp = AXIS_OPPOSITE[axis];
  if (raw > 0) {
    scores[axis] = (scores[axis] || 0) + raw * weight;
  } else if (raw < 0) {
    scores[opp] = (scores[opp] || 0) + Math.abs(raw) * weight;
  }
}

/**
 * Calculate safe percentage distribution for two opposing axes.
 */
function safePercentage(a, b) {
  const total = a + b;
  if (Math.abs(total) < 1e-9) return [50, 50];
  const pa = (a / total) * 100;
  return [pa, 100 - pa];
}

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
function calculateUserResult(questions, answers) {
  const scores = {
    igualdade: 0,
    mercado: 0,
    progressista: 0,
    tradicional: 0,
    nacao: 0,
    mundo: 0,
    autoridade: 0,
    liberdade: 0
  };
  const spectrumQs = questions.filter(q => q.question_type === 'spectrum');
  let answeredCount = 0;
  spectrumQs.forEach(q => {
    const val = answers[q.code];
    if (!val) return;
    answeredCount++;
    const raw = SCORE_MAP[val] ?? 0;
    const axes = detectAxes(q.axis_filter);
    if (!axes.length) return;
    const weight = 1 / axes.length;
    axes.forEach(axis => {
      applyAxisScore(scores, axis, raw, weight);
    });
  });
  const [eqPct, marketPct] = safePercentage(scores.igualdade, scores.mercado);
  const [progPct, tradPct] = safePercentage(scores.progressista, scores.tradicional);
  const [nationPct, worldPct] = safePercentage(scores.nacao, scores.mundo);
  const [authPct, libertPct] = safePercentage(scores.autoridade, scores.liberdade);
  const pc_econ = (marketPct - eqPct) / 10;
  const pc_social = (authPct - libertPct) / 10;
  return {
    pc_econ: parseFloat(pc_econ.toFixed(3)),
    pc_social: parseFloat(pc_social.toFixed(3)),
    equality: parseFloat(eqPct.toFixed(1)),
    market: parseFloat(marketPct.toFixed(1)),
    progressive: parseFloat(progPct.toFixed(1)),
    traditional: parseFloat(tradPct.toFixed(1)),
    nation: parseFloat(nationPct.toFixed(1)),
    world: parseFloat(worldPct.toFixed(1)),
    authority: parseFloat(authPct.toFixed(1)),
    liberty: parseFloat(libertPct.toFixed(1)),
    quadrant: classifyQuadrant(pc_econ, pc_social),
    answered: answeredCount,
    total: spectrumQs.length
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
    let targetText = q.helps;
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

/* Precompute maximum possible distance (used for similarity). */
function maxPossibleDistance() {
  let total = 0;
  for (const [key, w] of Object.entries(DISTANCE_WEIGHTS)) {
    const maxDiff = (key === 'pc_econ' || key === 'pc_social') ? 2.0 : 1.0;
    total += w * maxDiff * maxDiff;
  }
  return Math.sqrt(total);
}
const MAX_DISTANCE = maxPossibleDistance();

/**
 * Signal strength: how polarized the user is across four 8values axes.
 */
function ideologicalSignalStrength(user) {
  const signal = (Math.abs(user.equality - 50) + Math.abs(user.progressive - 50) +
                  Math.abs(user.nation - 50) + Math.abs(user.authority - 50)) / 200;
  return Math.min(1, Math.max(0, signal));
}

/**
 * Rank ideologies for the user, returning an array sorted by similarity.
 */
function rankIdeologies(user, ideologies, affinityScores) {
  const rows = [];
  const signal = ideologicalSignalStrength(user);
  ideologies.forEach(ide => {
    const distance = calculateIdeologyDistance(user, ide);
    const similarity = Math.max(0, 100 * (1 - distance / MAX_DISTANCE));
    const affinityBonus = (affinityScores[ide.name] || 0) * 3.0;
    let rangeBonus = 0;
    if (ide.pc_econ_min <= user.pc_econ && user.pc_econ <= ide.pc_econ_max) rangeBonus += 2.0;
    if (ide.pc_social_min <= user.pc_social && user.pc_social <= ide.pc_social_max) rangeBonus += 2.0;
    rangeBonus *= signal;
    let adjusted = similarity + affinityBonus + rangeBonus;
    // Cap similarity based on signal
    if (signal < 0.05) {
      adjusted = Math.min(adjusted, 80);
    } else if (signal < 0.15) {
      adjusted = Math.min(adjusted, 90);
    } else {
      adjusted = Math.min(adjusted, 99.9);
    }
    adjusted = Math.max(0, adjusted);
    const calcQuadrant = classifyQuadrant(ide.pc_econ_typical, ide.pc_social_typical);
    rows.push({
      ideologia: ide.name,
      categoria: ide.category,
      quadrante: calcQuadrant,
      similaridade: parseFloat(adjusted.toFixed(1)),
      similaridade_base: parseFloat(similarity.toFixed(1)),
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
      bonus_afinidade: parseFloat(affinityBonus.toFixed(2)),
      bonus_intervalo: parseFloat(rangeBonus.toFixed(2)),
      mais_proxima: ide.closest,
      pergunta_chave: ide.key_question,
      descricao: ide.description
    });
  });
  rows.sort((a, b) => b.similaridade - a.similaridade);
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
  const econ = describePole(user.market, 'Mercado', 'Igualdade');
  const auth = describePole(user.authority, 'Autoridade', 'Liberdade');
  const nation = describePole(user.nation, 'Nação', 'Mundo');
  const trad = describePole(user.traditional, 'Tradicionalismo', 'Progressismo');
  const parts = [];
  parts.push(`A ideologia mais próxima foi ${top1.ideologia} (${top1.categoria}), com semelhança de ${Math.round(top1.similaridade)}%.`);
  parts.push(`No eixo económico mostras ${econ}; no eixo de autoridade, ${auth}.`);
  parts.push(`Em Nação vs Mundo há ${nation}, e em Progressismo vs Tradicionalismo, ${trad}.`);
  parts.push(`No Political Compass ficaste em (${user.pc_econ.toFixed(1)}, ${user.pc_social.toFixed(1)}), quadrante ${user.quadrant}; ${top1.ideologia} situa-se tipicamente em (${top1.pc_econ_tipico.toFixed(1)}, ${top1.pc_social_tipico.toFixed(1)}).`);
  if (top1.bonus_afinidade) {
    parts.push(`As perguntas diferenciadoras integradas ajustaram a afinidade com ${top1.ideologia} em ${top1.bonus_afinidade.toFixed(1)} pontos.`);
  }
  if (alt) {
    parts.push(`A alternativa seguinte é ${alt.ideologia} (${Math.round(alt.similaridade)}%).`);
  }
  if (top1.mais_proxima) {
    parts.push(`A tabela indica ${top1.mais_proxima} como ideologia comparável.`);
  }
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
  generateExplanation,
  labelEconomico,
  labelDiplomatico,
  labelCivil,
  labelSocial
};