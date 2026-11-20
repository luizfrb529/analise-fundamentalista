"""Séries mensais do simulador "Retorno real e em dólar" (data/mercado/mensal.json).

Roda uma vez por mês (rotina mensal.yml): só regrava o arquivo quando há um mês novo fechado, isto é,
com IPCA divulgado pelo IBGE e PTAX de fim de mês. Em outros dias, sai sem mudar nada.
Fontes: Banco Central (CDI diário, IPCA, PTAX), B3 (Ibovespa e IFIX) e Yahoo Finance (S&P 500, ouro e dólar para conferência).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mercado_hist as MH  # noqa: E402
import sources as S  # noqa: E402

ARQ = MH.SAIDA / "mensal.json"


def ultimo_mes_disponivel() -> str | None:
    """Último mês com IPCA e PTAX de fim de mês publicados (antes do mês corrente)."""
    import datetime as dt
    atual = dt.date.today().strftime("%Y-%m")
    ipca = {x["data"][6:10] + "-" + x["data"][3:5] for x in S.bcb_sgs(433, 3)}
    ptax = {x["data"][6:10] + "-" + x["data"][3:5] for x in S.bcb_sgs(3696, 3)}
    meses = sorted(m for m in ipca & ptax if m < atual)
    return meses[-1] if meses else None


def main():
    forcar = "--forcar" in sys.argv
    atual = json.loads(ARQ.read_text(encoding="utf-8")).get("ultimo_mes") if ARQ.exists() else None
    novo = ultimo_mes_disponivel()
    if not forcar and atual and novo and novo <= atual:
        print(f"sem mês novo fechado (arquivo já vai até {atual}); nada a fazer")
        return
    fim_mes = {}
    for k in MH.FIM_MES_ITENS + ("dolar",):
        c = MH.ITENS[k]
        if "b3" in c:
            serie = MH.b3_indice(c["b3"], 1994 if c["b3"] == "IBOV" else 2008)
        else:
            serie = [[d.date().isoformat(), float(v)] for d, v in MH.yahoo(c["yf"]).items()]
        fim_mes[k] = MH.fim_de_mes(serie)
    MH.mensal(fim_mes)


if __name__ == "__main__":
    main()
