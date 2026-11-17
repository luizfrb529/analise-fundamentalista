"""Dados ao vivo do site, gravados no ramo "mercado" pelo robô cotacoes-faixa (.github/workflows/mercado.yml).

  python pipeline/ao_vivo.py precos   saida/precos.json    preço de tela das empresas (a cada 15 min no pregão)
  python pipeline/ao_vivo.py noticias saida/noticias.json  notícias da imprensa de todas as empresas (de hora em hora)

O preço vem do Yahoo Finance, com atraso de até 15 minutos na B3. As notícias vêm do Google News RSS,
com a mesma consulta do pipeline diário. Fatos relevantes e resultados continuam no pipeline diário (CVM e SEC).
"""
import datetime as dt
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
AGORA = dt.datetime.now(ZoneInfo("America/Sao_Paulo"))


def universo() -> list:
    return json.loads((RAIZ / "data" / "universe.json").read_text(encoding="utf-8"))


def precos() -> dict:
    tickers = [a["ticker"] for a in universo()]
    df = yf.download([t + ".SA" for t in tickers], period="7d", interval="1d", group_by="ticker", progress=False, auto_adjust=False, threads=True)
    out = {}
    for t in tickers:
        try:
            c = (df[t + ".SA"] if isinstance(df.columns, pd.MultiIndex) else df)["Close"].dropna()
        except KeyError:
            continue
        if len(c) < 2:
            continue
        out[t] = {"preco": round(float(c.iloc[-1]), 4), "var_dia": float(c.iloc[-1] / c.iloc[-2] - 1), "data": c.index[-1].strftime("%Y-%m-%d")}
    return out


def noticias() -> dict:
    por_ticker, feed = {}, {}
    for a in universo():
        t, nome = a["ticker"], a["nome"]
        try:
            itens = S.noticias_empresa(nome, t, a.get("ticker_exterior") if a["tipo"].startswith("BDR") else None, 15)
        except Exception as e:
            print(f"{t}: {e}")
            continue
        por_ticker[t] = itens
        for x in itens:
            chave = (x.get("titulo") or "").strip().lower()
            if chave:
                item = feed.setdefault(chave, {**x, "tickers": []})
                if t not in item["tickers"]:
                    item["tickers"].append(t)
    lista = sorted(feed.values(), key=lambda x: str(x.get("data") or ""), reverse=True)[:150]
    return {"por_ticker": por_ticker, "feed": lista}


def main():
    modo, saida = sys.argv[1], Path(sys.argv[2])
    dados = precos() if modo == "precos" else noticias()
    saida.write_text(json.dumps({"atualizado_em": AGORA.isoformat(timespec="seconds"), **({"precos": dados} if modo == "precos" else dados)},
                                ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{modo}: {len(dados if modo == 'precos' else dados['por_ticker'])} empresas gravadas em {saida}")


if __name__ == "__main__":
    main()
