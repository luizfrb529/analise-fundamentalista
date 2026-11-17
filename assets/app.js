"use strict";
/* =====================================================================
   CONFIGURAÇÃO (edite aqui)
   ===================================================================== */
const CONFIG = {
  // true = pede senha antes de mostrar o conteúdo. Proteção simples (site estático): não use para dado sigiloso.
  MODO_PRIVADO: false,
  // SHA-256 da senha (padrão: trocar-senha). Para gerar: python -c "import hashlib;print(hashlib.sha256(b'SUA_SENHA').hexdigest())"
  SENHA_SHA256: "7602b08c32dd3c35d59593cc17cbd28dd80aa1da77558496207d0c69ded5dc36",

  // colunas da tabela da visão geral ("empresa" é fixa)
  COLUNAS_PADRAO: ["setor_micro", "preco", "pl", "pvp", "ev_ebitda", "dy", "roe", "roic", "margem_liquida", "divliq_ebitda", "tir_implicita", "piotroski"],
  NOVO_HORAS: 48,
  // limites dos pontos de atenção na página do ativo
  RISCOS: { divliq_ebitda_max: 3, cobertura_juros_min: 2, fcl_negativo_anos: 2, payout_max: 1, diluicao_3a_max: 0.10,
    armadilha_pl_max: 8, gap_crescimento_max: 0.05, bdr_agio_max: 0.05, liquidez_min: 5e6 },
  FORTALEZAS: { piotroski_min: 7, roe_min: 0.15, roic_min: 0.12, divliq_ebitda_max: 1, anos_pagando_min: 8, bdr_desagio_min: 0.03 },
};

const CENARIOS = {
  selic_caindo: { nome: "Selic caindo", txt: "os juros caem" },
  dolar_subindo: { nome: "Dólar subindo", txt: "o dólar sobe" },
  commodities_subindo: { nome: "Commodities subindo", txt: "as commodities sobem" },
  pib_acelerando: { nome: "PIB acelerando", txt: "a economia acelera" },
  inflacao_subindo: { nome: "Inflação subindo", txt: "a inflação sobe" },
  risco_fiscal_subindo: { nome: "Risco fiscal subindo", txt: "o risco fiscal aumenta" },
};
const SEGMENTOS = { TUDO: "Todos", ACAO_BR: "Ações Brasil", BDR_EXPOSICAO_BR: "BDRs com risco Brasil", BDR_EXTERIOR: "BDRs exterior" };
const TIPO_CURTO = { ACAO_BR: "Ação Brasil", BDR_EXPOSICAO_BR: "BDR risco Brasil", BDR_EXTERIOR: "BDR exterior" };
const SEGMENTO_B3 = { NM: "Novo Mercado", N1: "Nível 1", N2: "Nível 2", MA: "Bovespa Mais", M2: "Bovespa Mais Nível 2", BOLSA: "Tradicional", DR3: "BDR Nível III" };
const MODELO_NOME = { GERAL: null, BANCO: "Banco", SEGURADORA: "Seguradora", HOLDING: "Holding", TESOURARIA_CRIPTO: "Tesouraria em bitcoin", RECUPERACAO: "Em recuperação" };
const NAO_FIN = new Set(["divida_bruta", "divida_liquida", "ev", "p_ebitda", "p_ebit", "psr", "p_capital_giro", "p_acl", "ev_ebitda", "ev_ebit",
  "ev_receita", "earnings_yield", "fcf_yield", "divliq_pl", "divliq_ebitda", "divliq_ebit", "liquidez_corrente", "liquidez_seca",
  "liquidez_imediata", "cobertura_juros", "divida_cp_pct", "margem_bruta", "margem_ebitda", "margem_ebit", "giro_ativo", "pmr", "pme",
  "pmp", "ciclo_financeiro", "roic", "roic_spread", "fco", "capex", "fcl", "ebitda", "capex_depreciacao", "conversao_caixa",
  "dividendos_sobre_fcl", "tir_caixa", "tir_dcf", "evebitda_vs_media5", "cagr_ebitda_5a", "cagr_ebitda_10a", "piotroski"]);
const ROT_CURTO = {
  empresa: "Empresa", setor_micro: "Setor", setor_macro: "Setor macro", porte: "Porte", preco: "Preço", var_12m: "12 meses",
  var_ano: "No ano", valor_mercado_brl: "Valor de mercado", tir_implicita: "TIR implícita", divliq_ebitda: "Dív. líq./EBITDA",
  margem_liquida: "Margem líq.", cagr_lucro_5a: "Cresc. lucro 5a", ev_ebitda: "EV/EBITDA", dy: "DY", pl: "P/L", pvp: "P/VP",
  roe: "ROE", roic: "ROIC", piotroski: "Piotroski", tipo: "Tipo",
};
const EXTRA_META = {
  empresa: { nome: "Empresa", unidade: "txt" }, nome: { nome: "Nome", unidade: "txt" }, setor_micro: { nome: "Setor", unidade: "txt" },
  setor_macro: { nome: "Setor macro", unidade: "txt" }, porte: { nome: "Porte", unidade: "txt" }, tipo: { nome: "Tipo", unidade: "txt" },
  var_ano: { nome: "Variação no ano", unidade: "pct", direcao: 1, grupo: "Preço" }, var_12m: { nome: "Variação em 12 meses", unidade: "pct", direcao: 1, grupo: "Preço" },
  var_5a: { nome: "Variação em 5 anos", unidade: "pct", direcao: 1, grupo: "Preço" },
  valor_mercado_brl: { nome: "Valor de mercado em R$", unidade: "moeda_grande_brl", direcao: 0, grupo: "Tamanho", formula: "Valor de mercado em reais (BDR: em dólar x PTAX)." },
};

/* =====================================================================
   ESTADO E UTILITÁRIOS
   ===================================================================== */
const D = {};
let charts = [];
const EST = { seg: "TUDO", setor: "", busca: "", sort: { k: "valor_mercado_brl", d: -1 }, colunas: null, rkSeg: "TUDO", rkSetor: "", rkAbertos: {},
  scrFiltros: [], scr: { seg: "TUDO", macro: "", micro: "", porte: "", tirMin: "", liqMin: "", pioMin: "", semRec: true, cenario: "", cenMin: 1 } };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ok = (v) => typeof v === "number" && isFinite(v);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } };
const NF = (d) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const nf0 = NF(0), nf2 = NF(2);

