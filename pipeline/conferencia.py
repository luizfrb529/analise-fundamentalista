"""
Conferência independente dos indicadores contra o balanço oficial.

Para cada ativo, lê as linhas CRUAS da CVM (CSV do ITR/DFP, por código de conta) ou da SEC (fatos XBRL
por formulário), monta o LTM à mão, recalcula os indicadores e compara com data/fundamentals.json.
Também traz o yfinance como terceira referência (agregador, não é fonte primária).

Uso: .venv\\Scripts\\python pipeline\\conferencia.py   ->   relatorios/conferencia_fase1.md
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cvm  # noqa: E402  (só para normalizar texto e escala)
import sources as S  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
CACHE = RAIZ / "pipeline" / ".cache"
FUND = json.loads((RAIZ / "data" / "fundamentals.json").read_text(encoding="utf-8"))
PRICES = json.loads((RAIZ / "data" / "prices.json").read_text(encoding="utf-8"))
UNIV = {a["ticker"]: a for a in json.loads((RAIZ / "data" / "universe.json").read_text(encoding="utf-8"))}
OUT = []


def p(s=""):
    OUT.append(s)


def bi(v):
    return "n/d" if v is None else f"{v / 1e9:,.3f}".replace(",", "X").replace(".", ",").replace("X", ".")


def num(v, d=2):
    return "n/d" if v is None else f"{v:,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def pct(v):
    return "n/d" if v is None else num(v * 100, 1) + "%"


def raw(doc, ano, tab, cd):
    f = CACHE / f"cvm_{doc}_{ano}" / f"{doc.lower()}_cia_aberta_{tab}_con.csv"
    d = cvm.preparar(pd.read_csv(f, dtype=str))
    return d[d.cd == cd]


def linha(d, dref, ordem, codigo, ini=None):
    x = d[(d.DT_REFER == dref) & (d.ordem == ordem) & (d.CD_CONTA == codigo)]
    if ini:
        x = x[x.DT_INI_EXERC == ini]
    if x.empty:
        return None, ""
    return float(x.v.iloc[0]), x.DS_CONTA.iloc[0]


def status(a, b, tol=0.01):
    if a is None or b is None:
        return "sem comparação"
    if b == 0:
        return "ok" if abs(a) < 1e-9 else "DIVERGE"
    return "ok" if abs(a / b - 1) <= tol else f"DIVERGE ({pct(a / b - 1)})"


def yf_info(tk):
    try:
        import yfinance as yf
        return yf.Ticker(tk).info or {}
    except Exception:
        return {}


def tabela(linhas):
    p("| Indicador | Site (pipeline) | Recalculado da fonte | yfinance (referência) | Status vs fonte |")
    p("|---|---|---|---|---|")
    for nome, site, fonte, yfv, fmt in linhas:
        f = fmt or (lambda v: num(v))
        p(f"| {nome} | {f(site)} | {f(fonte)} | {f(yfv) if yfv is not None else 'n/d'} | {status(site, fonte)} |")
    p()


def conf_br(t, contas_dre):
    a, f = UNIV[t], FUND[t]
    cd = f["cd_cvm"]
    ind = f["ind"]
    dref = f["data_balanco"]
    ano = int(dref[:4])
    p(f"## {t} | {a['nome']} (CVM {cd}, balanço {dref})\n")
    itr = {tab: raw("ITR", ano, tab, cd) for tab in ("DRE", "BPA", "BPP", "DFC_MI")}
    dfp = {tab: raw("DFP", ano - 1, tab, cd) for tab in ("DRE", "BPA", "BPP", "DFC_MI")}
    ini, ini_ant = f"{ano}-01-01", f"{ano - 1}-01-01"
    fy = f"{ano - 1}-12-31"
    p("Linhas cruas usadas (valores em R$ mil convertidos para R$ bi; LTM = exercício anterior + acumulado do ano - acumulado do ano anterior):\n")
    p("| Conta | Descrição | Exercício " + str(ano - 1) + " | Acum. " + dref[:7] + " | Acum. mesmo período " + str(ano - 1) + " | LTM |")
    p("|---|---|---|---|---|---|")
    ltm = {}
    for chave, cod in contas_dre:
        vfy, ds = linha(dfp["DRE"], fy, "U", cod, ini_ant)
        vy, _ = linha(itr["DRE"], dref, "U", cod, ini)
        vp, _ = linha(itr["DRE"], dref, "P", cod, ini_ant)
        lt = vfy + vy - vp if None not in (vfy, vy, vp) else None
        ltm[chave] = lt
        p(f"| {cod} | {ds} | {bi(vfy)} | {bi(vy)} | {bi(vp)} | {bi(lt)} |")
    p()
    return itr, ltm, dref, ind


def bal(itr, dref, tab, cod):
    v, ds = linha(itr[tab], dref, "U", cod)
    return v, ds


def conf_itub():
    t = "ITUB4"
    itr, ltm, dref, ind = conf_br(t, [("lucro_controlador", "3.09.01"), ("lucro_consolidado", "3.09"), ("receitas_interm", "3.01")])
    pl_tot, _ = bal(itr, dref, "BPP", "2.08")
    mino = itr["BPP"][(itr["BPP"].DT_REFER == dref) & (itr["BPP"].ordem == "U") & itr["BPP"].ds.str.contains("nao controladores")].v
    mino = float(mino.iloc[0]) if len(mino) else 0.0
    pl = pl_tot - mino
    ativo, _ = bal(itr, dref, "BPA", "1")
    p(f"Balanço em {dref}: PL consolidado (2.08) {bi(pl_tot)} bi, minoritários {bi(mino)} bi, PL dos controladores {bi(pl)} bi, ativo total (1) {bi(ativo)} bi.\n")
    vm = ind["valor_mercado"]
    partes = FUND[t]["valor_mercado_partes"]
    p("Valor de mercado: " + " + ".join(f"{x['ticker']} R$ {num(x['preco'])} x {num(x['acoes'] / 1e9, 4)} bi ações" for x in partes) + f" = R$ {bi(vm)} bi.\n")
    info = yf_info("ITUB4.SA")
    tabela([
        ("Lucro LTM controladores (R$ bi)", (vm / ind["pl"]) if ind.get("pl") else None, ltm["lucro_controlador"], None, lambda v: bi(v) if v else "n/d"),
        ("P/L", ind["pl"], vm / ltm["lucro_controlador"], info.get("trailingPE"), None),
        ("P/VP", ind["pvp"], vm / pl, info.get("priceToBook"), None),
        ("ROE", ind["roe"], ltm["lucro_controlador"] / pl, info.get("returnOnEquity"), pct),
        ("Margem líquida (sobre receitas da intermediação)", ind["margem_liquida"], ltm["lucro_controlador"] / ltm["receitas_interm"], None, pct),
        ("LPA (R$)", ind["lpa"], ltm["lucro_controlador"] / ind["acoes"], info.get("trailingEps"), None),
        ("DY 12m", ind["dy"], ind["dpa_12m"] / PRICES[t]["preco"], (info.get("trailingAnnualDividendYield")), pct),
    ])
    p("Observação: o yfinance usa outra contagem de ações e lucro (pode incluir ajustes); serve só como ordem de grandeza.\n")


def conf_taee():
    t = "TAEE11"
    itr, ltm, dref, ind = conf_br(t, [("receita", "3.01"), ("ebit", "3.05"), ("lucro", "3.11"), ("desp_fin", "3.06.02")])
    pl, _ = bal(itr, dref, "BPP", "2.03")
    cx, _ = bal(itr, dref, "BPA", "1.01.01")
    apl, _ = bal(itr, dref, "BPA", "1.01.02")
    dcp, _ = bal(itr, dref, "BPP", "2.01.04")
    dlp, _ = bal(itr, dref, "BPP", "2.02.01")
    vm = FUND[t]["ind"]["valor_mercado"]
    dl = (dcp or 0) + (dlp or 0) - (cx or 0) - (apl or 0)
    # D&A da DFC (acumulados) para o EBITDA
    dfc = itr["DFC_MI"]
    dfp_dfc = raw("DFP", int(dref[:4]) - 1, "DFC_MI", FUND[t]["cd_cvm"])
    def da(d, dr, o, ini):
        x = d[(d.DT_REFER == dr) & (d.ordem == o) & (d.DT_INI_EXERC == ini) & d.CD_CONTA.str.startswith("6.01") & d.ds.str.contains("deprecia|amortiza")]
        x = x[~x.ds.str.contains("custo|captac|emprestimo|juros|debenture")]
        return float(x.v.sum())
    ano = int(dref[:4])
    da_ltm = da(dfp_dfc, f"{ano - 1}-12-31", "U", f"{ano - 1}-01-01") + da(dfc, dref, "U", f"{ano}-01-01") - da(dfc, dref, "P", f"{ano - 1}-01-01")
    ebitda = ltm["ebit"] + da_ltm
    ev = vm + dl
    p(f"Balanço em {dref}: PL (2.03) {bi(pl)} bi; caixa (1.01.01) {bi(cx)} + aplicações (1.01.02) {bi(apl)}; empréstimos CP (2.01.04) {bi(dcp)} e LP (2.02.01) {bi(dlp)}; dívida líquida {bi(dl)} bi; D&A LTM (DFC) {bi(da_ltm)} bi.\n")
    p(f"Unit TAEE11 = 1 ON + 2 PN. Valor de mercado = TAEE3 x ON + TAEE4 x PN = R$ {bi(vm)} bi.\n")
    info = yf_info("TAEE11.SA")
    i = FUND[t]["ind"]
    tabela([
        ("P/L", i["pl"], vm / ltm["lucro"], info.get("trailingPE"), None),
        ("P/VP", i["pvp"], vm / pl, info.get("priceToBook"), None),
        ("EV/EBITDA", i["ev_ebitda"], ev / ebitda, info.get("enterpriseToEbitda"), None),
        ("Dív. líq./EBITDA", i["divliq_ebitda"], dl / ebitda, None, None),
        ("Margem EBIT", i["margem_ebit"], ltm["ebit"] / ltm["receita"], info.get("operatingMargins"), pct),
        ("ROE", i["roe"], ltm["lucro"] / pl, info.get("returnOnEquity"), pct),
        ("Cobertura de juros", i["cobertura_juros"], ltm["ebit"] / abs(ltm["desp_fin"]), None, None),
        ("LPA por unit (R$)", i["lpa"], ltm["lucro"] / i["acoes"] * 3, None, None),
    ])
    p("Observação: a margem e o EBITDA de transmissoras em IFRS incluem a receita de remuneração do ativo de contrato (correção monetária), por isso diferem do EBITDA regulatório divulgado no release.\n")


def conf_cury():
    t = "CURY3"
    itr, ltm, dref, ind = conf_br(t, [("receita", "3.01"), ("lucro_bruto", "3.03"), ("ebit", "3.05"), ("lucro_ctrl", "3.11.01"), ("lucro", "3.11")])
    lucro = ltm["lucro_ctrl"] if ltm["lucro_ctrl"] else ltm["lucro"]
    pl_tot, _ = bal(itr, dref, "BPP", "2.03")
    x = itr["BPP"][(itr["BPP"].DT_REFER == dref) & (itr["BPP"].ordem == "U") & itr["BPP"].ds.str.contains("nao controladores")]
    mino = float(x.v.iloc[0]) if len(x) else 0.0
    pl = pl_tot - mino
    vm = FUND[t]["ind"]["valor_mercado"]
    i = FUND[t]["ind"]
    info = yf_info("CURY3.SA")
    p(f"Balanço em {dref}: PL consolidado {bi(pl_tot)} bi, minoritários {bi(mino)} bi, PL controladores {bi(pl)} bi.\n")
    tabela([
        ("P/L", i["pl"], vm / lucro, info.get("trailingPE"), None),
        ("P/VP", i["pvp"], vm / pl, info.get("priceToBook"), None),
        ("ROE", i["roe"], lucro / pl, info.get("returnOnEquity"), pct),
        ("Margem bruta", i["margem_bruta"], ltm["lucro_bruto"] / ltm["receita"], info.get("grossMargins"), pct),
        ("Margem líquida", i["margem_liquida"], lucro / ltm["receita"], info.get("profitMargins"), pct),
        ("DY 12m", i["dy"], i["dpa_12m"] / PRICES[t]["preco"], info.get("trailingAnnualDividendYield"), pct),
    ])


def conf_bhia():
    t = "BHIA3"
    itr, ltm, dref, ind = conf_br(t, [("receita", "3.01"), ("ebit", "3.05"), ("lucro", "3.11")])
    pl, ds = bal(itr, dref, "BPP", "2.03")
    i = FUND[t]["ind"]
    vm = i["valor_mercado"]
    info = yf_info("BHIA3.SA")
    p(f"Balanço em {dref} (o ITR do 3T26 não estava na base da CVM na data da conferência): PL ({ds}) {bi(pl)} bi.\n")
    tabela([
        ("Lucro LTM (R$ bi)", i["margem_liquida"] * ltm["receita"] if i.get("margem_liquida") else None, ltm["lucro"], None, lambda v: bi(v) if v else "n/d"),
        ("Margem líquida", i["margem_liquida"], ltm["lucro"] / ltm["receita"], info.get("profitMargins"), pct),
        ("Margem EBIT", i["margem_ebit"], ltm["ebit"] / ltm["receita"], info.get("operatingMargins"), pct),
        ("Valor de mercado (R$ bi)", vm, PRICES[t]["preco"] * i["acoes"], info.get("marketCap"), lambda v: bi(v) if v else "n/d"),
    ])
    p("P/L, P/VP e TIR não se aplicam: lucro e patrimônio negativos, modelo DISTRESSED. O site suprime múltiplos e TIR como sinal de preço baixo.\n")


def conf_msft():
    t = "MSFT34"
    i = FUND[t]["ind"]
    facts = S.sec_companyfacts(FUND[t]["cik"])
    g = facts["facts"]["us-gaap"]
    p(f"## {t} | Microsoft (SEC CIK {FUND[t]['cik']}, balanço {FUND[t]['data_balanco']})\n")
    p("Lucro líquido por trimestre (NetIncomeLoss), derivado dos 10-Q e do 10-K:\n")
    p("| Fim | Duração | Formulário | Valor (US$ bi) |")
    p("|---|---|---|---|")
    ent = [x for x in g["NetIncomeLoss"]["units"]["USD"] if x.get("start") and x["end"] > "2025-06-01"]
    vistos = {}
    for x in sorted(ent, key=lambda x: (x["end"], x["filed"])):
        dias = (pd.Timestamp(x["end"]) - pd.Timestamp(x["start"])).days
        vistos[(x["start"], x["end"])] = (dias, x["form"], x["val"])
    for (s, e), (dias, form, v) in sorted(vistos.items(), key=lambda k: k[0][1]):
        p(f"| {e} | {dias} dias (desde {s}) | {form} | {bi(v)} |")
    q = {e: v for (s, e), (dias, form, v) in vistos.items() if 80 <= dias <= 100}
    fy = {e: v for (s, e), (dias, form, v) in vistos.items() if 350 <= dias <= 380}
    nove = {e: v for (s, e), (dias, form, v) in vistos.items() if 260 <= dias <= 290}
    # Q4 FY2026 = FY2026 - 9M
    if "2026-06-30" in fy:
        n9 = [v for e, v in nove.items() if e == "2026-03-31"]
        if n9:
            q["2026-06-30"] = fy["2026-06-30"] - n9[0]
    ult4 = sorted(q)[-4:]
    lucro = sum(q[e] for e in ult4)
    p(f"\nLTM = soma dos trimestres {', '.join(ult4)} = US$ {bi(lucro)} bi (o 4º tri fiscal = 10-K anual - 9 meses do 10-Q).\n")
    eq = max((x for x in g["StockholdersEquity"]["units"]["USD"]), key=lambda x: (x["end"], x["filed"]))
    sh = max((x for x in facts["facts"]["dei"]["EntityCommonStockSharesOutstanding"]["units"]["shares"]), key=lambda x: (x["end"], x["filed"]))
    preco = FUND[t]["bdr"]["preco_exterior"]
    vm = preco * sh["val"]
    p(f"PL (StockholdersEquity, {eq['end']}, {eq['form']}) US$ {bi(eq['val'])} bi; ações (dei, {sh['end']}) {num(sh['val'] / 1e9, 4)} bi; preço MSFT US$ {num(preco)}; valor de mercado US$ {bi(vm)} bi.\n")
    info = yf_info("MSFT")
    tabela([
        ("P/L", i["pl"], vm / lucro, info.get("trailingPE"), None),
        ("P/VP", i["pvp"], vm / eq["val"], info.get("priceToBook"), None),
        ("ROE", i["roe"], lucro / eq["val"], info.get("returnOnEquity"), pct),
        ("LPA (US$)", i["lpa"], lucro / sh["val"], info.get("trailingEps"), None),
        ("DY 12m", i["dy"], i["dpa_12m"] / preco, info.get("trailingAnnualDividendYield"), pct),
    ])
    b = FUND[t]["bdr"]
    justo = b["preco_exterior"] * b["ptax"] / b["proporcao"]
    tabela([
        ("Preço justo do BDR (R$)", b["preco_justo"], justo, None, None),
        ("Ágio do BDR", b["agio"], PRICES[t]["preco"] / justo - 1, None, pct),
    ])
    p("Observação: o ROE do yfinance usa PL médio; o site usa PL do fim do período, por isso a diferença.\n")


def main():
    meta = json.loads((RAIZ / "data" / "meta.json").read_text(encoding="utf-8"))
    p("# Conferência da Fase 1: indicadores x balanço oficial\n")
    p(f"Preços de fechamento de {meta['data_fechamento']} | Balanços até o {meta['balancos_ate']}.\n")
    p("Método: as linhas são lidas direto do CSV da CVM (por código de conta) ou dos fatos XBRL da SEC, sem passar pelo parser do pipeline. "
      "O LTM é refeito à mão e os indicadores recalculados. 'Status vs fonte' = ok quando a diferença é de até 1%. "
      "A coluna do yfinance é só referência externa (agregador com metodologia própria e às vezes defasado).\n")
    for fn in (conf_itub, conf_taee, conf_cury, conf_msft, conf_bhia):
        try:
            fn()
        except Exception as e:
            p(f"\nFalha na conferência ({fn.__name__}): {e}\n")
    (RAIZ / "relatorios").mkdir(exist_ok=True)
    (RAIZ / "relatorios" / "conferencia_fase1.md").write_text("\n".join(OUT), encoding="utf-8")
    print("\n".join(OUT))


if __name__ == "__main__":
    main()
