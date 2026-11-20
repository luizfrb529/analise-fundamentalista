"""Histórico dos itens da faixa de cotações (data/mercado/<chave>.json), aberto ao clicar no item.

Fontes:
  - B3 (estatísticas de índices, fechamento diário oficial): Ibovespa, SMLL e IFIX.
  - Yahoo Finance: S&P 500, Nasdaq, EWZ, dólar, euro, Brent, ouro e bitcoin (BTC em dólar x dólar em reais).
  - Banco Central (SGS): Selic meta, CDI e IPCA 12 meses.
  - Tesouro Direto: taxa de compra do Tesouro IPCA+ de maior vencimento.
  - FRED: Treasury 10 e 20 anos.
  - Projeções: só as do Boletim Focus do Banco Central (mediana do mercado) para Selic, IPCA e dólar.
    O site não faz projeção própria de preço de índice ou ativo.
"""
from __future__ import annotations

import base64
import datetime as dt
import io
import json
import sys
from pathlib import Path

import pandas as pd
import requests
import yfinance as yf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SAIDA = RAIZ / "data" / "mercado"
HOJE = dt.date.today()
UA = {"User-Agent": "Mozilla/5.0"}

ITENS = {
    "ibovespa": {"nome": "Ibovespa", "unidade": "pts", "b3": "IBOV"},
    "smll": {"nome": "Índice Small Cap (SMLL)", "unidade": "pts", "b3": "SMLL"},
    "ifix": {"nome": "IFIX", "unidade": "pts", "b3": "IFIX"},
    "sp500": {"nome": "S&P 500", "unidade": "pts", "yf": "^GSPC"},
    "nasdaq": {"nome": "Nasdaq Composite", "unidade": "pts", "yf": "^IXIC"},
    "ewz": {"nome": "EWZ (ETF de ações brasileiras em Nova York)", "unidade": "US$", "yf": "EWZ"},
    "dolar": {"nome": "Dólar", "unidade": "R$", "yf": "BRL=X", "focus": "Câmbio"},
    "euro": {"nome": "Euro", "unidade": "R$", "yf": "EURBRL=X"},
    "bitcoin_brl": {"nome": "Bitcoin", "unidade": "R$", "yf": "BTC-USD", "x_dolar": True},
    "brent": {"nome": "Petróleo Brent", "unidade": "US$", "yf": "BZ=F"},
    "ouro": {"nome": "Ouro (onça troy)", "unidade": "US$", "yf": "GC=F"},
    "selic": {"nome": "Selic meta", "unidade": "pct", "sgs": 432, "focus": "Selic"},
    "cdi": {"nome": "CDI", "unidade": "pct", "sgs": 4389},
    "ipca_12m": {"nome": "IPCA 12 meses", "unidade": "pct", "sgs": 13522, "focus": "IPCA"},
    "ntnb_longa": {"nome": "Tesouro IPCA+ de maior vencimento (taxa real)", "unidade": "pct", "tesouro": True},
    "treasury_10y": {"nome": "Treasury 10 anos", "unidade": "pct", "fred": "DGS10"},
    "treasury_20y": {"nome": "Treasury 20 anos", "unidade": "pct", "fred": "DGS20"},
}


def b3_indice(cod: str, desde: int) -> list:
    out = []
    for ano in range(desde, HOJE.year + 1):
        p = base64.b64encode(json.dumps({"index": cod, "language": "pt-br", "year": str(ano)}).encode()).decode()
        try:
            j = S.get(f"https://sistemaswebb3-listados.b3.com.br/indexStatisticsProxy/IndexCall/GetPortfolioDay/{p}", headers=UA).json()
        except Exception as e:
            print(f"  {cod} {ano}: {e}")
            continue
        for linha in j.get("results") or []:
            dia = int(linha.get("day") or 0)
            for mes in range(1, 13):
                v = S.num_br(linha.get(f"rateValue{mes}"))
                if dia and v:
                    try:
                        out.append([dt.date(ano, mes, dia).isoformat(), v])
                    except ValueError:
                        pass
    return sorted(out)


def yahoo(t: str) -> pd.Series:
    h = yf.Ticker(t).history(period="max", interval="1d", auto_adjust=False)
    s = h["Close"].dropna()
    s.index = s.index.tz_localize(None) if s.index.tz is not None else s.index
    return s[s > 0]


