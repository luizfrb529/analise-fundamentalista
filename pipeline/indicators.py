"""
Fórmulas dos indicadores fundamentalistas.

Funções puras (sem rede, sem arquivo). Toda função devolve None quando o dado
de entrada falta ou quando a conta não faz sentido (ex.: P/L com lucro negativo
é devolvido). O site mostra None como "n/d".

Unidades: valores monetários em unidade cheia (R$ ou US$, não milhares).
Taxas e margens em fração (0.15 = 15%).

O dicionário META no final descreve cada indicador (nome, fórmula, direção, grupo)
e é exportado para data/indicators_meta.json, que alimenta tooltips, metodologia
e as cores do comparador.
"""
from __future__ import annotations

import math
import re
from statistics import mean, median, pstdev
from typing import Iterable, Optional

Num = Optional[float]


# ---------------------------------------------------------------- utilitários
def ok(*xs) -> bool:
    return all(x is not None and isinstance(x, (int, float)) and math.isfinite(x) for x in xs)


def div(a: Num, b: Num) -> Num:
    """Divisão segura: None se faltar dado ou denominador zero."""
    if not ok(a, b) or b == 0:
        return None
    return a / b


def pos_div(a: Num, b: Num) -> Num:
    """Divisão que só faz sentido com denominador positivo (ex.: múltiplos sobre lucro)."""
    if not ok(a, b) or b <= 0:
        return None
    return a / b


def soma(*xs: Num) -> Num:
    vals = [x for x in xs if ok(x)]
    return sum(vals) if vals else None


def media(xs: Iterable[Num]) -> Num:
    v = [x for x in xs if ok(x)]
    return mean(v) if v else None


def mediana(xs: Iterable[Num]) -> Num:
    v = [x for x in xs if ok(x)]
    return median(v) if v else None


def cagr(inicio: Num, fim: Num, anos: float) -> Num:
    """CAGR = (fim / início)^(1/anos) - 1. Só existe se início e fim forem positivos."""
    if not ok(inicio, fim) or inicio <= 0 or fim <= 0 or anos <= 0:
        return None
    return (fim / inicio) ** (1.0 / anos) - 1.0


def percentil(valor: Num, populacao: Iterable[Num]) -> Num:
    """Percentil do valor dentro da população (0 a 100), contando empates pela metade."""
    pop = [x for x in populacao if ok(x)]
    if not ok(valor) or not pop:
        return None
    abaixo = sum(1 for x in pop if x < valor)
    iguais = sum(1 for x in pop if x == valor)
    return 100.0 * (abaixo + 0.5 * iguais) / len(pop)


def ltm(anual_anterior: Num, acumulado_atual: Num, acumulado_ano_anterior: Num) -> Num:
    """LTM de conta de fluxo = último exercício + acumulado do ano - mesmo acumulado do ano anterior."""
    if not ok(anual_anterior, acumulado_atual, acumulado_ano_anterior):
        return None
    return anual_anterior + acumulado_atual - acumulado_ano_anterior


def porte(valor_mercado_brl: Num, faixas: dict) -> Optional[str]:
    if not ok(valor_mercado_brl):
        return None
    if valor_mercado_brl >= faixas["large"]:
        return "Large cap"
    if valor_mercado_brl >= faixas["mid"]:
        return "Mid cap"
    if valor_mercado_brl >= faixas["small"]:
        return "Small cap"
    return "Micro cap"


def consistencia_crescimento(serie: list) -> Optional[int]:
    """Número de anos em que o valor cresceu sobre o ano anterior (série em ordem cronológica)."""
    v = [x for x in serie if ok(x)]
    if len(v) < 2:
        return None
    return sum(1 for a, b in zip(v[:-1], v[1:]) if b > a)


def anos_seguidos_positivos(serie: list) -> int:
    """Conta, a partir do ano mais recente para trás, quantos anos seguidos o valor foi > 0."""
    n = 0
    for x in reversed(serie):
        if ok(x) and x > 0:
            n += 1
        else:
            break
    return n


def anos_com_corte(serie: list) -> Optional[int]:
    v = [x for x in serie if ok(x)]
    if len(v) < 2:
        return None
    return sum(1 for a, b in zip(v[:-1], v[1:]) if b < a * 0.95)


def queda_seguida(serie: list, anos: int = 3) -> bool:
    """True se os últimos `anos` valores caíram em sequência (precisa de anos+1 pontos)."""
    v = [x for x in serie if ok(x)]
    if len(v) < anos + 1:
        return False
    ult = v[-(anos + 1):]
    return all(b < a for a, b in zip(ult[:-1], ult[1:]))


# ------------------------------------------------------- valuation clássico
def margem_seguranca(preco_justo: Num, preco: Num) -> Num:
    """(preço justo / preço) - 1. Positivo = preço de tela abaixo do preço justo da fórmula."""
    if not ok(preco_justo, preco) or preco <= 0:
        return None
    return preco_justo / preco - 1.0


def peg(pl: Num, cagr_lpa: Num) -> Num:
    """PEG = P/L / (CAGR do LPA em pontos percentuais). Só com P/L e CAGR positivos."""
    if not ok(pl, cagr_lpa) or pl <= 0 or cagr_lpa <= 0:
        return None
    return pl / (cagr_lpa * 100.0)


# ------------------------------------------------ TIR e crescimento implícitos
def tir_por_lucro(lucro_medio_3a: Num, valor_mercado: Num, g: float) -> Num:
    """TIR implícita por lucro = lucro médio de 3 anos / valor de mercado + g."""
    ey = pos_div(lucro_medio_3a, valor_mercado)
    if ey is None or lucro_medio_3a <= 0:
        return None
    return ey + g


def tir_por_caixa(fcl_medio_3a: Num, valor_mercado: Num, g: float) -> Num:
    """TIR implícita por caixa = FCL médio de 3 anos / valor de mercado + g."""
    y = pos_div(fcl_medio_3a, valor_mercado)
    if y is None or fcl_medio_3a <= 0:
        return None
    return y + g


def vp_dcf(taxa: float, receita0: float, cresc: float, margem_fcl: float, g: float, anos: int = 5) -> float:
    """Valor presente: N anos de FCL = receita0*(1+cresc)^t*margem, depois perpetuidade com g."""
    vp = 0.0
    fcl = 0.0
    for t in range(1, anos + 1):
        fcl = receita0 * (1 + cresc) ** t * margem_fcl
        vp += fcl / (1 + taxa) ** t
    terminal = fcl * (1 + g) / (taxa - g)
    return vp + terminal / (1 + taxa) ** anos


def tir_dcf_reverso(ev: Num, receita0: Num, cresc: Num, margem_fcl: Num, g: float,
                    anos: int = 5, teto: float = 0.15, piso: float = -0.05) -> Num:
    """
    DCF reverso: taxa de desconto r tal que VP(fluxo projetado) = valor da firma (EV).
    Crescimento dos N anos = CAGR 5a da receita limitado a [piso, teto]; margem FCL = média 5a.
    Resolve por bisseção entre g+0,1% e 100% a.a.
    """
    if not ok(ev, receita0, cresc, margem_fcl) or ev <= 0 or receita0 <= 0 or margem_fcl <= 0:
        return None
    c = max(piso, min(teto, cresc))
    lo, hi = g + 0.001, 1.0
    f = lambda r: vp_dcf(r, receita0, c, margem_fcl, g, anos) - ev
    if f(lo) < 0:      # nem a menor taxa justifica o EV: TIR abaixo de g
        return None
    if f(hi) > 0:      # EV pequeno demais: TIR acima de 100%
        return hi
    for _ in range(200):
        mid = (lo + hi) / 2
        if f(mid) > 0:
            lo = mid
        else:
            hi = mid
        if hi - lo < 1e-7:
            break
    return (lo + hi) / 2


def crescimento_implicito(ev: Num, fcl_normalizado: Num, taxa: float) -> Num:
    """
    Crescimento perpétuo exigido pelo preço (Gordon): EV = FCL*(1+g)/(r-g)
    => g = (r*EV - FCL) / (EV + FCL).
    """
    if not ok(ev, fcl_normalizado) or ev <= 0 or fcl_normalizado <= 0:
        return None
    return (taxa * ev - fcl_normalizado) / (ev + fcl_normalizado)


