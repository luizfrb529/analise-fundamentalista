"use strict";
/* =====================================================================
   CONFIGURAÇÃO (edite aqui)
   ===================================================================== */
const CONFIG = {
  // true = pede senha antes de mostrar o conteúdo. Proteção simples (site estático): não use para dado sigiloso.
  MODO_PRIVADO: false,
  // SHA-256 da senha (padrão: trocar-senha). Para gerar: python -c "import hashlib;print(hashlib.sha256(b'SUA_SENHA').hexdigest())"
  SENHA_SHA256: "7602b08c32dd3c35d59593cc17cbd28dd80aa1da77558496207d0c69ded5dc36",

  // pesos do score composto (somam 1)
  PESOS: { valuation: 0.30, qualidade: 0.25, solidez: 0.20, crescimento: 0.15, proventos: 0.10 },

  COLUNAS_PADRAO: ["ticker", "nome", "setor_micro", "porte", "preco", "var_dia", "pl", "pvp", "ev_ebitda", "dy", "roe", "roic",
    "margem_liquida", "divliq_ebitda", "cagr_lucro_5a", "tir_implicita", "score", "novidades"],

  NOVO_HORAS: 48,

  OPORTUNIDADES: {
    tir_acima_mediana: { ativo: true, divliq_ebitda_max: 2.5 },
    qualidade_descontada: { ativo: true, qualidade_min: 55, desconto_min: 0.0 },
    implicito_abaixo_historico: { ativo: true, folga: 0.0 },
    bdr_desagio: { ativo: true, desagio_min: 0.03 },
    queda_sem_deterioracao: { ativo: true, queda_12m: -0.20 },
  },
  RISCOS: {
    divliq_ebitda_max: 3, cobertura_juros_min: 2, fcl_negativo_anos: 2, payout_max: 1, diluicao_3a_max: 0.10,
    armadilha_pl_max: 8, gap_crescimento_max: 0.05, bdr_agio_max: 0.05, liquidez_min: 5e6,
  },
};

const CENARIOS = {
  selic_caindo: { nome: "Selic caindo", ganha: "os juros caem", perde: "os juros caem" },
  dolar_subindo: { nome: "Dólar subindo", ganha: "o dólar sobe", perde: "o dólar sobe" },
  commodities_subindo: { nome: "Commodities subindo", ganha: "as commodities sobem", perde: "as commodities sobem" },
  pib_acelerando: { nome: "PIB acelerando", ganha: "a economia acelera", perde: "a economia acelera" },
  inflacao_subindo: { nome: "Inflação subindo", ganha: "a inflação sobe", perde: "a inflação sobe" },
  risco_fiscal_subindo: { nome: "Risco fiscal subindo", ganha: "o risco fiscal aumenta", perde: "o risco fiscal aumenta" },
};
const SEGMENTOS = { TUDO: "Tudo", ACAO_BR: "Ações Brasil", BDR_EXPOSICAO_BR: "BDR com risco Brasil", BDR_EXTERIOR: "Ações americanas (BDR exterior)" };
const TIPO_CURTO = { ACAO_BR: "Ação Brasil", BDR_EXPOSICAO_BR: "BDR risco Brasil", BDR_EXTERIOR: "BDR exterior" };
const FATOR_NOME = { valuation: "Valuation e TIR", qualidade: "Qualidade", solidez: "Solidez", crescimento: "Crescimento", proventos: "Proventos" };
const NAO_FIN = new Set(["divida_bruta", "divida_liquida", "ev", "p_ebitda", "p_ebit", "psr", "p_capital_giro", "p_acl", "ev_ebitda", "ev_ebit",
  "ev_receita", "earnings_yield", "fcf_yield", "divliq_pl", "divliq_ebitda", "divliq_ebit", "liquidez_corrente", "liquidez_seca",
  "liquidez_imediata", "cobertura_juros", "divida_cp_pct", "margem_bruta", "margem_ebitda", "margem_ebit", "giro_ativo", "pmr", "pme",
  "pmp", "ciclo_financeiro", "roic", "roic_spread", "fco", "capex", "fcl", "ebitda", "capex_depreciacao", "conversao_caixa",
  "dividendos_sobre_fcl", "tir_caixa", "tir_dcf", "evebitda_vs_media5", "cagr_ebitda_5a", "cagr_ebitda_10a"]);
const ROT_CURTO = {
  ticker: "Ticker", nome: "Nome", setor_micro: "Setor micro", setor_macro: "Setor macro", porte: "Porte", preco: "Preço", var_dia: "Dia",
  var_mes: "Mês", var_ano: "Ano", var_12m: "12m", var_5a: "5a", score: "Score", novidades: "Novidades", tipo: "Tipo",
  valor_mercado_brl: "Valor de mercado (R$)", tir_implicita: "TIR implícita", divliq_ebitda: "Dív.líq/EBITDA", margem_liquida: "Marg. líq.",
  cagr_lucro_5a: "CAGR lucro 5a", ev_ebitda: "EV/EBITDA", dy: "DY", pl: "P/L", pvp: "P/VP", roe: "ROE", roic: "ROIC",
};
const EXTRA_META = {
  ticker: { nome: "Ticker", unidade: "txt" }, nome: { nome: "Nome", unidade: "txt" }, setor_micro: { nome: "Setor micro", unidade: "txt" },
  setor_macro: { nome: "Setor macro", unidade: "txt" }, porte: { nome: "Porte", unidade: "txt" }, tipo: { nome: "Tipo", unidade: "txt" },
  var_dia: { nome: "Variação no dia", unidade: "pct", direcao: 1 }, var_mes: { nome: "Variação no mês (21 pregões)", unidade: "pct", direcao: 1 },
  var_ano: { nome: "Variação no ano", unidade: "pct", direcao: 1 }, var_12m: { nome: "Variação 12 meses", unidade: "pct", direcao: 1 },
  var_5a: { nome: "Variação 5 anos", unidade: "pct", direcao: 1 }, max_52s: { nome: "Máxima 52 semanas", unidade: "moeda_brl" },
  min_52s: { nome: "Mínima 52 semanas", unidade: "moeda_brl" },
  score: { nome: "Score composto (0 a 100)", unidade: "score", direcao: 1, formula: "Z-score de cada fator dentro do grupo de comparação, ponderado pelos pesos do CONFIG e convertido para 0 a 100." },
  novidades: { nome: "Itens novos (48h)", unidade: "int", direcao: 0, formula: "Notícias e comunicados oficiais publicados nas últimas 48 horas." },
  valor_mercado_brl: { nome: "Valor de mercado em R$", unidade: "moeda_grande_brl", direcao: 0, formula: "Valor de mercado convertido para reais (BDR: em dólar x PTAX)." },
};

/* =====================================================================
   ESTADO E UTILITÁRIOS
   ===================================================================== */
const D = {};
let SC = {};
let charts = [];
const EST = { seg: "TUDO", busca: "", sort: { k: "score", d: -1 }, cenario: "", colunas: null, rankEscopo: "setor_macro", rankTipo: "score",
  scrFiltros: [], scr: { seg: "TUDO", macro: "", micro: "", porte: "", tirMin: "", liqMin: "", semDistressed: false, cenario: "", cenMin: 1 } };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ok = (v) => typeof v === "number" && isFinite(v);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } };

const NF = (d) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const nf0 = NF(0), nf1 = NF(1), nf2 = NF(2);

