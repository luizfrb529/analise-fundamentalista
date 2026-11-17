"""Cotações do dia para a faixa do site (índices, moedas e commodities), via yfinance.

Roda a cada 15 minutos no GitHub Actions (workflow mercado.yml) e grava mercado.json num ramo
separado ("mercado"), lido pelo site em raw.githubusercontent.com. O Yahoo entrega cotações da B3
com atraso de até 15 minutos.
Uso: python pipeline/mercado.py caminho/de/saida.json
"""
import datetime as dt
import json
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

import yfinance as yf

ATIVOS = {"ibovespa": "^BVSP", "ifix": "IFIX.SA", "sp500": "^GSPC", "nasdaq": "^IXIC", "dolar": "BRL=X",
          "euro": "EURBRL=X", "brent": "BZ=F", "ouro": "GC=F", "_btc_usd": "BTC-USD"}


def cotacao(simbolo: str):
    fi = yf.Ticker(simbolo).fast_info
    ultimo, anterior = fi["last_price"], fi["previous_close"]
    if not ultimo:
        return None
    return {"valor": float(ultimo), "var_dia": float(ultimo / anterior - 1) if anterior else None}


def main():
    saida = Path(sys.argv[1] if len(sys.argv) > 1 else "mercado.json")
    itens = {}
    for chave, simbolo in ATIVOS.items():
        try:
            c = cotacao(simbolo)
            if c:
                itens[chave] = c
        except Exception as e:  # um ativo fora do ar não derruba os outros
            print(f"{simbolo}: {e}")
    btc, usd = itens.pop("_btc_usd", None), itens.get("dolar")
    if btc and usd:
        var = (1 + (btc["var_dia"] or 0)) * (1 + (usd["var_dia"] or 0)) - 1
        itens["bitcoin_brl"] = {"valor": btc["valor"] * usd["valor"], "var_dia": var}
    agora = dt.datetime.now(ZoneInfo("America/Sao_Paulo"))
    saida.write_text(json.dumps({"atualizado_em": agora.isoformat(timespec="seconds"), "fonte": "Yahoo Finance (atraso de até 15 min)",
                                 "itens": itens}, ensure_ascii=False), encoding="utf-8")
    print(f"{len(itens)} cotações gravadas em {saida}")


if __name__ == "__main__":
    main()
