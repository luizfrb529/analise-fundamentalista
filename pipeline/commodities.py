"""Aba Commodities: cotação, variações e série de 1 ano de petróleo, metais e agro.

Fontes:
  Yahoo Finance (contratos futuros mais próximos): Brent e WTI (Nymex/ICE), ouro e prata (Comex), cobre (Comex),
    aço laminado a quente (Comex, tonelada curta) e minério de ferro (SGX, via Comex TIO).
  LME (London Metal Exchange), preço oficial à vista "cash settlement", publicado pela Westmetall: alumínio,
    níquel e zinco (o Yahoo não tem a LME). O alumínio é conferido com o contrato da Comex.
  B3, Boletim Diário (tabela EconomicIndicators): boi gordo (indicador de fechamento, R$/@) e milho (R$/60 kg).
    O boletim só guarda os últimos 21 dias: a série é acumulada dia a dia em data/mercado/commodities_b3.json.
Grava data/mercado/commodities.json. Preço ao vivo dos itens do Yahoo: pipeline/mercado.py (faixa).
Uso: python pipeline/commodities.py
"""
import datetime as dt
import json
import re
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
SAIDA = RAIZ / "data" / "mercado" / "commodities.json"
ACUM_B3 = RAIZ / "data" / "mercado" / "commodities_b3.json"
HOJE = dt.date.today()

ITENS = [
    # id, nome, grupo, fonte, código, unidade, praça, explicação curta
    ("brent", "Petróleo Brent", "Energia", "yahoo", "BZ=F", "US$ por barril", "Londres (ICE)", "Referência internacional do petróleo; base do preço da Petrobras."),
    ("wti", "Petróleo WTI", "Energia", "yahoo", "CL=F", "US$ por barril", "Nova York (Nymex)", "Referência do petróleo nos Estados Unidos."),
    ("ouro", "Ouro", "Metais preciosos", "yahoo", "GC=F", "US$ por onça troy", "Nova York (Comex)", "Reserva de valor; sobe em momentos de incerteza."),
    ("prata", "Prata", "Metais preciosos", "yahoo", "SI=F", "US$ por onça troy", "Nova York (Comex)", "Metal precioso e industrial (painéis solares, eletrônicos)."),
    ("cobre", "Cobre", "Metais industriais", "yahoo", "HG=F", "US$ por libra-peso", "Nova York (Comex)", "Termômetro da atividade industrial e da eletrificação."),
    ("aluminio", "Alumínio", "Metais industriais", "lme", "LME_Al_cash", "US$ por tonelada", "Londres (LME)", "Usado em embalagens, construção e veículos."),
    ("niquel", "Níquel", "Metais industriais", "lme", "LME_Ni_cash", "US$ por tonelada", "Londres (LME)", "Usado em aço inox e baterias."),
    ("zinco", "Zinco", "Metais industriais", "lme", "LME_Zn_cash", "US$ por tonelada", "Londres (LME)", "Usado para galvanizar aço."),
    ("aco", "Aço (EUA)", "Metais industriais", "yahoo", "HRC=F", "US$ por tonelada curta", "Nova York (Comex)", "Bobina laminada a quente no mercado americano."),
    ("minerio", "Minério de ferro", "Metais industriais", "yahoo", "TIO=F", "US$ por tonelada", "Singapura (via Comex)", "Matéria-prima do aço; base do resultado da Vale."),
    ("boi", "Boi gordo", "Agro", "b3", "RTBGI", "R$ por arroba", "B3 (indicador CEPEA/B3)", "Preço da arroba do boi pronto para abate em São Paulo."),
    ("milho", "Milho", "Agro", "b3", "RTCNI", "R$ por saca de 60 kg", "B3 (indicador CEPEA/B3)", "Preço do milho em Campinas (SP)."),
]


def lme(campo: str) -> pd.Series:
    """Série diária do preço oficial da LME (Westmetall), deste ano e do anterior."""
    pontos = {}
    for ano in (HOJE.year - 1, HOJE.year):
        url = f"https://www.westmetall.com/en/markdaten.php?action=table&field={campo}&year={ano}"
        h = S.get(url, headers={"User-Agent": "Mozilla/5.0"}).text
        for linha in re.findall(r"<tr[^>]*>(.*?)</tr>", h, re.S):
            tds = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", linha, re.S)]
            if len(tds) < 2:
                continue
            try:
                d = dt.datetime.strptime(tds[0].replace(".", ""), "%d %B %Y").date()
                v = float(tds[1].replace(",", ""))
            except ValueError:
                continue
            pontos[pd.Timestamp(d)] = v
    return pd.Series(pontos, dtype=float).sort_index()