function dataBR(s) {
  if (!s) return "n/d";
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
function grande(v) {
  const a = Math.abs(v);
  if (a >= 1e12) return nf2.format(v / 1e12) + " tri";
  if (a >= 1e9) return nf2.format(v / 1e9) + " bi";
  if (a >= 1e6) return nf2.format(v / 1e6) + " mi";
  if (a >= 1e3) return nf2.format(v / 1e3) + " mil";
  return nf2.format(v);
}
function meta(k) { return (D.imeta.indicadores[k]) || EXTRA_META[k] || { nome: k, unidade: "x", direcao: 0, formula: "" }; }
function moedaDe(t) { return (D.fund[t] && D.fund[t].moeda === "USD") ? "US$" : "R$"; }
const ND = '<span class="muted">n/d</span>';
function fmtU(v, u, moeda = "R$") {
  if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return ND;
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "string") return esc(v);
  switch (u) {
    case "pct": return nf2.format(v * 100) + "%";
    case "pct_int": return nf2.format(v) + "%";
    case "x": return nf2.format(v) + "x";
    case "moeda": return moeda + " " + nf2.format(v);
    case "moeda_brl": return "R$ " + nf2.format(v);
    case "moeda_grande": return moeda + " " + grande(v);
    case "moeda_grande_brl": return "R$ " + grande(v);
    case "dias": return nf0.format(v) + " dias";
    case "anos": case "int": return nf0.format(v);
    case "num": return grande(v);
    case "num_btc": return (Math.abs(v) >= 1 ? nf2.format(v) : new Intl.NumberFormat("pt-BR", { maximumSignificantDigits: 4 }).format(v)) + " BTC";
    default: return nf2.format(v);
  }
}
function fmt(t, k, v) {
  if (v === undefined) v = val(t, k);
  if (k === "piotroski") return pioHtml(v);
  return fmtU(v, meta(k).unidade, moedaDe(t));
}
function pioHtml(v) {
  if (!ok(v)) return ND;
  return `<span class="pio" data-tip="Piotroski F-Score: ${v} de 9 testes de qualidade contábil atendidos."><span class="pio-dots">${Array.from({ length: 9 }, (_, i) => `<i class="${i < v ? "on" : ""}"></i>`).join("")}</span><b>${v}</b></span>`;
}
function A(t) { return D.univMap[t]; }
function isFin(t) { return ["BANCO", "SEGURADORA"].includes(A(t).modelo_analise); }
function isRec(t) { return A(t).modelo_analise === "RECUPERACAO"; }
function isCripto(t) { return A(t).modelo_analise === "TESOURARIA_CRIPTO"; }
function semValuation(t) { return isRec(t) || isCripto(t); }
function recNome(t) { const r = A(t).recuperacao || {}; return r.tipo ? `Em recuperação ${r.tipo.toLowerCase()}` : "Em recuperação"; }
function porPapel(t) { return (D.fund[t] && D.fund[t].acoes_por_papel) || A(t).acoes_por_papel || 1; }
function ind(t) { return (D.fund[t] && D.fund[t].ind) || {}; }
function val(t, k) {
  const a = A(t), p = D.prices[t] || {};
  switch (k) {
    case "ticker": return t;
    case "nome": case "empresa": return a.nome;
    case "setor_micro": return a.setor_micro;
    case "setor_macro": return a.setor_macro;
    case "tipo": return TIPO_CURTO[a.tipo];
    case "porte": return ind(t).porte || null;
    case "preco": case "var_mes": case "var_ano": case "var_12m": case "var_5a": case "max_52s": case "min_52s": return p[k] ?? null;
    default: { const v = ind(t)[k]; return v === undefined ? null : v; }
  }
}
function sinal(v) { return ok(v) ? (v > 0 ? "pos" : v < 0 ? "neg" : "") : ""; }
function varHtml(v) { return ok(v) ? `<span class="${sinal(v)}">${v > 0 ? "+" : ""}${nf2.format(v * 100)}%</span>` : ND; }
function tip(k) { const m = meta(k); return m.formula ? `<i class="info" data-tip="${esc(m.nome + ": " + m.formula)}">i</i>` : ""; }
function iniciais(t) { return t.replace(/\d+$/, "").slice(0, 4); }
function logo(t, cls = "") {
  if (D.logos.has(t)) return `<span class="logo ${cls}"><img src="assets/logos/${t}.svg" alt="" loading="lazy"></span>`;
  return `<span class="logo ini ${cls}">${esc(iniciais(t))}</span>`;
}
function empresa(t, opts = {}) {
  const tag = opts.link === false ? "span" : "a";
  const href = opts.link === false ? "" : ` href="#/ativo/${t}"`;
  return `<${tag} class="empresa"${href}>${logo(t, opts.cls || "")}<span class="nomes"><span class="tk">${t}${isRec(t) && !opts.semBadge ? ' <span class="badge rec">Em recuperação</span>' : ""}</span>${opts.semNome ? "" : `<span class="nm">${esc(A(t).nome)}</span>`}</span></${tag}>`;
}
const mediana = (a) => { const v = a.filter(ok).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
function cor(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

/* =====================================================================
   CARGA
   ===================================================================== */
async function j(url, opcional) {
  try { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  catch (e) { if (opcional !== undefined) return opcional; throw new Error(`Falha ao carregar ${url}: ${e.message}`); }
}
async function carregar() {
  const [meta_, macro, prices, fund, univ, imeta, notes, newsIdx, config, logos] = await Promise.all([
    j("data/meta.json"), j("data/macro.json", {}), j("data/prices.json"), j("data/fundamentals.json"), j("data/universe.json"),
    j("data/indicators_meta.json"), j("data/notes.json", {}), j("data/news/_index.json", {}), j("data/config.json", {}), j("assets/logos/_index.json", [])]);
  Object.assign(D, { meta: meta_, macro, prices, fund, imeta, notes, newsIdx, config, cache: {}, logos: new Set(logos) });
  D.univ = univ.filter((a) => fund[a.ticker]);
  D.univMap = Object.fromEntries(univ.map((a) => [a.ticker, a]));
  D.tickers = D.univ.map((a) => a.ticker);
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
   PONTOS DE ATENÇÃO E FORTALEZAS (rótulos curtos, detalhe no tooltip)
   ===================================================================== */
function pontos(t) {
  const i = ind(t), r = CONFIG.RISCOS, f = CONFIG.FORTALEZAS, sn = i.sinais || {}, a = A(t), out = [];
  const add = (tipo, rot, det) => out.push({ tipo, rot, det });
  if (isRec(t)) add("neg", recNome(t), (a.recuperacao || {}).situacao || "");
  if (!isFin(t)) {
    if (ok(i.divliq_ebitda) && i.divliq_ebitda > r.divliq_ebitda_max) add("neg", "Alavancagem alta", `Dívida líquida de ${nf2.format(i.divliq_ebitda)}x o EBITDA (referência: até ${r.divliq_ebitda_max}x).`);
    if (ok(i.cobertura_juros) && i.cobertura_juros < r.cobertura_juros_min) add("neg", "Juros pesam no resultado", `EBIT cobre ${nf2.format(i.cobertura_juros)}x as despesas financeiras.`);
    if (sn.fcl_negativo_anos >= r.fcl_negativo_anos) add("neg", "Queima de caixa", `Fluxo de caixa livre negativo há ${sn.fcl_negativo_anos} exercícios seguidos.`);
  }
  if (ok(i.payout) && i.payout > r.payout_max) add("alerta", "Payout acima do lucro", `Distribui ${nf2.format(i.payout * 100)}% do lucro de 12 meses.`);
  if (ok(i.diluicao_3a) && i.diluicao_3a > r.diluicao_3a_max) add("alerta", "Diluição", `Número de ações subiu ${nf2.format(i.diluicao_3a * 100)}% em 3 anos.`);
  if (sn.margem_queda_3a) add("alerta", "Margem em queda", "Margem líquida caindo há 3 exercícios seguidos.");
  if (sn.lucro_caindo) add("alerta", "Lucro em queda", "Lucro de 12 meses abaixo do período anterior e do último exercício.");
  if (ok(i.pl) && i.pl < r.armadilha_pl_max && sn.lucro_caindo && sn.divida_subindo) add("neg", "Possível armadilha de valor", "P/L baixo com lucro caindo e dívida subindo.");
  if (!semValuation(t) && ok(i.cresc_gap) && i.cresc_gap > r.gap_crescimento_max) add("alerta", "Preço exige crescimento alto", `O preço embute ${nf2.format(i.cresc_implicito * 100)}% ao ano, acima do histórico de ${nf2.format(i.cresc_historico_ref * 100)}%.`);
  if (ok(i.bdr_agio) && i.bdr_agio > r.bdr_agio_max) add("alerta", "BDR com ágio", `BDR ${nf2.format(i.bdr_agio * 100)}% acima do preço justo.`);
  const liq = (D.prices[t] || {}).liquidez_21;
  if (ok(liq) && liq < r.liquidez_min) add("alerta", "Baixa liquidez", `Negocia em média R$ ${grande(liq)} por dia.`);
  if (ok(i.piotroski) && i.piotroski >= f.piotroski_min) add("pos", "Qualidade contábil alta", `Piotroski ${i.piotroski} de 9.`);
  if (ok(i.roe) && i.roe >= f.roe_min && !isRec(t)) add("pos", "ROE elevado", `ROE de ${nf2.format(i.roe * 100)}%.`);
  if (!isFin(t) && ok(i.roic) && i.roic >= f.roic_min) add("pos", "ROIC elevado", `ROIC de ${nf2.format(i.roic * 100)}%.`);
  if (!isFin(t) && ok(i.divliq_ebitda) && i.divliq_ebitda <= f.divliq_ebitda_max && ok(i.ebitda) && i.ebitda > 0) add("pos", i.divliq_ebitda < 0 ? "Caixa líquido" : "Dívida baixa", `Dívida líquida de ${nf2.format(i.divliq_ebitda)}x o EBITDA.`);
  if (ok(i.anos_pagando) && i.anos_pagando >= f.anos_pagando_min) add("pos", "Pagadora consistente", `${i.anos_pagando} anos seguidos pagando proventos.`);
  if (ok(i.bdr_agio) && i.bdr_agio <= -f.bdr_desagio_min) add("pos", "BDR com deságio", `BDR ${nf2.format(-i.bdr_agio * 100)}% abaixo do preço justo.`);
  return out;
}

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
  $$(".menu a").forEach((a) => a.classList.toggle("ativo", a.dataset.rota === r));
  $("#menu").classList.remove("aberto");
  const app = $("#app");
  try {
    if (r === "") pgHome(app);
    else if (r === "rankings") pgRankings(app);
    else if (r === "ativo") await pgAtivo(app, p.toUpperCase(), q);
    else if (r === "comparar") pgComparar(app, q);
    else if (r === "filtros") pgFiltros(app);
    else app.innerHTML = '<div class="cartao"><h1>Página não encontrada</h1><p><a href="#/">Voltar à visão geral</a></p></div>';
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="cartao"><h2>Erro ao montar a página</h2><p class="sub">${esc(e.message)}</p></div>`;
  }
  window.scrollTo(0, 0);
}
function cabPagina(sobre, titulo, texto, direita = "") {
  return `<div class="cab-pagina"><div><div class="sobre">${esc(sobre)}</div><h1>${esc(titulo)}</h1>${texto ? `<p>${texto}</p>` : ""}</div>${direita}</div>`;
}
function pilulasData() {
  return `<div class="datas"><span class="pilula"><i></i>Fechamento de ${dataBR(D.meta.data_fechamento)}</span><span class="pilula">Balanços até o ${esc(D.meta.balancos_ate || "n/d")}</span></div>`;
}

/* =====================================================================
   TABELA GENÉRICA
   ===================================================================== */
function tabela(lista, colunas, opts = {}) {
  const sort = opts.sort;
  const cols = ["empresa", ...colunas.filter((k) => k !== "empresa" && k !== "ticker" && k !== "nome")];
  const ths = cols.map((k) => {
    const m = meta(k), n = m.unidade !== "txt";
    const seta = sort && sort.k === k ? `<span class="seta">${sort.d > 0 ? "▲" : "▼"}</span>` : "";
    return `<th class="${n ? "n" : ""} ${sort ? "ord" : ""}" data-k="${k}" data-tip="${esc(m.nome + (m.formula ? ": " + m.formula : ""))}">${esc(ROT_CURTO[k] || m.nome)}${seta}</th>`;
  }).join("");
  const trs = lista.map((t) => `<tr class="clicavel" data-t="${t}">${cols.map((k) => celula(t, k)).join("")}</tr>`).join("");
  return `<div class="tabela-wrap ${opts.alta ? "alta" : ""}"><table class="resp"><thead><tr>${ths}</tr></thead><tbody>${trs || `<tr><td colspan="${cols.length}" class="vazio">Nenhum ativo.</td></tr>`}</tbody></table></div>`;
}
function celula(t, k) {
  const m = meta(k), rot = esc(ROT_CURTO[k] || m.nome), v = val(t, k);
  if (k === "empresa") return `<td class="cel-empresa">${empresa(t)}</td>`;
  if (k === "preco") return `<td class="n" data-label="${rot}">${ok(v) ? "R$ " + nf2.format(v) : ND}</td>`;
  if (k.startsWith("var_")) return `<td class="n" data-label="${rot}">${varHtml(v)}</td>`;
  if (m.unidade === "txt") return `<td data-label="${rot}">${v ? esc(v) : ND}</td>`;
  const sup = semValuation(t) && ["Valuation", "TIR"].includes(m.grupo);
  return `<td class="n" data-label="${rot}">${sup ? ND : fmt(t, k, v)}</td>`;
}
function ligarLinhas(raiz) {
  $$("tr.clicavel", raiz).forEach((tr) => tr.onclick = (e) => { if (e.target.closest("a")) return; location.hash = `#/ativo/${tr.dataset.t}`; });
}
function ordenar(lista, k, d) {
  const num = meta(k).unidade !== "txt";
  return [...lista].sort((a, b) => {
    const va = k === "empresa" ? a : val(a, k), vb = k === "empresa" ? b : val(b, k);
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    return num && k !== "empresa" ? d * (va - vb) : d * String(va).localeCompare(String(vb), "pt-BR");
  });
}
function filtroSeg(lista, seg) { return seg === "TUDO" ? lista : lista.filter((t) => A(t).tipo === seg); }
function chipsSeg(atual, id) {
  return `<div class="chips" id="${id}">${Object.entries(SEGMENTOS).map(([k, n]) => `<button class="chip ${k === atual ? "ativo" : ""}" data-seg="${k}">${n}</button>`).join("")}</div>`;
}
function todasColunas() {
  const base = ["setor_micro", "setor_macro", "tipo", "porte", "preco", "var_ano", "var_12m", "var_5a", "valor_mercado_brl"];
  const ind_ = Object.keys(D.imeta.indicadores).filter((k) => !["preco", "valor_mercado"].includes(k));
  return [...base, ...ind_];
}

/* =====================================================================
   PÁGINA: VISÃO GERAL
   ===================================================================== */
function pgHome(app) {
  EST.colunas = (EST.colunas || lsGet("colunas_v2", CONFIG.COLUNAS_PADRAO)).filter((k) => k !== "empresa");
  const ts = D.tickers, base = ts.filter((t) => !semValuation(t));
  const plMed = mediana(base.map((t) => ind(t).pl).filter((v) => v > 0));
  const roeMed = mediana(base.map((t) => ind(t).roe));
  const dyMed = mediana(base.map((t) => ind(t).dy).filter((v) => v > 0));
  const nRec = ts.filter(isRec).length;
  const nAcoes = ts.filter((t) => A(t).tipo === "ACAO_BR").length;
  app.innerHTML = `
  ${cabPagina("Painel", "Visão geral", "Indicadores fundamentalistas de ações brasileiras e BDRs, calculados a partir das demonstrações oficiais. Clique em uma empresa para a análise completa.", pilulasData())}
  <div class="stats">
    <div class="stat"><div class="r">Ativos acompanhados</div><div class="v">${ts.length}</div><div class="d">${nAcoes} ações e ${ts.length - nAcoes} BDRs</div></div>
    <div class="stat"><div class="r">P/L mediano</div><div class="v">${fmtU(plMed, "x")}</div><div class="d">empresas com lucro positivo</div></div>
    <div class="stat"><div class="r">ROE mediano</div><div class="v">${fmtU(roeMed, "pct")}</div><div class="d">lucro de 12 meses sobre patrimônio</div></div>
    <div class="stat"><div class="r">Dividend yield mediano</div><div class="v">${fmtU(dyMed, "pct")}</div><div class="d">${nRec} empresa${nRec === 1 ? "" : "s"} em recuperação fora das medianas</div></div>
  </div>
  <div class="cartao">
    <div class="cartao-cab"><div><h2>Setores</h2><p class="sub">Medianas do setor. Clique para filtrar a tabela.</p></div></div>
    <div class="setores" id="setores"></div>
  </div>
  <div class="cartao" id="bloco-tabela">
    <div class="cartao-cab">
      ${chipsSeg(EST.seg, "segs")}
      <div class="linha">
        <span id="setor-ativo"></span>
        <input type="search" id="filtro-busca" placeholder="Filtrar empresa ou ticker" value="${esc(EST.busca)}">
        <div class="dropdown"><button class="btn" id="btn-colunas">Colunas</button><div class="dropdown-painel" id="painel-colunas" hidden></div></div>
      </div>
    </div>
    <div id="tabela-home"></div>
    <p class="sub" style="margin-top:10px">Passe o mouse sobre o nome de uma coluna para ver a fórmula. Clique no cabeçalho para ordenar.</p>
  </div>`;

  const desenharSetores = () => {
    const por = {};
    for (const t of filtroSeg(ts, EST.seg)) (por[A(t).setor_macro] = por[A(t).setor_macro] || []).push(t);
    $("#setores").innerHTML = Object.entries(por).sort((a, b) => b[1].length - a[1].length).map(([s, l]) => {
      const vl = l.filter((t) => !semValuation(t));
      const top = [...l].sort((a, b) => (ind(b).valor_mercado_brl || 0) - (ind(a).valor_mercado_brl || 0)).slice(0, 5);
      return `<button class="setor ${EST.setor === s ? "ativo" : ""}" data-s="${esc(s)}">
        <div class="setor-topo"><b>${esc(s)}</b><span class="qtd">${l.length}</span></div>
        <div class="logos-pilha">${top.map((t) => logo(t, "p")).join("")}</div>
        <div class="setor-nums"><div>P/L<b>${fmtU(mediana(vl.map((t) => ind(t).pl).filter((v) => v > 0)), "x")}</b></div><div>ROE<b>${fmtU(mediana(vl.map((t) => ind(t).roe)), "pct")}</b></div><div>DY<b>${fmtU(mediana(vl.map((t) => ind(t).dy)), "pct")}</b></div></div>
      </button>`;
    }).join("");
    $$("#setores .setor").forEach((b) => b.onclick = () => { EST.setor = EST.setor === b.dataset.s ? "" : b.dataset.s; desenharSetores(); desenhar();
      if (EST.setor) $("#bloco-tabela").scrollIntoView({ behavior: "smooth", block: "start" }); });
  };
  const desenhar = () => {
    let lista = filtroSeg(ts, EST.seg);
    if (EST.setor) lista = lista.filter((t) => A(t).setor_macro === EST.setor);
    const b = EST.busca.trim().toLowerCase();
    if (b) lista = lista.filter((t) => t.toLowerCase().includes(b) || A(t).nome.toLowerCase().includes(b));
    lista = ordenar(lista, EST.sort.k, EST.sort.d);
    $("#setor-ativo").innerHTML = EST.setor ? `<button class="chip ativo" id="limpa-setor">${esc(EST.setor)}<span class="x">✕</span></button>` : "";
    if ($("#limpa-setor")) $("#limpa-setor").onclick = () => { EST.setor = ""; desenharSetores(); desenhar(); };
    $("#tabela-home").innerHTML = tabela(lista, EST.colunas.filter((k) => meta(k)), { sort: EST.sort, alta: true });
    $$("#tabela-home th.ord").forEach((th) => th.onclick = () => {
      const k = th.dataset.k;
      EST.sort = { k, d: EST.sort.k === k ? -EST.sort.d : (meta(k).unidade === "txt" ? 1 : -1) };
      desenhar();
    });
    ligarLinhas($("#tabela-home"));
  };
  $$("#segs .chip").forEach((c) => c.onclick = () => { EST.seg = c.dataset.seg; $$("#segs .chip").forEach((x) => x.classList.toggle("ativo", x === c)); EST.setor = ""; desenharSetores(); desenhar(); });
  $("#filtro-busca").oninput = (e) => { EST.busca = e.target.value; desenhar(); };
  painelColunas($("#btn-colunas"), $("#painel-colunas"), () => desenhar());
  desenharSetores();
  desenhar();
}
function painelColunas(btn, painel, onChange) {
  btn.onclick = (e) => { e.stopPropagation(); painel.hidden = !painel.hidden; };
  document.addEventListener("click", (e) => { if (!painel.contains(e.target) && e.target !== btn) painel.hidden = true; });
  const grupos = {};
  for (const k of todasColunas()) { const g = meta(k).grupo || "Geral"; (grupos[g] = grupos[g] || []).push(k); }
  painel.innerHTML = `<div class="linha entre"><b>Colunas da tabela</b><button class="btn peq" id="col-reset">Padrão</button></div>` +
    Object.entries(grupos).map(([g, ks]) => `<h4>${esc(g)}</h4>${ks.map((k) => `<label><input type="checkbox" value="${k}" ${EST.colunas.includes(k) ? "checked" : ""}> ${esc(meta(k).nome)}</label>`).join("")}`).join("");
  painel.onchange = (e) => {
    const k = e.target.value;
    if (e.target.checked) EST.colunas.push(k); else EST.colunas = EST.colunas.filter((x) => x !== k);
    lsSet("colunas_v2", EST.colunas); onChange();
  };
  $("#col-reset", painel).onclick = () => { EST.colunas = [...CONFIG.COLUNAS_PADRAO]; lsSet("colunas_v2", EST.colunas); painelColunas(btn, painel, onChange); painel.hidden = false; onChange(); };
}

/* =====================================================================
   PÁGINA: RANKINGS (um indicador por ranking, sem nota composta)
   ===================================================================== */
const RANKINGS = [
  { id: "piotroski", nome: "Qualidade contábil", desc: "Piotroski F-Score: quantos dos 9 testes de qualidade a empresa atende. Não se aplica a bancos.", k: "piotroski", dir: 1, f: (t) => !isFin(t) },
  { id: "roe", nome: "Maior ROE", desc: "Lucro de 12 meses sobre o patrimônio líquido.", k: "roe", dir: 1, f: (t) => !isRec(t) },
  { id: "roic", nome: "Maior ROIC", desc: "Retorno sobre o capital investido (dívida + patrimônio). Não se aplica a bancos.", k: "roic", dir: 1, f: (t) => !isFin(t) && !isRec(t) },
  { id: "margem", nome: "Maior margem líquida", desc: "Lucro líquido sobre a receita, últimos 12 meses. Lucro acima da receita (evento não recorrente) fica de fora.", k: "margem_liquida", dir: 1, f: (t) => !isFin(t) && !isCripto(t) && ind(t).margem_liquida <= 1 },
  { id: "divida", nome: "Balanço mais leve", desc: "Dívida líquida sobre EBITDA. Negativo significa caixa maior que a dívida. Exige margem EBITDA de pelo menos 5%.", k: "divliq_ebitda", dir: -1, f: (t) => !isFin(t) && ok(ind(t).ebitda) && ind(t).ebitda > 0 && ind(t).margem_ebitda >= 0.05 },
  { id: "cresc", nome: "Crescimento do lucro", desc: "Crescimento médio anual do lucro líquido em 5 anos (CAGR).", k: "cagr_lucro_5a", dir: 1, f: (t) => !isRec(t) },
  { id: "dy", nome: "Dividendos sustentáveis", desc: "Dividend yield de 12 meses de quem distribui menos do que lucra (payout abaixo de 100%).", k: "dy", dir: 1, f: (t) => ok(ind(t).payout) && ind(t).payout > 0 && ind(t).payout < 1 },
  { id: "tir", nome: "Maior TIR implícita", desc: "Retorno anual que o preço de hoje embute, mantida a geração atual de lucro e caixa.", k: "tir_implicita", dir: 1, f: (t) => !semValuation(t) },
  { id: "pl", nome: "Menor P/L", desc: "Preço sobre lucro por ação. Considera só empresas com lucro.", k: "pl", dir: -1, f: (t) => !semValuation(t) && ok(ind(t).pl) && ind(t).pl > 0 },
];
function pgRankings(app) {
  const macros = [...new Set(D.univ.map((a) => a.setor_macro))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  app.innerHTML = `${cabPagina("Rankings", "Rankings por indicador", "Cada ranking ordena por um único indicador, com a fórmula descrita no próprio cartão. Empresas em recuperação ficam fora dos rankings de preço e rentabilidade.", pilulasData())}
  <div class="cartao"><div class="cartao-cab" style="margin:0">${chipsSeg(EST.rkSeg, "rk-seg")}
    <select id="rk-setor"><option value="">Todos os setores</option>${macros.map((s) => `<option ${EST.rkSetor === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div></div>
  <div class="rank-grade" id="rk-saida"></div>`;
  const desenhar = () => {
    let base = filtroSeg(D.tickers, EST.rkSeg);
    if (EST.rkSetor) base = base.filter((t) => A(t).setor_macro === EST.rkSetor);
    $("#rk-saida").innerHTML = RANKINGS.map((R) => {
      const l = base.filter(R.f).map((t) => [t, ind(t)[R.k]]).filter(([, v]) => ok(v));
      l.sort((a, b) => (R.dir > 0 ? b[1] - a[1] : a[1] - b[1]));
      const aberto = !!EST.rkAbertos[R.id], mostra = aberto ? l : l.slice(0, 8);
      const vs = l.map(([, v]) => v), mn = Math.min(...vs), mx = Math.max(...vs), rg = mx - mn || 1;
      const larg = (v) => 12 + 88 * (R.dir > 0 ? (v - mn) / rg : (mx - v) / rg);
      return `<div class="rank"><h3>${esc(R.nome)}</h3><p class="sub">${esc(R.desc)}</p>
        ${mostra.map(([t, v], i) => `<div class="rk"><span class="pos-n">${i + 1}</span><div style="min-width:0">${empresa(t, { cls: "p", semBadge: true })}<div class="barra"><i style="width:${larg(v)}%"></i></div></div><span class="valor">${fmt(t, R.k, v)}</span></div>`).join("") || '<p class="vazio">Sem empresas neste recorte.</p>'}
        ${l.length > 8 ? `<div class="mais"><button class="btn peq" data-abre="${R.id}">${aberto ? "Mostrar só os 8 primeiros" : `Ver todos (${l.length})`}</button></div>` : ""}</div>`;
    }).join("");
    $$("[data-abre]").forEach((b) => b.onclick = () => { EST.rkAbertos[b.dataset.abre] = !EST.rkAbertos[b.dataset.abre]; desenhar(); });
  };
  $$("#rk-seg .chip").forEach((c) => c.onclick = () => { EST.rkSeg = c.dataset.seg; $$("#rk-seg .chip").forEach((x) => x.classList.toggle("ativo", x === c)); desenhar(); });
  $("#rk-setor").onchange = (e) => { EST.rkSetor = e.target.value; desenhar(); };
  desenhar();
}

/* =====================================================================
   PÁGINA DO ATIVO
   ===================================================================== */
const ABAS_ATIVO = ["Valuation", "Rentabilidade", "Eficiência", "Endividamento", "Crescimento", "Caixa", "Proventos", "Governança"];
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
function kpiChaves(t) {
  if (isCripto(t)) return ["mnav", "btc_por_acao", "btc_em_caixa", "valor_btc", "pvp", "diluicao_3a", "divliq_ebitda", "valor_mercado"];
  if (A(t).modelo_analise === "BANCO") return ["pl", "pvp", "dy", "roe", "roa", "payout", "cagr_lucro_5a", "tir_implicita"];
  if (isFin(t)) return ["pl", "pvp", "dy", "roe", "payout", "margem_liquida", "cagr_lucro_5a", "tir_implicita"];
  return ["pl", "ev_ebitda", "pvp", "dy", "roe", "roic", "margem_liquida", "divliq_ebitda"];
}
async function pgAtivo(app, t, q) {
  if (!D.univMap[t] || !D.fund[t]) { app.innerHTML = `<div class="cartao"><h1>${esc(t)}</h1><p>Ativo não encontrado.</p><p><a href="#/">Voltar à visão geral</a></p></div>`; return; }
  const a = A(t), f = D.fund[t], i = f.ind, p = D.prices[t] || {}, n = D.notes[t] || {};
  const aba = q.get("aba") || "Valuation";
  const st = f.setor || {};
  const badges = [TIPO_CURTO[a.tipo], a.setor_micro, i.porte, SEGMENTO_B3[a.segmento_listagem], MODELO_NOME[a.modelo_analise] && !isRec(t) ? MODELO_NOME[a.modelo_analise] : null].filter(Boolean);
  const pos52 = ok(p.preco) && ok(p.min_52s) && ok(p.max_52s) && p.max_52s > p.min_52s ? (p.preco - p.min_52s) / (p.max_52s - p.min_52s) * 100 : null;
  const rec = a.recuperacao || {};
  const kpi = (k) => {
    const m = meta(k), v = val(t, k), md = (st.mediana_grupo || {})[k];
    const sup = semValuation(t) && ["Valuation", "TIR"].includes(m.grupo) && !["pvp", "valor_mercado"].includes(k);
    let cmp = "";
    if (!sup && ok(v) && ok(md) && m.direcao) {
      const melhor = m.direcao > 0 ? v > md : v < md;
      cmp = `<span class="${melhor ? "pos" : "neg"}">${melhor ? "▲" : "▼"}</span> mediana do setor ${fmtU(md, m.unidade, moedaDe(t))}`;
    } else if (ok(md)) cmp = `mediana do setor ${fmtU(md, m.unidade, moedaDe(t))}`;
    return `<div class="kpi"><div class="rot">${esc(ROT_CURTO[k] || m.nome)}${tip(k)}</div><div class="val">${sup ? ND : fmt(t, k, v)}</div><div class="det">${cmp || "&nbsp;"}</div></div>`;
  };
  const pts = pontos(t);
  app.innerHTML = `
  <div class="cartao">
    <div class="ativo-cab">
      <div class="ativo-id">${logo(t, "g")}<div style="min-width:0">
        <div class="linha"><span class="badge ouro">${t}</span>${badges.map((b) => `<span class="badge">${esc(b)}</span>`).join("")}${isRec(t) ? `<span class="badge rec">${esc(recNome(t))}</span>` : ""}</div>
        <h1>${esc(a.nome)}</h1><div class="trilha">${esc(a.setor_macro)} · ${esc(a.setor_micro)}</div></div></div>
      <div class="preco-bloco">
        <div class="preco-grande">R$ ${ok(p.preco) ? nf2.format(p.preco) : "n/d"}</div>
        <div class="sub">12 meses ${varHtml(p.var_12m)} · no ano ${varHtml(p.var_ano)} · fechamento de ${dataBR(p.data)}</div>
        ${pos52 !== null ? `<div class="faixa52"><div class="trilho"><span class="marc" style="left:${pos52}%"></span></div><div class="ext"><span>mín. 52 sem. R$ ${nf2.format(p.min_52s)}</span><span>máx. R$ ${nf2.format(p.max_52s)}</span></div></div>` : ""}
      </div>
    </div>
  </div>
  ${isRec(t) ? `<div class="aviso-rec"><div><b>${esc(recNome(t))}</b>${rec.pedido ? ` desde ${esc(dataBR(rec.pedido))}` : ""}. ${esc(rec.situacao || "")}<div class="sub">Múltiplos de lucro, TIR implícita e preço justo não são exibidos: os fluxos de uma empresa em recuperação não representam a operação normal. Fonte: ${esc(rec.fonte || "comunicados da companhia")}.</div></div></div>` : ""}
  ${isCripto(t) ? `<div class="aviso-info">Tesouraria em bitcoin: o valor da empresa acompanha o bitcoin em caixa. O lucro contábil é marcação a mercado do BTC; os indicadores centrais são mNAV e BTC por ação.</div>` : ""}
  ${a.tipo.startsWith("BDR") ? `<div class="aviso-info">BDR: fundamentos em ${moedaDe(t) === "US$" ? "dólar" : "reais (a empresa reporta em R$)"}. A tributação de proventos de BDR difere da de ações brasileiras.</div>` : ""}
  <div class="cartao"><div class="cartao-cab"><div><h2>Indicadores principais</h2><p class="sub">Últimos 12 meses, comparados com a mediana de ${esc(st.grupo_nome || "o setor")} (${(st.grupo_membros || []).length} empresas).</p></div></div>
    <div class="kpis">${kpiChaves(t).map(kpi).join("")}</div>
    ${pts.length ? `<h4>Pontos de destaque</h4><div class="atencao">${pts.map((x) => `<span class="badge ${x.tipo}" data-tip="${esc(x.det)}">${esc(x.rot)}</span>`).join("")}</div>` : ""}
  </div>
  <div class="grade g-3-2">
    ${blocoPrecoHoje(t)}
    ${blocoPiotroski(t)}
  </div><div class="espaco"></div>
  ${a.tipo.startsWith("BDR") ? blocoBDR(t) : ""}
  ${f.holding ? blocoHolding(t) : ""}
  ${isCripto(t) ? blocoCripto(t) : ""}
  <div class="grade g2">
    <div class="cartao"><div class="cartao-cab"><h2>Cotação</h2><div class="chips" id="px-per"><button class="chip ativo" data-p="1">1 ano</button><button class="chip" data-p="5">5 anos</button><button class="chip" data-p="10">10 anos</button></div></div><div class="grafico"><canvas id="g-preco"></canvas></div></div>
    <div class="cartao"><div class="cartao-cab"><div><h2>Lucro e preço</h2><p class="sub">Lucro líquido anual (barras) e preço no fim de cada exercício (linha).</p></div></div><div class="grafico"><canvas id="g-lucro"></canvas></div></div>
  </div><div class="espaco"></div>
  <div class="cartao">
    <div class="abas" id="abas">${[...ABAS_ATIVO, ...(a.modelo_analise === "BANCO" ? ["Banco"] : []), ...(a.modelo_analise === "SEGURADORA" ? ["Seguradora"] : []), "Notícias"]
      .map((x) => `<button data-aba="${x}" class="${x === aba ? "ativo" : ""}">${x}</button>`).join("")}</div>
    <div id="aba-conteudo"><div class="carregando"><span></span>Carregando</div></div>
  </div>
  <div class="grade g2">
    <div class="cartao"><h2>O negócio</h2><p>${esc(n.resumo || "Resumo não preenchido.")}</p>
      ${n.qualitativo ? `<h4>Notas</h4>${Object.entries(n.qualitativo).map(([k, v]) => `<p class="sub"><b>${esc(({ regulacao: "Regulação", concessoes: "Concessões", vso: "VSO", banco_terrenos: "Banco de terrenos", caixa: "Caixa" })[k] || k.replace(/_/g, " "))}:</b> ${esc(v)}</p>`).join("")}` : ""}
    </div>
    <div class="cartao"><h2>Sensibilidade a cenários</h2><p class="sub">De -2 (perde muito) a +2 (ganha muito) em cada cenário macro.</p>
      <div class="barras" style="margin-top:12px">${Object.entries(a.sensibilidade || {}).filter(([c]) => CENARIOS[c]).map(([c, v]) => `<div class="linha-barra"><span>${CENARIOS[c].nome}</span><span class="barra centro"><i style="left:${v < 0 ? 50 + v * 25 : 50}%;width:${Math.abs(v) * 25}%;background:${v >= 0 ? "var(--pos)" : "var(--neg)"}"></i></span><span class="num ${sinal(v)}">${v > 0 ? "+" : ""}${v}</span></div>`).join("")}</div>
    </div>
  </div><div class="espaco"></div>
  <div class="cartao"><div class="cartao-cab"><div><h2>Empresas comparáveis</h2><p class="sub">${esc(st.grupo_nome || "")}</p></div><button class="btn prim btn-comparar" data-t="${[t, ...pares(t)].join(",")}">Comparar lado a lado</button></div>${blocoRelacionadas(t)}</div>`;

  const h = await historico(t);
  const abrir = async (x) => {
    $$("#abas button").forEach((b) => b.classList.toggle("ativo", b.dataset.aba === x));
    const alvo = $("#aba-conteudo");
    if (x === "Notícias") alvo.innerHTML = await abaNoticias(t);
    else if (x === "Proventos") alvo.innerHTML = abaIndicadores(t, x, h) + await blocoProventos(t);
    else alvo.innerHTML = abaIndicadores(t, x, h);
    if (x === "Proventos") graficoProventos(t);
  };
  $$("#abas button").forEach((b) => b.onclick = () => { history.replaceState(null, "", `#/ativo/${t}?aba=${encodeURIComponent(b.dataset.aba)}`); abrir(b.dataset.aba); });
  await abrir(ABAS_ATIVO.includes(aba) || ["Banco", "Seguradora", "Notícias"].includes(aba) ? aba : "Valuation");
  graficoPreco(t, h, 1);
  $$("#px-per .chip").forEach((c) => c.onclick = () => { $$("#px-per .chip").forEach((x) => x.classList.toggle("ativo", x === c)); graficoPreco(t, h, +c.dataset.p); });
  graficoLucro(t, h);
  ligarLinhas(app);
  $$(".btn-comparar").forEach((b) => b.onclick = () => location.hash = `#/comparar?t=${b.dataset.t}`);
}
function blocoPrecoHoje(t) {
  const i = ind(t), fin = isFin(t);
  const k = (rot, key, extra = "") => `<div class="kpi"><div class="rot">${rot}${tip(key)}</div><div class="val">${semValuation(t) ? ND : fmt(t, key)}</div><div class="det">${semValuation(t) ? "&nbsp;" : extra}</div></div>`;
  const ci = i.cresc_implicito, ch = i.cresc_historico_ref;
  let frase;
  if (isRec(t)) frase = "Empresa em recuperação: retorno e crescimento implícitos não são calculados, porque os fluxos atuais não representam a operação normal.";
  else if (isCripto(t)) frase = "Tesouraria em bitcoin: TIR e crescimento implícito não se aplicam. O indicador central é o mNAV.";
  else if (ok(ci)) frase = `Para justificar o preço de hoje, a empresa precisa crescer <b>${nf2.format(ci * 100)}% ao ano</b> na perpetuidade. ` +
    (ok(ch) ? `Nos últimos 5 anos, ${fin ? "o lucro" : "a receita"} cresceu <b>${nf2.format(ch * 100)}% ao ano</b>.` : "");
  else frase = "Crescimento implícito não calculado: falta fluxo de caixa livre (ou ROE) positivo para a conta.";
  const ref = A(t).moeda_reporte === "USD" ? "Treasury 10 anos" : "NTN-B longa";
  return `<div class="cartao"><div class="cartao-cab"><div><h2>Ao preço de hoje</h2><p class="sub">Retorno anual que o preço atual embute e o crescimento que ele exige.</p></div></div>
  <div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">
    ${k("TIR implícita", "tir_implicita", ok(i.tir_spread_ref) ? `${i.tir_spread_ref >= 0 ? "+" : ""}${nf2.format(i.tir_spread_ref * 100)} p.p. sobre a ${ref}` : "")}
    ${k("Crescimento implícito", "cresc_implicito", ok(ch) ? `histórico de 5 anos: ${fmtU(ch, "pct")}` : "")}
    ${fin ? k("TIR pelo ROE", "tir_banco", `ROE sustentável ${fmtU(i.roe_sustentavel, "pct")}`) : k("TIR pelo caixa", "tir_caixa", "fluxo de caixa livre médio de 3 anos")}
    ${k("Preço justo de Graham", "graham", ok(i.graham_margem) ? `${i.graham_margem >= 0 ? "acima" : "abaixo"} do preço em ${nf2.format(Math.abs(i.graham_margem) * 100)}%` : "")}
  </div><p class="frase">${frase}</p></div>`;
}
function blocoPiotroski(t) {
  const pz = D.fund[t].piotroski, testes = (pz && pz.testes) || {}, nomes = D.imeta.piotroski_testes || {};
  if (isFin(t)) return `<div class="cartao"><h2>Qualidade contábil</h2><p class="sub">O Piotroski F-Score usa margem bruta, giro do ativo e liquidez corrente, que não existem no balanço de bancos e seguradoras. Para eles, veja ROE, P/VP e a aba Banco.</p></div>`;
  if (!pz || !ok(pz.pontos)) return `<div class="cartao"><h2>Qualidade contábil</h2><p class="sub">Piotroski F-Score indisponível: faltam dois exercícios anuais completos com os dados necessários.</p></div>`;
  return `<div class="cartao"><div class="cartao-cab"><div><h2>Qualidade contábil</h2><p class="sub">Piotroski F-Score, exercício ${pz.anos[1]} contra ${pz.anos[0]}.</p></div><div class="placar"><b>${pz.pontos}</b><span>de 9</span></div></div>
  <ul class="checks">${Object.entries(testes).map(([k, v]) => `<li><span class="ic ${v === true ? "s" : v === false ? "n" : "x"}">${v === true ? "✓" : v === false ? "✕" : "?"}</span>${esc(nomes[k] || k)}${v === null ? ' <span class="muted">(sem dado)</span>' : ""}</li>`).join("")}</ul></div>`;
}
function blocoHolding(t) {
  const h = D.fund[t].holding || {};
  return `<div class="cartao"><div class="cartao-cab"><div><h2>Desconto de holding</h2><p class="sub">${esc(h.nota || "")}</p></div></div><div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))">
    <div class="kpi"><div class="rot">Valor de mercado</div><div class="val">${fmt(t, "valor_mercado")}</div></div>
    <div class="kpi"><div class="rot">Soma das partes${tip("soma_partes")}</div><div class="val">${fmt(t, "soma_partes")}</div></div>
    <div class="kpi"><div class="rot">Desconto${tip("desconto_holding")}</div><div class="val ${sinal(ind(t).desconto_holding)}">${fmt(t, "desconto_holding")}</div></div>
  </div><div class="espaco"></div>
  <div class="tabela-wrap"><table class="resp"><thead><tr><th>Participação</th><th class="n">% detido</th><th class="n">Valor de mercado da investida</th><th class="n">Valor da participação</th></tr></thead><tbody>
  ${(h.partes || []).map((p) => `<tr><td class="cel-empresa">${D.univMap[p.ticker] ? empresa(p.ticker) : esc(p.ticker)}</td><td class="n" data-label="% detido">${fmtU(p.pct, "pct")}</td><td class="n" data-label="Valor de mercado">${fmtU(p.valor_mercado, "moeda_grande_brl")}</td><td class="n" data-label="Participação">${fmtU(p.valor_participacao, "moeda_grande_brl")}</td></tr>`).join("") || '<tr><td colspan="4" class="vazio">Sem participações listadas encontradas no Formulário de Referência.</td></tr>'}
  </tbody></table></div></div>`;
}
function blocoCripto(t) {
  const c = D.fund[t].cripto || {};
  return `<div class="cartao"><h2>Bitcoin em caixa</h2><p class="sub">Fonte: ${esc(c.fonte || "n/d")}${c.data ? `, posição de ${dataBR(c.data)}` : ""}.</p><div class="espaco"></div><div class="kpis">
    ${["btc_em_caixa", "valor_btc", "mnav", "btc_por_acao"].map((k) => `<div class="kpi"><div class="rot">${esc(meta(k).nome)}${tip(k)}</div><div class="val">${fmt(t, k)}</div></div>`).join("")}</div></div>`;
}
function blocoBDR(t) {
  const b = D.fund[t].bdr || {};
  return `<div class="cartao"><h2>Vínculo com o papel no exterior</h2><div class="espaco"></div><div class="kpis">
    <div class="kpi"><div class="rot">Papel no exterior</div><div class="val">${esc(b.ticker_exterior || "n/d")}</div><div class="det">${esc(b.bolsa_exterior || "")}</div></div>
    <div class="kpi"><div class="rot">Proporção</div><div class="val">${b.proporcao ? `${b.proporcao}:1` : "n/d"}</div><div class="det">${b.proporcao ? `${b.proporcao} BDR${b.proporcao > 1 ? "s" : ""} = 1 ação` : ""}</div></div>
    <div class="kpi"><div class="rot">Preço justo do BDR${tip("bdr_preco_justo")}</div><div class="val">R$ ${ok(b.preco_justo) ? nf2.format(b.preco_justo) : "n/d"}</div><div class="det">US$ ${ok(b.preco_exterior) ? nf2.format(b.preco_exterior) : "n/d"} x PTAX ${ok(b.ptax) ? nf2.format(b.ptax) : "n/d"}</div></div>
    <div class="kpi"><div class="rot">Ágio ou deságio${tip("bdr_agio")}</div><div class="val ${sinal(-(b.agio || 0))}">${ok(b.agio) ? (b.agio > 0 ? "+" : "") + nf2.format(b.agio * 100) + "%" : "n/d"}</div><div class="det">${ok(b.agio) ? (b.agio > 0 ? "BDR acima do preço justo" : "BDR abaixo do preço justo") : ""}</div></div>
  </div></div>`;
}
function spark(vals, w = 110, hgt = 24) {
  const v = vals.map((x) => ok(x) ? x : null), nums = v.filter((x) => x !== null);
  if (nums.length < 2) return '<span class="muted">-</span>';
  const mn = Math.min(...nums, 0), mx = Math.max(...nums, 0), rg = mx - mn || 1, bw = w / v.length, y0 = hgt - ((0 - mn) / rg) * hgt;
  return `<svg class="spark" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}">${v.map((x, i) => {
    if (x === null) return "";
    const y = hgt - ((x - mn) / rg) * hgt;
    return `<rect x="${i * bw + 1}" y="${Math.min(y, y0)}" width="${Math.max(1, bw - 2)}" height="${Math.max(1, Math.abs(y0 - y))}" rx="1" fill="${x >= 0 ? "var(--ouro)" : "var(--neg)"}"></rect>`;
  }).join("")}</svg>`;
}
function stripTags(s) { return String(s).replace(/<[^>]+>/g, ""); }
function abaIndicadores(t, g, h) {
  const f = D.fund[t], st = f.setor || {};
  const chaves = g === "Banco" || g === "Seguradora" ? Object.keys(D.imeta.indicadores).filter((k) => D.imeta.indicadores[k].grupo === g).concat(g === "Banco" ? ["pvp", "roe"] : ["roe"]) : chavesDoGrupo(t, g);
  const anos = Object.keys(h.anual || {}).sort();
  const linhas = chaves.map((k) => {
    const m = meta(k), v = val(t, k), m5 = f.medias_5a[k], md = (st.mediana_grupo || {})[k], pc = (st.percentil || {})[k];
    const serie = anos.map((y) => h.anual[y][k]);
    const sup = semValuation(t) && ["Valuation", "TIR"].includes(m.grupo) && ["pl", "p_ebit", "p_ebitda", "ev_ebitda", "ev_ebit", "earnings_yield", "peg", "graham", "bazin", "graham_margem", "bazin_margem"].includes(k);
    return `<tr><td class="cel-largo" data-label="">${esc(m.nome)} ${tip(k)}</td>
      <td class="n" data-label="Atual"><b>${sup ? ND : fmt(t, k, v)}</b></td><td class="n" data-label="Média 5 anos">${fmt(t, k, ok(m5) ? m5 : null)}</td>
      <td class="n" data-label="Mediana do setor">${fmt(t, k, ok(md) ? md : null)}</td>
      <td class="n" data-label="Percentil">${ok(pc) ? `<span class="pct-barra"><i style="width:${pc}%"></i></span>${nf0.format(pc)}` : ND}</td>
      <td data-label="Histórico" data-tip="${esc(anos.map((y, ix) => `${y}: ${ok(serie[ix]) ? stripTags(fmt(t, k, serie[ix])) : "n/d"}`).join(" | "))}">${serie.some(ok) ? spark(serie) : '<span class="muted">-</span>'}</td></tr>`;
  }).join("");
  const nota = g === "Banco" ? `<p class="sub">Basileia, inadimplência e cobertura de PDD vêm do release trimestral. ${esc(((D.notes[t] || {}).manuais || {}).fonte || "")}</p>` :
    g === "Seguradora" ? `<p class="sub">Índice combinado e sinistralidade vêm do release trimestral.</p>` : "";
  return `<div class="tabela-wrap"><table class="resp"><thead><tr><th>Indicador</th><th class="n">Atual (12m)</th><th class="n">Média 5 anos</th><th class="n">Mediana do setor</th><th class="n" data-tip="Posição dentro do grupo de comparação: 80 significa melhor que 80% dos pares na direção do indicador.">Percentil</th><th>Histórico anual</th></tr></thead><tbody>${linhas}</tbody></table></div>
  <p class="sub" style="margin-top:10px">Comparação com ${esc(st.grupo_nome || "o setor")} (${(st.grupo_membros || []).length} empresas). Passe o mouse no histórico para ver os valores de cada ano.</p>${nota}`;
}
async function blocoProventos(t) {
  const pv = await proventos(t), mo = pv.moeda === "USD" ? "US$" : "R$";
  const lista = (pv.lista || []).slice(0, 24);
  return `<div class="espaco"></div><div class="grade g2"><div><h3>Proventos por ano (por ${porPapel(t) > 1 ? "unit" : "ação"})</h3><div class="grafico peq"><canvas id="g-prov"></canvas></div></div>
  <div><h3>Últimos proventos</h3><div class="tabela-wrap" style="max-height:290px;margin-top:8px"><table class="resp"><thead><tr><th>Data com</th><th>Pagamento</th><th>Tipo</th><th class="n">Valor</th></tr></thead><tbody>
  ${lista.map((x) => `<tr><td data-label="Data com">${dataBR(x.data_com)}</td><td data-label="Pagamento">${dataBR(x.pagamento)}</td><td data-label="Tipo">${esc(x.tipo)}</td><td class="n" data-label="Valor">${mo} ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(x.valor)}</td></tr>`).join("") || '<tr><td colspan="4" class="vazio">Sem proventos.</td></tr>'}
  </tbody></table></div><p class="sub">Fonte: ${esc(pv.fonte || "")}.</p></div></div>`;
}
function optGraf({ stacked = false, eixo2 = false, moeda = "" } = {}) {
  const c = cor("--txt-3"), g = cor("--borda");
  const o = { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
    plugins: { legend: { labels: { color: cor("--txt-2"), boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { family: "Inter" } } },
      tooltip: { backgroundColor: "#0b1f3a", borderColor: "rgba(201,169,106,.4)", borderWidth: 1, titleFont: { family: "Inter" }, bodyFont: { family: "Inter" }, padding: 10,
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${moeda}${ok(ctx.parsed.y) ? nf2.format(ctx.parsed.y) : "n/d"}` } } },
    scales: { x: { stacked, ticks: { color: c, maxTicksLimit: 8, autoSkip: true, font: { family: "Inter" } }, grid: { display: false }, border: { color: g } },
      y: { stacked, ticks: { color: c, font: { family: "Inter" }, callback: (v) => nf2.format(v) }, grid: { color: g }, border: { display: false } } } };
  if (eixo2) o.scales.y2 = { position: "right", ticks: { color: c, font: { family: "Inter" }, callback: (v) => nf2.format(v) }, grid: { display: false }, border: { display: false } };
  return o;
}
async function graficoProventos(t) {
  const pv = await proventos(t), el = $("#g-prov");
  if (!el || !window.Chart) return;
  const anoAtual = new Date().getFullYear();
  const anos = Object.keys(pv.por_ano || {}).map(Number).filter((a) => a >= anoAtual - 10).sort();
  const tipo = pv.por_ano_tipo || {};
  const ds = [];
  if (anos.some((a) => tipo[a])) {
    ds.push({ label: "Dividendos", data: anos.map((a) => tipo[a] ? tipo[a].DIVIDENDO : null), backgroundColor: cor("--ouro"), borderRadius: 3 });
    ds.push({ label: "JCP", data: anos.map((a) => tipo[a] ? tipo[a].JCP : null), backgroundColor: cor("--link"), borderRadius: 3 });
    ds.push({ label: "Sem separação", data: anos.map((a) => tipo[a] ? null : pv.por_ano[a]), backgroundColor: cor("--txt-3"), borderRadius: 3 });
  } else ds.push({ label: "Proventos", data: anos.map((a) => pv.por_ano[a]), backgroundColor: cor("--ouro"), borderRadius: 3 });
  charts.push(new Chart(el, { type: "bar", data: { labels: anos, datasets: ds }, options: optGraf({ stacked: true }) }));
}
async function abaNoticias(t) {
  const n = await noticias(t);
  const limite = Date.now() - CONFIG.NOVO_HORAS * 3600e3;
  const novo = (d) => d && new Date(d).getTime() >= limite ? ' <span class="badge novo">Novo</span>' : "";
  const prox = n.proximo_resultado ? `<p class="frase">Próximo resultado: <b>${dataBR(n.proximo_resultado.data)}</b></p>` : "";
  return `${prox}<div class="grade g2">
  <div><h3>Comunicados oficiais</h3><p class="sub">${A(t).tipo === "ACAO_BR" ? "CVM: fatos relevantes, comunicados e resultados." : "SEC EDGAR: 8-K, 10-Q, 10-K."}</p>
  ${(n.comunicados || []).slice(0, 12).map((x) => `<div class="noticia"><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.titulo)}</a>${novo(x.data)}<div class="meta">${esc(x.categoria)} · ${dataBR(x.data)}</div></div>`).join("") || '<p class="vazio">Sem comunicados.</p>'}</div>
  <div><h3>Imprensa</h3><p class="sub">Google News, últimas notícias.</p>
  ${(n.noticias || []).slice(0, 12).map((x) => `<div class="noticia"><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.titulo)}</a>${novo(x.data)}<div class="meta">${esc(x.veiculo)} · ${x.data ? new Date(x.data).toLocaleDateString("pt-BR") : "n/d"}</div></div>`).join("") || '<p class="vazio">Sem notícias.</p>'}</div>
  </div>`;
}
function pares(t, n = 5) {
  const st = D.fund[t].setor || {};
  let ps = (st.pares_micro || []).filter((x) => x !== t && D.fund[x]);
  if (ps.length < 2) ps = [...new Set([...ps, ...(st.grupo_membros || []).filter((x) => x !== t && D.fund[x])])];
  return ps.slice(0, n);
}
function blocoRelacionadas(t) {
  const ps = pares(t);
  if (!ps.length) return '<p class="vazio">Sem empresas comparáveis no universo.</p>';
  const cols = isFin(t) ? ["pl", "pvp", "roe", "dy", "payout", "tir_implicita"] : ["pl", "ev_ebitda", "roic", "margem_liquida", "divliq_ebitda", "piotroski"];
  return tabela([t, ...ps], cols);
}
function graficoPreco(t, h, anos) {
  const el = $("#g-preco");
  if (!el || !window.Chart) { if (el) el.parentNode.innerHTML = '<p class="vazio">Gráfico indisponível.</p>'; return; }
  const corte = new Date(); corte.setFullYear(corte.getFullYear() - anos);
  const serie = (anos === 1 ? h.precos.diario : h.precos.semanal).filter(([d]) => new Date(d) >= corte);
  charts = charts.filter((c) => { if (c.canvas === el) { c.destroy(); return false; } return true; });
  const ctx = el.getContext("2d"), grad = ctx.createLinearGradient(0, 0, 0, 290);
  grad.addColorStop(0, "rgba(201,169,106,.28)"); grad.addColorStop(1, "rgba(201,169,106,0)");
  const o = optGraf({ moeda: "R$ " }); o.plugins.legend.display = false;
  charts.push(new Chart(el, { type: "line", data: { labels: serie.map(([d]) => dataBR(d)), datasets: [{ label: t, data: serie.map(([, v]) => v), borderColor: cor("--ouro"), backgroundColor: grad, borderWidth: 2, pointRadius: 0, fill: true, tension: 0.15 }] }, options: o }));
}
function graficoLucro(t, h) {
  const el = $("#g-lucro");
  if (!el || !window.Chart) return;
  const anos = Object.keys(h.anual || {}).sort(), mo = moedaDe(t);
  charts.push(new Chart(el, { data: { labels: anos, datasets: [
    { type: "bar", label: `Lucro líquido (${mo} bi)`, data: anos.map((y) => ok(h.anual[y].lucro_liq) ? h.anual[y].lucro_liq / 1e9 : null), backgroundColor: anos.map((y) => (h.anual[y].lucro_liq || 0) >= 0 ? cor("--serie") : cor("--neg")), borderRadius: 4, yAxisID: "y" },
    { type: "line", label: `Preço (${mo})`, data: anos.map((y) => h.anual[y].preco_fim), borderColor: cor("--ouro"), backgroundColor: cor("--ouro"), pointRadius: 3, borderWidth: 2, yAxisID: "y2" },
  ] }, options: optGraf({ eixo2: true }) }));
}

/* =====================================================================
   COMPARADOR
   ===================================================================== */
const LIDERES = [
  { k: "roe", nome: "Maior ROE", dir: 1 }, { k: "piotroski", nome: "Maior Piotroski", dir: 1 }, { k: "divliq_ebitda", nome: "Menor dívida", dir: -1 },
  { k: "dy", nome: "Maior dividend yield", dir: 1 }, { k: "tir_implicita", nome: "Maior TIR implícita", dir: 1 },
];
const MINIS = ["pl", "pvp", "roe", "margem_liquida", "dy", "tir_implicita"];
function pgComparar(app, q) {
  let sel = (q.get("t") || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => D.fund[x]);
  const setor = q.get("setor");
  if (setor) sel = D.univ.filter((a) => a.setor_micro === setor || a.setor_macro === setor).map((a) => a.ticker);
  sel = [...new Set(sel)].slice(0, 8);
  const setoresMacro = [...new Set(D.univ.map((a) => a.setor_macro))].sort(), setoresMicro = [...new Set(D.univ.map((a) => a.setor_micro))].sort();
  const atualizar = (lista, s) => { location.hash = s ? `#/comparar?setor=${encodeURIComponent(s)}` : `#/comparar?t=${lista.join(",")}`; };
  app.innerHTML = `${cabPagina("Comparador", "Comparar empresas", "Escolha de 2 a 8 empresas ou carregue um setor inteiro. O endereço da página guarda a seleção para compartilhar.")}
  <div class="cartao"><div class="linha">
    <div class="chips">${sel.map((t) => `<button class="chip ativo" data-rm="${t}">${logo(t)}${t}<span class="x">✕</span></button>`).join("") || '<span class="muted">Nenhuma empresa selecionada.</span>'}</div>
    <select id="cmp-add"><option value="">Adicionar empresa</option>${D.univ.filter((a) => !sel.includes(a.ticker)).map((a) => `<option value="${a.ticker}">${a.ticker} · ${esc(a.nome)}</option>`).join("")}</select>
    <select id="cmp-setor"><option value="">Carregar setor</option><optgroup label="Setor">${setoresMacro.map((s) => `<option>${esc(s)}</option>`).join("")}</optgroup><optgroup label="Subsetor">${setoresMicro.map((s) => `<option>${esc(s)}</option>`).join("")}</optgroup></select>
    ${sel.length ? '<button class="btn peq" id="cmp-limpar">Limpar</button>' : ""}
  </div></div><div id="cmp-saida"></div>`;
  $$("[data-rm]").forEach((b) => b.onclick = () => atualizar(sel.filter((x) => x !== b.dataset.rm)));
  $("#cmp-add").onchange = (e) => { if (e.target.value && sel.length < 8) atualizar([...sel, e.target.value]); };
  $("#cmp-setor").onchange = (e) => e.target.value && atualizar(null, e.target.value);
  if ($("#cmp-limpar")) $("#cmp-limpar").onclick = () => atualizar([]);
  if (sel.length < 2) { $("#cmp-saida").innerHTML = '<div class="cartao"><p class="vazio">Selecione pelo menos 2 empresas.</p></div>'; return; }

  const usaVal = (t, k) => !(semValuation(t) && ["Valuation", "TIR"].includes(meta(k).grupo));
  const lider = (L) => { const c = sel.filter((t) => usaVal(t, L.k) && ok(val(t, L.k))).sort((a, b) => L.dir * (val(b, L.k) - val(a, L.k))); return c[0]; };
  const mini = (k) => {
    const m = meta(k), vs = sel.map((t) => [t, usaVal(t, k) ? val(t, k) : null]).filter(([, v]) => ok(v));
    if (!vs.length) return "";
    const mx = Math.max(...vs.map(([, v]) => Math.abs(v))) || 1;
    return `<div class="mini"><h4>${esc(m.nome)} ${tip(k)}</h4><div class="barras">${vs.sort((a, b) => (m.direcao || 1) * (b[1] - a[1])).map(([t, v]) => `<div class="linha-barra"><span class="tk"><b>${t}</b></span><span class="barra"><i style="left:0;width:${Math.max(3, Math.abs(v) / mx * 100)}%;background:${v >= 0 ? "var(--ouro)" : "var(--neg)"}"></i></span><span class="num">${stripTags(fmt(t, k, v))}</span></div>`).join("")}</div></div>`;
  };
  const grupos = ["TIR", "Valuation", "Rentabilidade", "Eficiência", "Endividamento", "Crescimento", "Caixa", "Proventos", "Governança", "Tamanho", "Banco", "Seguradora", "Holding", "Cripto", "BDR"];
  const im = D.imeta.indicadores;
  let corpo = `<tr class="grupo-linha"><td colspan="${sel.length + 1}">Resumo</td></tr>` + ["setor_micro", "porte", "preco", "var_12m", "valor_mercado_brl"].map((k) => linhaCmp(k, sel)).join("");
  for (const g of grupos) {
    const ks = Object.keys(im).filter((k) => im[k].grupo === g && !["preco", "valor_mercado"].includes(k)).filter((k) => sel.some((t) => ok(val(t, k))));
    if (ks.length) corpo += `<tr class="grupo-linha"><td colspan="${sel.length + 1}">${esc(g)}</td></tr>` + ks.map((k) => linhaCmp(k, sel)).join("");
  }
  $("#cmp-saida").innerHTML = `<div class="cartao"><h2>Destaques da seleção</h2><div class="espaco"></div><div class="lideres">${LIDERES.map((L) => [L, lider(L)]).filter(([, t]) => t).map(([L, t]) =>
    `<div class="lider"><div class="r">${esc(L.nome)}</div>${empresa(t, { cls: "p" })}<div class="v">${fmt(t, L.k)}</div></div>`).join("")}</div></div>
  <div class="cartao"><h2>Indicadores-chave</h2><div class="espaco"></div><div class="mini-grade">${MINIS.map(mini).join("")}</div></div>
  <div class="cartao"><div class="cartao-cab"><div><h2>Todos os indicadores</h2><p class="sub">Verde marca o melhor e vermelho o pior de cada linha, respeitando a direção do indicador.</p></div></div>
  <div class="tabela-wrap alta"><table><thead><tr><th>Indicador</th>${sel.map((t) => `<th class="n"><a href="#/ativo/${t}" class="empresa" style="justify-content:flex-end">${logo(t, "p")}<span class="tk">${t}</span></a></th>`).join("")}</tr></thead><tbody>${corpo}</tbody></table></div></div>`;
}
function linhaCmp(k, sel) {
  const m = meta(k), dir = m.direcao || 0;
  const vs = sel.map((t) => (semValuation(t) && ["Valuation", "TIR"].includes(m.grupo)) ? null : val(t, k));
  const nums = vs.filter(ok);
  let best = null, worst = null;
  if (dir && nums.length >= 2 && m.unidade !== "txt") {
    best = dir > 0 ? Math.max(...nums) : Math.min(...nums);
    worst = dir > 0 ? Math.min(...nums) : Math.max(...nums);
    if (best === worst) best = worst = null;
  }
  return `<tr><td>${esc(m.nome)} ${tip(k)}</td>${sel.map((t, i) => {
    const v = vs[i];
    const cls = ok(v) && v === best ? "melhor" : ok(v) && v === worst ? "pior" : "";
    const txt = k === "preco" ? (ok(v) ? "R$ " + nf2.format(v) : ND) : k.startsWith("var_") ? varHtml(v) : m.unidade === "txt" ? esc(v || "n/d") : fmt(t, k, v);
    return `<td class="n ${cls}">${txt}</td>`;
  }).join("")}</tr>`;
}

/* =====================================================================
   FILTROS
   ===================================================================== */
function pgFiltros(app) {
  const s = EST.scr;
  const macros = [...new Set(D.univ.map((a) => a.setor_macro))].sort(), micros = [...new Set(D.univ.map((a) => a.setor_micro))].sort();
  const indicadoresNum = Object.keys(D.imeta.indicadores).filter((k) => meta(k).unidade !== "txt");
  const favs = lsGet("filtros_favoritos", {});
  app.innerHTML = `${cabPagina("Filtros", "Filtrar empresas", "Combine critérios. O resultado atualiza na hora e pode ser exportado em planilha.")}
  <div class="cartao">
    ${chipsSeg(s.seg, "scr-seg")}<div class="espaco"></div>
    <div class="grade g4">
      <label class="campo">Setor<select id="f-macro"><option value="">Todos</option>${macros.map((x) => `<option ${s.macro === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="campo">Subsetor<select id="f-micro"><option value="">Todos</option>${micros.map((x) => `<option ${s.micro === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="campo">Porte<select id="f-porte"><option value="">Todos</option>${["Large cap", "Mid cap", "Small cap", "Micro cap"].map((x) => `<option ${s.porte === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label class="campo">Piotroski mínimo<select id="f-pio"><option value="">Qualquer</option>${[5, 6, 7, 8].map((v) => `<option ${+s.pioMin === v ? "selected" : ""} value="${v}">${v} ou mais</option>`).join("")}</select></label>
      <label class="campo">TIR implícita mínima (%)<input type="number" id="f-tir" step="0.5" value="${esc(s.tirMin)}"></label>
      <label class="campo">Liquidez diária mínima (R$ milhões)<input type="number" id="f-liq" step="1" value="${esc(s.liqMin)}"></label>
      <label class="campo">Cenário macro favorável<select id="f-cen"><option value="">Nenhum</option>${Object.entries(CENARIOS).map(([k, c]) => `<option value="${k}" ${s.cenario === k ? "selected" : ""}>${c.nome}</option>`).join("")}</select></label>
      <label class="campo">&nbsp;<span class="linha" style="min-height:38px"><input type="checkbox" id="f-rec" ${s.semRec ? "checked" : ""}> Ocultar empresas em recuperação</span></label>
    </div>
    <h4>Faixas de indicadores</h4>
    <div id="f-faixas"></div>
    <div class="linha" style="margin-top:10px"><select id="f-novo"><option value="">Adicionar faixa de indicador</option>${indicadoresNum.map((k) => `<option value="${k}">${esc(meta(k).nome)}</option>`).join("")}</select></div>
    <div class="espaco"></div>
    <div class="linha entre"><div class="linha">
      <select id="f-favs"><option value="">Filtros salvos</option>${Object.keys(favs).map((n) => `<option>${esc(n)}</option>`).join("")}</select>
      <button class="btn peq" id="f-salvar">Salvar filtro</button><button class="btn peq" id="f-apagar">Apagar salvo</button><button class="btn peq" id="f-limpar">Limpar</button></div>
      <button class="btn prim" id="f-csv">Exportar planilha (CSV)</button></div>
  </div>
  <div class="cartao"><div class="cartao-cab"><h2 id="f-qtd"></h2></div><div id="f-res"></div></div>`;
  const faixas = () => {
    $("#f-faixas").innerHTML = EST.scrFiltros.map((f, i) => {
      const vs = D.tickers.map((t) => val(t, f.k)).filter(ok);
      const mn = vs.length ? Math.min(...vs) : 0, mx = vs.length ? Math.max(...vs) : 1, passo = (mx - mn) / 100 || 0.01;
      if (f.min === null || f.min === undefined) f.min = mn;
      if (f.max === null || f.max === undefined) f.max = mx;
      return `<div class="filtro-linha"><div><b>${esc(meta(f.k).nome)}</b><div class="sub">${stripTags(fmtU(f.min, meta(f.k).unidade))} a ${stripTags(fmtU(f.max, meta(f.k).unidade))}</div></div>
      <label class="campo">mínimo<input type="range" min="${mn}" max="${mx}" step="${passo}" value="${f.min}" data-i="${i}" data-l="min"></label>
      <label class="campo">máximo<input type="range" min="${mn}" max="${mx}" step="${passo}" value="${f.max}" data-i="${i}" data-l="max"></label>
      <button class="btn peq" data-del="${i}">Remover</button></div>`;
    }).join("");
    $$("#f-faixas input[type=range]").forEach((r) => r.oninput = (e) => { EST.scrFiltros[+e.target.dataset.i][e.target.dataset.l] = +e.target.value; faixas(); aplicar(); });
    $$("#f-faixas [data-del]").forEach((b) => b.onclick = () => { EST.scrFiltros.splice(+b.dataset.del, 1); faixas(); aplicar(); });
  };
  const resultado = () => {
    let l = filtroSeg(D.tickers, s.seg);
    if (s.macro) l = l.filter((t) => A(t).setor_macro === s.macro);
    if (s.micro) l = l.filter((t) => A(t).setor_micro === s.micro);
    if (s.porte) l = l.filter((t) => val(t, "porte") === s.porte);
    if (s.pioMin) l = l.filter((t) => ok(ind(t).piotroski) && ind(t).piotroski >= +s.pioMin);
    if (s.tirMin !== "" && s.tirMin !== null) l = l.filter((t) => !semValuation(t) && ok(ind(t).tir_implicita) && ind(t).tir_implicita * 100 >= +s.tirMin);
    if (s.liqMin !== "" && s.liqMin !== null) l = l.filter((t) => ok((D.prices[t] || {}).liquidez_21) && D.prices[t].liquidez_21 >= +s.liqMin * 1e6);
    if (s.semRec) l = l.filter((t) => !isRec(t));
    if (s.cenario) l = l.filter((t) => ((A(t).sensibilidade || {})[s.cenario] ?? 0) >= 1);
    for (const f of EST.scrFiltros) l = l.filter((t) => { const v = val(t, f.k); return ok(v) && v >= f.min - 1e-12 && v <= f.max + 1e-12; });
    return ordenar(l, "valor_mercado_brl", -1);
  };
  const colunas = () => [...new Set(["setor_micro", "preco", ...EST.scrFiltros.map((f) => f.k), "pl", "roe", "dy", "tir_implicita", "piotroski"])];
  const aplicar = () => {
    const l = resultado();
    $("#f-qtd").textContent = `${l.length} empresa${l.length === 1 ? "" : "s"}`;
    $("#f-res").innerHTML = tabela(l, colunas(), { alta: true });
    ligarLinhas($("#f-res"));
  };
  const ler = () => { Object.assign(s, { macro: $("#f-macro").value, micro: $("#f-micro").value, porte: $("#f-porte").value, pioMin: $("#f-pio").value, tirMin: $("#f-tir").value,
    liqMin: $("#f-liq").value, cenario: $("#f-cen").value, semRec: $("#f-rec").checked }); aplicar(); };
  $$("#scr-seg .chip").forEach((c) => c.onclick = () => { s.seg = c.dataset.seg; $$("#scr-seg .chip").forEach((x) => x.classList.toggle("ativo", x === c)); aplicar(); });
  ["#f-macro", "#f-micro", "#f-porte", "#f-pio", "#f-tir", "#f-liq", "#f-cen", "#f-rec"].forEach((id) => { $(id).onchange = ler; $(id).oninput = ler; });
  $("#f-novo").onchange = (e) => { if (e.target.value) { EST.scrFiltros.push({ k: e.target.value, min: null, max: null }); e.target.value = ""; faixas(); aplicar(); } };
  $("#f-salvar").onclick = () => { const nome = prompt("Nome do filtro:"); if (!nome) return; const fv = lsGet("filtros_favoritos", {}); fv[nome] = { scr: { ...s }, faixas: EST.scrFiltros }; lsSet("filtros_favoritos", fv); pgFiltros(app); };
  $("#f-favs").onchange = (e) => { const fv = lsGet("filtros_favoritos", {})[e.target.value]; if (fv) { Object.assign(EST.scr, fv.scr); EST.scrFiltros = fv.faixas || []; pgFiltros(app); } };
  $("#f-apagar").onclick = () => { const n = $("#f-favs").value; if (!n) return; const fv = lsGet("filtros_favoritos", {}); delete fv[n]; lsSet("filtros_favoritos", fv); pgFiltros(app); };
  $("#f-limpar").onclick = () => { EST.scr = { seg: "TUDO", macro: "", micro: "", porte: "", tirMin: "", liqMin: "", pioMin: "", semRec: true, cenario: "", cenMin: 1 }; EST.scrFiltros = []; pgFiltros(app); };
  $("#f-csv").onclick = () => exportarCSV(resultado(), ["ticker", "nome", ...colunas()]);
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
   FAIXA DE MERCADO, RODAPÉ, BUSCA, TEMA, TOOLTIP
   ===================================================================== */
function faixaMercado() {
  const m = D.macro || {};
  const pts = (x, pre = "", suf = "") => x && ok(x.valor) ? { v: pre + nf2.format(x.valor) + suf, d: x.var_dia } : null;
  const taxa = (x, campo = "valor") => x && ok(x[campo]) ? { v: nf2.format(x[campo] * 100) + "%" } : null;
  const ntnbVenc = m.ntnb_longa && m.ntnb_longa.vencimento ? m.ntnb_longa.vencimento.slice(0, 4) : "";
  const itens = [
    ["Ibovespa", pts(m.ibovespa), "pts"], ["IFIX", pts(m.ifix), "pts"], ["S&P 500", pts(m.sp500), "pts"], ["Nasdaq", pts(m.nasdaq), "pts"],
    ["Dólar comercial", pts(m.dolar, "R$ ")], ["Euro", pts(m.euro, "R$ ")], ["Bitcoin", pts(m.bitcoin_brl, "R$ ")],
    ["Petróleo Brent", pts(m.brent, "US$ ")], ["Ouro", pts(m.ouro, "US$ "), "onça"],
    ["Selic", taxa(m.selic), "a.a."], ["CDI", taxa(m.cdi), "a.a."], ["IPCA 12 meses", taxa(m.ipca_12m)],
    [`NTN-B ${ntnbVenc}`, m.ntnb_longa && ok(m.ntnb_longa.taxa) ? { v: "IPCA + " + nf2.format(m.ntnb_longa.taxa * 100) + "%" } : null],
    ["Treasury 10 anos", taxa(m.treasury_10y, "taxa")], ["Treasury 20 anos", taxa(m.treasury_20y, "taxa")],
  ].filter(([, x]) => x);
  const html = itens.map(([r, x, u]) => `<span class="fx"><span class="r">${esc(r)}</span><span class="v">${x.v}</span>${u ? `<span class="u">${u}</span>` : ""}${ok(x.d) ? `<span class="d ${sinal(x.d)}">${x.d > 0 ? "▲" : x.d < 0 ? "▼" : ""} ${nf2.format(Math.abs(x.d) * 100)}%</span>` : ""}</span>`).join("");
  $("#faixa-trilho").innerHTML = html + html;
  const ntnb = m.ntnb_longa || {};
  $("#faixa").title = `Fechamento de ${dataBR(D.meta.data_fechamento)}. NTN-B: Tesouro IPCA+ ${ntnbVenc} (vencimento ${dataBR(ntnb.vencimento)}), taxa real de compra.`;
}
function rodape() {
  $("#rodape").innerHTML = `<p>Dados atualizados em ${D.meta.gerado_em ? new Date(D.meta.gerado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "n/d"} · preços de fechamento de ${dataBR(D.meta.data_fechamento)} · balanços até o ${esc(D.meta.balancos_ate || "n/d")}.</p>
  <p>Fontes: CVM, B3, SEC, Banco Central, Tesouro Direto, FRED e Yahoo Finance. Logos: brapi.dev. Fórmulas de cada indicador no ícone ⓘ ao lado do nome.</p>`;
}
function busca() {
  const inp = $("#busca"), lista = $("#busca-lista");
  let sel = 0;
  const achar = () => { const q = inp.value.trim().toLowerCase(); return q && D.univ ? D.univ.filter((a) => a.ticker.toLowerCase().includes(q) || a.nome.toLowerCase().includes(q)).slice(0, 8) : []; };
  const desenhar = () => { const r = achar(); lista.hidden = !r.length; lista.innerHTML = r.map((a, i) => `<a href="#/ativo/${a.ticker}" class="${i === sel ? "sel" : ""}">${logo(a.ticker)}<span><b>${a.ticker}</b><span class="sub">${esc(a.nome)}</span></span></a>`).join(""); };
  inp.oninput = () => { sel = 0; desenhar(); };
  inp.onkeydown = (e) => {
    const r = achar();
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, r.length - 1); desenhar(); e.preventDefault(); }
    if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); desenhar(); e.preventDefault(); }
    if (e.key === "Enter" && r[sel]) { location.hash = `#/ativo/${r[sel].ticker}`; inp.value = ""; lista.hidden = true; inp.blur(); }
    if (e.key === "Escape") { lista.hidden = true; inp.blur(); }
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
    tt.style.left = Math.max(8, Math.min(e.clientX + 12, innerWidth - w - 8)) + "px";
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
    <p class="sub">Rode o pipeline (rodar_local.bat) e abra o site por um servidor local (http://localhost:8000).</p></div>`;
    return;
  }
  faixaMercado();
  rodape();
  window.addEventListener("hashchange", render);
  render();
})();
