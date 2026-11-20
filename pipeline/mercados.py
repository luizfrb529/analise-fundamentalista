"""Calendário de funcionamento da B3 e da bolsa de Nova York (NYSE), para os quadros "Mercado aberto/fechado" do site.

Fontes:
  - exchange_calendars (calendários BVMF e XNYS, mantidos pela comunidade e atualizados com os anúncios das bolsas).
  - Conferência: a lista de dias sem pregão da B3 de 2026 e 2027 bateu com o calendário oficial da B3 e com Suno/InvestNews;
    a da NYSE bateu com Fidelity e listas públicas de feriados.
  - Ajuste próprio: a B3 fecha às 17h (Brasília) quando Nova York está no horário de verão e às 18h no resto do ano
    (Ofício Circular 005/2026-PRE da B3; Money Times, Investidor10, Suno). A biblioteca não traz essa troca.
Saída: data/mercados.json com os pregões de 7 dias atrás até ~13 meses à frente (abertura e fechamento em UTC) e os feriados.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import exchange_calendars as xc
import pandas as pd

RAIZ = Path(__file__).resolve().parents[1]
SAIDA = RAIZ / "data" / "mercados.json"
NY = ZoneInfo("America/New_York")

NOMES_BR = {
    "Dia da Confraternizacao Universal": "Confraternização Universal", "Carnaval Segunda": "Carnaval", "Carnaval Terca": "Carnaval",
    "Good Friday": "Sexta-feira Santa", "Tiradentes": "Tiradentes", "Dia Trabalho": "Dia do Trabalho", "Corpus Christi": "Corpus Christi",
    "Independencia": "Independência do Brasil", "Nossa Senhora de Aparecida": "Nossa Senhora Aparecida", "Dia dos Finados": "Finados",
    "Proclamacao da Republica": "Proclamação da República", "Dia Nacional de Zumbi e da Consciencia Negra": "Consciência Negra",
    "Vespera Natal": "Véspera de Natal", "Natal": "Natal", "Ano Novo": "Véspera de Ano-Novo",
}
NOMES_EUA = {
    "New Year's Day": "Ano-Novo", "Dr. Martin Luther King Jr. Day": "Dia de Martin Luther King", "President's Day": "Dia dos Presidentes",
    "Good Friday": "Sexta-feira Santa", "Memorial Day": "Memorial Day", "Juneteenth National Independence Day": "Juneteenth",
    "July 4th": "Independência dos EUA", "Labor Day": "Dia do Trabalho (EUA)", "Thanksgiving": "Ação de Graças", "Christmas": "Natal",
}


def nome(nomes: dict, n: str) -> str:
    return nomes.get(n, n)


def montar(codigo: str, nomes: dict, inicio: pd.Timestamp, fim: pd.Timestamp) -> dict:
    cal = xc.get_calendar(codigo, start=(inicio - pd.Timedelta(days=30)).strftime("%Y-%m-%d"), end=(fim + pd.Timedelta(days=15)).strftime("%Y-%m-%d"))
    sessoes = {}
    for s in cal.sessions_in_range(inicio.strftime("%Y-%m-%d"), fim.strftime("%Y-%m-%d")):
        ab, fe = cal.session_open(s), cal.session_close(s)
        if codigo == "BVMF":
            # pregão regular da B3 termina às 17h quando NY está no horário de verão, 18h fora dele (call de fechamento incluído)
            dia = s.date()
            verao_ny = bool(dt.datetime(dia.year, dia.month, dia.day, 12, tzinfo=NY).dst())
            fim_regular = pd.Timestamp(dia.isoformat() + (" 20:00" if verao_ny else " 21:00"), tz="UTC")
            fe = min(fe, fim_regular) if fe.hour >= 20 else fe
        sessoes[s.date().isoformat()] = [ab.isoformat().replace("+00:00", "Z"), fe.isoformat().replace("+00:00", "Z")]
    feriados = {}
    hol = cal.regular_holidays.holidays(inicio, fim, return_name=True) if cal.regular_holidays is not None else pd.Series(dtype=object)
    for d, n in hol.items():
        if d.weekday() < 5:
            feriados[d.date().isoformat()] = nome(nomes, n)
    for d in getattr(cal, "adhoc_holidays", []) or []:
        d = pd.Timestamp(d)
        if inicio <= d <= fim and d.weekday() < 5:
            feriados.setdefault(d.date().isoformat(), "Sem pregão")
    # dia útil sem pregão que não veio com nome
    for d in pd.bdate_range(inicio, fim):
        k = d.date().isoformat()
        if k not in sessoes and k not in feriados:
            feriados[k] = "Sem pregão"
    return {"sessoes": sessoes, "feriados": feriados}


def main():
    hoje = pd.Timestamp(dt.date.today())
    inicio, fim = hoje - pd.Timedelta(days=7), hoje + pd.Timedelta(days=400)
    out = {
        "atualizado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "fonte": "exchange_calendars (BVMF e XNYS), conferido com o calendário oficial da B3 e listas de feriados da NYSE; horário da B3 ajustado ao horário de verão de Nova York",
        "brasil": {"bolsa": "B3", "fuso": "America/Sao_Paulo", **montar("BVMF", NOMES_BR, inicio, fim)},
        "eua": {"bolsa": "NYSE e Nasdaq", "fuso": "America/New_York", **montar("XNYS", NOMES_EUA, inicio, fim)},
    }
    SAIDA.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    for k in ("brasil", "eua"):
        f = out[k]["feriados"]
        print(k, len(out[k]["sessoes"]), "pregões;", len(f), "dias úteis sem pregão:", ", ".join(f"{d} {n}" for d, n in sorted(f.items())[:6]), "...")


if __name__ == "__main__":
    main()