def tir_banco(roe: Num, payout: Num, pvp: Num) -> Num:
    """
    Bancos e seguradoras: TIR ~ ROE x (1 - payout) + payout x ROE / (P/VP).
    Parte retida cresce ao ROE; parte distribuída rende o dividend yield sobre o preço.
    """
    if not ok(roe, payout, pvp) or pvp <= 0:
        return None
    p = max(0.0, min(1.0, payout))
    return roe * (1 - p) + p * roe / pvp


def crescimento_implicito_banco(roe: Num, pvp: Num, taxa: float) -> Num:
    """
    Modelo de P/VP justificado: P/VP = (ROE - g) / (r - g)  =>  g = (r*P/VP - ROE) / (P/VP - 1).
    Indefinido quando P/VP ~ 1.
    """
    if not ok(roe, pvp) or pvp <= 0 or abs(pvp - 1) < 0.02:
        return None
    return (taxa * pvp - roe) / (pvp - 1)


def taxa_referencia(juro_real_longo: Num, inflacao_lp: float, premio: float, nominal_direto: Num = None) -> Num:
    """
    Brasil: (1 + NTN-B longa real) x (1 + inflação LP) - 1 + prêmio.
    Exterior: Treasury 10y (já nominal) + prêmio.
    """
    if ok(nominal_direto):
        return nominal_direto + premio
    if not ok(juro_real_longo):
        return None
    return (1 + juro_real_longo) * (1 + inflacao_lp) - 1 + premio


# ---------------------------------------------- mercado (séries de preço)
def retornos(precos: list) -> list:
    return [b / a - 1 for a, b in zip(precos[:-1], precos[1:]) if ok(a, b) and a > 0]


def volatilidade_anual(precos: list, periodos_ano: int = 252) -> Num:
    r = retornos(precos)
    if len(r) < 20:
        return None
    return pstdev(r) * math.sqrt(periodos_ano)


def beta(precos_ativo: list, precos_indice: list) -> Num:
    """Beta = cov(r_ativo, r_índice) / var(r_índice), retornos diários alinhados."""
    ra, ri = retornos(precos_ativo), retornos(precos_indice)
    n = min(len(ra), len(ri))
    if n < 60:
        return None
    ra, ri = ra[-n:], ri[-n:]
    ma, mi = mean(ra), mean(ri)
    cov = sum((a - ma) * (b - mi) for a, b in zip(ra, ri)) / n
    var = sum((b - mi) ** 2 for b in ri) / n
    return div(cov, var)


def max_drawdown(precos: list) -> Num:
    """Maior queda do pico ao vale (negativo, ex.: -0.45)."""
    v = [p for p in precos if ok(p) and p > 0]
    if len(v) < 2:
        return None
    pico, pior = v[0], 0.0
    for p in v:
        pico = max(pico, p)
        pior = min(pior, p / pico - 1)
    return pior


# --------------------------------------------- snapshot de um período
def calcular(f: dict, m: dict, modelo: str = "GERAL") -> dict:
    """
    Calcula os indicadores de um período.
    f: contas do período (fluxos do período e saldos no fim dele). Chaves usadas:
       receita, custo, lucro_bruto, ebit, da, desp_fin, rec_fin, lair, ir, lucro_liq,
       fco, capex, div_pagos, recompras, ativo, ativo_circ, caixa, receber, estoques,
       passivo_circ, passivo_nc, fornecedores, divida_cp, divida_lp, pl, minoritarios,
       (bancos) rec_interm, desp_interm, pdd, rec_servicos, desp_adm, desp_pessoal, desp_trib
       (seguradoras) res_fin
    m: mercado: preco, valor_mercado, acoes, dpa_12m, acoes_por_papel
    """
    g = lambda k: f.get(k)
    r: dict = {}
    vm = m.get("valor_mercado")
    acoes = m.get("acoes")
    fator = m.get("acoes_por_papel") or 1
    preco = m.get("preco")

    divida_bruta = soma(g("divida_cp"), g("divida_lp")) if (ok(g("divida_cp")) or ok(g("divida_lp"))) else None
    caixa = g("caixa")
    divida_liq = divida_bruta - caixa if ok(divida_bruta, caixa) else None
    financeiro = modelo in ("BANCO", "SEGURADORA")
    ebitda = soma(g("ebit"), g("da")) if ok(g("ebit")) and ok(g("da")) else None
    fcl = g("fco") - abs(g("capex")) if ok(g("fco"), g("capex")) else None
    if financeiro:
        divida_liq_ev = None
    else:
        divida_liq_ev = divida_liq
    ev = vm + divida_liq_ev + (g("minoritarios") or 0) if ok(vm, divida_liq_ev) else (vm if financeiro else None)

    r["divida_bruta"] = None if financeiro else divida_bruta
    r["caixa"] = caixa
    r["divida_liquida"] = None if financeiro else divida_liq
    r["ebitda"] = None if financeiro else ebitda
    r["fcl"] = None if financeiro else fcl
    r["valor_mercado"] = vm
    r["ev"] = None if financeiro else ev

    lpa = div(g("lucro_liq"), acoes)
    vpa = div(g("pl"), acoes)
    r["lpa"] = lpa * fator if ok(lpa) else None
    r["vpa"] = vpa * fator if ok(vpa) else None

    # valuation
    r["pl"] = pos_div(vm, g("lucro_liq"))
    r["pvp"] = pos_div(vm, g("pl"))
    r["p_ebitda"] = None if financeiro else pos_div(vm, ebitda)
    r["p_ebit"] = None if financeiro else pos_div(vm, g("ebit"))
    r["psr"] = None if financeiro else pos_div(vm, g("receita"))
    r["p_ativo"] = pos_div(vm, g("ativo"))
    capital_giro = g("ativo_circ") - g("passivo_circ") if ok(g("ativo_circ"), g("passivo_circ")) else None
    r["p_capital_giro"] = None if financeiro else pos_div(vm, capital_giro)
    acl = g("ativo_circ") - soma(g("passivo_circ"), g("passivo_nc")) if ok(g("ativo_circ"), g("passivo_circ"), g("passivo_nc")) else None
    r["p_acl"] = None if financeiro else pos_div(vm, acl)
    r["ev_ebitda"] = None if financeiro else pos_div(ev, ebitda)
    r["ev_ebit"] = None if financeiro else pos_div(ev, g("ebit"))
    r["ev_receita"] = None if financeiro else pos_div(ev, g("receita"))
    r["earnings_yield"] = None if financeiro else pos_div(g("ebit"), ev)
    r["fcf_yield"] = None if financeiro else pos_div(fcl, vm)

    # endividamento
    if not financeiro:
        r["divliq_pl"] = pos_div(divida_liq, g("pl")) if ok(divida_liq) else None
        r["divliq_ebitda"] = div(divida_liq, ebitda) if ok(ebitda) and ebitda > 0 else None
        r["divliq_ebit"] = div(divida_liq, g("ebit")) if ok(g("ebit")) and g("ebit") > 0 else None
        r["liquidez_corrente"] = div(g("ativo_circ"), g("passivo_circ"))
        ac_sem_est = g("ativo_circ") - (g("estoques") or 0) if ok(g("ativo_circ")) else None
        r["liquidez_seca"] = div(ac_sem_est, g("passivo_circ"))
        r["liquidez_imediata"] = div(caixa, g("passivo_circ"))
        dfin = abs(g("desp_fin")) if ok(g("desp_fin")) else None
        r["cobertura_juros"] = div(g("ebit"), dfin) if ok(dfin) and dfin > 0 else None
        r["divida_cp_pct"] = div(g("divida_cp"), divida_bruta) if ok(divida_bruta) and divida_bruta > 0 else None
    r["pl_ativos"] = div(g("pl"), g("ativo"))
    passivos = g("ativo") - g("pl") - (g("minoritarios") or 0) if ok(g("ativo"), g("pl")) else None
    r["passivos_ativos"] = div(passivos, g("ativo"))

    # eficiência
    if not financeiro:
        lb = g("lucro_bruto") if ok(g("lucro_bruto")) else (g("receita") - abs(g("custo")) if ok(g("receita"), g("custo")) else None)
        r["margem_bruta"] = pos_div(lb, g("receita")) if ok(lb) else None
        r["margem_ebitda"] = div(ebitda, g("receita")) if ok(g("receita")) and g("receita") > 0 else None
        r["margem_ebit"] = div(g("ebit"), g("receita")) if ok(g("receita")) and g("receita") > 0 else None
        cv = abs(g("custo")) if ok(g("custo")) else None
        r["pmr"] = div(g("receber"), g("receita")) * 365 if ok(div(g("receber"), g("receita"))) else None
        r["pme"] = div(g("estoques"), cv) * 365 if ok(div(g("estoques"), cv)) else None
        r["pmp"] = div(g("fornecedores"), cv) * 365 if ok(div(g("fornecedores"), cv)) else None
        r["ciclo_financeiro"] = r["pmr"] + r["pme"] - r["pmp"] if ok(r["pmr"], r["pme"], r["pmp"]) else None
        r["giro_ativo"] = div(g("receita"), g("ativo"))
    r["margem_liquida"] = div(g("lucro_liq"), g("receita")) if ok(g("receita")) and g("receita") > 0 else None

    # rentabilidade
    r["roe"] = div(g("lucro_liq"), g("pl")) if ok(g("pl")) and g("pl") > 0 else None
    r["roa"] = div(g("lucro_liq"), g("ativo"))
    if not financeiro:
        aliq = div(abs(g("ir")) if ok(g("ir")) else None, g("lair")) if ok(g("lair")) and g("lair") > 0 else None
        aliq = 0.34 if aliq is None else max(0.0, min(0.34, aliq))
        nopat = g("ebit") * (1 - aliq) if ok(g("ebit")) else None
        capital_investido = soma(g("pl"), g("minoritarios"), divida_liq) if ok(g("pl"), divida_liq) else None
        r["roic"] = div(nopat, capital_investido) if ok(capital_investido) and capital_investido > 0 else None

    # caixa
    if not financeiro:
        r["fco"] = g("fco")
        r["capex"] = abs(g("capex")) if ok(g("capex")) else None
        r["capex_depreciacao"] = div(r["capex"], abs(g("da"))) if ok(g("da")) and g("da") != 0 else None
        r["conversao_caixa"] = div(fcl, g("lucro_liq")) if ok(g("lucro_liq")) and g("lucro_liq") > 0 else None

    # proventos
    dpa = m.get("dpa_12m")
    r["dpa_12m"] = dpa
    r["dy"] = div(dpa, preco) if ok(dpa) and ok(preco) and preco > 0 else None
    if ok(dpa, lpa) and lpa > 0:
        r["payout"] = dpa / (lpa * fator)
    else:
        r["payout"] = None
    if not financeiro:
        dp = abs(g("div_pagos")) if ok(g("div_pagos")) else None
        r["dividendos_sobre_fcl"] = div(dp, fcl) if ok(dp, fcl) and fcl > 0 else None
        r["dividendo_sem_caixa"] = bool(ok(dp, fcl) and dp > 0 and fcl <= 0)

    # específicos
    if modelo == "BANCO":
        # nii = receitas de juros - despesas de juros; receitas operacionais = receitas da
        # intermediação (que no layout CVM já incluem serviços e seguros) - despesas de juros
        jd = abs(g("juros_desp")) if ok(g("juros_desp")) else None
        nii = g("juros_rec") - jd if ok(g("juros_rec"), jd) else None
        r["nim"] = div(nii, g("ativo"))
        rec_op = g("rec_interm") - jd if ok(g("rec_interm"), jd) else None
        if ok(rec_op) and ok(g("rec_servicos_fora")):
            rec_op += g("rec_servicos_fora")
        despesas = abs(g("desp_adm")) + abs(g("desp_pessoal") or 0) if ok(g("desp_adm")) else None
        r["indice_eficiencia"] = div(despesas, rec_op) if ok(despesas, rec_op) and rec_op > 0 else None
        pdd = abs(g("pdd")) if ok(g("pdd")) else None
        r["custo_credito_sobre_margem"] = div(pdd, nii) if ok(pdd, nii) and nii > 0 else None
        r["carteira_credito"] = g("carteira")
    if modelo == "SEGURADORA":
        r["resultado_financeiro_sobre_lucro"] = div(g("res_fin"), g("lucro_liq")) if ok(g("lucro_liq")) and g("lucro_liq") > 0 else None
    return r


