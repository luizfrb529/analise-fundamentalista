"""Aba "Análise técnica": preços diários (máxima, mínima, fechamento e volume) dos últimos ~2 anos de cada ativo,
para o site calcular média móvel de 200, MACD, IFR, ADX e Bandas de Bollinger.

Fonte: Yahoo Finance (preços ajustados por desdobramento, não por proventos, como no gráfico de cotação).
Grava data/tecnica/<TICKER>.json com colunas [data, maxima, minima, fechamento, volume].
Uso: python pipeline/tecnica.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SAIDA = RAIZ / "data" / "tecnica"
PREGOES = 520          # ~2 anos: média de 200 com folga para o gráfico de 1 ano


def main():
    univ = json.loads((RAIZ / "data" / "universe.json").read_text(encoding="utf-8"))
    fiis = json.loads((RAIZ / "data" / "fiis.json").read_text(encoding="utf-8"))
    stocks = {a["ticker"] for a in univ if a.get("tipo") == "STOCK_US"}
    tickers = [a["ticker"] for a in univ] + [f["ticker"] for f in fiis]
    sim = {t: (t if t in stocks else t + ".SA") for t in tickers}
    dfs = S.precos_yf(list(sim.values()), anos=3, ohlc=True)
    SAIDA.mkdir(parents=True, exist_ok=True)
    n = 0
    for t in tickers:
        df = dfs.get(sim[t])
        if df is None or df.empty or not {"High", "Low", "Close"} <= set(df.columns):
            continue
        d = df.dropna(subset=["Close"]).tail(PREGOES)
        casas = 4 if float(d["Close"].iloc[-1]) < 10 else 2
        linhas = []
        for data, r in d.iterrows():
            h, l, c = r.get("High"), r.get("Low"), r["Close"]
            h = c if h != h else h           # dia sem máxima/mínima no Yahoo: usa o fechamento
            l = c if l != l else l
            v = r.get("Volume")
            linhas.append([data.strftime("%Y-%m-%d"), round(float(h), casas), round(float(l), casas), round(float(c), casas),
                           int(v) if v == v and v is not None else 0])
        (SAIDA / f"{t}.json").write_text(json.dumps({"t": t, "moeda": "USD" if t in stocks else "BRL",
                                                     "colunas": ["data", "maxima", "minima", "fechamento", "volume"], "d": linhas},
                                                    separators=(",", ":")), encoding="utf-8")
        n += 1
    print(f"tecnica: {n} ativos gravados")


if __name__ == "__main__":
    main()
