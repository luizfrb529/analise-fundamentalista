"use strict";
/* =====================================================================
   CONFIGURAÇÃO (edite aqui)
   ===================================================================== */
const CONFIG = {
  // true = pede senha antes de mostrar o conteúdo. Proteção simples (site estático): não use para dado sigiloso.
  MODO_PRIVADO: false,
  // SHA-256 da senha (padrão: trocar-senha). Para gerar: python -c "import hashlib;print(hashlib.sha256(b'SUA_SENHA').hexdigest())"
  SENHA_SHA256: "7602b08c32dd3c35d59593cc17cbd28dd80aa1da77558496207d0c69ded5dc36",
  // mínimo de critérios avaliados para entrar na classificação ponderada
  CRITERIOS_MIN: 6,
  // limites dos selos de destaque na página de cada empresa
  RISCOS: { divliq_ebitda_max: 3, cobertura_juros_min: 2, fcl_negativo_anos: 2, payout_max: 1, diluicao_3a_max: 0.10,
    armadilha_pl_max: 8, gap_crescimento_max: 0.05, bdr_agio_max: 0.05, liquidez_min: 5e6 },
  FORTALEZAS: { piotroski_min: 7, roe_min: 0.15, roic_min: 0.12, divliq_ebitda_max: 1, anos_pagando_min: 8, bdr_desagio_min: 0.03 },
  SMALL_CAP_MAX: 10e9,
  NOVO_HORAS: 48,
};

const CENARIOS = {
  selic_caindo: "Selic caindo", dolar_subindo: "Dólar subindo", commodities_subindo: "Commodities subindo",
  pib_acelerando: "PIB acelerando", inflacao_subindo: "Inflação subindo", risco_fiscal_subindo: "Risco fiscal subindo",
};
const TIPO_CURTO = { ACAO_BR: "Ação", BDR_EXPOSICAO_BR: "BDR (empresa brasileira)", BDR_EXTERIOR: "BDR" };
const SEGMENTO_B3 = { NM: "Novo Mercado", N1: "Nível 1", N2: "Nível 2", MA: "Bovespa Mais", M2: "Bovespa Mais Nível 2", BOLSA: "Tradicional", DR3: "BDR Nível III" };
const NAO_FIN = new Set(["divida_bruta", "divida_liquida", "ev", "p_ebitda", "p_ebit", "psr", "p_capital_giro", "p_acl", "ev_ebitda", "ev_ebit",
  "ev_receita", "earnings_yield", "fcf_yield", "divliq_pl", "divliq_ebitda", "divliq_ebit", "liquidez_corrente", "liquidez_seca",
  "liquidez_imediata", "cobertura_juros", "divida_cp_pct", "margem_bruta", "margem_ebitda", "margem_ebit", "giro_ativo", "pmr", "pme",
  "pmp", "ciclo_financeiro", "roic", "roic_spread", "fco", "capex", "fcl", "ebitda", "capex_depreciacao", "conversao_caixa",
  "dividendos_sobre_fcl", "tir_caixa", "tir_dcf", "evebitda_vs_media5", "cagr_ebitda_5a", "cagr_ebitda_10a", "piotroski", "margem_fcl", "passivos_ativos", "pl_ativos"]);
const SUPRIME_REC = new Set(["pl", "peg", "earnings_yield", "p_ebit", "p_ebitda", "ev_ebit", "ev_ebitda", "tir_implicita"]);
const ROT = {
  empresa: "Empresa", setor_micro: "Setor", preco: "Preço", var_12m: "12 meses", var_ano: "No ano", valor_mercado_brl: "Valor de mercado",
  tir_implicita: "TIR implícita", divliq_ebitda: "Dív. líq./EBITDA", margem_liquida: "Margem líquida", margem_bruta: "Margem bruta",
  margem_ebitda: "Margem EBITDA", cagr_lucro_5a: "CAGR lucro 5a", cagr_receita_5a: "CAGR receita 5a", ev_ebitda: "EV/EBITDA", dy: "Dividend yield",
  pl: "P/L", pvp: "P/VP", roe: "ROE", roic: "ROIC", roa: "ROA", piotroski: "Qualidade contábil", payout: "Payout", lpa: "LPA", vpa: "VPA",
  psr: "PSR", liquidez_corrente: "Liquidez corrente", giro_ativo: "Giro do ativo", pl_ativos: "Patrimônio/Ativos", passivos_ativos: "Passivos/Ativos",
  nota_criterios: "Nota", cresc_lucro_ltm: "Lucro 12m vs anterior", cresc_receita_ltm: "Receita 12m vs anterior", dy_medio_5a: "DY médio 5 anos", anos_pagando: "Anos pagando", aluguel_pct_ff: "Vendida / free float", aluguel_dias: "Dias para cobrir", aluguel_valor: "Posição vendida", free_float: "Free float", margem_fcl: "Margem FCL", fcf_yield: "FCF yield", conversao_caixa: "Conversão de caixa", fcl: "Fluxo de caixa livre",
};
const EXTRA_META = {
  empresa: { nome: "Empresa", unidade: "txt" }, nome: { nome: "Nome", unidade: "txt" }, ticker: { nome: "Ticker", unidade: "txt" },
  setor_micro: { nome: "Setor", unidade: "txt", grupo: "Geral" }, setor_macro: { nome: "Setor macro", unidade: "txt", grupo: "Geral" },
  porte: { nome: "Porte", unidade: "txt", grupo: "Geral" }, tipo: { nome: "Tipo", unidade: "txt", grupo: "Geral" },
  var_ano: { nome: "Variação no ano", unidade: "pct", direcao: 1, grupo: "Preço" }, var_12m: { nome: "Variação em 12 meses", unidade: "pct", direcao: 1, grupo: "Preço" },
  var_5a: { nome: "Variação em 5 anos", unidade: "pct", direcao: 1, grupo: "Preço" },
  margem_fcl: { nome: "Margem de fluxo de caixa livre", unidade: "pct", direcao: 1, grupo: "Caixa", formula: "Fluxo de caixa livre de 12 meses (caixa operacional - investimentos) / receita de 12 meses. Mostra quanto de cada R$ 100 vendidos sobra em caixa." },
  valor_mercado_brl: { nome: "Valor de mercado em R$", unidade: "moeda_grande_brl", direcao: 0, grupo: "Geral", formula: "Valor de mercado em reais (BDR: em dólar x PTAX)." },
};
const ICONE_GRAF = '<svg viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>';
const ICONE_LUPA = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

/* =====================================================================
   ESTADO E UTILITÁRIOS
   ===================================================================== */
const D = {};
let charts = [];
const EST = { homeSeg: "ACAO_BR", tab: { seg: "TODOS", setor: "", porte: "", busca: "", preset: "padrao", sort: { k: "valor_mercado_brl", d: -1 }, colunas: null },
  rkSeg: "TODOS", rkSetor: "", rkAbertos: {}, rkListas: {}, scrFiltros: [],
  scr: { seg: "TODOS", macro: "", micro: "", porte: "", tirMin: "", liqMin: "", pioMin: "", semRec: true, cenario: "" } };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ok = (v) => typeof v === "number" && isFinite(v);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } };
const NF = (d) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const nf0 = NF(0), nf2 = NF(2);
const ND = '<span class="muted">n/d</span>';

function dataBR(s) { if (!s) return "n/d"; const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; }
function grande(v) {
  const a = Math.abs(v);
  if (a >= 1e12) return nf2.format(v / 1e12) + " tri";
  if (a >= 1e9) return nf2.format(v / 1e9) + " bi";
  if (a >= 1e6) return nf2.format(v / 1e6) + " mi";
  if (a >= 1e3) return nf2.format(v / 1e3) + " mil";
  return nf2.format(v);
}
function meta(k) { return (D.imeta.indicadores[k]) || EXTRA_META[k] || { nome: k, unidade: "x", direcao: 0, formula: "" }; }
function rot(k) { return ROT[k] || meta(k).nome; }
function moedaDe(t) { return (D.fund[t] && D.fund[t].moeda === "USD") ? "US$" : "R$"; }
function fmtU(v, u, moeda = "R$") {
  if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return ND;
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "string") return esc(v);
  switch (u) {
    case "pct": return nf2.format(v * 100) + "%";
    case "pct_int": return nf2.format(v) + "%";
    case "x": return nf2.format(v);
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
  return `<span class="pio" data-tip="Qualidade contábil: ${v} de 9 testes atendidos (Piotroski F-Score)."><span class="pio-dots">${Array.from({ length: 9 }, (_, i) => `<i class="${i < v ? "on" : ""}"></i>`).join("")}</span><b>${v}</b></span>`;
}
function A(t) { return D.univMap[t]; }
function isBDR(t) { return A(t).tipo.startsWith("BDR"); }
// empresas brasileiras listadas via BDR (Nu, Inter, XP...) aparecem junto das ações
function emAcoes(t) { const a = A(t); return a.tipo === "ACAO_BR" || a.grupo_site === "acoes"; }
function isFin(t) { return ["BANCO", "SEGURADORA"].includes(A(t).modelo_analise); }
function isRec(t) { return A(t).modelo_analise === "RECUPERACAO"; }
function isCripto(t) { return A(t).modelo_analise === "TESOURARIA_CRIPTO"; }
function semValuation(t) { return isRec(t) || isCripto(t); }
function estado(t) { return (D.fund[t] && D.fund[t].estado) || A(t).estado || null; }
function rotEstado(t) { const e = estado(t); return e ? (e.nivel === "controle" ? "Controle estatal" : "Influência estatal") : ""; }
function quadEstado(t) { const e = estado(t); return e ? `<i class="q-estatal" data-tip="${esc(rotEstado(t) + ": " + e.resumo)}" aria-label="${esc(rotEstado(t))}"></i>` : ""; }
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
    case "margem_fcl": { const i = ind(t); if (isFin(t) || !ok(i.fcl) || !ok(i.ev) || !ok(i.ev_receita) || !i.ev_receita) return null; const r = i.ev / i.ev_receita; return r > 0 ? i.fcl / r : null; }
    case "preco": case "var_mes": case "var_ano": case "var_12m": case "var_5a": case "max_52s": case "min_52s": return p[k] ?? null;
    default: { const v = ind(t)[k]; return v === undefined ? null : v; }
  }
}
function suprimido(t, k) { return semValuation(t) && SUPRIME_REC.has(k); }
function sinal(v) { return ok(v) ? (v > 0 ? "pos" : v < 0 ? "neg" : "") : ""; }
function varHtml(v) { return ok(v) ? `<span class="${sinal(v)}">${v > 0 ? "+" : ""}${nf2.format(v * 100)}%</span>` : ND; }
/* por que cada indicador importa (segundo ícone "?") */
const POR_QUE = {
  // tamanho e mercado
  preco: "É o ponto de partida de todos os múltiplos: o mesmo lucro pode ser barato ou caro dependendo do preço pago.",
  valor_mercado: "Mostra o tamanho da empresa na bolsa. Empresas grandes tendem a ser mais líquidas e estáveis; pequenas, mais voláteis e com mais espaço para crescer.",
  valor_mercado_brl: "Permite comparar o tamanho de empresas brasileiras e estrangeiras na mesma moeda.",
  ev: "Soma o valor das ações com a dívida líquida: é o preço de comprar a empresa inteira, base para comparar empresas com níveis de dívida diferentes.",
  liquidez_21: "Indica se dá para comprar e vender a ação sem mexer no preço. Baixa liquidez dificulta sair da posição.",
  liquidez_63: "Mesma leitura da liquidez de 21 dias, num período maior e mais estável.",
  volatilidade: "Mede o quanto o preço oscila. Mais volatilidade significa mais risco de quedas fortes no curto prazo.",
  beta: "Mostra o quanto a ação acompanha o mercado. Beta acima de 1 amplifica altas e quedas do Ibovespa.",
  drawdown_5a: "A maior queda do pico ao fundo em 5 anos: dá a dimensão do pior momento que o investidor já enfrentou.",
  // governança
  free_float: "Quanto maior a parte negociada em bolsa, mais liquidez e menor o poder isolado do controlador.",
  acoes: "Base dos indicadores por ação. Variações no número de ações mudam o quanto do lucro cabe a cada ação.",
  diluicao_3a: "Emissão de ações reduz a fatia de cada acionista no lucro. Recompra faz o contrário.",
  diluicao_5a: "Mesma leitura da diluição de 3 anos, num horizonte maior.",
  controlador_pct: "Mostra a concentração do poder de decisão. Controle forte pode alinhar ou conflitar com o minoritário.",
  tag_along: "Protege o minoritário: se o controle for vendido, ele recebe parte do prêmio pago ao controlador.",
  recompras_ltm: "Recompra devolve dinheiro ao acionista e aumenta a fatia de cada um no lucro.",
  // valuation
  pl: "Mostra quantos anos de lucro atual o preço paga. Quanto menor, mais barato em relação ao lucro; útil para comparar com o setor e com a própria história.",
  pvp: "Compara o preço com o patrimônio contábil. Importante em bancos e empresas de ativos: abaixo de 1, o mercado paga menos que o valor dos livros.",
  p_ebitda: "Compara o preço com a geração operacional de caixa, sem efeito de juros, impostos e depreciação.",
  p_ebit: "Compara o preço com o lucro operacional, antes de juros e impostos.",
  psr: "Útil para empresas com lucro baixo ou negativo: mostra quanto o mercado paga por cada real de receita.",
  p_ativo: "Indica quanto o mercado paga por cada real de ativos da empresa.",
  p_capital_giro: "Relaciona o preço com os recursos de curto prazo que a empresa tem para operar.",
  p_acl: "Compara o preço com os ativos de curto prazo líquidos; valores baixos indicam margem de segurança patrimonial.",
  ev_ebitda: "Considera a dívida: compara o valor total da empresa com a geração operacional. É o múltiplo mais usado para comparar empresas com estruturas de capital diferentes.",
  ev_ebit: "Como o EV/EBITDA, mas descontando a depreciação, que reflete o desgaste dos ativos.",
  ev_receita: "Compara o valor total da empresa com as vendas; útil para empresas ainda pouco lucrativas.",
  lpa: "É o lucro que cabe a cada ação. Crescimento consistente do LPA sustenta a valorização ao longo do tempo.",
  vpa: "É o patrimônio que cabe a cada ação; referência do valor contábil por papel.",
  peg: "Ajusta o P/L pelo crescimento: um P/L alto pode ser justo se o lucro cresce rápido. Até 1 sugere preço compatível com o crescimento.",
  earnings_yield: "É o inverso do P/L: o retorno do lucro sobre o preço. Permite comparar diretamente com a renda fixa.",
  fcf_yield: "Mostra quanto caixa livre a empresa gera para cada real pago na ação. Caixa, diferente do lucro contábil, não aceita ajustes: é o que paga dividendos e dívida.",
  pl_vs_media5: "Compara o P/L de hoje com a própria média de 5 anos: indica se a ação está mais cara ou mais barata que o normal dela.",
  evebitda_vs_media5: "Compara o EV/EBITDA de hoje com a média de 5 anos da própria empresa.",
  pvp_vs_media5: "Compara o P/VP de hoje com a média de 5 anos, leitura principal para bancos.",
  // TIR e crescimento implícito
  tir_lucro: "Estima o retorno anual que o preço embute pelo lucro. Permite comparar a ação com o retorno da renda fixa.",
  tir_caixa: "Mesma lógica da TIR pelo lucro, usando o caixa livre, que é mais difícil de maquiar.",
  tir_dcf: "Estima o retorno embutido no preço projetando o caixa futuro: é a leitura mais completa de quanto o preço promete.",
  tir_banco: "Para bancos, estima o retorno embutido no preço a partir do ROE e do quanto o lucro é distribuído.",
  tir_implicita: "Resume o retorno anual que o preço de hoje promete se a empresa mantiver o desempenho. Comparar com o juro do título público mostra se o risco compensa.",
  tir_spread_ref: "Mostra quanto a ação promete acima do título público de referência: é o prêmio por correr risco de bolsa.",
  cresc_implicito: "Mostra o crescimento que o preço exige. Se for maior que o histórico, o mercado aposta em algo que a empresa nunca entregou.",
  cresc_historico_ref: "Referência do que a empresa já entregou, para comparar com o crescimento que o preço exige.",
  cresc_gap: "Diferença entre o crescimento exigido pelo preço e o histórico: positivo indica expectativa exigente.",
  taxa_referencia: "Retorno mínimo que um investidor exige da bolsa: título público mais um prêmio de risco.",
  g: "Crescimento de longo prazo usado nas contas de retorno implícito.",
  wacc: "É o custo de todo o capital da empresa. Retorno abaixo dele significa que a empresa destrói valor mesmo dando lucro.",
  // endividamento
  divida_bruta: "Total de empréstimos e financiamentos; ponto de partida para avaliar o risco financeiro.",
  caixa: "Reserva que dá fôlego em crises e permite investir sem depender de crédito.",
  divida_liquida: "Dívida menos caixa: o que a empresa realmente deve. Negativo significa caixa maior que a dívida.",
  divliq_pl: "Mostra o peso da dívida em relação ao capital dos acionistas.",
  divliq_ebitda: "Quantos anos de geração operacional pagariam a dívida. Acima de 3x acende alerta, sobretudo com juros altos.",
  divliq_ebit: "Como a dívida/EBITDA, mas usando o lucro operacional depois da depreciação.",
  pl_ativos: "Mostra quanto dos ativos é financiado com capital próprio. Mais alto significa menos dependência de terceiros.",
  passivos_ativos: "Mostra quanto dos ativos é financiado por terceiros. Mais alto significa mais alavancagem.",
  liquidez_corrente: "Mede se os recursos de curto prazo cobrem as obrigações de curto prazo. Abaixo de 1 indica aperto de caixa.",
  liquidez_seca: "Como a liquidez corrente, sem contar estoques, que podem demorar a virar dinheiro.",
  liquidez_imediata: "Mostra quanto das obrigações de curto prazo o caixa paga hoje.",
  cobertura_juros: "Mostra se o lucro operacional paga os juros com folga. Abaixo de 2x, qualquer piora ameaça a saúde financeira.",
  divida_cp_pct: "Dívida concentrada no curto prazo aumenta o risco de refinanciamento em momentos de crédito caro.",
  // eficiência
  margem_bruta: "Mostra o poder de preço sobre o custo do produto. Margens brutas altas costumam indicar marca forte ou vantagem de custo.",
  margem_ebitda: "Mostra a eficiência operacional: quanto sobra de cada venda antes de juros, impostos e depreciação.",
  margem_ebit: "Eficiência operacional depois da depreciação, que reflete o custo de manter os ativos.",
  margem_liquida: "Mostra quanto de cada real vendido vira lucro para o acionista, depois de todos os custos.",
  giro_ativo: "Mostra quanto a empresa vende para cada real de ativos. Giro alto compensa margens baixas.",
  pmr: "Prazo médio para receber dos clientes. Prazos longos prendem caixa.",
  pme: "Prazo médio dos estoques. Estoques parados consomem caixa e podem perder valor.",
  pmp: "Prazo médio para pagar fornecedores. Prazos maiores financiam a operação.",
  ciclo_financeiro: "Tempo entre pagar fornecedores e receber dos clientes. Quanto menor, menos capital de giro a empresa precisa.",
  estab_margem: "Margens estáveis indicam negócio previsível; oscilações fortes elevam o risco.",
  // rentabilidade
  roe: "Mostra o retorno sobre o dinheiro dos acionistas. ROE alto e sustentável é sinal de negócio de qualidade.",
  roa: "Mostra o retorno sobre todos os ativos, independentemente de como são financiados.",
  roic: "Mostra o retorno sobre todo o capital investido. É o indicador mais direto de criação de valor quando comparado com o custo do capital.",
  roic_spread: "Diferença entre o ROIC e o custo do capital: positiva indica criação de valor.",
  piotroski: "Resume em uma nota de 0 a 9 se a saúde contábil melhorou no último ano: lucro, caixa, dívida, liquidez e eficiência. Notas altas indicam empresa em melhora.",
  nota_criterios: "Resume em uma nota de 0 a 10 quantos critérios fundamentalistas a empresa atende, pesados pela importância de cada um.",
  // crescimento
  cagr_receita_5a: "Mostra se a empresa ganha mercado. Crescimento de receita acima da inflação é a base do crescimento do lucro.",
  cagr_receita_10a: "Crescimento da receita num horizonte longo, que atravessa ciclos econômicos.",
  cagr_ebitda_5a: "Mostra se a geração operacional acompanha o crescimento das vendas.",
  cagr_ebitda_10a: "Crescimento da geração operacional em 10 anos.",
  cagr_lucro_5a: "É o motor da valorização no longo prazo: lucro que cresce sustenta preço e dividendos maiores.",
  cagr_lucro_10a: "Crescimento do lucro em 10 anos, que mostra a consistência ao longo de ciclos.",
  cagr_lpa_5a: "Crescimento do lucro por ação, já descontando emissões de ações.",
  cagr_lpa_10a: "Crescimento do lucro por ação em 10 anos.",
  cagr_dpa_5a: "Mostra se os proventos por ação vêm crescendo, importante para quem busca renda.",
  cagr_dpa_10a: "Crescimento dos proventos por ação em 10 anos.",
  cresc_receita_ltm: "Mostra o ritmo mais recente de vendas, antes de aparecer nas médias de longo prazo.",
  cresc_lucro_ltm: "Mostra o ritmo mais recente do lucro; quedas aqui antecipam problemas.",
  consist_receita: "Crescimento em muitos anos seguidos indica negócio resiliente.",
  consist_lucro: "Lucro que cresce na maioria dos anos é mais confiável que saltos isolados.",
  // caixa
  fco: "É o dinheiro que a operação de fato gera; é mais difícil de maquiar que o lucro.",
  capex: "Investimento em ativos. Necessário para crescer, mas consome caixa que poderia ir para o acionista.",
  fcl: "É o caixa que sobra depois de operar e investir. É ele que paga dividendos, recompras e dívida: a melhor medida da capacidade real de gerar dinheiro.",
  margem_fcl: "Mostra quanto de cada real vendido vira caixa livre. Empresas com margem de caixa alta financiam o próprio crescimento e remuneram o acionista.",
  ebitda: "Aproxima a geração operacional de caixa e é a base dos principais múltiplos de dívida e valuation.",
  capex_depreciacao: "Acima de 1, a empresa investe mais do que o desgaste dos ativos, sinal de expansão; abaixo, pode estar sucateando.",
  conversao_caixa: "Mostra se o lucro vira dinheiro. Abaixo de 0,5 o lucro contábil não está se transformando em caixa.",
  // proventos
  dpa_12m: "É o valor pago por ação nos últimos 12 meses, base do dividend yield.",
  dy: "Mostra o retorno em proventos sobre o preço. Importante para quem busca renda, mas só vale se for sustentável.",
  dy_medio_5a: "A média de 5 anos evita olhar um ano atípico de proventos.",
  payout: "Mostra quanto do lucro é distribuído. Acima de 100%, a empresa paga mais do que lucra, o que não se sustenta.",
  dividendos_sobre_fcl: "Mostra se os proventos cabem no caixa livre. Acima de 1, a empresa paga com caixa acumulado ou dívida.",
  anos_pagando: "Anos seguidos pagando proventos indicam disciplina e previsibilidade de renda.",
  anos_corte: "Cortes frequentes de proventos indicam renda menos confiável.",
  jcp_pct_12m: "JCP tem tributação diferente de dividendos para o investidor; a proporção afeta o retorno líquido.",
  // bancos e seguradoras
  nim: "Margem financeira sobre os ativos: é a principal fonte de lucro de um banco.",
  indice_eficiencia: "Mostra quanto o banco gasta para gerar receita. Quanto menor, mais eficiente.",
  custo_credito_sobre_margem: "Mostra quanto da margem financeira é consumido por calotes. Alto indica risco de crédito.",
  cresc_carteira: "Crescimento da carteira de crédito, motor da receita futura do banco.",
  basileia: "Mede o colchão de capital do banco frente aos riscos. Abaixo do mínimo regulatório limita crescimento e dividendos.",
  inadimplencia_90: "Mostra a qualidade da carteira de crédito: alta inadimplência corrói o lucro.",
  cobertura_pdd: "Mostra quanto das perdas esperadas já está provisionado. Alta cobertura protege resultados futuros.",
  resultado_financeiro_sobre_lucro: "Mostra quanto do lucro da seguradora vem das aplicações financeiras, sensível à taxa de juros.",
  indice_combinado: "Abaixo de 100% a operação de seguros dá lucro antes do resultado financeiro.",
  sinistralidade: "Mostra quanto dos prêmios vira pagamento de sinistros. Quanto menor, mais rentável a carteira.",
  // holding, cripto, BDR
  soma_partes: "Referência do valor das participações a preço de mercado, para medir o desconto da holding.",
  desconto_holding: "Holdings costumam negociar abaixo da soma das partes; desconto acima do histórico pode indicar oportunidade ou problema de governança.",
  btc_em_caixa: "Em empresas de tesouraria em bitcoin, o valor depende diretamente da quantidade de BTC.",
  valor_btc: "Valor de mercado do bitcoin em caixa, base para medir o prêmio pago pela ação.",
  mnav: "Acima de 1, o investidor paga mais pela ação do que valeria comprar o bitcoin diretamente.",
  btc_por_acao: "Mostra quanto bitcoin cada ação representa; emissões de ações diluem esse número.",
  bdr_preco_justo: "Preço do BDR pela cotação lá fora e pelo câmbio: mostra se o BDR está alinhado ao papel original.",
  bdr_agio: "Ágio significa pagar mais do que o papel vale lá fora; deságio, menos.",
  aluguel_valor: "Mostra o tamanho da aposta contra a ação no mercado de aluguel. Posições grandes indicam que muitos investidores esperam queda.",
  aluguel_pct_ff: "Mostra quanto das ações disponíveis no mercado está vendido. Percentuais altos indicam pessimismo concentrado e risco de alta rápida se os vendidos precisarem recomprar.",
  aluguel_dias: "Mostra quantos dias de negociação normal seriam necessários para recomprar toda a posição vendida. Quanto maior, mais difícil e cara a saída dos vendidos.",
  setor_micro: "Empresas do mesmo setor têm margens, dívida e múltiplos parecidos: compare sempre dentro do setor.",
  var_12m: "Mostra o desempenho recente do preço; útil para contexto, não para conclusão sobre o negócio.",
};
function porQue(k) { return POR_QUE[k] || ""; }
function tip(k) {
  const m = meta(k), pq = porQue(k);
  return (m.formula ? `<i class="info" data-tip="${esc(m.nome + ": " + m.formula)}">i</i>` : "") + (pq ? `<i class="info porque" data-tip="${esc("Por que importa: " + pq)}">?</i>` : "");
}
function logo(t, cls = "") {
  if (D.logos.has(t)) return `<span class="logo ${cls}"><img src="assets/logos/${t}.svg" alt="" loading="lazy"></span>`;
  return `<span class="logo ini ${cls}">${esc(t.replace(/\d+$/, "").slice(0, 4))}</span>`;
}
function empresa(t, opts = {}) {
  const tag = opts.link === false ? "span" : "a";
  const href = opts.link === false ? "" : ` href="#/ativo/${t}"`;
  return `<${tag} class="empresa"${href}>${logo(t, opts.cls || "")}<span class="nomes"><span class="tk">${t}${quadEstado(t)}${isRec(t) && !opts.semBadge ? '<span class="badge rec">Em recuperação</span>' : ""}</span>${opts.semNome ? "" : `<span class="nm">${esc(A(t).nome)}</span>`}</span></${tag}>`;
}
const mediana = (a) => { const v = a.filter(ok).sort((x, y) => x - y); if (!v.length) return null; const m = Math.floor(v.length / 2); return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
function cor(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function stripTags(s) { return String(s).replace(/<[^>]+>/g, ""); }
function filtroSeg(lista, seg) {
  if (!seg || seg === "TODOS") return lista;
  if (seg === "BDR") return lista.filter((t) => !emAcoes(t));
  if (seg === "ACAO_BR") return lista.filter(emAcoes);
  return lista.filter((t) => A(t).tipo === seg);
}

/* =====================================================================
   CARGA
   ===================================================================== */
async function j(url, opcional) {
  try { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  catch (e) { if (opcional !== undefined) return opcional; throw new Error(`Falha ao carregar ${url}: ${e.message}`); }
}
async function carregar() {
  const [meta_, macro, prices, fund, univ, imeta, notes, config, logos, fiisIdx] = await Promise.all([
    j("data/meta.json"), j("data/macro.json", {}), j("data/prices.json"), j("data/fundamentals.json"), j("data/universe.json"),
    j("data/indicators_meta.json"), j("data/notes.json", {}), j("data/config.json", {}), j("assets/logos/_index.json", []), j("data/fiis/_index.json", { fiis: [] })]);
  Object.assign(D, { meta: meta_, macro, prices, fund, imeta, notes, config, cache: {}, logos: new Set(logos) });
  D.univ = univ.filter((a) => fund[a.ticker]);
  D.univMap = Object.fromEntries(univ.map((a) => [a.ticker, a]));
  D.tickers = D.univ.map((a) => a.ticker);
  D.fiis = (fiisIdx && fiisIdx.fiis) || [];
  D.fiiMap = Object.fromEntries(D.fiis.map((f) => [f.ticker, f]));
  D.vivoFii = {};
}
const RAMO_VIVO = "https://raw.githubusercontent.com/luizfrb529/analise-fundamentalista/refs/heads/mercado/";
async function jsonVivo(arquivo) {
  try {
    const r = await fetch(`${RAMO_VIVO}${arquivo}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return Date.now() - new Date(j.atualizado_em).getTime() < 36 * 3600e3 ? j : null;   // ignora arquivo velho
  } catch (e) { return null; }
}
async function precosAoVivo() {
  const j = await jsonVivo("precos.json");
  if (!j) return;
  for (const [t, v] of Object.entries(j.precos || {})) {
    const p = D.prices[t];
    if (D.fiiMap && D.fiiMap[t] && ok(v.preco)) { D.vivoFii[t] = { ...v, ao_vivo: j.atualizado_em }; continue; }
    if (!p || !ok(v.preco) || (p.data && v.data < p.data)) continue;
    D.prices[t] = { ...p, preco: v.preco, var_dia: v.var_dia, data: v.data, ao_vivo: j.atualizado_em };
  }
}
async function noticiasAoVivo() {
  if (D.cache.vivoNot === undefined) D.cache.vivoNot = await jsonVivo("noticias.json");
  return D.cache.vivoNot;
}
async function historico(t) {
  if (!D.cache["h" + t]) D.cache["h" + t] = await j(`data/history/${t}.json`, { anual: {}, precos: { semanal: [], diario: [] } });
  return D.cache["h" + t];
}
async function noticias(t) {
  if (!D.cache["n" + t]) {
    const [base, vivo] = await Promise.all([j(`data/news/${t}.json`, { noticias: [], comunicados: [] }), noticiasAoVivo()]);
    const nv = vivo && vivo.por_ticker && vivo.por_ticker[t];
    D.cache["n" + t] = nv && nv.length ? { ...base, noticias: nv } : base;
  }
  return D.cache["n" + t];
}
async function proventos(t) {
  if (!D.cache.div) D.cache.div = await j("data/dividends.json", {});
  return D.cache.div[t] || { lista: [], por_ano: {} };
}

/* =====================================================================
   SELOS DE DESTAQUE
   ===================================================================== */
function pontos(t) {
  const i = ind(t), r = CONFIG.RISCOS, f = CONFIG.FORTALEZAS, sn = i.sinais || {}, out = [];
  const add = (tipo, rotulo, det) => out.push({ tipo, rot: rotulo, det });
  if (!isFin(t)) {
    if (ok(i.divliq_ebitda) && i.divliq_ebitda > r.divliq_ebitda_max) add("neg", "Alavancagem alta", `Dívida líquida de ${nf2.format(i.divliq_ebitda)}x o EBITDA.`);
    if (ok(i.cobertura_juros) && i.cobertura_juros < r.cobertura_juros_min) add("neg", "Juros pesam no resultado", `EBIT cobre ${nf2.format(i.cobertura_juros)}x as despesas financeiras.`);
    if (sn.fcl_negativo_anos >= r.fcl_negativo_anos) add("neg", "Queima de caixa", `Fluxo de caixa livre negativo há ${sn.fcl_negativo_anos} exercícios.`);
  }
  if (ok(i.payout) && i.payout > r.payout_max) add("alerta", "Payout acima do lucro", `Distribui ${nf2.format(i.payout * 100)}% do lucro de 12 meses.`);
  if (ok(i.diluicao_3a) && i.diluicao_3a > r.diluicao_3a_max) add("alerta", "Diluição", `Número de ações subiu ${nf2.format(i.diluicao_3a * 100)}% em 3 anos.`);
  if (sn.margem_queda_3a) add("alerta", "Margem em queda", "Margem líquida caindo há 3 exercícios.");
  if (sn.lucro_caindo) add("alerta", "Lucro em queda", "Lucro de 12 meses abaixo do período anterior.");
  if (ok(i.pl) && i.pl < r.armadilha_pl_max && sn.lucro_caindo && sn.divida_subindo) add("neg", "Possível armadilha de valor", "P/L baixo com lucro caindo e dívida subindo.");
  if (!semValuation(t) && ok(i.cresc_gap) && i.cresc_gap > r.gap_crescimento_max) add("alerta", "Preço exige crescimento alto", `O preço embute ${nf2.format(i.cresc_implicito * 100)}% ao ano, acima do histórico.`);
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
  fecharModal();
  const { r, p, q } = rota();
  let ativoMenu = r;
  if (r === "ativos" || r === "filtros") ativoMenu = q.get("seg") === "BDR" ? "bdrs" : "acoes";
  if (r === "ativo" && D.univMap[p.toUpperCase()]) ativoMenu = emAcoes(p.toUpperCase()) ? "acoes" : "bdrs";
  $$(".menu-item > a").forEach((a) => a.classList.toggle("ativo", a.dataset.rota === ativoMenu));
  $("#menu").classList.remove("aberto");
  const app = $("#app");
  try {
    if (r === "") pgHome(app);
    else if (r === "ativos") pgAtivos(app, q);
    else if (r === "rankings") pgRankings(app, q);
    else if (r === "ativo") await pgAtivo(app, p.toUpperCase());
    else if (r === "comparar") pgComparar(app, q);
    else if (r === "calendario") pgCalendario(app, q);
    else if (r === "retorno") await pgRetorno(app, q);
    else if (r === "mapa") pgMapa(app, q);
    else if (r === "simulador") await pgSimulador(app, q);
    else if (r === "fiis") pgFiis(app, q);
    else if (r === "fii") await pgFii(app, p.toUpperCase());
    else if (r === "filtros") pgFiltros(app);
    else app.innerHTML = '<div class="cartao"><h1>Página não encontrada</h1><p><a class="lk" href="#/">Voltar ao início</a></p></div>';
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="cartao"><h2>Erro ao montar a página</h2><p class="sub">${esc(e.message)}</p></div>`;
  }
  window.scrollTo(0, 0);
}
function trilha(itens) { return `<nav class="trilha-nav"><a href="#/">Início</a>${itens.map(([n, h]) => ` › ${h ? `<a href="${h}">${esc(n)}</a>` : `<span>${esc(n)}</span>`}`).join("")}</nav>`; }
function pilulasData() {
  return `<div class="datas"><span class="pilula"><i></i>Fechamento de ${dataBR(D.meta.data_fechamento)}</span><span class="pilula">Balanços até o ${esc(D.meta.balancos_ate || "n/d")}</span></div>`;
}

/* =====================================================================
   MENU SUSPENSO
   ===================================================================== */
function itemMenu(t) { return `<a class="item" href="#/ativo/${t}">${logo(t, "p")}<span><b>${t}</b><small>${esc(A(t).nome)}</small></span></a>`; }
function montarMenus() {
  const acoes = D.tickers.filter(emAcoes);
  const setores = [...new Set(acoes.map((t) => A(t).setor_macro))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  $("#mega-acoes").innerHTML = `
    <div class="mega-col"><h5>Setores</h5>${setores.map((s) => `<a class="item" href="#/ativos?seg=ACAO_BR&setor=${encodeURIComponent(s)}">${esc(s)}</a>`).join("")}</div>
    <div class="mega-col"><h5>Listas rápidas</h5>
      <a class="item" href="#/rankings?foco=roe&seg=ACAO_BR">Maior ROE</a>
      <a class="item" href="#/rankings?foco=dy&seg=ACAO_BR">Maior dividend yield</a><a class="item" href="#/rankings?seg=ACAO_BR">Nota por critérios</a><a class="item" href="#/rankings?foco=piotroski&seg=ACAO_BR">Qualidade contábil</a>
      <a class="item" href="#/rankings?foco=pl&seg=ACAO_BR">Menor P/L</a><a class="item" href="#/ativos?seg=ACAO_BR&porte=small">Small caps</a><a class="item" href="#/rankings?foco=vendida&seg=ACAO_BR">Maiores posições vendidas</a>
      <a class="item" href="#/filtros">Filtros avançados</a></div>
    <div class="rodape-mega"><a class="lk" href="#/ativos?seg=ACAO_BR">Ver todas as ações →</a></div>`;
  const bdrs = D.tickers.filter((t) => !emAcoes(t)).sort((a, b) => (ind(b).valor_mercado_brl || 0) - (ind(a).valor_mercado_brl || 0));
  $("#mega-bdrs").innerHTML = `
    <div class="mega-col"><h5>Setores</h5>${[...new Set(D.tickers.filter((t) => !emAcoes(t)).map((t) => A(t).setor_macro))].sort((a, b) => a.localeCompare(b, "pt-BR")).map((x) => `<a class="item" href="#/ativos?seg=BDR&setor=${encodeURIComponent(x)}">${esc(x)}</a>`).join("")}</div>
    <div class="mega-col"><h5>Listas rápidas</h5><a class="item" href="#/rankings?seg=BDR">Nota por critérios</a><a class="item" href="#/rankings?foco=roe&seg=BDR">Maior ROE</a><a class="item" href="#/rankings?foco=margem&seg=BDR">Maior margem líquida</a>
      <a class="item" href="#/rankings?foco=cresc&seg=BDR">Crescimento do lucro</a><a class="item" href="#/rankings?foco=piotroski&seg=BDR">Qualidade contábil</a></div>
    <div class="rodape-mega"><a class="lk" href="#/ativos?seg=BDR">Ver todos os BDRs →</a></div>`;
  $$(".mega a").forEach((a) => a.addEventListener("click", () => { a.blur(); document.activeElement && document.activeElement.blur(); }));
}

/* =====================================================================
   INÍCIO
   ===================================================================== */
const LISTAS_HOME = [
  { id: "dy", nome: "Maiores dividend yield", desc: "Últimos 12 meses, de quem distribui menos do que lucra.", k: "dy", dir: 1, f: (t) => ok(ind(t).payout) && ind(t).payout > 0 && ind(t).payout < 1, link: "#/rankings?foco=dy" },
  { id: "vm", nome: "Maiores por valor de mercado", desc: "Empresas ordenadas pelo valor de mercado em reais.", k: "valor_mercado_brl", dir: 1, f: () => true, link: "#/ativos" },
  { id: "roe", nome: "Maior ROE", desc: "Lucro de 12 meses sobre o patrimônio líquido.", k: "roe", dir: 1, f: (t) => !isRec(t), link: "#/rankings?foco=roe" },
  { id: "nota", nome: "Melhor nota por critérios", desc: "Critérios fundamentalistas ponderados por importância, de 0 a 10.", k: "nota_criterios", dir: 1, f: (t) => entraNota(t), link: "#/rankings", desempate: "roe" },
  { id: "pl", nome: "Menor P/L", desc: "Preço sobre lucro, só empresas com lucro positivo.", k: "pl", dir: -1, f: (t) => !semValuation(t) && ind(t).pl > 0, link: "#/rankings?foco=pl" },
  { id: "small", nome: "Small caps com maior ROE", desc: "Valor de mercado até R$ 10 bilhões.", k: "roe", dir: 1, f: (t) => !isRec(t) && ok(ind(t).valor_mercado_brl) && ind(t).valor_mercado_brl <= CONFIG.SMALL_CAP_MAX, link: "#/ativos?porte=small" },
];
function topLista(L, base, n = 5) {
  return base.filter(L.f).map((t) => [t, val(t, L.k)]).filter(([, v]) => ok(v))
    .sort((a, b) => (L.dir > 0 ? b[1] - a[1] : a[1] - b[1]) || (L.desempate ? (ind(b[0])[L.desempate] || 0) - (ind(a[0])[L.desempate] || 0) : 0)).slice(0, n);
}
const fiiPvp = (f) => { const p = fiiPreco(f.ticker, f.preco); return ok(p) && ok(f.vp_cota) && f.vp_cota > 0 ? p / f.vp_cota : f.p_vp; };
const fiiDy = (f) => { if (f.dy_parcial_meses) return null; const p = fiiPreco(f.ticker, f.preco); return ok(p) && ok(f.rend_12m) && p > 0 ? f.rend_12m / p : f.dy_12m; };
const FII_METRICAS = {
  dy: { nome: "Maiores dividend yield", curto: "DY 12m", desc: "Rendimentos dos últimos 12 meses sobre o preço da cota.", v: fiiDy, dir: 1, fmt: (v) => fmtU(v, "pct") },
  pl: { nome: "Maior patrimônio líquido", curto: "Patrimônio", desc: "Tamanho do fundo pelo último informe entregue à CVM.", v: (f) => f.pl, dir: 1, fmt: (v) => "R$ " + grande(v) },
  pvp: { nome: "Menor P/VP", curto: "P/VP", desc: "Preço da cota sobre o valor patrimonial por cota.", v: (f) => { const x = fiiPvp(f); return ok(x) && x > 0 ? x : null; }, dir: -1, fmt: (v) => fmtU(v, "x") },
  cresc: { nome: "Rendimentos que mais cresceram", curto: "Rend. 3 anos", desc: "Crescimento anual dos rendimentos por cota em 3 anos, ajustado por desdobramentos.", v: (f) => f.cagr_rend_3a, dir: 1, fmt: (v) => fmtU(v, "pct") },
  liq: { nome: "Maior liquidez diária", curto: "Liquidez diária", desc: "Volume médio negociado nos últimos 21 pregões.", v: (f) => f.liquidez_21, dir: 1, fmt: (v) => "R$ " + grande(v) },
  vp: { nome: "Valor patrimonial que mais cresceu", curto: "VP 3 anos", desc: "Crescimento anual da cota patrimonial em 3 anos, ajustado por desdobramentos.", v: (f) => f.cagr_vp_3a, dir: 1, fmt: (v) => fmtU(v, "pct") },
};
function topFii(k, lista, n = 5) {
  const M = FII_METRICAS[k];
  return lista.map((f) => [f, M.v(f)]).filter(([, v]) => ok(v)).sort((a, b) => M.dir > 0 ? b[1] - a[1] : a[1] - b[1]).slice(0, n);
}
const fundoHtml = (f, link = false) => `<${link ? `a href="#/fii/${f.ticker}"` : "span"} class="empresa">${logo(f.ticker)}<span class="nomes"><span class="tk">${f.ticker}</span><span class="nm">${esc(f.nome || "")}</span></span></${link ? "a" : "span"}>`;
const SETORES_PERENES = ["Energia elétrica", "Saneamento", "Seguros", "Telecom", "Financeiro"];
async function feedNoticias() {
  if (!D.cache.feed) {
    const [base, vivo] = await Promise.all([j("data/news/_feed.json", { noticias: [], comunicados: [] }), noticiasAoVivo()]);
    D.cache.feed = vivo && vivo.feed && vivo.feed.length ? { ...base, noticias: vivo.feed } : base;
  }
  return D.cache.feed;
}
function pgHome(app) {
  const nome = () => EST.homeSeg === "BDR" ? "BDRs" : EST.homeSeg === "FII" ? "FIIs" : "ações";
  EST.homeSetores = EST.homeSetores || [];
  EST.homeFeed = EST.homeFeed || { aba: "noticias", n: 15 };
  app.innerHTML = `
  <section class="hero">
    <h1>Análise fundamentalista das empresas da B3</h1>
    <p>Indicadores, qualidade e valuation de ${D.tickers.length} ações e BDRs${(D.fiis || []).length ? ` e ${D.fiis.length} fundos imobiliários` : ""}, calculados a partir das demonstrações e informes oficiais.</p>
    <div class="busca-grande busca"><input type="search" id="busca-home" placeholder="Digite o nome da empresa, o código ou o setor" autocomplete="off" aria-label="Buscar ativo">
      <button class="ir" id="busca-home-ir" aria-label="Buscar">${ICONE_LUPA}</button><div class="busca-lista" id="busca-home-lista" hidden></div></div>
    <div class="linha centro" style="margin-top:26px"><div class="segmentado" id="home-seg"><button data-s="ACAO_BR" class="${EST.homeSeg === "ACAO_BR" ? "ativo" : ""}">Ações</button><button data-s="BDR" class="${EST.homeSeg === "BDR" ? "ativo" : ""}">BDRs</button><button data-s="FII" class="${EST.homeSeg === "FII" ? "ativo" : ""}">FIIs</button></div></div>
  </section>
  <div class="filtro-setores">
    <div class="linha">
      <div class="dropdown"><button class="btn peq" id="fs-btn">Setores <span id="fs-qtd"></span> ▾</button><div class="dropdown-painel" id="fs-painel" hidden></div></div>
      <div class="chips" id="fs-chips"></div>
      <button class="btn peq" id="fs-limpar" hidden>Limpar filtro ✕</button>
    </div>
    <div class="perenes" id="perenes">
      <div><b>Setores perenes</b> <span class="sub">Energia elétrica, saneamento, telecom, seguros e bancos. Vendem serviços essenciais, com demanda estável mesmo em crise, contratos regulados e histórico de dividendos. Tendem a cair menos em recessões, mas também crescem menos nos ciclos de alta.</span></div>
      <button class="btn peq" id="fs-perenes">Ver só os perenes</button>
    </div>
  </div>
  <section class="secao">
    <div class="secao-cab"><h2 class="titulo-barra" id="tit-listas"></h2></div>
    <div class="listas" id="listas"></div>
    <div class="linha centro" style="margin-top:22px"><a class="btn-contorno" id="link-tabela" href="#/ativos">Ver tabela completa ›</a></div>
  </section>
  <section class="secao">
    <div class="secao-cab"><h2 class="titulo-barra" id="tit-agenda">Próximos resultados</h2><div class="linha" id="home-ag-acoes"><button class="btn peq" id="home-ag-xls">Baixar Excel</button><a class="lk" href="#/calendario">Ver calendário completo →</a></div></div>
    <div class="ag-faixa" id="home-agenda"></div>
  </section>
  <section class="secao">
    <div class="secao-cab"><h2 class="titulo-barra" id="tit-setores"></h2><span class="sub" id="sub-setores">Medianas de P/L, ROE e dividend yield de cada setor</span></div>
    <div class="setores" id="setores"></div>
  </section>
  <section class="secao">
    <div class="secao-cab"><h2 class="titulo-barra" id="tit-feed">Notícias e comunicados</h2>
      <div class="abas" id="feed-abas" style="margin:0"><button data-a="noticias">Imprensa</button><button data-a="comunicados">Relações com investidores</button></div></div>
    <div class="cartao" id="feed"><div class="carregando"><span></span>Carregando</div></div>
  </section>`;
  ligarBusca($("#busca-home"), $("#busca-home-lista"), $("#busca-home-ir"));
  const ehFii = () => EST.homeSeg === "FII";
  const setoresDoSeg = () => ehFii() ? [...new Set((D.fiis || []).map((f) => f.setor || "Outros"))].sort((a, b) => a.localeCompare(b, "pt-BR"))
    : [...new Set(filtroSeg(D.tickers, EST.homeSeg).map((t) => A(t).setor_macro))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const baseFii = () => (D.fiis || []).filter((f) => !EST.homeSetores.length || EST.homeSetores.includes(f.setor || "Outros"));
  const base = () => {
    const l = filtroSeg(D.tickers, EST.homeSeg);
    return EST.homeSetores.length ? l.filter((t) => EST.homeSetores.includes(A(t).setor_macro)) : l;
  };
  const painel = () => {
    const ss = setoresDoSeg();
    $("#fs-painel").innerHTML = `<div><b>Escolha um ou mais setores</b></div>
      ${ss.map((x) => `<label><input type="checkbox" value="${esc(x)}" ${EST.homeSetores.includes(x) ? "checked" : ""}> ${esc(x)}${!ehFii() && SETORES_PERENES.includes(x) ? ' <span class="badge pos">perene</span>' : ""}</label>`).join("")}`;
    $("#fs-painel").onchange = (e) => { const v = e.target.value; EST.homeSetores = e.target.checked ? [...EST.homeSetores, v] : EST.homeSetores.filter((x) => x !== v); desenhar(); };
  };
  $("#fs-btn").onclick = (e) => { e.stopPropagation(); painel(); $("#fs-painel").hidden = !$("#fs-painel").hidden; };
  document.addEventListener("click", (e) => { const p = $("#fs-painel"); if (p && !p.contains(e.target) && e.target.id !== "fs-btn") p.hidden = true; });
  $("#fs-perenes").onclick = () => { EST.homeSetores = SETORES_PERENES.filter((x) => setoresDoSeg().includes(x)); desenhar(); };
  const desenharFeed = async () => {
    if (ehFii()) return desenharFeedFii();
    const f = await feedNoticias(), perm = new Set(base()), aba = EST.homeFeed.aba;
    $$("#feed-abas button").forEach((b) => b.classList.toggle("ativo", b.dataset.a === aba));
    const itens = (f[aba] || []).filter((x) => (x.tickers || []).some((t) => perm.has(t)));
    const mostra = itens.slice(0, EST.homeFeed.n);
    $("#feed").innerHTML = mostra.length ? `<div class="feed">${mostra.map((x) => {
      const ts = (x.tickers || []).filter((t) => perm.has(t)).slice(0, 4);
      const quando = x.data ? (aba === "noticias" ? new Date(x.data).toLocaleDateString("pt-BR") : dataBR(x.data)) : "";
      return `<div class="feed-item"><div class="feed-logos">${ts.map((t) => `<a href="#/ativo/${t}" data-tip="${esc(A(t).nome)}">${logo(t, "p")}</a>`).join("")}</div>
        <div style="min-width:0"><a class="feed-tit" href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.titulo)}</a>
        <div class="meta">${ts.map((t) => `<a href="#/ativo/${t}"><b>${t}</b></a>`).join(" · ")} · ${esc(aba === "noticias" ? (x.veiculo || "") : (x.categoria || ""))} · ${quando}</div></div></div>`; }).join("")}</div>
      ${itens.length > mostra.length ? `<div class="linha centro" style="margin-top:12px"><button class="btn-contorno" id="feed-mais">Ver mais (${itens.length - mostra.length})</button></div>` : ""}
      <p class="sub" style="margin-top:10px">${aba === "noticias" ? "Imprensa: Google News, atualizado diariamente. A imprensa interpreta; o comunicado oficial é a fonte." : "Relações com investidores: fatos relevantes, releases e apresentações de resultados (CVM) e resultados entregues à SEC."}</p>`
      : '<p class="vazio">Sem itens para os setores selecionados.</p>';
    if ($("#feed-mais")) $("#feed-mais").onclick = () => { EST.homeFeed.n += 15; desenharFeed(); };
  };
  $$("#feed-abas button").forEach((b) => b.onclick = () => { EST.homeFeed = { aba: b.dataset.a, n: 15 }; desenharFeed(); });
  let nDocsFii = 15;
  const desenharFeedFii = () => {
    const docs = baseFii().flatMap((f) => (f.docs || []).map((x) => ({ ...x, f }))).sort((a, b) => String(b.entrega || "").localeCompare(String(a.entrega || "")));
    const mostra = docs.slice(0, nDocsFii);
    $("#feed").innerHTML = mostra.length ? `<div class="feed">${mostra.map((x) => `<div class="feed-item"><div class="feed-logos"><a href="#/fii/${x.f.ticker}" data-tip="${esc(x.f.nome)}">${logo(x.f.ticker, "p")}</a></div>
        <div style="min-width:0"><a class="feed-tit" href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.tipo || x.categoria)}</a>
        <div class="meta"><a href="#/fii/${x.f.ticker}"><b>${x.f.ticker}</b></a> · ${esc(x.categoria || "")} · ${dataBR(String(x.entrega || "").slice(0, 10))}</div></div></div>`).join("")}</div>
      ${docs.length > mostra.length ? `<div class="linha centro" style="margin-top:12px"><button class="btn-contorno" id="feed-mais">Ver mais (${docs.length - mostra.length})</button></div>` : ""}
      <p class="sub" style="margin-top:10px">Documentos oficiais mais recentes de cada fundo: FundosNet (B3) para FIIs e Fiagros, CVM para FI-Infra.</p>`
      : '<p class="vazio">Sem documentos para os setores selecionados.</p>';
    if ($("#feed-mais")) $("#feed-mais").onclick = () => { nDocsFii += 15; desenharFeedFii(); };
  };
  const desenharFii = (sufixo) => {
    const lista = baseFii(), um = EST.homeSetores.length === 1 ? EST.homeSetores[0] : "";
    $("#tit-agenda").textContent = "Próximos pagamentos de rendimentos";
    $("#home-ag-acoes").hidden = true;
    $("#tit-feed").textContent = "Comunicados dos fundos";
    $("#feed-abas").hidden = true;
    $("#sub-setores").textContent = "Medianas de P/VP e dividend yield e soma do patrimônio de cada setor";
    $("#link-tabela").href = `#/fiis${um ? "?setor=" + encodeURIComponent(um) : ""}`;
    $("#link-tabela").textContent = "Ver todos os fundos ›";
    const hoje = new Date().toISOString().slice(0, 10);
    const prox = lista.filter((f) => f.prox && f.prox.pagamento && f.prox.pagamento > hoje).sort((a, b) => a.prox.pagamento.localeCompare(b.prox.pagamento));
    $("#home-agenda").innerHTML = prox.slice(0, 8).map((f) => { const dtx = new Date(f.prox.pagamento + "T12:00:00");
      return `<a class="ag-linha" href="#/fii/${f.ticker}" data-tip="${esc(`${f.ticker}: R$ ${nf2.format(f.prox.valor)} por cota, data com ${dataBR(f.prox.data_base)}, pagamento ${dataBR(f.prox.pagamento)}.`)}">
        <div class="ag-data"><b>${String(dtx.getDate()).padStart(2, "0")}</b><span>${MESES[dtx.getMonth()].slice(0, 3)}</span></div>
        <div style="min-width:0">${fundoHtml(f)}</div>
        <div class="ag-info"><span class="badge pos">R$ ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(f.prox.valor)}</span><span class="ag-conf muted">data com ${dataBR(f.prox.data_base)}</span><small class="muted">${DIAS[dtx.getDay()]}</small></div></a>`; }).join("")
      || '<p class="vazio">Nenhum pagamento anunciado para os próximos dias. Os avisos costumam sair no fim de cada mês.</p>';
    $("#listas").innerHTML = Object.entries(FII_METRICAS).map(([k, M]) => {
      const top = topFii(k, lista);
      if (!top.length) return "";
      return `<div class="lista"><h3>${esc(M.nome)}</h3><p class="sub">${esc(M.desc)}</p>
        ${top.map(([f, v]) => `<div class="lin"><div>${fundoHtml(f)}<div class="valor">${M.fmt(v)}</div></div><a class="btn-ver" href="#/fii/${f.ticker}">Ver fundo</a></div>`).join("")}
        <a class="btn-contorno" href="#/fiis?ordem=${k}${um ? "&setor=" + encodeURIComponent(um) : ""}">Ver lista ›</a></div>`;
    }).join("") || '<p class="vazio">Sem fundos neste recorte.</p>';
    const por = {};
    for (const f of lista) (por[f.setor || "Outros"] = por[f.setor || "Outros"] || []).push(f);
    $("#setores").innerHTML = Object.entries(por).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR")).map(([s0, l]) => {
      const top = [...l].sort((a, b) => (b.pl || 0) - (a.pl || 0)).slice(0, 5);
      return `<a class="setor" href="#/fiis?setor=${encodeURIComponent(s0)}"><b class="setor-nome" title="${esc(s0)}">${esc(s0)}</b><div class="setor-meta"><span class="qtd">${l.length} fundo${l.length === 1 ? "" : "s"}</span></div>
        <div class="logos-pilha">${top.map((f) => logo(f.ticker, "p")).join("")}</div>
        <div class="setor-nums"><div>P/VP<b>${fmtU(mediana(l.map(fiiPvp).filter((v) => ok(v) && v > 0)), "x")}</b></div><div>DY<b>${fmtU(mediana(l.map(fiiDy)), "pct")}</b></div><div>PL (R$)<b>${grande(l.reduce((a, f) => a + (f.pl || 0), 0))}</b></div></div></a>`;
    }).join("");
    desenharFeedFii();
  };
  const desenhar = () => {
    const seg = EST.homeSeg;
    EST.homeSetores = EST.homeSetores.filter((x) => setoresDoSeg().includes(x));
    $("#perenes").hidden = ehFii();
    if (ehFii()) {
      const filtradoF = EST.homeSetores.length > 0;
      const sufixoF = filtradoF ? ` · ${EST.homeSetores.length === 1 ? EST.homeSetores[0] : `${EST.homeSetores.length} setores`}` : "";
      $("#fs-qtd").textContent = filtradoF ? `(${EST.homeSetores.length})` : "";
      $("#fs-limpar").hidden = !filtradoF;
      $("#fs-limpar").onclick = () => { EST.homeSetores = []; $("#fs-painel").hidden = true; desenhar(); };
      $("#fs-chips").innerHTML = EST.homeSetores.map((x) => `<button class="chip ativo" data-tira="${esc(x)}">${esc(x)}<span class="x">✕</span></button>`).join("");
      $$("#fs-chips [data-tira]").forEach((b) => b.onclick = () => { EST.homeSetores = EST.homeSetores.filter((x) => x !== b.dataset.tira); desenhar(); });
      $("#tit-listas").textContent = `Rankings de FIIs${sufixoF}`;
      $("#tit-setores").textContent = `Setores de FIIs${sufixoF}`;
      return desenharFii(sufixoF);
    }
    $("#tit-agenda").textContent = "Próximos resultados";
    $("#home-ag-acoes").hidden = false;
    $("#tit-feed").textContent = "Notícias e comunicados";
    $("#feed-abas").hidden = false;
    $("#sub-setores").textContent = "Medianas de P/L, ROE e dividend yield de cada setor";
    $("#link-tabela").textContent = "Ver tabela completa ›";
    const lista = base(), perm = new Set(lista), filtrado = EST.homeSetores.length > 0;
    const sufixo = filtrado ? ` · ${EST.homeSetores.length === 1 ? EST.homeSetores[0] : `${EST.homeSetores.length} setores`}` : "";
    $("#fs-qtd").textContent = filtrado ? `(${EST.homeSetores.length})` : "";
    $("#fs-limpar").hidden = !filtrado;
    $("#fs-limpar").onclick = () => { EST.homeSetores = []; $("#fs-painel").hidden = true; desenhar(); };
    $("#fs-chips").innerHTML = EST.homeSetores.map((x) => `<button class="chip ativo" data-tira="${esc(x)}">${esc(x)}<span class="x">✕</span></button>`).join("");
    $$("#fs-chips [data-tira]").forEach((b) => b.onclick = () => { EST.homeSetores = EST.homeSetores.filter((x) => x !== b.dataset.tira); desenhar(); });
    $("#perenes").classList.toggle("ativo", filtrado && SETORES_PERENES.filter((x) => setoresDoSeg().includes(x)).every((x) => EST.homeSetores.includes(x)));
    $("#tit-listas").textContent = `Rankings de ${nome()}${sufixo}`;
    $("#tit-setores").textContent = `Setores de ${nome()}${sufixo}`;
    $("#link-tabela").href = `#/ativos?seg=${seg}${EST.homeSetores.length === 1 ? "&setor=" + encodeURIComponent(EST.homeSetores[0]) : ""}`;
    $("#home-ag-xls").onclick = () => exportarAgenda(seg, perm);
    $("#home-agenda").innerHTML = agendaLista(seg, perm).prox.slice(0, 8).map(([t, x]) => linhaAgenda(t, x)).join("") || '<p class="vazio">Sem datas futuras para este recorte.</p>';
    $("#listas").innerHTML = LISTAS_HOME.map((L) => {
      const top = topLista(L, lista);
      if (!top.length) return "";
      return `<div class="lista"><h3>${esc(L.nome)}</h3><p class="sub">${esc(L.desc)}</p>
        ${top.map(([t, v]) => `<div class="lin"><div>${empresa(t, { semBadge: true })}<div class="valor">${fmt(t, L.k, v)}</div></div><a class="btn-ver" href="#/ativo/${t}">Ver ativo</a></div>`).join("")}
        <a class="btn-contorno" href="${L.link}${L.link.includes("?") ? "&" : "?"}seg=${seg}">Ver lista ›</a></div>`;
    }).join("") || '<p class="vazio">Sem empresas neste recorte.</p>';
    const por = {};
    for (const t of lista) (por[A(t).setor_macro] = por[A(t).setor_macro] || []).push(t);
    $("#setores").innerHTML = Object.entries(por).sort((a, b) => b[1].length - a[1].length).map(([s, l]) => {
      const vl = l.filter((t) => !semValuation(t));
      const top = [...l].sort((a, b) => (ind(b).valor_mercado_brl || 0) - (ind(a).valor_mercado_brl || 0)).slice(0, 5);
      return `<a class="setor" href="#/ativos?seg=${seg}&setor=${encodeURIComponent(s)}"><b class="setor-nome" title="${esc(s)}">${esc(s)}</b><div class="setor-meta"><span class="qtd">${l.length} empresa${l.length === 1 ? "" : "s"}</span>${SETORES_PERENES.includes(s) ? '<span class="badge pos">perene</span>' : ""}</div>
        <div class="logos-pilha">${top.map((t) => logo(t, "p")).join("")}</div>
        <div class="setor-nums"><div>P/L<b>${fmtU(mediana(vl.map((t) => ind(t).pl).filter((v) => v > 0)), "x")}</b></div><div>ROE<b>${fmtU(mediana(vl.map((t) => ind(t).roe)), "pct")}</b></div><div>DY<b>${fmtU(mediana(vl.map((t) => ind(t).dy)), "pct")}</b></div></div></a>`;
    }).join("");
    desenharFeed();
  };
  $$("#home-seg button").forEach((b) => b.onclick = () => { if (EST.homeSeg !== b.dataset.s) EST.homeSetores = []; EST.homeSeg = b.dataset.s; $$("#home-seg button").forEach((x) => x.classList.toggle("ativo", x === b)); desenhar(); });
  desenhar();
}