# --------------------------------------------- metadados para o site
# direcao: 1 = maior é melhor, -1 = menor é melhor, 0 = neutro
META = {
    # tamanho
    "preco": ("Preço", "Fechamento do último pregão.", 0, "Tamanho", "moeda"),
    "valor_mercado": ("Valor de mercado", "Preço de cada classe x número de ações da classe (ON + PN), excluindo tesouraria.", 0, "Tamanho", "moeda_grande"),
    "ev": ("Valor da firma (EV)", "Valor de mercado + dívida líquida + participação de minoritários.", 0, "Tamanho", "moeda_grande"),
    "liquidez_21": ("Liquidez média 21 pregões", "Média do volume financeiro diário (preço x quantidade) dos últimos 21 pregões.", 1, "Tamanho", "moeda_grande"),
    "liquidez_63": ("Liquidez média 63 pregões", "Média do volume financeiro diário dos últimos 63 pregões.", 1, "Tamanho", "moeda_grande"),
    "volatilidade": ("Volatilidade anualizada", "Desvio padrão dos retornos diários de 1 ano x raiz(252).", -1, "Tamanho", "pct"),
    "beta": ("Beta", "Cov(retorno do ativo, retorno do índice) / Var(retorno do índice), diário, 2 anos. Índice: Ibovespa (Brasil) ou S&P 500 (BDR exterior).", 0, "Tamanho", "x"),
    "drawdown_5a": ("Maior queda em 5 anos", "Maior recuo do pico ao vale do preço ajustado em 5 anos.", 1, "Tamanho", "pct"),
    "free_float": ("Free float", "Percentual das ações fora do bloco de controle, segundo o Formulário de Referência (CVM).", 1, "Governança", "pct"),
    # valuation
    "pl": ("P/L", "Valor de mercado / lucro líquido LTM atribuído aos controladores.", -1, "Valuation", "x"),
    "pvp": ("P/VP", "Valor de mercado / patrimônio líquido dos controladores.", -1, "Valuation", "x"),
    "p_ebitda": ("P/EBITDA", "Valor de mercado / EBITDA LTM (EBIT + depreciação e amortização).", -1, "Valuation", "x"),
    "p_ebit": ("P/EBIT", "Valor de mercado / EBIT LTM.", -1, "Valuation", "x"),
    "psr": ("P/Receita (PSR)", "Valor de mercado / receita líquida LTM.", -1, "Valuation", "x"),
    "p_ativo": ("P/Ativo", "Valor de mercado / ativo total.", -1, "Valuation", "x"),
    "p_capital_giro": ("P/Capital de giro", "Valor de mercado / (ativo circulante - passivo circulante). n/d se o capital de giro for negativo.", -1, "Valuation", "x"),
    "p_acl": ("P/Ativo circulante líquido", "Valor de mercado / (ativo circulante - passivo total). n/d se negativo.", -1, "Valuation", "x"),
    "ev_ebitda": ("EV/EBITDA", "Valor da firma / EBITDA LTM.", -1, "Valuation", "x"),
    "ev_ebit": ("EV/EBIT", "Valor da firma / EBIT LTM.", -1, "Valuation", "x"),
    "ev_receita": ("EV/Receita", "Valor da firma / receita líquida LTM.", -1, "Valuation", "x"),
    "lpa": ("LPA", "Lucro líquido LTM / número de ações (x ações por papel, no caso de units).", 1, "Valuation", "moeda"),
    "vpa": ("VPA", "Patrimônio líquido / número de ações (x ações por papel, no caso de units).", 1, "Valuation", "moeda"),
    "peg": ("PEG", "P/L / CAGR de 5 anos do LPA (em pontos percentuais). Só com ambos positivos.", -1, "Valuation", "x"),
    "earnings_yield": ("Earnings Yield", "EBIT LTM / valor da firma.", 1, "Valuation", "pct"),
    "fcf_yield": ("FCF Yield", "Fluxo de caixa livre LTM (FCO - capex) / valor de mercado.", 1, "Valuation", "pct"),
    "pl_vs_media5": ("P/L vs média própria 5a", "P/L atual / média do P/L anual dos últimos 5 exercícios - 1. Negativo = abaixo da própria média.", -1, "Valuation", "pct"),
    "evebitda_vs_media5": ("EV/EBITDA vs média própria 5a", "EV/EBITDA atual / média dos 5 últimos exercícios - 1.", -1, "Valuation", "pct"),
    "pvp_vs_media5": ("P/VP vs média própria 5a", "P/VP atual / média dos 5 últimos exercícios - 1 (usado em bancos).", -1, "Valuation", "pct"),
    # tir
    "tir_lucro": ("TIR implícita por lucro", "Lucro médio de 3 exercícios / valor de mercado + g.", 1, "TIR", "pct"),
    "tir_caixa": ("TIR implícita por caixa", "FCL médio de 3 exercícios / valor de mercado + g.", 1, "TIR", "pct"),
    "tir_dcf": ("TIR implícita por DCF reverso", "Taxa que iguala o VP de 5 anos de FCL (receita crescendo ao CAGR 5a limitado, margem FCL média 5a) mais perpetuidade com g ao valor da firma. Bisseção.", 1, "TIR", "pct"),
    "tir_banco": ("TIR implícita (banco/seguradora)", "ROE sustentável x (1 - payout) + payout x ROE / (P/VP). ROE sustentável = média de 3 exercícios.", 1, "TIR", "pct"),
    "tir_implicita": ("TIR implícita (principal)", "Bancos e seguradoras: fórmula de ROE. Demais: mediana das TIRs por lucro, caixa e DCF reverso disponíveis.", 1, "TIR", "pct"),
    "tir_spread_ref": ("TIR - título de referência", "TIR implícita principal - NTN-B longa nominal (Brasil) ou Treasury 10y (exterior). Informativo.", 1, "TIR", "pct"),
    "cresc_implicito": ("Crescimento implícito", "Crescimento perpétuo que o preço exige à taxa de referência (Gordon: g = (r x EV - FCL) / (EV + FCL)). Bancos: g = (r x P/VP - ROE) / (P/VP - 1).", -1, "TIR", "pct"),
    "cresc_historico_ref": ("Crescimento histórico de referência", "CAGR 5a do lucro (bancos e seguradoras) ou da receita (demais).", 1, "TIR", "pct"),
    "cresc_gap": ("Implícito - histórico", "Crescimento implícito - crescimento histórico. Positivo = preço exige mais do que a empresa entregou.", -1, "TIR", "pct"),
    "taxa_referencia": ("Taxa de desconto de referência", "Brasil: (1 + NTN-B longa) x (1 + inflação LP) - 1 + 5%. Exterior: Treasury 10y + 5%.", 0, "TIR", "pct"),
    "g": ("g (crescimento de longo prazo)", "Inflação de longo prazo + crescimento real do setor micro (config.json).", 0, "TIR", "pct"),
    # endividamento
    "divida_bruta": ("Dívida bruta", "Empréstimos, financiamentos e debêntures de curto e longo prazo.", -1, "Endividamento", "moeda_grande"),
    "caixa": ("Caixa", "Caixa e equivalentes + aplicações financeiras de curto prazo.", 1, "Endividamento", "moeda_grande"),
    "divida_liquida": ("Dívida líquida", "Dívida bruta - caixa.", -1, "Endividamento", "moeda_grande"),
    "divliq_pl": ("Dív. líq./PL", "Dívida líquida / patrimônio líquido.", -1, "Endividamento", "x"),
    "divliq_ebitda": ("Dív. líq./EBITDA", "Dívida líquida / EBITDA LTM.", -1, "Endividamento", "x"),
    "divliq_ebit": ("Dív. líq./EBIT", "Dívida líquida / EBIT LTM.", -1, "Endividamento", "x"),
    "pl_ativos": ("PL/Ativos", "Patrimônio líquido / ativo total.", 1, "Endividamento", "pct"),
    "passivos_ativos": ("Passivos/Ativos", "(Ativo - PL) / ativo total.", -1, "Endividamento", "pct"),
    "liquidez_corrente": ("Liquidez corrente", "Ativo circulante / passivo circulante.", 1, "Endividamento", "x"),
    "liquidez_seca": ("Liquidez seca", "(Ativo circulante - estoques) / passivo circulante.", 1, "Endividamento", "x"),
    "liquidez_imediata": ("Liquidez imediata", "Caixa / passivo circulante.", 1, "Endividamento", "x"),
    "cobertura_juros": ("Cobertura de juros", "EBIT LTM / despesas financeiras LTM.", 1, "Endividamento", "x"),
    "divida_cp_pct": ("% dívida no curto prazo", "Dívida de curto prazo / dívida bruta.", -1, "Endividamento", "pct"),
    # eficiência
    "margem_bruta": ("Margem bruta", "Lucro bruto / receita líquida.", 1, "Eficiência", "pct"),
    "margem_ebitda": ("Margem EBITDA", "EBITDA / receita líquida.", 1, "Eficiência", "pct"),
    "margem_ebit": ("Margem EBIT", "EBIT / receita líquida.", 1, "Eficiência", "pct"),
    "margem_liquida": ("Margem líquida", "Lucro líquido / receita líquida (bancos: sobre receitas da intermediação).", 1, "Eficiência", "pct"),
    "giro_ativo": ("Giro do ativo", "Receita líquida LTM / ativo total.", 1, "Eficiência", "x"),
    "pmr": ("Prazo médio de recebimento", "Contas a receber / receita x 365 (dias).", -1, "Eficiência", "dias"),
    "pme": ("Prazo médio de estoque", "Estoques / custo dos produtos x 365 (dias).", -1, "Eficiência", "dias"),
    "pmp": ("Prazo médio de pagamento", "Fornecedores / custo dos produtos x 365 (dias).", 1, "Eficiência", "dias"),
    "ciclo_financeiro": ("Ciclo financeiro", "PMR + PME - PMP (dias).", -1, "Eficiência", "dias"),
    # rentabilidade
    "roe": ("ROE", "Lucro líquido LTM / patrimônio líquido dos controladores.", 1, "Rentabilidade", "pct"),
    "roa": ("ROA", "Lucro líquido LTM / ativo total.", 1, "Rentabilidade", "pct"),
    "roic": ("ROIC", "EBIT x (1 - alíquota efetiva, limitada a 34%) / (PL + minoritários + dívida líquida).", 1, "Rentabilidade", "pct"),
    "roic_spread": ("ROIC - custo de capital", "ROIC - taxa de desconto de referência. Positivo = cria valor.", 1, "Rentabilidade", "pct"),
    # crescimento
    "cagr_receita_5a": ("CAGR receita 5a", "(Receita do último exercício / receita de 5 anos antes)^(1/5) - 1.", 1, "Crescimento", "pct"),
    "cagr_receita_10a": ("CAGR receita 10a", "Mesmo cálculo com 10 anos (ou o máximo disponível, indicado).", 1, "Crescimento", "pct"),
    "cagr_ebitda_5a": ("CAGR EBITDA 5a", "CAGR de 5 anos do EBITDA anual.", 1, "Crescimento", "pct"),
    "cagr_ebitda_10a": ("CAGR EBITDA 10a", "CAGR de 10 anos do EBITDA anual.", 1, "Crescimento", "pct"),
    "cagr_lucro_5a": ("CAGR lucro 5a", "CAGR de 5 anos do lucro líquido anual. n/d se algum extremo for negativo.", 1, "Crescimento", "pct"),
    "cagr_lucro_10a": ("CAGR lucro 10a", "CAGR de 10 anos do lucro líquido anual.", 1, "Crescimento", "pct"),
    "cagr_lpa_5a": ("CAGR LPA 5a", "CAGR de 5 anos do lucro por ação (ajustado por desdobramentos).", 1, "Crescimento", "pct"),
    "cagr_lpa_10a": ("CAGR LPA 10a", "CAGR de 10 anos do lucro por ação.", 1, "Crescimento", "pct"),
    "cagr_dpa_5a": ("CAGR dividendo por ação 5a", "CAGR de 5 anos dos proventos por ação por ano.", 1, "Crescimento", "pct"),
    "cagr_dpa_10a": ("CAGR dividendo por ação 10a", "CAGR de 10 anos dos proventos por ação.", 1, "Crescimento", "pct"),
    "cresc_receita_ltm": ("Receita LTM vs LTM anterior", "Receita LTM / receita dos 12 meses encerrados um ano antes - 1.", 1, "Crescimento", "pct"),
    "cresc_lucro_ltm": ("Lucro LTM vs LTM anterior", "Lucro LTM / lucro dos 12 meses encerrados um ano antes - 1.", 1, "Crescimento", "pct"),
    "consist_receita": ("Anos com receita crescendo", "Em quantos dos últimos 10 anos a receita cresceu.", 1, "Crescimento", "anos"),
    "consist_lucro": ("Anos com lucro crescendo", "Em quantos dos últimos 10 anos o lucro cresceu.", 1, "Crescimento", "anos"),
    # caixa
    "fco": ("FCO", "Caixa líquido das atividades operacionais LTM.", 1, "Caixa", "moeda_grande"),
    "capex": ("Capex", "Aquisições de imobilizado e intangível LTM.", 0, "Caixa", "moeda_grande"),
    "fcl": ("FCL", "FCO - capex.", 1, "Caixa", "moeda_grande"),
    "ebitda": ("EBITDA", "EBIT + depreciação e amortização (da DFC).", 1, "Caixa", "moeda_grande"),
    "capex_depreciacao": ("Capex/Depreciação", "Capex / depreciação e amortização. Acima de 1 = investe mais do que deprecia.", 0, "Caixa", "x"),
    "conversao_caixa": ("Conversão de caixa", "FCL / lucro líquido. Abaixo de 0,5 = lucro não vira caixa.", 1, "Caixa", "x"),
    # proventos
    "dpa_12m": ("Proventos por ação 12m", "Soma dos dividendos e JCP com data-com nos últimos 12 meses (B3).", 1, "Proventos", "moeda"),
    "dy": ("Dividend Yield 12m", "Proventos por ação 12m / preço.", 1, "Proventos", "pct"),
    "dy_medio_5a": ("DY médio 5a", "Média do DY de cada um dos 5 últimos anos (proventos do ano / preço no fim do ano).", 1, "Proventos", "pct"),
    "payout": ("Payout", "Proventos por ação 12m / LPA LTM.", 0, "Proventos", "pct"),
    "dividendos_sobre_fcl": ("Dividendos pagos / FCL", "Dividendos e JCP pagos (DFC) / FCL. Acima de 1 = pago além do caixa gerado.", -1, "Proventos", "x"),
    "anos_pagando": ("Anos seguidos pagando", "Anos consecutivos, até o último ano completo, com proventos > 0.", 1, "Proventos", "anos"),
    "anos_corte": ("Anos com corte", "Anos (em 10) em que o provento por ação caiu mais de 5%.", -1, "Proventos", "anos"),
    "jcp_pct_12m": ("% JCP nos proventos 12m", "Parcela dos proventos 12m declarada como Juros sobre Capital Próprio.", 0, "Proventos", "pct"),
    # governança
    "acoes": ("Número de ações", "Total de ações (todas as classes) menos ações em tesouraria.", 0, "Governança", "num"),
    "diluicao_3a": ("Diluição 3a", "Ações hoje / ações 3 anos antes (ajustado por desdobramento) - 1.", -1, "Governança", "pct"),
    "diluicao_5a": ("Diluição 5a", "Ações hoje / ações 5 anos antes - 1.", -1, "Governança", "pct"),
    "controlador_pct": ("Participação do controlador", "Soma do capital total detido por acionistas marcados como controladores (FRE).", 0, "Governança", "pct"),
    "tag_along": ("Tag along", "Percentual garantido ao minoritário em venda de controle.", 1, "Governança", "pct_int"),
    "recompras_ltm": ("Recompras LTM", "Valor gasto com aquisição de ações próprias nos 12 meses (DFC).", 1, "Governança", "moeda_grande"),
    # bancos
    "nim": ("Margem financeira / ativo (NIM aprox.)", "(Receitas de juros - despesas de juros) / ativo total. Aproximação com dados da DRE.", 1, "Banco", "pct"),
    "indice_eficiencia": ("Índice de eficiência (aprox.)", "(Despesas de pessoal + administrativas) / (margem financeira + serviços). Menor é melhor.", -1, "Banco", "pct"),
    "custo_credito_sobre_margem": ("Custo do crédito / margem", "Perda esperada com crédito / margem financeira bruta.", -1, "Banco", "pct"),
    "cresc_carteira": ("Crescimento da carteira de crédito", "Carteira de crédito no fim do período / um ano antes - 1 (balanço CVM).", 1, "Banco", "pct"),
    "basileia": ("Índice de Basileia", "Capital regulatório / ativos ponderados pelo risco. Fonte: release da empresa (notes.json).", 1, "Banco", "pct"),
    "inadimplencia_90": ("Inadimplência 90 dias", "Carteira com atraso acima de 90 dias / carteira. Fonte: release (notes.json).", -1, "Banco", "pct"),
    "cobertura_pdd": ("Cobertura de PDD", "Provisão / carteira vencida há mais de 90 dias. Fonte: release (notes.json).", 1, "Banco", "pct"),
    # seguradoras
    "resultado_financeiro_sobre_lucro": ("Resultado financeiro / lucro", "Resultado financeiro / lucro líquido.", 0, "Seguradora", "pct"),
    "indice_combinado": ("Índice combinado", "(Sinistros + despesas) / prêmios ganhos. Fonte: release (notes.json).", -1, "Seguradora", "pct"),
    "sinistralidade": ("Sinistralidade", "Sinistros retidos / prêmios ganhos. Fonte: release (notes.json).", -1, "Seguradora", "pct"),
    # holding
    "soma_partes": ("Soma das partes listadas", "Soma de (participação declarada no FRE x valor de mercado de cada investida listada).", 0, "Holding", "moeda_grande"),
    "desconto_holding": ("Desconto de holding", "Valor de mercado da holding / soma das partes listadas - 1. Negativo = holding vale menos que as participações.", -1, "Holding", "pct"),
    # tesouraria em bitcoin
    "btc_em_caixa": ("Bitcoin em caixa", "Quantidade de BTC declarada (SEC XBRL) ou saldo de criptoativos no balanço / preço do BTC na data do balanço (CVM).", 1, "Cripto", "num_btc"),
    "valor_btc": ("Valor do bitcoin em caixa", "BTC em caixa x preço do BTC no fechamento.", 1, "Cripto", "moeda_grande"),
    "mnav": ("mNAV", "Valor de mercado / valor do bitcoin em caixa. Acima de 1 = a ação custa mais que o BTC que a empresa tem.", -1, "Cripto", "x"),
    "btc_por_acao": ("BTC por ação", "Bitcoin em caixa / número de ações.", 1, "Cripto", "num_btc"),
    # bdr
    "bdr_preco_justo": ("Preço justo do BDR", "Preço no exterior x PTAX / proporção.", 0, "BDR", "moeda"),
    "bdr_agio": ("Ágio/deságio do BDR", "Preço do BDR / preço justo - 1. Positivo = ágio.", -1, "BDR", "pct"),
}

