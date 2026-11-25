"""Histórico mensal de rendimentos por cota e de cotações dos FIIs, para o retorno total, desde o início do fundo.

Por que existe: o Yahoo não tem os rendimentos dos FIIs antes de 2022 e, para vários fundos, nem as cotações antes
de 2014 (ou de 2024). O retorno total dos fundos saía muito abaixo do real (HGLG11: cerca de 2 vezes em 15 anos,
quando o próprio fundo informa mais de 7 vezes).

Fontes de rendimento, cruzadas mês a mês:
  oficial  aviso de rendimento estruturado (FundosNet, desde 2016/2017), já gravado em data/fiis/<T>.json
  rentab   documentos de "Rentabilidade" dos administradores no FundosNet, com a tabela desde o início (rentab_docs.py)
  i10      Investidor10 (tabela de proventos da página do fundo, i10.py)
  cvm      informe mensal da CVM (dados abertos, desde 2017): dividend yield do mês x valor patrimonial da cota,
           calibrado fundo a fundo pelos meses com aviso oficial
Em cada mês vale o valor em que as fontes concordam; empate, a ordem acima. Valor fora do padrão (mais de 4% da
cota no mês) só fica se nenhuma outra fonte trouxer valor normal (pega erros de digitação nos avisos, como ALZR11
em ago/2022, R$ 5,65 no lugar de R$ 0,565).
Cotações: Yahoo (já ajustado por desdobramento) e, antes do primeiro pregão no Yahoo, a série histórica oficial
da B3 (COTAHIST), ajustada pelos desdobramentos e grupamentos (eventos da B3 + saltos de preço na própria série).
Tudo na base de cotas atual. Data ex: dia útil seguinte ao fim do mês de referência (data base usual dos FIIs).
"""
import datetime as dt
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fiis  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
ANO_INI = 2016
PRIORIDADE = ["oficial", "rentab", "i10", "cvm"]
NOMES = {"oficial": "avisos de rendimento (FundosNet)", "rentab": "documentos de Rentabilidade do administrador (FundosNet)",
         "i10": "Investidor10", "cvm": "informe mensal da CVM"}
ERRO_MAX = 0.05     # erro mediano aceito, depois da calibragem, entre a estimativa da CVM e os avisos oficiais
MIN_MESES = 6
YIELD_MAX = 0.04    # rendimento no mês acima disso sobre a cota é suspeito


def _fim_mes(ref: str) -> str:
    y, m = int(ref[:4]), int(ref[5:7])
    prox = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (prox - dt.timedelta(days=1)).isoformat()


def _desloca(ref: str, k: int) -> str:
    n = int(ref[:4]) * 12 + int(ref[5:7]) - 1 + k
    return f"{n // 12}-{n % 12 + 1:02d}"


def informe_cvm() -> pd.DataFrame:
    partes = []
    for ano in range(ANO_INI, dt.date.today().year + 1):
        df = fiis.tabela(fiis.cvm_zip("mensal", ano), "complemento")
        if not df.empty:
            partes.append(df[["_cnpj", "Data_Referencia", "Versao", "Valor_Patrimonial_Cotas", "Percentual_Dividend_Yield_Mes"]])
    df = pd.concat(partes, ignore_index=True)
    df["Versao"] = pd.to_numeric(df["Versao"], errors="coerce").fillna(0)
    df = df.sort_values("Versao").drop_duplicates(["_cnpj", "Data_Referencia"], keep="last")   # vale a última versão entregue
    df["vp"] = pd.to_numeric(df["Valor_Patrimonial_Cotas"], errors="coerce")
    df["dy"] = pd.to_numeric(df["Percentual_Dividend_Yield_Mes"], errors="coerce")
    df["ref"] = df["Data_Referencia"].str[:7]
    return df


def juntar_eventos(*listas) -> list[dict]:
    """Desdobramentos/grupamentos de várias fontes, sem repetir o mesmo evento (até 20 dias e mesmo fator)."""
    out = []
    for lst in listas:
        for e in lst or []:
            d = e.get("data_com") or ((e.get("ref") or e.get("mes") or "") + "-15")
            if not d or not e.get("fator"):
                continue
            if any(abs((dt.date.fromisoformat(d[:10]) - dt.date.fromisoformat(o["data_com"])).days) <= 20 and abs(o["fator"] / e["fator"] - 1) < 0.05 for o in out):
                continue
            out.append({"data_com": d[:10], "fator": float(e["fator"]), "fonte": e.get("fonte")})
    return sorted(out, key=lambda e: e["data_com"])