/* =====================================================================
   CRITÉRIOS PONDERADOS (tabela de importância do usuário; cálculo em pipeline/indicators.py)
   ===================================================================== */
function entraNota(t) {
  const c = D.fund[t].criterios;
  return !isRec(t) && !isCripto(t) && c && c.avaliados >= CONFIG.CRITERIOS_MIN && ok(ind(t).nota_criterios);
}
function estrelas(n) { return `<span class="estrelas" aria-label="${n} de 5">${"★".repeat(n)}<i>${"★".repeat(5 - n)}</i></span>`; }
function valorCriterio(t, id) {
  const i = ind(t), f = D.fund[t], md = ((f.setor || {}).mediana_grupo) || {}, c = f.criterios || {}, mo = moedaDe(t);
  const p = (v) => fmtU(v, "pct"), x = (v) => fmtU(v, "x");
  switch (id) {
    case "roic": return `${p(i.roic)} <span class="muted">· WACC ${p(i.wacc)}</span>`;
    case "roe": return `${p(i.roe)} <span class="muted">· custo do capital ${p(i.taxa_referencia)}</span>`;
    case "divida": return x(i.divliq_ebitda);
    case "margem_ebitda": return `${p(i.margem_ebitda)} <span class="muted">· setor ${p(md.margem_ebitda)}</span>`;
    case "receita": return `${p(i.cagr_receita_5a)} ao ano <span class="muted">· inflação ${p(c.inflacao)}</span>`;
    case "lucro": return `${p(i.cagr_lucro_5a)} ao ano <span class="muted">· ${ok(i.consist_lucro) ? i.consist_lucro : "n/d"} anos crescendo</span>`;
    case "fcl": return ok(i.fcl) ? `${mo} ${grande(i.fcl)}` : ND;
    case "ev_ebitda": return `${x(i.ev_ebitda)} <span class="muted">· setor ${x(md.ev_ebitda)}</span>`;
    case "pl": return `${x(i.pl)} <span class="muted">· PEG ${x(i.peg)}</span>`;
    case "cobertura": return x(i.cobertura_juros);
    default: return ND;
  }
}
const CRIT_O_QUE = {
  roic: "ROIC é o retorno sobre todo o capital investido (dívida + patrimônio); WACC é o custo desse capital. ROIC acima do WACC significa que cada real investido cria valor; abaixo, destrói valor.",
  roe: "ROE é o lucro sobre o patrimônio dos acionistas. Acima de 15% e acima do custo do capital próprio indica que o dinheiro do acionista rende mais do que renderia em alternativas de risco parecido.",
  divida: "Dívida líquida sobre EBITDA mostra quantos anos de geração operacional de caixa pagariam a dívida. Abaixo de 2x é confortável; negativo significa caixa maior que a dívida.",
  margem_ebitda: "Margem EBITDA é o quanto sobra de cada real vendido depois dos custos operacionais, antes de juros, impostos e depreciação. Acima da mediana do setor sugere vantagem de custo ou de preço sobre os concorrentes.",
  receita: "Crescimento médio anual da receita em 5 anos. Acima da inflação significa crescimento real: a empresa vende mais, não só repassa preço.",
  lucro: "Crescimento médio anual do lucro em 5 anos, com pelo menos 3 anos de alta nos últimos 10. Lucro que cresce com constância sustenta valorização e dividendos.",
  fcl: "Fluxo de caixa livre é o dinheiro que sobra depois dos investimentos. Positivo e recorrente mostra que o lucro vira caixa de verdade.",
  ev_ebitda: "EV/EBITDA compara o valor da empresa (ações + dívida líquida) com a geração operacional. Abaixo da mediana dos pares indica preço relativo menor.",
  pl: "PEG é o P/L dividido pelo crescimento do lucro. Até 1 indica que o preço pago pelo lucro é compatível com o ritmo de crescimento.",
  cobertura: "Cobertura de juros é o lucro operacional (EBIT) dividido pelas despesas financeiras. Acima de 4x indica folga para pagar os juros.",
};
function explicaCriterio(t, id, v) {
  const i = ind(t), f = D.fund[t], md = ((f.setor || {}).mediana_grupo) || {}, c = f.criterios || {};
  const p = (x) => ok(x) ? nf2.format(x * 100) + "%" : "n/d", x = (y) => ok(y) ? nf2.format(y) : "n/d";
  const det = {
    roic: `ROIC de ${p(i.roic)} contra WACC de ${p(i.wacc)}${ok(i.roic) && ok(i.wacc) ? ` (diferença de ${nf2.format((i.roic - i.wacc) * 100)} p.p.; o mínimo é 3 p.p.)` : ""}.`,
    roe: `ROE de ${p(i.roe)}; custo do capital próprio de ${p(i.taxa_referencia)}.`,
    divida: ok(i.ebitda) && i.ebitda <= 0 ? "EBITDA negativo: a operação não gera caixa para pagar a dívida." : `Dívida líquida de ${x(i.divliq_ebitda)} vezes o EBITDA.`,
    margem_ebitda: `Margem de ${p(i.margem_ebitda)} contra mediana do setor de ${p(md.margem_ebitda)}.`,
    receita: `Receita cresceu ${p(i.cagr_receita_5a)} ao ano; inflação de referência de ${p(c.inflacao)}.`,
    lucro: `Lucro cresceu ${p(i.cagr_lucro_5a)} ao ano; ${ok(i.consist_lucro) ? i.consist_lucro : "n/d"} anos de alta nos últimos 10.`,
    fcl: `Fluxo de caixa livre de 12 meses: ${ok(i.fcl) ? moedaDe(t) + " " + grande(i.fcl) : "n/d"}; margem média de 5 anos: ${p(i.margem_fcl_5a)}.`,
    ev_ebitda: `EV/EBITDA de ${x(i.ev_ebitda)} contra mediana dos pares de ${x(md.ev_ebitda)}.`,
    pl: `P/L de ${x(i.pl)} e PEG de ${x(i.peg)}.`,
    cobertura: `EBIT cobre ${x(i.cobertura_juros)} vezes as despesas financeiras.`,
  }[id] || "";
  const ver = v === true ? "Atende. " : v === false ? "Não atende. " : "Não avaliado: falta dado ou o critério não se aplica. ";
  return `${CRIT_O_QUE[id] || ""}\n\n${ver}${v === null ? "" : det}`;
}
function blocoCriterios(t) {
  const c = D.fund[t].criterios, lista = D.imeta.criterios || [];
  if (!c || !lista.length) return "";
  const nota = ind(t).nota_criterios;
  return `<div class="cartao"><div class="cartao-cab"><div><h3>Critérios fundamentalistas</h3><p class="sub">Cada critério pesa conforme a importância. Nota = estrelas atendidas sobre estrelas avaliadas. Passe o mouse em uma linha para ver o que o critério significa e por que a empresa atende ou não.</p></div>
    <div class="placar"><b>${ok(nota) ? nf2.format(nota) : "n/d"}</b><span>de 10</span></div></div>
    <div class="tabela-wrap"><table class="resp"><thead><tr><th>Indicador</th><th>Parâmetro desejável</th><th>Empresa</th><th>Importância</th><th class="n">Atende</th></tr></thead><tbody>
    ${lista.map(([id, nm, par, est]) => { const v = c.testes[id];
      return `<tr data-tip="${esc(explicaCriterio(t, id, v))}" class="linha-crit"><td class="cel-largo" data-label=""><b>${esc(nm)}</b> <i class="info">i</i></td><td data-label="Parâmetro" style="white-space:normal">${esc(par)}</td><td data-label="Empresa">${v === null && isFin(t) && ["roic", "divida", "margem_ebitda", "fcl", "ev_ebitda", "cobertura"].includes(id) ? '<span class="muted">não se aplica a bancos</span>' : valorCriterio(t, id)}</td>
        <td data-label="Importância">${estrelas(est)}</td><td class="n" data-label="Atende"><span class="ic-crit ${v === true ? "s" : v === false ? "n" : "x"}">${v === true ? "✓" : v === false ? "✕" : "n/d"}</span></td></tr>`; }).join("")}
    <tr><td class="cel-largo" data-label=""><b>Interferência estatal</b></td><td data-label="Parâmetro" style="white-space:normal">Sem controle nem poder de veto do governo (alerta, não entra na nota)</td>
      <td data-label="Empresa" style="white-space:normal">${estado(t) ? esc(rotEstado(t) + ": " + estado(t).resumo) : "Sem participação estatal relevante identificada"}</td><td data-label="Importância"><span class="muted">alerta</span></td>
      <td class="n" data-label="Atende">${estado(t) ? '<i class="q-estatal grande"></i>' : '<span class="ic-crit s">✓</span>'}</td></tr>
    </tbody></table></div></div>`;
}
function tabelaCriterios(base) {
  const lista = D.imeta.criterios || [];
  const l = base.filter(entraNota).sort((a, b) => ind(b).nota_criterios - ind(a).nota_criterios || (ind(b).roe || 0) - (ind(a).roe || 0));
  return `<div class="tabela-wrap alta"><table><thead><tr><th>#</th><th>Empresa</th><th class="n">Nota</th><th class="n" data-tip="Quadrado amarelo: controle ou influência estatal (governo com controle, golden share ou fatia relevante). É um alerta e não entra na nota.">Estado</th>${lista.map(([id, nm, par, est]) => `<th class="n" data-tip="${esc(nm + ": " + par + " (" + est + " de 5 estrelas)")}">${esc(nm.replace("Dívida líquida/EBITDA", "Dív./EBITDA").replace("Crescimento da receita", "Receita").replace("Crescimento do lucro", "Lucro").replace("Fluxo de caixa livre", "FCL").replace("Cobertura de juros", "Cobertura"))}</th>`).join("")}</tr></thead><tbody>
  ${l.map((t, i) => { const c = D.fund[t].criterios.testes, n = ind(t).nota_criterios;
    return `<tr class="clicavel" data-t="${t}"><td class="n muted">${i + 1}</td><td>${empresa(t, { semBadge: true })}</td><td class="n"><span class="nota-barra"><i style="width:${n * 10}%"></i></span><b>${nf2.format(n)}</b></td><td class="n">${estado(t) ? `<i class="q-estatal grande" data-tip="${esc(rotEstado(t) + ": " + estado(t).resumo)}"></i>` : ""}</td>
      ${lista.map(([id]) => `<td class="n"><span class="ic-crit ${c[id] === true ? "s" : c[id] === false ? "n" : "x"}">${c[id] === true ? "✓" : c[id] === false ? "✕" : "·"}</span></td>`).join("")}</tr>`; }).join("") || `<tr><td colspan="${lista.length + 4}" class="vazio">Sem empresas neste recorte.</td></tr>`}
  </tbody></table></div>`;
}


/* =====================================================================
   TABELA DE ATIVOS
   ===================================================================== */