FATORES = {
    "valuation": ["tir_implicita", "earnings_yield", "pl_vs_media5", "evebitda_vs_media5", "pvp_vs_media5", "cresc_gap"],
    "qualidade": ["roic", "roe", "conversao_caixa", "diluicao_5a", "estab_margem"],
    "solidez": ["divliq_ebitda", "cobertura_juros", "liquidez_corrente", "pl_ativos"],
    "crescimento": ["cagr_receita_5a", "cagr_lucro_5a", "consist_receita", "consist_lucro", "cresc_lucro_ltm"],
    "proventos": ["dy", "dy_medio_5a", "anos_pagando", "dividendos_sobre_fcl"],
}
META["estab_margem"] = ("Estabilidade de margem", "Desvio padrão da margem líquida anual em 5 anos (menor = mais estável).", -1, "Eficiência", "pct")
META["piotroski"] = ("Qualidade contábil (Piotroski F-Score)", "Nove testes de qualidade contábil, último exercício contra o anterior: ROA positivo, FCO positivo, "
                     "ROA subindo, FCO acima do lucro, alavancagem caindo, liquidez corrente subindo, sem emissão de ações, "
                     "margem bruta subindo e giro do ativo subindo. Um ponto por teste; de 0 a 9.", 1, "Rentabilidade", "int")

