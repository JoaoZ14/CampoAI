/** m² em 1 hectare */
const M2_PER_HA = 10_000;
/** Alqueire geográfico (48.400 m²) — comum em MG, GO, etc. (varia por estado.) */
const ALQ_GEO_M2 = 48_400;

/**
 * @param {string} s
 */
function num(s) {
  return Number(String(s).replace(',', '.').trim());
}

/**
 * @param {string[]} parts from index 1 onward
 */
function nums(parts) {
  return parts.map((p) => num(p)).filter((n) => Number.isFinite(n));
}

function fmt(n, dec = 4) {
  if (!Number.isFinite(n)) return '—';
  const f = 10 ** dec;
  const r = Math.round(n * f) / f;
  return String(r).replace(/\.?0+$/, (m) => (m === '.' ? '' : m));
}

const MSG_INTRO =
  'Calculadora do campo (números exatos). Não serve para dosagem de defensivo, medicamento nem receita de produto — isso é com agrônomo, receita da bula ou técnico.\n\n' +
  'Use uma linha começando com calc ou calculo. Números com ponto ou vírgula.\n\n' +
  'calc ajuda — lista completa de comandos';

function helpFull() {
  return (
    `${MSG_INTRO}\n\n` +
    'Área e medida\n' +
    '• calc m2-ha METROS_QUADRADOS — m² → hectare\n' +
    '• calc ha-m2 HECTARES — ha → m²\n' +
    '• calc area-ret COMPR_M LARG_M — retângulo: m² e ha\n\n' +
    'Lavoura\n' +
    '• calc plantas ENTRE_LINHAS_M ESPACO_NA_LINHA_M — plantas/ha (semeadura em linha reta)\n' +
    '• calc semente-kg KG_POR_HA HECTARES — kg total de semente\n' +
    '• calc semente-sac KG_POR_HA HECTARES KG_POR_SACO — sacas (arredonda pra cima)\n\n' +
    'Água / tanque\n' +
    '• calc volume-ret COMPR_M LARG_M ALT_M — tanque retangular em m³ e litros\n' +
    '• calc litros-m3 METROS_CUBICOS — m³ → litros\n' +
    '• calc m3-litros LITROS — litros → m³\n' +
    '• calc vazao-lh LITROS_POR_MIN — L/min → m³/h\n' +
    '• calc encher LITROS_TOTAL LITROS_POR_MIN — tempo pra encher (minutos)\n\n' +
    'Pastagem (bem simplificado: 1 bovino adulto ≈ 1 UA)\n' +
    '• calc lotacao N_ANIMAIS AREA_HA — cabeças/ha e UA/ha\n\n' +
    'Alqueire geográfico (1 alq = 48.400 m² — confira o padrão da sua região)\n' +
    '• calc alq-ha HECTARES — ha → alq\n' +
    '• calc ha-alq N_ALQ — alq → ha\n\n' +
    'Exemplos rápidos\n' +
    '• calc m2-ha 24000\n' +
    '• calc area-ret 100 45\n' +
    '• calc plantas 0,45 0,20\n' +
    '• calc semente-kg 25 12\n' +
    '• calc volume-ret 2 3 1,5'
  );
}

function needMore(sub, n, min) {
  return `${sub}: faltam números. Preciso de pelo menos ${min} valor(es). Ex.: calc ajuda`;
}

const HELP_SUBS = new Set(['ajuda', 'help', '?', 'comandos']);

/**
 * Primeira linha: intenção do comando calc (ajuda/intro ficam no texto fixo; contas vão para a IA).
 * @param {string} raw
 * @returns {'none' | 'help_or_intro' | 'compute'}
 */
export function fieldCalcIntent(raw) {
  const line = String(raw ?? '')
    .trim()
    .split('\n')[0]
    .trim();
  if (!/^(calc|calculo)\b/i.test(line)) return 'none';
  const after = line.replace(/^(calc|calculo)\s*/i, '').trim();
  if (!after) return 'help_or_intro';
  const parts = after.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'help_or_intro';
  const sub = parts[0].toLowerCase().replace(/_/g, '-');
  if (HELP_SUBS.has(sub)) return 'help_or_intro';
  return 'compute';
}

/**
 * Resposta determinística ou null se a mensagem não for comando calc.
 * @param {string} raw
 * @returns {string | null}
 */