const PRESETS = {
  padrao: { nome: "Principais", cols: ["setor_micro", "valor_mercado_brl", "preco", "nota_criterios", "pl", "pvp", "dy", "roe", "roic", "divliq_ebitda", "piotroski"] },
  valuation: { nome: "Valuation e dividendos", cols: ["setor_micro", "valor_mercado_brl", "pl", "pvp", "ev_ebitda", "psr", "dy", "payout", "tir_implicita"] },
  rentab: { nome: "Rentabilidade e eficiência", cols: ["setor_micro", "roe", "roic", "roa", "margem_bruta", "margem_ebitda", "margem_liquida", "giro_ativo", "piotroski"] },
  vendida: { nome: "Posições vendidas", cols: ["setor_micro", "valor_mercado_brl", "aluguel_valor", "aluguel_pct_ff", "aluguel_dias", "free_float"] },
  caixa: { nome: "Geração de caixa", cols: ["setor_micro", "valor_mercado_brl", "fcl", "margem_fcl", "fcf_yield", "conversao_caixa", "divliq_ebitda", "dy"] },
  risco: { nome: "Endividamento e crescimento", cols: ["setor_micro", "divliq_ebitda", "liquidez_corrente", "pl_ativos", "cagr_receita_5a", "cagr_lucro_5a", "cresc_lucro_ltm", "var_12m"] },
  personalizado: { nome: "Personalizado", cols: null },
};
function tabela(lista, colunas, opts = {}) {
  const sort = opts.sort;
  const cols = ["empresa", ...colunas.filter((k) => !["empresa", "ticker", "nome"].includes(k))];
  const ths = cols.map((k) => {
    const m = meta(k), n = m.unidade !== "txt";
    const seta = sort && sort.k === k ? `<span class="seta">${sort.d > 0 ? "▲" : "▼"}</span>` : "";
    return `<th class="${n ? "n" : ""} ${sort ? "ord" : ""}" data-k="${k}" data-tip="${esc(m.nome + (m.formula ? ": " + m.formula : "") + (porQue(k) ? "\n\nPor que importa: " + porQue(k) : ""))}">${esc(rot(k))}${seta}</th>`;
  }).join("");
  const trs = lista.map((t) => `<tr class="clicavel" data-t="${t}">${cols.map((k) => celula(t, k)).join("")}</tr>`).join("");
  return `<div class="tabela-wrap ${opts.alta ? "alta" : ""}"><table class="resp"><thead><tr>${ths}</tr></thead><tbody>${trs || `<tr><td colspan="${cols.length}" class="vazio">Nenhum ativo encontrado.</td></tr>`}</tbody></table></div>`;
}
function celula(t, k) {
  const m = meta(k), r = esc(rot(k)), v = val(t, k);
  if (k === "empresa") return `<td class="cel-empresa">${empresa(t)}</td>`;
  if (k === "setor_micro") return `<td data-label="${r}"><span class="tag-setor">${esc(v)}</span></td>`;
  if (k === "preco") return `<td class="n" data-label="${r}">${ok(v) ? "R$ " + nf2.format(v) : ND}</td>`;
  if (k.startsWith("var_")) return `<td class="n" data-label="${r}">${varHtml(v)}</td>`;
  if (m.unidade === "txt") return `<td data-label="${r}">${v ? esc(v) : ND}</td>`;
  return `<td class="n" data-label="${r}">${suprimido(t, k) ? ND : fmt(t, k, v)}</td>`;
}
function ligarLinhas(raiz) { $$("tr.clicavel", raiz).forEach((tr) => tr.onclick = (e) => { if (e.target.closest("a")) return; location.hash = `#/ativo/${tr.dataset.t}`; }); }
function ordenar(lista, k, d) {
  const num = meta(k).unidade !== "txt" && k !== "empresa";
  return [...lista].sort((a, b) => {
    const va = k === "empresa" ? a : val(a, k), vb = k === "empresa" ? b : val(b, k);
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    return num ? d * (va - vb) : d * String(va).localeCompare(String(vb), "pt-BR");
  });
}
function todasColunas() {
  const base = ["setor_micro", "setor_macro", "tipo", "porte", "preco", "var_ano", "var_12m", "var_5a", "valor_mercado_brl", "margem_fcl"];
  return [...base, ...Object.keys(D.imeta.indicadores).filter((k) => !["preco", "valor_mercado"].includes(k))];
}
function pgAtivos(app, q) {
  const T = EST.tab;
  if (q.has("seg")) T.seg = q.get("seg");
  T.setor = q.get("setor") || "";
  T.porte = q.get("porte") || "";
  T.colunas = T.colunas || lsGet("colunas_v3", PRESETS.padrao.cols);
  const titulo = T.seg === "ACAO_BR" ? "Ações" : T.seg === "BDR" ? "BDRs" : T.seg === "BDR_EXTERIOR" ? "BDRs de empresas estrangeiras" : T.seg === "BDR_EXPOSICAO_BR" ? "BDRs com risco Brasil" : "Ativos";
  const setores = [...new Set(filtroSeg(D.tickers, T.seg).map((t) => A(t).setor_macro))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  app.innerHTML = `${trilha([[titulo]])}
  <div class="cab-pagina"><div><div class="linha"><h1>${esc(titulo)}</h1>
    <div class="segmentado" id="t-seg">${[["TODOS", "Todos"], ["ACAO_BR", "Ações"], ["BDR", "BDRs"]].map(([k, n]) => `<button data-s="${k}" class="${(T.seg === k || (k === "BDR" && T.seg.startsWith("BDR"))) ? "ativo" : ""}">${n}</button>`).join("")}</div></div>
    ${T.setor ? `<p>Setor: <b>${esc(T.setor)}</b> · <a class="lk" href="#/ativos?seg=${T.seg}">ver todos os setores</a></p>` : ""}${T.porte === "small" ? `<p>Small caps: valor de mercado até R$ 10 bilhões · <a class="lk" href="#/ativos?seg=${T.seg}">ver todas</a></p>` : ""}</div>${pilulasData()}</div>
  <div class="linha entre" style="margin-bottom:14px">
    <div class="chips" id="t-preset">${Object.entries(PRESETS).map(([k, p]) => `<button class="chip ${T.preset === k ? "ativo" : ""}" data-p="${k}">${p.nome}</button>`).join("")}</div>
    <div class="linha">
      <select id="t-setor"><option value="">Todos os setores</option>${setores.map((s) => `<option ${T.setor === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <input type="search" id="t-busca" placeholder="Buscar ativo, ticker ou setor" value="${esc(T.busca)}">
      <div class="dropdown"><button class="btn" id="btn-colunas">Colunas</button><div class="dropdown-painel" id="painel-colunas" hidden></div></div>
      <button class="btn" id="t-csv" title="Baixar a tabela em Excel">Baixar Excel</button>
    </div>
  </div>
  <div class="aviso-verde">Clique em uma empresa para a análise completa. Ordenado pelo maior valor de mercado; clique no cabeçalho para mudar.</div>
  <div id="t-tabela"></div>
  <p class="sub" style="margin-top:10px"><span id="t-qtd"></span> · Passe o mouse sobre o nome da coluna para ver a fórmula · <a class="lk" href="#/filtros">Filtros avançados</a></p>`;
  const colunas = () => T.preset === "personalizado" ? T.colunas : PRESETS[T.preset].cols;
  const lista = () => {
    let l = filtroSeg(D.tickers, T.seg);
    if (T.setor) l = l.filter((t) => A(t).setor_macro === T.setor);
    if (T.porte === "small") l = l.filter((t) => ok(ind(t).valor_mercado_brl) && ind(t).valor_mercado_brl <= CONFIG.SMALL_CAP_MAX);
    const b = T.busca.trim().toLowerCase();
    if (b) l = l.filter((t) => t.toLowerCase().includes(b) || A(t).nome.toLowerCase().includes(b) || A(t).setor_macro.toLowerCase().includes(b) || A(t).setor_micro.toLowerCase().includes(b));
    return ordenar(l, T.sort.k, T.sort.d);
  };
  const desenhar = () => {
    const l = lista();
    $("#t-tabela").innerHTML = tabela(l, colunas(), { sort: T.sort, alta: true });
    $("#t-qtd").textContent = `${l.length} ativo${l.length === 1 ? "" : "s"}`;
    $$("#t-tabela th.ord").forEach((th) => th.onclick = () => { const k = th.dataset.k; T.sort = { k, d: T.sort.k === k ? -T.sort.d : (meta(k).unidade === "txt" || k === "empresa" ? 1 : -1) }; desenhar(); });
    ligarLinhas($("#t-tabela"));
  };
  $$("#t-seg button").forEach((b) => b.onclick = () => { location.hash = `#/ativos?seg=${b.dataset.s}`; });
  $$("#t-preset .chip").forEach((c) => c.onclick = () => { T.preset = c.dataset.p; $$("#t-preset .chip").forEach((x) => x.classList.toggle("ativo", x === c)); if (T.preset === "personalizado") $("#painel-colunas").hidden = false; desenhar(); });
  $("#t-setor").onchange = (e) => { location.hash = `#/ativos?seg=${T.seg}${e.target.value ? "&setor=" + encodeURIComponent(e.target.value) : ""}`; };
  $("#t-busca").oninput = (e) => { T.busca = e.target.value; desenhar(); };
  $("#t-csv").onclick = () => exportarTabela(T.setor ? `ativos_${T.setor}` : "ativos", lista(), colunas());
  painelColunas($("#btn-colunas"), $("#painel-colunas"), () => { T.preset = "personalizado"; $$("#t-preset .chip").forEach((x) => x.classList.toggle("ativo", x.dataset.p === "personalizado")); desenhar(); });
  desenhar();
}
function painelColunas(btn, painel, onChange) {
  const T = EST.tab;
  btn.onclick = (e) => { e.stopPropagation(); painel.hidden = !painel.hidden; };
  document.addEventListener("click", (e) => { if (!painel.contains(e.target) && e.target !== btn && !e.target.closest("#t-preset")) painel.hidden = true; });
  const grupos = {};
  for (const k of todasColunas()) { const g = meta(k).grupo || "Geral"; (grupos[g] = grupos[g] || []).push(k); }
  painel.innerHTML = `<div class="linha entre"><b>Personalize a tabela</b><button class="btn peq" id="col-reset">Limpar</button></div>` +
    Object.entries(grupos).map(([g, ks]) => `<h4>${esc(g)}</h4>${ks.map((k) => `<label><input type="checkbox" value="${k}" ${T.colunas.includes(k) ? "checked" : ""}> ${esc(meta(k).nome)}</label>`).join("")}`).join("");
  painel.onchange = (e) => {
    const k = e.target.value;
    if (e.target.checked) T.colunas.push(k); else T.colunas = T.colunas.filter((x) => x !== k);
    lsSet("colunas_v3", T.colunas); onChange();
  };
  $("#col-reset", painel).onclick = () => { T.colunas = [...PRESETS.padrao.cols]; lsSet("colunas_v3", T.colunas); painelColunas(btn, painel, onChange); painel.hidden = false; onChange(); };
}

/* =====================================================================
   RANKINGS
   ===================================================================== */
const RANKINGS = [
  { id: "piotroski", nome: "Qualidade contábil", desc: "Piotroski F-Score: quantos dos 9 testes de qualidade a empresa atende. Não se aplica a bancos.", k: "piotroski", dir: 1, f: (t) => !isFin(t), desempate: "roe" },
  { id: "roe", nome: "Maior ROE", desc: "Lucro de 12 meses sobre o patrimônio líquido.", k: "roe", dir: 1, f: (t) => !isRec(t) },
  { id: "roic", nome: "Maior ROIC", desc: "Retorno sobre o capital investido (dívida + patrimônio). Não se aplica a bancos.", k: "roic", dir: 1, f: (t) => !isFin(t) && !isRec(t) },
  { id: "margem", nome: "Maior margem líquida", desc: "Lucro líquido sobre a receita, 12 meses. Lucro acima da receita (evento não recorrente) fica de fora.", k: "margem_liquida", dir: 1, f: (t) => !isFin(t) && !isCripto(t) && ind(t).margem_liquida <= 1 },
  { id: "divida", nome: "Balanço mais leve", desc: "Dívida líquida sobre EBITDA. Negativo significa caixa maior que a dívida. Exige margem EBITDA de pelo menos 5%.", k: "divliq_ebitda", dir: -1, f: (t) => !isFin(t) && ind(t).ebitda > 0 && ind(t).margem_ebitda >= 0.05 },
  { id: "cresc", nome: "Crescimento do lucro", desc: "Crescimento médio anual do lucro líquido em 5 anos (CAGR).", k: "cagr_lucro_5a", dir: 1, f: (t) => !isRec(t) },
  { id: "dy", nome: "Dividendos sustentáveis", desc: "Dividend yield de 12 meses de quem distribui menos do que lucra (payout abaixo de 100%).", k: "dy", dir: 1, f: (t) => ok(ind(t).payout) && ind(t).payout > 0 && ind(t).payout < 1 },
  { id: "tir", nome: "Maior TIR implícita", desc: "Retorno anual que o preço de hoje embute, mantida a geração atual de lucro e caixa.", k: "tir_implicita", dir: 1, f: (t) => !semValuation(t) },
  { id: "pl", nome: "Menor P/L", desc: "Preço sobre lucro por ação. Só empresas com lucro.", k: "pl", dir: -1, f: (t) => !semValuation(t) && ind(t).pl > 0 },
  { id: "vendida", nome: "Maiores posições vendidas", desc: "Ações em aberto no aluguel da B3 (posição vendida) sobre as ações em circulação da classe declaradas à CVM, no último pregão. Outras bases de free float dão percentuais maiores; a ordem tende a ser a mesma.", k: "aluguel_pct_ff", dir: 1, f: (t) => ok(val(t, "aluguel_pct_ff")) },
  { id: "cobrir", nome: "Mais dias para cobrir", desc: "Dias de volume médio necessários para recomprar toda a posição vendida (valor alugado / volume financeiro médio de 21 pregões).", k: "aluguel_dias", dir: 1, f: (t) => ok(val(t, "aluguel_dias")) },
  { id: "caixa", nome: "Geração de caixa", desc: "Margem de fluxo de caixa livre: quanto de cada R$ 100 de receita sobra em caixa depois dos investimentos, em 12 meses. Não se aplica a bancos.", k: "margem_fcl", dir: 1, f: (t) => !isFin(t) && !semValuation(t) && ok(val(t, "margem_fcl")) && val(t, "margem_fcl") <= 1 },
  { id: "fcfy", nome: "Caixa livre sobre o preço", desc: "FCF yield: fluxo de caixa livre de 12 meses dividido pelo valor de mercado. Quanto caixa a empresa gera para cada real pago na ação.", k: "fcf_yield", dir: 1, f: (t) => !isFin(t) && !semValuation(t) },
];
function pgRankings(app, q) {
  if (q.has("seg")) EST.rkSeg = q.get("seg");
  const foco = q.get("foco");
  const macros = [...new Set(D.univ.map((a) => a.setor_macro))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  app.innerHTML = `${trilha([["Rankings"]])}<div class="cab-pagina"><div><h1>Rankings</h1><p>Cada ranking ordena por um único indicador, descrito no próprio cartão. Empresas em recuperação ficam fora dos rankings de preço e rentabilidade.</p></div>${pilulasData()}</div>
  <div class="linha entre" style="margin-bottom:16px"><div class="segmentado" id="rk-seg">${[["TODOS", "Todos"], ["ACAO_BR", "Ações"], ["BDR", "BDRs"]].map(([k, n]) => `<button data-s="${k}" class="${EST.rkSeg === k ? "ativo" : ""}">${n}</button>`).join("")}</div>
    <select id="rk-setor"><option value="">Todos os setores</option>${macros.map((s) => `<option ${EST.rkSetor === s ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
  <section><div class="secao-cab"><button class="btn peq prim" id="crit-xls" style="order:2">Baixar Excel</button><div><h2 class="titulo-barra">Classificação por critérios</h2><p class="sub" style="margin-top:6px">Nota de 0 a 10: soma das estrelas dos critérios que a empresa atende sobre as estrelas dos critérios avaliados. Passe o mouse no nome de cada critério para ver o parâmetro e o peso. Empresas em recuperação ficam de fora. <i class="q-estatal"></i> controle ou influência estatal (alerta, não entra na nota).</p></div></div>
    <div id="rk-criterios"></div>
    <details class="legenda-crit"><summary>Ver critérios e pesos</summary><div class="tabela-wrap" style="margin-top:10px"><table><thead><tr><th>Indicador</th><th>Parâmetro desejável</th><th>Importância</th></tr></thead><tbody>
      ${(D.imeta.criterios || []).map(([, nm, par, est]) => `<tr><td><b>${esc(nm)}</b></td><td style="white-space:normal">${esc(par)}</td><td>${estrelas(est)}</td></tr>`).join("")}</tbody></table></div>
      <p class="sub" style="margin-top:8px">WACC: custo do capital próprio (NTN-B longa nominal + 5%; exterior: Treasury 10 anos + 5%) e custo da dívida (Selic ou Treasury + 2%, menos IR), ponderados pelo valor de mercado e pela dívida bruta. Bancos e seguradoras são avaliados só por ROE, receita, lucro e P/L.</p></details>
  </section>
  <section class="secao"><div class="secao-cab"><h2 class="titulo-barra">Rankings por indicador</h2></div><div class="rank-grade" id="rk-saida"></div></section>`;
  const desenhar = () => {
    let base = filtroSeg(D.tickers, EST.rkSeg);
    if (EST.rkSetor) base = base.filter((t) => A(t).setor_macro === EST.rkSetor);
    $("#rk-criterios").innerHTML = tabelaCriterios(base);
    $("#crit-xls").onclick = () => { const lista = D.imeta.criterios || [];
      const l = base.filter(entraNota).sort((a, b) => ind(b).nota_criterios - ind(a).nota_criterios || (ind(b).roe || 0) - (ind(a).roe || 0));
      const sn = (v) => v === true ? "Sim" : v === false ? "Não" : "n/d";
      baixarExcel("classificacao_criterios", [{ nome: "Classificação", cab: ["Posição", "Ticker", "Empresa", "Setor", "Nota (0 a 10)", "Interferência estatal", ...lista.map(([, nm, , est]) => `${nm} (${est} estrelas)`)],
        linhas: l.map((t, i) => [i + 1, t, A(t).nome, A(t).setor_micro, Math.round(ind(t).nota_criterios * 100) / 100, estado(t) ? rotEstado(t) : "", ...lista.map(([id]) => sn(D.fund[t].criterios.testes[id]))]) }]); };
    ligarLinhas($("#rk-criterios"));
    $("#rk-saida").innerHTML = RANKINGS.map((R) => {
      const l = topLista(R, base, 999);
      const aberto = !!EST.rkAbertos[R.id], mostra = aberto ? l : l.slice(0, 10);
      EST.rkListas[R.id] = l;
      const vs = l.map(([, v]) => v), mn = Math.min(...vs), mx = Math.max(...vs), rg = mx - mn || 1;
      const larg = (v) => 12 + 88 * (R.dir > 0 ? (v - mn) / rg : (mx - v) / rg);
      return `<div class="rank ${foco === R.id ? "foco" : ""}" id="rk-${R.id}"><h3>${esc(R.nome)}</h3><p class="sub">${esc(R.desc)}</p>
        ${mostra.map(([t, v], i) => `<div class="rk"><span class="pos-n">${i + 1}</span><div style="min-width:0">${empresa(t, { cls: "p", semBadge: true })}<div class="barra"><i style="width:${larg(v)}%"></i></div></div><span class="valor">${fmt(t, R.k, v)}</span></div>`).join("") || '<p class="vazio">Sem empresas neste recorte.</p>'}
        ${l.length > 10 || aberto ? `<div class="mais linha">${l.length > 10 ? `<button class="btn peq" data-abre="${R.id}">${aberto ? "Mostrar só o top 10" : `Ver todos (${l.length})`}</button>` : ""}${aberto ? `<button class="btn peq prim" data-xls="${R.id}">Baixar Excel</button>` : ""}</div>` : ""}</div>`;
    }).join("");
    $$("[data-abre]").forEach((b) => b.onclick = () => { EST.rkAbertos[b.dataset.abre] = !EST.rkAbertos[b.dataset.abre]; desenhar(); });
    $$("[data-xls]").forEach((b) => b.onclick = () => { const R = RANKINGS.find((x) => x.id === b.dataset.xls), l = EST.rkListas[R.id] || [];
      baixarExcel(`ranking_${R.id}`, [{ nome: R.nome, cab: ["Posição", "Ticker", "Empresa", "Setor", cabCol(R.k)], linhas: l.map(([t], i) => [i + 1, t, A(t).nome, A(t).setor_micro, valCol(t, R.k)]) }]); });
  };
  $$("#rk-seg button").forEach((b) => b.onclick = () => { EST.rkSeg = b.dataset.s; $$("#rk-seg button").forEach((x) => x.classList.toggle("ativo", x === b)); desenhar(); });
  $("#rk-setor").onchange = (e) => { EST.rkSetor = e.target.value; desenhar(); };
  desenhar();
  if (foco && $(`#rk-${foco}`)) setTimeout(() => $(`#rk-${foco}`).scrollIntoView({ behavior: "smooth", block: "start" }), 60);
}

/* =====================================================================
   PÁGINA DO ATIVO
   ===================================================================== */
const GRUPOS_IND = [
  { nome: "Valuation", ks: ["pl", "pvp", "ev_ebitda", "ev_ebit", "psr", "lpa", "vpa", "earnings_yield"] },
  { nome: "Dividendos", ks: ["dy", "payout", "dy_medio_5a", "dpa_12m", "anos_pagando"] },
  { nome: "Rentabilidade e eficiência", ks: ["roe", "roic", "roa", "margem_bruta", "margem_ebitda", "margem_ebit", "margem_liquida", "giro_ativo"] },
  { nome: "Geração de caixa", ks: ["fcl", "margem_fcl", "fcf_yield", "conversao_caixa"] },
  { nome: "Crescimento", ks: ["cagr_receita_5a", "cagr_lucro_5a", "cresc_receita_ltm", "cresc_lucro_ltm"] },
  { nome: "Endividamento", ks: ["divliq_ebitda", "divliq_pl", "liquidez_corrente", "cobertura_juros", "pl_ativos", "passivos_ativos"] },
];
const PRINCIPAIS = new Set(["pl", "dy", "roe", "margem_liquida", "margem_ebitda", "margem_fcl", "cagr_receita_5a", "cagr_lucro_5a", "divliq_ebitda"]);
function cartaoInd(t, k, h) {
  const m = meta(k), v = val(t, k), st = D.fund[t].setor || {}, md = (st.mediana_grupo || {})[k];
  const sup = suprimido(t, k);
  if (!sup && !ok(v)) return "";
  const serie = Object.keys(h.anual || {}).sort().map((y) => h.anual[y][k]);
  let det = "";
  if (!sup && ok(md)) {
    const melhor = m.direcao ? (m.direcao > 0 ? v > md : v < md) : null;
    det = `${melhor === null ? "" : `<span class="${melhor ? "pos" : "neg"}">${melhor ? "▲" : "▼"}</span> `}Setor: ${fmtU(md, m.unidade, moedaDe(t))}`;
  }
  const princ = PRINCIPAIS.has(k);
  return `<div class="ind${princ ? " principal" : ""}">${princ ? '<span class="tag-principal">Principal</span>' : ""}<div class="rot">${esc(rot(k))}${tip(k)}</div>${serie.filter(ok).length >= 3 ? `<button class="graf" data-k="${k}" aria-label="Histórico de ${esc(rot(k))}">${ICONE_GRAF}</button>` : ""}
    <div class="val">${sup ? ND : fmt(t, k, v)}</div><div class="det">${det || "&nbsp;"}</div></div>`;
}
function ltmContas(t) {
  const i = ind(t);
  const receita = ok(i.ev) && ok(i.ev_receita) && i.ev_receita ? i.ev / i.ev_receita : null;
  const lucro = ok(i.valor_mercado) && ok(i.pl) && i.pl ? i.valor_mercado / i.pl : (ok(receita) && ok(i.margem_liquida) ? receita * i.margem_liquida : null);
  const pl = ok(i.valor_mercado) && ok(i.pvp) && i.pvp ? i.valor_mercado / i.pvp : null;
  return { receita, lucro, pl };
}
function baseResultado(t) {
  const u = ((D.fund[t] || {}).agenda || {}).ultima;
  if (!u) return `Balanço até o ${esc(D.fund[t].trimestre || "n/d")}`;
  return `Último resultado: ${esc(u.rotulo)}, trimestre encerrado em ${dataBR(u.fim)}${u.entrega ? `, divulgado à CVM em ${dataBR(u.entrega)}` : ""}`;
}
function proxResultado(t, comLink = true) {
  const pr = ((D.fund[t] || {}).agenda || {}).proxima;
  if (!pr || !pr.data) return "";
  const conf = pr.criterio && pr.criterio.includes("Yahoo") ? "data informada" : "estimada";
  return `<span class="prox-res" data-tip="${esc(`Próxima divulgação (${pr.rotulo || ""}): ${dataBR(pr.data)}, ${conf}. Critério: ${pr.criterio}.${pr.prazo_legal ? ` Prazo legal: ${dataBR(pr.prazo_legal)}.` : ""}`)}">${comLink ? '<a href="#/calendario">' : ""}Próximo resultado: <b>${esc(pr.rotulo || "")} · ${dataBR(pr.data)}</b> <small>${conf}</small>${comLink ? "</a>" : ""}</span>`;
}
async function pgAtivo(app, t) {
  if (!D.univMap[t] || !D.fund[t]) { app.innerHTML = `<div class="cartao"><h1>${esc(t)}</h1><p>Ativo não encontrado.</p><p><a class="lk" href="#/">Voltar ao início</a></p></div>`; return; }
  const a = A(t), f = D.fund[t], i = f.ind, p = D.prices[t] || {}, n = D.notes[t] || {}, mo = moedaDe(t), st = f.setor || {};
  const h = await historico(t);
  const segTab = emAcoes(t) ? "ACAO_BR" : "BDR";
  const pos52 = ok(p.preco) && ok(p.min_52s) && ok(p.max_52s) && p.max_52s > p.min_52s ? (p.preco - p.min_52s) / (p.max_52s - p.min_52s) * 100 : null;
  const rec = a.recuperacao || {};
  const classes = Object.values(f.classes || a.classes || {}).filter((x) => x && x !== t);
  const grupos = GRUPOS_IND.map((g) => ({ ...g, ks: g.ks.filter((k) => !(isFin(t) && NAO_FIN.has(k))) }));
  if (a.modelo_analise === "BANCO") grupos.push({ nome: "Banco", ks: Object.keys(D.imeta.indicadores).filter((k) => D.imeta.indicadores[k].grupo === "Banco") });
  if (a.modelo_analise === "SEGURADORA") grupos.push({ nome: "Seguradora", ks: Object.keys(D.imeta.indicadores).filter((k) => D.imeta.indicadores[k].grupo === "Seguradora") });
  const L = ltmContas(t), pts = pontos(t);
  const kv = (r, v) => `<div class="kv"><span>${r}</span><b>${v}</b></div>`;
  const din = (v) => ok(v) ? `${mo} ${grande(v)}` : ND;

  app.innerHTML = `${trilha([[emAcoes(t) ? "Ações" : "BDRs", `#/ativos?seg=${segTab}`], [a.setor_macro, `#/ativos?seg=${segTab}&setor=${encodeURIComponent(a.setor_macro)}`], [t]])}
  <div class="ativo-topo">
    <div class="ativo-id">${logo(t, "g")}<div><h1>${t}${classes.length ? classes.map((c) => `<span class="badge">${c}</span>`).join("") : ""}${isRec(t) ? `<span class="badge rec">${esc(recNome(t))}</span>` : ""}${estado(t) ? `<span class="badge estatal" data-tip="${esc(estado(t).resumo)}"><i class="q-estatal"></i>${rotEstado(t)}</span>` : ""}</h1><div class="nm">${esc(a.nome)}</div>${proxResultado(t)}</div></div>
    <nav class="secoes-nav" id="secoes">${[["indicadores", "Indicadores"], ["criterios", "Critérios"], ["resultados", "Resultados"], ["proventos", "Proventos"], ["sobre", "Sobre a empresa"], ["governanca", "Governança"], ["acionistas", "Acionistas"], ["noticias", "Comunicados"]].map(([id, nm]) => `<a href="#" data-sec="${id}">${nm}</a>`).join("")}</nav>
  </div>

  <div class="cartao" style="margin-top:18px">
    <div class="cotacao-cab"><div title="Cotação com atraso de até 15 minutos. Indicadores calculados com o preço de fechamento de ${dataBR(D.meta.data_fechamento)}."><div class="sub">Cotação</div>
      <div class="preco-grande">R$ ${ok(p.preco) ? nf2.format(p.preco) : "n/d"}${ok(p.var_dia) ? ` <span class="preco-var">(${varHtml(p.var_dia)})</span>` : ""}</div>
      ${a.fator_cotacao && ok(p.preco) ? `<div class="sub">Preço por ação. Na B3, ${t} é cotado por lote de ${a.fator_cotacao.fator}: R$ ${nf2.format(p.preco * a.fator_cotacao.fator)}.</div>` : ""}
      <div class="sub" style="margin-top:6px">${p.ao_vivo ? `Atualizada às ${new Date(p.ao_vivo).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : `Fechamento de ${dataBR(p.data)}`}</div>
      <div class="sub">No ano ${varHtml(p.var_ano)} · 12 meses ${varHtml(p.var_12m)}</div>
      ${pos52 !== null ? `<div class="faixa52"><div class="trilho"><span class="marc" style="left:${pos52}%"></span></div><div class="ext"><span>Mín. 52 semanas R$ ${nf2.format(p.min_52s)}</span><span>Máx. R$ ${nf2.format(p.max_52s)}</span></div></div>` : ""}</div>
      <div class="linha" style="gap:8px"><a class="btn peq" href="#/retorno?t=${t}&p=10&m=ambos&b=cdi,ipca6">Retorno total com proventos</a><div class="chips" id="px-per"><button class="chip ativo" data-p="1">1A</button><button class="chip" data-p="5">5A</button><button class="chip" data-p="10">10A</button></div></div></div>
    <div class="grafico" style="margin-top:12px"><canvas id="g-preco"></canvas></div>
    <div class="badges" style="margin-top:12px">${[a.setor_macro, a.setor_micro, i.porte, SEGMENTO_B3[a.segmento_listagem], TIPO_CURTO[a.tipo]].filter(Boolean).map((b) => `<span class="badge">${esc(b)}</span>`).join("")}</div>
  </div>
  ${isRec(t) ? `<div class="aviso-rec"><b>${esc(recNome(t))}</b>${rec.pedido ? ` desde ${esc(dataBR(rec.pedido))}` : ""}. ${esc(rec.situacao || "")}<div class="sub" style="margin-top:4px">Múltiplos de lucro, TIR implícita e preço justo não são exibidos: os fluxos de uma empresa em recuperação não representam a operação normal. Fonte: ${esc(rec.fonte || "comunicados da companhia")}.</div></div>` : ""}
  ${estado(t) ? `<div class="aviso-estatal"><i class="q-estatal"></i><div><b>${rotEstado(t)}</b>. ${esc(estado(t).resumo)}<div class="sub" style="margin-top:4px">Decisões de preço, investimento, dividendos ou gestão podem seguir interesses do governo, não só dos acionistas. Fonte: ${esc(estado(t).fonte)}.</div></div></div>` : ""}
  ${isCripto(t) ? `<div class="aviso-info">Tesouraria em bitcoin: o valor da empresa acompanha o bitcoin em caixa. Os indicadores centrais são mNAV e BTC por ação.</div>` : ""}
  ${isBDR(t) ? `<div class="aviso-info">BDR: fundamentos em ${mo === "US$" ? "dólar" : "reais (a empresa reporta em R$)"}. A tributação de proventos de BDR difere da de ações brasileiras.</div>` : ""}

  <section class="secao" id="sec-indicadores">
    <div class="secao-cab"><h2 class="titulo-barra">Indicadores fundamentalistas</h2><span class="sub">Últimos 12 meses · ${baseResultado(t)} · comparação com a mediana de ${esc(st.grupo_nome || "o setor")}</span></div>
    ${pts.length ? `<div class="atencao" style="margin-bottom:16px">${pts.map((x) => `<span class="badge ${x.tipo}" data-tip="${esc(x.det)}">${esc(x.rot)}</span>`).join("")}</div>` : ""}
    ${grupos.map((g) => { const cards = g.ks.map((k) => cartaoInd(t, k, h)).join(""); return cards ? `<h4>${esc(g.nome)}</h4><div class="ind-grade">${cards}</div>` : ""; }).join("")}
  </section>
  <section class="secao" id="sec-criterios">${blocoCriterios(t)}</section>
  <section class="secao"><div class="grade g-3-2">${blocoPrecoHoje(t)}${blocoPiotroski(t)}</div></section>
  ${isBDR(t) ? `<section class="secao">${blocoBDR(t)}</section>` : ""}
  ${f.holding ? `<section class="secao">${blocoHolding(t)}</section>` : ""}
  ${isCripto(t) ? `<section class="secao">${blocoCripto(t)}</section>` : ""}

  <section class="secao" id="sec-resultados">
    <div class="secao-cab"><h2 class="titulo-barra">Resultados financeiros</h2><span class="sub">${baseResultado(t)} · ${esc(f.fonte || "")}</span></div>
    <div class="grade g3">
      <div class="cartao"><h3>Múltiplos de valuation</h3><div class="espaco" style="height:8px"></div>${kv("Valor de mercado", din(i.valor_mercado))}${isFin(t) ? "" : kv("Valor da firma (EV)", din(i.ev))}${kv("P/L", suprimido(t, "pl") ? ND : fmt(t, "pl"))}${kv("P/VP", fmt(t, "pvp"))}${isFin(t) ? "" : kv("EV/EBITDA", suprimido(t, "ev_ebitda") ? ND : fmt(t, "ev_ebitda"))}</div>
      <div class="cartao"><h3>Resultado em 12 meses</h3><div class="espaco" style="height:8px"></div>${isFin(t) ? "" : kv("Receita líquida", din(L.receita))}${isFin(t) ? "" : kv("EBITDA", din(i.ebitda))}${kv("Lucro líquido", din(L.lucro))}${isFin(t) ? "" : kv("Fluxo de caixa operacional", din(i.fco))}${isFin(t) ? "" : kv("Fluxo de caixa livre", din(i.fcl))}</div>
      <div class="cartao"><h3>Balanço patrimonial</h3><div class="espaco" style="height:8px"></div>${kv("Patrimônio líquido", din(L.pl))}${isFin(t) ? "" : kv("Dívida bruta", din(i.divida_bruta))}${isFin(t) ? "" : kv("Caixa", din(i.caixa))}${isFin(t) ? "" : kv("Dívida líquida", din(i.divida_liquida))}${isFin(t) ? kv("ROE", fmt(t, "roe")) : kv("Liquidez corrente", fmt(t, "liquidez_corrente"))}</div>
    </div>
    <div class="cartao" style="margin-top:16px" id="tri"></div>
    <div class="cartao" style="margin-top:16px"><div class="cartao-cab"><h3>Histórico anual</h3><div class="abas" id="hist-anos" style="margin:0"><button data-n="5" class="ativo">5A</button><button data-n="10">10A</button></div></div><div id="hist-tabela"></div></div>
    <div class="cartao" style="margin-top:16px"><div class="cartao-cab"><div><h3>Preço sobre lucro (P/L) ano a ano</h3>
      <p class="sub">Quantas vezes o preço da ação equivalia ao lucro por ação de cada ano. P/L 10 = o preço pagava 10 anos daquele lucro. Quanto menor, mais barato em relação ao lucro. A barra "Hoje" usa o preço atual e o lucro dos últimos 12 meses; a linha tracejada é a média de 5 anos. Anos com prejuízo aparecem em vermelho, sem P/L; passe o mouse para ver o valor.</p></div></div>
      <div class="grafico"><canvas id="g-lucro"></canvas></div></div>
  </section>

  <section class="secao" id="sec-proventos"><div class="secao-cab"><h2 class="titulo-barra">Proventos</h2></div><div id="proventos"></div></section>

  <section class="secao" id="sec-sobre"><div class="secao-cab"><h2 class="titulo-barra">Sobre ${esc(a.nome)}</h2></div><div id="sobre"><div class="carregando"><span></span>Carregando</div></div></section>

  <section class="secao" id="sec-governanca"><div class="secao-cab"><h2 class="titulo-barra">Governança</h2></div>
    <div class="gov">
      <div class="ind"><div class="rot">Tag along</div><div class="val">${ok(i.tag_along) ? nf0.format(i.tag_along) + "%" : ND}</div><p>Percentual do preço pago ao controlador que o minoritário recebe se o controle for vendido.</p></div>
      <div class="ind"><div class="rot">Free float</div><div class="val">${fmt(t, "free_float")}</div><p>Parte das ações livre para negociação, fora do controlador e da tesouraria.</p></div>
      <div class="ind"><div class="rot">Segmento de listagem</div><div class="val" style="font-size:1.05rem">${esc(SEGMENTO_B3[a.segmento_listagem] || "n/d")}</div><p>Nível de governança na B3. Novo Mercado é o mais exigente: só ações ordinárias e tag along de 100%.</p></div>
      <div class="ind"><div class="rot">Diluição em 3 anos</div><div class="val">${fmt(t, "diluicao_3a")}</div><p>Variação do número de ações. Positivo significa emissão; negativo, recompra.</p></div>
    </div>
  </section>

  <section class="secao" id="sec-acionistas"><div class="secao-cab"><h2 class="titulo-barra">Composição acionária</h2></div>${blocoAcionistas(t)}</section>
  <section class="secao" id="sec-vendida"><div class="secao-cab"><h2 class="titulo-barra">Posição vendida</h2></div>${blocoVendida(t)}</section>

  <section class="secao" id="sec-noticias"><div class="secao-cab"><h2 class="titulo-barra">Comunicados e notícias</h2></div><div id="noticias" class="cartao"><div class="carregando"><span></span>Carregando</div></div></section>

  <section class="secao"><div class="secao-cab"><h2 class="titulo-barra">Outras empresas de ${esc(a.setor_macro)}</h2><a class="lk" href="#/comparar?t=${[t, ...pares(t, 4)].join(",")}">Comparar lado a lado →</a></div>
    <div class="pares">${pares(t, 8).map((x) => `<a class="par" href="#/ativo/${x}">${empresa(x, { link: false, semBadge: true })}<div class="nums">${(isFin(x) ? ["pl", "pvp", "roe"] : ["pl", "roe", "dy"]).map((k) => `<div>${esc(rot(k))}<b>${suprimido(x, k) ? "n/d" : stripTags(fmt(x, k))}</b></div>`).join("")}</div></a>`).join("") || '<p class="vazio">Sem empresas comparáveis no universo.</p>'}</div>
  </section>`;

  graficoPreco(t, h, 1);
  $$("#px-per .chip").forEach((c) => c.onclick = () => { $$("#px-per .chip").forEach((x) => x.classList.toggle("ativo", x === c)); graficoPreco(t, h, +c.dataset.p); });
  graficoLucro(t, h);
  $("#tri").innerHTML = blocoTrimestral(t, h);
  graficoTrimestral(t, h);
  const histTab = (nAnos) => { $("#hist-tabela").innerHTML = tabelaHistorica(t, h, nAnos); };
  histTab(5);
  $$("#hist-anos button").forEach((b) => b.onclick = () => { $$("#hist-anos button").forEach((x) => x.classList.toggle("ativo", x === b)); histTab(+b.dataset.n); });
  $$(".ind .graf").forEach((b) => b.onclick = () => modalHistorico(t, b.dataset.k, h));
  $$("#secoes a").forEach((l) => l.onclick = (e) => { e.preventDefault(); $(`#sec-${l.dataset.sec}`).scrollIntoView({ behavior: "smooth", block: "start" }); });
  blocoSobre(t);
  $("#proventos").innerHTML = await blocoProventos(t);
  graficoProventos(t);
  $("#noticias").innerHTML = await abaNoticias(t);
}
async function blocoSobre(t) {
  const a = A(t), n = D.notes[t] || {};
  const pf = await j(`data/perfis/${t}.json`, null);
  const sens = {};
  for (const [c, v] of Object.entries(a.sensibilidade || {})) if (CENARIOS[c]) sens[c] = { nota: v, porque: "" };
  if (pf && pf.sensibilidade) for (const [c, v] of Object.entries(pf.sensibilidade)) if (CENARIOS[c] && v && ok(v.nota)) sens[c] = { nota: v.nota, porque: v.porque || "" };
  const pct = (x) => ok(x) ? nf0.format(x * 100) + "%" : ND;
  const nivel = (x) => x ? `<b>${esc(x[0].toUpperCase() + x.slice(1))}</b>` : ND;
  const destaques = pf ? `<div class="sobre-destaques">
      <div><span>${pf.geografia && pf.geografia.base ? `Exterior (${esc(pf.geografia.base)})` : "Receita no exterior"}</span>${pf.geografia && ok(pf.geografia.exterior_pct) ? `<b>${pct(pf.geografia.exterior_pct)}</b><small>${esc(pf.geografia.periodo || "")}</small>` : '<b class="nd-txt">Não divulgada</b>'}</div>
      <div><span>Receita em dólar</span>${nivel(pf.moeda && pf.moeda.receita_em_dolar)}</div>
      <div><span>Dívida em dólar</span>${nivel(pf.moeda && pf.moeda.divida_em_dolar)}</div></div>` : "";
  const segs = pf && (pf.segmentos || []).filter((x) => ok(x.peso_receita));
  const detalhe = pf ? `<div class="sobre-mais" id="sobre-mais" hidden>
      ${pf.modelo ? `<h4>Modelo de negócio</h4><p>${esc(pf.modelo)}</p>` : ""}
      ${segs && segs.length ? `<h4>${esc(pf.segmentos_base && !/^receita/i.test(pf.segmentos_base) ? pf.segmentos_base + " por segmento" : "Receita por segmento")}${segs[0].periodo ? ` (${esc(segs[0].periodo)})` : ""}</h4><div class="barras">${segs.map((x) => `<div class="linha-barra"${x.obs ? ` data-tip="${esc(x.obs)}"` : ""}><span>${esc(x.nome)}</span><span class="barra"><i style="left:0;width:${Math.min(100, x.peso_receita * 100)}%;background:var(--acento)"></i></span><span class="num">${pct(x.peso_receita)}</span></div>`).join("")}</div>` : ""}
      ${pf.geografia && pf.geografia.texto ? `<h4>Onde atua</h4><p>${esc(pf.geografia.texto)}</p>` : ""}
      ${pf.moeda && pf.moeda.texto ? `<h4>Exposição a moeda</h4><p>${esc(pf.moeda.texto)}</p>` : ""}
      ${pf.momento ? `<h4>Momento atual</h4><p>${esc(pf.momento)}</p>` : ""}
      ${(pf.fontes || []).length ? `<h4>Fontes</h4><ul class="sobre-fontes">${pf.fontes.map((f) => `<li><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.titulo)}</a>${f.data ? ` <span class="sub">${esc(dataBR(f.data))}</span>` : ""}</li>`).join("")}</ul>` : ""}
      <p class="sub">Texto revisado em ${esc(dataBR(pf.revisado_em))}${pf.ultimo_resultado ? `, com base no resultado do ${esc(pf.ultimo_resultado)}` : ""}${pf.revisao === "automática" ? " (revisão automática)" : ""}.</p></div>
    <button class="btn peq" id="sobre-ver">Ver mais</button>` : (n.qualitativo ? Object.entries(n.qualitativo).map(([k, v]) => `<p class="sub"><b>${esc(({ regulacao: "Regulação", concessoes: "Concessões", vso: "VSO", banco_terrenos: "Banco de terrenos", caixa: "Caixa" })[k] || k.replace(/_/g, " "))}:</b> ${esc(v)}</p>`).join("") : "");
  const porques = Object.entries(sens).filter(([, v]) => v.porque);
  // resultado mais novo do que o texto: avisa; os números do trimestre já estão na seção Resultados, que se atualiza sozinha
  const ult = ((D.fund[t] || {}).agenda || {}).ultima || {};
  const defasado = pf && ult.rotulo && ((pf.ultimo_resultado && pf.ultimo_resultado !== ult.rotulo) || (ult.entrega && pf.revisado_em && ult.entrega > pf.revisado_em));
  const avisoRev = defasado ? `<p class="aviso-rev">Saiu o resultado do <b>${esc(ult.rotulo)}</b>${ult.entrega ? ` em ${esc(dataBR(ult.entrega))}` : ""}. O texto abaixo é anterior a ele e está na fila de revisão automática; os números do trimestre já estão em <a href="#" data-sec-ir="resultados">Resultados</a>.</p>` : "";
  const dr = pf && pf.destaques_resultado;
  const lista = (itens, cls, titulo) => itens && itens.length ? `<div class="dr-col ${cls}"><h4>${titulo}</h4><ul>${itens.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "";
  const blocoDr = dr ? `<div class="cartao dr-cartao"><div class="cartao-cab"><div><h3>Último resultado: ${esc(dr.trimestre)}</h3><p class="sub">${dr.divulgado_em ? `Divulgado em ${esc(dataBR(dr.divulgado_em))}. ` : ""}Fatos do trimestre segundo o release e o ITR da empresa; a comparação de cada item vem indicada no texto.</p></div></div>
    <div class="dr-grade">${lista(dr.positivos, "pos", "Pontos positivos")}${lista(dr.negativos, "neg", "Pontos negativos")}${lista(dr.atencao, "aten", "Pontos de atenção")}</div></div>` : "";
  $("#sobre").innerHTML = blocoDr + `<div class="grade g2">
    <div class="cartao"><h3>O negócio</h3>${avisoRev}<p style="color:var(--txt-2)">${esc((pf && pf.resumo) || n.resumo || "Resumo não preenchido.")}</p>${destaques}${detalhe}</div>
    <div class="cartao"><h3>Sensibilidade a cenários</h3><p class="sub">De -2 (perde muito) a +2 (ganha muito).${porques.length ? " Passe o mouse para ver o motivo." : ""}</p>
      <div class="barras" style="margin-top:12px">${Object.entries(sens).map(([c, { nota: v, porque }]) => `<div class="linha-barra"${porque ? ` data-tip="${esc(porque)}"` : ""}><span>${CENARIOS[c]}</span><span class="barra centro"><i style="left:${v < 0 ? 50 + v * 25 : 50}%;width:${Math.abs(v) * 25}%;background:${v >= 0 ? "var(--pos)" : "var(--neg)"}"></i></span><span class="num ${sinal(v)}">${v > 0 ? "+" : ""}${v}</span></div>`).join("")}</div>
      ${porques.length ? `<div class="sobre-mais" id="sens-mais" hidden>${porques.map(([c, v]) => `<p><b>${CENARIOS[c]}:</b> ${esc(v.porque)}</p>`).join("")}</div><button class="btn peq" id="sens-ver">Ver motivos</button>` : ""}</div></div>`;
  const alterna = (bt, box, abrir, fechar) => { const b = $(bt); if (!b) return; b.onclick = () => { const x = $(box); x.hidden = !x.hidden; b.textContent = x.hidden ? abrir : fechar; }; };
  alterna("#sobre-ver", "#sobre-mais", "Ver mais", "Ver menos");
  $$("[data-sec-ir]").forEach((a) => a.onclick = (e) => { e.preventDefault(); $(`#sec-${a.dataset.secIr}`).scrollIntoView({ behavior: "smooth", block: "start" }); });
  alterna("#sens-ver", "#sens-mais", "Ver motivos", "Ocultar motivos");
}
function tabelaHistorica(t, h, nAnos) {
  const anos = Object.keys(h.anual || {}).sort().slice(-nAnos);
  if (!anos.length) return '<p class="vazio">Sem histórico anual.</p>';
  const mo = moedaDe(t);
  const linhas = isFin(t) ? [["lucro_liq", "Lucro líquido", "din"], ["roe", "ROE", "pct"], ["pl", "P/L", "x"], ["pvp", "P/VP", "x"], ["dpa", "Proventos por ação", "moeda"], ["dy", "Dividend yield", "pct"]]
    : [["receita", "Receita líquida", "din"], ["ebitda", "EBITDA", "din"], ["margem_ebitda", "Margem EBITDA", "pct"], ["lucro_liq", "Lucro líquido", "din"], ["margem_liquida", "Margem líquida", "pct"],
      ["roe", "ROE", "pct"], ["fco", "Caixa operacional", "din"], ["fcl", "Fluxo de caixa livre", "din"], ["divida_liquida", "Dívida líquida", "din"], ["divliq_ebitda", "Dív. líq./EBITDA", "x"], ["dpa", "Proventos por ação", "moeda"], ["pl", "P/L", "x"]];
  const f = (v, u) => !ok(v) ? ND : u === "din" ? `${mo} ${grande(v)}` : fmtU(v, u, mo);
  return `<div class="tabela-wrap"><table><thead><tr><th>Exercício</th>${anos.map((y) => `<th class="n">${y}</th>`).join("")}</tr></thead><tbody>
    ${linhas.map(([k, nm, u]) => `<tr><td>${esc(nm)}</td>${anos.map((y) => `<td class="n">${f(h.anual[y][k], u)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function blocoAcionistas(t) {
  const g = D.fund[t].governanca || {}, ac = g.acionistas || [], circ = g.circulacao || {};
  if (!ac.length && !ok(circ.pct_total)) return '<div class="cartao"><p class="sub">Composição acionária não disponível no Formulário de Referência (BDRs e emissores estrangeiros não entregam esse formulário à CVM).</p></div>';
  const p = (v) => ok(v) && v > 0 ? nf2.format(v * 100) + "%" : '<span class="muted">-</span>';
  const ctrl = ac.filter((a) => a.controlador).reduce((s, a) => s + a.pct_total, 0);
  const rel = ac.filter((a) => !a.controlador).reduce((s, a) => s + a.pct_total, 0);
  const ff = ok(circ.pct_total) ? circ.pct_total : g.free_float;
  const tes = g.tesouraria_pct || 0;
  const fatias = [["Controladores", ctrl, "var(--serie-2)"], ["Outros acionistas relevantes", rel, "#a78bfa"], ["Tesouraria", tes, "var(--txt-3)"], ["Free float (em circulação)", ff, "var(--acento)"]].filter(([, v]) => ok(v) && v > 0.0005);
  return `<div class="cartao"><div class="cartao-cab"><div><h3>Quem detém a empresa</h3><p class="sub">Formulário de Referência entregue à CVM (data-base ${dataBR(g.fre_data)}). A CVM exige identificar quem tem 5% ou mais de alguma classe; o restante aparece somado como free float.</p></div></div>
    <div class="barra-acionaria">${fatias.map(([n, v, c]) => `<i style="width:${Math.max(1, v * 100)}%;background:${c}" data-tip="${esc(n)}: ${nf2.format(v * 100)}%"></i>`).join("")}</div>
    <div class="legenda-acionaria">${fatias.map(([n, v, c]) => `<span><i style="background:${c}"></i>${esc(n)} <b>${nf2.format(v * 100)}%</b></span>`).join("")}</div>
    <div class="ind-grade" style="margin-top:14px">
      <div class="ind"><div class="rot">Free float total${tip("free_float")}</div><div class="val">${p(ff)}</div><div class="det">ações em circulação no mercado</div></div>
      ${ok(circ.pct_on) && circ.pct_on > 0 ? `<div class="ind"><div class="rot">Free float das ON</div><div class="val">${p(circ.pct_on)}</div><div class="det">${ok(circ.on) ? grande(circ.on) + " ações" : ""}</div></div>` : ""}
      ${ok(circ.pct_pn) && circ.pct_pn > 0 ? `<div class="ind"><div class="rot">Free float das PN</div><div class="val">${p(circ.pct_pn)}</div><div class="det">${ok(circ.pn) ? grande(circ.pn) + " ações" : ""}</div></div>` : ""}
      ${ok(circ.acionistas_pf) ? `<div class="ind"><div class="rot">Base de acionistas</div><div class="val">${grande((circ.acionistas_pf || 0) + (circ.acionistas_pj || 0))}</div><div class="det">${grande(circ.acionistas_pf || 0)} pessoas físicas · ${grande(circ.institucionais || 0)} institucionais</div></div>` : ""}
    </div>
    ${ac.length ? `<h4>Acionistas identificados</h4><div class="tabela-wrap"><table class="resp"><thead><tr><th>Acionista</th><th>Tipo</th><th class="n">% ON</th><th class="n">% PN</th><th class="n">% do capital</th></tr></thead><tbody>
      ${ac.map((a) => `<tr><td class="cel-largo" data-label=""><b>${esc(a.nome)}</b> ${a.controlador ? '<span class="badge ac">Controlador</span>' : ""}${a.acordo ? '<span class="badge">Acordo de acionistas</span>' : ""}${a.estrangeiro ? '<span class="badge">Exterior</span>' : ""}</td>
        <td data-label="Tipo">${esc(a.tipo)}</td><td class="n" data-label="% ON">${p(a.pct_on)}</td><td class="n" data-label="% PN">${p(a.pct_pn)}</td><td class="n" data-label="% do capital"><b>${p(a.pct_total)}</b></td></tr>`).join("")}
      ${tes > 0 ? `<tr><td class="cel-largo" data-label=""><b>Ações em tesouraria</b></td><td data-label="Tipo">Recompradas pela empresa</td><td></td><td></td><td class="n" data-label="% do capital"><b>${p(tes)}</b></td></tr>` : ""}
    </tbody></table></div><p class="sub" style="margin-top:8px">Tipo "Fundo ou gestora" é identificado pelo nome; o formulário classifica os demais como pessoa física ou jurídica. Atualizado a cada nova versão do Formulário de Referência.</p>` : ""}
  </div>`;
}
function blocoVendida(t) {
  const a = D.fund[t].aluguel;
  if (!a) return '<div class="cartao"><p class="sub">Sem posições em aberto de aluguel registradas na B3 para este papel no último pregão.</p></div>';
  const tag = !ok(a.pct_free_float) ? "" : a.pct_free_float >= 0.15 ? '<span class="badge neg">alta</span>' : a.pct_free_float >= 0.05 ? '<span class="badge alerta">moderada</span>' : '<span class="badge pos">baixa</span>';
  return `<div class="cartao"><div class="cartao-cab"><div><h3>Ações alugadas (posição vendida)</h3><p class="sub">No Brasil, a venda a descoberto exige alugar a ação; o saldo em aberto no aluguel é a medida pública da posição vendida. Fonte: ${esc(a.fonte)}, pregão de ${dataBR(a.data)}.</p></div>${tag}</div>
    <div class="ind-grade">
      <div class="ind principal"><span class="tag-principal">Principal</span><div class="rot">Vendida / free float${tip("aluguel_pct_ff")}</div><div class="val">${fmtU(a.pct_free_float, "pct")}</div><div class="det">${ok(a.pct_classe) ? `${nf2.format(a.pct_classe * 100)}% de todas as ações da classe` : "&nbsp;"}</div></div>
      <div class="ind"><div class="rot">Dias para cobrir${tip("aluguel_dias")}</div><div class="val">${ok(a.dias_para_cobrir) ? nf2.format(a.dias_para_cobrir) : ND}</div><div class="det">pelo volume médio de 21 pregões</div></div>
      <div class="ind"><div class="rot">Posição em R$${tip("aluguel_valor")}</div><div class="val">R$ ${grande(a.valor || 0)}</div><div class="det">${grande(a.qtd || 0)} ações em aberto</div></div>
    </div><p class="sub" style="margin-top:10px">Base do percentual: ações em circulação da classe declaradas no Formulário de Referência (CVM). Relatórios de corretoras que usam outras bases de free float, como a da Economatica, chegam a percentuais maiores; a ordem entre as empresas tende a ser a mesma. Acima de 15% do free float é considerado elevado.</p></div>`;
}
function blocoPrecoHoje(t) {
  const i = ind(t), fin = isFin(t);
  const k = (r, key, extra = "") => `<div class="ind"><div class="rot">${r}${tip(key)}</div><div class="val">${semValuation(t) ? ND : fmt(t, key)}</div><div class="det">${semValuation(t) ? "&nbsp;" : extra}</div></div>`;
  const ci = i.cresc_implicito, ch = i.cresc_historico_ref;
  let frase;
  if (isRec(t)) frase = "Empresa em recuperação: retorno e crescimento implícitos não são calculados.";
  else if (isCripto(t)) frase = "Tesouraria em bitcoin: TIR e crescimento implícito não se aplicam.";
  else if (ok(ci)) frase = `Para justificar o preço de hoje, a empresa precisa crescer <b>${nf2.format(ci * 100)}% ao ano</b> na perpetuidade.${ok(ch) ? ` Nos últimos 5 anos, ${fin ? "o lucro" : "a receita"} cresceu <b>${nf2.format(ch * 100)}% ao ano</b>.` : ""}`;
  else frase = "Crescimento implícito não calculado: falta fluxo de caixa livre (ou ROE) positivo para a conta.";
  const ref = A(t).moeda_reporte === "USD" ? "Treasury 10 anos" : "NTN-B longa";
  return `<div class="cartao"><h3>Ao preço de hoje</h3><p class="sub">Retorno anual que o preço embute e o crescimento que ele exige.</p><div class="espaco" style="height:12px"></div>
  <div class="ind-grade ind-grade-3">
    ${k("TIR implícita", "tir_implicita", ok(i.tir_spread_ref) ? `${i.tir_spread_ref >= 0 ? "+" : ""}${nf2.format(i.tir_spread_ref * 100)} p.p. sobre a ${ref}` : "")}
    ${k("Crescimento implícito", "cresc_implicito", ok(ch) ? `histórico de 5 anos: ${fmtU(ch, "pct")}` : "")}
    ${fin ? k("TIR pelo ROE", "tir_banco", `ROE sustentável ${fmtU(i.roe_sustentavel, "pct")}`) : k("TIR pelo caixa", "tir_caixa", "caixa livre médio de 3 anos")}
  </div><p class="frase">${frase}</p></div>`;
}
function blocoPiotroski(t) {
  const pz = D.fund[t].piotroski, testes = (pz && pz.testes) || {}, nomes = D.imeta.piotroski_testes || {};
  if (isFin(t)) return `<div class="cartao"><h3>Qualidade contábil</h3><p class="sub">O Piotroski F-Score usa margem bruta, giro do ativo e liquidez corrente, que não existem no balanço de bancos e seguradoras.</p></div>`;
  if (!pz || !ok(pz.pontos)) return `<div class="cartao"><h3>Qualidade contábil</h3><p class="sub">Piotroski F-Score indisponível: faltam dois exercícios anuais completos.</p></div>`;
  return `<div class="cartao"><div class="cartao-cab"><div><h3>Qualidade contábil</h3><p class="sub">Nota de 0 a 9: quantos testes de saúde contábil a empresa passou em ${pz.anos[1]} contra ${pz.anos[0]} (método Piotroski F-Score).</p></div><div class="placar"><b>${pz.pontos}</b><span>de 9</span></div></div>
  <ul class="checks">${Object.entries(testes).map(([k, v]) => `<li><span class="ic ${v === true ? "s" : v === false ? "n" : "x"}">${v === true ? "✓" : v === false ? "✕" : "?"}</span>${esc(nomes[k] || k)}${v === null ? ' <span class="muted">(sem dado)</span>' : ""}</li>`).join("")}</ul></div>`;
}
function blocoHolding(t) {
  const h = D.fund[t].holding || {};
  return `<div class="cartao"><h3>Desconto de holding</h3><p class="sub">${esc(h.nota || "")}</p><div class="espaco" style="height:10px"></div><div class="ind-grade">
    <div class="ind"><div class="rot">Valor de mercado</div><div class="val">${fmt(t, "valor_mercado")}</div></div>
    <div class="ind"><div class="rot">Soma das partes${tip("soma_partes")}</div><div class="val">${fmt(t, "soma_partes")}</div></div>
    <div class="ind"><div class="rot">Desconto${tip("desconto_holding")}</div><div class="val ${sinal(ind(t).desconto_holding)}">${fmt(t, "desconto_holding")}</div></div></div>
  <div class="espaco" style="height:12px"></div><div class="tabela-wrap"><table class="resp"><thead><tr><th>Participação</th><th class="n">% detido</th><th class="n">Valor de mercado</th><th class="n">Valor da participação</th></tr></thead><tbody>
  ${(h.partes || []).map((p) => `<tr><td class="cel-empresa">${D.univMap[p.ticker] ? empresa(p.ticker) : esc(p.ticker)}</td><td class="n" data-label="% detido">${fmtU(p.pct, "pct")}</td><td class="n" data-label="Valor de mercado">${fmtU(p.valor_mercado, "moeda_grande_brl")}</td><td class="n" data-label="Participação">${fmtU(p.valor_participacao, "moeda_grande_brl")}</td></tr>`).join("") || '<tr><td colspan="4" class="vazio">Sem participações listadas encontradas.</td></tr>'}
  </tbody></table></div></div>`;
}
function blocoCripto(t) {
  const c = D.fund[t].cripto || {};
  return `<div class="cartao"><h3>Bitcoin em caixa</h3><p class="sub">Fonte: ${esc(c.fonte || "n/d")}${c.data ? `, posição de ${dataBR(c.data)}` : ""}.</p><div class="espaco" style="height:10px"></div><div class="ind-grade">
    ${["btc_em_caixa", "valor_btc", "mnav", "btc_por_acao"].map((k) => `<div class="ind"><div class="rot">${esc(meta(k).nome)}${tip(k)}</div><div class="val">${fmt(t, k)}</div></div>`).join("")}</div></div>`;
}
function blocoBDR(t) {
  const b = D.fund[t].bdr || {};
  return `<div class="cartao"><h3>Vínculo com o papel no exterior</h3><div class="espaco" style="height:10px"></div><div class="ind-grade">
    <div class="ind"><div class="rot">Papel no exterior</div><div class="val">${esc(b.ticker_exterior || "n/d")}</div><div class="det">${esc(b.bolsa_exterior || "")}</div></div>
    <div class="ind"><div class="rot">Proporção</div><div class="val">${b.proporcao ? `${b.proporcao}:1` : "n/d"}</div><div class="det">${b.proporcao ? `${b.proporcao} BDR${b.proporcao > 1 ? "s" : ""} = 1 ação` : ""}</div></div>
    <div class="ind"><div class="rot">Preço justo do BDR${tip("bdr_preco_justo")}</div><div class="val">R$ ${ok(b.preco_justo) ? nf2.format(b.preco_justo) : "n/d"}</div><div class="det">US$ ${ok(b.preco_exterior) ? nf2.format(b.preco_exterior) : "n/d"} x PTAX ${ok(b.ptax) ? nf2.format(b.ptax) : "n/d"}</div></div>
    <div class="ind"><div class="rot">Ágio ou deságio${tip("bdr_agio")}</div><div class="val ${sinal(-(b.agio || 0))}">${ok(b.agio) ? (b.agio > 0 ? "+" : "") + nf2.format(b.agio * 100) + "%" : "n/d"}</div></div>
  </div></div>`;
}
async function blocoProventos(t) {
  const pv = await proventos(t), mo = pv.moeda === "USD" ? "US$" : "R$", i = ind(t);
  const lista = (pv.lista || []).slice(0, 20);
  return `<div class="grade g2"><div class="cartao"><div class="cartao-cab"><div><h3>Proventos por ano</h3><p class="sub">Por ${porPapel(t) > 1 ? "unit" : "ação"} · DY 12 meses ${fmtU(i.dy, "pct")} · payout ${fmtU(i.payout, "pct")}</p></div></div><div class="grafico peq"><canvas id="g-prov"></canvas></div></div>
  <div class="cartao"><h3>Últimos proventos</h3><div class="tabela-wrap" style="max-height:270px;margin-top:10px"><table class="resp"><thead><tr><th>Data com</th><th>Pagamento</th><th>Tipo</th><th class="n">Valor</th></tr></thead><tbody>
  ${lista.map((x) => `<tr><td data-label="Data com">${dataBR(x.data_com)}</td><td data-label="Pagamento">${dataBR(x.pagamento)}</td><td data-label="Tipo">${esc(x.tipo)}</td><td class="n" data-label="Valor">${mo} ${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(x.valor)}</td></tr>`).join("") || '<tr><td colspan="4" class="vazio">Sem proventos.</td></tr>'}
  </tbody></table></div><p class="sub" style="margin-top:8px">Fonte: ${esc(pv.fonte || "")}.</p></div></div>`;
}
async function abaNoticias(t) {
  const n = await noticias(t);
  const limite = Date.now() - CONFIG.NOVO_HORAS * 3600e3;
  const novo = (d) => d && new Date(d).getTime() >= limite ? ' <span class="badge novo">Novo</span>' : "";
  return `<div class="grade g2">
  <div><h3>Relações com investidores</h3><p class="sub">${A(t).tipo === "ACAO_BR" ? "Fatos relevantes, release e apresentação de resultados entregues à CVM." : "Resultados entregues à SEC (10-Q, 10-K, 20-F e 8-K de resultados)."}</p>
  ${n.site_ri && n.site_ri.url ? `<a class="btn peq ri-link" href="${esc(n.site_ri.url)}" target="_blank" rel="noopener" title="${esc(n.site_ri.fonte || "")}">${n.site_ri.tipo === "empresa" ? "Site da empresa" : "Site de RI da empresa"} ↗</a>` : ""}
  ${(n.comunicados || []).slice(0, 8).map((x) => `<div class="noticia"><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.titulo)}</a>${novo(x.data)}<div class="meta">${esc(x.categoria)} · ${dataBR(x.data)}</div></div>`).join("") || '<p class="vazio">Sem fato relevante ou resultado recente.</p>'}</div>
  <div><h3>Imprensa</h3><p class="sub">Google News.</p>
  ${(n.noticias || []).slice(0, 10).map((x) => `<div class="noticia"><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.titulo)}</a>${novo(x.data)}<div class="meta">${esc(x.veiculo)} · ${x.data ? new Date(x.data).toLocaleDateString("pt-BR") : "n/d"}</div></div>`).join("") || '<p class="vazio">Sem notícias.</p>'}</div></div>`;
}
function pares(t, n = 5) {
  const st = D.fund[t].setor || {};
  let ps = (st.pares_micro || []).filter((x) => x !== t && D.fund[x]);
  const macro = D.tickers.filter((x) => x !== t && A(x).setor_macro === A(t).setor_macro);
  ps = [...new Set([...ps, ...(st.grupo_membros || []).filter((x) => x !== t && D.fund[x]), ...macro])];
  return ps.slice(0, n);
}

/* ---------------- gráficos */
function optGraf({ stacked = false, eixo2 = false, moeda = "", legenda = true } = {}) {
  const c = cor("--txt-3"), g = cor("--borda");
  const o = { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
    plugins: { legend: { display: legenda, labels: { color: cor("--txt-2"), boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { family: "Inter" } } },
      tooltip: { backgroundColor: cor("--sup-3"), titleColor: cor("--txt"), bodyColor: cor("--txt"), borderColor: cor("--borda-forte"), borderWidth: 1, padding: 10,
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${moeda}${ok(ctx.parsed.y) ? nf2.format(ctx.parsed.y) : "n/d"}` } } },
    scales: { x: { stacked, ticks: { color: c, maxTicksLimit: 8, autoSkip: true, font: { family: "Inter" } }, grid: { display: false }, border: { color: g } },
      y: { stacked, ticks: { color: c, font: { family: "Inter" }, callback: (v) => nf2.format(v) }, grid: { color: g }, border: { display: false } } } };
  if (eixo2) o.scales.y2 = { position: "right", ticks: { color: c, font: { family: "Inter" }, callback: (v) => nf2.format(v) }, grid: { display: false }, border: { display: false } };
  return o;
}
function graficoPreco(t, h, anos) {
  const el = $("#g-preco");
  if (!el || !window.Chart) { if (el) el.parentNode.innerHTML = '<p class="vazio">Gráfico indisponível.</p>'; return; }
  const corte = new Date(); corte.setFullYear(corte.getFullYear() - anos);
  const serie = (anos === 1 ? h.precos.diario : h.precos.semanal).filter(([d]) => new Date(d) >= corte);
  charts = charts.filter((c) => { if (c.canvas === el) { c.destroy(); return false; } return true; });
  const subiu = serie.length > 1 && serie[serie.length - 1][1] >= serie[0][1];
  const linha = subiu ? cor("--pos") : cor("--neg");
  const ctx = el.getContext("2d"), grad = ctx.createLinearGradient(0, 0, 0, 300);
  grad.addColorStop(0, linha + "40"); grad.addColorStop(1, linha + "00");
  const ch = new Chart(el, { type: "line", data: { labels: serie.map(([d]) => dataBR(d)), datasets: [{ label: t, data: serie.map(([, v]) => v), borderColor: linha, backgroundColor: grad, borderWidth: 1.6, pointRadius: 0, fill: true, tension: 0.1 }] }, options: optGraf({ moeda: "R$ ", legenda: false }), plugins: [PLUGIN_MEDIR] });
  charts.push(ch);
  ativarMedicao(ch, el, moedaDe(t));
}
// Segurar o botão do mouse sobre o gráfico e arrastar mostra quanto o preço subiu ou caiu entre os dois pontos.
const PLUGIN_MEDIR = {
  id: "medir",
  afterDraw(ch) {
    const m = ch.$medir;
    if (!m || m.a == null || m.b == null || m.a === m.b) return;
    const { ctx, chartArea: { top, bottom, left, right } } = ch, xs = ch.scales.x, d = ch.data.datasets[0].data;
    const [i, j] = m.a < m.b ? [m.a, m.b] : [m.b, m.a];
    const xy = d[i] !== null && typeof d[i] === "object";
    const x1 = xs.getPixelForValue(xy ? d[i].x : i), x2 = xs.getPixelForValue(xy ? d[j].x : j), v1 = xy ? d[i].y : d[i], v2 = xy ? d[j].y : d[j];
    if (!ok(v1) || !ok(v2) || v1 === 0) return;
    const pct = v2 / v1 - 1, corV = pct >= 0 ? cor("--pos") : cor("--neg");
    ctx.save();
    ctx.fillStyle = corV + "26"; ctx.fillRect(x1, top, x2 - x1, bottom - top);
    ctx.strokeStyle = corV; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    for (const x of [x1, x2]) { ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); }
    ctx.setLineDash([]);
    for (const [x, v] of [[x1, v1], [x2, v2]]) { ctx.beginPath(); ctx.arc(x, ch.scales.y.getPixelForValue(v), 3.5, 0, 2 * Math.PI); ctx.fillStyle = corV; ctx.fill(); }
    const l1 = `${pct >= 0 ? "+" : ""}${nf2.format(pct * 100)}%`;
    const rot_ = (k) => xy ? new Date(d[k].x).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : ch.data.labels[k];
    const l2 = `${rot_(i)} a ${rot_(j)} · ${m.mo} ${nf2.format(v1)} para ${m.mo} ${nf2.format(v2)}`;
    ctx.font = "700 14px Inter, sans-serif"; const w1 = ctx.measureText(l1).width;
    ctx.font = "500 11px Inter, sans-serif"; const w2 = ctx.measureText(l2).width;
    const w = Math.max(w1, w2) + 20, hgt = 44;
    let bx = (x1 + x2) / 2 - w / 2; bx = Math.max(left, Math.min(bx, right - w));
    const by = top + 6;
    ctx.fillStyle = cor("--sup"); ctx.strokeStyle = cor("--borda-forte");
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, w, hgt, 8) : ctx.rect(bx, by, w, hgt); ctx.fill(); ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = corV; ctx.font = "700 14px Inter, sans-serif"; ctx.fillText(l1, bx + w / 2, by + 6);
    ctx.fillStyle = cor("--txt-2"); ctx.font = "500 11px Inter, sans-serif"; ctx.fillText(l2, bx + w / 2, by + 25);
    ctx.restore();
  },
};
function ativarMedicao(ch, el, mo) {
  const indice = (e) => { const p = ch.getElementsAtEventForMode(e, "index", { intersect: false }, false); return p.length ? p[0].index : null; };
  const limpar = () => { if (!ch.$medir) return; ch.$medir = null; ch.options.plugins.tooltip.enabled = true; el.style.cursor = ""; ch.update("none"); };
  el.style.userSelect = "none";
  el.title = "Segure o botão do mouse e arraste para medir a variação entre dois pontos";
  el.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const i = indice(e); if (i == null) return;
    e.preventDefault();
    ch.$medir = { a: i, b: i, mo };
    ch.options.plugins.tooltip.enabled = false; el.style.cursor = "ew-resize";
    ch.update("none");
  });
  el.addEventListener("mousemove", (e) => { if (!ch.$medir) return; const i = indice(e); if (i != null && i !== ch.$medir.b) { ch.$medir.b = i; ch.draw(); } });
  window.addEventListener("mouseup", limpar);
  el.addEventListener("mouseleave", limpar);
}
function graficoLucro(t, h) {
  const el = $("#g-lucro");
  if (!el || !window.Chart) return;
  const anos = Object.keys(h.anual || {}).sort().slice(-10), mo = moedaDe(t);
  const pl = anos.map((y) => { const v = h.anual[y].pl; return ok(v) && v > 0 ? v : null; });
  const hoje = !suprimido(t, "pl") && ok(ind(t).pl) && ind(t).pl > 0 ? ind(t).pl : null;
  const ult5 = pl.slice(-5).filter(ok), media = ult5.length ? ult5.reduce((a, b) => a + b, 0) / ult5.length : null;
  const rotulos = [...anos, "Hoje"], dados = [...pl, hoje];
  const det = (i) => {
    if (i === anos.length) return [`Preço atual: R$ ${ok(D.prices[t]?.preco) ? nf2.format(D.prices[t].preco) : "n/d"}`, `Lucro por ação 12m: ${fmtU(ind(t).lpa, "moeda", mo)}`.replace(/<[^>]+>/g, "")];
    const a = h.anual[anos[i]];
    return [`Preço no fim do ano: ${ok(a.preco_fim) ? mo + " " + nf2.format(a.preco_fim) : "n/d"}`, `Lucro por ação: ${ok(a.lpa) ? mo + " " + nf2.format(a.lpa) : "prejuízo ou n/d"}`];
  };
  const prej = anos.map((y) => { const a = h.anual[y]; return (ok(a.lucro_liq) && a.lucro_liq < 0) || (ok(a.lpa) && a.lpa < 0) ? a : null; });
  const hojePrej = !hoje && ok(ind(t).lpa) && ind(t).lpa < 0;
  const altura = Math.max(...dados.filter(ok), 4) * 0.12;
  const o = optGraf({ legenda: false });
  o.plugins.tooltip.callbacks = {
    label: (ctx) => {
      if (ctx.dataset.prejuizo) {
        const i = ctx.dataIndex, a = i < anos.length ? prej[i] : null;
        if (i === anos.length) return "A empresa está com prejuízo nos últimos 12 meses: sem P/L.";
        return ok(a && a.lucro_liq) ? `Neste ano a empresa teve prejuízo líquido de ${mo} ${grande(Math.abs(a.lucro_liq))}.` : "Neste ano a empresa teve prejuízo líquido.";
      }
      return `P/L: ${ok(ctx.parsed.y) ? nf2.format(ctx.parsed.y) : "n/d"}`;
    },
    afterLabel: (ctx) => ctx.dataset.prejuizo ? "Sem P/L: com prejuízo o múltiplo não tem sentido." : det(ctx.dataIndex),
  };
  const ds = [{ type: "bar", label: "P/L", data: dados, backgroundColor: rotulos.map((r) => r === "Hoje" ? cor("--acento-forte") : cor("--serie-2")), borderRadius: 4, stack: "a" },
    { type: "bar", label: "Prejuízo", prejuizo: true, data: [...prej.map((a) => a ? altura : null), hojePrej ? altura : null], backgroundColor: cor("--neg"), borderRadius: 4, stack: "a" }];
  if (ok(media)) ds.push({ type: "line", label: "Média 5 anos", data: rotulos.map(() => media), borderColor: cor("--txt-3"), borderDash: [6, 5], borderWidth: 1.5, pointRadius: 0 });
  charts.push(new Chart(el, { data: { labels: rotulos, datasets: ds }, options: o }));
}
function triAnterior(tri, x) {
  const alvo = `${+x.fim.slice(0, 4) - 1}${x.fim.slice(4, 7)}`;
  return tri.find((y) => y.fim.slice(0, 7) === alvo) || null;
}
function blocoTrimestral(t, h) {
  const tri = h.trimestral || [], mo = moedaDe(t);
  if (tri.length < 2) return `<h3>Resultados trimestrais</h3><p class="sub">Sem demonstrações trimestrais suficientes para a comparação.</p>`;
  const ult = tri[tri.length - 1], ant = triAnterior(tri, ult);
  const receitaK = ok(ult.receita) ? "receita" : "rec_interm";
  const itens = [[receitaK, receitaK === "receita" ? "Receita líquida" : "Receita de intermediação", "din"], ["ebitda", "EBITDA", "din"], ["lucro_liq", "Lucro líquido", "din"], ["margem_liquida", "Margem líquida", "pct"]]
    .filter(([k]) => ok(ult[k]));
  const vf = (v, u) => !ok(v) ? ND : u === "pct" ? fmtU(v, "pct") : `${mo} ${grande(v)}`;
  const variacao = (a, b, u) => {
    if (!ok(a) || !ok(b)) return '<span class="muted">sem base</span>';
    if (u === "pct") { const d = (a - b) * 100; return `<span class="${sinal(d)}">${d > 0 ? "+" : ""}${nf2.format(d)} p.p.</span>`; }
    if (b <= 0) return a > b ? '<span class="pos">melhora</span>' : '<span class="neg">piora</span>';
    return varHtml(a / b - 1);
  };
  // acumulado do ano: trimestres do ano corrente contra os mesmos do ano anterior
  const ano = ult.fim.slice(0, 4), noAno = tri.filter((x) => x.fim.slice(0, 4) === ano);
  const antAno = noAno.map((x) => triAnterior(tri, x));
  const soma = (l, k) => l.every((x) => x && ok(x[k])) ? l.reduce((a, x) => a + x[k], 0) : null;
  const acc = noAno.length > 1 && antAno.every(Boolean) ? [[receitaK, "Receita"], ["lucro_liq", "Lucro líquido"]].map(([k, nm]) => [nm, soma(noAno, k), soma(antAno, k)]) : [];
  const rot9 = `${noAno.length * 3}M${ano.slice(2)}`, rot9a = `${noAno.length * 3}M${String(+ano - 1).slice(2)}`;
  // pares: cada trimestre mais recente (1T a 4T) contra o mesmo trimestre do ano anterior
  const porNum = {};
  for (const x of tri) porNum[x.rotulo[0]] = x;
  const pares = Object.values(porNum).map((x) => [triAnterior(tri, x), x]).filter(([a]) => a).sort((a, b) => a[1].fim.localeCompare(b[1].fim));
  const agu = ((D.fund[t] || {}).agenda || {}).ultima;
  const colunas = [[receitaK, receitaK === "receita" ? "Receita" : "Rec. intermediação", "din"], ["ebitda", "EBITDA", "din"], ["lucro_liq", "Lucro líquido", "din"], ["margem_liquida", "Margem líquida", "pct"]]
    .filter(([k]) => pares.some(([a, b]) => ok(a[k]) || ok(b[k])));
  return `<div class="cartao-cab"><div><h3>Resultados trimestrais</h3><p class="sub">Os números consideram o último resultado trimestral divulgado: <b>${ult.rotulo}</b>, trimestre encerrado em ${dataBR(ult.fim)}${agu && agu.entrega && agu.fim === ult.fim ? `, entregue à CVM em ${dataBR(agu.entrega)}` : ""}. Comparação com o mesmo trimestre do ano anterior${ant ? ` (${ant.rotulo})` : ""}.</p></div></div>
  <div class="ind-grade">${itens.map(([k, nm, u]) => `<div class="ind"><div class="rot">${nm} ${ult.rotulo}</div><div class="val">${vf(ult[k], u)}</div>
    <div class="det">${ant ? `${ant.rotulo}: ${vf(ant[k], u)} · ${variacao(ult[k], ant[k], u)}` : "sem trimestre comparável"}</div></div>`).join("")}</div>
  ${acc.length ? `<h4>Acumulado do ano (${rot9} contra ${rot9a})</h4><div class="ind-grade">${acc.map(([nm, a, b]) => `<div class="ind"><div class="rot">${nm} ${rot9}</div><div class="val">${vf(a, "din")}</div><div class="det">${rot9a}: ${vf(b, "din")} · ${variacao(a, b, "din")}</div></div>`).join("")}</div>` : ""}
  ${pares.length ? `<h4>Trimestre contra o mesmo trimestre do ano anterior</h4>
  <div class="linha entre" style="margin-bottom:8px"><span class="sub">Barra cinza: trimestre do ano anterior. Barra verde: trimestre mais recente.</span>
    <div class="abas" id="tri-met" style="margin:0">${colunas.map(([k, nm], i) => `<button data-k="${k}" class="${i === 0 ? "ativo" : ""}">${nm}</button>`).join("")}</div></div>
  <div class="grafico peq"><canvas id="g-tri"></canvas></div>
  <div class="tabela-wrap" style="margin-top:14px"><table class="tab-pares"><thead><tr><th>Trimestre</th>${colunas.map(([, nm]) => `<th class="n" colspan="3">${nm}</th>`).join("")}</tr>
    <tr class="sub-cab"><th></th>${colunas.map(() => '<th class="n">Ano anterior</th><th class="n">Atual</th><th class="n">Variação</th>').join("")}</tr></thead><tbody>
    ${pares.map(([a, b]) => `<tr><td><span class="muted">${a.rotulo}</span> x <b>${b.rotulo}</b></td>${colunas.map(([k, , u]) => `<td class="n muted">${vf(a[k], u)}</td><td class="n"><b>${vf(b[k], u)}</b></td><td class="n">${variacao(b[k], a[k], u)}</td>`).join("")}</tr>`).join("")}
  </tbody></table></div>` : ""}`;
}
function graficoTrimestral(t, h, chave) {
  const el = $("#g-tri"), tri = h.trimestral || [];
  if (!el || !window.Chart || !tri.length) return;
  const porNum = {};
  for (const x of tri) porNum[x.rotulo[0]] = x;
  const pares = Object.values(porNum).map((x) => [triAnterior(tri, x), x]).filter(([a]) => a).sort((a, b) => a[1].fim.localeCompare(b[1].fim));
  const k = chave || (tri.some((x) => ok(x.receita)) ? "receita" : "rec_interm"), mo = moedaDe(t), pct = k.startsWith("margem");
  const conv = (v) => ok(v) ? (pct ? v * 100 : v / 1e9) : null;
  charts = charts.filter((c) => { if (c.canvas === el) { c.destroy(); return false; } return true; });
  const o = optGraf({});
  o.plugins.tooltip.callbacks.label = (ctx) => { const par = pares[ctx.dataIndex]; return `${par[ctx.datasetIndex].rotulo}: ${ok(ctx.parsed.y) ? nf2.format(ctx.parsed.y) + (pct ? "%" : ` ${mo === "US$" ? "US$" : "R$"} bi`) : "n/d"}`; };
  o.plugins.tooltip.callbacks.title = (it) => { const [a, b] = pares[it[0].dataIndex]; return `${a.rotulo} x ${b.rotulo}`; };
  charts.push(new Chart(el, { type: "bar", data: { labels: pares.map(([a, b]) => `${a.rotulo} x ${b.rotulo}`), datasets: [
    { label: "Ano anterior", data: pares.map(([a]) => conv(a[k])), backgroundColor: cor("--borda-forte"), borderRadius: 3 },
    { label: "Ano mais recente", data: pares.map(([, b]) => conv(b[k])), backgroundColor: pares.map(([, b]) => (b[k] || 0) >= 0 ? cor("--serie") : cor("--neg")), borderRadius: 3 },
  ] }, options: o }));
  $$("#tri-met button").forEach((bt) => bt.onclick = () => { $$("#tri-met button").forEach((x) => x.classList.toggle("ativo", x === bt)); graficoTrimestral(t, h, bt.dataset.k); });
}
async function graficoProventos(t) {
  const pv = await proventos(t), el = $("#g-prov");
  if (!el || !window.Chart) return;
  const anoAtual = new Date().getFullYear();
  const anos = Object.keys(pv.por_ano || {}).map(Number).filter((a) => a >= anoAtual - 10).sort();
  const tipo = pv.por_ano_tipo || {};
  const ds = [];
  if (anos.some((a) => tipo[a])) {
    ds.push({ label: "Dividendos", data: anos.map((a) => tipo[a] ? tipo[a].DIVIDENDO : null), backgroundColor: cor("--serie"), borderRadius: 3 });
    ds.push({ label: "JCP", data: anos.map((a) => tipo[a] ? tipo[a].JCP : null), backgroundColor: cor("--serie-2"), borderRadius: 3 });
    ds.push({ label: "Sem separação", data: anos.map((a) => tipo[a] ? null : pv.por_ano[a]), backgroundColor: cor("--txt-3"), borderRadius: 3 });
  } else ds.push({ label: "Proventos", data: anos.map((a) => pv.por_ano[a]), backgroundColor: cor("--serie"), borderRadius: 3 });
  charts.push(new Chart(el, { type: "bar", data: { labels: anos, datasets: ds }, options: optGraf({ stacked: true }) }));
}
let graficoModal = null;
function fecharModal() { if (graficoModal) { try { graficoModal.destroy(); } catch (e) {} graficoModal = null; } const m = $("#modal"); if (m) m.remove(); }
function modalHistorico(t, k, h) {
  fecharModal();
  const anos = Object.keys(h.anual || {}).sort();
  const m = meta(k), pct = m.unidade === "pct", fator = pct ? 100 : 1;
  const dados = anos.map((y) => ok(h.anual[y][k]) ? h.anual[y][k] * fator : null);
  const atual = val(t, k);
  const div = document.createElement("div");
  div.id = "modal"; div.className = "modal-fundo";
  div.innerHTML = `<div class="modal" role="dialog" aria-label="Histórico de ${esc(rot(k))}"><div class="cartao-cab"><div><h3>${esc(rot(k))} de ${t}</h3><p class="sub">${esc(m.formula || "")}</p></div><button class="btn peq" id="modal-x">Fechar</button></div>
    <div class="grafico"><canvas id="g-modal"></canvas></div><p class="sub" style="margin-top:8px">Valor anual de cada exercício. Últimos 12 meses: <b>${stripTags(fmt(t, k, atual))}</b>.</p></div>`;
  document.body.appendChild(div);
  div.onclick = (e) => { if (e.target === div) fecharModal(); };
  $("#modal-x").onclick = fecharModal;
  if (window.Chart) {
    const o = optGraf({ legenda: false });
    o.plugins.tooltip.callbacks.label = (ctx) => `${rot(k)}: ${ok(ctx.parsed.y) ? nf2.format(ctx.parsed.y) + (pct ? "%" : "") : "n/d"}`;
    graficoModal = new Chart($("#g-modal"), { type: "bar", data: { labels: anos, datasets: [{ label: rot(k), data: dados, backgroundColor: dados.map((v) => (v ?? 0) >= 0 ? cor("--serie") : cor("--neg")), borderRadius: 4 }] }, options: o });
  }
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });

/* ---------------- histórico de um item da faixa de cotações (abre ao clicar) */
const MERC_PERIODOS = [["1M", 1 / 12], ["6M", 0.5], ["1A", 1], ["5A", 5], ["10A", 10], ["Máx.", 0]];
async function modalMercado(k) {
  fecharModal();
  const div = document.createElement("div");
  div.id = "modal"; div.className = "modal-fundo";
  div.innerHTML = `<div class="modal modal-merc" role="dialog" aria-label="Histórico"><p class="vazio">Carregando histórico...</p></div>`;
  document.body.appendChild(div);
  div.onclick = (e) => { if (e.target === div) fecharModal(); };
  if (!D.cache["merc_" + k]) D.cache["merc_" + k] = await j(`data/mercado/${k}.json?v=${encodeURIComponent(D.meta.gerado_em || "")}`, null);
  const h = D.cache["merc_" + k];
  if (document.getElementById("modal") !== div) return;
  const caixa = div.querySelector(".modal");
  if (!h || !h.serie || !h.serie.length) {
    caixa.innerHTML = `<div class="cartao-cab"><h3>Histórico</h3><button class="btn peq" id="modal-x">Fechar</button></div><p class="vazio">Histórico indisponível.</p>`;
    $("#modal-x").onclick = fecharModal; return;
  }
  const taxa = h.unidade === "pct", pre = h.unidade === "R$" ? "R$ " : h.unidade === "US$" ? "US$ " : "";
  const fv = (v) => ok(v) ? (taxa ? nf2.format(v * 100) + "%" : pre + nf2.format(v)) : "n/d";
  const ult = h.serie[h.serie.length - 1];
  const proj = h.projecao && h.projecao.pontos && h.projecao.pontos.length ? h.projecao : null;
  const anosHist = (Date.parse(ult[0]) - Date.parse(h.serie[0][0])) / 3.156e10;
  const periodos = MERC_PERIODOS.filter(([, a]) => !a || a < anosHist + 0.5);
  let per = EST.mercPer && periodos.some(([n]) => n === EST.mercPer) ? EST.mercPer : (taxa ? "5A" : "1A");
  caixa.innerHTML = `<div class="cartao-cab"><div><h3>${esc(h.nome)}</h3><p class="sub">Último fechamento: <b>${fv(ult[1])}${h.unidade === "pts" ? " pts" : ""}</b> em ${dataBR(ult[0])}</p></div><button class="btn peq" id="modal-x">Fechar</button></div>
    <div class="segmentado" id="merc-per" style="margin:4px 0 12px">${periodos.map(([n]) => `<button data-p="${n}">${n}</button>`).join("")}</div>
    <div class="merc-nums" id="merc-nums"></div>
    <div class="grafico"><canvas id="g-modal"></canvas></div>
    ${proj ? `<div class="merc-proj"><div class="merc-proj-t">Projeção do mercado (Boletim Focus de ${dataBR(proj.data)})</div><div class="merc-proj-l">${proj.pontos.map(([d, v]) => `<div>Fim de ${d.slice(0, 4)}<b>${fv(v)}</b></div>`).join("")}</div></div>` : ""}
    <p class="sub" style="margin-top:10px">Fonte: ${esc(h.fonte)}.${proj ? " Projeção: mediana das estimativas de instituições financeiras coletadas pelo Banco Central; não é previsão do site." : ""}${taxa ? "" : " Segure o botão do mouse e arraste no gráfico para medir a variação entre dois pontos."}${anosHist > 5 ? " Antes dos últimos 5 anos, o gráfico usa um ponto por semana." : ""}</p>`;
  $("#modal-x").onclick = fecharModal;
  const desenhar = () => {
    EST.mercPer = per;
    $$("#merc-per button").forEach((b) => b.classList.toggle("ativo", b.dataset.p === per));
    const anos = MERC_PERIODOS.find(([n]) => n === per)[1];
    const corte = anos ? new Date(Date.parse(ult[0]) - anos * 3.156e10).toISOString().slice(0, 10) : "";
    const s = h.serie.filter(([d]) => d >= corte);
    const vs = s.map((x) => x[1]), v0 = vs[0], v1 = vs[vs.length - 1];
    const dv = taxa ? v1 - v0 : v1 / v0 - 1;
    const varTxt = `${dv >= 0 ? "+" : ""}${nf2.format(dv * 100)}${taxa ? " p.p." : "%"}`;
    const anosS = (Date.parse(s[s.length - 1][0]) - Date.parse(s[0][0])) / 3.156e10;
    const anual = !taxa && anosS >= 2 ? `<div>Variação média por ano<b>${nf2.format((Math.pow(v1 / v0, 1 / anosS) - 1) * 100)}%</b></div>` : "";
    $("#merc-nums").innerHTML = `<div>Variação no período<b class="${sinal(dv)}">${varTxt}</b></div><div>Mínima<b>${fv(Math.min(...vs))}</b></div><div>Máxima<b>${fv(Math.max(...vs))}</b></div>${anual}`;
    if (graficoModal) { try { graficoModal.destroy(); } catch (e) {} graficoModal = null; }
    if (!window.Chart) return;
    const el = $("#g-modal"), f = taxa ? 100 : 1;
    const pontos = s.map(([d, v]) => ({ x: Date.parse(d), y: v * f }));
    const linha = taxa ? cor("--serie") : dv >= 0 ? cor("--pos") : cor("--neg");
    const g = el.getContext("2d").createLinearGradient(0, 0, 0, 300); g.addColorStop(0, linha + "40"); g.addColorStop(1, linha + "00");
    const ds = [{ label: h.nome, data: pontos, borderColor: linha, backgroundColor: g, borderWidth: 1.6, pointRadius: 0, fill: true, tension: 0.1 }];
    if (proj && (!anos || anos >= 1)) ds.push({ label: "Projeção Focus", data: [pontos[pontos.length - 1], ...proj.pontos.map(([d, v]) => ({ x: Date.parse(d), y: v * f }))],
      borderColor: cor("--txt-2"), borderDash: [5, 4], borderWidth: 1.6, pointRadius: 3, pointBackgroundColor: cor("--txt-2"), fill: false, tension: 0 });
    const o = optGraf({ legenda: ds.length > 1 });
    const curto = anos && anos <= 1 && ds.length === 1;
    const ultX = ds[ds.length - 1].data[ds[ds.length - 1].data.length - 1].x;
    o.scales.x = { ...o.scales.x, type: "linear", min: pontos[0].x, max: ultX, ticks: { ...o.scales.x.ticks, callback: (v) => new Date(v).toLocaleDateString("pt-BR", curto ? { day: "2-digit", month: "2-digit", timeZone: "UTC" } : { month: "2-digit", year: "numeric", timeZone: "UTC" }) } };
    o.scales.y.ticks.callback = (v) => nf2.format(v) + (taxa ? "%" : "");
    o.interaction = { mode: "nearest", axis: "x", intersect: false };
    o.plugins.tooltip.callbacks.title = (it) => it.length ? new Date(it[0].parsed.x).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "";
    o.plugins.tooltip.callbacks.label = (ctx) => `${ctx.dataset.label}: ${fv(ctx.parsed.y / f)}`;
    graficoModal = new Chart(el, { type: "line", data: { datasets: ds }, options: o, plugins: taxa ? [] : [PLUGIN_MEDIR] });
    if (!taxa) ativarMedicao(graficoModal, el, pre.trim());
  };
  $$("#merc-per button").forEach((b) => b.onclick = () => { per = b.dataset.p; desenhar(); });
  desenhar();
}