PIOTROSKI_TESTES = {
    "roa_positivo": "ROA positivo", "fco_positivo": "Fluxo de caixa operacional positivo", "roa_subiu": "ROA maior que no ano anterior",
    "fco_maior_lucro": "Caixa operacional acima do lucro", "alavancagem_caiu": "Dívida sobre ativo menor que no ano anterior",
    "liquidez_subiu": "Liquidez corrente maior que no ano anterior", "sem_emissao": "Não emitiu ações no ano",
    "margem_bruta_subiu": "Margem bruta maior que no ano anterior", "giro_subiu": "Giro do ativo maior que no ano anterior",
}


def piotroski(atual: dict, anterior: dict, minimo_testes: int = 7):
    """Piotroski (2000), com dois exercícios anuais. Retorna (pontos, {teste: True/False/None}).
    Teste sem dado fica None e não pontua; com menos de `minimo_testes` avaliáveis o placar é None."""
    def g(d, k):
        v = d.get(k)
        return v if ok(v) else None

    def ativo(d):
        return div(g(d, "receita"), g(d, "giro_ativo")) if ok(g(d, "giro_ativo")) and d["giro_ativo"] > 0 else None

    def cmp(a, b, maior=True):
        if a is None or b is None:
            return None
        return a > b if maior else a < b

    roa_t, roa_a = g(atual, "roa"), g(anterior, "roa")
    fco, lucro = g(atual, "fco"), g(atual, "lucro_liq")
    at_t, at_a = ativo(atual), ativo(anterior)
    alav_t = div(g(atual, "divida_bruta") or 0.0, at_t) if at_t else None
    alav_a = div(g(anterior, "divida_bruta") or 0.0, at_a) if at_a else None
    ac_t, ac_a = g(atual, "acoes"), g(anterior, "acoes")
    t = {
        "roa_positivo": None if roa_t is None else roa_t > 0,
        "fco_positivo": None if fco is None else fco > 0,
        "roa_subiu": cmp(roa_t, roa_a),
        "fco_maior_lucro": cmp(fco, lucro),
        "alavancagem_caiu": None if alav_t is None or alav_a is None else (alav_t < alav_a or (alav_t == 0 and alav_a == 0)),
        "liquidez_subiu": cmp(g(atual, "liquidez_corrente"), g(anterior, "liquidez_corrente")),
        "sem_emissao": None if ac_t is None or ac_a is None else ac_t <= ac_a * 1.005,
        "margem_bruta_subiu": cmp(g(atual, "margem_bruta"), g(anterior, "margem_bruta")),
        "giro_subiu": cmp(g(atual, "giro_ativo"), g(anterior, "giro_ativo")),
    }
    avaliados = [v for v in t.values() if v is not None]
    if len(avaliados) < minimo_testes:
        return None, t
    return sum(1 for v in avaliados if v), t


