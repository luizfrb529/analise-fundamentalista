"""
Fundamentos de empresas no exterior a partir do SEC EDGAR companyfacts (XBRL).
Gera os mesmos campos usados pela CVM (receita, ebit, lucro_liq, fco, capex, pl, ...), em dólar.

Fluxos: trimestres derivados por diferença dos acumulados (10-Q traz 3M/6M/9M, 10-K traz 12M).
LTM = soma dos 4 últimos trimestres. Saldos: último balanço.
Empresas que só entregam XBRL anual (20-F, ex.: Nu Holdings) usam o yfinance para o LTM.
"""
from __future__ import annotations

import datetime as dt
from collections import defaultdict

CONCEITOS = {
    # fluxos
    "receita": ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "Revenue", "SalesRevenueNet"],
    "custo": ["CostOfRevenue", "CostOfGoodsAndServicesSold"],
    "lucro_bruto": ["GrossProfit"],
    "ebit": ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
    "da": ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndOther", "DepreciationAndAmortization",
           "DepreciationAmortizationAndAccretionNet", "DepreciationExpense"],
    "desp_fin": ["InterestExpense", "InterestExpenseNonoperating"],
    "lair": ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
             "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
             "ProfitLossBeforeTax"],
    "ir": ["IncomeTaxExpenseBenefit", "IncomeTaxExpenseContinuingOperations"],
    "lucro_liq": ["NetIncomeLoss", "ProfitLossAttributableToOwnersOfParent", "ProfitLoss"],
    "fco": ["NetCashProvidedByUsedInOperatingActivities", "CashFlowsFromUsedInOperatingActivities"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"],
    "div_pagos": ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends", "DividendsPaidClassifiedAsFinancingActivities"],
    "recompras": ["PaymentsForRepurchaseOfCommonStock"],
    "_depr": ["Depreciation"],
    "_amort": ["AmortizationOfIntangibleAssets"],
    "juros_rec": ["InterestRevenueCalculatedUsingEffectiveInterestMethod", "InterestAndDividendIncomeOperating"],
    "juros_desp": ["InterestExpense"],
    # saldos
    "ativo": ["Assets"],
    "ativo_circ": ["AssetsCurrent"],
    "passivo_circ": ["LiabilitiesCurrent"],
    "passivo_total": ["Liabilities"],
    "pl": ["StockholdersEquity", "EquityAttributableToOwnersOfParent"],
    "pl_total": ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "Equity"],
    "caixa": ["CashCashEquivalentsAndShortTermInvestments", "CashAndCashEquivalentsAtCarryingValue", "CashAndCashEquivalents"],
    "receber": ["AccountsReceivableNetCurrent"],
    "estoques": ["InventoryNet"],
    "fornecedores": ["AccountsPayableCurrent"],
    "divida_cp": ["LongTermDebtCurrent", "DebtCurrent", "ShortTermBorrowings"],
    "divida_lp": ["LongTermDebtNoncurrent", "LongTermDebt", "Borrowings"],
    "carteira": ["LoansAndAdvancesToCustomers"],
}
SALDOS = {"ativo", "ativo_circ", "passivo_circ", "passivo_total", "pl", "pl_total", "caixa", "receber", "estoques",
          "fornecedores", "divida_cp", "divida_lp", "carteira"}


def _d(s):
    return dt.date.fromisoformat(s)


UNIDADE = {"v": "USD"}   # moeda de reporte da empresa em análise (XP e Inter reportam em BRL)


def _entradas(facts: dict, conceito: str, unidade=None):
    unidade = unidade or UNIDADE["v"]
    for tax in ("us-gaap", "ifrs-full"):
        c = facts.get("facts", {}).get(tax, {}).get(conceito)
        if c and unidade in c.get("units", {}):
            return c["units"][unidade]
    return []