function dataBR(s) {
  if (!s) return "n/d";
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function grande(v) {
  const a = Math.abs(v);
  if (a >= 1e12) return nf2.format(v / 1e12) + " tri";
  if (a >= 1e9) return nf1.format(v / 1e9) + " bi";
  if (a >= 1e6) return nf1.format(v / 1e6) + " mi";
  if (a >= 1e3) return nf1.format(v / 1e3) + " mil";
  return nf0.format(v);
}
function meta(k) { return (D.imeta.indicadores[k]) || EXTRA_META[k] || { nome: k, unidade: "x", direcao: 0, formula: "" }; }
function moedaDe(t) { return (D.fund[t] && D.fund[t].moeda === "USD") ? "US$" : "R$"; }
function fmtU(v, u, moeda = "R$") {
  if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return '<span class="muted">n/d</span>';
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "string") return esc(v);
  switch (u) {
    case "pct": return nf1.format(v * 100) + "%";
    case "pct_int": return nf0.format(v) + "%";
    case "x": return nf2.format(v) + "x";
    case "moeda": return moeda + " " + nf2.format(v);
    case "moeda_brl": return "R$ " + nf2.format(v);
    case "moeda_grande": return moeda + " " + grande(v);
    case "moeda_grande_brl": return "R$ " + grande(v);
    case "dias": return nf0.format(v) + " d";
    case "anos": case "int": return nf0.format(v);
    case "num": return grande(v);
    case "num_btc": return (Math.abs(v) >= 1 ? nf2.format(v) : new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 4 }).format(v)) + " BTC";
    case "score": return nf0.format(v);
    default: return nf2.format(v);
  }
}
function fmt(t, k, v) {
  const m = meta(k);
  if (v === undefined) v = val(t, k);
  return fmtU(v, m.unidade, moedaDe(t));
}
function A(t) { return D.univMap[t]; }
function isFin(t) { return ["BANCO", "SEGURADORA"].includes(A(t).modelo_analise); }
function isDist(t) { return A(t).modelo_analise === "DISTRESSED"; }
function isCripto(t) { return A(t).modelo_analise === "TESOURARIA_CRIPTO"; }
function semValuation(t) { return isDist(t) || isCripto(t); }
function porPapel(t) { return (D.fund[t] && D.fund[t].acoes_por_papel) || A(t).acoes_por_papel || 1; }
function ind(t) { return (D.fund[t] && D.fund[t].ind) || {}; }
function val(t, k) {
  const a = A(t), p = D.prices[t] || {};
  switch (k) {
    case "ticker": return t;
    case "nome": return a.nome;
    case "setor_micro": return a.setor_micro;
    case "setor_macro": return a.setor_macro;
    case "tipo": return TIPO_CURTO[a.tipo];
    case "porte": return ind(t).porte || null;
    case "preco": case "var_dia": case "var_mes": case "var_ano": case "var_12m": case "var_5a": case "max_52s": case "min_52s": return p[k] ?? null;
    case "score": return SC[t] ? SC[t].score : null;
    case "novidades": return (D.newsIdx[t] || {}).novos_48h ?? 0;
    default: {
      const v = ind(t)[k];
      return v === undefined ? null : v;
    }
  }
}
function sinal(v) { return ok(v) ? (v > 0 ? "pos" : v < 0 ? "neg" : "") : ""; }
function varHtml(v) { return ok(v) ? `<span class="${sinal(v)}">${v > 0 ? "+" : ""}${nf2.format(v * 100)}%</span>` : '<span class="muted">n/d</span>'; }
function tip(k) {
  const m = meta(k);
  return m.formula ? `<span class="info" data-tip="${esc(m.nome + ": " + m.formula)}">i</span>` : "";
}
function linkAtivo(t) { return `<a href="#/ativo/${t}">${t}</a>`; }
function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const mediana = (a) => { const v = a.filter(ok).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const media = (a) => { const v = a.filter(ok); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

/* =====================================================================
   CARGA
   ===================================================================== */
async function j(url, opcional) {
  try { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  catch (e) { if (opcional) return opcional; throw new Error(`Falha ao carregar ${url}: ${e.message}`); }
}
async function carregar() {
  const [meta_, macro, prices, fund, univ, imeta, notes, newsIdx, config] = await Promise.all([
    j("data/meta.json"), j("data/macro.json", {}), j("data/prices.json"), j("data/fundamentals.json"), j("data/universe.json"),
    j("data/indicators_meta.json"), j("data/notes.json", {}), j("data/news/_index.json", {}), j("data/config.json", {})]);
  Object.assign(D, { meta: meta_, macro, prices, fund, univ, imeta, notes, newsIdx, config, cache: {} });
  D.univ = univ.filter((a) => fund[a.ticker]);
  D.univMap = Object.fromEntries(univ.map((a) => [a.ticker, a]));
  calcScores();
}
async function historico(t) {
  if (!D.cache["h" + t]) D.cache["h" + t] = await j(`data/history/${t}.json`, { anual: {}, precos: { semanal: [], diario: [] } });
  return D.cache["h" + t];
}
async function noticias(t) {
  if (!D.cache["n" + t]) D.cache["n" + t] = await j(`data/news/${t}.json`, { noticias: [], comunicados: [] });
  return D.cache["n" + t];
}
async function proventos(t) {
  if (!D.cache.div) D.cache.div = await j("data/dividends.json", {});
  return D.cache.div[t] || { lista: [], por_ano: {} };
}

/* =====================================================================
   SCORE COMPOSTO
   ===================================================================== */
function calcScores() {
  SC = {};
  const F = D.imeta.fatores;
  for (const a of D.univ) {
    const t = a.ticker;
    const grp = (D.fund[t].setor && D.fund[t].setor.grupo_membros || [t]).filter((x) => D.fund[x]);
    const fz = {}, det = {};
    for (const [f, chaves] of Object.entries(F)) {
      const zs = [];
      det[f] = {};
      for (const k of chaves) {
        const dir = meta(k).direcao || 0;
        const x = ind(t)[k];
        if (!dir || !ok(x)) continue;
        const pop = grp.map((g) => ind(g)[k]).filter(ok);
        if (pop.length < 2) continue;
        const mu = media(pop);
        const sd = Math.sqrt(media(pop.map((v) => (v - mu) ** 2)));
        if (!(sd > 0)) continue;
        const z = Math.max(-3, Math.min(3, dir * (x - mu) / sd));
        zs.push(z);
        det[f][k] = z;
      }
      fz[f] = zs.length ? media(zs) : null;
    }
    if (semValuation(t) && ok(fz.valuation)) fz.valuation = Math.min(fz.valuation, 0);
    if (semValuation(t) && fz.valuation === null) fz.valuation = 0;
    let s = 0, w = 0;
    for (const [f, p] of Object.entries(CONFIG.PESOS)) if (ok(fz[f])) { s += p * fz[f]; w += p; }
    const comp = w ? s / w : null;
    SC[t] = { score: ok(comp) ? 100 * Phi(comp) : null, fatores: Object.fromEntries(Object.entries(fz).map(([f, z]) => [f, ok(z) ? 100 * Phi(z) : null])),
      z: fz, det, grupo: grp, grupoNome: (D.fund[t].setor || {}).grupo_nome };
  }
}

/* =====================================================================
   CENÁRIOS
   ===================================================================== */
function ganhaPerde(t) {
  const s = A(t).sensibilidade || {};
  const g = [], p = [];
  for (const [c, v] of Object.entries(s)) {
    if (!CENARIOS[c]) continue;
    if (v > 0) g.push((v >= 2 ? "muito quando " : "quando ") + CENARIOS[c].ganha);
    if (v < 0) p.push((v <= -2 ? "muito quando " : "quando ") + CENARIOS[c].perde);
  }
  return { g, p };
}
const nomeCen = (c) => (c === "pib_acelerando" ? CENARIOS[c].nome : CENARIOS[c].nome.charAt(0).toLowerCase() + CENARIOS[c].nome.slice(1));
function concentracao(lista) {
  const n = lista.length;
  if (!n) return [];
  return Object.keys(CENARIOS).map((c) => {
    const dep = lista.filter((t) => (A(t).sensibilidade || {})[c] >= 1).length;
    const contra = lista.filter((t) => (A(t).sensibilidade || {})[c] <= -1).length;
    return { c, pct: dep / n, contra: contra / n };
  }).sort((a, b) => b.pct - a.pct);
}
function concHtml(lista) {
  const c = concentracao(lista);
  if (!c.length) return '<p class="vazio">Selecione ativos.</p>';
  const top = c[0];
  const alerta = top.pct >= (D.config.concentracao_cenario_alerta || 0.6);
  return `<p class="frase">${nf0.format(top.pct * 100)}% da seleção depende de <b>${nomeCen(top.c)}</b>${alerta ? ' <span class="badge alerta">concentração alta</span>' : ""}.</p>
  <div class="barras-score">${c.map((x) => `<div class="linha-score"><span>${CENARIOS[x.c].nome}</span><span class="barra"><i style="width:${x.pct * 100}%"></i></span><span class="num">${nf0.format(x.pct * 100)}%</span></div>`).join("")}</div>
  <p class="sub">Percentual dos ativos com sensibilidade +1 ou +2 ao cenário (matriz em universe.json).</p>`;
}

/* =====================================================================
   REGRAS: OPORTUNIDADES E RISCOS
   ===================================================================== */
function oportunidades(t) {
  const i = ind(t), o = CONFIG.OPORTUNIDADES, st = (D.fund[t].setor || {}).mediana_grupo || {}, out = [];
  if (semValuation(t)) return out;
  if (o.tir_acima_mediana.ativo && ok(i.tir_implicita) && ok(st.tir_implicita) && i.tir_implicita > st.tir_implicita &&
      (isFin(t) || (ok(i.divliq_ebitda) && i.divliq_ebitda < o.tir_acima_mediana.divliq_ebitda_max)))
    out.push({ id: "tir_acima_mediana", txt: `TIR implícita de ${fmt(t, "tir_implicita")} acima da mediana do grupo (${fmtU(st.tir_implicita, "pct")}) com dívida controlada.` });
  const desc = isFin(t) ? i.pvp_vs_media5 : (ok(i.pl_vs_media5) ? i.pl_vs_media5 : i.evebitda_vs_media5);
  const q = SC[t] && SC[t].fatores.qualidade;
  if (o.qualidade_descontada.ativo && ok(q) && q >= o.qualidade_descontada.qualidade_min && ok(desc) && desc < -o.qualidade_descontada.desconto_min)
    out.push({ id: "qualidade_descontada", txt: `Qualidade ${nf0.format(q)}/100 no grupo e múltiplo ${nf0.format(Math.abs(desc) * 100)}% abaixo da própria média de 5 anos.` });
  if (o.implicito_abaixo_historico.ativo && ok(i.cresc_implicito) && ok(i.cresc_historico_ref) && i.cresc_implicito < i.cresc_historico_ref - o.implicito_abaixo_historico.folga)
    out.push({ id: "implicito_abaixo_historico", txt: `Preço embute crescimento de ${fmt(t, "cresc_implicito")} ao ano, abaixo do histórico de 5 anos (${fmt(t, "cresc_historico_ref")}).` });
  if (o.bdr_desagio.ativo && ok(i.bdr_agio) && i.bdr_agio <= -o.bdr_desagio.desagio_min)
    out.push({ id: "bdr_desagio", txt: `BDR com deságio de ${nf1.format(-i.bdr_agio * 100)}% sobre o preço justo (papel no exterior x PTAX / proporção).` });
  const v12 = (D.prices[t] || {}).var_12m, sn = i.sinais || {};
  if (o.queda_sem_deterioracao.ativo && ok(v12) && v12 <= o.queda_sem_deterioracao.queda_12m && !sn.lucro_caindo && !sn.margem_queda_3a && !sn.divida_subindo)
    out.push({ id: "queda_sem_deterioracao", txt: `Preço caiu ${nf0.format(-v12 * 100)}% em 12 meses sem queda de lucro, de margem ou alta de dívida.` });
  return out;
}
const OPP_NOMES = { tir_acima_mediana: "TIR implícita acima da mediana do setor com dívida controlada", qualidade_descontada: "Qualidade acima da mediana e múltiplo abaixo da própria média",
  implicito_abaixo_historico: "Crescimento implícito abaixo do histórico", bdr_desagio: "BDR com deságio relevante", queda_sem_deterioracao: "Queda forte de preço sem deterioração dos fundamentos" };

function riscos(t) {
  const i = ind(t), r = CONFIG.RISCOS, sn = i.sinais || {}, a = A(t), out = [];
  const add = (id, txt, grave) => out.push({ id, txt, grave: !!grave });
  if (!isFin(t)) {
    if (ok(i.divliq_ebitda) && i.divliq_ebitda > r.divliq_ebitda_max) add("alavancagem", `Dívida líquida de ${fmt(t, "divliq_ebitda")} o EBITDA (limite ${r.divliq_ebitda_max}x).`, true);
    if (ok(i.cobertura_juros) && i.cobertura_juros < r.cobertura_juros_min) add("cobertura", `EBIT cobre só ${fmt(t, "cobertura_juros")} as despesas financeiras.`, true);
    if (sn.fcl_negativo_anos >= r.fcl_negativo_anos) add("fcl_negativo", `Fluxo de caixa livre negativo há ${sn.fcl_negativo_anos} exercícios seguidos.`);
  }
  if (ok(i.payout) && i.payout > r.payout_max) add("payout", `Payout de ${fmt(t, "payout")}: distribui mais do que o lucro dos últimos 12 meses.`);
  if (sn.dividendo_sem_caixa || (ok(i.dividendos_sobre_fcl) && i.dividendos_sobre_fcl > 1)) add("div_sem_caixa", "Dividendos pagos acima do fluxo de caixa livre (pagos com caixa acumulado ou dívida).");
  if (ok(i.diluicao_3a) && i.diluicao_3a > r.diluicao_3a_max) add("diluicao", `Número de ações subiu ${fmt(t, "diluicao_3a")} em 3 anos.`, i.diluicao_3a > 0.5);
  if (sn.margem_queda_3a) add("margem", "Margem líquida caindo há 3 exercícios seguidos.");
  if (ok(i.pl) && i.pl < r.armadilha_pl_max && sn.lucro_caindo && sn.divida_subindo) add("armadilha", `Possível armadilha de valor: P/L baixo (${fmt(t, "pl")}) com lucro caindo e dívida subindo.`, true);
  if (ok(i.cresc_gap) && i.cresc_gap > r.gap_crescimento_max) add("cresc_exigido", `O preço exige crescimento de ${fmt(t, "cresc_implicito")} ao ano, acima do que a empresa entregou (${fmt(t, "cresc_historico_ref")}).`);
  if (sn.acao_abaixo_1) add("abaixo_1", "Ação negociada abaixo de R$ 1.", true);
  if (sn.recuperacao_judicial || a.modelo_analise === "DISTRESSED") add("reestruturacao", "Empresa em reestruturação ou recuperação judicial.", true);
  if (ok(i.bdr_agio) && i.bdr_agio > r.bdr_agio_max) add("bdr_agio", `BDR com ágio de ${fmt(t, "bdr_agio")} sobre o preço justo.`);
  const liq = (D.prices[t] || {}).liquidez_21;
  if (ok(liq) && liq < r.liquidez_min) add("liquidez", `Liquidez média de R$ ${grande(liq)} por dia (mínimo ${grande(r.liquidez_min)}).`);
  const s = a.sensibilidade || {}, fortes = Object.entries(s).filter(([, v]) => v >= 2), outros = Object.entries(s).filter(([, v]) => v === 1);
  if (fortes.length === 1 && !outros.length) add("cenario", `Concentração em um único cenário: depende de ${nomeCen(fortes[0][0])}.`);
  if (sn.lucro_caindo && !out.find((x) => x.id === "armadilha")) add("lucro_caindo", "Lucro dos últimos 12 meses abaixo do período anterior e do exercício anterior.");
  return out;
}
const RISCO_NOMES = { alavancagem: "Dív.líq/EBITDA acima de 3x", cobertura: "Cobertura de juros abaixo de 2x", fcl_negativo: "FCL negativo por 2 anos ou mais",
  payout: "Payout acima de 100%", div_sem_caixa: "Dividendo pago sem caixa", diluicao: "Diluição acima de 10% em 3 anos", margem: "Margem caindo 3 anos seguidos",
  armadilha: "Armadilha de valor", cresc_exigido: "Preço exige crescimento acima do histórico", abaixo_1: "Ação abaixo de R$ 1", reestruturacao: "Em reestruturação",
  bdr_agio: "BDR com ágio relevante", liquidez: "Baixa liquidez", cenario: "Concentração em um cenário macro", lucro_caindo: "Lucro caindo" };

/* =====================================================================
   ROTEADOR
   ===================================================================== */
function rota() {
  const h = location.hash.replace(/^#\/?/, "");
  const [caminho, qs] = h.split("?");
  const partes = caminho.split("/").filter(Boolean);
  return { r: partes[0] || "", p: partes[1] || "", q: new URLSearchParams(qs || "") };
}
function destruirGraficos() { charts.forEach((c) => { try { c.destroy(); } catch (e) {} }); charts = []; }
async function render() {
  destruirGraficos();
  const { r, p, q } = rota();
  $$(".menu a").forEach((a) => a.classList.toggle("ativo", a.dataset.rota === r || (r === "ativo" && a.dataset.rota === "")));
  $("#menu").classList.remove("aberto");
  const app = $("#app");
  try {
    if (r === "") pgHome(app);
    else if (r === "rankings") pgRankings(app);
    else if (r === "oportunidades") pgOportunidades(app);
    else if (r === "riscos") pgRiscos(app);
    else if (r === "ativo") await pgAtivo(app, p.toUpperCase(), q);
    else if (r === "comparar") pgComparar(app, q);
    else if (r === "filtros") pgFiltros(app);
    else if (r === "metodologia") pgMetodologia(app);
    else app.innerHTML = '<div class="cartao"><h1>Página não encontrada</h1><p><a href="#/">Voltar à visão geral</a></p></div>';
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="cartao"><h2>Erro ao montar a página</h2><p class="mono">${esc(e.message)}</p></div>`;
  }
  if (r !== "ativo") window.scrollTo(0, 0);
}

/* =====================================================================
   TABELA GENÉRICA
   ===================================================================== */
function tabela(lista, colunas, opts = {}) {
  const sort = opts.sort;
  const ths = colunas.map((k) => {
    const m = meta(k), n = !["txt"].includes(m.unidade);
    const seta = sort && sort.k === k ? `<span class="seta">${sort.d > 0 ? "▲" : "▼"}</span>` : "";
    return `<th class="${n ? "n" : ""} ${sort ? "ord" : ""}" data-k="${k}" data-tip="${esc(m.nome + (m.formula ? ": " + m.formula : ""))}">${esc(ROT_CURTO[k] || m.nome)}${seta}</th>`;
  }).join("");
  const trs = lista.map((t) => `<tr>${colunas.map((k) => celula(t, k)).join("")}</tr>`).join("");
  return `<div class="tabela-wrap"><table class="resp">${opts.semCabecalho ? "" : `<thead><tr>${ths}</tr></thead>`}<tbody>${trs || `<tr><td colspan="${colunas.length}" class="vazio">Nenhum ativo.</td></tr>`}</tbody></table></div>`;
}
function celula(t, k) {
  const m = meta(k), rot = esc(ROT_CURTO[k] || m.nome);
  const v = val(t, k);
  if (k === "ticker") return `<td class="tk" data-label="${rot}">${linkAtivo(t)}${isDist(t) ? ' <span class="badge alerta">distressed</span>' : ""}</td>`;
  if (k === "nome") return `<td data-label="${rot}">${esc(v)}</td>`;
  if (k === "preco") return `<td class="n" data-label="${rot}">R$ ${ok(v) ? nf2.format(v) : "n/d"}</td>`;
  if (k.startsWith("var_")) return `<td class="n" data-label="${rot}">${varHtml(v)}</td>`;
  if (k === "novidades") return `<td class="n" data-label="${rot}">${v ? `<span class="badge novo">${v} novo${v > 1 ? "s" : ""}</span>` : '<span class="muted">0</span>'}</td>`;
  if (k === "score") return `<td class="n" data-label="${rot}"><b>${ok(v) ? nf0.format(v) : "n/d"}</b></td>`;
  if (m.unidade === "txt") return `<td data-label="${rot}">${v ? esc(v) : '<span class="muted">n/d</span>'}</td>`;
  const cls = semValuation(t) && ["Valuation", "TIR"].includes(m.grupo) ? "muted" : "";
  return `<td class="n ${cls}" data-label="${rot}">${fmt(t, k, v)}</td>`;
}
function ordenar(lista, k, d) {
  const num = !["txt"].includes(meta(k).unidade);
  return [...lista].sort((a, b) => {
    const va = val(a, k), vb = val(b, k);
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    return num ? d * (va - vb) : d * String(va).localeCompare(String(vb), "pt-BR");
  });
}
function filtroSeg(lista, seg) { return seg === "TUDO" ? lista : lista.filter((t) => A(t).tipo === seg); }
function chipsSeg(atual, id) {
  return `<div class="chips" id="${id}">${Object.entries(SEGMENTOS).map(([k, n]) => `<button class="chip ${k === atual ? "ativo" : ""}" data-seg="${k}">${n}</button>`).join("")}</div>`;
}
function todasColunas() {
  const base = ["ticker", "nome", "tipo", "setor_macro", "setor_micro", "porte", "preco", "var_dia", "var_mes", "var_ano", "var_12m", "var_5a", "score", "novidades", "valor_mercado_brl"];
  const ind_ = Object.keys(D.imeta.indicadores).filter((k) => !["preco", "valor_mercado"].includes(k));
  return [...base, ...ind_];
}

/* =====================================================================
   PÁGINA: VISÃO GERAL
   ===================================================================== */
function pgHome(app) {
  EST.colunas = EST.colunas || lsGet("colunas", CONFIG.COLUNAS_PADRAO);
  app.innerHTML = `
  <div class="linha entre">
    <div><h1>Visão geral</h1><p class="sub">${D.univ.length} ativos acompanhados. Clique no ticker para a análise completa.</p></div>
  </div>
  <div class="cartao">
    <div class="linha entre">
      ${chipsSeg(EST.seg, "segs")}
      <div class="linha">
        <input type="search" id="filtro-busca" placeholder="Filtrar por ticker ou nome" value="${esc(EST.busca)}">
        <select id="cenario" aria-label="Ordenar por cenário"><option value="">Cenário: nenhum</option>${Object.entries(CENARIOS).map(([k, c]) => `<option value="${k}" ${EST.cenario === k ? "selected" : ""}>Cenário: ${c.nome}</option>`).join("")}</select>
        <div class="dropdown"><button class="btn" id="btn-colunas">Colunas</button><div class="dropdown-painel" id="painel-colunas" hidden></div></div>
      </div>
    </div>
    <div class="espaco"></div>
    <div id="tabela-home"></div>
  </div>
  <div class="grade g2">
    <div class="cartao"><h2>Mapa de calor por setor (variação do dia)</h2><div id="mapa"></div></div>
    <div class="cartao"><h2>Concentração de cenário da lista filtrada</h2><div id="conc-home"></div></div>
  </div>`;
  const desenhar = () => {
    let lista = filtroSeg(D.univ.map((a) => a.ticker), EST.seg);
    const b = EST.busca.trim().toLowerCase();
    if (b) lista = lista.filter((t) => t.toLowerCase().includes(b) || A(t).nome.toLowerCase().includes(b));
    let cols = EST.colunas.filter((k) => meta(k));
    if (EST.cenario) {
      lista = [...lista].sort((x, y) => ((A(y).sensibilidade || {})[EST.cenario] ?? 0) - ((A(x).sensibilidade || {})[EST.cenario] ?? 0));
      $("#tabela-home").innerHTML = `<p class="sub">Ordenado pela sensibilidade a <b>${nomeCen(EST.cenario)}</b> (de +2 a -2).</p>` + tabelaCenario(lista, cols);
    } else {
      lista = ordenar(lista, EST.sort.k, EST.sort.d);
      $("#tabela-home").innerHTML = tabela(lista, cols, { sort: EST.sort });
    }
    $$("#tabela-home th.ord").forEach((th) => th.onclick = () => {
      const k = th.dataset.k;
      EST.sort = { k, d: EST.sort.k === k ? -EST.sort.d : (meta(k).unidade === "txt" ? 1 : -1) };
      EST.cenario = ""; $("#cenario").value = "";
      desenhar();
    });
    $("#mapa").innerHTML = mapaCalor(lista);
    $("#conc-home").innerHTML = concHtml(lista);
  };
  $$("#segs .chip").forEach((c) => c.onclick = () => { EST.seg = c.dataset.seg; $$("#segs .chip").forEach((x) => x.classList.toggle("ativo", x === c)); desenhar(); });
  $("#filtro-busca").oninput = (e) => { EST.busca = e.target.value; desenhar(); };
  $("#cenario").onchange = (e) => { EST.cenario = e.target.value; desenhar(); };
  painelColunas($("#btn-colunas"), $("#painel-colunas"), () => desenhar());
  desenhar();
}
function tabelaCenario(lista, cols) {
  const c = EST.cenario;
  const cs = ["ticker", "nome", "setor_micro", ...cols.filter((k) => !["ticker", "nome", "setor_micro"].includes(k)).slice(0, 6)];
  const ths = `<th>Sensib.</th>` + cs.map((k) => `<th class="${meta(k).unidade === "txt" ? "" : "n"}">${esc(ROT_CURTO[k] || meta(k).nome)}</th>`).join("");
  const trs = lista.map((t) => { const s = (A(t).sensibilidade || {})[c] ?? 0;
    return `<tr><td class="n" data-label="Sensibilidade"><b class="${s > 0 ? "pos" : s < 0 ? "neg" : ""}">${s > 0 ? "+" : ""}${s}</b></td>${cs.map((k) => celula(t, k)).join("")}</tr>`; }).join("");
  return `<div class="tabela-wrap"><table class="resp"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
}
function painelColunas(btn, painel, onChange) {
  btn.onclick = (e) => { e.stopPropagation(); painel.hidden = !painel.hidden; };
  document.addEventListener("click", (e) => { if (!painel.contains(e.target) && e.target !== btn) painel.hidden = true; });
  const grupos = {};
  for (const k of todasColunas()) { const g = meta(k).grupo || "Geral"; (grupos[g] = grupos[g] || []).push(k); }
  painel.innerHTML = `<div class="linha entre"><b>Colunas</b><button class="btn peq" id="col-reset">Padrão</button></div>` +
    Object.entries(grupos).map(([g, ks]) => `<h4>${esc(g)}</h4>${ks.map((k) => `<label><input type="checkbox" value="${k}" ${EST.colunas.includes(k) ? "checked" : ""}> ${esc(meta(k).nome)}</label>`).join("")}`).join("");
  painel.onchange = (e) => {
    const k = e.target.value;
    if (e.target.checked) EST.colunas.push(k); else EST.colunas = EST.colunas.filter((x) => x !== k);
    lsSet("colunas", EST.colunas); onChange();
  };
  $("#col-reset", painel).onclick = () => { EST.colunas = [...CONFIG.COLUNAS_PADRAO]; lsSet("colunas", EST.colunas); painelColunas(btn, painel, onChange); painel.hidden = false; onChange(); };
}
function corVar(v) {
  if (!ok(v)) return "var(--txt-3)";
  const pct = Math.min(100, 25 + Math.abs(v) / 0.03 * 75);
  return v >= 0 ? `color-mix(in srgb, var(--pos) ${pct}%, var(--bg-3))` : `color-mix(in srgb, var(--neg) ${pct}%, var(--bg-3))`;
}
function mapaCalor(lista) {
  const por = {};
  for (const t of lista) (por[A(t).setor_macro] = por[A(t).setor_macro] || []).push(t);
  return `<div class="mapa">${Object.entries(por).map(([s, ts]) => {
    const m = media(ts.map((t) => (D.prices[t] || {}).var_dia));
    return `<div class="mapa-setor"><h4>${esc(s)} <span class="${sinal(m)} num">${ok(m) ? (m > 0 ? "+" : "") + nf2.format(m * 100) + "%" : ""}</span></h4><div class="mapa-tiles">${ts.map((t) => {
      const v = (D.prices[t] || {}).var_dia;
      return `<a class="tile" href="#/ativo/${t}" style="background:${corVar(v)}"><b>${t}</b>${ok(v) ? (v > 0 ? "+" : "") + nf2.format(v * 100) + "%" : "n/d"}</a>`;
    }).join("")}</div></div>`;
  }).join("")}</div>`;
}

/* =====================================================================
   PÁGINA: RANKINGS
   ===================================================================== */
const RANKINGS = {
  score: { nome: "Score composto", valor: (t) => SC[t].score, un: "score", desc: "Combinação dos 5 fatores, comparando cada empresa com o seu grupo." },
  tir: { nome: "Maior TIR implícita", valor: (t) => semValuation(t) ? null : ind(t).tir_implicita, un: "pct", desc: "Retorno anual que o preço de hoje embute. Empresas DISTRESSED ficam de fora." },
  descontada: { nome: "Mais descontada vs própria história", valor: (t) => { if (semValuation(t)) return null; const i = ind(t); const v = isFin(t) ? i.pvp_vs_media5 : media([i.pl_vs_media5, i.evebitda_vs_media5]); return ok(v) ? -v : null; }, un: "pct", desc: "Quanto o múltiplo atual (P/L e EV/EBITDA; bancos: P/VP) está abaixo da própria média de 5 anos." },
  qualidade: { nome: "Qualidade", valor: (t) => SC[t].fatores.qualidade, un: "score", desc: "ROIC (bancos: ROE), estabilidade de margem, conversão de caixa e baixa diluição." },
  crescimento: { nome: "Crescimento", valor: (t) => SC[t].fatores.crescimento, un: "score", desc: "CAGR de receita e lucro, consistência e crescimento recente." },
  dividendos: { nome: "Dividendos sustentáveis", valor: (t) => { const i = ind(t); if (!ok(i.dy) || !(i.dy > 0)) return null; if (!(ok(i.payout) && i.payout < 1)) return null; if (!isFin(t) && !(ok(i.fcl) && i.fcl > 0)) return null; return i.dy; }, un: "pct", desc: "DY 12m de quem tem payout abaixo de 100% e FCL positivo (bancos e seguradoras: só payout)." },
  solidez: { nome: "Balanço mais sólido", valor: (t) => SC[t].fatores.solidez, un: "score", desc: "Dívida líquida sobre EBITDA, cobertura de juros, liquidez e PL sobre ativos." },
  graham: { nome: "Margem de segurança Graham", valor: (t) => semValuation(t) ? null : ind(t).graham_margem, un: "pct", desc: "Preço justo de Graham sobre o preço de hoje." },
  bazin: { nome: "Margem de segurança Bazin", valor: (t) => semValuation(t) ? null : ind(t).bazin_margem, un: "pct", desc: "Preço teto de Bazin sobre o preço de hoje." },
};
function pgRankings(app) {
  app.innerHTML = `<h1>Rankings</h1><p class="sub">Por padrão a comparação é feita dentro do setor (banco não compete com varejista). Troque o escopo para ver o ranking geral.</p>
  <div class="cartao"><div class="linha entre">
    <div class="chips" id="rk-tipo">${Object.entries(RANKINGS).map(([k, r]) => `<button class="chip ${k === EST.rankTipo ? "ativo" : ""}" data-k="${k}">${r.nome}</button>`).join("")}</div>
    <div class="linha"><select id="rk-escopo"><option value="setor_micro">Dentro do setor micro</option><option value="setor_macro">Dentro do setor macro</option><option value="geral">Ranking geral</option></select>
    ${chipsSeg(EST.seg, "rk-seg")}</div>
  </div></div><div id="rk-saida"></div>`;
  $("#rk-escopo").value = EST.rankEscopo;
  const desenhar = () => {
    const R = RANKINGS[EST.rankTipo];
    const lista = filtroSeg(D.univ.map((a) => a.ticker), EST.seg);
    const grupos = {};
    for (const t of lista) { const g = EST.rankEscopo === "geral" ? "Todos os ativos" : A(t)[EST.rankEscopo]; (grupos[g] = grupos[g] || []).push(t); }
    $("#rk-saida").innerHTML = `<p class="sub">${esc(R.desc)}</p><div class="grade g2">${Object.entries(grupos).map(([g, ts]) => {
      const ord = ts.map((t) => [t, R.valor(t)]).sort((a, b) => (ok(b[1]) ? b[1] : -Infinity) - (ok(a[1]) ? a[1] : -Infinity));
      return `<div class="cartao"><h3>${esc(g)}</h3><div class="tabela-wrap"><table><thead><tr><th>#</th><th>Ticker</th><th>Nome</th><th class="n">${esc(R.nome)}</th><th class="n">Score</th></tr></thead><tbody>${ord.map(([t, v], i) =>
        `<tr class="rk-linha" data-t="${t}" style="cursor:pointer"><td class="n">${ok(v) ? i + 1 : "-"}</td><td class="tk">${linkAtivo(t)}</td><td>${esc(A(t).nome)}</td><td class="n">${fmtU(v, R.un)}</td><td class="n">${fmtU(SC[t].score, "score")}</td></tr>
         <tr class="rk-det" data-t="${t}" hidden><td colspan="5">${decomposicao(t)}</td></tr>`).join("")}</tbody></table></div></div>`;
    }).join("")}</div><p class="sub">Clique numa linha para ver a decomposição do score.</p>`;
    $$(".rk-linha").forEach((tr) => tr.onclick = (e) => { if (e.target.tagName === "A") return; const d = $(`.rk-det[data-t="${tr.dataset.t}"]`, tr.parentNode); d.hidden = !d.hidden; });
  };
  $$("#rk-tipo .chip").forEach((c) => c.onclick = () => { EST.rankTipo = c.dataset.k; $$("#rk-tipo .chip").forEach((x) => x.classList.toggle("ativo", x === c)); desenhar(); });
  $$("#rk-seg .chip").forEach((c) => c.onclick = () => { EST.seg = c.dataset.seg; $$("#rk-seg .chip").forEach((x) => x.classList.toggle("ativo", x === c)); desenhar(); });
  $("#rk-escopo").onchange = (e) => { EST.rankEscopo = e.target.value; desenhar(); };
  desenhar();
}
function decomposicao(t) {
  const s = SC[t];
  if (!s) return "";
  return `<div class="barras-score">${Object.keys(CONFIG.PESOS).map((f) => {
    const v = s.fatores[f];
    const dets = Object.entries(s.det[f] || {}).map(([k, z]) => `${meta(k).nome}: z ${nf2.format(z)}`).join("; ");
    return `<div class="linha-score" data-tip="${esc(dets || "sem dados no grupo")}"><span>${FATOR_NOME[f]} <span class="muted">(${nf0.format(CONFIG.PESOS[f] * 100)}%)</span></span><span class="barra"><i style="width:${ok(v) ? v : 0}%"></i></span><span class="num">${ok(v) ? nf0.format(v) : "n/d"}</span></div>`;
  }).join("")}<p class="sub">Grupo de comparação: ${esc(s.grupoNome || "")} (${s.grupo.length} ativos). Passe o mouse sobre cada fator para ver os z-scores.</p></div>`;
}

/* =====================================================================
   PÁGINAS: OPORTUNIDADES E RISCOS
   ===================================================================== */
function pgOportunidades(app) {
  const por = {};
  for (const a of D.univ) for (const o of oportunidades(a.ticker)) (por[o.id] = por[o.id] || []).push([a.ticker, o.txt]);
  app.innerHTML = `<h1>Oportunidades</h1><p class="sub">Regras automáticas sobre os dados. Os limites ficam em CONFIG.OPORTUNIDADES, no topo de assets/app.js. São leituras de dado, não indicação de operação.</p>
  ${Object.entries(OPP_NOMES).map(([id, nome]) => `<div class="cartao regra"><h3>${esc(nome)} <span class="badge cinza">${(por[id] || []).length}</span></h3>
  ${(por[id] || []).length ? `<ul class="lista-simples">${por[id].map(([t, txt]) => `<li>${linkAtivo(t)} <span class="sub">${esc(A(t).nome)}</span>: ${txt}</li>`).join("")}</ul>` : '<p class="vazio">Nenhum ativo atende hoje.</p>'}</div>`).join("")}`;
}
function pgRiscos(app) {
  const por = {};
  for (const a of D.univ) for (const r of riscos(a.ticker)) (por[r.id] = por[r.id] || []).push([a.ticker, r]);
  app.innerHTML = `<h1>Riscos</h1><p class="sub">Alertas automáticos. Limites em CONFIG.RISCOS (assets/app.js).</p>
  ${Object.entries(RISCO_NOMES).filter(([id]) => por[id]).map(([id, nome]) => `<div class="cartao regra"><h3>${esc(nome)} <span class="badge alerta">${por[id].length}</span></h3>
  <ul class="lista-simples">${por[id].map(([t, r]) => `<li>${linkAtivo(t)} <span class="sub">${esc(A(t).nome)}</span>: ${r.txt}</li>`).join("")}</ul></div>`).join("") || '<p class="vazio">Nenhum alerta.</p>'}
  <p class="sub">Alertas sem ativos no momento: ${Object.entries(RISCO_NOMES).filter(([id]) => !por[id]).map(([, n]) => esc(n)).join(", ") || "nenhum"}.</p>`;
}

/* =====================================================================
   PÁGINA DO ATIVO
   ===================================================================== */
const ABAS_ATIVO = ["Valuation", "Endividamento", "Eficiência", "Rentabilidade", "Crescimento", "Caixa", "Proventos", "Governança"];
function chavesDoGrupo(t, g) {
  const im = D.imeta.indicadores;
  let ks = Object.keys(im).filter((k) => im[k].grupo === g);
  if (g === "Valuation") ks = ks.filter((k) => !["preco", "valor_mercado"].includes(k));
  if (g === "Governança") ks = ["acoes", "diluicao_3a", "diluicao_5a", "controlador_pct", "free_float", "tag_along", "recompras_ltm"];
  if (isFin(t)) ks = ks.filter((k) => !NAO_FIN.has(k));
  else ks = ks.filter((k) => k !== "pvp_vs_media5");
  if (g === "Eficiência" && !isFin(t)) ks.push("estab_margem");
  return [...new Set(ks)];
}
async function pgAtivo(app, t, q) {
  if (!D.univMap[t] || !D.fund[t]) { app.innerHTML = `<div class="cartao"><h1>${esc(t)}</h1><p>Ativo não encontrado no universo.</p></div>`; return; }
  const a = A(t), f = D.fund[t], i = f.ind, p = D.prices[t] || {}, n = D.notes[t] || {};
  const gp = ganhaPerde(t);
  const aba = q.get("aba") || "Valuation";
  const mo = moedaDe(t);
  app.innerHTML = `
  <div class="cartao">
    <div class="cab-ativo">
      <div>
        <div class="linha"><span class="tk">${t}</span><span class="badge cinza">${TIPO_CURTO[a.tipo]}</span><span class="badge cinza">${esc(a.modelo_analise)}</span>${i.porte ? `<span class="badge cinza">${esc(i.porte)}</span>` : ""}</div>
        <h1 style="margin-top:.3rem">${esc(a.nome)}</h1>
        <div class="trilha">${esc(a.setor_macro)} → ${esc(a.setor_micro)}</div>
      </div>
      <div>
        <div class="preco-grande">R$ ${ok(p.preco) ? nf2.format(p.preco) : "n/d"} <span style="font-size:1rem">${varHtml(p.var_dia)}</span></div>
        <div class="sub" style="text-align:right">Fechamento de ${dataBR(p.data)} | Balanço até ${esc(f.trimestre || "n/d")} | ${esc(f.fonte || "")}</div>
        <div class="sub" style="text-align:right">12m ${varHtml(p.var_12m)} | 52 sem.: R$ ${ok(p.min_52s) ? nf2.format(p.min_52s) : "n/d"} a R$ ${ok(p.max_52s) ? nf2.format(p.max_52s) : "n/d"}</div>
      </div>
    </div>
  </div>
  ${isDist(t) ? `<div class="alerta-fixo">Empresa classificada como DISTRESSED (reestruturação). Múltiplos de lucro, TIR implícita, Graham e Bazin não são exibidos como sinal de preço baixo. Os pontos centrais aqui são dívida, caixa e prazo de vencimentos.</div>` : ""}
  ${isCripto(t) ? `<div class="alerta-fixo">Tesouraria em bitcoin: o valor da empresa acompanha o bitcoin em caixa. O lucro contábil é marcação a mercado do BTC, por isso P/L, TIR implícita e Graham não são exibidos. Os indicadores centrais são mNAV, BTC por ação e diluição.</div>` : ""}
  ${a.tipo.startsWith("BDR") ? `<div class="alerta-fixo">A tributação de proventos de BDR é diferente da de ações brasileiras. Fundamentos desta página em ${moedaDe(t) === "US$" ? "dólar" : "reais (a empresa reporta em R$)"}.</div>` : ""}
  <div class="grade g2">
    <div class="cartao"><h2>Resumo do negócio</h2><p>${esc(n.resumo || "Resumo não preenchido em data/notes.json.")}</p>
      ${n.tese ? `<h4>Tese</h4><p>${esc(n.tese)}</p>` : ""}
      ${n.qualitativo ? `<h4>Notas qualitativas</h4><ul class="lista-simples">${Object.entries(n.qualitativo).map(([k, v]) => `<li><b>${esc(({ regulacao: "Regulação", concessoes: "Concessões", vso: "VSO", banco_terrenos: "Banco de terrenos", caixa: "Geração ou queima de caixa" })[k] || k.replace(/_/g, " "))}:</b> ${esc(v)}</li>`).join("")}</ul>` : ""}
    </div>
    <div class="cartao"><h2>Contexto macro</h2>
      <p><b class="pos">Ela ganha</b> ${gp.g.length ? esc(gp.g.join("; ")) + "." : "<span class='muted'>sem cenário favorável marcado.</span>"}</p>
      <p><b class="neg">Ela perde</b> ${gp.p.length ? esc(gp.p.join("; ")) + "." : "<span class='muted'>sem cenário desfavorável marcado.</span>"}</p>
      <div class="barras-score">${Object.entries(a.sensibilidade || {}).map(([c, v]) => `<div class="linha-score"><span>${CENARIOS[c].nome}</span><span class="barra"><i style="left:${v < 0 ? 50 + v * 25 : 50}%;width:${Math.abs(v) * 25}%;background:${v >= 0 ? "var(--pos)" : "var(--neg)"}"></i></span><span class="num">${v > 0 ? "+" : ""}${v}</span></div>`).join("")}</div>
      <p class="sub">Escala de -2 a +2 definida em data/universe.json.</p>
    </div>
  </div>
  ${blocoPrecoHoje(t)}
  ${a.tipo.startsWith("BDR") ? blocoBDR(t) : ""}
  ${D.fund[t].holding ? blocoHolding(t) : ""}
  ${isCripto(t) ? blocoCripto(t) : ""}
  <div class="cartao">
    <div class="linha entre"><h2>Score ${ok(SC[t].score) ? nf0.format(SC[t].score) : "n/d"}/100</h2><span class="sub">Comparado com: ${esc(SC[t].grupoNome || "")}</span></div>
    ${decomposicao(t)}
  </div>
  <div class="cartao">
    <div class="abas" id="abas">${[...ABAS_ATIVO, ...(a.modelo_analise === "BANCO" ? ["Banco"] : []), ...(a.modelo_analise === "SEGURADORA" ? ["Seguradora"] : []), "Notícias e Comunicados"]
      .map((x) => `<button data-aba="${x}" class="${x === aba ? "ativo" : ""}">${x}</button>`).join("")}</div>
    <div id="aba-conteudo"><p class="vazio">Carregando histórico...</p></div>
  </div>
  <div class="grade g2">
    <div class="cartao"><div class="linha entre"><h2>Preço</h2><div class="chips" id="px-per"><button class="chip ativo" data-p="1">1a</button><button class="chip" data-p="5">5a</button><button class="chip" data-p="10">10a</button></div></div><div class="grafico"><canvas id="g-preco"></canvas></div></div>
    <div class="cartao"><h2>Lucro x preço</h2><div class="grafico"><canvas id="g-lucro"></canvas></div><p class="sub">Barras: lucro líquido anual (${mo}). Linha: preço no fim de cada exercício.</p></div>
  </div>
  <div class="grade g2">
    <div class="cartao"><h2>Oportunidades e riscos</h2>${blocoOppRisco(t)}</div>
    <div class="cartao"><h2>Relacionadas</h2>${blocoRelacionadas(t)}</div>
  </div>`;
  const h = await historico(t);
  const abrir = async (x) => {
    $$("#abas button").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === x));
    const alvo = $("#aba-conteudo");
    if (x === "Notícias e Comunicados") alvo.innerHTML = await abaNoticias(t);
    else if (x === "Proventos") alvo.innerHTML = abaIndicadores(t, x, h) + await blocoProventos(t);
    else alvo.innerHTML = abaIndicadores(t, x, h);
    if (x === "Proventos") graficoProventos(t);
  };
  $$("#abas button").forEach((b) => b.onclick = () => { history.replaceState(null, "", `#/ativo/${t}?aba=${encodeURIComponent(b.dataset.aba)}`); abrir(b.dataset.aba); });
  await abrir(aba);
  graficoPreco(t, h, 1);
  $$("#px-per .chip").forEach((c) => c.onclick = () => { $$("#px-per .chip").forEach((x) => x.classList.toggle("ativo", x === c)); graficoPreco(t, h, +c.dataset.p); });
  graficoLucro(t, h);
  $$(".btn-comparar").forEach((b) => b.onclick = () => location.hash = `#/comparar?t=${b.dataset.t}`);
}
function blocoPrecoHoje(t) {
  const i = ind(t), mo = moedaDe(t), fin = isFin(t);
  const k = (rot, key, extra = "") => `<div class="kpi"><div class="rot">${rot}${tip(key)}</div><div class="val">${fmt(t, key)}</div><div class="det">${extra}</div></div>`;
  const ci = i.cresc_implicito, ch = i.cresc_historico_ref;
  let frase;
  if (isDist(t)) frase = "Empresa em reestruturação: o crescimento implícito não é calculado porque os fluxos atuais não representam a operação normal.";
  else if (isCripto(t)) frase = "Tesouraria em bitcoin: TIR e crescimento implícito não se aplicam. Compare o valor de mercado com o bitcoin em caixa (mNAV).";
  else if (ok(ci)) frase = `Para justificar o preço de hoje, a empresa precisa crescer <b>${nf1.format(ci * 100)}% ao ano para sempre</b> (taxa de desconto de ${fmtU(i.taxa_referencia, "pct")}). ` +
    (ok(ch) ? `Nos últimos 5 anos ${fin ? "o lucro" : "a receita"} cresceu <b>${nf1.format(ch * 100)}% ao ano</b>${ci > ch ? ", então o preço exige mais do que a empresa entregou." : ", então o preço exige menos do que a empresa entregou."}` : "Sem histórico de 5 anos para comparar.");
  else frase = "Crescimento implícito não calculado: falta fluxo de caixa livre (ou ROE) positivo para a conta.";
  const ref = A(t).moeda_reporte === "USD" ? "Treasury 10y" : "NTN-B longa (nominal)";
  const bdrExtra = (key) => { const b = D.fund[t].bdr; if (!b || !ok(i[key]) || !b.ptax || !b.proporcao) return "";
    const fx = moedaDe(t) === "US$" ? b.ptax : 1; return `equivale a R$ ${nf2.format(i[key] * fx / b.proporcao)} por BDR`; };
  return `<div class="cartao destaque"><h2>Ao preço de hoje</h2>
  <div class="kpis">
    ${fin ? k("TIR implícita (ROE)", "tir_banco", `ROE sustentável ${fmtU(i.roe_sustentavel, "pct")}, payout ${fmtU(i.payout, "pct")}`) : ""}
    ${k("TIR por lucro", "tir_lucro", `g = ${fmtU(i.g, "pct")}`)}
    ${fin ? "" : k("TIR por caixa", "tir_caixa", `g = ${fmtU(i.g, "pct")}`)}
    ${fin ? "" : k("TIR por DCF reverso", "tir_dcf", ok(i.cresc_dcf_usado) ? `cresc. 5a usado ${fmtU(i.cresc_dcf_usado, "pct")}, margem FCL ${fmtU(i.margem_fcl_5a, "pct")}` : "")}
    ${k("TIR principal", "tir_implicita", ok(i.tir_spread_ref) ? `${i.tir_spread_ref >= 0 ? "+" : ""}${nf1.format(i.tir_spread_ref * 100)} p.p. sobre ${ref} (${fmtU(i.titulo_ref, "pct")})` : "")}
    ${k("Crescimento implícito", "cresc_implicito", `histórico 5a: ${fmtU(ch, "pct")}`)}
    ${k("Preço justo de Graham", "graham", ok(i.graham_margem) ? `margem ${fmtU(i.graham_margem, "pct")} ${bdrExtra("graham")}` : "")}
    ${k("Preço teto de Bazin", "bazin", ok(i.bazin_margem) ? `margem ${fmtU(i.bazin_margem, "pct")} ${bdrExtra("bazin")}` : "")}
  </div>
  <div class="espaco"></div><p class="frase">${frase}</p>
  ${A(t).tipo.startsWith("BDR") ? `<p class="sub">Graham e Bazin calculados em ${mo} sobre o preço do papel no exterior${mo === "R$" ? " convertido pela PTAX" : ""}.</p>` : ""}
  </div>`;
}
function blocoHolding(t) {
  const h = D.fund[t].holding || {}, i = ind(t);
  return `<div class="cartao"><h2>Desconto de holding</h2><div class="kpis">
    <div class="kpi"><div class="rot">Valor de mercado da holding</div><div class="val">${fmt(t, "valor_mercado")}</div></div>
    <div class="kpi"><div class="rot">Soma das partes listadas${tip("soma_partes")}</div><div class="val">${fmt(t, "soma_partes")}</div></div>
    <div class="kpi"><div class="rot">Desconto${tip("desconto_holding")}</div><div class="val ${sinal(i.desconto_holding)}">${fmt(t, "desconto_holding")}</div></div>
  </div><div class="espaco"></div>
  <div class="tabela-wrap"><table class="resp"><thead><tr><th>Participação</th><th class="n">% detido (FRE)</th><th class="n">Valor de mercado da investida</th><th class="n">Valor da participação</th></tr></thead><tbody>
  ${(h.partes || []).map((p) => `<tr><td data-label="Participação">${D.univMap[p.ticker] ? linkAtivo(p.ticker) : esc(p.ticker)}</td><td class="n" data-label="% detido">${fmtU(p.pct, "pct")}</td><td class="n" data-label="Valor de mercado">${fmtU(p.valor_mercado, "moeda_grande_brl")}</td><td class="n" data-label="Valor da participação">${fmtU(p.valor_participacao, "moeda_grande_brl")}</td></tr>`).join("") || '<tr><td colspan="4" class="vazio">Sem participações listadas encontradas no FRE.</td></tr>'}
  </tbody></table></div><p class="sub">${esc(h.nota || "")}</p></div>`;
}
function blocoCripto(t) {
  const c = D.fund[t].cripto || {};
  const k = (rot, key) => `<div class="kpi"><div class="rot">${rot}${tip(key)}</div><div class="val">${fmt(t, key)}</div></div>`;
  return `<div class="cartao"><h2>Tesouraria em bitcoin</h2><div class="kpis">
    ${k("Bitcoin em caixa", "btc_em_caixa")}${k("Valor do bitcoin em caixa", "valor_btc")}${k("mNAV", "mnav")}${k("BTC por ação", "btc_por_acao")}${k("Diluição 3a", "diluicao_3a")}
  </div><p class="sub">Fonte da quantidade: ${esc(c.fonte || "n/d")}${c.data ? `, posição de ${dataBR(c.data)}` : ""}. Preço do BTC no fechamento: ${ok(c.preco_btc) ? `${moedaDe(t)} ${nf0.format(c.preco_btc)}` : "n/d"}.</p></div>`;
}
function blocoBDR(t) {
  const b = D.fund[t].bdr || {};
  return `<div class="cartao"><h2>Vínculo com o papel no exterior</h2><div class="kpis">
    <div class="kpi"><div class="rot">Papel no exterior</div><div class="val mono">${esc(b.ticker_exterior || "n/d")}</div><div class="det">${esc(b.bolsa_exterior || "")}</div></div>
    <div class="kpi"><div class="rot">Proporção</div><div class="val">${b.proporcao ? `${b.proporcao} BDRs = 1 ação` : "n/d"}</div><div class="det">implícita pelo preço: ${ok(b.proporcao_implicita) ? nf2.format(b.proporcao_implicita) : "n/d"} ${b.proporcao_confere ? '<span class="badge cinza">confere</span>' : '<span class="badge alerta">conferir</span>'}</div></div>
    <div class="kpi"><div class="rot">Preço no exterior</div><div class="val">US$ ${ok(b.preco_exterior) ? nf2.format(b.preco_exterior) : "n/d"}</div><div class="det">${dataBR(b.data_exterior)}</div></div>
    <div class="kpi"><div class="rot">PTAX</div><div class="val">${ok(b.ptax) ? nf2.format(b.ptax).replace(/,(\d\d)$/, ",$1") : "n/d"}</div><div class="det">Banco Central</div></div>
    <div class="kpi"><div class="rot">Preço justo do BDR${tip("bdr_preco_justo")}</div><div class="val">R$ ${ok(b.preco_justo) ? nf2.format(b.preco_justo) : "n/d"}</div><div class="det">preço exterior x PTAX / proporção</div></div>
    <div class="kpi"><div class="rot">Ágio/deságio${tip("bdr_agio")}</div><div class="val ${sinal(-(b.agio || 0))}">${ok(b.agio) ? (b.agio > 0 ? "+" : "") + nf2.format(b.agio * 100) + "%" : "n/d"}</div><div class="det">${ok(b.agio) ? (b.agio > 0 ? "BDR acima do preço justo" : "BDR abaixo do preço justo") : ""}</div></div>
  </div><p class="sub">${esc(b.proporcao_fonte || "")} Diferenças pequenas vêm do horário de fechamento das duas bolsas e da PTAX do dia.</p></div>`;
}
function spark(vals, w = 110, hgt = 24) {
  const v = vals.map((x) => ok(x) ? x : null);
  const nums = v.filter((x) => x !== null);
  if (nums.length < 2) return '<span class="muted">-</span>';
  const mn = Math.min(...nums, 0), mx = Math.max(...nums, 0), rg = mx - mn || 1;
  const bw = w / v.length;
  const y0 = hgt - ((0 - mn) / rg) * hgt;
  return `<svg class="spark" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}">${v.map((x, i) => {
    if (x === null) return "";
    const y = hgt - ((x - mn) / rg) * hgt;
    return `<rect x="${i * bw + 1}" y="${Math.min(y, y0)}" width="${Math.max(1, bw - 2)}" height="${Math.max(1, Math.abs(y0 - y))}" fill="${x >= 0 ? "var(--acento)" : "var(--neg)"}" opacity=".8"></rect>`;
  }).join("")}</svg>`;
}
function abaIndicadores(t, g, h) {
  const f = D.fund[t], st = f.setor || {};
  const chaves = g === "Banco" || g === "Seguradora" ? Object.keys(D.imeta.indicadores).filter((k) => D.imeta.indicadores[k].grupo === g).concat(g === "Banco" ? ["pvp", "roe"] : ["roe"]) : chavesDoGrupo(t, g);
  const anos = Object.keys(h.anual || {}).sort();
  const linhas = chaves.map((k) => {
    const m = meta(k), v = val(t, k), m5 = f.medias_5a[k], md = (st.mediana_grupo || {})[k], pc = (st.percentil || {})[k];
    const serie = anos.map((y) => h.anual[y][k]);
    const tem = serie.some(ok);
    const dist = isDist(t) && ["Valuation"].includes(g) && ["pl", "p_ebit", "p_ebitda", "ev_ebitda", "ev_ebit", "earnings_yield", "peg"].includes(k);
    return `<tr><td data-label="Indicador">${esc(m.nome)}${tip(k)}${dist ? ' <span class="badge alerta">não indica preço baixo</span>' : ""}</td>
      <td class="n" data-label="Atual"><b>${fmt(t, k, v)}</b></td><td class="n" data-label="Média 5a">${fmt(t, k, ok(m5) ? m5 : null)}</td>
      <td class="n" data-label="Mediana do grupo">${fmt(t, k, ok(md) ? md : null)}</td>
      <td class="n" data-label="Percentil no grupo">${ok(pc) ? `<span class="pct-barra"><i style="width:${pc}%"></i></span> ${nf0.format(pc)}` : '<span class="muted">n/d</span>'}</td>
      <td data-label="Histórico" data-tip="${esc(anos.map((y, ix) => `${y}: ${ok(serie[ix]) ? stripTags(fmt(t, k, serie[ix])) : "n/d"}`).join(" | "))}">${tem ? spark(serie) : '<span class="muted">-</span>'}</td></tr>`;
  }).join("");
  const nota = g === "Banco" ? `<p class="sub">Basileia, inadimplência 90 dias e cobertura de PDD não existem nas demonstrações padronizadas da CVM. Preencha em data/notes.json, campo "manuais", a partir do release. ${esc(((D.notes[t] || {}).manuais || {}).fonte || "")}</p>` :
    g === "Seguradora" ? `<p class="sub">Índice combinado e sinistralidade vêm do release (data/notes.json, campo "manuais"). A BB Seguridade consolida as coligadas por equivalência patrimonial, por isso esses índices não aparecem no balanço dela.</p>` : "";
  return `<div class="tabela-wrap"><table class="resp"><thead><tr><th>Indicador</th><th class="n">Atual (LTM)</th><th class="n">Média 5a</th><th class="n">Mediana do grupo</th><th class="n">Percentil</th><th>Histórico anual</th></tr></thead><tbody>${linhas}</tbody></table></div>
  <p class="sub">Grupo de comparação: ${esc(st.grupo_nome || "")} (${(st.grupo_membros || []).length} ativos${st.grupo_nivel === "setor_micro" ? "" : `; o setor micro tem menos de ${D.config.grupo_minimo_pares || 3} ativos, então a comparação sobe para ${st.grupo_nivel === "setor_macro" ? "o setor macro" : "a família (financeiras ou não financeiras)"}`}). Passe o mouse no histórico para ver os valores.</p>${nota}`;
}
function stripTags(s) { return String(s).replace(/<[^>]+>/g, ""); }
async function blocoProventos(t) {
  const pv = await proventos(t), mo = pv.moeda === "USD" ? "US$" : "R$";
  const lista = (pv.lista || []).slice(0, 24);
  return `<div class="espaco"></div><div class="grade g2"><div><h3>Proventos por ano (por ${porPapel(t) > 1 ? "unit" : "ação"})</h3><div class="grafico peq"><canvas id="g-prov"></canvas></div>
  <p class="sub">Fonte: ${esc(pv.fonte || "")}. Anos anteriores à lista da B3 vêm do yfinance, sem separação entre dividendo e JCP.</p></div>
  <div><h3>Últimos proventos</h3><div class="tabela-wrap" style="max-height:300px;overflow:auto"><table class="resp"><thead><tr><th>Data com</th><th>Pagamento</th><th>Tipo</th><th class="n">Valor</th></tr></thead><tbody>
  ${lista.map((x) => `<tr><td data-label="Data com">${dataBR(x.data_com)}</td><td data-label="Pagamento">${dataBR(x.pagamento)}</td><td data-label="Tipo">${esc(x.tipo)}</td><td class="n" data-label="Valor">${mo} ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(x.valor)}</td></tr>`).join("") || '<tr><td colspan="4" class="vazio">Sem proventos.</td></tr>'}
  </tbody></table></div></div></div>`;
}
async function graficoProventos(t) {
  const pv = await proventos(t), el = $("#g-prov");
  if (!el || !window.Chart) return;
  const anoAtual = new Date().getFullYear();
  const anos = Object.keys(pv.por_ano || {}).map(Number).filter((a) => a >= anoAtual - 10).sort();
  const tipo = pv.por_ano_tipo || {};
  const ds = [];
  const temTipo = anos.some((a) => tipo[a]);
  if (temTipo) {
    ds.push({ label: "Dividendos", data: anos.map((a) => tipo[a] ? tipo[a].DIVIDENDO : null), backgroundColor: cor("--acento") });
    ds.push({ label: "JCP", data: anos.map((a) => tipo[a] ? tipo[a].JCP : null), backgroundColor: cor("--alerta") });
    ds.push({ label: "Sem separação", data: anos.map((a) => tipo[a] ? null : pv.por_ano[a]), backgroundColor: cor("--txt-3") });
  } else ds.push({ label: "Proventos", data: anos.map((a) => pv.por_ano[a]), backgroundColor: cor("--acento") });
  charts.push(new Chart(el, { type: "bar", data: { labels: anos, datasets: ds }, options: optGraf({ stacked: true }) }));
}
async function abaNoticias(t) {
  const n = await noticias(t);
  const limite = Date.now() - CONFIG.NOVO_HORAS * 3600e3;
  const novo = (d) => d && new Date(d).getTime() >= limite ? ' <span class="badge novo">Novo</span>' : "";
  const prox = n.proximo_resultado ? `<p class="frase">Próximo resultado: <b>${dataBR(n.proximo_resultado.data)}</b> <span class="sub">(${esc(n.proximo_resultado.fonte)})</span></p>` :
    (n.calendario_cvm ? `<p class="frase">Próximo resultado: veja o <a href="${esc(n.calendario_cvm.link)}" target="_blank" rel="noopener">calendário de eventos corporativos</a> entregue à CVM em ${dataBR(n.calendario_cvm.data)}.</p>` : `<p class="sub">Data do próximo resultado não disponível.</p>`);
  return `${prox}<div class="grade g2">
  <div><h3>Imprensa <span class="badge cinza">${(n.noticias || []).length}</span></h3><p class="sub">A imprensa interpreta. Google News, últimas 15.</p>
  ${(n.noticias || []).map((x) => `<div class="noticia"><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.titulo)}</a>${novo(x.data)}<div class="meta">${esc(x.veiculo)} | ${x.data ? new Date(x.data).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "n/d"}${x.lingua === "en" ? " | em inglês" : ""}</div></div>`).join("") || '<p class="vazio">Sem notícias.</p>'}</div>
  <div><h3>Comunicados oficiais <span class="badge cinza">${(n.comunicados || []).length}</span></h3><p class="sub">O comunicado é a fonte. ${A(t).tipo === "ACAO_BR" ? "CVM (IPE): fatos relevantes, comunicados, resultados." : "SEC EDGAR: 8-K, 10-Q, 10-K, 6-K, 20-F."}</p>
  ${(n.comunicados || []).slice(0, 15).map((x) => `<div class="noticia"><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.titulo)}</a>${novo(x.data)}<div class="meta">${esc(x.categoria)} | ${dataBR(x.data)} | ${esc(x.fonte)}</div></div>`).join("") || '<p class="vazio">Sem comunicados.</p>'}</div>
  </div><p class="sub">Atualizado em ${n.atualizado_em ? new Date(n.atualizado_em).toLocaleString("pt-BR") : "n/d"}.</p>`;
}
function blocoOppRisco(t) {
  const o = oportunidades(t), r = riscos(t), n = D.notes[t] || {};
  return `<h4>Automáticas</h4>
  ${o.length ? `<ul class="lista-simples">${o.map((x) => `<li class="pos">${x.txt}</li>`).join("")}</ul>` : '<p class="vazio">Nenhuma regra de oportunidade atendida.</p>'}
  ${r.length ? `<ul class="lista-simples">${r.map((x) => `<li class="neg">${x.grave ? "<b>" : ""}${x.txt}${x.grave ? "</b>" : ""}</li>`).join("")}</ul>` : '<p class="vazio">Nenhum alerta de risco.</p>'}
  <h4>Minhas notas</h4>
  ${(n.oportunidades || []).length ? `<p class="sub">Oportunidades</p><ul class="lista-simples">${n.oportunidades.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  ${(n.riscos || []).length ? `<p class="sub">Riscos</p><ul class="lista-simples">${n.riscos.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  ${!(n.oportunidades || []).length && !(n.riscos || []).length ? '<p class="vazio">Sem notas em data/notes.json.</p>' : ""}
  ${(D.fund[t].avisos || []).length ? `<h4>Avisos do pipeline</h4><ul class="lista-simples">${D.fund[t].avisos.map((x) => `<li class="sub">${esc(x)}</li>`).join("")}</ul>` : ""}`;
}
function pares(t, n = 5) {
  const st = D.fund[t].setor || {};
  let ps = (st.pares_micro || []).filter((x) => x !== t && D.fund[x]);
  if (ps.length < 2) ps = [...new Set([...ps, ...(st.grupo_membros || []).filter((x) => x !== t && D.fund[x])])];
  return ps.slice(0, n);
}
function blocoRelacionadas(t) {
  const ps = pares(t);
  if (!ps.length) return '<p class="vazio">Sem pares no universo.</p>';
  const cols = isFin(t) ? ["ticker", "pl", "pvp", "roe", "dy", "tir_implicita", "score"] : ["ticker", "pl", "ev_ebitda", "roic", "margem_liquida", "divliq_ebitda", "tir_implicita", "score"];
  return tabela([t, ...ps], cols) + `<div class="espaco"></div><button class="btn prim btn-comparar" data-t="${[t, ...ps].join(",")}">Comparar com estes</button>
  <p class="sub">${(D.fund[t].setor || {}).pares_micro && D.fund[t].setor.pares_micro.length > 2 ? "Pares do mesmo setor micro." : "Poucos pares no setor micro: incluídos ativos do grupo de comparação."}</p>`;
}
function cor(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function optGraf({ stacked = false, eixo2 = false } = {}) {
  const c = cor("--txt-2"), g = cor("--borda");
  const o = { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { color: c, boxWidth: 12 } } },
    scales: { x: { stacked, ticks: { color: c, maxTicksLimit: 10, autoSkip: true }, grid: { color: g } }, y: { stacked, ticks: { color: c }, grid: { color: g } } } };
  if (eixo2) o.scales.y2 = { position: "right", ticks: { color: c }, grid: { display: false } };
  return o;
}
function graficoPreco(t, h, anos) {
  const el = $("#g-preco");
  if (!el || !window.Chart) { if (el) el.parentNode.innerHTML = '<p class="vazio">Gráficos indisponíveis (Chart.js não carregou).</p>'; return; }
  const corte = new Date(); corte.setFullYear(corte.getFullYear() - anos);
  const serie = (anos === 1 ? h.precos.diario : h.precos.semanal).filter(([d]) => new Date(d) >= corte);
  charts = charts.filter((c) => { if (c.canvas === el) { c.destroy(); return false; } return true; });
  charts.push(new Chart(el, { type: "line", data: { labels: serie.map(([d]) => dataBR(d)), datasets: [{ label: `${t} (R$)`, data: serie.map(([, v]) => v), borderColor: cor("--acento"), borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0 }] }, options: optGraf() }));
}
function graficoLucro(t, h) {
  const el = $("#g-lucro");
  if (!el || !window.Chart) return;
  const anos = Object.keys(h.anual || {}).sort();
  const div = moedaDe(t) === "US$" ? 1e9 : 1e9;
  charts.push(new Chart(el, { data: { labels: anos, datasets: [
    { type: "bar", label: `Lucro líquido (${moedaDe(t)} bi)`, data: anos.map((y) => ok(h.anual[y].lucro_liq) ? h.anual[y].lucro_liq / div : null), backgroundColor: anos.map((y) => (h.anual[y].lucro_liq || 0) >= 0 ? cor("--acento") : cor("--neg")), yAxisID: "y" },
    { type: "line", label: `Preço no fim do exercício (${moedaDe(t)})`, data: anos.map((y) => h.anual[y].preco_fim), borderColor: cor("--alerta"), pointRadius: 2, yAxisID: "y2" },
  ] }, options: optGraf({ eixo2: true }) }));
}

/* =====================================================================
   COMPARADOR
   ===================================================================== */
function pgComparar(app, q) {
  let sel = (q.get("t") || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => D.fund[x]);
  const setor = q.get("setor");
  if (setor) sel = D.univ.filter((a) => a.setor_micro === setor || a.setor_macro === setor).map((a) => a.ticker);
  sel = [...new Set(sel)].slice(0, 8);
  const setoresMacro = [...new Set(D.univ.map((a) => a.setor_macro))], setoresMicro = [...new Set(D.univ.map((a) => a.setor_micro))];
  const atualizar = (lista, s) => { location.hash = s ? `#/comparar?setor=${encodeURIComponent(s)}` : `#/comparar?t=${lista.join(",")}`; };
  app.innerHTML = `<h1>Comparador</h1><p class="sub">Escolha de 2 a 8 ativos ou carregue um setor inteiro. O endereço da página guarda a seleção para compartilhar.</p>
  <div class="cartao"><div class="linha">
    <div class="chips">${sel.map((t) => `<button class="chip ativo" data-rm="${t}">${t}<span class="x">✕</span></button>`).join("") || '<span class="muted">Nenhum ativo selecionado.</span>'}</div>
    <select id="cmp-add"><option value="">Adicionar ativo...</option>${D.univ.filter((a) => !sel.includes(a.ticker)).map((a) => `<option value="${a.ticker}">${a.ticker} | ${esc(a.nome)}</option>`).join("")}</select>
    <select id="cmp-setor"><option value="">Carregar setor...</option><optgroup label="Setor macro">${setoresMacro.map((s) => `<option>${esc(s)}</option>`).join("")}</optgroup><optgroup label="Setor micro">${setoresMicro.map((s) => `<option>${esc(s)}</option>`).join("")}</optgroup></select>
    ${sel.length ? '<button class="btn peq" id="cmp-limpar">Limpar</button>' : ""}
  </div></div><div id="cmp-saida"></div>`;
  $$("[data-rm]").forEach((b) => b.onclick = () => atualizar(sel.filter((x) => x !== b.dataset.rm)));
  $("#cmp-add").onchange = (e) => { if (e.target.value && sel.length < 8) atualizar([...sel, e.target.value]); };
  $("#cmp-setor").onchange = (e) => e.target.value && atualizar(null, e.target.value);
  if ($("#cmp-limpar")) $("#cmp-limpar").onclick = () => atualizar([]);
  if (sel.length < 2) { $("#cmp-saida").innerHTML = '<p class="vazio">Selecione pelo menos 2 ativos.</p>'; return; }

  const grupos = ["TIR", "Valuation", "Endividamento", "Eficiência", "Rentabilidade", "Crescimento", "Caixa", "Proventos", "Governança", "Tamanho", "Banco", "Seguradora", "Holding", "Cripto", "BDR"];
  const im = D.imeta.indicadores;
  let corpo = `<tr class="grupo-linha"><td colspan="${sel.length + 1}">Resumo</td></tr>` +
    ["score", "setor_micro", "tipo", "porte", "preco", "var_12m", "valor_mercado_brl"].map((k) => linhaCmp(k, sel)).join("");
  for (const g of grupos) {
    const ks = Object.keys(im).filter((k) => im[k].grupo === g && !["preco", "valor_mercado"].includes(k)).filter((k) => sel.some((t) => ok(val(t, k))));
    if (!ks.length) continue;
    corpo += `<tr class="grupo-linha"><td colspan="${sel.length + 1}">${esc(g)}</td></tr>` + ks.map((k) => linhaCmp(k, sel)).join("");
  }
  const melhorScore = sel.filter((t) => ok(SC[t].score)).sort((a, b) => SC[b].score - SC[a].score)[0];
  const melhorTir = sel.filter((t) => !semValuation(t) && ok(ind(t).tir_implicita)).sort((a, b) => ind(b).tir_implicita - ind(a).tir_implicita)[0];
  $("#cmp-saida").innerHTML = `<div class="grade g2">
    <div class="cartao"><h2>Conclusão</h2>
      <p><b>Melhor no conjunto (score):</b> ${melhorScore ? `${linkAtivo(melhorScore)} com ${nf0.format(SC[melhorScore].score)}/100` : "n/d"}</p>${melhorScore ? decomposicao(melhorScore) : ""}
      <p><b>Maior TIR implícita ao preço de hoje:</b> ${melhorTir ? `${linkAtivo(melhorTir)} com ${fmt(melhorTir, "tir_implicita")}` : "n/d"}</p>
      ${melhorScore && melhorTir && melhorScore !== melhorTir ? '<p class="sub">São empresas diferentes: o score mede o conjunto (qualidade, solidez, crescimento, proventos e preço), a TIR mede só o retorno embutido no preço.</p>' : ""}
      <p class="sub">Atenção: scores são calculados dentro do grupo de cada ativo; compare com cuidado ativos de setores diferentes.</p>
    </div>
    <div class="cartao"><h2>Radar dos 5 fatores</h2><div class="grafico"><canvas id="g-radar"></canvas></div></div>
  </div>
  <div class="cartao"><h2>Concentração de cenário da seleção</h2>${concHtml(sel)}</div>
  <div class="cartao"><h2>Todos os indicadores</h2><p class="sub">Verde = melhor e vermelho = pior em cada linha, respeitando a direção do indicador (menor é melhor em P/L e endividamento; maior é melhor em ROE e margens).</p>
  <div class="tabela-wrap comparador"><table><thead><tr><th>Indicador</th>${sel.map((t) => `<th class="n">${linkAtivo(t)}</th>`).join("")}</tr></thead><tbody>${corpo}</tbody></table></div></div>`;
  if (window.Chart) {
    const paleta = ["--acento", "--pos", "--alerta", "--neg", "--txt-2", "--txt-3"].map(cor);
    const extras = ["#7b5cc4", "#2a9d8f"];
    const cores = [...paleta, ...extras];
    charts.push(new Chart($("#g-radar"), { type: "radar", data: { labels: Object.values(FATOR_NOME), datasets: sel.map((t, i) => ({ label: t, data: Object.keys(FATOR_NOME).map((f) => SC[t].fatores[f]), borderColor: cores[i % cores.length], backgroundColor: "transparent", pointRadius: 2 })) },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: cor("--txt-2") } } }, scales: { r: { min: 0, max: 100, ticks: { display: false }, grid: { color: cor("--borda") }, angleLines: { color: cor("--borda") }, pointLabels: { color: cor("--txt-2") } } } } }));
  }
}
function linhaCmp(k, sel) {
  const m = meta(k), dir = m.direcao || 0;
  const vs = sel.map((t) => val(t, k));
  const nums = vs.filter(ok);
  let best = null, worst = null;
  if (dir && nums.length >= 2 && m.unidade !== "txt") {
    best = dir > 0 ? Math.max(...nums) : Math.min(...nums);
    worst = dir > 0 ? Math.min(...nums) : Math.max(...nums);
    if (best === worst) best = worst = null;
  }
  return `<tr><td>${esc(m.nome)}${tip(k)}</td>${sel.map((t, i) => {
    const v = vs[i];
    const cls = ok(v) && v === best ? "melhor" : ok(v) && v === worst ? "pior" : "";
    const txt = k === "preco" ? (ok(v) ? "R$ " + nf2.format(v) : "n/d") : k.startsWith("var_") ? varHtml(v) : m.unidade === "txt" ? esc(v || "n/d") : fmt(t, k, v);
    return `<td class="n ${cls}">${txt}</td>`;
  }).join("")}</tr>`;
}