def fator_posterior(eventos: list, data: str) -> float:
    """Quantas cotas de hoje equivalem a 1 cota na data (desdobramentos e grupamentos depois dela)."""
    f = 1.0
    for e in eventos or []:
        if e["data_com"] >= data[:10]:
            f *= e["fator"]
    return f


def _oficiais(d: dict, eventos: list) -> dict:
    out = {}
    for p in d.get("proventos") or []:
        if p.get("data_base") and p.get("valor") is not None and str(p.get("tipo", "")).lower().startswith("rend"):
            orig = p.get("valor_original", p["valor"])
            ref = p["data_base"][:7]
            out[ref] = out.get(ref, 0.0) + float(orig) / fator_posterior(eventos, p["data_base"])
    return out


def _cvm(d: dict, cvm: pd.DataFrame, eventos: list, referencia: dict) -> tuple[dict, dict]:
    """Estimativa da CVM calibrada pela referência (avisos oficiais; na falta, Investidor10)."""
    cnpj = fiis.so_digitos(d.get("cnpj") or "")
    x = cvm[cvm["_cnpj"] == cnpj].dropna(subset=["vp", "dy"]).set_index("ref") if cnpj else cvm.iloc[0:0]
    est = {r: float(v.dy) * float(v.vp) / fator_posterior(eventos, _fim_mes(r)) for r, v in x.iterrows() if v.dy > 0}
    melhor = None
    for k in (0, -1):          # alguns fundos informam no mês o rendimento anunciado no mês seguinte
        pares = [(v, est[_desloca(r, k)]) for r, v in referencia.items() if _desloca(r, k) in est and v > 0]
        if len(pares) < MIN_MESES:
            continue
        fator = float(pd.Series([o / e for o, e in pares]).median())
        erro = float(pd.Series([abs(o / (e * fator) - 1) for o, e in pares]).median())
        if melhor is None or erro < melhor[2]:
            melhor = (k, fator, erro, len(pares))
    if not melhor or melhor[2] > ERRO_MAX:
        return {}, {"usada": False, "erro_mediano": round(melhor[2], 4) if melhor else None}
    k, fator, erro, n = melhor
    return ({_desloca(r, -k): v * fator for r, v in est.items()},
            {"usada": True, "calibragem": round(fator, 4), "defasagem": k, "erro_mediano": round(erro, 4), "meses_conferidos": n})


def _concorda(a: float, b: float) -> bool:
    return abs(a - b) <= max(0.05 * max(abs(a), abs(b)), 0.002)


def precos_semanais(ticker: str, df_yahoo, cot: list, eventos: list) -> pd.Series:
    """Fechamento semanal (sexta) na base de cotas atual: Yahoo e, antes dele, COTAHIST da B3 ajustado."""
    y = pd.Series(dtype=float)
    if df_yahoo is not None and not df_yahoo.empty:
        y = df_yahoo["Close"].dropna()
        y = y[y > 0]
    b = pd.Series({pd.Timestamp(d): p / fator_posterior(eventos, d) for d, p, _ in cot if p > 0}, dtype=float).sort_index()
    if len(y) and len(b):
        ini_y = y.index[0]
        # confere a emenda: na sobreposição as duas séries devem bater
        comum = b[b.index >= ini_y].index.intersection(y.index)
        if len(comum) >= 20:
            r = (y[comum] / b[comum]).median()
            if abs(r - 1) > 0.03:
                print(f"{ticker}: COTAHIST e Yahoo diferem {r - 1:+.1%} na sobreposição; COTAHIST reescalado")
                b = b * r
        serie = pd.concat([b[b.index < ini_y], y]).sort_index()
    else:
        serie = y if len(y) else b
    return serie.resample("W-FRI").last().dropna()