def _serie(facts, nomes, saldo: bool):
    """Escolhe o primeiro conceito com dado mais recente; devolve lista deduplicada."""
    melhor, melhor_fim = None, None
    for n in nomes:
        e = _entradas(facts, n)
        if not e:
            continue
        fim = max(x["end"] for x in e)
        if melhor_fim is None or fim > melhor_fim:
            melhor, melhor_fim = e, fim
    if not melhor:
        return []
    por = {}
    for x in melhor:
        if x.get("form") not in ("10-K", "10-Q", "20-F", "10-K/A", "10-Q/A", "20-F/A", "40-F"):
            continue
        k = (x.get("start"), x["end"])
        if k not in por or x["filed"] > por[k]["filed"]:
            por[k] = x
    return list(por.values())


def _trimestres(entradas):
    """{data_fim: valor do trimestre} a partir de entradas com duração 3/6/9/12 meses."""
    por_inicio = defaultdict(dict)
    q = {}
    for x in entradas:
        if not x.get("start"):
            continue
        dias = (_d(x["end"]) - _d(x["start"])).days
        if 80 <= dias <= 100:
            q[x["end"]] = x["val"]
        por_inicio[x["start"]][x["end"]] = (dias, x["val"])
    for ini, fins in por_inicio.items():
        ordem = sorted(fins.items())
        for (f0, (d0, v0)), (f1, (d1, v1)) in zip(ordem[:-1], ordem[1:]):
            if 80 <= d1 - d0 <= 100 and f1 not in q:
                q[f1] = v1 - v0
    return dict(sorted(q.items()))


def _anuais_fluxo(entradas):
    out = {}
    for x in entradas:
        if x.get("start") and 350 <= (_d(x["end"]) - _d(x["start"])).days <= 380:
            out[x["end"]] = x["val"]
    return out


def _ltm_de(q: dict, fim: str):
    fins = [f for f in q if f <= fim]
    ult = sorted(fins)[-4:]
    if len(ult) < 4:
        return None
    if (_d(ult[-1]) - _d(ult[0])).days > 300:   # precisam ser 4 trimestres consecutivos
        return None
    return sum(q[f] for f in ult)


def btc_em_caixa(facts: dict):
    """Quantidade de bitcoin declarada (us-gaap:CryptoAssetNumberOfUnits), último valor e data."""
    c = facts.get("facts", {}).get("us-gaap", {}).get("CryptoAssetNumberOfUnits")
    if not c:
        return None, None
    ent = [x for u in c["units"].values() for x in u]
    if not ent:
        return None, None
    ult = max(ent, key=lambda x: (x["end"], x["filed"]))
    return float(ult["val"]), ult["end"]