def meta_json() -> dict:
    return {k: {"nome": v[0], "formula": v[1], "direcao": v[2], "grupo": v[3], "unidade": v[4]} for k, v in META.items()}


# ===================================================================== critérios ponderados
# (id, indicador, parâmetro desejável, importância de 1 a 5 estrelas). Fonte: tabela de critérios do usuário.
CRITERIOS = [
    ("roic", "ROIC", "Maior que o WACC, idealmente por mais de 3 pontos percentuais", 5),
    ("roe", "ROE", "Acima de 15% e superior ao custo do capital próprio", 5),
    ("divida", "Dívida líquida/EBITDA", "Abaixo de 2x", 5),
    ("margem_ebitda", "Margem EBITDA", "Superior à mediana do setor", 4),
    ("receita", "Crescimento da receita", "Acima da inflação em 5 anos", 4),
    ("lucro", "Crescimento do lucro", "Positivo e consistente em 5 anos", 5),
    ("fcl", "Fluxo de caixa livre", "Positivo e recorrente", 5),
    ("ev_ebitda", "EV/EBITDA", "Abaixo da mediana dos pares", 5),
    ("pl", "P/L", "Abaixo do justificável pelo crescimento (PEG até 1)", 4),
    ("cobertura", "Cobertura de juros", "EBIT/despesas de juros acima de 4x", 4),
]
NAO_SE_APLICA_FIN = {"roic", "divida", "margem_ebitda", "fcl", "ev_ebitda", "cobertura"}


def wacc(ke: Num, kd: Num, valor_mercado: Num, divida: Num, ir: float) -> Num:
    """WACC = E/(D+E) x Ke + D/(D+E) x Kd x (1 - IR)."""
    if not ok(ke, valor_mercado) or valor_mercado <= 0:
        return None
    d = divida if ok(divida) and divida > 0 else 0.0
    if d and not ok(kd):
        return None
    total = valor_mercado + d
    return valor_mercado / total * ke + (d / total * kd * (1 - ir) if d else 0.0)


def criterios(i: dict, mediana_grupo: dict, ke: Num, kd: Num, ir: float, inflacao: Num, financeira: bool) -> dict:
    """Avalia cada critério (True/False/None) e a nota ponderada de 0 a 10 sobre os critérios avaliados."""
    g = lambda k: i.get(k) if ok(i.get(k)) else None  # noqa: E731
    w = wacc(ke, kd, g("valor_mercado"), g("divida_bruta"), ir)
    sn = i.get("sinais") or {}
    peg, pl = g("peg"), g("pl")
    res = {
        "roic": None if g("roic") is None or w is None else g("roic") > w + 0.03,
        "roe": None if g("roe") is None else (g("roe") > 0.15 and (ke is None or g("roe") > ke)),
        "divida": None if g("ebitda") is None or g("divliq_ebitda") is None else (g("ebitda") > 0 and g("divliq_ebitda") < 2),
        "margem_ebitda": None if g("margem_ebitda") is None or not ok(mediana_grupo.get("margem_ebitda")) else g("margem_ebitda") > mediana_grupo["margem_ebitda"],
        "receita": None if g("cagr_receita_5a") is None or not ok(inflacao) else g("cagr_receita_5a") > inflacao,
        "lucro": None if g("cagr_lucro_5a") is None else (g("cagr_lucro_5a") > 0 and (g("consist_lucro") or 0) >= 3),
        "fcl": None if g("fcl") is None else (g("fcl") > 0 and (g("margem_fcl_5a") or 0) > 0 and not sn.get("fcl_negativo_anos")),
        "ev_ebitda": None if g("ev_ebitda") is None or not ok(mediana_grupo.get("ev_ebitda")) else (0 < g("ev_ebitda") < mediana_grupo["ev_ebitda"]),
        "pl": None if pl is None else (pl > 0 and ((0 < peg <= 1) if peg is not None else (ok(mediana_grupo.get("pl")) and pl < mediana_grupo["pl"]))),
        "cobertura": None if g("cobertura_juros") is None else g("cobertura_juros") > 4,
    }
    if financeira:
        for k in NAO_SE_APLICA_FIN:
            res[k] = None
    peso = {c[0]: c[3] for c in CRITERIOS}
    avaliados = [k for k, v in res.items() if v is not None]
    total = sum(peso[k] for k in avaliados)
    nota = 10 * sum(peso[k] for k in avaliados if res[k]) / total if total else None
    return {"nota": nota, "testes": res, "avaliados": len(avaliados), "wacc": w}


META["nota_criterios"] = ("Nota por critérios", "Soma das estrelas dos critérios atendidos / soma das estrelas dos critérios avaliados, de 0 a 10. "
                          "Critérios: ROIC acima do WACC + 3 p.p., ROE acima de 15% e do custo do capital, dívida líquida/EBITDA abaixo de 2x, "
                          "margem EBITDA acima do setor, receita crescendo acima da inflação, lucro crescendo em 5 anos, FCL positivo e recorrente, "
                          "EV/EBITDA abaixo dos pares, PEG até 1 e cobertura de juros acima de 4x.", 1, "Rentabilidade", "x")
META["wacc"] = ("WACC", "Custo médio ponderado de capital: E/(D+E) x custo do capital próprio + D/(D+E) x custo da dívida x (1 - IR). "
                "Custo da dívida: Selic (Brasil) ou Treasury 10 anos (exterior) + 2%.", 0, "TIR", "pct")


# ===================================================================== participação estatal
_ESTATAL = re.compile(r"\buni[aã]o\b|\bestado d[eo]\b|\bgoverno d|minist[eé]rio|tesouro nacional|caixa econ[oô]mica|"
                      r"banco do brasil|petrobras|\bbndes|prefeitura|\bmunic[ií]pio d", re.I)


def controlador_estatal(controladores: list) -> Optional[str]:
    """Nome do primeiro controlador que é ente público ou estatal (Formulário de Referência), ou None."""
    for c in controladores or []:
        nome = c.get("nome", "") if isinstance(c, dict) else str(c)
        if _ESTATAL.search(nome):
            return nome
    return None


# ===================================================================== resultados trimestrais
CONTAS_TRI = ("receita", "rec_interm", "ebit", "da", "lucro_liq", "fco", "capex")