/* =====================================================================
   FILTROS (SCREENER)
   ===================================================================== */
function pgFiltros(app) {
  const s = EST.scr;
  const macros = [...new Set(D.univ.map((a) => a.setor_macro))], micros = [...new Set(D.univ.map((a) => a.setor_micro))];
  const indicadoresNum = Object.keys(D.imeta.indicadores).filter((k) => !["txt"].includes(meta(k).unidade));
  const favs = lsGet("filtros_favoritos", {});
  app.innerHTML = `<h1>Filtros</h1><p class="sub">Combine os filtros. O resultado atualiza na hora e pode ser exportado em CSV.</p>
  <div class="cartao">
    ${chipsSeg(s.seg, "scr-seg")}<div class="espaco"></div>
    <div class="grade g4">
      <label class="campo">Setor macro<select id="f-macro"><option value="">Todos</option>${macros.map((x) => `<option ${s.macro === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="campo">Setor micro<select id="f-micro"><option value="">Todos</option>${micros.map((x) => `<option ${s.micro === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="campo">Porte<select id="f-porte"><option value="">Todos</option>${["Large cap", "Mid cap", "Small cap", "Micro cap"].map((x) => `<option ${s.porte === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label class="campo">TIR implícita mínima (%)<input type="number" id="f-tir" step="0.5" value="${esc(s.tirMin)}"></label>
      <label class="campo">Liquidez mínima diária (R$ mi)<input type="number" id="f-liq" step="1" value="${esc(s.liqMin)}"></label>
      <label class="campo">Sensibilidade a cenário<select id="f-cen"><option value="">Nenhum</option>${Object.entries(CENARIOS).map(([k, c]) => `<option value="${k}" ${s.cenario === k ? "selected" : ""}>${c.nome}</option>`).join("")}</select></label>
      <label class="campo">Sensibilidade mínima<select id="f-cenmin">${[2, 1, 0, -1].map((v) => `<option value="${v}" ${+s.cenMin === v ? "selected" : ""}>${v > 0 ? "+" : ""}${v}</option>`).join("")}</select></label>
      <label class="campo" style="justify-content:flex-end"><span><input type="checkbox" id="f-dist" ${s.semDistressed ? "checked" : ""}> Esconder DISTRESSED</span></label>
    </div>
    <h3 style="margin-top:1rem">Faixas de indicadores</h3>
    <div id="f-faixas"></div>
    <div class="linha"><select id="f-novo"><option value="">Adicionar faixa de indicador...</option>${indicadoresNum.map((k) => `<option value="${k}">${esc(meta(k).nome)}</option>`).join("")}</select></div>
    <div class="espaco"></div>
    <div class="linha entre"><div class="linha">
      <select id="f-favs"><option value="">Filtros salvos...</option>${Object.keys(favs).map((n) => `<option>${esc(n)}</option>`).join("")}</select>
      <button class="btn peq" id="f-salvar">Salvar filtro</button><button class="btn peq" id="f-apagar">Apagar salvo</button><button class="btn peq" id="f-limpar">Limpar</button></div>
      <button class="btn prim" id="f-csv">Exportar CSV</button></div>
  </div>
  <div class="cartao"><div class="linha entre"><h2 id="f-qtd"></h2></div><div id="f-res"></div></div>`;
  const faixas = () => {
    $("#f-faixas").innerHTML = EST.scrFiltros.map((f, i) => {
      const vs = D.univ.map((a) => val(a.ticker, f.k)).filter(ok);
      const mn = vs.length ? Math.min(...vs) : 0, mx = vs.length ? Math.max(...vs) : 1, passo = (mx - mn) / 100 || 0.01;
      if (f.min === null || f.min === undefined) f.min = mn;
      if (f.max === null || f.max === undefined) f.max = mx;
      return `<div class="filtro-linha"><div><b>${esc(meta(f.k).nome)}</b><div class="sub">${fmtU(f.min, meta(f.k).unidade)} a ${fmtU(f.max, meta(f.k).unidade)}</div></div>
      <label class="campo">mín.<input type="range" min="${mn}" max="${mx}" step="${passo}" value="${f.min}" data-i="${i}" data-l="min"></label>
      <label class="campo">máx.<input type="range" min="${mn}" max="${mx}" step="${passo}" value="${f.max}" data-i="${i}" data-l="max"></label>
      <button class="btn peq" data-del="${i}">Remover</button></div>`;
    }).join("");
    $$("#f-faixas input[type=range]").forEach((r) => r.oninput = (e) => { EST.scrFiltros[+e.target.dataset.i][e.target.dataset.l] = +e.target.value; faixas(); aplicar(); });
    $$("#f-faixas [data-del]").forEach((b) => b.onclick = () => { EST.scrFiltros.splice(+b.dataset.del, 1); faixas(); aplicar(); });
  };
  const resultado = () => {
    let l = filtroSeg(D.univ.map((a) => a.ticker), s.seg);
    if (s.macro) l = l.filter((t) => A(t).setor_macro === s.macro);
    if (s.micro) l = l.filter((t) => A(t).setor_micro === s.micro);
    if (s.porte) l = l.filter((t) => val(t, "porte") === s.porte);
    if (s.tirMin !== "" && s.tirMin !== null) l = l.filter((t) => ok(ind(t).tir_implicita) && ind(t).tir_implicita * 100 >= +s.tirMin);
    if (s.liqMin !== "" && s.liqMin !== null) l = l.filter((t) => ok((D.prices[t] || {}).liquidez_21) && D.prices[t].liquidez_21 >= +s.liqMin * 1e6);
    if (s.semDistressed) l = l.filter((t) => !isDist(t));
    if (s.cenario) l = l.filter((t) => ((A(t).sensibilidade || {})[s.cenario] ?? 0) >= +s.cenMin);
    for (const f of EST.scrFiltros) l = l.filter((t) => { const v = val(t, f.k); return ok(v) && v >= f.min - 1e-12 && v <= f.max + 1e-12; });
    return ordenar(l, "score", -1);
  };
  const colunas = () => [...new Set(["ticker", "nome", "setor_micro", "preco", ...EST.scrFiltros.map((f) => f.k), "tir_implicita", "pl", "dy", "score"])];
  const aplicar = () => {
    const l = resultado();
    $("#f-qtd").textContent = `${l.length} ativo${l.length === 1 ? "" : "s"}`;
    $("#f-res").innerHTML = tabela(l, colunas());
  };
  const ler = () => { Object.assign(s, { macro: $("#f-macro").value, micro: $("#f-micro").value, porte: $("#f-porte").value, tirMin: $("#f-tir").value, liqMin: $("#f-liq").value,
    cenario: $("#f-cen").value, cenMin: +$("#f-cenmin").value, semDistressed: $("#f-dist").checked }); aplicar(); };
  $$("#scr-seg .chip").forEach((c) => c.onclick = () => { s.seg = c.dataset.seg; $$("#scr-seg .chip").forEach((x) => x.classList.toggle("ativo", x === c)); aplicar(); });
  ["#f-macro", "#f-micro", "#f-porte", "#f-tir", "#f-liq", "#f-cen", "#f-cenmin", "#f-dist"].forEach((id) => { $(id).onchange = ler; $(id).oninput = ler; });
  $("#f-novo").onchange = (e) => { if (e.target.value) { EST.scrFiltros.push({ k: e.target.value, min: null, max: null }); e.target.value = ""; faixas(); aplicar(); } };
  $("#f-salvar").onclick = () => { const nome = prompt("Nome do filtro:"); if (!nome) return; const fv = lsGet("filtros_favoritos", {}); fv[nome] = { scr: { ...s }, faixas: EST.scrFiltros }; lsSet("filtros_favoritos", fv); pgFiltros(app); };
  $("#f-favs").onchange = (e) => { const fv = lsGet("filtros_favoritos", {})[e.target.value]; if (fv) { Object.assign(EST.scr, fv.scr); EST.scrFiltros = fv.faixas || []; pgFiltros(app); } };
  $("#f-apagar").onclick = () => { const n = $("#f-favs").value; if (!n) return; const fv = lsGet("filtros_favoritos", {}); delete fv[n]; lsSet("filtros_favoritos", fv); pgFiltros(app); };
  $("#f-limpar").onclick = () => { EST.scr = { seg: "TUDO", macro: "", micro: "", porte: "", tirMin: "", liqMin: "", semDistressed: false, cenario: "", cenMin: 1 }; EST.scrFiltros = []; pgFiltros(app); };
  $("#f-csv").onclick = () => exportarCSV(resultado(), colunas());
  faixas(); aplicar();
}
function exportarCSV(lista, colunas) {
  const n4 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6, useGrouping: false });
  const linhas = [colunas.map((k) => meta(k).nome).join(";")];
  for (const t of lista) linhas.push(colunas.map((k) => { const v = val(t, k); return ok(v) ? n4.format(v) : (v === null || v === undefined ? "" : `"${String(v).replace(/"/g, '""')}"`); }).join(";"));
  const blob = new Blob(["﻿" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `filtro_${D.meta.data_fechamento || "dados"}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* =====================================================================
   METODOLOGIA
   ===================================================================== */
function pgMetodologia(app) {
  const im = D.imeta.indicadores, mac = D.macro || {};
  const grupos = {};
  for (const [k, m] of Object.entries(im)) (grupos[m.grupo] = grupos[m.grupo] || []).push([k, m]);
  const pesos = Object.entries(CONFIG.PESOS).map(([f, p]) => `${FATOR_NOME[f]} ${nf0.format(p * 100)}%`).join(", ");
  app.innerHTML = `<h1>Metodologia</h1>
  <div class="cartao"><h2>Datas e bases</h2>
  <p>Todos os indicadores usam o <b>preço de fechamento do último pregão</b> (${dataBR(D.meta.data_fechamento)}) e dados contábeis <b>LTM</b>, os últimos 12 meses: último exercício anual + acumulado do ano corrente - mesmo acumulado do ano anterior. Saldos de balanço são os do último trimestre (${esc(D.meta.balancos_ate || "n/d")}). Se o pipeline roda antes das 18h30, o pregão do dia é ignorado por ainda não ter fechado.</p>
  <p>Valor de mercado soma todas as classes de ações (ON e PN) pelo preço de cada uma, sem ações em tesouraria. Em units, os indicadores por ação são multiplicados pelo número de ações da unit. Em BDRs os fundamentos ficam em dólar e usam o preço do papel no exterior.</p>
  <p>Bancos e seguradoras não têm dívida líquida, EBITDA nem fluxo de caixa livre no sentido usual. Para eles os múltiplos principais são P/L e P/VP e a TIR usa a fórmula de ROE.</p></div>
  <div class="cartao"><h2>As três TIRs implícitas e o crescimento implícito</h2>
  <p><b>TIR é o retorno anual que o preço de hoje embute</b>, supondo que a empresa siga gerando o que gera hoje e cresça a uma taxa g de longo prazo. g = inflação de longo prazo (${fmtU((mac.inflacao_lp_brasil || {}).valor, "pct")} no Brasil, pelo Focus; ${fmtU((mac.inflacao_lp_eua || {}).valor, "pct")} nos EUA) + crescimento real do setor (config.json).</p>
  <ol class="lista-simples">
    <li><b>Por lucro:</b> lucro médio de 3 exercícios / valor de mercado + g. É o "rendimento do lucro" somado ao crescimento.</li>
    <li><b>Por caixa:</b> mesmo raciocínio com o fluxo de caixa livre (FCO - capex) médio de 3 exercícios.</li>
    <li><b>Por DCF reverso:</b> projeta 5 anos de FCL (receita crescendo ao CAGR de 5 anos, limitado entre ${fmtU(D.config.dcf_piso_crescimento, "pct")} e ${fmtU(D.config.dcf_teto_crescimento, "pct")}, vezes a margem FCL média de 5 anos), depois uma perpetuidade com g. A taxa que faz o valor presente igualar o valor da firma é achada por bisseção.</li>
    <li><b>Bancos e seguradoras:</b> TIR = ROE sustentável x (1 - payout) + payout x ROE / (P/VP). A parte retida cresce ao ROE e a parte distribuída rende o dividend yield sobre o preço.</li>
  </ol>
  <p>A TIR principal é a mediana das versões disponíveis (bancos e seguradoras: a fórmula de ROE). A coluna "TIR - título de referência" mostra a diferença para a NTN-B longa nominal (${fmtU(mac.ntnb_nominal, "pct")}) ou para a Treasury 10y (${fmtU((mac.treasury_10y || {}).taxa, "pct")}). É só informativa e não ordena o site.</p>
  <p><b>Crescimento implícito</b> é a conta inversa: dada uma taxa de desconto de referência (Brasil: NTN-B longa real ${fmtU((mac.ntnb_longa || {}).taxa, "pct")} convertida para nominal + 5% = ${fmtU(mac.taxa_ref_brasil, "pct")}; exterior: Treasury 10y + 5% = ${fmtU(mac.taxa_ref_exterior, "pct")}), qual crescimento perpétuo o preço exige. Fórmula de Gordon: g = (r x EV - FCL) / (EV + FCL). Para bancos: g = (r x P/VP - ROE) / (P/VP - 1). Se o crescimento implícito estiver muito acima do histórico, o preço exige um futuro que a empresa nunca entregou.</p></div>
  <div class="cartao"><h2>Score composto</h2>
  <p>Cada indicador de um fator vira um z-score dentro do grupo de comparação: (valor - média do grupo) / desvio padrão, com o sinal invertido quando menor é melhor, limitado a ±3. O fator é a média dos z-scores; o score é a soma ponderada dos fatores (${pesos}), convertida para 0 a 100 pela distribuição normal (50 = na média do grupo). Pesos no topo de assets/app.js.</p>
  <p>O grupo de comparação é o setor micro quando ele tem pelo menos ${D.config.grupo_minimo_pares || 3} ativos; senão sobe para o setor macro; senão usa a família (financeiras ou não financeiras). Empresas DISTRESSED nunca recebem nota positiva em valuation.</p>
  <ul class="lista-simples">${Object.entries(D.imeta.fatores).map(([f, ks]) => `<li><b>${FATOR_NOME[f]}:</b> ${ks.map((k) => esc(meta(k).nome)).join(", ")}</li>`).join("")}</ul></div>
  <div class="cartao"><h2>Todos os indicadores</h2>${Object.entries(grupos).map(([g, ks]) => `<h3>${esc(g)}</h3><div class="tabela-wrap"><table><thead><tr><th>Indicador</th><th>Fórmula</th><th>Melhor quando</th></tr></thead><tbody>${ks.map(([k, m]) =>
    `<tr><td><b>${esc(m.nome)}</b></td><td style="white-space:normal">${esc(m.formula)}</td><td>${m.direcao > 0 ? "maior" : m.direcao < 0 ? "menor" : "neutro"}</td></tr>`).join("")}</tbody></table></div><div class="espaco"></div>`).join("")}</div>
  <div class="cartao"><h2>Fontes</h2><ul class="lista-simples">${(D.meta.fontes || []).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
  <p class="sub">Dados gerados em ${D.meta.gerado_em ? new Date(D.meta.gerado_em).toLocaleString("pt-BR") : "n/d"}. Dado ausente aparece como n/d; o relatório relatorios/cobertura.md lista cada lacuna e o motivo.</p></div>`;
}

/* =====================================================================
   CABEÇALHO, BUSCA, TEMA, TOOLTIP, RODAPÉ
   ===================================================================== */
function cabecalho() {
  const m = D.macro || {};
  $("#datas").textContent = `Preços de fechamento de ${dataBR(D.meta.data_fechamento)} | Balanços até o ${D.meta.balancos_ate || "n/d"}`;
  const it = (rot, v) => `<span>${rot} <b>${v}</b></span>`;
  $("#macro").innerHTML = [
    it("Ibovespa", m.ibovespa ? nf0.format(m.ibovespa.valor) + " " + varHtml(m.ibovespa.var_dia) : "n/d"),
    it("S&P 500", m.sp500 ? nf0.format(m.sp500.valor) + " " + varHtml(m.sp500.var_dia) : "n/d"),
    it("Selic", m.selic ? fmtU(m.selic.valor, "pct") : "n/d"),
    it("IPCA 12m", m.ipca_12m ? fmtU(m.ipca_12m.valor, "pct") : "n/d"),
    it("NTN-B longa", m.ntnb_longa ? fmtU(m.ntnb_longa.taxa, "pct") : "n/d"),
    it("PTAX", m.ptax ? new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4 }).format(m.ptax.valor) : "n/d"),
    it("Treasury 10y", m.treasury_10y ? fmtU(m.treasury_10y.taxa, "pct") : "n/d"),
  ].join("");
  $("#rodape").innerHTML = `<p>Dados atualizados em ${D.meta.gerado_em ? new Date(D.meta.gerado_em).toLocaleString("pt-BR") : "n/d"}. Preços de ${dataBR(D.meta.data_fechamento)}; balanços até o ${esc(D.meta.balancos_ate || "n/d")}.</p>
  <p>Fontes: ${(D.meta.fontes || []).map(esc).join("; ")}.</p>
  <p>Conteúdo de caráter educacional e informativo. Não constitui recomendação de compra ou venda de valores mobiliários nem relatório de análise nos termos da Resolução CVM 20. Rentabilidade passada não garante rentabilidade futura.</p>`;
}
function busca() {
  const inp = $("#busca"), lista = $("#busca-lista");
  let sel = 0;
  const achar = () => { const q = inp.value.trim().toLowerCase(); return q ? D.univ.filter((a) => a.ticker.toLowerCase().includes(q) || a.nome.toLowerCase().includes(q)).slice(0, 8) : []; };
  const desenhar = () => { const r = achar(); lista.hidden = !r.length; lista.innerHTML = r.map((a, i) => `<a href="#/ativo/${a.ticker}" class="${i === sel ? "sel" : ""}"><b class="mono">${a.ticker}</b><span class="sub">${esc(a.nome)}</span></a>`).join(""); };
  inp.oninput = () => { sel = 0; desenhar(); };
  inp.onkeydown = (e) => {
    const r = achar();
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, r.length - 1); desenhar(); e.preventDefault(); }
    if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); desenhar(); e.preventDefault(); }
    if (e.key === "Enter" && r[sel]) { location.hash = `#/ativo/${r[sel].ticker}`; inp.value = ""; lista.hidden = true; }
    if (e.key === "Escape") { lista.hidden = true; }
  };
  lista.onclick = () => { inp.value = ""; lista.hidden = true; };
  document.addEventListener("click", (e) => { if (!e.target.closest(".busca")) lista.hidden = true; });
}
function tema() {
  $("#tema").onclick = () => {
    const atual = document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const novo = atual === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    try { localStorage.setItem("tema", novo); } catch (e) {}
    render();
  };
  $("#menu-btn").onclick = () => $("#menu").classList.toggle("aberto");
}
function tooltips() {
  const tt = $("#tooltip");
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el || !el.dataset.tip) { tt.hidden = true; return; }
    tt.textContent = el.dataset.tip; tt.hidden = false;
  });
  document.addEventListener("mousemove", (e) => {
    if (tt.hidden) return;
    const w = tt.offsetWidth, h = tt.offsetHeight;
    tt.style.left = Math.min(e.clientX + 12, innerWidth - w - 8) + "px";
    tt.style.top = (e.clientY + 16 + h > innerHeight ? e.clientY - h - 10 : e.clientY + 16) + "px";
  });
}
async function sha256(txt) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
function pedirSenha() {
  return new Promise((res) => {
    try { if (sessionStorage.getItem("liberado") === "1") return res(); } catch (e) {}
    const b = $("#bloqueio"); b.hidden = false; $("#senha").focus();
    $("#form-senha").onsubmit = async (e) => {
      e.preventDefault();
      if ((await sha256($("#senha").value)) === CONFIG.SENHA_SHA256) {
        try { sessionStorage.setItem("liberado", "1"); } catch (er) {}
        b.hidden = true; res();
      } else $("#senha-erro").hidden = false;
    };
  });
}

/* =====================================================================
   INÍCIO
   ===================================================================== */
(async function iniciar() {
  if (CONFIG.MODO_PRIVADO) { document.querySelector(".topo").hidden = true; await pedirSenha(); document.querySelector(".topo").hidden = false; }
  tema(); tooltips(); busca();
  try {
    await carregar();
  } catch (e) {
    $("#app").innerHTML = `<div class="cartao"><h2>Não foi possível carregar os dados</h2><p>${esc(e.message)}</p>
    <p>Rode o pipeline (<span class="mono">rodar_local.bat</span>) e abra o site por um servidor local (http://localhost:8000), não direto pelo arquivo.</p></div>`;
    $("#datas").textContent = "Dados indisponíveis";
    return;
  }
  cabecalho();
  window.addEventListener("hashchange", render);
  render();
})();