def fundamentos(facts: dict, unidade: str = "USD") -> dict:
    UNIDADE["v"] = unidade
    series ={k: _serie(facts, v, k in SALDOS) for k, v in CONCEITOS.items()}
    anuais: dict[str, dict] = defaultdict(dict)
    trimestrais: dict[str, dict] = {}
    for k, e in series.items():
        if k in SALDOS:
            for x in e:
                if x.get("form", "").startswith(("10-K", "20-F", "40-F")) and x.get("fp") == "FY":
                    anuais[x["end"]][k] = x["val"]
        else:
            for fim, v in _anuais_fluxo(e).items():
                anuais[fim][k] = v
            trimestrais[k] = _trimestres(e)
    # D&A composto (depreciação + amortização de intangíveis) quando não há o conceito agregado
    if not trimestrais.get("da") and trimestrais.get("_depr"):
        dep, amo = trimestrais["_depr"], trimestrais.get("_amort", {})
        trimestrais["da"] = {f: v + amo.get(f, 0.0) for f, v in dep.items()}
        for fim, d in anuais.items():
            if "_depr" in d and "da" not in d:
                d["da"] = d["_depr"] + d.get("_amort", 0.0)
    for x in ("_depr", "_amort"):
        trimestrais.pop(x, None)
        for d in anuais.values():
            d.pop(x, None)

    # chaves de exercício: só datas que têm lucro
    anos = {}
    for fim, d in anuais.items():
        if d.get("lucro_liq") is not None:
            ano = int(fim[:4])
            if ano not in anos or fim > anos[ano][0]:
                anos[ano] = (fim, d)
    anuais_out = {}
    for ano, (fim, d) in sorted(anos.items()):
        # saldos do mesmo fim de exercício
        for k in SALDOS:
            if k not in d:
                for x in series[k]:
                    if x["end"] == fim:
                        d[k] = x["val"]
        anuais_out[ano] = _ajustar(dict(d), fim)

    # LTM
    datas_q = sorted({f for q in trimestrais.values() for f in q})
    fim_ltm = None
    for f in reversed(datas_q):
        if _ltm_de(trimestrais.get("lucro_liq", {}), f) is not None:
            fim_ltm = f
            break
    ltm, ltm_ant, saldo_ant, ref = None, None, None, None
    if fim_ltm:
        ref = fim_ltm
        ltm = {k: _ltm_de(q, fim_ltm) for k, q in trimestrais.items()}
        ltm.update(_saldo_em(series, fim_ltm))
        ant = (_d(fim_ltm) - dt.timedelta(days=365)).isoformat()
        cands = [f for f in datas_q if abs((_d(f) - _d(ant)).days) < 20]
        if cands:
            ltm_ant = {k: _ltm_de(q, cands[0]) for k, q in trimestrais.items()}
            saldo_ant = _saldo_em(series, cands[0])
            ltm_ant.update(saldo_ant)
        ltm = _ajustar(ltm, ref)
        ltm_ant = _ajustar(ltm_ant, cands[0]) if ltm_ant else None
    return {"anuais": anuais_out, "ltm": ltm, "ltm_ant": ltm_ant, "saldo_ant": saldo_ant, "data_ref": ref, "trimestrais": trimestrais}


def _saldo_em(series, fim):
    out = {}
    for k in SALDOS:
        cand = [x for x in series[k] if x["end"] <= fim]
        if cand:
            ult = max(cand, key=lambda x: (x["end"], x["filed"]))
            if (_d(fim) - _d(ult["end"])).days < 100:
                out[k] = ult["val"]
    return out


def _ajustar(d: dict, fim: str) -> dict:
    if d is None:
        return None
    if d.get("pl_total") is not None and d.get("pl") is not None:
        d["minoritarios"] = d["pl_total"] - d["pl"]
    else:
        d.setdefault("minoritarios", 0.0)
    if d.get("passivo_total") is not None and d.get("passivo_circ") is not None:
        d["passivo_nc"] = d["passivo_total"] - d["passivo_circ"]
    if d.get("capex") is not None:
        d["capex"] = -abs(d["capex"])
    if d.get("div_pagos") is not None:
        d["div_pagos"] = -abs(d["div_pagos"])
    if d.get("recompras") is not None:
        d["recompras"] = -abs(d["recompras"])
    if d.get("desp_fin") is not None:
        d["desp_fin"] = -abs(d["desp_fin"])
    d["_fim"] = fim
    return d


def acoes_em_circulacao(facts: dict):
    e = facts.get("facts", {}).get("dei", {}).get("EntityCommonStockSharesOutstanding", {}).get("units", {}).get("shares", [])
    if not e:
        return None, []
    por_data = defaultdict(float)
    ult_filed = {}
    for x in e:
        # soma classes (ex.: classes A e B) do mesmo documento
        k = x["end"]
        if ult_filed.get(k, ("",))[0] < x["filed"]:
            ult_filed[k] = (x["filed"],)
    for x in e:
        if x["filed"] == ult_filed[x["end"]][0]:
            por_data[x["end"]] += x["val"]
    hist = sorted(por_data.items())
    return hist[-1][1], hist


