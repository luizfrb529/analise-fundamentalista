"""Aba "Empresas com bitcoin": posição em bitcoin, número de ações, dívida e caixa de cada empresa.

Posição em BTC, a mais recente entre:
  - data/bitcoin_tesouraria.json (cadastro com data e fonte; atualizado aqui sozinho para a Strategy);
  - Strategy (MSTR): 8-K semanal na SEC, tabela "BTC Update" ("Aggregate BTC Holdings");
  - balanço (data/fundamentals.json > cripto: SEC XBRL ou estimativa pela conta da CVM).
O site calcula o mNAV com o preço de tela da ação e do bitcoin. Grava data/mercado/bitcoin.json.
Uso: python pipeline/bitcoin_tesouraria.py
"""
import datetime as dt
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
CAD = RAIZ / "data" / "bitcoin_tesouraria.json"
SAIDA = RAIZ / "data" / "mercado" / "bitcoin.json"
UA = {"User-Agent": S.UA}   # a SEC exige identificação com contato
CIK_MSTR = 1050446


def strategy_8k() -> dict | None:
    """Última posição divulgada pela Strategy no 8-K semanal (SEC)."""
    sub = S.get(f"https://data.sec.gov/submissions/CIK{CIK_MSTR:010d}.json", headers=UA).json()
    r = sub["filings"]["recent"]
    for forma, acc, doc, data in list(zip(r["form"], r["accessionNumber"], r["primaryDocument"], r["filingDate"]))[:15]:
        if forma != "8-K":
            continue
        url = f"https://www.sec.gov/Archives/edgar/data/{CIK_MSTR}/{acc.replace('-', '')}/{doc}"
        try:
            txt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", S.get(url, headers=UA).text.replace("&#160;", " ").replace("&nbsp;", " ")))
        except Exception:
            continue
        m = re.search(r"As of (\w+ \d{1,2}, \d{4}).{0,400}?Aggregate BTC Holdings.{0,300}?\$ ?[\d.,]+ \$ ?[\d.,]+ ([\d,]{5,}) \$", txt)
        if m:
            quando = dt.datetime.strptime(m.group(1), "%B %d, %Y").date().isoformat()
            return {"ticker": "MSTR", "btc": float(m.group(2).replace(",", "")), "data": quando,
                    "fonte": f"Strategy, 8-K de {dt.date.fromisoformat(data).strftime('%d/%m/%Y')} (SEC), tabela BTC Update", "url": url}
    return None


def main():
    cad = json.loads(CAD.read_text(encoding="utf-8"))
    por = {e["ticker"]: e for e in cad["empresas"]}
    try:
        s = strategy_8k()
        if s and s["data"] >= por.get("MSTR", {}).get("data", ""):
            por["MSTR"] = s
            cad["empresas"] = [s if e["ticker"] == "MSTR" else e for e in cad["empresas"]]
            CAD.write_text(json.dumps(cad, ensure_ascii=False, indent=1), encoding="utf-8")
    except Exception as e:
        print(f"Strategy 8-K: {e}")
    fund = json.loads((RAIZ / "data" / "fundamentals.json").read_text(encoding="utf-8"))
    univ = {a["ticker"]: a for a in json.loads((RAIZ / "data" / "universe.json").read_text(encoding="utf-8"))}
    out = []
    for t, e in por.items():
        f = fund.get(t) or {}
        i = f.get("ind") or {}
        cr = f.get("cripto") or {}
        # balanço mais recente que o cadastro: vale o balanço
        if cr.get("btc") and (cr.get("data") or "") > e["data"]:
            e = {**e, "btc": cr["btc"], "data": cr["data"], "fonte": cr.get("fonte"), "url": None}
        a = univ.get(t, {})
        out.append({"ticker": t, "nome": a.get("nome"), "moeda": "USD" if a.get("tipo") == "STOCK_US" else "BRL",
                    "btc": e["btc"], "data_btc": e["data"], "fonte_btc": e["fonte"], "url_btc": e.get("url"),
                    "acoes": i.get("acoes"), "divida_bruta": i.get("divida_bruta"), "caixa": i.get("caixa"),
                    "balanco_ate": f.get("data_ref") or (f.get("periodo") or {}).get("fim") if isinstance(f.get("periodo"), dict) else f.get("data_ref"),
                    "btc_balanco": cr.get("btc"), "data_btc_balanco": cr.get("data")})
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps({"atualizado_em": dt.datetime.now().isoformat(timespec="seconds"), "empresas": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    for x in out:
        print(x["ticker"], x["btc"], x["data_btc"], x["acoes"])


if __name__ == "__main__":
    main()
