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
  pc_econ: 1.4,
  pc_social: 1.4,
  equality: 1.0,
  progressive: 1.0,
  nation: 1.0,
  authority: 1.2
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