export function tryResolveFieldCalcMessage(raw) {
  const line = String(raw ?? '')
    .trim()
    .split('\n')[0]
    .trim();
  if (/^(calc|calculo)$/i.test(line)) return MSG_INTRO;
  const m = line.match(/^(calc|calculo)\s+(.+)$/i);
  if (!m) return null;

  const rest = m[2].trim();
  const parts = rest.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return MSG_INTRO;

  const sub = parts[0].toLowerCase().replace(/_/g, '-');
  const n = nums(parts.slice(1));

  if (HELP_SUBS.has(sub)) {
    return helpFull();
  }

  const pos = (v, label) => {
    if (!Number.isFinite(v) || v < 0) return `${label}: use um número ≥ 0.`;
    return null;
  };

  switch (sub) {
    case 'm2-ha': {
      if (n.length < 1) return needMore(sub, n, 1);
      const err = pos(n[0], 'm²');
      if (err) return err;
      const ha = n[0] / M2_PER_HA;
      const alq = n[0] / ALQ_GEO_M2;
      return `ha=m²/10.000; alq_geo=m²/${ALQ_GEO_M2}\n→ ${fmt(ha, 6)} ha; ${fmt(alq, 4)} alq`;
    }
    case 'ha-m2': {
      if (n.length < 1) return needMore(sub, n, 1);
      const err = pos(n[0], 'ha');
      if (err) return err;
      const m2 = n[0] * M2_PER_HA;
      return `m²=ha×10.000\n→ ${fmt(m2, 2)} m²`;
    }
    case 'area-ret': {
      if (n.length < 2) return needMore(sub, n, 2);
      const e1 = pos(n[0], 'comprimento');
      const e2 = pos(n[1], 'largura');
      if (e1) return e1;
      if (e2) return e2;
      const m2 = n[0] * n[1];
      const ha = m2 / M2_PER_HA;
      return `m²=C×L; ha=m²/10.000\n→ ${fmt(m2, 2)} m²; ${fmt(ha, 6)} ha`;
    }
    case 'plantas': {
      if (n.length < 2) return needMore(sub, n, 2);
      const e1 = pos(n[0], 'entrelinhas');
      const e2 = pos(n[1], 'espaço na linha');
      if (e1) return e1;
      if (e2) return e2;
      if (n[0] === 0 || n[1] === 0) return 'Espaçamentos precisam ser maiores que zero.';
      const perHa = M2_PER_HA / (n[0] * n[1]);
      return `plantas/ha=10.000/(entre×linha)\n→ ${fmt(perHa, 0)} plantas/ha`;
    }
    case 'semente-kg': {
      if (n.length < 2) return needMore(sub, n, 2);
      const e1 = pos(n[0], 'kg/ha');
      const e2 = pos(n[1], 'hectares');
      if (e1) return e1;
      if (e2) return e2;
      const kg = n[0] * n[1];
      return `kg=(kg/ha)×ha\n→ ${fmt(kg, 3)} kg`;
    }
    case 'semente-sac': {
      if (n.length < 3) return needMore(sub, n, 3);
      const e1 = pos(n[0], 'kg/ha');
      const e2 = pos(n[1], 'hectares');
      const e3 = pos(n[2], 'kg/saco');
      if (e1) return e1;
      if (e2) return e2;
      if (e3) return e3;
      if (n[2] === 0) return 'kg por saco precisa ser maior que zero.';
      const kg = n[0] * n[1];
      const sacs = Math.ceil(kg / n[2]);
      return `kg=(kg/ha)×ha; sacos=⌈kg/kg_saco⌉\n→ ${fmt(kg, 3)} kg; ${sacs} saco(s)`;
    }
    case 'volume-ret': {
      if (n.length < 3) return needMore(sub, n, 3);
      for (let i = 0; i < 3; i += 1) {
        const e = pos(n[i], `dimensão ${i + 1}`);
        if (e) return e;
      }
      const m3 = n[0] * n[1] * n[2];
      const L = m3 * 1000;
      return `m³=C×L×A; L=m³×1000\n→ ${fmt(m3, 4)} m³; ${fmt(L, 1)} L`;
    }
    case 'litros-m3': {
      if (n.length < 1) return needMore(sub, n, 1);
      const err = pos(n[0], 'm³');
      if (err) return err;
      const L = n[0] * 1000;
      return `L=m³×1000\n→ ${fmt(L, 2)} L`;
    }
    case 'm3-litros': {
      if (n.length < 1) return needMore(sub, n, 1);
      const err = pos(n[0], 'litros');
      if (err) return err;
      const m3 = n[0] / 1000;
      return `m³=L/1000\n→ ${fmt(m3, 6)} m³`;
    }
    case 'vazao-lh': {
      if (n.length < 1) return needMore(sub, n, 1);
      const err = pos(n[0], 'L/min');
      if (err) return err;
      if (n[0] === 0) return 'Vazão precisa ser maior que zero.';
      const m3h = (n[0] * 60) / 1000;
      return `m³/h=(L/min)×60/1000\n→ ${fmt(m3h, 4)} m³/h`;
    }
    case 'encher': {
      if (n.length < 2) return needMore(sub, n, 2);
      const e1 = pos(n[0], 'volume total');
      const e2 = pos(n[1], 'vazão');
      if (e1) return e1;
      if (e2) return e2;
      if (n[1] === 0) return 'Vazão precisa ser maior que zero.';
      const min = n[0] / n[1];
      return `min=L÷(L/min)\n→ ${fmt(min, 2)} min (${fmt(min / 60, 2)} h)`;
    }
    case 'lotacao': {
      if (n.length < 2) return needMore(sub, n, 2);
      const e1 = pos(n[0], 'nº de animais');
      const e2 = pos(n[1], 'hectares');
      if (e1) return e1;
      if (e2) return e2;
      if (n[0] <= 0) return 'Indique o número de animais (maior que zero).';
      if (n[1] === 0) return 'Área precisa ser maior que zero.';
      const cabHa = n[0] / n[1];
      return `cabeças/ha=N÷A (1 bov.≈1 UA)\n→ ${fmt(cabHa, 3)} cab/ha`;
    }
    case 'alq-ha': {
      if (n.length < 1) return needMore(sub, n, 1);
      const err = pos(n[0], 'ha');
      if (err) return err;
      const alq = (n[0] * M2_PER_HA) / ALQ_GEO_M2;
      return `alq=ha×10.000/${ALQ_GEO_M2}\n→ ${fmt(alq, 4)} alq`;
    }
    case 'ha-alq': {
      if (n.length < 1) return needMore(sub, n, 1);
      const err = pos(n[0], 'alqueires');
      if (err) return err;
      const ha = (n[0] * ALQ_GEO_M2) / M2_PER_HA;
      return `ha=alq×${ALQ_GEO_M2}/10.000\n→ ${fmt(ha, 6)} ha`;
    }
    default:
      return (
        `Não reconheci o comando "${parts[0]}".\n\n` +
        `Envie calc ajuda para ver a lista completa.\n\n` +
        MSG_INTRO
      );
  }
}