def sgs(serie: int, anos: int) -> list:
    out = []
    for x in S.bcb_sgs_periodo(serie, anos):
        try:
            out.append([pd.to_datetime(x["data"], dayfirst=True).date().isoformat(), float(x["valor"]) / 100])
        except (ValueError, TypeError):
            pass
    return out


def tesouro_ipca_longo() -> tuple[list, str | None]:
    url = ("https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/"
           "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/PrecoTaxaTesouroDireto.csv")
    df = pd.read_csv(io.BytesIO(S.get(url, timeout=300).content), sep=";", decimal=",", encoding="latin1")
    df = df[df["Tipo Titulo"].str.strip() == "Tesouro IPCA+"].copy()
    df["base"] = pd.to_datetime(df["Data Base"], dayfirst=True)
    df["venc"] = pd.to_datetime(df["Data Vencimento"], dayfirst=True)
    ult = df[df["base"] == df["base"].max()]
    venc = ult["venc"].max()
    t = df[df["venc"] == venc].sort_values("base")
    return [[d.date().isoformat(), float(v) / 100] for d, v in zip(t["base"], t["Taxa Compra Manha"]) if pd.notna(v)], venc.date().isoformat()


def fred(serie: str) -> list:
    df = pd.read_csv(io.StringIO(S.get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={serie}").text))
    df.columns = ["data", "v"]
    df["v"] = pd.to_numeric(df["v"], errors="coerce")
    return [[str(d), float(v) / 100] for d, v in zip(df["data"], df["v"]) if pd.notna(v)]


def focus(indicador: str, pct: bool) -> dict | None:
    """Mediana mais recente do Focus para o ano corrente e os seguintes (fim de ano)."""
    url = ("https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais"
           f"?$top=40&$format=json&$orderby=Data%20desc&$filter=Indicador%20eq%20'{requests.utils.quote(indicador)}'%20and%20baseCalculo%20eq%200")
    try:
        v = S.get(url).json()["value"]
    except Exception as e:
        print(f"  focus {indicador}: {e}")
        return None
    if not v:
        return None
    data = v[0]["Data"]
    pts = sorted({int(x["DataReferencia"]): x["Mediana"] for x in v if x["Data"] == data and int(x["DataReferencia"]) >= HOJE.year}.items())
    return {"data": data, "fonte": "Boletim Focus do Banco Central, mediana das projeções do mercado para o fim de cada ano",
            "pontos": [[f"{a}-12-31", m / 100 if pct else m] for a, m in pts]}


def enxugar(serie: list) -> list:
    """Diário nos últimos 5 anos; semanal (último dado de cada semana) antes disso, para o arquivo ficar leve."""
    corte = (HOJE - dt.timedelta(days=5 * 366)).isoformat()
    antigo, novo, semana = [], [], {}
    for d, v in serie:
        if d >= corte:
            novo.append([d, round(v, 6)])
        else:
            semana[dt.date.fromisoformat(d).isocalendar()[:2]] = [d, round(v, 6)]
    antigo = sorted(semana.values())
    return antigo + novo


FIM_MES_ITENS = ("ibovespa", "ifix", "sp500", "ouro")


def fim_de_mes(serie: list) -> dict:
    """Último valor de cada mês: {'AAAA-MM': valor}."""
    out = {}
    for d, v in serie:
        out[d[:7]] = v
    return out


def mensal(fim_mes: dict) -> None:
    """Séries mensais para o simulador de retorno real e em dólar (só meses fechados)."""
    hoje = dt.date.today()
    mes_atual = hoje.strftime("%Y-%m")
    # CDI do mês composto a partir do CDI diário (SGS 12, % ao dia), mais preciso que a série mensal arredondada
    cdi = {}
    for x in S.bcb_sgs_periodo(12, 26):
        try:
            d = pd.to_datetime(x["data"], dayfirst=True)
            cdi.setdefault(d.strftime("%Y-%m"), []).append(float(x["valor"]) / 100)
        except (ValueError, TypeError):
            pass
    cdi_m = {}
    for m, l in cdi.items():
        f = 1.0
        for r in l:
            f *= 1 + r
        cdi_m[m] = f - 1
    ipca = {pd.to_datetime(x["data"], dayfirst=True).strftime("%Y-%m"): float(x["valor"]) / 100 for x in S.bcb_sgs_periodo(433, 26)}
    ptax = {pd.to_datetime(x["data"], dayfirst=True).strftime("%Y-%m"): float(x["valor"]) for x in S.bcb_sgs_periodo(3696, 26)}
    # último mês fechado: tem IPCA divulgado, PTAX de fim de mês e não é o mês corrente
    ultimo = max(m for m in ipca if m in ptax and m in cdi_m and m < mes_atual)
    meses = sorted(m for m in cdi_m if m <= ultimo and m in ipca and m in ptax)
    # confere a PTAX de fim de mês com o dólar do Yahoo (fim de mês)
    yus = fim_mes.get("dolar") or {}
    dif = [abs(ptax[m] / yus[m] - 1) for m in meses[-60:] if yus.get(m)]
    if dif:
        print(f"PTAX x Yahoo (60 meses): diferença máxima {max(dif):.2%}")
    out = {"atualizado_em": hoje.isoformat(), "ultimo_mes": ultimo, "meses": meses,
           "cdi": [round(cdi_m[m], 8) for m in meses], "ipca": [ipca[m] for m in meses], "dolar": [ptax[m] for m in meses],
           "fontes": {"cdi": "Banco Central, SGS 12 (CDI diário), composto por mês", "ipca": "IBGE via Banco Central, SGS 433",
                      "dolar": "Banco Central, SGS 3696 (PTAX de venda, fim de mês)", "ibovespa": "B3 (fechamento do último pregão do mês)",
                      "ifix": "B3 (fechamento do último pregão do mês)", "sp500": "Yahoo Finance (fechamento do mês, em dólares)",
                      "ouro": "Yahoo Finance (contrato futuro, fechamento do mês, em dólares por onça)"}}
    for k in FIM_MES_ITENS:
        fm = fim_mes.get(k) or {}
        out[k] = [fm.get(m) for m in meses]
    (SAIDA / "mensal.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"mensal: {meses[0]} a {ultimo} ({len(meses)} meses)")


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    falhas = []
    fim_mes = {}
    for k, c in ITENS.items():
        extra = {}
        try:
            if "b3" in c:
                serie, fonte = b3_indice(c["b3"], 1994 if c["b3"] == "IBOV" else 2008), "B3, estatísticas do índice (fechamento diário)"
            elif "yf" in c:
                s = yahoo(c["yf"])
                if c.get("x_dolar"):
                    usd = yahoo("BRL=X")
                    s = (s * usd.reindex(s.index, method="ffill")).dropna()
                    fonte = "Yahoo Finance (bitcoin em dólar convertido pelo dólar em reais do dia)"
                else:
                    fonte = "Yahoo Finance (fechamento diário)"
                serie = [[d.date().isoformat(), float(v)] for d, v in s.items()]
            elif "sgs" in c:
                serie, fonte = sgs(c["sgs"], 26), f"Banco Central, SGS {c['sgs']}"
            elif c.get("tesouro"):
                serie, venc = tesouro_ipca_longo()
                fonte, extra = f"Tesouro Direto, Tesouro IPCA+ {venc[:4]}, taxa de compra da manhã", {"vencimento": venc}
            else:
                serie, fonte = fred(c["fred"]), f"FRED, série {c['fred']}"
        except Exception as e:
            print(f"{k}: {e}")
            falhas.append(k)
            continue
        if len(serie) < 20:
            print(f"{k}: série curta ({len(serie)}), mantém o arquivo anterior")
            falhas.append(k)
            continue
        fim_mes[k] = fim_de_mes(serie)
        out = {"chave": k, "nome": c["nome"], "unidade": c["unidade"], "fonte": fonte, "atualizado_em": HOJE.isoformat(),
               "serie": enxugar(serie), **extra}
        if c.get("focus"):
            f = focus(c["focus"], c["unidade"] == "pct")
            if f:
                out["projecao"] = f
        (SAIDA / f"{k}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{k}: {len(out['serie'])} pontos de {out['serie'][0][0]} a {out['serie'][-1][0]}{' + Focus' if out.get('projecao') else ''}")
    if falhas:
        print("falharam:", falhas)


if __name__ == "__main__":
    main()