def ltm_yfinance(ticker: str) -> dict:
    """LTM e saldos pelo yfinance (soma de 4 trimestres). Usado quando a SEC não tem trimestrais em XBRL."""
    import yfinance as yf
    t = yf.Ticker(ticker)
    out = {}
    try:
        inc = t.quarterly_income_stmt
        bal = t.quarterly_balance_sheet
        cf = t.quarterly_cashflow
    except Exception as e:
        print("  [yf]", ticker, e)
        return {}

    def soma4(df, nomes):
        for n in nomes:
            if df is not None and n in df.index:
                s = df.loc[n].dropna()
                if len(s) >= 4:
                    return float(s.iloc[:4].sum()), str(s.index[0].date())
        return None, None

    def ult(df, nomes):
        for n in nomes:
            if df is not None and n in df.index:
                s = df.loc[n].dropna()
                if len(s):
                    return float(s.iloc[0])
        return None

    out["lucro_liq"], ref = soma4(inc, ["Net Income Common Stockholders", "Net Income"])
    out["receita"], _ = soma4(inc, ["Total Revenue", "Operating Revenue"])
    out["juros_rec"], _ = soma4(inc, ["Interest Income"])
    out["juros_desp"], _ = soma4(inc, ["Interest Expense"])
    out["fco"], _ = soma4(cf, ["Operating Cash Flow"])
    out["pl"] = ult(bal, ["Stockholders Equity", "Common Stock Equity"])
    out["ativo"] = ult(bal, ["Total Assets"])
    out["caixa"] = ult(bal, ["Cash And Cash Equivalents"])
    out["minoritarios"] = ult(bal, ["Minority Interest"]) or 0.0
    out["_fim"] = ref
    out["_fonte"] = "yfinance (trimestrais)"
    return out


def anuais_yfinance(ticker: str) -> dict[int, dict]:
    """Exercícios anuais pelo yfinance, para completar anos que a SEC não tem em XBRL."""
    import yfinance as yf
    t = yf.Ticker(ticker)
    out = {}
    try:
        inc, bal, cf = t.income_stmt, t.balance_sheet, t.cashflow
    except Exception:
        return out

    def v(df, nomes, col):
        for n in nomes:
            if df is not None and n in df.index and col in df.columns:
                x = df.loc[n, col]
                if x == x:
                    return float(x)
        return None

    for col in inc.columns:
        ano = col.year
        out[ano] = {
            "lucro_liq": v(inc, ["Net Income Common Stockholders", "Net Income"], col),
            "receita": v(inc, ["Total Revenue", "Operating Revenue"], col),
            "juros_rec": v(inc, ["Interest Income"], col),
            "juros_desp": v(inc, ["Interest Expense"], col),
            "fco": v(cf, ["Operating Cash Flow"], col),
            "pl": v(bal, ["Stockholders Equity", "Common Stock Equity"], col),
            "ativo": v(bal, ["Total Assets"], col),
            "caixa": v(bal, ["Cash And Cash Equivalents"], col),
            "minoritarios": 0.0, "_fim": str(col.date()), "_fonte": "yfinance (anual)",
        }
    return {k: d for k, d in out.items() if d["lucro_liq"] is not None}


def trimestres_yfinance(ticker: str) -> dict:
    """{conta: {data_fim: valor do trimestre}} pelo yfinance, para emissores sem trimestrais em XBRL na SEC."""
    import math
    import yfinance as yf
    linhas = {"receita": ("Total Revenue", "Operating Revenue"), "lucro_liq": ("Net Income", "Net Income Common Stockholders"),
              "ebit": ("EBIT", "Operating Income"), "da": ("Reconciled Depreciation", "Depreciation And Amortization In Income Statement")}
    out = {k: {} for k in linhas}
    try:
        q = yf.Ticker(ticker).quarterly_income_stmt
    except Exception:
        return out
    if q is None or q.empty:
        return out
    for conta, nomes in linhas.items():
        nome = next((n for n in nomes if n in q.index), None)
        if not nome:
            continue
        for data, v in q.loc[nome].items():
            if v is not None and not (isinstance(v, float) and math.isnan(v)):
                out[conta][data.strftime("%Y-%m-%d")] = float(v)
    return out