def b3_indicadores(dias: int = 21) -> dict:
    """Acumula os indicadores de commodities do Boletim Diário da B3 (últimos `dias` pregões disponíveis)."""
    import requests
    acum = json.loads(ACUM_B3.read_text(encoding="utf-8")) if ACUM_B3.exists() else {}
    d = HOJE
    for _ in range(dias + 12):
        d -= dt.timedelta(days=1)
        if d.weekday() >= 5 or any(d.isoformat() in (acum.get(k) or {}) for k in ("RTBGI",)):
            continue
        corpo = {"Name": "EconomicIndicators", "Date": d.isoformat(), "FinalDate": d.isoformat(), "ClientId": "", "Filters": {}}
        try:
            j = requests.post(f"{S.B3_BDI}/table/export", json=corpo, timeout=90, headers={"Accept": "application/json"}).json()
        except Exception as e:
            print(f"B3 indicadores {d}: {e}")
            continue
        cols = [c["name"] for c in j.get("columns", [])]
        if "IndcSymb" not in cols:
            continue
        i_s, i_v = cols.index("IndcSymb"), cols.index("IndxVal")
        for row in j.get("values", []):
            if row[i_s] in ("RTBGI", "RTCNI") and row[i_v]:
                acum.setdefault(row[i_s], {})[d.isoformat()] = float(row[i_v])
    ACUM_B3.parent.mkdir(parents=True, exist_ok=True)
    ACUM_B3.write_text(json.dumps({k: dict(sorted(v.items())) for k, v in acum.items()}), encoding="utf-8")
    return acum


def variacoes(s: pd.Series) -> dict:
    s = s.dropna()
    if s.empty:
        return {}
    ult, d = float(s.iloc[-1]), s.index[-1]

    def em(dias=None, data=None):
        alvo = data if data is not None else d - pd.Timedelta(days=dias)
        x = s[s.index <= alvo]
        return float(ult / x.iloc[-1] - 1) if len(x) and x.iloc[-1] else None
    return {"preco": ult, "data": d.strftime("%Y-%m-%d"),
            "var_dia": float(ult / s.iloc[-2] - 1) if len(s) > 1 and s.iloc[-2] else None,
            "var_sem": em(7), "var_mes": em(30), "var_12m": em(365), "var_ano": em(data=pd.Timestamp(d.year - 1, 12, 31))}


def main():
    yahoo = [c for _, _, _, f, c, *_ in ITENS if f == "yahoo"]
    px = S.precos_yf(yahoo, anos=2)
    b3 = b3_indicadores()
    out = []
    for id_, nome, grupo, fonte, cod, unidade, praca, expl in ITENS:
        try:
            if fonte == "yahoo":
                df = px.get(cod)
                s = df["Close"].dropna() if df is not None else pd.Series(dtype=float)
                s.index = pd.to_datetime(s.index).tz_localize(None) if getattr(s.index, "tz", None) else pd.to_datetime(s.index)
                nome_fonte = "Yahoo Finance (contrato futuro mais próximo)"
            elif fonte == "lme":
                s = lme(cod)
                nome_fonte = "LME, preço oficial à vista (Westmetall)"
            else:
                s = pd.Series({pd.Timestamp(k): v for k, v in (b3.get(cod) or {}).items()}, dtype=float).sort_index()
                nome_fonte = "B3, Boletim Diário (indicador CEPEA/B3)"
        except Exception as e:
            print(f"{nome}: {e}")
            continue
        if s.empty:
            print(f"{nome}: sem dados")
            continue
        um_ano = s[s.index >= s.index[-1] - pd.Timedelta(days=366)]
        out.append({"id": id_, "nome": nome, "grupo": grupo, "unidade": unidade, "praca": praca, "explicacao": expl,
                    "fonte": nome_fonte, "codigo": cod, "ao_vivo": id_ if fonte == "yahoo" else None,
                    "historico_desde": s.index[0].strftime("%Y-%m-%d"),
                    **variacoes(s), "serie": [[d.strftime("%Y-%m-%d"), round(float(v), 4)] for d, v in um_ano.items()]})
    # conferência: alumínio da LME contra o contrato da Comex (mesma unidade, US$/t)
    try:
        al = next(x for x in out if x["id"] == "aluminio")
        comex = S.precos_yf(["ALI=F"], anos=1).get("ALI=F")
        if comex is not None and not comex.empty:
            dif = al["preco"] / float(comex["Close"].dropna().iloc[-1]) - 1
            al["conferencia"] = f"Comex (ALI=F) difere {dif:+.1%}"
            if abs(dif) > 0.1:
                print(f"ATENÇÃO alumínio: LME e Comex diferem {dif:+.1%}")
    except StopIteration:
        pass
    SAIDA.parent.mkdir(parents=True, exist_ok=True)
    SAIDA.write_text(json.dumps({"atualizado_em": dt.datetime.now().isoformat(timespec="seconds"), "itens": out},
                                ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"commodities: {len(out)} itens gravados")


if __name__ == "__main__":
    main()