def rotulo_trimestre(fim: str) -> str:
    """'2026-09-30' -> '3T26' (trimestre do calendário da data de encerramento)."""
    return f"{(int(fim[5:7]) - 1) // 3 + 1}T{fim[2:4]}"


def serie_trimestral(q: dict, n: int = 9) -> list:
    """q = {conta: {data_fim: valor do trimestre isolado}}. Devolve os últimos n trimestres com EBITDA e margens."""
    fins = sorted({f for c in CONTAS_TRI for f in (q.get(c) or {})})[-n:]
    out = []
    for f in fins:
        v = {c: (q.get(c) or {}).get(f) for c in CONTAS_TRI}
        if v["lucro_liq"] is None and v["receita"] is None:
            continue
        ebitda = v["ebit"] + abs(v["da"]) if ok(v["ebit"], v["da"]) else None
        rec = v["receita"]
        out.append({"fim": f, "rotulo": rotulo_trimestre(f), "receita": rec, "rec_interm": v["rec_interm"], "ebitda": ebitda,
                    "ebit": v["ebit"], "lucro_liq": v["lucro_liq"], "fco": v["fco"],
                    "margem_ebitda": div(ebitda, rec) if ok(rec) and rec > 0 else None,
                    "margem_liquida": div(v["lucro_liq"], rec) if ok(rec) and rec > 0 else None})
    return out


def trimestres_por_diferenca(acumulados: dict) -> dict:
    """acumulados = {data_fim: (data_inicio_exercicio, {conta: acumulado no exercício})}.
    Trimestre isolado = acumulado - acumulado anterior do mesmo exercício; o 1º trimestre é o próprio acumulado.
    Só aceita intervalos de 80 a 100 dias (descarta buracos na série)."""
    from datetime import date
    d = lambda s: date.fromisoformat(str(s)[:10])  # noqa: E731
    por_ini = {}
    for fim, (ini, v) in acumulados.items():
        por_ini.setdefault(str(ini)[:10], []).append((str(fim)[:10], v))
    q = {c: {} for c in CONTAS_TRI}
    for ini, lst in por_ini.items():
        lst.sort()
        ant_fim, ant_v = None, None
        for fim, v in lst:
            dias = (d(fim) - (d(ant_fim) if ant_fim else d(ini))).days + (0 if ant_fim else 1)
            if 80 <= dias <= 100:
                for c in CONTAS_TRI:
                    a = v.get(c)
                    if a is None:
                        continue
                    if ant_fim is None:
                        q[c][fim] = a
                    elif ant_v.get(c) is not None:
                        q[c][fim] = a - ant_v[c]
            ant_fim, ant_v = fim, v
    return q