def serie_fundo(d: dict, cvm: pd.DataFrame, semanal: pd.Series, eventos: list, fontes_extra: dict) -> tuple[dict, str | None, dict]:
    """{data_ex: valor por cota na base atual}, primeiro mês coberto e o relatório de conferência."""
    of = _oficiais(d, eventos)
    i10 = fontes_extra.get("i10") or {}
    rentab = {r: v / fator_posterior(eventos, _fim_mes(r)) for r, v in (fontes_extra.get("rentab") or {}).items()}
    # os documentos do administrador usam o mês de competência; avisos e Investidor10, o mês da data com.
    # Alinha pelo deslocamento que mais concorda com eles, para não contar um pagamento duas vezes na emenda.
    ref_ = {**i10, **of}
    melhor_k, melhor_n = 0, -1
    for k in (0, 1, -1):
        n = sum(1 for r, v in rentab.items() if _desloca(r, k) in ref_ and _concorda(ref_[_desloca(r, k)], v))
        if n > melhor_n:
            melhor_k, melhor_n = k, n
    rentab = {_desloca(r, melhor_k): v for r, v in rentab.items()}
    est, info_cvm = _cvm(d, cvm, eventos, of if len(of) >= MIN_MESES else i10)
    fontes = {"oficial": of, "rentab": rentab, "i10": i10, "cvm": est}
    mensal = semanal.resample("ME").last() if len(semanal) else pd.Series(dtype=float)

    def cota(ref):
        try:
            return float(mensal[mensal.index.strftime("%Y-%m") == ref].iloc[0])
        except Exception:
            return None
    meses = sorted(set().union(*[set(f) for f in fontes.values()]))
    escolha, de_onde, conflitos = {}, {}, []
    for ref in meses:
        cands = [(f, fontes[f][ref]) for f in PRIORIDADE if ref in fontes[f] and fontes[f][ref] is not None]
        grupos = []
        for f, v in cands:
            g = next((g for g in grupos if _concorda(g[0][1], v)), None)
            g.append((f, v)) if g else grupos.append([(f, v)])
        # i10 costuma copiar o aviso oficial: juntos valem um voto só
        voto = lambda g: len({("oficial" if f == "i10" else f) for f, _ in g})   # noqa: E731
        grupos.sort(key=lambda g: (-voto(g), min(PRIORIDADE.index(f) for f, _ in g)))
        p = cota(ref)
        normal = [g for g in grupos if not (p and g[0][1] / p > YIELD_MAX)]
        g = grupos[0]
        if p and g[0][1] / p > YIELD_MAX and normal:
            conflitos.append({"mes": ref, "descartado": g, "usado": normal[0], "motivo": "acima de 4% da cota no mês"})
            g = normal[0]
        elif len(grupos) > 1:
            conflitos.append({"mes": ref, "usado": g, "outros": grupos[1:]})
        f0, v0 = min(g, key=lambda x: PRIORIDADE.index(x[0]))
        escolha[_fim_mes(ref)], de_onde[ref] = v0, f0
    cont = pd.Series(de_onde).value_counts().to_dict() if de_onde else {}
    info = {"meses_por_fonte": {k: int(v) for k, v in cont.items()}, "cvm": info_cvm,
            "conflitos": len(conflitos), "exemplos_conflito": conflitos[:5]}
    primeiro = min(de_onde) if de_onde else None
    return dict(sorted(escolha.items())), primeiro, info


def todos(dfs_yahoo: dict | None = None) -> dict:
    """{ticker: (rendimentos {data_ex: valor}, primeiro mês, info, cotações semanais)} para os FIIs (exceto FI-Infra)."""
    import cotahist
    import i10 as I10
    import rentab_docs
    cvm = informe_cvm()
    fundos = []
    for p in sorted((RAIZ / "data" / "fiis").glob("[A-Z]*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        if "ticker" in d and d.get("tipo") != "infra":
            fundos.append(d)
    cot = cotahist.series({d["ticker"] for d in fundos})
    if dfs_yahoo is None:
        import sources as S
        dfs_yahoo = S.precos_yf([d["ticker"] + ".SA" for d in fundos], anos=17)
    res = {}
    for d in fundos:
        t = d["ticker"]
        try:
            ev = juntar_eventos(d.get("desdobramentos"), cotahist.desdobramentos(cot.get(t) or []))
            semanal = precos_semanais(t, dfs_yahoo.get(t + ".SA"), cot.get(t) or [], ev)
            extra = {"i10": I10.historico(t), "rentab": rentab_docs.historico(t, d.get("cnpj") or "")}
            serie, primeiro, info = serie_fundo(d, cvm, semanal, ev, extra)
            info["eventos"] = ev
            info["listado_desde"] = str(semanal.index[0].date()) if len(semanal) else None
            res[t] = (serie, primeiro, info, semanal)
        except Exception as e:
            print(f"{t}: {e}")
    return res


if __name__ == "__main__":
    r = todos()
    for t, (serie, primeiro, info, sem) in r.items():
        print(t, "listado desde", info["listado_desde"], "| rendimentos desde", primeiro, "|", info["meses_por_fonte"],
              "| conflitos", info["conflitos"], "| cvm", info["cvm"].get("usada"))