/* =====================================================================
   SIMULADOR DE CARTEIRA: renda estimada pelos últimos proventos
   ===================================================================== */
const SIM_CHAVE = "simulador_carteira_v1";
const SIM_IR = { jcp: 0.175, div: 0.10, div_limite_mes: 50000 };   // JCP: LC 224/2025; dividendos acima de R$ 50 mil/mês da mesma empresa: Lei 15.270/2025
const SIM_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function simEstado() {
  const s = lsGet(SIM_CHAVE, null) || {};
  let itens = Array.isArray(s.itens) ? s.itens.filter((x) => x && x.t) : [];
  let total = ok(s.total) && s.total > 0 ? s.total : 0;
  // versão anterior guardava quantidades: converte em porcentagem pelo preço atual
  if (itens.some((x) => !ok(x.pct)) && itens.length) {
    const vals = itens.map((x) => (ok(x.q) && ok(simPreco(x.t)) ? x.q * simPreco(x.t) : 0)), soma = vals.reduce((a, v) => a + v, 0);
    if (!total) total = Math.round(soma);
    itens = itens.map((x, i) => ({ t: x.t, pct: soma ? Math.round(vals[i] / soma * 10000) / 100 : 0, div: x.div, jcp: x.jcp }));
  }
  return { total, itens, fiiBase: s.fiiBase === "12m" ? "12m" : "ultimo", liquido: !!s.liquido, salvas: s.salvas && typeof s.salvas === "object" ? s.salvas : {} };
}
function simSalvar(S) { lsSet(SIM_CHAVE, S); }
function simClasse(t) {
  const f = D.fiiMap && D.fiiMap[t];
  if (f) return f.tipo === "infra" ? "FI-Infra" : f.tipo === "fiagro" ? "Fiagro" : "FII";
  if (D.univMap[t]) return emAcoes(t) ? "Ação" : "BDR";
  return null;
}
function simPreco(t) {
  const f = D.fiiMap && D.fiiMap[t];
  if (f) return fiiPreco(t, f.preco);
  return (D.prices[t] || {}).preco;
}
function simNome(t) { const f = D.fiiMap && D.fiiMap[t]; return f ? f.nome : (D.univMap[t] || {}).nome || ""; }
// Proventos considerados por cota/ação, cada um com o mês de pagamento (0 a 11) e a natureza para o IR.
async function simProventos(t, it, S) {
  const cl = simClasse(t), f = D.fiiMap && D.fiiMap[t];
  if (f) {
    const mensal = S.fiiBase === "12m" && ok(f.rend_12m) && !f.dy_parcial_meses ? f.rend_12m / 12 : f.ultimo_rendimento;
    if (!ok(mensal)) return { itens: [], base: "sem rendimento informado" };
    const base = S.fiiBase === "12m" && ok(f.rend_12m) && !f.dy_parcial_meses ? `média de 12 meses: R$ ${NF(4).format(mensal)} por mês` : `último rendimento: R$ ${NF(4).format(mensal)} por mês`;
    return { itens: SIM_MESES.map((_, m) => ({ mes: m, valor: mensal, nat: "isento" })), base };
  }
  if (cl === "BDR") {
    // BDR: rendimento de 12 meses em reais pelo dividend yield do site (já considera a proporção e o câmbio)
    const dy = ind(t).dy, p = simPreco(t);
    if (!ok(dy) || !ok(p) || dy <= 0) return { itens: [], base: "sem proventos em 12 meses" };
    const pv = await proventos(t), corte = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    const meses = (pv.lista || []).filter((x) => x.data_com >= corte).map((x) => new Date((x.pagamento || x.data_com) + "T12:00").getMonth());
    const ms = meses.length ? meses : [11], total = dy * p;
    return { itens: ms.map((m) => ({ mes: m, valor: total / ms.length, nat: "bdr" })), base: `proventos de 12 meses: R$ ${NF(4).format(total)} por BDR` };
  }
  const pv = await proventos(t), corte = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const doze = (pv.lista || []).filter((x) => x.data_com >= corte && x.tipo !== "Rest Cap Din");
  const usar = doze.filter((x) => x.tipo === "JCP" ? it.jcp !== false : it.div !== false);
  const soma = (l) => l.reduce((a, x) => a + x.valor, 0);
  const jcp = soma(doze.filter((x) => x.tipo === "JCP")), div = soma(doze.filter((x) => x.tipo !== "JCP"));
  return {
    itens: usar.map((x) => ({ mes: new Date((x.pagamento || x.data_com) + "T12:00").getMonth(), valor: x.valor, nat: x.tipo === "JCP" ? "jcp" : "div" })),
    base: `12 meses: dividendos R$ ${NF(4).format(div)} e JCP R$ ${NF(4).format(jcp)} por ${porPapel(t) > 1 ? "unit" : "ação"}`,
    temJcp: jcp > 0, temDiv: div > 0,
  };
}
async function pgSimulador(app, q) {
  const S = simEstado();
  // carteira recebida por link: v=100000&c=PETR4:20,HGLG11:30
  if (q.get("c")) {
    const novos = q.get("c").split(",").map((x) => x.split(":")).map(([t, n]) => ({ t: (t || "").toUpperCase(), pct: Math.max(0, +n || 0) })).filter((x) => simClasse(x.t));
    if (novos.length) { S.itens = novos; if (+q.get("v") > 0) S.total = +q.get("v"); simSalvar(S); }
    history.replaceState(null, "", "#/simulador");
  }
  const todos = [...D.tickers.map((t) => [t, simClasse(t), simNome(t)]), ...D.fiis.map((f) => [f.ticker, simClasse(f.ticker), f.nome])];
  const nfPct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  const somaPct = () => S.itens.reduce((a, x) => a + (ok(x.pct) ? x.pct : 0), 0);
  app.innerHTML = `${trilha([["Simulador de carteira"]])}<div class="cab-pagina"><div><h1>Simulador de carteira</h1>
    <p>Informe quanto quer investir, escolha os ativos e a porcentagem de cada um. A quantidade de cada ativo e a renda estimada se ajustam sozinhas, pelo preço atual e pelos últimos proventos.</p></div></div>
  <div class="cartao sim-topo">
    <label class="sim-total"><span>Valor para investir</span><div class="sim-reais"><i>R$</i><input type="text" inputmode="decimal" id="sim-total" value="${S.total ? nf2.format(S.total) : ""}" placeholder="100.000,00" aria-label="Valor para investir em reais"></div></label>
    <div class="sim-add">
      <div class="sim-busca"><input type="search" id="sim-t" placeholder="Adicionar ativo: ticker ou nome (ex.: BBDC4, HGLG11)" autocomplete="off" aria-label="Ativo"><div class="busca-lista" id="sim-lista" hidden></div></div>
      <div class="sim-pct-in"><input type="text" inputmode="decimal" id="sim-p" placeholder="%" aria-label="Porcentagem da carteira"><i>%</i></div>
      <button class="btn prim" id="sim-ok">Adicionar</button>
    </div>
    <p class="sub" id="sim-msg" style="margin:0"></p>
  </div>
  <div class="sim-opcoes"><div class="sim-grupo">
    <label>Renda dos fundos <select id="sim-fii"><option value="ultimo" ${S.fiiBase === "ultimo" ? "selected" : ""}>Último rendimento anunciado</option><option value="12m" ${S.fiiBase === "12m" ? "selected" : ""}>Média dos últimos 12 meses</option></select></label>
    <label>Valores <select id="sim-liq"><option value="0" ${!S.liquido ? "selected" : ""}>Brutos</option><option value="1" ${S.liquido ? "selected" : ""}>Líquidos do IR retido na fonte</option></select></label>
    </div><div class="sim-grupo">
    <button class="btn peq" id="sim-igual" title="Mesma porcentagem para todos os ativos">Dividir igualmente</button>
    <select id="sim-carregar"><option value="">Carteiras salvas</option>${Object.keys(S.salvas).sort().map((n) => `<option>${esc(n)}</option>`).join("")}</select>
    <button class="btn peq" id="sim-salvar">Salvar carteira</button>
    <button class="btn peq" id="sim-link">Copiar link</button>
    <button class="btn peq" id="sim-xls">Baixar Excel</button>
    <button class="btn peq" id="sim-limpar">Limpar</button>
  </div></div>
  <div id="sim-corpo"></div>`;
  const lerNum = (s) => { const v = parseFloat(String(s || "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isFinite(v) ? v : NaN; };
  const inp = $("#sim-t"), lst = $("#sim-lista"), pin = $("#sim-p"), msg = $("#sim-msg"), tot = $("#sim-total");
  let escolhido = null;
  const dicaPct = () => { const r = 100 - somaPct(); pin.placeholder = r > 0.004 ? nfPct.format(r) : "0"; };
  dicaPct();
  // ---- valor total
  tot.onchange = () => { const v = lerNum(tot.value); S.total = v > 0 ? v : 0; tot.value = S.total ? nf2.format(S.total) : ""; simSalvar(S); desenhar(); };
  tot.onkeydown = (e) => { if (e.key === "Enter") tot.blur(); };
  // ---- busca de ativos
  const mostrar = () => {
    const v = inp.value.trim().toUpperCase(); escolhido = null;
    if (!v) { lst.hidden = true; return; }
    const sem = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
    const r = todos.filter(([t, , n]) => t.startsWith(v) || sem(n || "").includes(sem(v))).sort((a, b) => (b[0].startsWith(v)) - (a[0].startsWith(v)) || a[0].localeCompare(b[0])).slice(0, 8);
    lst.innerHTML = r.map(([t, c, n]) => `<button type="button" data-t="${t}">${logo(t)}<span><b>${t}</b> <span class="muted">${esc(c)}</span><br><small>${esc(n)}</small></span></button>`).join("") || '<p class="vazio" style="padding:10px">Nenhum ativo encontrado.</p>';
    lst.hidden = false;
    $$("button", lst).forEach((b) => b.onclick = () => { escolhido = b.dataset.t; inp.value = b.dataset.t; lst.hidden = true; pin.focus(); });
  };
  inp.oninput = mostrar;
  inp.onkeydown = (e) => { if (e.key === "Enter") { const p = $("button", lst); if (!lst.hidden && p) p.click(); else pin.focus(); } };
  document.addEventListener("click", (e) => { if (!e.target.closest(".sim-busca")) lst.hidden = true; });
  const adicionar = () => {
    const t = (escolhido || inp.value.trim().toUpperCase());
    if (!simClasse(t)) { msg.textContent = "Escolha um ativo da lista."; return; }
    let p = lerNum(pin.value);
    if (!(p >= 0)) p = Math.max(0, Math.round((100 - somaPct()) * 100) / 100);   // vazio: usa o que falta para 100%
    const ex = S.itens.find((x) => x.t === t);
    if (ex) ex.pct = Math.round((ex.pct + p) * 100) / 100; else S.itens.push({ t, pct: p });
    msg.textContent = p === 0 ? `${t} entrou com 0%; ajuste a porcentagem na tabela.` : "";
    inp.value = ""; pin.value = ""; escolhido = null;
    simSalvar(S); dicaPct(); desenhar(); inp.focus();
  };
  $("#sim-ok").onclick = adicionar;
  pin.onkeydown = (e) => { if (e.key === "Enter") adicionar(); };
  $("#sim-fii").onchange = (e) => { S.fiiBase = e.target.value; simSalvar(S); desenhar(); };
  $("#sim-liq").onchange = (e) => { S.liquido = e.target.value === "1"; simSalvar(S); desenhar(); };
  $("#sim-igual").onclick = () => {
    if (!S.itens.length) return;
    const n = S.itens.length, base = Math.floor(10000 / n) / 100;
    S.itens.forEach((x, i) => { x.pct = i === n - 1 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base; });
    simSalvar(S); dicaPct(); desenhar();
  };
  $("#sim-salvar").onclick = () => {
    if (!S.itens.length) { msg.textContent = "A carteira está vazia."; return; }
    const nome = prompt("Nome da carteira:"); if (!nome) return;
    S.salvas[nome] = { total: S.total, itens: S.itens.map((x) => ({ ...x })) }; simSalvar(S); pgSimulador(app, new URLSearchParams());
  };
  $("#sim-carregar").onchange = (e) => {
    const n = e.target.value, c = S.salvas[n]; if (!n || !c) return;
    if (confirm(`Abrir a carteira "${n}"? A carteira atual será substituída (salve antes se quiser mantê-la).\n\nPara apagar a carteira salva, clique em Cancelar e depois em OK na próxima pergunta.`)) {
      if (Array.isArray(c)) { S.itens = c.map((x) => ({ ...x })); } else { S.itens = c.itens.map((x) => ({ ...x })); S.total = c.total || S.total; }
      simSalvar(S); pgSimulador(app, new URLSearchParams()); return;
    } else if (confirm(`Apagar a carteira salva "${n}"?`)) { delete S.salvas[n]; simSalvar(S); pgSimulador(app, new URLSearchParams()); return; }
    e.target.value = "";
  };
  $("#sim-limpar").onclick = () => { if (S.itens.length && confirm("Remover todos os ativos da carteira?")) { S.itens = []; simSalvar(S); dicaPct(); desenhar(); } };
  $("#sim-link").onclick = async () => {
    const url = `${location.origin}${location.pathname}#/simulador?v=${Math.round(S.total)}&c=${S.itens.map((x) => `${x.t}:${x.pct}`).join(",")}`;
    try { await navigator.clipboard.writeText(url); msg.textContent = "Link copiado. Quem abrir verá esta mesma carteira."; } catch (e) { prompt("Copie o link:", url); }
  };
  let linhasXls = [];
  $("#sim-xls").onclick = () => { if (linhasXls.length) baixarExcel("simulador_carteira", [{ nome: "Carteira", cab: ["Ticker", "Classe", "Nome", "Porcentagem", "Quantidade", "Preço (R$)", "Valor investido (R$)", "Renda 12 meses (R$)", "Renda média mensal (R$)", "Yield", "Base"], linhas: linhasXls }]); };

  async function desenhar() {
    const corpo = $("#sim-corpo");
    if (!S.itens.length) { corpo.innerHTML = `<div class="cartao"><p class="vazio">Informe o valor para investir e adicione os ativos com a porcentagem de cada um. Se deixar a porcentagem em branco, o ativo recebe o que falta para 100%. Depois dá para ajustar tudo na tabela ou usar "Dividir igualmente".</p></div>`; linhasXls = []; return; }
    if (!D.cache.div) corpo.innerHTML = '<div class="cartao"><p class="vazio">Carregando proventos...</p></div>';
    const linhas = [];
    for (const it of S.itens) {
      const t = it.t, cl = simClasse(t), p = simPreco(t);
      if (!cl) continue;
      const pv = await simProventos(t, it, S);
      const alvo = S.total * (it.pct || 0) / 100;
      it.q = ok(p) && p > 0 ? Math.floor(alvo / p + 1e-9) : 0;
      linhas.push({ it, t, cl, p, pv, alvo, valor: ok(p) ? p * it.q : 0 });
    }
    // IR: dividendos por empresa e mês, para a regra dos R$ 50 mil
    const emissor = (t) => (D.univMap[t] && D.univMap[t].emissor_b3) || t;
    const divMes = {};
    for (const l of linhas) for (const x of l.pv.itens) if (x.nat === "div") { const k = emissor(l.t) + "|" + x.mes; divMes[k] = (divMes[k] || 0) + x.valor * l.it.q; }
    const liquido = (l, x) => {
      const bruto = x.valor * l.it.q;
      if (!S.liquido) return bruto;
      if (x.nat === "jcp") return bruto * (1 - SIM_IR.jcp);
      if (x.nat === "div" && (divMes[emissor(l.t) + "|" + x.mes] || 0) > SIM_IR.div_limite_mes) return bruto * (1 - SIM_IR.div);
      return bruto;
    };
    const investido = linhas.reduce((a, l) => a + (l.valor || 0), 0), soma = somaPct();
    const naoAloc = S.total * Math.max(0, 100 - soma) / 100, arred = Math.max(0, linhas.reduce((a, l) => a + (l.alvo - l.valor), 0));
    const porMes = SIM_MESES.map(() => ({}));
    for (const l of linhas) {
      l.renda = 0;
      for (const x of l.pv.itens) { const v = liquido(l, x); l.renda += v; porMes[x.mes][l.cl] = (porMes[x.mes][l.cl] || 0) + v; }
    }
    const renda = linhas.reduce((a, l) => a + l.renda, 0);
    const temDiv50 = S.liquido && Object.values(divMes).some((v) => v > SIM_IR.div_limite_mes);
    const hoje = new Date(), ordem = Array.from({ length: 12 }, (_, i) => (hoje.getMonth() + 1 + i) % 12);
    const anoDe = (i) => hoje.getFullYear() + (hoje.getMonth() + 1 + i >= 12 ? 1 : 0);
    const classes = ["FII", "Fiagro", "FI-Infra", "Ação", "BDR"].filter((c) => linhas.some((l) => l.cl === c));
    const corC = { FII: cor("--serie"), "Ação": cor("--serie-2"), Fiagro: "#c9a227", "FI-Infra": "#9b7be0", BDR: "#e07b5b" };
    const nomeC = (c) => (c === "Ação" ? "Ações" : c === "BDR" ? "BDRs" : c === "FII" ? "FIIs" : c);
    const porClasse = classes.map((c) => [c, linhas.filter((l) => l.cl === c).reduce((a, l) => a + (l.valor || 0), 0), linhas.filter((l) => l.cl === c).reduce((a, l) => a + l.renda, 0), linhas.filter((l) => l.cl === c).reduce((a, l) => a + (l.it.pct || 0), 0)]);
    const pct = (v) => ok(v) ? nf2.format(v * 100) + "%" : ND;
    const R = (v) => ok(v) ? "R$ " + nf2.format(v) : ND;
    const un = (l) => (l.cl === "Ação" || l.cl === "BDR" ? (l.it.q === 1 ? (l.cl === "BDR" ? "BDR" : "ação") : (l.cl === "BDR" ? "BDRs" : "ações")) : (l.it.q === 1 ? "cota" : "cotas"));
    linhasXls = linhas.map((l) => [l.t, l.cl, simNome(l.t), (l.it.pct || 0) / 100, l.it.q, l.p, l.valor, l.renda, l.renda / 12, l.valor ? l.renda / l.valor : null, l.pv.base]);
    const avisoPct = Math.abs(soma - 100) < 0.005 ? `<span class="sim-ok-pct">100% distribuído</span>`
      : soma < 100 ? `<span class="sim-falta">Faltam ${nfPct.format(100 - soma)}% (${R(naoAloc)}) para distribuir</span>`
      : `<span class="sim-passou">A soma passou de 100% em ${nfPct.format(soma - 100)} pontos; o valor investido fica acima do total</span>`;
    corpo.innerHTML = `
    ${!S.total ? `<div class="cartao sim-alerta"><p>Informe o <b>valor para investir</b> no alto da página para calcular as quantidades e a renda.</p></div>` : ""}
    <div class="sim-kpis">
      <div class="cartao mapa-kpi"><span>Valor investido</span><b>${R(investido)}</b><small>de ${R(S.total)}${S.total ? ` · sobra ${R(Math.max(0, S.total - investido))}` : ""}</small></div>
      <div class="cartao mapa-kpi"><span>Renda estimada em 12 meses</span><b>${R(renda)}</b><small>${S.liquido ? "líquida do IR retido na fonte" : "bruta"}</small></div>
      <div class="cartao mapa-kpi"><span>Média por mês</span><b>${R(renda / 12)}</b><small>renda de 12 meses dividida por 12</small></div>
      <div class="cartao mapa-kpi"><span>Yield da carteira</span><b>${investido ? pct(renda / investido) : ND}</b><small>renda de 12 meses / valor investido</small></div>
    </div>
    <div class="cartao" style="margin-top:16px">
      <div class="linha entre sim-status">${avisoPct}<span class="sub">${arred > 0.5 ? `Sobra de ${R(arred)} porque as quantidades são arredondadas para baixo (não dá para comprar fração de ${linhas.some((l) => l.cl === "Ação" || l.cl === "BDR") ? "ação ou cota" : "cota"}).` : ""}</span></div>
      <div class="tabela-wrap"><table class="resp sim-tab"><thead><tr><th>Ativo</th><th>Classe</th><th class="n">% da carteira</th><th class="n">Quantidade</th><th class="n">Preço</th><th class="n">Valor investido</th><th>Proventos considerados</th><th class="n">Renda 12m</th><th class="n">Média mensal</th><th class="n">Yield</th><th></th></tr></thead><tbody>
    ${linhas.map((l, i) => `<tr>
      <td class="cel-empresa" data-label="Ativo">${D.fiiMap[l.t] ? fundoHtml(D.fiiMap[l.t], true) : empresa(l.t)}</td>
      <td data-label="Classe">${esc(l.cl)}</td>
      <td class="n" data-label="% da carteira"><div class="sim-pct-in peq"><input type="text" inputmode="decimal" class="sim-pct" data-i="${i}" value="${nfPct.format(l.it.pct || 0)}" aria-label="Porcentagem de ${l.t}"><i>%</i></div></td>
      <td class="n" data-label="Quantidade"><span>${nf0.format(l.it.q)} <small class="muted">${un(l)}</small></span></td>
      <td class="n" data-label="Preço">${R(l.p)}</td>
      <td class="n" data-label="Valor investido">${R(l.valor)}</td>
      <td class="cel-largo sim-base" data-label="Proventos considerados"><small class="muted">${esc(l.pv.base)}</small>${l.cl === "Ação" ? `<div class="sim-chk"><label><input type="checkbox" data-i="${i}" data-k="div" ${l.it.div !== false ? "checked" : ""} ${l.pv.temDiv ? "" : "disabled"}> Dividendos</label><label><input type="checkbox" data-i="${i}" data-k="jcp" ${l.it.jcp !== false ? "checked" : ""} ${l.pv.temJcp ? "" : "disabled"}> JCP</label></div>` : ""}</td>
      <td class="n" data-label="Renda 12m">${R(l.renda)}</td>
      <td class="n" data-label="Média mensal">${R(l.renda / 12)}</td>
      <td class="n" data-label="Yield">${l.valor ? pct(l.renda / l.valor) : ND}</td>
      <td class="sim-rm-cel"><button class="btn peq sim-rm" data-i="${i}" title="Remover ${l.t}" aria-label="Remover ${l.t}">✕</button></td></tr>`).join("")}
    </tbody><tfoot><tr class="sim-tot"><td class="cel-empresa" data-label="Total"><b>Total</b></td><td class="vazia"></td><td class="n" data-label="% da carteira"><b>${nfPct.format(soma)}%</b></td><td class="vazia"></td><td class="vazia"></td><td class="n" data-label="Valor investido"><b>${R(investido)}</b></td><td class="vazia"></td><td class="n" data-label="Renda 12m"><b>${R(renda)}</b></td><td class="n" data-label="Média mensal"><b>${R(renda / 12)}</b></td><td class="n" data-label="Yield"><b>${investido ? pct(renda / investido) : ND}</b></td><td class="vazia"></td></tr></tfoot></table></div></div>
    <div class="grade g2" style="margin-top:16px">
      <div class="cartao"><div class="cartao-cab"><div><h3>Renda estimada por mês</h3><p class="sub">Próximos 12 meses, repetindo os meses em que cada ativo pagou nos últimos 12.</p></div></div><div class="grafico"><canvas id="g-sim-mes"></canvas></div></div>
      <div class="cartao"><div class="cartao-cab"><div><h3>Composição</h3><p class="sub">Peso de cada classe no valor e na renda.</p></div></div>
        <div class="grafico peq"><canvas id="g-sim-comp"></canvas></div>
        <div class="tabela-wrap" style="margin-top:12px"><table><thead><tr><th>Classe</th><th class="n">%</th><th class="n">Valor</th><th class="n">Renda 12m</th><th class="n">Peso na renda</th></tr></thead><tbody>
        ${porClasse.map(([c, v, r, p]) => `<tr><td>${esc(nomeC(c))}</td><td class="n">${nfPct.format(p)}%</td><td class="n">${R(v)}</td><td class="n">${R(r)}</td><td class="n">${renda ? pct(r / renda) : ND}</td></tr>`).join("")}
        </tbody></table></div></div>
    </div>
    <div class="cartao sim-notas" style="margin-top:16px"><h3>Como a renda é calculada</h3><ul>
      <li><b>Quantidades:</b> valor para investir vezes a porcentagem de cada ativo, dividido pelo preço atual e arredondado para baixo. O que não compra uma ação ou cota inteira fica como sobra.</li>
      <li><b>Fundos (FII, Fiagro e FI-Infra):</b> ${S.fiiBase === "12m" ? "média mensal dos rendimentos dos últimos 12 meses" : "último rendimento anunciado"}, repetido nos 12 meses. Fundo com menos de 12 meses de rendimentos na bolsa usa sempre o último.</li>
      <li><b>Ações:</b> soma dos dividendos e JCP com data com nos últimos 12 meses, publicados pela B3. Dá para tirar dividendos ou JCP de cada ação nas caixas da tabela. Restituição de capital não entra.</li>
      <li><b>BDRs:</b> proventos de 12 meses em reais pelo dividend yield do site, que já considera a proporção do BDR e o câmbio. O imposto do BDR é pago pelo investidor (carnê-leão ou declaração) e não é descontado aqui.</li>
      <li><b>Valores líquidos:</b> JCP com ${nf2.format(SIM_IR.jcp * 100)}% de IR retido na fonte (Lei Complementar 224/2025); dividendos com ${nf0.format(SIM_IR.div * 100)}% retidos só quando a mesma empresa paga mais de R$ 50 mil no mês à mesma pessoa física (Lei 15.270/2025)${temDiv50 ? ", o que acontece nesta carteira" : ""}. Rendimentos de fundos considerados isentos para pessoa física, o que depende das condições da lei (cotista com menos de 10% das cotas, fundo com pelo menos 100 cotistas e cotas negociadas em bolsa). A tributação mínima anual sobre altas rendas não está incluída.</li>
      <li><b>Preços:</b> último preço disponível no site. A carteira fica salva só neste navegador.</li>
    </ul><p class="sub">Simulação com base em proventos já pagos ou anunciados. Proventos futuros podem ser maiores, menores ou não acontecer; não é promessa de renda nem recomendação de investimento.</p></div>`;
    $$(".sim-pct").forEach((x) => {
      x.onchange = () => { const v = lerNum(x.value); S.itens[+x.dataset.i].pct = v >= 0 ? Math.round(v * 100) / 100 : 0; simSalvar(S); dicaPct(); desenhar(); };
      x.onkeydown = (e) => { if (e.key === "Enter") x.blur(); };
    });
    $$(".sim-rm").forEach((b) => b.onclick = () => { S.itens.splice(+b.dataset.i, 1); simSalvar(S); dicaPct(); desenhar(); });
    $$(".sim-chk input").forEach((c) => c.onchange = () => { S.itens[+c.dataset.i][c.dataset.k] = c.checked; simSalvar(S); desenhar(); });
    destruirGraficos();
    if (!window.Chart) return;
    const o = optGraf({ stacked: true, moeda: "R$ " });
    o.plugins.tooltip.callbacks.footer = (it) => `Total: R$ ${nf2.format(it.reduce((a, x) => a + (x.parsed.y || 0), 0))}`;
    charts.push(new Chart($("#g-sim-mes"), { type: "bar", data: { labels: ordem.map((m, i) => `${SIM_MESES[m]}/${String(anoDe(i)).slice(2)}`),
      datasets: classes.map((c) => ({ label: nomeC(c), data: ordem.map((m) => porMes[m][c] || 0), backgroundColor: corC[c], borderRadius: 3 })) }, options: o }));
    const oc = optGraf({ legenda: true });
    delete oc.scales;
    oc.plugins.tooltip.callbacks.label = (ctx) => `${ctx.label}: R$ ${nf2.format(ctx.parsed)} (${investido ? nf2.format(ctx.parsed / investido * 100) : 0}%)`;
    charts.push(new Chart($("#g-sim-comp"), { type: "doughnut", data: { labels: porClasse.map(([c]) => nomeC(c)), datasets: [{ data: porClasse.map(([, v]) => v), backgroundColor: porClasse.map(([c]) => corC[c]), borderColor: cor("--sup"), borderWidth: 2 }] }, options: { ...oc, cutout: "62%" } }));
  }
  desenhar();
}
/* =====================================================================
   CALENDÁRIO DE RESULTADOS
   ===================================================================== */
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function agendaLista(seg, permitidos) {
  const hoje = new Date().toISOString().slice(0, 10);
  const prox = [], recentes = [];
  for (const t of filtroSeg(D.tickers, seg)) {
    if (permitidos && !permitidos.has(t)) continue;
    const ag = D.fund[t].agenda || {};
    if (ag.proxima && ag.proxima.data && ag.proxima.data >= hoje) prox.push([t, ag.proxima]);
    if (ag.ultima && ag.ultima.entrega) recentes.push([t, ag.ultima]);
  }
  prox.sort((a, b) => a[1].data.localeCompare(b[1].data));
  recentes.sort((a, b) => b[1].entrega.localeCompare(a[1].entrega));
  return { prox, recentes };
}
function linhaAgenda(t, x, recente) {
  const dtx = new Date((recente ? x.entrega : x.data) + "T12:00:00");
  const conf = recente ? "divulgado" : x.criterio && x.criterio.includes("Yahoo") ? "data informada" : "estimada";
  return `<a class="ag-linha" href="#/ativo/${t}" data-tip="${esc(recente ? `${x.rotulo} divulgado à CVM em ${dataBR(x.entrega)}.` : `${x.rotulo}: ${dataBR(x.data)} (${conf}). Critério: ${x.criterio}.${x.prazo_legal ? ` Prazo legal: ${dataBR(x.prazo_legal)}.` : ""}`)}">
    <div class="ag-data"><b>${String(dtx.getDate()).padStart(2, "0")}</b><span>${MESES[dtx.getMonth()].slice(0, 3)}</span></div>
    <div style="min-width:0">${empresa(t, { link: false, semBadge: true })}</div>
    <div class="ag-info"><span class="badge">${esc(x.rotulo || "")}</span><span class="ag-conf ${recente ? "pos" : conf === "estimada" ? "muted" : ""}">${conf}</span><small class="muted">${DIAS[dtx.getDay()]}</small></div></a>`;
}
function pgCalendario(app, q) {
  const seg = q.get("seg") || "TODOS";
  const { prox, recentes } = agendaLista(seg);
  const porMes = {};
  for (const [t, x] of prox) { const k = x.data.slice(0, 7); (porMes[k] = porMes[k] || []).push([t, x]); }
  app.innerHTML = `${trilha([["Calendário"]])}<div class="cab-pagina"><div><h1>Calendário de resultados</h1>
    <p>Próximas divulgações de resultados trimestrais e anuais. Para ações brasileiras, a data é estimada pela entrega do mesmo período no ano anterior, sem passar do prazo legal da CVM; para BDRs, vem do calendário informado ao Yahoo Finance ou do prazo da SEC. Passe o mouse para ver o critério de cada data.</p></div></div>
  <div class="linha entre" style="margin-bottom:18px"><div class="segmentado" id="cal-seg">${[["TODOS", "Todos"], ["ACAO_BR", "Ações"], ["BDR", "BDRs"]].map(([k, n]) => `<button data-s="${k}" class="${seg === k ? "ativo" : ""}">${n}</button>`).join("")}</div><button class="btn prim" id="cal-xls">Baixar Excel</button></div>
  <div class="grade g-3-2">
    <div>${Object.entries(porMes).map(([m, l]) => `<div class="cartao" style="margin-bottom:16px"><h3>${MESES[+m.slice(5) - 1].replace(/^./, (c) => c.toUpperCase())} de ${m.slice(0, 4)} <span class="muted" style="font-weight:500">· ${l.length} empresa${l.length === 1 ? "" : "s"}</span></h3>
      <div class="ag-lista">${l.map(([t, x]) => linhaAgenda(t, x)).join("")}</div></div>`).join("") || '<div class="cartao"><p class="vazio">Sem datas futuras neste recorte.</p></div>'}</div>
    <div><div class="cartao"><h3>Divulgados recentemente</h3><p class="sub">Entregas à CVM mais recentes.</p><div class="ag-lista">${recentes.slice(0, 15).map(([t, x]) => linhaAgenda(t, x, true)).join("") || '<p class="vazio">Sem registros.</p>'}</div></div></div>
  </div>`;
  ligarLinhas(app);
  $$("#cal-seg button").forEach((b) => b.onclick = () => { location.hash = `#/calendario?seg=${b.dataset.s}`; });
  $("#cal-xls").onclick = () => exportarAgenda(seg);
}

/* =====================================================================
   COMPARADOR
   ===================================================================== */
const LIDERES = [
  { k: "roe", nome: "Maior ROE", dir: 1 }, { k: "piotroski", nome: "Melhor qualidade contábil", dir: 1 }, { k: "margem_fcl", nome: "Maior geração de caixa", dir: 1 }, { k: "divliq_ebitda", nome: "Menor dívida", dir: -1 },
  { k: "dy", nome: "Maior dividend yield", dir: 1 }, { k: "tir_implicita", nome: "Maior TIR implícita", dir: 1 },
];
const MINIS = ["pl", "pvp", "roe", "margem_liquida", "margem_fcl", "fcf_yield", "dy", "tir_implicita", "nota_criterios"];
/* =====================================================================
   RETORNO TOTAL: ações com e sem reinvestimento de proventos contra CDI, IPCA + X% e Ibovespa
   ===================================================================== */
const RT_CORES = ["#33c47a", "#5b8def", "#e8a33d", "#c678dd", "#e06c75", "#56b6c2"];
const RT_BENCH = { ifix: ["IFIX", "#c9a227"], cdi: ["CDI", "#9aa3ad"], ipca4: ["IPCA + 4%", "#b08968"], ipca5: ["IPCA + 5%", "#d4a373"], ipca6: ["IPCA + 6%", "#e9c46a"], ibov: ["Ibovespa", "#7f8c99"] };
async function pgRetorno(app, q) {
  const sel = [...new Set((q.get("t") || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => D.univMap[x] || (D.fiiMap && D.fiiMap[x])))].slice(0, 6);
  const anos = q.get("p") || "5", modo = q.get("m") || "ambos";
  const VI = Math.max(1, +(q.get("v") || 1000)) || 1000;            // valor investido escolhido pelo usuário
  const bench = (q.get("b") ?? "cdi,ipca6").split(",").filter((x) => RT_BENCH[x]);
  const ir = (o) => {
    const st = { t: sel.join(","), p: anos, m: modo, b: bench.join(","), v: VI, ...o };
    location.hash = `#/retorno?t=${st.t}&p=${st.p}&m=${st.m}&b=${st.b}&v=${st.v}`;
  };
  app.innerHTML = `${trilha([["Retorno total"]])}<div class="cab-pagina"><div><h1>Retorno total</h1>
    <p>Quanto o valor investido virou, somando a variação do preço e os proventos. Compare com CDI, IPCA + juro real e Ibovespa.</p></div></div>
  <div class="aviso-rt"><b>Estimativa.</b> Cálculo próprio com preços e proventos brutos do Yahoo Finance (JCP antes do IR de 15%), sem custos e impostos. Calculadoras que descontam IR ou usam outras datas chegam a números diferentes; use como referência de ordem de grandeza, não como extrato.</div>
  <div class="cartao rt-ctrl">
    <div class="linha"><div class="chips">${sel.map((t, i) => `<button class="chip ativo" data-rm="${t}"><i class="rt-cor" style="background:${RT_CORES[i]}"></i>${logo(t)}${t}<span class="x">✕</span></button>`).join("") || '<span class="muted">Escolha até 6 ações.</span>'}</div>
      <select id="rt-add"><option value="">Adicionar ação ou FII</option><optgroup label="Ações e BDRs">${D.univ.filter((a) => !sel.includes(a.ticker)).map((a) => `<option value="${a.ticker}">${a.ticker} · ${esc(a.nome)}</option>`).join("")}</optgroup><optgroup label="Fundos imobiliários">${(D.fiis || []).filter((f) => !sel.includes(f.ticker)).map((f) => `<option value="${f.ticker}">${f.ticker} · ${esc(f.nome)}</option>`).join("")}</optgroup></select></div>
    <div class="linha rt-opcoes">
      <label class="rt-valor">Valor investido <span class="rt-valor-campo">R$ <input id="rt-valor" inputmode="decimal" value="${nf2.format(VI)}" aria-label="Valor investido em reais"></span></label>
      <div class="abas" id="rt-per" style="margin:0">${[["1", "1 ano"], ["3", "3 anos"], ["5", "5 anos"], ["10", "10 anos"], ["15", "15 anos"]].map(([v, n]) => `<button data-v="${v}" class="${v === anos ? "ativo" : ""}">${n}</button>`).join("")}</div>
      <div class="abas" id="rt-modo" style="margin:0">${[["com", "Com reinvestimento"], ["sem", "Sem reinvestimento"], ["ambos", "Os dois"]].map(([v, n]) => `<button data-v="${v}" class="${v === modo ? "ativo" : ""}">${n}</button>`).join("")}</div>
      <div class="rt-bench">${Object.entries(RT_BENCH).map(([k, [n, c]]) => `<label><input type="checkbox" value="${k}" ${bench.includes(k) ? "checked" : ""}><i class="rt-cor" style="background:${c}"></i>${n}</label>`).join("")}</div>
    </div></div>
  <div id="rt-saida"><div class="carregando"><span></span>Carregando</div></div>`;
  $$("[data-rm]").forEach((b) => b.onclick = () => ir({ t: sel.filter((x) => x !== b.dataset.rm).join(",") }));
  $("#rt-add").onchange = (e) => { if (e.target.value && sel.length < 6) ir({ t: [...sel, e.target.value].join(",") }); };
  $$("#rt-per button").forEach((b) => b.onclick = () => ir({ p: b.dataset.v }));
  const lerValor = () => { const v = parseFloat($("#rt-valor").value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")); if (ok(v) && v > 0 && v !== VI) ir({ v: Math.round(v * 100) / 100 }); else $("#rt-valor").value = nf2.format(VI); };
  $("#rt-valor").onchange = lerValor;
  $("#rt-valor").onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); lerValor(); } };
  $("#rt-valor").onfocus = (e) => e.target.select();
  $$("#rt-modo button").forEach((b) => b.onclick = () => ir({ m: b.dataset.v }));
  $$(".rt-bench input").forEach((c) => c.onchange = () => ir({ b: $$(".rt-bench input").filter((x) => x.checked).map((x) => x.value).join(",") }));
  if (!sel.length && !bench.length) { $("#rt-saida").innerHTML = '<div class="cartao"><p class="vazio">Escolha uma ação ou uma referência.</p></div>'; return; }

  const bm = D.cache.rtBench || (D.cache.rtBench = await j("data/retorno/_benchmarks.json", null));
  const series = await Promise.all(sel.map((t) => D.cache["rt" + t] ? D.cache["rt" + t] : j(`data/retorno/${t}.json`, null).then((x) => (D.cache["rt" + t] = x))));
  if (!bm) { $("#rt-saida").innerHTML = '<div class="cartao"><p class="vazio">Dados de retorno total indisponíveis no momento.</p></div>'; return; }
  const inicio = new Date(); inicio.setFullYear(inicio.getFullYear() - +anos);
  const ini = inicio.toISOString().slice(0, 10);
  // calendário semanal: sextas do Ibovespa no período
  const cal = (bm.ibov || []).map(([d]) => d).filter((d) => d >= ini);
  if (cal.length < 2) { $("#rt-saida").innerHTML = '<div class="cartao"><p class="vazio">Sem dados para o período.</p></div>'; return; }
  const ultimo = (lista, d, k) => { let lo = 0, hi = lista.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (lista[m][0] <= d) { r = lista[m]; lo = m + 1; } else hi = m - 1; } return r; };
  // taxa mensal com composição por fração do mês; meses sem dado usam a última taxa publicada
  const indiceMensal = (lista, extra = 0) => {
    const mapa = Object.fromEntries(lista), ultimaTaxa = lista[lista.length - 1][1];
    return (d0, d1) => {
      let f = 1, a = new Date(d0 + "T12:00:00"); const b = new Date(d1 + "T12:00:00");
      while (a < b) {
        const y = a.getFullYear(), m = a.getMonth(), fimMes = new Date(y, m + 1, 1, 12), ate = fimMes < b ? fimMes : b;
        const dias = new Date(y, m + 1, 0).getDate(), frac = (ate - a) / 864e5 / dias;
        const r = mapa[`${y}-${String(m + 1).padStart(2, "0")}`] ?? ultimaTaxa;
        f *= Math.pow((1 + r) * Math.pow(1 + extra, 1 / 12), frac);
        a = ate;
      }
      return f;
    };
  };
  const dsets = [], linhasTab = [];
  const anual = (v, d0, d1) => { const anosP = (new Date(d1) - new Date(d0)) / (365.25 * 864e5); return anosP > 0.9 ? Math.pow(v / VI, 1 / anosP) - 1 : null; };
  const addLinha = (nome, corL, vals, extra = {}) => {
    const idx = vals.findIndex(ok); if (idx < 0) return;
    const fim = vals[vals.length - 1];
    dsets.push({ label: nome, data: vals, borderColor: corL, backgroundColor: corL, borderWidth: extra.borderWidth || 2, borderDash: extra.borderDash || [], pointRadius: 0, tension: 0.1, spanGaps: true });
    linhasTab.push({ nome, cor: corL, fim, desde: cal[idx], total: fim / VI - 1, aa: anual(fim, cal[idx], cal[cal.length - 1]), tracej: !!extra.borderDash });
  };
  sel.forEach((t, i) => {
    const s = series[i] && series[i].semanal;
    if (!s || !s.length) return;
    const pos = s.filter((x) => x[0] >= ini);
    if (!pos.length) return;
    const p0 = pos[0];
    let acum = 0, k = s.indexOf(p0);
    const com = [], sem = [];
    for (const d of cal) {
      if (d < p0[0]) { com.push(null); sem.push(null); continue; }
      while (k + 1 < s.length && s[k + 1][0] <= d) { k++; acum += s[k][3] || 0; }
      const x = s[k];
      com.push(VI * x[2] / p0[2]);
      sem.push(VI * (x[1] + acum) / p0[1]);
    }
    if (modo !== "sem") addLinha(modo === "ambos" ? `${t} com reinvestimento` : t, RT_CORES[i], com);
    if (modo !== "com") addLinha(modo === "ambos" ? `${t} sem reinvestimento` : t, RT_CORES[i], sem, { borderDash: modo === "ambos" ? [6, 4] : [], borderWidth: modo === "ambos" ? 1.6 : 2 });
  });
  const d0 = cal[0];
  if (bench.includes("cdi")) { const f = indiceMensal(bm.cdi); addLinha("CDI", RT_BENCH.cdi[1], cal.map((d) => VI * f(d0, d)), { borderWidth: 1.6 }); }
  for (const [k, x] of [["ipca4", 0.04], ["ipca5", 0.05], ["ipca6", 0.06]]) if (bench.includes(k)) { const f = indiceMensal(bm.ipca, x); addLinha(RT_BENCH[k][0], RT_BENCH[k][1], cal.map((d) => VI * f(d0, d)), { borderWidth: 1.6 }); }
  if (bench.includes("ifix") && (bm.ifix || []).length) { const b0 = ultimo(bm.ifix, d0); if (b0) addLinha("IFIX (com rendimentos)", RT_BENCH.ifix[1], cal.map((d) => { const x = ultimo(bm.ifix, d); return x ? VI * x[1] / b0[1] : null; }), { borderWidth: 1.6 }); }
  if (bench.includes("ibov")) { const b0 = ultimo(bm.ibov, d0)[1]; addLinha("Ibovespa (só pontos)", RT_BENCH.ibov[1], cal.map((d) => VI * ultimo(bm.ibov, d)[1] / b0), { borderWidth: 1.6 }); }

  const o = optGraf({ legenda: true });
  o.plugins.tooltip.callbacks.label = (ctx) => `${ctx.dataset.label}: R$ ${ok(ctx.parsed.y) ? nf2.format(ctx.parsed.y) : "n/d"}`;
  o.plugins.tooltip.itemSort = (a, b) => (b.parsed.y || 0) - (a.parsed.y || 0);
  linhasTab.sort((a, b) => b.fim - a.fim);
  $("#rt-saida").innerHTML = `<div class="cartao"><div class="grafico alto"><canvas id="g-rt"></canvas></div>
    <p class="sub" style="margin-top:8px">Valor de R$ ${nf2.format(VI)} investidos em ${dataBR(d0)}, semana a semana. ${modo === "ambos" ? "Linha cheia: proventos reinvestidos na própria ação. Linha tracejada: proventos guardados em dinheiro, sem render." : modo === "com" ? "Proventos reinvestidos na própria ação na data ex." : "Proventos guardados em dinheiro, sem render."}</p></div>
  <div class="cartao" style="margin-top:16px"><div class="cartao-cab"><h3>Resultado no período</h3><button class="btn peq" id="rt-xls">Baixar Excel</button></div>
    <div class="tabela-wrap"><table class="resp"><thead><tr><th>Investimento</th><th class="n">Valor final</th><th class="n">Retorno no período</th><th class="n">Retorno ao ano</th></tr></thead><tbody>
    ${linhasTab.map((l) => `<tr><td data-label="Investimento"><i class="rt-cor${l.tracej ? " tracej" : ""}" style="background:${l.cor}"></i>${esc(l.nome)}${l.desde !== d0 ? ` <span class="muted">desde ${dataBR(l.desde)}</span>` : ""}</td><td class="n" data-label="Valor final"><b>R$ ${nf2.format(l.fim)}</b></td><td class="n" data-label="Retorno no período">${varHtml(l.total)}</td><td class="n" data-label="Retorno ao ano">${ok(l.aa) ? varHtml(l.aa) : '<span class="muted">menos de 1 ano</span>'}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="sub" style="margin-top:10px">Fontes: preços e proventos da B3 via Yahoo Finance, pela data ex, com proventos brutos (JCP antes do IR de 15%); calculadoras que descontam IR ou usam outras datas de início e fim chegam a números diferentes; CDI e IPCA mensais do Banco Central (séries 4391 e 433); IFIX diário oficial da B3 (índice de retorno total, já considera os rendimentos), com o último mês publicado repetido até sair o próximo. Sem custos, impostos e taxas. Rentabilidade passada não garante rentabilidade futura.</p></div>`;
  charts.push(new Chart($("#g-rt"), { type: "line", data: { labels: cal.map(dataBR), datasets: dsets }, options: o }));
  $("#rt-xls").onclick = () => baixarExcel(`retorno_total_${anos}_anos`, [{ nome: "Retorno total", cab: ["Investimento", "Desde", `Valor final de R$ ${nf2.format(VI)} (R$)`, "Retorno no período (%)", "Retorno ao ano (%)"], linhas: linhasTab.map((l) => [l.nome, dataBR(l.desde), +l.fim.toFixed(2), +(l.total * 100).toFixed(2), ok(l.aa) ? +(l.aa * 100).toFixed(2) : null]) }]);
}
/* =====================================================================
   MAPA: dispersão de duas métricas para todas as empresas, com medianas e filtro de setor
   ===================================================================== */
const MAPA_EIXOS = {
  roe: ["ROE", "pct", 0, 0.8], payout: ["Payout", "pct", 0, 1.5], dy: ["Dividend yield 12m", "pct", 0, 0.2],
  pl: ["P/L", "x", 0, 40], ev_ebitda: ["EV/EBITDA", "x", 0, 25], roic: ["ROIC", "pct", 0, 0.6],
  margem_liquida: ["Margem líquida", "pct", -0.2, 0.6], divliq_ebitda: ["Dív. líq./EBITDA", "x", -2, 6],
  cagr_lucro_5a: ["CAGR lucro 5a", "pct", -0.3, 0.6], cagr_receita_5a: ["CAGR receita 5a", "pct", -0.1, 0.4],
  momentum: ["Momentum 12-1", "pct", -0.6, 1.0], var_12m: ["Retorno 12 meses", "pct", -0.6, 1.2],
};
function valMapa(t, k) {
  if (k === "momentum") { const p = D.prices[t] || {}; return ok(p.var_12m) && ok(p.var_mes) && p.var_mes > -1 ? (1 + p.var_12m) / (1 + p.var_mes) - 1 : null; }
  if (suprimido(t, k)) return null;
  const v = val(t, k);
  if (k === "payout" && ok(v) && v < 0) return null;
  return v;
}
// Visões prontas do mapa: cada uma escolhe os dois eixos e diz como ler, para não precisar montar na mão.
const MAPA_FII_EIXOS = {
  pvp: ["P/VP", "x", 0.3, 1.5], dy: ["Dividend yield 12m", "pct", 0, 0.25], cresc: ["Crescimento dos rendimentos (3 anos, ao ano)", "pct", -0.3, 0.3],
  vp: ["Crescimento do valor patrimonial (3 anos, ao ano)", "pct", -0.2, 0.15],
};
const MAPA_VISOES = {
  acoes: [
    { id: "preco_qualidade", nome: "Preço x rentabilidade", x: "pl", y: "roe", ler: "Mais à esquerda: menor P/L (paga-se menos por real de lucro). Mais acima: maior ROE (mais lucro sobre o patrimônio)." },
    { id: "dividendos", nome: "Dividendos", x: "payout", y: "dy", ler: "Mais acima: maior dividend yield de 12 meses. Mais à direita: maior parte do lucro distribuída; à direita da linha de 100% a empresa pagou mais do que lucrou." },
    { id: "divida", nome: "Rentabilidade x dívida", x: "divliq_ebitda", y: "roic", ler: "Mais à esquerda: menos dívida em relação ao EBITDA (abaixo de zero, caixa líquido). Mais acima: maior retorno sobre o capital investido." },
    { id: "crescimento", nome: "Crescimento x preço", x: "ev_ebitda", y: "cagr_lucro_5a", ler: "Mais à esquerda: menor EV/EBITDA. Mais acima: lucro que mais cresceu por ano nos últimos 5 anos." },
  ],
  fii: [
    { id: "preco_renda", nome: "Preço x renda", x: "pvp", y: "dy", ler: "Mais à esquerda: cota negociada mais abaixo do valor patrimonial. Mais acima: maior dividend yield de 12 meses." },
    { id: "renda_crescendo", nome: "Renda crescendo", x: "dy", y: "cresc", ler: "Mais à direita: maior dividend yield de 12 meses. Mais acima: rendimento por cota que mais cresceu por ano em 3 anos." },
    { id: "patrimonio", nome: "Patrimônio", x: "pvp", y: "vp", ler: "Mais à esquerda: menor P/VP. Mais acima: valor patrimonial por cota que mais cresceu por ano em 3 anos." },
  ],
};
function pgMapa(app, q) {
  const seg = ["ACAO_BR", "BDR", "TODOS", "FII"].includes(q.get("seg")) ? q.get("seg") : "ACAO_BR";
  const ehFii = seg === "FII";
  const visoes = MAPA_VISOES[ehFii ? "fii" : "acoes"], EIXOS = ehFii ? MAPA_FII_EIXOS : MAPA_EIXOS;
  const vis = visoes.find((v) => v.id === q.get("v")) || visoes[0];
  // eixos personalizados (opcional): só valem se forem do mesmo tipo de ativo
  const kx = EIXOS[q.get("x")] ? q.get("x") : vis.x, ky = EIXOS[q.get("y")] ? q.get("y") : vis.y;
  const custom = kx !== vis.x || ky !== vis.y;
  const setor = q.get("setor") || "";
  const dest = (q.get("d") || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => ehFii ? D.fiiMap[x] : D.univMap[x]);
  const ir = (o) => {
    const st = { v: vis.id, x: custom ? kx : "", y: custom ? ky : "", seg, setor, d: dest.join(","), ...o };
    location.hash = `#/mapa?seg=${st.seg}&v=${st.v}${st.x ? `&x=${st.x}` : ""}${st.y ? `&y=${st.y}` : ""}&setor=${encodeURIComponent(st.setor)}&d=${st.d}`;
  };
  // fonte dos pontos: empresas ou fundos
  const fundo = (t) => D.fiiMap[t];
  const base = ehFii ? D.fiis.map((f) => f.ticker) : D.tickers.filter((t) => seg === "TODOS" || (seg === "ACAO_BR" ? emAcoes(t) : !emAcoes(t)));
  const setorDe = (t) => ehFii ? fundo(t).setor : A(t).setor_macro;
  const nomeDe = (t) => ehFii ? fundo(t).nome : A(t).nome;
  const valor = (t, k) => {
    if (!ehFii) return valMapa(t, k);
    const f = fundo(t);
    if (k === "pvp") { const v = fiiPvp(f); return ok(v) && v > 0 ? v : null; }
    if (k === "dy") return fiiDy(f);
    if (k === "cresc") return f.cagr_rend_3a;
    if (k === "vp") return f.cagr_vp_3a;
    return null;
  };
  const tamanho = (t) => ehFii ? fundo(t).pl : ind(t).valor_mercado_brl;
  const setores = [...new Set(base.map(setorDe).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const lista = base.filter((t) => !setor || setorDe(t) === setor);
  const fmtE = (k, v) => !ok(v) ? ND : EIXOS[k][1] === "pct" ? nf2.format(v * 100) + "%" : nf2.format(v) + "x";
  const md = (k) => mediana(lista.map((t) => valor(t, k)).filter(ok));
  const cartoes = ehFii
    ? [["pvp", "P/VP mediano", "Preço da cota / valor patrimonial"], ["dy", "DY mediano 12m", ""], ["cresc", "Crescimento mediano dos rendimentos", "3 anos, ao ano"], ["vp", "Crescimento mediano do VP", "3 anos, ao ano"]]
    : [["roe", "ROE mediano", ""], ["dy", "DY mediano 12m", ""], ["payout", "Payout mediano", "Proventos 12m / lucro 12m"], ["momentum", "Momentum 12-1 mediano", "Retorno de 12 meses excluindo o último"]];
  const opcoes = (sel) => Object.entries(EIXOS).map(([k, [n]]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${n}</option>`).join("");
  app.innerHTML = `${trilha([["Mapa"]])}<div class="cab-pagina"><div><h1>Mapa ${ehFii ? "dos fundos" : "das empresas"}</h1>
    <p>Cada ponto é ${ehFii ? "um fundo; o tamanho é o patrimônio líquido" : "uma empresa; o tamanho é o valor de mercado"}. Escolha uma visão pronta; os eixos já vêm definidos. Dados realizados, não projeções.</p></div></div>
  <div class="mapa-kpis">${cartoes.map(([k, n, sub]) => `<div class="cartao mapa-kpi"><span>${n}</span><b>${fmtE(k, md(k))}</b><small>${sub || `${lista.filter((t) => ok(valor(t, k))).length} ${ehFii ? "fundos" : "empresas"}`}</small></div>`).join("")}</div>
  <div class="cartao" style="margin-top:16px">
    <div class="linha mapa-ctrl">
      <div class="abas" id="mp-seg" style="margin:0">${[["ACAO_BR", "Ações"], ["BDR", "BDRs"], ["TODOS", "Ações e BDRs"], ["FII", "FIIs"]].map(([v, n]) => `<button data-v="${v}" class="${v === seg ? "ativo" : ""}">${n}</button>`).join("")}</div>
      <select id="mp-setor"><option value="">Todos os setores</option>${setores.map((x) => `<option ${x === setor ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
      <select id="mp-dest"><option value="">Destacar ${ehFii ? "fundo" : "empresa"}</option>${lista.filter((t) => !dest.includes(t)).map((t) => `<option value="${t}">${t} · ${esc(nomeDe(t))}</option>`).join("")}</select>
      ${dest.length ? `<div class="chips">${dest.map((t) => `<button class="chip ativo" data-rm="${t}">${t}<span class="x">✕</span></button>`).join("")}</div>` : ""}
    </div>
    <div class="mapa-visoes" id="mp-vis">${visoes.map((v) => `<button data-v="${v.id}" class="${v.id === vis.id && !custom ? "ativo" : ""}">${esc(v.nome)}</button>`).join("")}</div>
    <h3 style="margin:14px 0 2px">${esc(EIXOS[ky][0])} × ${esc(EIXOS[kx][0])}</h3>
    <p class="sub mapa-ler">${custom ? "Eixos escolhidos manualmente." : esc(vis.ler)} Arraste para mover o quadro; use os botões + e − (ou Ctrl + rodinha do mouse) para aproximar; duplo clique volta ao início.</p>
    <div class="grafico mapa-graf"><canvas id="g-mapa"></canvas></div>
    <p class="sub" style="margin-top:8px">Valores fora da escala ficam encostados na borda (o balão mostra o valor real). ${ehFii ? "Fundos com menos de 12 meses de rendimentos na bolsa ficam fora do DY." : "Empresas em recuperação ficam fora dos múltiplos de lucro."} Clique num ponto para abrir ${ehFii ? "o fundo" : "a empresa"}.</p>
    <details class="mapa-custom"${custom ? " open" : ""}><summary>Escolher os eixos manualmente</summary>
      <div class="linha mapa-ctrl" style="margin-top:10px">
        <label class="mapa-eixo">Eixo horizontal <select id="mp-x">${opcoes(kx)}</select></label>
        <label class="mapa-eixo">Eixo vertical <select id="mp-y">${opcoes(ky)}</select></label>
      </div></details>
  </div>`;
  $$("#mp-seg button").forEach((b) => b.onclick = () => ir({ seg: b.dataset.v, setor: "", d: "", v: "", x: "", y: "" }));
  $$("#mp-vis button").forEach((b) => b.onclick = () => ir({ v: b.dataset.v, x: "", y: "" }));
  $("#mp-setor").onchange = (e) => ir({ setor: e.target.value });
  $("#mp-x").onchange = (e) => ir({ x: e.target.value, y: ky });
  $("#mp-y").onchange = (e) => ir({ y: e.target.value, x: kx });
  $("#mp-dest").onchange = (e) => e.target.value && ir({ d: [...dest, e.target.value].join(",") });
  $$("[data-rm]").forEach((b) => b.onclick = () => ir({ d: dest.filter((x) => x !== b.dataset.rm).join(",") }));
  if (!window.Chart) { $("#g-mapa").parentNode.innerHTML = '<p class="vazio">Gráfico indisponível.</p>'; return; }
  const [, ux, x0, x1] = EIXOS[kx], [, uy, y0, y1] = EIXOS[ky];
  const esc_ = (u) => (u === "pct" ? 100 : 1);
  const pts = lista.map((t) => ({ t, vx: valor(t, kx), vy: valor(t, ky), vm: tamanho(t) })).filter((p) => ok(p.vx) && ok(p.vy));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // rótulos: destacados + extremos (maiores no eixo vertical e no horizontal)
  const rot = new Set(dest);
  [...pts].sort((a, b) => b.vy - a.vy).slice(0, 5).forEach((p) => rot.add(p.t));
  [...pts].sort((a, b) => b.vx - a.vx).slice(0, 3).forEach((p) => rot.add(p.t));
  const vmMax = Math.max(...pts.map((p) => p.vm || 0), 1);
  const dados = pts.map((p) => ({ x: clamp(p.vx, x0, x1) * esc_(ux), y: clamp(p.vy, y0, y1) * esc_(uy), r: 3 + 11 * Math.sqrt((p.vm || 0) / vmMax), t: p.t, vx: p.vx, vy: p.vy }));
  const azul = cor("--serie-2"), cinza = "rgba(140,148,158,.55)";
  const PLUGIN_ROT = { id: "rotMapa", afterDatasetsDraw(ch) {
    const { ctx } = ch, meta = ch.getDatasetMeta(0), a = ch.chartArea;
    ctx.save(); ctx.beginPath(); ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top); ctx.clip();
    ctx.font = "600 12px Inter, sans-serif"; ctx.fillStyle = cor("--txt"); ctx.textBaseline = "middle";
    meta.data.forEach((el, i) => { const d = dados[i]; if (!rot.has(d.t)) return; const dir = el.x > a.right - 70; ctx.textAlign = dir ? "right" : "left"; ctx.fillText(d.t, el.x + (dir ? -1 : 1) * (d.r + 5), el.y); });
    const linha = (eixo, v, txt) => {
      const sc = ch.scales[eixo], px = sc.getPixelForValue(v);
      if (px < (eixo === "x" ? a.left : a.top) || px > (eixo === "x" ? a.right : a.bottom)) return;
      ctx.strokeStyle = cor("--txt-3"); ctx.setLineDash([4, 4]); ctx.beginPath();
      if (eixo === "x") { ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); } else { ctx.moveTo(a.left, px); ctx.lineTo(a.right, px); }
      ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = cor("--txt-3"); ctx.textAlign = "left";
      if (eixo === "x") ctx.fillText(txt, px + 6, a.bottom - 10); else ctx.fillText(txt, a.left + 6, px - 9);
    };
    if (kx === "payout") linha("x", 100, "100%: paga todo o lucro");
    if (ehFii && kx === "pvp") linha("x", 1, "P/VP 1: preço igual ao valor patrimonial");
    if (ehFii && ky === "pvp") linha("y", 1, "P/VP 1");
    ctx.restore();
  } };
  const o = optGraf({ legenda: false });
  o.interaction = { mode: "nearest", intersect: true };
  const mx = (x1 - x0) * esc_(ux) * 0.04, my = (y1 - y0) * esc_(uy) * 0.05;
  const BASE = { x: [x0 * esc_(ux) - mx, x1 * esc_(ux) + mx], y: [y0 * esc_(uy) - my, y1 * esc_(uy) + my] };
  const dec = (u, lo, hi) => (u === "pct" ? 0 : (hi - lo) <= 3 ? 1 : 0);
  const fmtT = (u, lo, hi) => (v) => v < lo * esc_(u) - 1e-9 || v > hi * esc_(u) + 1e-9 ? "" : new Intl.NumberFormat("pt-BR", { minimumFractionDigits: dec(u, lo, hi), maximumFractionDigits: dec(u, lo, hi) }).format(v) + (u === "pct" ? "%" : "x");
  o.scales.x = { min: BASE.x[0], max: BASE.x[1], title: { display: true, text: EIXOS[kx][0], color: cor("--txt-3") }, ticks: { color: cor("--txt-3"), callback: fmtT(ux, x0, x1) }, grid: { color: cor("--borda") } };
  o.scales.y = { min: BASE.y[0], max: BASE.y[1], title: { display: true, text: EIXOS[ky][0], color: cor("--txt-3") }, ticks: { color: cor("--txt-3"), callback: fmtT(uy, y0, y1) }, grid: { color: cor("--borda") } };
  o.plugins.tooltip.callbacks = { title: (it) => { const d = dados[it[0].dataIndex]; return `${d.t} · ${nomeDe(d.t)}`; }, label: (ctx) => { const d = dados[ctx.dataIndex]; return [`${EIXOS[ky][0]}: ${fmtE(ky, d.vy)}`, `${EIXOS[kx][0]}: ${fmtE(kx, d.vx)}`]; } };
  o.onClick = (e, els) => { if (els.length && !ch.$arrastou) location.hash = `#/${ehFii ? "fii" : "ativo"}/${dados[els[0].index].t}`; };
  o.onHover = (e, els) => { if (!ch.$pan) e.native.target.style.cursor = els.length ? "pointer" : "grab"; };
  const ch = new Chart($("#g-mapa"), { type: "bubble", data: { datasets: [{ data: dados, backgroundColor: dados.map((d) => rot.has(d.t) ? azul : cinza), borderColor: "transparent" }] }, options: o, plugins: [PLUGIN_ROT] });
  charts.push(ch);
  zoomMapa(ch, BASE);
}
// Mapa: arrastar com o mouse move o quadro; botões + e − (ou Ctrl + rodinha) aproximam e afastam; duplo clique volta ao enquadramento inicial.
function zoomMapa(ch, BASE) {
  const el = ch.canvas, sx = ch.options.scales.x, sy = ch.options.scales.y;
  const larg = { x: BASE.x[1] - BASE.x[0], y: BASE.y[1] - BASE.y[0] };
  const aplicar = (x, y) => {
    const lim = (r, b, w) => { let [a, z] = r; const t = Math.min(z - a, w * 1.5); if (z - a > t) { const c = (a + z) / 2; a = c - t / 2; z = c + t / 2; } return [a, z]; };
    [sx.min, sx.max] = lim(x, BASE.x, larg.x); [sy.min, sy.max] = lim(y, BASE.y, larg.y);
    ch.update("none");
  };
  const zoom = (f, px, py) => {
    const xs = ch.scales.x, ys = ch.scales.y, a = ch.chartArea;
    const cx = xs.getValueForPixel(px ?? (a.left + a.right) / 2), cy = ys.getValueForPixel(py ?? (a.top + a.bottom) / 2);
    aplicar([cx - (cx - xs.min) * f, cx + (xs.max - cx) * f], [cy - (cy - ys.min) * f, cy + (ys.max - cy) * f]);
  };
  const reset = () => aplicar([...BASE.x], [...BASE.y]);
  el.addEventListener("wheel", (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoom(e.deltaY < 0 ? 0.8 : 1.25, e.offsetX, e.offsetY); }, { passive: false });
  el.addEventListener("dblclick", reset);
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    ch.$pan = { x: e.clientX, y: e.clientY, sx: [ch.scales.x.min, ch.scales.x.max], sy: [ch.scales.y.min, ch.scales.y.max] }; ch.$arrastou = false;
    el.setPointerCapture(e.pointerId); el.style.cursor = "grabbing";
  });
  el.addEventListener("pointermove", (e) => {
    const p = ch.$pan; if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) ch.$arrastou = true;
    if (!ch.$arrastou) return;
    const a = ch.chartArea, kx = (p.sx[1] - p.sx[0]) / (a.right - a.left), ky = (p.sy[1] - p.sy[0]) / (a.bottom - a.top);
    aplicar([p.sx[0] - dx * kx, p.sx[1] - dx * kx], [p.sy[0] + dy * ky, p.sy[1] + dy * ky]);
  });
  const fim = () => { ch.$pan = null; el.style.cursor = "grab"; setTimeout(() => { ch.$arrastou = false; }, 0); };
  el.addEventListener("pointerup", fim); el.addEventListener("pointercancel", fim);
  el.style.touchAction = "pan-y";
  const bar = document.createElement("div");
  bar.className = "mapa-zoom";
  bar.innerHTML = `<button class="btn peq" data-z="in" title="Aproximar">+</button><button class="btn peq" data-z="out" title="Afastar">−</button><button class="btn peq" data-z="reset" title="Voltar ao enquadramento inicial">Restaurar</button>`;
  el.parentNode.style.position = "relative";
  el.parentNode.appendChild(bar);
  bar.onclick = (e) => { const z = e.target.dataset.z; if (z === "in") zoom(0.7); else if (z === "out") zoom(1 / 0.7); else if (z === "reset") reset(); };
}
/* =====================================================================
   FUNDOS IMOBILIÁRIOS
   ===================================================================== */
const TIPO_FUNDO = { fii: "FII", fiagro: "Fiagro", infra: "FI-Infra" };
function pgFiis(app, q) {
  const tipo = (q && q.get && q.get("tipo")) || "todos", setor = (q && q.get && q.get("setor")) || "", ordem = FII_METRICAS[(q && q.get && q.get("ordem")) || ""] ? q.get("ordem") : "pl";
  const todos = D.fiis || [];
  const M = FII_METRICAS[ordem];
  const l = todos.filter((f) => (tipo === "todos" || (f.tipo || "fii") === tipo) && (!setor || f.setor === setor))
    .sort((a, b) => { const va = M.v(a), vb = M.v(b); if (!ok(va)) return 1; if (!ok(vb)) return -1; return M.dir > 0 ? vb - va : va - vb; });
  const url = (o) => { const p = new URLSearchParams(); const x = { tipo, setor, ordem, ...o }; if (x.tipo && x.tipo !== "todos") p.set("tipo", x.tipo); if (x.setor) p.set("setor", x.setor); if (x.ordem && x.ordem !== "pl") p.set("ordem", x.ordem); const s0 = p.toString(); return "#/fiis" + (s0 ? "?" + s0 : ""); };
  const setores = [...new Set(todos.map((f) => f.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const qtd = (k) => todos.filter((f) => (f.tipo || "fii") === k).length;
  app.innerHTML = `${trilha([["Fundos imobiliários"]])}<div class="cab-pagina"><div><h1>Fundos imobiliários</h1>
    <p>FIIs, Fiagros e FI-Infra listados na B3: rendimentos, patrimônio e carteira, com dados oficiais da CVM e da B3.</p></div></div>
  <div class="chips" id="fii-tipo" style="margin-bottom:14px">${[["todos", "Todos", todos.length], ["fii", "FII", qtd("fii")], ["fiagro", "Fiagro", qtd("fiagro")], ["infra", "FI-Infra", qtd("infra")]].filter(([k, , n]) => k === "todos" || n).map(([k, n, c]) => `<a class="chip${tipo === k ? " ativo" : ""}" href="${url({ tipo: k })}">${n} <span class="muted">${c}</span></a>`).join("")}</div>
  <div class="linha" style="gap:10px;margin-bottom:14px"><label class="sub">Setor <select id="fii-setor"><option value="">Todos os setores</option>${setores.map((x) => `<option${x === setor ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
    <label class="sub">Ordenar por <select id="fii-ordem">${Object.entries(FII_METRICAS).map(([k, x]) => `<option value="${k}"${k === ordem ? " selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></label></div>
  <div class="cartao"><div class="tabela-wrap"><table class="resp"><thead><tr><th>Fundo</th><th>Setor</th><th class="n">Preço</th><th class="n">P/VP</th><th class="n">DY 12m</th><th class="n">Último rend.</th><th class="n">Patrimônio</th><th class="n">Liquidez diária</th><th class="n">Rend. 3 anos</th><th class="n">VP 3 anos</th><th class="n">12 meses</th></tr></thead><tbody>
  ${l.map((f) => { const pv = fiiPreco(f.ticker, f.preco); return `<tr><td data-label="Fundo" class="cel-empresa"><a class="empresa" href="#/fii/${f.ticker}">${logo(f.ticker)}<span class="nomes"><span class="tk">${f.ticker}</span><span class="nm">${esc(f.nome)}</span></span></a></td><td data-label="Setor">${esc(f.setor || f.segmento || "n/d")}</td>
    <td class="n" data-label="Preço">${ok(pv) ? "R$ " + nf2.format(pv) : ND}</td><td class="n" data-label="P/VP">${fmtU(fiiPvp(f), "x")}</td><td class="n" data-label="DY 12m">${fmtU(fiiDy(f), "pct")}</td>
    <td class="n" data-label="Último rend.">${ok(f.ultimo_rendimento) ? "R$ " + nf2.format(f.ultimo_rendimento) : ND}</td><td class="n" data-label="Patrimônio">${ok(f.pl) ? "R$ " + grande(f.pl) : ND}</td>
    <td class="n" data-label="Liquidez diária">${ok(f.liquidez_21) ? "R$ " + grande(f.liquidez_21) : ND}</td><td class="n" data-label="Rend. 3 anos">${fmtU(f.cagr_rend_3a, "pct")}</td><td class="n" data-label="VP 3 anos">${fmtU(f.cagr_vp_3a, "pct")}</td><td class="n" data-label="12 meses">${varHtml(f.var_12m)}</td></tr>`; }).join("") || '<tr><td colspan="11" class="vazio">Nenhum fundo neste recorte.</td></tr>'}
  </tbody></table></div><p class="sub" style="margin-top:10px">Preço da B3 (Yahoo Finance, atraso de até 15 minutos). Patrimônio e valor patrimonial: Informe Mensal da CVM (FII e Fiagro) e Informe Diário (FI-Infra). Rendimentos: avisos aos cotistas no FundosNet (FII e Fiagro) e proventos da B3 (FI-Infra). Crescimento de 3 anos ajustado por desdobramentos de cotas.</p></div>`;
  $("#fii-setor").onchange = (e) => { location.hash = url({ setor: e.target.value }); };
  $("#fii-ordem").onchange = (e) => { location.hash = url({ ordem: e.target.value }); };
}
function fiiPreco(t, padrao) { const v = D.vivoFii && D.vivoFii[t]; return v && ok(v.preco) ? v.preco : padrao; }
const CORES_FII = ["#33c47a", "#5b8def", "#e8a33d", "#c678dd", "#e06c75", "#56b6c2", "#d19a66", "#98c379", "#be5046", "#7f8c99", "#b8bb26", "#ff79c6"];
function rosca(el, rotulos, valores, sufixo = "%") {
  if (!el || !window.Chart) return;
  const tot = valores.reduce((a, b) => a + b, 0) || 1;
  charts.push(new Chart(el, { type: "doughnut", data: { labels: rotulos, datasets: [{ data: valores, backgroundColor: rotulos.map((_, i) => CORES_FII[i % CORES_FII.length]), borderColor: cor("--sup"), borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: rotulos.length > 9 ? "bottom" : "right", labels: { color: cor("--txt-2"), boxWidth: 10, boxHeight: 10, padding: rotulos.length > 9 ? 8 : 10, font: { family: "Inter", size: 11 } } },
      tooltip: { callbacks: { label: (c) => `${c.label}: ${nf2.format(c.parsed / tot * 100)}%` } } } } }));
}
async function pgFii(app, t) {
  const d = D.cache["fii" + t] || (D.cache["fii" + t] = await j(`data/fiis/${t}.json`, null));
  if (!d) { app.innerHTML = `<div class="cartao"><h1>${esc(t)}</h1><p>Fundo não encontrado.</p><p><a class="lk" href="#/fiis">Ver fundos imobiliários</a></p></div>`; return; }
  await precosAoVivo();
  const i = d.indicadores || {}, c = d.cadastro || {}, comp = d.composicao || {}, sb = d.sobre || {};
  const vivo = D.vivoFii[t];
  const preco = fiiPreco(t, i.preco), pvp = ok(preco) && ok(i.vp_cota) ? preco / i.vp_cota : i.p_vp, dy = ok(preco) && ok(i.rend_12m) ? i.rend_12m / preco : i.dy_12m;
  const reais = (v, dec = 2) => ok(v) ? "R$ " + new Intl.NumberFormat("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v) : ND;
  const prov = (d.proventos || []).filter((x) => x.tipo === "Rendimento");
  const ult = prov[prov.length - 1];
  const hoje = new Date().toISOString().slice(0, 10);
  const prox = (d.proventos || []).find((x) => x.pagamento && x.pagamento > hoje);
  const conf = d.conferencia_proventos || {};
  const GRUPOS_DOC = [["todos", "Todos"], ["gerencial", "Relatórios gerenciais"], ["rendimentos", "Rendimentos"], ["fato", "Fatos relevantes"], ["comunicado", "Comunicados"], ["assembleia", "Assembleias"], ["informe", "Informes da CVM"], ["outros", "Outros"]];
  const grupoDoc = (x) => { const k = `${x.categoria} ${x.tipo}`.toLowerCase(); return /gerencial/.test(k) ? "gerencial" : /rendimento|amortiza/.test(k) ? "rendimentos" : /fato relevante/.test(k) ? "fato" : /comunicado|aviso aos cotistas/.test(k) ? "comunicado" : /assembl|edital|ata\b/.test(k) ? "assembleia" : /informes periódicos|informe|demonstra/.test(k) ? "informe" : "outros"; };
  const docs = [...(d.documentos || [])].sort((x, y) => String(y.entrega || "").localeCompare(String(x.entrega || "")));
  const quando = (e) => e ? `${dataBR(e.slice(0, 10))}${e.length > 10 ? " às " + e.slice(11, 16) : ""}` : "n/d";
  const rel = d.relatorio_gerencial;
  const ind = (rot, val, det = "", dest = false) => `<div class="ind${dest ? " principal" : ""}"><div class="rot">${rot}</div><div class="val">${val}</div><div class="det">${det || "&nbsp;"}</div></div>`;
  const tipo = d.tipo || "fii", ehInfra = tipo === "infra", ehAgro = tipo === "fiagro";
  const pctTot = (lst, k = "valor") => { const tot = lst.reduce((a, x) => a + (x[k] || 0), 0) || 1; return lst.map((x) => [x.nome || x.faixa || x.indexador, (x[k] || 0) / tot]); };
  app.innerHTML = `${trilha([["Fundos imobiliários", "#/fiis"], [t]])}
  <div class="ativo-cab"><div class="ativo-id">${logo(t, "g")}<div><h1>${t} <span class="badge">${TIPO_FUNDO[tipo] || "FII"}</span></h1><div class="nm">${esc(c.nome || "")}</div>
    <div class="badges"><span class="badge">${esc(c.segmento || "Segmento n/d")}</span>${c.gestao ? `<span class="badge">Gestão ${esc(c.gestao.toLowerCase())}</span>` : ""}<span class="badge ${/qualific|profiss/i.test(sb.publico || "") ? "alerta" : "pos"}">${esc((sb.publico || "").replace(/^qualquer investidor \(público em geral\)$/, "Público em geral"))}</span><span class="badge">Perfil: ${esc(sb.perfil || "n/d")}</span></div></div></div></div>

  <div class="cartao" style="margin-top:18px"><div class="cotacao-cab"><div title="Cotação com atraso de até 15 minutos."><div class="sub">Cotação</div>
    <div class="preco-grande">${reais(preco)}${ok(vivo ? vivo.var_dia : i.var_dia) ? ` <span class="preco-var">(${varHtml(vivo ? vivo.var_dia : i.var_dia)})</span>` : ""}</div>
    <div class="sub" style="margin-top:6px">${vivo ? `Atualizada às ${new Date(vivo.ao_vivo).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : `Fechamento de ${dataBR(i.data_preco)}`}</div>
    <div class="sub">No ano ${varHtml(i.var_ano)} · 12 meses ${varHtml(i.var_12m)}</div>
    ${ok(i.min_52s) && ok(i.max_52s) && i.max_52s > i.min_52s ? `<div class="faixa52"><div class="trilho"><span class="marc" style="left:${Math.max(0, Math.min(100, (preco - i.min_52s) / (i.max_52s - i.min_52s) * 100))}%"></span></div><div class="ext"><span>Mín. 52 semanas ${reais(i.min_52s)}</span><span>Máx. ${reais(i.max_52s)}</span></div></div>` : ""}</div>
    <div class="linha" style="gap:8px"><a class="btn peq" href="#/retorno?t=${t}&p=3&m=ambos&b=${ehInfra ? "cdi,ipca5" : "ifix,cdi"}">Retorno total x ${ehInfra ? "CDI e IPCA+5%" : "IFIX e CDI"}</a><div class="chips" id="fii-per"><button class="chip ativo" data-p="1">1A</button><button class="chip" data-p="3">3A</button><button class="chip" data-p="10">Máx.</button></div></div></div>
    <div class="grafico" style="margin-top:12px"><canvas id="g-fii-preco"></canvas></div></div>

  <section class="secao"><div class="secao-cab"><h2 class="titulo-barra">Indicadores</h2></div><div class="ind-grade">
    ${i.dy_parcial_meses ? ind("Dividend yield", fmtU(dy, "pct"), `${reais(i.rend_12m)} por cota; só ${i.dy_parcial_meses} meses de rendimentos na bolsa, não é um ano completo`, true) : ind("Dividend yield 12m", fmtU(dy, "pct"), `${reais(i.rend_12m)} por cota em 12 meses`, true)}
    ${ind("P/VP", fmtU(pvp, "x"), `valor patrimonial ${reais(i.vp_cota)} por cota`, true)}
    ${ind("Último rendimento", reais(i.ultimo_rendimento), ok(i.ultimo_yield) ? `${nf2.format(i.ultimo_yield * 100)}% sobre a cota de ${reais(i.cota_base)}` : "", true)}
    ${ind("Rendimento médio 12m", reais(i.rend_medio_12m), "média mensal por cota")}
    ${ind("Patrimônio líquido", ok(i.pl) ? "R$ " + grande(i.pl) : ND, `${ok(i.cotas) ? nf0.format(i.cotas) : "n/d"} cotas`)}
    ${ind("Valor de mercado", ok(preco) && ok(i.cotas) ? "R$ " + grande(preco * i.cotas) : ND, "preço x número de cotas")}
    ${ind("Cotistas", ok(i.cotistas) ? nf0.format(i.cotistas) : ND, ehInfra ? "informe diário da CVM" : "último informe mensal")}
    ${ind("Liquidez média diária", ok(i.liquidez_21) ? "R$ " + grande(i.liquidez_21) : ND, "21 pregões")}
    ${ind(ehInfra ? "Caixa" : "Caixa e renda fixa", ok(i.caixa) ? "R$ " + grande(i.caixa) : fmtU(i.caixa_pct, "pct"), `${fmtU(i.caixa_pct, "pct")} do ativo${ok(i.caixa) && ok(preco) && ok(i.cotas) ? ` · ${nf2.format(i.caixa / (preco * i.cotas) * 100)}% do valor de mercado` : ""}`)}
    ${ok(i.taxa_adm_12m) ? ind("Taxa de administração", fmtU(i.taxa_adm_12m, "pct"), "despesa dos últimos 12 meses sobre o patrimônio") : ""}
    ${ind("Valor patrimonial 3 anos", fmtU(i.cagr_vp_3a, "pct"), "crescimento anual da cota patrimonial")}
  </div></section>

  <section class="secao"><div class="secao-cab"><h2 class="titulo-barra">Rendimentos e patrimônio</h2></div>
    <div class="grade g2 fii-rend">
      <div class="cartao rend-cartao ult"><h3>Último rendimento</h3>${ult ? `<div class="rend-valor">${reais(ult.valor, 4)}</div><div class="rend-grade"><div><span>Rendimento</span><b>${fmtU(i.ultimo_yield, "pct")}</b></div><div><span>Cotação base</span><b>${reais(i.cota_base)}</b></div><div><span>Data base</span><b>${dataBR(ult.data_base)}</b></div><div><span>Pagamento</span><b>${dataBR(ult.pagamento)}</b></div></div>` : '<p class="vazio">Sem rendimentos.</p>'}</div>
      <div class="cartao rend-cartao prox"><h3>Próximo rendimento</h3>${prox ? `<div class="rend-valor">${reais(prox.valor, 4)}</div><div class="rend-grade"><div><span>Data base</span><b>${dataBR(prox.data_base)}</b></div><div><span>Pagamento</span><b>${dataBR(prox.pagamento)}</b></div><div><span>Referência</span><b>${esc(prox.referencia || "")}</b></div></div>` : '<p class="sub" style="margin-top:8px">Ainda não anunciado. O aviso costuma sair no último dia útil do mês.</p>'}</div>
    </div>
    <div class="cartao" style="margin-top:16px"><div class="cartao-cab"><div><h3>Rendimento, valor patrimonial e patrimônio</h3>
      <p class="sub">Barras: rendimento por cota. Linha cheia: valor patrimonial por cota. Tracejado: patrimônio líquido (valor no balão). Por ano: rendimento somado no ano e posição do último mês.</p></div>
      <div class="abas" id="fii-evol-ab" style="margin:0"><button data-v="mes" class="ativo">Por mês</button><button data-v="ano">Por ano</button></div></div>
      <div class="grafico alto"><canvas id="g-fii-evol"></canvas></div>
      <p class="sub" style="margin-top:8px">Fontes: rendimentos ${ehInfra ? "nos proventos do fundo publicados pela B3 (anos antigos pelo Yahoo Finance)" : "nos avisos aos cotistas do FundosNet (B3)"}${conf.meses_comparados ? `, conferidos com o Yahoo Finance: ${conf.divergentes && conf.divergentes.length ? `diferença em ${conf.divergentes.join(", ")}` : `os ${conf.meses_comparados} últimos batem`}` : ""}; patrimônio e valor patrimonial no ${ehInfra ? "Informe Diário" : ehAgro ? "Informe Mensal de Fiagro (antes de 2025, no de FII)" : "Informe Mensal"} da CVM.</p></div>
  </section>

  <section class="secao"><div class="secao-cab"><h2 class="titulo-barra">Sobre o fundo</h2></div>
    <div class="grade g2" style="align-items:start">
      <div class="cartao"><h3>Perfil e carteira hoje</h3>
        ${sb.objetivo ? `<div class="fii-objetivo"><span class="rot">${sb.objetivo.tipo === "descricao" ? "Descrição do fundo" : "Objetivo do fundo"}</span><p>${esc(sb.objetivo.texto)}</p><span class="sub">Fonte: ${sb.objetivo.link ? `<a class="lk" href="${esc(sb.objetivo.link)}" target="_blank" rel="noopener">${esc(sb.objetivo.fonte)} ↗</a>` : esc(sb.objetivo.fonte)}</span></div>` : ""}
        <p style="color:var(--txt-2);line-height:1.55">${esc(sb.texto || "")}</p>
        <div class="sobre-destaques q4">${(ehInfra ? [["papel", "Debêntures"], ["publicos", "Títulos públicos"], ["caixa", "Caixa"], ["outros", "Outros"]] : ehAgro ? [["papel", "Papel do agro"], ["fiis", "Cotas de fundos"], ["caixa", "Caixa"], ["tijolo", "Imóveis rurais"]] : [["papel", "Papel (CRI e CRA)"], ["tijolo", /^agro/.test(sb.perfil || "") ? "Terras agrícolas" : /^energia/.test(sb.perfil || "") ? "Imóveis" : "Tijolo"], ["fiis", "Cotas de FII"], ["caixa", "Caixa"]]).map(([k, n]) => `<div><span>${n}</span><b>${fmtU((sb.grupos || {})[k] || 0, "pct")}</b></div>`).join("")}</div>
        ${rel ? `<a class="btn peq" href="${esc(rel.link)}" target="_blank" rel="noopener">Último relatório gerencial (${esc(rel.referencia)}) ↗</a>` : ""}</div>
      <div class="cartao"><h3>Ficha</h3><div class="ficha">
        ${[["Público-alvo", sb.publico ? sb.publico[0].toUpperCase() + sb.publico.slice(1) : null], [ehInfra ? "Tipo" : "Segmento (CVM)", c.segmento], ["Mandato", c.mandato], ["Gestão", c.gestao], ["Administrador", c.administrador], ["Início", c.inicio ? dataBR(c.inicio) : null], ["Prazo", c.prazo], ["CNPJ", (d.cnpj || "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")]].filter(([, v]) => v).map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}
      </div></div>
    </div></section>

  <section class="secao"><div class="secao-cab"><h2 class="titulo-barra">Carteira</h2><p class="sub" style="margin:0">${ehInfra ? `Carteira (CDA) entregue à CVM, posição de ${esc(fMes(comp.ref_mensal))}, olhando através dos fundos master.` : ehAgro ? `Informe Mensal de Fiagro da CVM, posição de ${esc(fMes(comp.ref_mensal))}.` : `Informe Trimestral da CVM de ${dataBR(comp.ref_trimestral)} e Informe Mensal de ${esc(fMes(comp.ref_mensal))}.`}</p></div>
    <div class="grade g2 fii-carteira">
      ${(comp.por_segmento || []).length ? `<div class="cartao"><h3>Por segmento</h3><div class="grafico rosca"><canvas id="g-fii-seg"></canvas></div></div>` : ""}
      <div class="cartao"><h3>Por tipo de ativo</h3><div class="grafico rosca"><canvas id="g-fii-tipo"></canvas></div></div>
      ${(comp.vencimento_contratos || []).length ? `<div class="cartao"><h3>Vencimento dos contratos</h3><div class="grafico rosca"><canvas id="g-fii-venc"></canvas></div></div>` : ""}
      ${(comp.indexador_contratos || []).length ? `<div class="cartao"><h3>Indexador dos contratos</h3><div class="grafico rosca"><canvas id="g-fii-idx"></canvas></div></div>` : ""}
      ${(comp.vencimento_ativos || []).length ? `<div class="cartao"><h3>Prazo dos ativos até o vencimento</h3><div class="grafico rosca"><canvas id="g-fii-prazo"></canvas></div></div>` : ""}
    </div>
    <p class="sub" style="margin-top:10px">${ehInfra ? `Debêntures e títulos dos fundos master entram na proporção das cotas que o fundo tem em cada um; derivativos de proteção e valores a pagar ou receber ficam de fora.${comp.sigilo > 0 ? ` A CVM permite manter a lista de ativos sob sigilo por alguns meses: ${fmtU(comp.sigilo / ((comp.por_tipo || []).reduce((a, x) => a + x.valor, 0) || 1), "pct")} da carteira aparece só pelo total do tipo, e as maiores posições abaixo mostram apenas o que já é público.` : ""}` : ehAgro ? "Por tipo de ativo: valores do Informe Mensal de Fiagro. Prazo: percentual dos ativos com vencimento em cada faixa." : "Por segmento: cotas de outros FIIs entram pelo segmento declarado à CVM por cada fundo, e os imóveis são repartidos pela receita de cada um. Vencimento: percentual da receita contratada por prazo até o vencimento."}</p>
    ${(d.imoveis || []).length ? `<details class="cartao recolhe" style="margin-top:16px"><summary><h3>Imóveis <span class="muted">${d.imoveis.length}</span></h3></summary><div class="tabela-wrap"><table class="resp"><thead><tr><th>Imóvel</th><th>Segmento</th><th>Local</th><th class="n">Área (m²)</th><th class="n">Vacância</th><th class="n">% da receita</th></tr></thead><tbody>
      ${d.imoveis.map((m) => `<tr><td data-label="Imóvel"><b>${esc(m.nome)}</b><br><span class="muted">${esc(m.classe)}</span></td><td data-label="Segmento">${esc(m.segmento)}</td><td data-label="Local">${esc(m.endereco)}</td><td class="n" data-label="Área">${ok(m.area) ? nf2.format(m.area) : ND}</td><td class="n" data-label="Vacância">${fmtU(m.vacancia, "pct")}</td><td class="n" data-label="% da receita">${fmtU(m.pct_receitas, "pct")}</td></tr>`).join("")}
    </tbody></table></div></details>` : ""}
    ${(comp.carteira_top || []).length ? `<details class="cartao recolhe" style="margin-top:16px"><summary><h3>Maiores posições <span class="muted">${comp.carteira_top.length}</span></h3></summary><div class="tabela-wrap"><table class="resp"><thead><tr><th>Ativo</th><th>Tipo</th><th>Segmento</th><th class="n">Valor</th></tr></thead><tbody>
      ${comp.carteira_top.map((x) => `<tr><td data-label="Ativo">${esc(x.nome || "n/d")}</td><td data-label="Tipo">${esc(x.tipo)}</td><td data-label="Segmento">${esc(x.segmento)}</td><td class="n" data-label="Valor">R$ ${grande(x.valor)}</td></tr>`).join("")}
    </tbody></table></div></details>` : ""}
  </section>

  <section class="secao"><div class="secao-cab"><h2 class="titulo-barra">Relatórios e comunicados</h2><p class="sub" style="margin:0">${ehInfra ? "Documentos oficiais enviados à CVM (regulamento, demonstrações, fatos relevantes e assembleias); o relatório mensal do gestor fica no site da gestora. Notícias de jornal não entram." : "Documentos oficiais do fundo no FundosNet (B3); notícias de jornal não entram."}</p></div>
    <div class="cartao"><div class="chips" id="fii-doc-filtro" style="margin-bottom:10px">${GRUPOS_DOC.filter(([k]) => k === "todos" || docs.some((x) => grupoDoc(x) === k)).map(([k, n], i) => `<button class="chip${i === 0 ? " ativo" : ""}" data-g="${k}">${n} <span class="muted">${k === "todos" ? docs.length : docs.filter((x) => grupoDoc(x) === k).length}</span></button>`).join("")}</div>
      <div id="fii-docs"></div><button class="btn peq" id="fii-docs-mais" hidden>Ver mais</button></div></section>`;

  // documentos com filtro
  let filtroDoc = "todos", limiteDoc = 15;
  const desenharDocs = () => {
    const l = docs.filter((x) => filtroDoc === "todos" || grupoDoc(x) === filtroDoc);
    $("#fii-docs").innerHTML = l.slice(0, limiteDoc).map((x) => `<div class="noticia"><div class="doc-data">Entregue em ${quando(x.entrega)}</div><a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.tipo || x.categoria)}${x.especie ? ` · ${esc(x.especie)}` : ""}</a>${grupoDoc(x) === "gerencial" ? ' <span class="badge pos">Relatório</span>' : grupoDoc(x) === "fato" ? ' <span class="badge alerta">Fato relevante</span>' : ""}<div class="meta">${esc(x.categoria)}${x.referencia ? ` · ${/assembl/i.test(x.categoria) ? "assembleia em" : "referente a"} ${esc(x.referencia)}` : ""}</div></div>`).join("") || '<p class="vazio">Nenhum documento deste tipo.</p>';
    $("#fii-docs-mais").hidden = l.length <= limiteDoc;
  };
  desenharDocs();
  $$("#fii-doc-filtro button").forEach((b) => b.onclick = () => { $$("#fii-doc-filtro button").forEach((x) => x.classList.toggle("ativo", x === b)); filtroDoc = b.dataset.g; limiteDoc = 15; desenharDocs(); });
  $("#fii-docs-mais").onclick = () => { limiteDoc += 15; desenharDocs(); };
  // gráficos
  const graficoPrecoFii = async (anos) => {
    const r = D.cache["rt" + t] || (D.cache["rt" + t] = await j(`data/retorno/${t}.json`, null));
    const el = $("#g-fii-preco"); if (!el || !r) return;
    const corte = new Date(); corte.setFullYear(corte.getFullYear() - anos);
    const serie = r.semanal.filter(([dd]) => new Date(dd) >= corte);
    charts = charts.filter((ch) => { if (ch.canvas === el) { ch.destroy(); return false; } return true; });
    const subiu = serie.length > 1 && serie[serie.length - 1][1] >= serie[0][1], linha = subiu ? cor("--pos") : cor("--neg");
    const g = el.getContext("2d").createLinearGradient(0, 0, 0, 300); g.addColorStop(0, linha + "40"); g.addColorStop(1, linha + "00");
    const ch = new Chart(el, { type: "line", data: { labels: serie.map(([dd]) => dataBR(dd)), datasets: [{ label: t, data: serie.map((x) => x[1]), borderColor: linha, backgroundColor: g, borderWidth: 1.6, pointRadius: 0, fill: true, tension: 0.1 }] }, options: optGraf({ moeda: "R$ ", legenda: false }), plugins: [PLUGIN_MEDIR] });
    charts.push(ch); ativarMedicao(ch, el, "R$");
  };
  graficoPrecoFii(1);
  $$("#fii-per button").forEach((b) => b.onclick = () => { $$("#fii-per button").forEach((x) => x.classList.toggle("ativo", x === b)); graficoPrecoFii(+b.dataset.p); });
  const ms = d.mensal || [];
  const graficoEvol = (modo) => {
    const el = $("#g-fii-evol"); if (!el) return;
    charts = charts.filter((ch) => { if (ch.canvas === el) { ch.destroy(); return false; } return true; });
    const rendMes = {};
    prov.forEach((x) => { const k = x.data_base.slice(0, 7); rendMes[k] = (rendMes[k] || 0) + x.valor; });
    const posMes = Object.fromEntries(ms.map((m) => [m.ref, m]));
    let chaves = [...new Set([...Object.keys(rendMes), ...Object.keys(posMes)])].sort();
    let rot, rend, vp, pl;
    if (modo === "ano") {
      const anos = [...new Set(chaves.map((k) => k.slice(0, 4)))].sort();
      const ultimoDoAno = (y) => { const l = ms.filter((m) => m.ref.startsWith(y)); return l[l.length - 1] || {}; };
      rot = anos;
      rend = anos.map((y) => Object.entries(rendMes).filter(([k]) => k.startsWith(y)).reduce((acc, [, v]) => acc + v, 0) || null);
      vp = anos.map((y) => ultimoDoAno(y).vp_cota ?? null);
      pl = anos.map((y) => ok(ultimoDoAno(y).pl) ? ultimoDoAno(y).pl / 1e6 : null);
    } else {
      rot = chaves.map((k) => k.slice(5) + "/" + k.slice(2, 4));
      rend = chaves.map((k) => rendMes[k] ?? null);
      vp = chaves.map((k) => (posMes[k] || {}).vp_cota ?? null);
      pl = chaves.map((k) => ok((posMes[k] || {}).pl) ? posMes[k].pl / 1e6 : null);
    }
    const o = optGraf({ eixo2: true, legenda: true });
    o.scales.y.title = { display: true, text: "Rendimento por cota (R$)", color: cor("--txt-3") };
    o.scales.y2.title = { display: true, text: "VP por cota (R$)", color: cor("--txt-3") };
    o.scales.y3 = { display: false, position: "right", grid: { display: false } };
    o.plugins.tooltip.callbacks.label = (cx) => {
      const v = cx.parsed.y; if (!ok(v)) return `${cx.dataset.label}: n/d`;
      if (cx.dataset.yAxisID === "y3") return `Patrimônio líquido: R$ ${nf2.format(v)} mi`;
      if (cx.dataset.yAxisID === "y2") return `VP por cota: R$ ${nf2.format(v)}`;
      return `Rendimento por cota: R$ ${nf2.format(v)}`;
    };
    charts.push(new Chart(el, { data: { labels: rot, datasets: [
      { type: "bar", label: "Rendimento por cota", data: rend, backgroundColor: cor("--serie"), borderRadius: 3, yAxisID: "y", order: 3 },
      { type: "line", label: "VP por cota", data: vp, borderColor: cor("--serie-2"), backgroundColor: cor("--serie-2"), borderWidth: 2, pointRadius: modo === "ano" ? 3 : 0, spanGaps: true, yAxisID: "y2", order: 1 },
      { type: "line", label: "Patrimônio líquido", data: pl, borderColor: "#e8a33d", backgroundColor: "#e8a33d", borderDash: [6, 4], borderWidth: 2, pointRadius: modo === "ano" ? 3 : 0, spanGaps: true, yAxisID: "y3", order: 2 }] }, options: o }));
  };
  graficoEvol("mes");
  $$("#fii-evol-ab button").forEach((b) => b.onclick = () => { $$("#fii-evol-ab button").forEach((x) => x.classList.toggle("ativo", x === b)); graficoEvol(b.dataset.v); });
  const seg = pctTot(comp.por_segmento || []), tp = pctTot(comp.por_tipo || []);
  rosca($("#g-fii-seg"), seg.map((x) => x[0]), seg.map((x) => x[1]));
  rosca($("#g-fii-tipo"), tp.map((x) => x[0]), tp.map((x) => x[1]));
  const resto = (l) => { const s0 = l.reduce((a, x) => a + x[1], 0); return s0 > 0 && s0 < 0.995 ? [...l, ["Outros ou não informado", 1 - s0]] : l; };
  const vc = resto((comp.vencimento_contratos || []).map((x) => [x.faixa, x.pct])), ix = resto((comp.indexador_contratos || []).map((x) => [x.indexador, x.pct]));
  rosca($("#g-fii-venc"), vc.map((x) => x[0]), vc.map((x) => x[1]));
  rosca($("#g-fii-idx"), ix.map((x) => x[0]), ix.map((x) => x[1]));
  const pz = resto((comp.vencimento_ativos || []).map((x) => [x.faixa, x.pct]));
  rosca($("#g-fii-prazo"), pz.map((x) => x[0]), pz.map((x) => x[1]));
}
function fMes(ref) { const M = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]; return ref && /^\d{4}-\d{2}/.test(ref) ? `${M[+ref.slice(5, 7) - 1]} de ${ref.slice(0, 4)}` : (ref || "n/d"); }
function pgComparar(app, q) {
  let sel = (q.get("t") || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => D.fund[x]);
  const setor = q.get("setor");
  if (setor) sel = D.univ.filter((a) => a.setor_micro === setor || a.setor_macro === setor).map((a) => a.ticker);
  sel = [...new Set(sel)].slice(0, 8);
  const setoresMacro = [...new Set(D.univ.map((a) => a.setor_macro))].sort(), setoresMicro = [...new Set(D.univ.map((a) => a.setor_micro))].sort();
  const atualizar = (lista, s) => { location.hash = s ? `#/comparar?setor=${encodeURIComponent(s)}` : `#/comparar?t=${lista.join(",")}`; };
  app.innerHTML = `${trilha([["Comparador"]])}<div class="cab-pagina"><div><h1>Comparador</h1><p>Escolha de 2 a 8 empresas ou carregue um setor inteiro. O endereço da página guarda a seleção.</p></div></div>
  <div class="cartao"><div class="linha">
    <div class="chips">${sel.map((t) => `<button class="chip ativo" data-rm="${t}">${logo(t)}${t}<span class="x">✕</span></button>`).join("") || '<span class="muted">Nenhuma empresa selecionada.</span>'}</div>
    <select id="cmp-add"><option value="">Adicionar empresa</option>${D.univ.filter((a) => !sel.includes(a.ticker)).map((a) => `<option value="${a.ticker}">${a.ticker} · ${esc(a.nome)}</option>`).join("")}</select>
    <select id="cmp-setor"><option value="">Carregar setor</option><optgroup label="Setor">${setoresMacro.map((s) => `<option>${esc(s)}</option>`).join("")}</optgroup><optgroup label="Subsetor">${setoresMicro.map((s) => `<option>${esc(s)}</option>`).join("")}</optgroup></select>
    ${sel.length ? '<button class="btn peq" id="cmp-limpar">Limpar</button>' : ""}</div></div><div id="cmp-saida"></div>`;
  $$("[data-rm]").forEach((b) => b.onclick = () => atualizar(sel.filter((x) => x !== b.dataset.rm)));
  $("#cmp-add").onchange = (e) => { if (e.target.value && sel.length < 8) atualizar([...sel, e.target.value]); };
  $("#cmp-setor").onchange = (e) => e.target.value && atualizar(null, e.target.value);
  if ($("#cmp-limpar")) $("#cmp-limpar").onclick = () => atualizar([]);
  if (sel.length < 2) { $("#cmp-saida").innerHTML = '<div class="cartao"><p class="vazio">Selecione pelo menos 2 empresas.</p></div>'; return; }
  const usa = (t, k) => !suprimido(t, k);
  const lider = (L) => sel.filter((t) => usa(t, L.k) && ok(val(t, L.k))).sort((a, b) => L.dir * (val(b, L.k) - val(a, L.k)))[0];
  const mini = (k) => {
    const m = meta(k), vs = sel.map((t) => [t, usa(t, k) ? val(t, k) : null]).filter(([, v]) => ok(v));
    if (!vs.length) return "";
    const mx = Math.max(...vs.map(([, v]) => Math.abs(v))) || 1;
    return `<div class="mini"><h4>${esc(rot(k))} ${tip(k)}</h4><div class="barras">${vs.sort((a, b) => (m.direcao || 1) * (b[1] - a[1])).map(([t, v]) => `<div class="linha-barra"><span><b>${t}</b></span><span class="barra"><i style="left:0;width:${Math.max(3, Math.abs(v) / mx * 100)}%;background:${v >= 0 ? "var(--acento)" : "var(--neg)"}"></i></span><span class="num">${stripTags(fmt(t, k, v))}</span></div>`).join("")}</div></div>`;
  };
  const grupos = ["TIR", "Valuation", "Rentabilidade", "Eficiência", "Endividamento", "Crescimento", "Caixa", "Proventos", "Governança", "Tamanho", "Banco", "Seguradora", "Holding", "Cripto", "BDR"];
  const im = D.imeta.indicadores;
  let corpo = `<tr class="grupo-linha"><td colspan="${sel.length + 1}">Resumo</td></tr>` + ["setor_micro", "porte", "preco", "var_12m", "valor_mercado_brl", "nota_criterios", "fcl", "margem_fcl"].map((k) => linhaCmp(k, sel)).join("");
  for (const g of grupos) {
    const ks = Object.keys(im).filter((k) => im[k].grupo === g && !["preco", "valor_mercado"].includes(k)).filter((k) => sel.some((t) => ok(val(t, k))));
    if (ks.length) corpo += `<tr class="grupo-linha"><td colspan="${sel.length + 1}">${esc(g)}</td></tr>` + ks.map((k) => linhaCmp(k, sel)).join("");
  }
  $("#cmp-saida").innerHTML = `<section class="secao"><div class="secao-cab"><h2 class="titulo-barra">Destaques da seleção</h2></div><div class="lideres">${LIDERES.map((L) => [L, lider(L)]).filter(([, t]) => t).map(([L, t]) =>
    `<div class="lider"><div class="r">${esc(L.nome)}</div>${empresa(t, { cls: "p" })}<div class="v">${fmt(t, L.k)}</div></div>`).join("")}</div></section>
  <section class="secao"><div class="secao-cab"><h2 class="titulo-barra">Indicadores-chave</h2></div><div class="mini-grade">${MINIS.map(mini).join("")}</div></section>
  <section class="secao"><div class="secao-cab"><h2 class="titulo-barra">Todos os indicadores</h2><div class="linha"><span class="sub">Verde marca o melhor e vermelho o pior de cada linha.</span><button class="btn peq prim" id="cmp-xls">Baixar Excel</button></div></div>
  <div class="tabela-wrap alta"><table><thead><tr><th>Indicador</th>${sel.map((t) => `<th class="n"><a href="#/ativo/${t}" class="empresa" style="justify-content:flex-end">${logo(t, "p")}<span class="tk">${t}</span></a></th>`).join("")}</tr></thead><tbody>${corpo}</tbody></table></div></section>`;
  $("#cmp-xls").onclick = () => exportarComparador(sel);
}
function exportarComparador(sel) {
  const im = D.imeta.indicadores;
  const ks = ["setor_micro", "porte", "preco", "var_12m", "valor_mercado_brl", "nota_criterios", "margem_fcl", ...Object.keys(im).filter((k) => !["preco", "valor_mercado", "nota_criterios"].includes(k) && sel.some((t) => ok(val(t, k))))];
  baixarExcel("comparador", [{ nome: "Comparador", cab: ["Indicador", ...sel.map((t) => `${t} (${A(t).nome})`)], linhas: ks.map((k) => [cabCol(k), ...sel.map((t) => valCol(t, k))]) }]);
}
function linhaCmp(k, sel) {
  const m = meta(k), dir = m.direcao || 0;
  const vs = sel.map((t) => suprimido(t, k) ? null : val(t, k));
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
   FILTROS AVANÇADOS
   ===================================================================== */
function pgFiltros(app) {
  const s = EST.scr;
  const macros = [...new Set(D.univ.map((a) => a.setor_macro))].sort(), micros = [...new Set(D.univ.map((a) => a.setor_micro))].sort();
  const indicadoresNum = Object.keys(D.imeta.indicadores).filter((k) => meta(k).unidade !== "txt");
  const favs = lsGet("filtros_favoritos", {});
  app.innerHTML = `${trilha([["Ações", "#/ativos?seg=ACAO_BR"], ["Filtros avançados"]])}<div class="cab-pagina"><div><h1>Filtros avançados</h1><p>Combine critérios. O resultado atualiza na hora e pode ser exportado.</p></div></div>
  <div class="cartao">
    <div class="segmentado" id="scr-seg">${[["TODOS", "Todos"], ["ACAO_BR", "Ações"], ["BDR", "BDRs"]].map(([k, n]) => `<button data-s="${k}" class="${s.seg === k ? "ativo" : ""}">${n}</button>`).join("")}</div><div class="espaco"></div>
    <div class="grade g4">
      <label class="campo">Setor<select id="f-macro"><option value="">Todos</option>${macros.map((x) => `<option ${s.macro === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="campo">Subsetor<select id="f-micro"><option value="">Todos</option>${micros.map((x) => `<option ${s.micro === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="campo">Porte<select id="f-porte"><option value="">Todos</option>${["Large cap", "Mid cap", "Small cap", "Micro cap"].map((x) => `<option ${s.porte === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label class="campo">Qualidade contábil mínima (0 a 9)<select id="f-pio"><option value="">Qualquer</option>${[5, 6, 7, 8].map((v) => `<option ${+s.pioMin === v ? "selected" : ""} value="${v}">${v} ou mais</option>`).join("")}</select></label>
      <label class="campo">Nota por critérios mínima<select id="f-nota"><option value="">Qualquer</option>${[5, 6, 7, 8].map((v) => `<option ${+s.notaMin === v ? "selected" : ""} value="${v}">${v} ou mais</option>`).join("")}</select></label>
      <label class="campo">TIR implícita mínima (%)<input type="number" id="f-tir" step="0.5" value="${esc(s.tirMin)}"></label>
      <label class="campo">Liquidez diária mínima (R$ milhões)<input type="number" id="f-liq" step="1" value="${esc(s.liqMin)}"></label>
      <label class="campo">Cenário macro favorável<select id="f-cen"><option value="">Nenhum</option>${Object.entries(CENARIOS).map(([k, c]) => `<option value="${k}" ${s.cenario === k ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label class="campo">&nbsp;<span class="linha" style="min-height:38px"><input type="checkbox" id="f-rec" ${s.semRec ? "checked" : ""}> Ocultar empresas em recuperação</span></label>
      <label class="campo">&nbsp;<span class="linha" style="min-height:38px"><input type="checkbox" id="f-estado" ${s.semEstado ? "checked" : ""}> Ocultar empresas com interferência estatal</span></label>
    </div>
    <h4>Faixas de indicadores</h4><div id="f-faixas"></div>
    <div class="linha" style="margin-top:10px"><select id="f-novo"><option value="">Adicionar faixa de indicador</option>${indicadoresNum.map((k) => `<option value="${k}">${esc(meta(k).nome)}</option>`).join("")}</select></div>
    <div class="espaco"></div>
    <div class="linha entre"><div class="linha">
      <select id="f-favs"><option value="">Filtros salvos</option>${Object.keys(favs).map((n) => `<option>${esc(n)}</option>`).join("")}</select>
      <button class="btn peq" id="f-salvar">Salvar filtro</button><button class="btn peq" id="f-apagar">Apagar salvo</button><button class="btn peq" id="f-limpar">Limpar</button></div>
      <button class="btn prim" id="f-csv">Baixar Excel</button></div>
  </div>
  <section class="secao"><div class="secao-cab"><h2 class="titulo-barra" id="f-qtd"></h2></div><div id="f-res"></div></section>`;
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
    if (s.notaMin) l = l.filter((t) => entraNota(t) && ind(t).nota_criterios >= +s.notaMin);
    if (s.tirMin !== "" && s.tirMin !== null) l = l.filter((t) => !semValuation(t) && ok(ind(t).tir_implicita) && ind(t).tir_implicita * 100 >= +s.tirMin);
    if (s.liqMin !== "" && s.liqMin !== null) l = l.filter((t) => ok((D.prices[t] || {}).liquidez_21) && D.prices[t].liquidez_21 >= +s.liqMin * 1e6);
    if (s.semRec) l = l.filter((t) => !isRec(t));
    if (s.semEstado) l = l.filter((t) => !estado(t));
    if (s.cenario) l = l.filter((t) => ((A(t).sensibilidade || {})[s.cenario] ?? 0) >= 1);
    for (const f of EST.scrFiltros) l = l.filter((t) => { const v = val(t, f.k); return ok(v) && v >= f.min - 1e-12 && v <= f.max + 1e-12; });
    return ordenar(l, "valor_mercado_brl", -1);
  };
  const colunas = () => [...new Set(["setor_micro", "preco", ...EST.scrFiltros.map((f) => f.k), "nota_criterios", "pl", "roe", "dy", "tir_implicita", "piotroski"])];
  const aplicar = () => {
    const l = resultado();
    $("#f-qtd").textContent = `${l.length} empresa${l.length === 1 ? "" : "s"}`;
    $("#f-res").innerHTML = tabela(l, colunas(), { alta: true });
    ligarLinhas($("#f-res"));
  };
  const ler = () => { Object.assign(s, { macro: $("#f-macro").value, micro: $("#f-micro").value, porte: $("#f-porte").value, pioMin: $("#f-pio").value, notaMin: $("#f-nota").value, tirMin: $("#f-tir").value,
    liqMin: $("#f-liq").value, cenario: $("#f-cen").value, semRec: $("#f-rec").checked, semEstado: $("#f-estado").checked }); aplicar(); };
  $$("#scr-seg button").forEach((c) => c.onclick = () => { s.seg = c.dataset.s; $$("#scr-seg button").forEach((x) => x.classList.toggle("ativo", x === c)); aplicar(); });
  ["#f-macro", "#f-micro", "#f-porte", "#f-pio", "#f-nota", "#f-tir", "#f-liq", "#f-cen", "#f-rec", "#f-estado"].forEach((id) => { $(id).onchange = ler; $(id).oninput = ler; });
  $("#f-novo").onchange = (e) => { if (e.target.value) { EST.scrFiltros.push({ k: e.target.value, min: null, max: null }); e.target.value = ""; faixas(); aplicar(); } };
  $("#f-salvar").onclick = () => { const nome = prompt("Nome do filtro:"); if (!nome) return; const fv = lsGet("filtros_favoritos", {}); fv[nome] = { scr: { ...s }, faixas: EST.scrFiltros }; lsSet("filtros_favoritos", fv); pgFiltros(app); };
  $("#f-favs").onchange = (e) => { const fv = lsGet("filtros_favoritos", {})[e.target.value]; if (fv) { Object.assign(EST.scr, fv.scr); EST.scrFiltros = fv.faixas || []; pgFiltros(app); } };
  $("#f-apagar").onclick = () => { const n = $("#f-favs").value; if (!n) return; const fv = lsGet("filtros_favoritos", {}); delete fv[n]; lsSet("filtros_favoritos", fv); pgFiltros(app); };
  $("#f-limpar").onclick = () => { EST.scr = { seg: "TODOS", macro: "", micro: "", porte: "", tirMin: "", liqMin: "", pioMin: "", semRec: true, cenario: "" }; EST.scrFiltros = []; pgFiltros(app); };
  $("#f-csv").onclick = () => exportarTabela("filtro", resultado(), colunas());
  faixas(); aplicar();
}
/* ---------------- exportação para Excel (.xlsx, gerado no navegador com SheetJS) */
const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
function carregarXLSX() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = XLSX_URL; sc.onload = res; sc.onerror = () => rej(new Error("Não foi possível carregar o gerador de Excel. Verifique a conexão.")); document.head.appendChild(sc); });
}
async function baixarExcel(arquivo, abas) {
  try { await carregarXLSX(); } catch (e) { alert(e.message); return; }
  const wb = XLSX.utils.book_new();
  for (const a of abas) {
    const ws = XLSX.utils.aoa_to_sheet([a.cab, ...a.linhas]);
    ws["!cols"] = a.cab.map((c, i) => ({ wch: Math.min(48, Math.max(8, String(c).length + 2, ...a.linhas.slice(0, 300).map((l) => String(l[i] ?? "").length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, a.nome.slice(0, 31));
  }
  XLSX.writeFile(wb, `${arquivo}_${D.meta.data_fechamento || "dados"}.xlsx`);
}
function cabCol(k) { const u = meta(k).unidade; return rot(k) + (u === "pct" ? " (%)" : ""); }
function valCol(t, k) {
  const v = val(t, k);
  if (k === "setor_micro" || k === "setor_macro" || meta(k).unidade === "txt") return v ?? "";
  if (!ok(v) || suprimido(t, k)) return "";
  return meta(k).unidade === "pct" ? Math.round(v * 10000) / 100 : Math.round(v * 100) / 100;
}
function exportarTabela(arquivo, lista, colunas) {
  const cols = colunas.filter((k) => !["ticker", "nome", "empresa"].includes(k));
  baixarExcel(arquivo, [{ nome: "Ativos", cab: ["Ticker", "Empresa", "Moeda dos fundamentos", ...cols.map(cabCol)], linhas: lista.map((t) => [t, A(t).nome, moedaDe(t), ...cols.map((k) => valCol(t, k))]) }]);
}
function exportarAgenda(seg, permitidos) {
  const { prox, recentes } = agendaLista(seg, permitidos);
  baixarExcel("calendario_resultados", [
    { nome: "Próximos resultados", cab: ["Data", "Ticker", "Empresa", "Período", "Situação", "Critério da data", "Prazo legal"],
      linhas: prox.map(([t, x]) => [dataBR(x.data), t, A(t).nome, x.rotulo || "", x.criterio && x.criterio.includes("Yahoo") ? "data informada" : "estimada", x.criterio || "", x.prazo_legal ? dataBR(x.prazo_legal) : ""]) },
    { nome: "Divulgados recentemente", cab: ["Data de entrega à CVM", "Ticker", "Empresa", "Período", "Documento", "Link"],
      linhas: recentes.map(([t, x]) => [dataBR(x.entrega), t, A(t).nome, x.rotulo || "", x.doc || "", x.link || ""]) },
  ]);
}

/* =====================================================================
   FAIXA DE MERCADO, RODAPÉ, BUSCA, TEMA, TOOLTIP
   ===================================================================== */
/* ---------------- faixa de cotações: dados ao vivo e arraste com o mouse */
const AO_VIVO = { url: "https://raw.githubusercontent.com/luizfrb529/analise-fundamentalista/refs/heads/mercado/mercado.json",
  cambio: "https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL,BTC-BRL", intervaloMs: 60000 };
const FAIXA = { x: 0, pausado: false, arrastando: false, ultX: 0, moveu: 0, ultimo: 0, hora: null };
async function cotacoesAoVivo() {
  const m = D.macro;
  let hora = null;
  try {
    const r = await fetch(`${AO_VIVO.url}?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const quando = new Date(j.atualizado_em);
      if (Date.now() - quando.getTime() < 36 * 3600e3) {   // ignora arquivo velho (fim de semana, robô parado)
        for (const [k, v] of Object.entries(j.itens || {})) if (ok(v.valor)) m[k] = { ...(m[k] || {}), valor: v.valor, var_dia: v.var_dia };
        hora = quando;
      }
    }
  } catch (e) { /* sem cotação ao vivo: fica o fechamento */ }
  try {
    const r = await fetch(AO_VIVO.cambio, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const usa = (par, chave) => { const x = j[par]; if (x && isFinite(+x.bid)) m[chave] = { ...(m[chave] || {}), valor: +x.bid, var_dia: +x.pctChange / 100 }; };
      usa("USDBRL", "dolar"); usa("EURBRL", "euro"); usa("BTCBRL", "bitcoin_brl");
      if (j.USDBRL && j.USDBRL.timestamp) { const q = new Date(+j.USDBRL.timestamp * 1000); if (!hora || q > hora) hora = q; }
    }
  } catch (e) { /* idem */ }
  FAIXA.hora = hora;
  faixaMercado();
}
function faixaMercado() {
  const m = D.macro || {};
  const pts = (x, pre = "") => x && ok(x.valor) ? { v: pre + nf2.format(x.valor), d: x.var_dia } : null;
  const taxa = (x, campo = "valor") => x && ok(x[campo]) ? { v: nf2.format(x[campo] * 100) + "%" } : null;
  const venc = m.ntnb_longa && m.ntnb_longa.vencimento ? m.ntnb_longa.vencimento.slice(0, 4) : "";
  const itens = [
    ["Ibovespa", pts(m.ibovespa), "pts", "ibovespa"], ["SMLL", pts(m.smll), "pts", "smll"], ["IFIX", pts(m.ifix), "pts", "ifix"], ["S&P 500", pts(m.sp500), "pts", "sp500"], ["Nasdaq", pts(m.nasdaq), "pts", "nasdaq"], ["EWZ", pts(m.ewz, "US$ "), "", "ewz"],
    ["Dólar", pts(m.dolar, "R$ "), "", "dolar"], ["Euro", pts(m.euro, "R$ "), "", "euro"], ["Bitcoin", pts(m.bitcoin_brl, "R$ "), "", "bitcoin_brl"],
    ["Brent", pts(m.brent, "US$ "), "", "brent"], ["Ouro", pts(m.ouro, "US$ "), "onça", "ouro"],
    ["Selic", taxa(m.selic), "a.a.", "selic"], ["CDI", taxa(m.cdi), "a.a.", "cdi"], ["IPCA 12m", taxa(m.ipca_12m), "", "ipca_12m"],
    [`NTN-B ${venc}`, m.ntnb_longa && ok(m.ntnb_longa.taxa) ? { v: "IPCA + " + nf2.format(m.ntnb_longa.taxa * 100) + "%" } : null, "", "ntnb_longa"],
    ["Treasury 10a", taxa(m.treasury_10y, "taxa"), "", "treasury_10y"], ["Treasury 20a", taxa(m.treasury_20y, "taxa"), "", "treasury_20y"],
  ].filter(([, x]) => x);
  const hora = FAIXA.hora
    ? `<i class="ponto-vivo"></i><span class="tempo-real">Tempo real</span><span class="v">${FAIXA.hora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>`
    : `<span>Fechamento</span><span class="v">${dataBR(D.meta.data_fechamento)}</span>`;
  $("#faixa-status").innerHTML = hora;
  $("#faixa-status").title = FAIXA.hora ? `Última atualização das cotações às ${FAIXA.hora.toLocaleTimeString("pt-BR")}` : "Dados de fechamento";
  const html = itens.map(([r, x, u, k]) => `<span class="fx clicavel" data-k="${k}" title="Clique para ver o histórico"><span class="r">${esc(r)}</span><span class="v">${x.v}</span>${u ? `<span class="u">${u}</span>` : ""}${ok(x.d) ? `<span class="d ${sinal(x.d)}">${x.d > 0 ? "▲" : x.d < 0 ? "▼" : ""} ${nf2.format(Math.abs(x.d) * 100)}%</span>` : ""}</span>`).join("");
  $("#faixa-trilho").innerHTML = html + html;
  $("#faixa").title = FAIXA.hora
    ? `Cotações atualizadas às ${FAIXA.hora.toLocaleTimeString("pt-BR")}: câmbio e bitcoin em tempo real (AwesomeAPI); índices e commodities com atraso de até 15 minutos (Yahoo Finance). Arraste para rolar.`
    : `Fechamento de ${dataBR(D.meta.data_fechamento)}. Arraste para rolar.`;
}
function animarFaixa() {
  const faixa = $("#faixa"), trilho = $("#faixa-trilho");
  const parado = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const passo = (ts) => {
    const dt = FAIXA.ultimo ? Math.min(64, ts - FAIXA.ultimo) : 0;
    FAIXA.ultimo = ts;
    if (!FAIXA.pausado && !FAIXA.arrastando && !parado) FAIXA.x -= dt * 0.045;
    const meio = trilho.scrollWidth / 2;
    if (meio > 0) { while (FAIXA.x <= -meio) FAIXA.x += meio; while (FAIXA.x > 0) FAIXA.x -= meio; }
    trilho.style.transform = `translate3d(${FAIXA.x}px,0,0)`;
    requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
  faixa.addEventListener("mouseenter", () => { FAIXA.pausado = true; });
  faixa.addEventListener("mouseleave", () => { FAIXA.pausado = false; });
  faixa.addEventListener("pointerdown", (e) => { FAIXA.arrastando = true; FAIXA.ultX = e.clientX; FAIXA.moveu = 0; faixa.setPointerCapture(e.pointerId); faixa.classList.add("arrastando"); });
  faixa.addEventListener("pointermove", (e) => { if (!FAIXA.arrastando) return; const d = e.clientX - FAIXA.ultX; FAIXA.x += d; FAIXA.moveu += Math.abs(d); FAIXA.ultX = e.clientX; });
  const soltar = (e) => {
    const clique = FAIXA.arrastando && FAIXA.moveu < 6 && e.type === "pointerup";
    FAIXA.arrastando = false; faixa.classList.remove("arrastando"); if (e.pointerType !== "mouse") FAIXA.pausado = false;
    if (clique) { const alvo = document.elementFromPoint(e.clientX, e.clientY); const fx = alvo && alvo.closest(".fx[data-k]"); if (fx) modalMercado(fx.dataset.k); }
  };
  faixa.addEventListener("pointerup", soltar);
  faixa.addEventListener("pointercancel", soltar);
}
function rodape() {
  $("#rodape").innerHTML = `<p>Dados atualizados em ${D.meta.gerado_em ? new Date(D.meta.gerado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "n/d"} · preços de fechamento de ${dataBR(D.meta.data_fechamento)} · balanços até o ${esc(D.meta.balancos_ate || "n/d")}.</p>
  <p>Fontes: CVM, B3, SEC, Banco Central, Tesouro Direto, FRED e Yahoo Finance. Logos: brapi.dev. A fórmula de cada indicador está no ícone ⓘ ao lado do nome.</p>`;
}
function ligarBusca(inp, lista, botao) {
  let sel = 0;
  const achar = () => {
    const q = inp.value.trim().toLowerCase();
    if (!q || !D.univ) return [];
    const fiis = (D.fiis || []).map((f) => ({ ticker: f.ticker, nome: f.nome, setor_macro: "Fundo imobiliário", setor_micro: "FII " + (f.segmento || ""), fii: true }));
    return [...D.univ, ...fiis].filter((a) => a.ticker.toLowerCase().includes(q) || a.nome.toLowerCase().includes(q) || a.setor_macro.toLowerCase().includes(q) || a.setor_micro.toLowerCase().includes(q))
      .sort((a, b) => (b.ticker.toLowerCase().startsWith(q) - a.ticker.toLowerCase().startsWith(q))).slice(0, 8);
  };
  const desenhar = () => { const r = achar(); lista.hidden = !r.length; lista.innerHTML = r.map((a, i) => `<a href="#/${a.fii ? "fii" : "ativo"}/${a.ticker}" class="${i === sel ? "sel" : ""}">${logo(a.ticker)}<span><b>${a.ticker}</b><span class="sub">${esc(a.nome)} · ${esc(a.setor_micro)}</span></span></a>`).join(""); };
  const ir = () => { const r = achar(); if (r[sel]) location.hash = `#/${r[sel].fii ? "fii" : "ativo"}/${r[sel].ticker}`; else if (inp.value.trim()) { EST.tab.busca = inp.value.trim(); location.hash = "#/ativos?seg=TODOS"; } inp.value = ""; lista.hidden = true; inp.blur(); };
  inp.oninput = () => { sel = 0; desenhar(); };
  inp.onkeydown = (e) => {
    const r = achar();
    if (e.key === "ArrowDown") { sel = Math.min(sel + 1, r.length - 1); desenhar(); e.preventDefault(); }
    if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); desenhar(); e.preventDefault(); }
    if (e.key === "Enter") ir();
    if (e.key === "Escape") { lista.hidden = true; inp.blur(); }
  };
  if (botao) botao.onclick = ir;
  lista.onclick = () => { inp.value = ""; lista.hidden = true; };
  document.addEventListener("click", (e) => { if (!lista.contains(e.target) && e.target !== inp) lista.hidden = true; });
}
function tema() {
  $("#tema").onclick = () => {
    const novo = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
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
      if ((await sha256($("#senha").value)) === CONFIG.SENHA_SHA256) { try { sessionStorage.setItem("liberado", "1"); } catch (er) {} b.hidden = true; res(); }
      else $("#senha-erro").hidden = false;
    };
  });
}

/* =====================================================================
   INÍCIO
   ===================================================================== */
(async function iniciar() {
  if (CONFIG.MODO_PRIVADO) { document.querySelector(".topo").hidden = true; await pedirSenha(); document.querySelector(".topo").hidden = false; }
  tema(); tooltips();
  try { await carregar(); }
  catch (e) {
    $("#app").innerHTML = `<div class="cartao"><h2>Não foi possível carregar os dados</h2><p>${esc(e.message)}</p><p class="sub">Rode o pipeline (rodar_local.bat) e abra o site por um servidor local (http://localhost:8000).</p></div>`;
    return;
  }
  ligarBusca($("#busca"), $("#busca-lista"));
  montarMenus();
  await Promise.race([precosAoVivo(), new Promise((r) => setTimeout(r, 3000))]);
  faixaMercado();
  animarFaixa();
  setInterval(precosAoVivo, AO_VIVO.intervaloMs);
  cotacoesAoVivo();
  setInterval(cotacoesAoVivo, AO_VIVO.intervaloMs);
  rodape();
  window.addEventListener("hashchange", render);
  render();
})();