# ===================================================================== agenda de resultados
def proxima_divulgacao(entregas: list, hoje: str) -> dict:
    """entregas = [(data_fim_periodo, 'ITR' ou 'DFP', data_entrega_cvm, link)]. Devolve a última divulgação e a estimativa da próxima.
    Estimativa: a data de entrega do mesmo período no ano anterior + 1 ano, limitada ao prazo legal
    (ITR: 45 dias após o fim do trimestre; DFP: 3 meses após o fim do exercício)."""
    from datetime import date, timedelta
    d = lambda s: date.fromisoformat(str(s)[:10])  # noqa: E731
    ent = sorted({(str(a)[:10], c, str(r)[:10], l) for a, c, r, l in entregas if a and r}, key=lambda x: (x[0], x[2]))
    if not ent:
        return {}
    ult = max(ent, key=lambda x: (x[0], x[2]))
    fim_ult = d(ult[0])
    # fim do próximo período: 3 meses depois do último
    m = fim_ult.month + 3
    ano = fim_ult.year + (m - 1) // 12
    m = (m - 1) % 12 + 1
    prox_fim = (date(ano + (m == 12), (m % 12) + 1, 1) - timedelta(days=1))
    meses_dfp = {d(a).month for a, c, _, _ in ent if c == "DFP"}
    doc = "DFP" if prox_fim.month in meses_dfp else "ITR"
    prazo = prox_fim + timedelta(days=45)
    if doc == "DFP":   # último dia do terceiro mês após o fim do exercício
        mm = prox_fim.month + 3
        prazo = date(prox_fim.year + (mm - 1) // 12, (mm - 1) % 12 + 1, 1)
        prazo = date(prazo.year + (prazo.month == 12), prazo.month % 12 + 1, 1) - timedelta(days=1)
    antes = [x for x in ent if x[0][5:] == prox_fim.isoformat()[5:] and d(x[0]).year == prox_fim.year - 1]
    if antes:
        base = d(antes[-1][2])
        try:
            estimada = base.replace(year=base.year + 1)
        except ValueError:
            estimada = base + timedelta(days=365)
        while estimada.weekday() >= 5:
            estimada += timedelta(days=1)
        estimada = min(estimada, prazo)
        criterio = f"mesmo período do ano anterior, entregue em {base.strftime('%d/%m/%Y')}"
    else:
        estimada, criterio = prazo, "prazo legal da CVM"
    return {"ultima": {"fim": ult[0], "doc": ult[1], "entrega": ult[2], "link": ult[3], "rotulo": rotulo_trimestre(ult[0]) if ult[1] == "ITR" else f"4T{ult[0][2:4]}"},
            "proxima": {"fim": prox_fim.isoformat(), "doc": doc, "rotulo": rotulo_trimestre(prox_fim.isoformat()) if doc == "ITR" else f"4T{prox_fim.isoformat()[2:4]}",
                        "data": estimada.isoformat(), "prazo_legal": prazo.isoformat(), "criterio": criterio,
                        "passou": estimada.isoformat() < hoje}}


# ===================================================================== posição vendida (aluguel de ações)
def posicao_vendida(qtd_alugada: Num, valor_alugado: Num, acoes_classe: Num, free_float: Num, volume_medio_rs: Num) -> dict:
    """Ações em empréstimo (proxy da posição vendida no Brasil) sobre o free float da classe e dias para zerar a posição
    com o volume financeiro médio diário. free_float em fração (0.7 = 70%)."""
    ff_acoes = acoes_classe * free_float if ok(acoes_classe, free_float) and acoes_classe > 0 and free_float > 0 else None
    return {
        "pct_free_float": div(qtd_alugada, ff_acoes) if ff_acoes else None,
        "pct_classe": div(qtd_alugada, acoes_classe) if ok(acoes_classe) and acoes_classe > 0 else None,
        "dias_para_cobrir": div(valor_alugado, volume_medio_rs) if ok(volume_medio_rs) and volume_medio_rs > 0 else None,
    }
META["aluguel_valor"] = ("Posição vendida em R$", "Valor das ações em aberto no aluguel (empréstimo de ativos) na B3, último pregão.", 0, "Posição vendida", "moeda_grande_brl")
META["aluguel_pct_ff"] = ("Posição vendida sobre o free float", "Ações em aberto no aluguel / (ações da classe x free float do Formulário de Referência). "
                          "Em PNA e PNB usa o total de preferenciais; em units, o total de ações dividido pela composição da unit.", 0, "Posição vendida", "pct")
META["aluguel_dias"] = ("Dias para cobrir", "Valor da posição em aberto no aluguel / volume financeiro médio diário de 21 pregões.", 0, "Posição vendida", "x")


# ===================================================================== notícias financeiras
TERMOS_FINANCEIROS = re.compile(
    r"lucr|preju[ií]zo|resultado|receita|faturamento|ebitda|margem|balan[cç]o|trimestr|\b[1-4]t\d{2}\b|dividend|\bjcp\b|juros sobre capital|provent|"
    r"a[cç][aã]o da|na bolsa|bolsa de valores|ibovespa|cota[cç][aã]o|valor de mercado|recompra|deb[eê]nture|d[ií]vida|alavancagem|rating|capta[cç][aã]o|"
    r"aquisi[cç][aã]o|aquire|compra d[aeo]|venda d[aeo]|fus[aã]o|incorpora[cç][aã]o|oferta|follow-on|\bipo\b|\bopa\b|guidance|proje[cç][aã]o|"
    r"pre[cç]o-alvo|recomenda|rebaix|eleva|investimento|capex|patrim[oô]nio|caixa|fato relevante|acionista|controlador|conselho|ceo|diretor|"
    r"privatiza|concess[aã]o|leil[aã]o|tarifa|reajuste|produ[cç][aã]o|vendas|recupera[cç][aã]o judicial|recupera[cç][aã]o extrajudicial|"
    r"earnings|revenue|profit|loss|shares|stock|dividend|guidance|quarter|buyback|acquisition|merger|debt|outlook|forecast|analyst|price target", re.I)
VEICULOS_FINANCEIROS = re.compile(
    r"valor|infomoney|money times|exame|brazil journal|seu dinheiro|e-investidor|estad[aã]o|suno|bp money|bpmoney|investing|bloomberg|reuters|"
    r"cnn brasil|neofeed|pipeline|investidor10|trademap|bora investir|space money|advfn|times brasil|mover|forbes|financial times|wall street|"
    r"cnbc|barron|marketwatch|yahoo finance|motley|seeking alpha|veja|folha|o globo|isto[eé] dinheiro|monitor mercantil|poder360|metr[oó]poles|"
    r"capital aberto|eu quero investir|genial|xp investimentos|btg|nord|empiricus|the cap|inteligencia financeira|melhor investimento|visno", re.I)
FORA_DE_PAUTA = re.compile(r"outros destaques|destaques do dia|resumo do dia|educa[cç][aã]o ambiental|servi[cç]os gratuitos|a[cç][aã]o social|voluntari|mutir[aã]o|est[aá]gio|vagas|emprego|concurso|trainee|bolsa aux|ao vivo|futebol|campeonato|copa do mundo|liga das na[cç][oõ]es|\bx\b.*\bao vivo\b|novela|teatro|show|festival|anivers[aá]rio|"
                           r"receita de bolo|hor[oó]scopo|celebridade|bbb|carnaval", re.I)


def noticia_financeira(titulo: str, veiculo: str, nome: str, ticker: str) -> bool:
    """Mantém só notícias sobre o negócio e o resultado da empresa.
    Título com o ticker passa sempre. Sem o ticker, o título precisa citar a empresa (com maiúsculas, fora de "ao vivo")
    e ter um termo financeiro, ou vir de veículo especializado em mercado; temas fora de pauta são descartados."""
    t = titulo or ""
    if re.search(rf"\b{re.escape(ticker)}\b", t) or (len(ticker) >= 5 and re.search(rf"\b{re.escape(ticker[:4])}\d{{1,2}}\b", t)):
        return True
    if FORA_DE_PAUTA.search(t):
        return False
    curto = re.split(r"\s+(?:s\.?a\.?|holding|holdings|inc|corp|n\.v\.|pn|on)\b", nome, flags=re.I)[0].strip()
    if curto.upper() in {"B3"}:                          # nome igual ao da bolsa: só com o ticker no título
        return False
    alvo = nome if len(curto) <= 3 else curto          # nomes curtos (Nu) exigem o nome completo
    cita_nome = bool(re.search(rf"(?<![Aa][Oo] )(?<!AO )\b{re.escape(alvo)}\b", t))
    if not cita_nome:
        return False
    return bool(TERMOS_FINANCEIROS.search(t)) or bool(VEICULOS_FINANCEIROS.search(veiculo or ""))


# ---------------------------------------------------------------- idioma do título
_EN = set("the and of to for in on with is are was were its from by at as an this that how why what who will vs after over into new stock stocks shares earnings revenue profit call highlights quarter retirees better buy sell rating price target says said".split())
_PT = set("de da do das dos e em no na nos nas para com que os as um uma por ao aos sobre após ações ação lucro receita dividendos resultado trimestre bolsa veja diz alta queda sobe cai mais seu sua não".split())


def eh_ingles(titulo: str) -> bool:
    """Título em inglês? Conta palavras típicas de cada língua; acentos e cedilha contam como português."""
    t = (titulo or "").lower()
    if re.search(r"[ãõçáéíóúâêô]", t):
        return False
    ws = re.findall(r"[a-z']+", t)
    en, pt = sum(w in _EN for w in ws), sum(w in _PT for w in ws)
    return en > pt


# ---------------------------------------------------------------- notícias repetidas
_PALAVRAS_VAZIAS = set("""a o as os de da do das dos e em no na nos nas um uma para por com sem que se ao aos sua seu suas seus mais
menos sobre apos ate entre como diz the of and to in for on with its at by from is are as after acoes acao empresa companhia
bolsa hoje agora ser tem veja eleva sobe sobem cai caem alta queda diz ve entenda saiba noticia atualizacao""".split())
_SINONIMOS = {"prove": "divid", "jcp": "divid", "remun": "divid", "lucra": "lucro"}


def _radicais(titulo: str, ignorar: Iterable[str] = ()) -> set:
    import unicodedata
    t = unicodedata.normalize("NFKD", (titulo or "").lower()).encode("ascii", "ignore").decode()
    ign = {w for x in ignorar for w in re.findall(r"[a-z0-9]+", unicodedata.normalize("NFKD", (x or "").lower()).encode("ascii", "ignore").decode())}
    return {_SINONIMOS.get(w[:5], w[:5]) for w in re.findall(r"[a-z0-9]+", t) if len(w) >= 3 and w not in _PALAVRAS_VAZIAS and w not in ign}


def mesma_noticia(a: str, b: str, ignorar: Iterable[str] = (), mesmo_dia: bool = False) -> bool:
    """Dois títulos contam o mesmo fato: dividem 3 ou mais palavras relevantes (fora nome e ticker da empresa),
    2 se saíram no mesmo dia, ou metade das palavras do título mais curto."""
    pa, pb = (set(m.upper().replace("Q", "T") for m in re.findall(r"\b[1-4][TQ]\d{2}\b", x or "", re.I)) for x in (a, b))
    if pa and pb and not pa & pb:          # trimestres diferentes nunca são o mesmo fato
        return False
    ra, rb = _radicais(a, ignorar), _radicais(b, ignorar)
    if not ra or not rb:
        return False
    comum = len(ra & rb)
    return comum >= (2 if mesmo_dia else 3) or comum >= max(2, min(len(ra), len(rb)) / 2)


def sem_repeticao(itens: list, ignorar: Iterable[str] = (), dias: int = 4) -> list:
    """Mantém uma notícia por fato: percorre da mais nova para a mais antiga e descarta a que repete
    uma já mantida publicada até `dias` antes ou depois."""
    from datetime import datetime
    def quando(x):
        try:
            return datetime.fromisoformat(str(x.get("data"))[:10])
        except Exception:
            return None
    ignorar = list(ignorar)
    out = []
    for x in sorted(itens, key=lambda x: str(x.get("data") or ""), reverse=True):
        dx = quando(x)
        def perto(y, lim):
            return dx is None or quando(y) is None or abs((quando(y) - dx).days) <= lim
        repete = any(perto(y, dias) and mesma_noticia(x.get("titulo", ""), y.get("titulo", ""), ignorar + list(y.get("tickers") or []),
                                                     mesmo_dia=dx is not None and quando(y) is not None and perto(y, 1)) for y in out)
        if not repete:
            out.append(x)
    return out


# ---------------------------------------------------------------- comunicados de relações com investidores
_RI_RELEASE = re.compile(r"release|resultado|earnings|desempenho|demonstra[cç][oõ]es financeiras|\bitr\b|\bdfp\b|informa[cç][oõ]es trimestrais", re.I)
_RI_APRESENTACAO = re.compile(r"apresenta[cç][aã]o.*(resultado|\d\s?t\s?\d{2})|videoconfer[eê]ncia.*resultado|teleconfer[eê]ncia.*resultado|webcast", re.I)
_RI_INGLES = re.compile(r"\b[1-4]Q\d{2}\b|\b(the|of|regarding|shares|treasury|information|material fact|notice|version|cancellation|financial statements|results presentation)\b", re.I)
_RI_FORA = re.compile(r"ingl[eê]s|english|vers[aã]o em|agente fiduci|rating|calend[aá]rio|agenda de divulga", re.I)


def comunicado_ri(categoria: str, titulo: str):
    """Classifica um documento entregue à CVM no que interessa ao investidor: 'Fato relevante',
    'Resultado' (release e demonstrações) ou 'Apresentação de resultados'. Devolve None para o resto."""
    c, t = (categoria or "").lower(), titulo or ""
    if _RI_FORA.search(t) or _RI_INGLES.search(t):
        return None
    if c.startswith("fato relevante"):
        return "Fato relevante"
    if _RI_APRESENTACAO.search(t):
        return "Apresentação de resultados"
    if (c.startswith("resultado") or c.startswith("dados econ")) and _RI_RELEASE.search(t):
        return "Resultado"
    return None
