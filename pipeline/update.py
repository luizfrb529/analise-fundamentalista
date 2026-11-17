"""
Pipeline diário: busca, calcula e grava os JSON em /data.

Uso:  .venv\\Scripts\\python pipeline\\update.py            (tudo)
      .venv\\Scripts\\python pipeline\\update.py --sem-noticias

Saídas:
  data/meta.json, data/macro.json, data/prices.json, data/fundamentals.json, data/dividends.json,
  data/indicators_meta.json, data/history/<TICKER>.json, data/news/<TICKER>.json, data/news/_index.json,
  relatorios/cobertura.md
"""
from __future__ import annotations

import datetime as dt
import json
import math
import re
import sys
import traceback
from pathlib import Path
from statistics import pstdev
from zoneinfo import ZoneInfo

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cvm  # noqa: E402
import indicators as I  # noqa: E402
import sec  # noqa: E402
import sources as S  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
DATA = RAIZ / "data"
REL = RAIZ / "relatorios"
TZ = ZoneInfo("America/Sao_Paulo")
AGORA = dt.datetime.now(TZ)
FIN = ("BANCO", "SEGURADORA")

AVISOS: dict[str, list[str]] = {}


def aviso(t, msg):
    AVISOS.setdefault(t, []).append(msg)
    print(f"  [{t}] {msg}")


def limpo(x):
    """Converte NaN/inf em None e numpy em tipos nativos, recursivamente."""
    if isinstance(x, dict):
        return {str(k): limpo(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [limpo(v) for v in x]
    if hasattr(x, "item") and not isinstance(x, (str, bytes)):
        try:
            x = x.item()
        except Exception:
            pass
    if isinstance(x, float) and not math.isfinite(x):
        return None
    return x


def gravar(caminho: Path, obj):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(limpo(obj), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def r4(x, n=6):
    return round(x, n) if I.ok(x) else None


# ===================================================================== preços
def serie_completa(df: pd.DataFrame) -> pd.DataFrame:
    """Remove o pregão de hoje se o pipeline rodar antes das 18h30 (pregão pode não ter fechado)."""
    if df is None or df.empty:
        return df
    hoje = AGORA.date()
    if df.index[-1].date() == hoje and (AGORA.hour, AGORA.minute) < (18, 30):
        df = df.iloc[:-1]
    return df


def stats_preco(df: pd.DataFrame, indice: pd.DataFrame | None) -> dict:
    c = df["Close"]
    adj = df["Adj Close"]
    ult = c.index[-1]

    def var_desde(dias=None, data=None):
        if data is not None:
            base = c[c.index < data]
        else:
            base = c.iloc[:-dias] if len(c) > dias else None
        if base is None or base.empty:
            return None
        return float(c.iloc[-1] / base.iloc[-1] - 1)

    um_ano = c[c.index > ult - pd.Timedelta(days=365)]
    out = {
        "preco": float(c.iloc[-1]),
        "data": ult.strftime("%Y-%m-%d"),
        "var_dia": var_desde(1),
        "var_mes": var_desde(21),
        "var_ano": var_desde(data=pd.Timestamp(ult.year, 1, 1)),
        "var_12m": var_desde(data=ult - pd.Timedelta(days=365)),
        "var_5a": var_desde(data=ult - pd.Timedelta(days=365 * 5)),
        "max_52s": float(um_ano.max()), "min_52s": float(um_ano.min()),
    }
    fin = (df["Close"] * df["Volume"]).iloc[-63:]
    out["liquidez_21"] = float(fin.iloc[-21:].mean()) if len(fin) else None
    out["liquidez_63"] = float(fin.mean()) if len(fin) else None
    out["volatilidade"] = I.volatilidade_anual(list(adj.iloc[-252:]))
    out["drawdown_5a"] = I.max_drawdown(list(adj[adj.index > ult - pd.Timedelta(days=365 * 5)]))
    if indice is not None and not indice.empty:
        j = pd.concat([adj, indice["Adj Close"]], axis=1, join="inner").dropna().iloc[-504:]
        out["beta"] = I.beta(list(j.iloc[:, 0]), list(j.iloc[:, 1]))
    return out


def preco_em(df: pd.DataFrame, data: str):
    if df is None or df.empty:
        return None
    s = df["Close"][df.index <= pd.Timestamp(data)]
    return float(s.iloc[-1]) if len(s) else None


def fator_splits(splits: pd.Series, depois_de: str) -> float:
    """Produto dos desdobramentos ocorridos depois da data (para ajustar quantidades antigas)."""
    if splits is None or len(splits) == 0:
        return 1.0
    s = splits[splits.index.tz_localize(None) > pd.Timestamp(depois_de)] if splits.index.tz is not None else splits[splits.index > pd.Timestamp(depois_de)]
    f = 1.0
    for v in s:
        if v and v > 0:
            f *= float(v)
    return f


# ===================================================================== macro
def macro() -> dict:
    cfg = CFG
    m = {"atualizado_em": AGORA.isoformat()}

    def sgs(serie, nome, div100=True):
        try:
            v = S.bcb_sgs(serie)[-1]
            m[nome] = {"valor": float(v["valor"]) / (100 if div100 else 1), "data": v["data"], "fonte": f"BCB SGS {serie}"}
        except Exception as e:
            m[nome] = None
            aviso("MACRO", f"{nome}: {e}")

    sgs(432, "selic")
    sgs(4389, "cdi")
    sgs(13522, "ipca_12m")
    sgs(1, "ptax", div100=False)
    try:
        hist = S.bcb_sgs_periodo(1, 11)
        m["_ptax_hist"] = {pd.to_datetime(x["data"], dayfirst=True).strftime("%Y-%m-%d"): float(x["valor"]) for x in hist}
    except Exception:
        m["_ptax_hist"] = {}
    try:
        m["ntnb_longa"] = S.tesouro_ntnb_longa()
        if m["ntnb_longa"]:
            m["ntnb_longa"]["fonte"] = "Tesouro Direto, Tesouro IPCA+ de maior vencimento, taxa de compra"
    except Exception as e:
        m["ntnb_longa"] = None
        aviso("MACRO", f"NTN-B: {e}")
    foc = S.focus_ipca_longo()
    m["inflacao_lp_brasil"] = {"valor": foc if foc else cfg["inflacao_longo_prazo_brasil_fallback"],
                               "fonte": "Focus BCB (mediana do ano mais distante)" if foc else "config.json (fallback)"}
    m["inflacao_lp_eua"] = {"valor": cfg["inflacao_longo_prazo_eua"], "fonte": "config.json"}
    try:
        m["treasury_10y"] = S.fred_dgs10()
        m["treasury_10y"]["fonte"] = "FRED DGS10"
    except Exception as e:
        m["treasury_10y"] = None
        aviso("MACRO", f"Treasury: {e}")
    try:
        m["treasury_20y"] = S.fred_dgs10("DGS20")
        m["treasury_20y"]["fonte"] = "FRED DGS20"
    except Exception as e:
        m["treasury_20y"] = None
        aviso("MACRO", f"Treasury 20y: {e}")
    infl = m["inflacao_lp_brasil"]["valor"]
    ntnb = (m.get("ntnb_longa") or {}).get("taxa")
    m["ntnb_nominal"] = (1 + ntnb) * (1 + infl) - 1 if ntnb is not None else None
    m["taxa_ref_brasil"] = I.taxa_referencia(ntnb, infl, cfg["premio_risco_brasil"])
    ust = (m.get("treasury_10y") or {}).get("taxa")
    m["taxa_ref_exterior"] = I.taxa_referencia(None, 0, cfg["premio_risco_exterior"], nominal_direto=ust)
    return m


# índices e ativos exibidos na faixa de mercado do site (ticker yfinance -> chave em macro.json)
MERCADO_FAIXA = {"IFIX.SA": "ifix", "^IXIC": "nasdaq", "BRL=X": "dolar", "EURBRL=X": "euro", "BZ=F": "brent", "GC=F": "ouro"}


# ===================================================================== proventos
SEGMENTOS_B3 = {"NM": "Novo Mercado", "N1": "Nível 1", "N2": "Nível 2", "BOLSA": "Tradicional", "MA": "Bovespa Mais",
                "M2": "Bovespa Mais Nível 2", "DR3": "BDR Nível III"}


def classes_fca(fca: dict, cnpj: str, ticker: str) -> dict:
    """Tickers de cada classe e composição da unit, pelo Formulário Cadastral (FCA) da CVM."""
    df = fca.get("fca_cia_aberta_valor_mobiliario")
    if df is None or df.empty:
        return {}
    x = df[(df["CNPJ_Companhia"] == cnpj) & df["Codigo_Negociacao"].notna() & df["Data_Fim_Negociacao"].isna()]
    if "Mercado" in x:
        x = x[x["Mercado"].fillna("").str.startswith("Bolsa")]
    if "Data_Referencia" in x and len(x):
        x = x[x["Data_Referencia"] == x["Data_Referencia"].max()]
    # o FCA tem erros de cadastro (classe trocada, códigos como "4030" ou "000000"); a regra do código manda:
    # final 3 = ON; final 4, 5, 6, 7, 8 = PN; o FCA só ajuda a achar qual PN existe e a composição da unit
    emissor = ticker[:4]
    valido = lambda c: isinstance(c, str) and re.fullmatch(emissor + r"\d{1,2}", c.strip() or "") is not None
    codigos = [r["Codigo_Negociacao"].strip() for _, r in x.iterrows() if valido(r["Codigo_Negociacao"])]
    out = {"classes": {"ON": emissor + "3"}}
    pn = [c for c in codigos if c[-1] in "45678" and len(c) == 5]
    if ticker[-1] in "45678" and len(ticker) == 5:
        out["classes"]["PN"] = ticker
    elif pn:
        out["classes"]["PN"] = sorted(pn)[0]
    elif ticker.endswith("11") or any("prefer" in cvm.norm(r["Valor_Mobiliario"]) for _, r in x.iterrows()):
        out["classes"]["PN"] = emissor + "4"
    for _, r in x.iterrows():
        comp = r.get("Composicao_BDR_Unit")
        if "unit" not in cvm.norm(r["Valor_Mobiliario"]) or not isinstance(comp, str):
            continue
        n_on = n_pn = 0
        for n, tok in re.findall(r"(\d+)\s*([A-Z]{4}\d{1,2}|ON|PN[AB]?)", comp.upper()):
            if tok == "ON" or tok.endswith("3"):
                n_on += int(n)
            else:
                n_pn += int(n)
        if n_on + n_pn:
            out["composicao_unit"] = f"{n_on} ON + {n_pn} PN"
            out["acoes_por_papel"] = n_on + n_pn
            out["composicao_fonte"] = f"FCA: '{comp.strip()}'"
    return out


def classe_isin(isin: str) -> str:
    # ISIN brasileiro: BR + emissor (4) + "AC"/"CD" + espécie (NOR, NPR, NPA...) + dígito
    s = (isin or "")[8:11]
    if (isin or "")[6:8] == "CD":
        return "UNIT"
    if s == "NOR":
        return "ON"
    if s.startswith("NP"):
        return "PN"
    if s.startswith("CD") or s.startswith("UN"):
        return "UNIT"
    return s


def proventos_b3(info: dict, ativo: dict, splits) -> list[dict]:
    """Lista de proventos do papel (por ação do papel, ajustado por desdobramentos posteriores)."""
    comp = None
    m = re.match(r"(\d+) ON \+ (\d+) PN", ativo.get("composicao_unit") or "")
    if m:
        comp = {"ON": int(m.group(1)), "PN": int(m.group(2))}
    alvo = "ON" if ativo["ticker"].endswith("3") else "PN"
    out = []
    por_data = {}
    for d in info.get("cashDividends") or []:
        cls = classe_isin(d.get("isinCode") or d.get("assetIssued"))
        data_com = d.get("lastDatePrior")
        try:
            data_com = dt.datetime.strptime(data_com, "%d/%m/%Y").strftime("%Y-%m-%d")
        except Exception:
            continue
        valor = S.num_br(d.get("rate"))
        if valor is None:
            continue
        tipo = "JCP" if "JRS" in (d.get("label") or "").upper() else ("DIVIDENDO" if "DIVID" in (d.get("label") or "").upper() else (d.get("label") or "").title())
        pag = d.get("paymentDate")
        try:
            pag = dt.datetime.strptime(pag, "%d/%m/%Y").strftime("%Y-%m-%d")
        except Exception:
            pag = None
        valor /= fator_splits(splits, data_com) if splits is not None else 1.0
        if comp:
            if cls not in comp:
                continue
            k = (data_com, tipo, pag)
            por_data[k] = por_data.get(k, 0.0) + valor * comp[cls]
        elif cls == alvo:
            out.append({"data_com": data_com, "pagamento": pag, "valor": valor, "tipo": tipo, "referente": d.get("relatedTo")})
    for (data_com, tipo, pag), v in por_data.items():
        out.append({"data_com": data_com, "pagamento": pag, "valor": v, "tipo": tipo, "referente": None})
    out.sort(key=lambda x: x["data_com"], reverse=True)
    return out


def proventos_yf(serie) -> list[dict]:
    if serie is None or len(serie) == 0:
        return []
    out = []
    for d, v in serie.items():
        out.append({"data_com": pd.Timestamp(d).strftime("%Y-%m-%d"), "pagamento": None, "valor": float(v), "tipo": "PROVENTO", "referente": None})
    return sorted(out, key=lambda x: x["data_com"], reverse=True)


def dpa_por_ano(lista: list[dict]) -> dict[int, float]:
    out = {}
    for p in lista:
        a = int(p["data_com"][:4])
        out[a] = out.get(a, 0.0) + p["valor"]
    return out


# ===================================================================== CVM auxiliares
def escala_acoes(qtd, referencia):
    """A CVM grava composição do capital às vezes em milhares. Escolhe 1, 1.000 ou 1.000.000 pelo total da B3."""
    if not qtd or not referencia:
        return qtd
    melhor = min((1, 1000, 1_000_000), key=lambda k: abs(math.log((qtd * k) / referencia)))
    return qtd * melhor


def acoes_cvm(tabs_por_ano: dict, cnpj: str, ref_total: float):
    """{data_ref: (total_em_circulacao, on, pn, tesouro_on, tesouro_pn)} a partir de composicao_capital."""
    out = {}
    for ano, tabs in tabs_por_ano.items():
        for nome, df in tabs.items():
            if "composicao_capital" not in nome or df.empty:
                continue
            x = df[df["CNPJ_CIA"] == cnpj]
            for _, r in x.iterrows():
                try:
                    tot = float(r["QT_ACAO_TOTAL_CAP_INTEGR"])
                    on, pn = float(r["QT_ACAO_ORDIN_CAP_INTEGR"]), float(r["QT_ACAO_PREF_CAP_INTEGR"])
                    ton, tpn = float(r["QT_ACAO_ORDIN_TESOURO"]), float(r["QT_ACAO_PREF_TESOURO"])
                except (ValueError, KeyError):
                    continue
                if tot <= 0:
                    continue
                k = escala_acoes(tot, ref_total) / tot
                out[r["DT_REFER"]] = (k * (tot - ton - tpn), k * on, k * pn, k * ton, k * tpn)
    return dict(sorted(out.items()))


def fre_acionistas(fre: dict, cnpj: str) -> dict:
    df = fre.get("fre_cia_aberta_posicao_acionaria")
    if df is None or df.empty:
        return {}
    x = df[df["CNPJ_Companhia"] == cnpj].copy()
    if x.empty:
        return {}
    x["Versao"] = pd.to_numeric(x["Versao"], errors="coerce")
    x = x[x["Data_Referencia"] == x["Data_Referencia"].max()]
    x = x[x["Versao"] == x["Versao"].max()]
    diretos = x[x["ID_Acionista_Relacionado"].isna()] if "ID_Acionista_Relacionado" in x else x
    pct = pd.to_numeric(diretos["Percentual_Total_Acoes_Circulacao"], errors="coerce").fillna(0)
    ctrl_mask = diretos["Acionista_Controlador"] == "S"
    tes_mask = diretos["Acionista"].fillna("").str.lower().str.contains("tesouraria")
    controladores = [{"nome": n, "pct": float(p) / 100} for n, p in zip(diretos[ctrl_mask]["Acionista"], pct[ctrl_mask])]
    c = float(pct[ctrl_mask].sum()) / 100
    t = float(pct[tes_mask].sum()) / 100
    return {"controladores": controladores, "controlador_pct": c if c > 0 else None,
            "free_float": max(0.0, 1 - c - t) if c > 0 else None, "fre_data": str(x["Data_Referencia"].iloc[0])}


def fre_participacao(fre: dict, cnpj_holding: str, cnpj_investida: str):
    """Participação (fração) da holding na investida, segundo o FRE (seção participações em sociedades)."""
    df = fre.get("fre_cia_aberta_participacao_sociedade")
    if df is None or df.empty or not cnpj_holding or not cnpj_investida:
        return None
    dig = lambda s: re.sub(r"\D", "", str(s))
    x = df[(df["CNPJ_Companhia"].map(dig) == dig(cnpj_holding)) & (df["CNPJ"].map(dig) == dig(cnpj_investida))].copy()
    if x.empty:
        return None
    x["Versao"] = pd.to_numeric(x["Versao"], errors="coerce")
    x = x.sort_values(["Data_Referencia", "Versao"])
    v = pd.to_numeric(x["Participacao_Emissor"].iloc[-1], errors="coerce")
    return float(v) / 100 if pd.notna(v) else None


def valor_mercado_simples(ticker: str, precos: dict):
    """Valor de mercado aproximado de uma investida fora do universo: total de ações da B3 x preço do papel."""
    try:
        j = S.b3_emissor(ticker[:4])
        q = (S.num_br(j.get("numberCommonShares")) or 0) + (S.num_br(j.get("numberPreferredShares")) or 0)
        df = serie_completa(precos.get(ticker + ".SA"))
        return float(df["Close"].iloc[-1]) * q if q and df is not None and len(df) else None
    except Exception:
        return None


def fca_segmentos(fca: dict, cnpj: str) -> dict:
    df = fca.get("fca_cia_aberta_valor_mobiliario")
    if df is None or df.empty:
        return {}
    x = df[(df["CNPJ_Companhia"] == cnpj) & df["Codigo_Negociacao"].notna()]
    return {r["Codigo_Negociacao"]: r["Segmento"] for _, r in x.iterrows()}


def comunicados_cvm(ipe: list[pd.DataFrame], cd: str) -> tuple[list, dict]:
    cats = {"fato relevante": "Fato relevante", "comunicado ao mercado": "Comunicado ao mercado",
            "dados economico-financeiros": "Resultado / dados financeiros", "aviso aos acionistas": "Aviso aos acionistas",
            "calendario de eventos corporativos": "Calendário de eventos"}
    linhas = []
    cal = None
    for df in ipe:
        if df is None or df.empty:
            continue
        x = df[df["Codigo_CVM"].str.lstrip("0") == cd]
        for _, r in x.iterrows():
            cat = cvm.norm(r.get("Categoria", ""))
            if cat not in cats:
                continue
            txt = lambda v: v.strip() if isinstance(v, str) else ""
            item = {"data": r.get("Data_Entrega"), "categoria": cats[cat], "titulo": txt(r.get("Assunto")) or txt(r.get("Tipo")) or txt(r.get("Especie")) or cats[cat],
                    "link": r.get("Link_Download"), "fonte": "CVM (IPE)"}
            if cat == "calendario de eventos corporativos":
                if not cal or item["data"] > cal["data"]:
                    cal = item
            linhas.append(item)
    linhas.sort(key=lambda x: x["data"] or "", reverse=True)
    vistos, out = set(), []
    for l in linhas:
        k = (l["data"], l["titulo"], l["categoria"])
        if k not in vistos:
            vistos.add(k)
            out.append(l)
    return out[:20], cal


def comunicados_sec(cik: int) -> list:
    try:
        s = S.sec_submissions(cik)
    except Exception as e:
        return []
    r = s["filings"]["recent"]
    nomes = {"8-K": "Comunicado (8-K)", "10-Q": "Resultado trimestral (10-Q)", "10-K": "Relatório anual (10-K)",
             "6-K": "Comunicado (6-K)", "20-F": "Relatório anual (20-F)"}
    out = []
    for f, d, acc, doc, desc in zip(r["form"], r["filingDate"], r["accessionNumber"], r["primaryDocument"], r.get("primaryDocDescription", [""] * len(r["form"]))):
        if f in nomes:
            out.append({"data": d, "categoria": nomes[f], "titulo": (desc or f).strip() or f,
                        "link": f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}/{doc}", "fonte": "SEC EDGAR"})
        if len(out) >= 20:
            break
    return out


# ===================================================================== núcleo por ativo
def grupo_modelo(m):
    return "BANCO" if m == "BANCO" else ("SEGURADORA" if m == "SEGURADORA" else "GERAL")


def media_ult(series: dict, chave: str, n: int = 5):
    anos = sorted(series)[-n:]
    return I.media(series[a].get(chave) for a in anos)


def cagr_serie(series: dict, chave: str, anos: int):
    disp = [a for a in sorted(series) if I.ok(series[a].get(chave))]
    if not disp:
        return None, None
    fim = disp[-1]
    ini = fim - anos
    if ini in series and I.ok(series[ini].get(chave)):
        return I.cagr(series[ini][chave], series[fim][chave], anos), anos
    return None, None


def processar(ativo: dict, ctx: dict) -> dict:
    t = ativo["ticker"]
    tipo = ativo["tipo"]
    modelo = ativo["modelo_analise"]
    gm = grupo_modelo(modelo)
    cfg = CFG
    mac = ctx["macro"]
    precos = ctx["precos"]
    res = {"ticker": t, "erros": []}
    bdr = tipo.startswith("BDR")
    infl = mac["inflacao_lp_eua"]["valor"] if ativo.get("moeda_reporte") == "USD" else mac["inflacao_lp_brasil"]["valor"]
    g = infl + cfg["g_real_por_setor_micro"].get(ativo["setor_micro"], cfg["g_real_padrao"])
    usd = ativo.get("moeda_reporte") == "USD"
    taxa_ref = mac["taxa_ref_exterior"] if usd else mac["taxa_ref_brasil"]
    titulo_ref = (mac.get("treasury_10y") or {}).get("taxa") if usd else mac.get("ntnb_nominal")
    ptax = (mac.get("ptax") or {}).get("valor")

    # ---------------- mercado do papel na B3
    df_papel = serie_completa(precos.get(t + ".SA"))
    if df_papel is None or df_papel.empty:
        aviso(t, "sem preço no yfinance")
        return res
    idx = precos.get("^GSPC") if tipo == "BDR_EXTERIOR" else precos.get("^BVSP")
    mercado = stats_preco(df_papel, serie_completa(idx) if tipo != "BDR_EXTERIOR" else None)
    bq = ctx["brapi"].get(t)
    if bq and bq.get("regularMarketPrice"):
        mercado["preco_brapi"] = bq["regularMarketPrice"]
    res["mercado"] = mercado
    preco_papel = mercado["preco"]

    # ---------------- fundamentos
    splits = None
    info_b3 = {}
    if not bdr:
        splits = S.acoes_de(precos.get(t + ".SA"), "Stock Splits")
        divs_yf = S.acoes_de(precos.get(t + ".SA"), "Dividends")
        info_b3 = S.b3_emissor(ativo["emissor_b3"])
        cd = info_b3["codeCVM"].lstrip("0")
        cnpj = ctx["cadastro"][cd]["cnpj"]
        res["cd_cvm"], res["cnpj"] = cd, cnpj
        anuais = ctx["base"].anuais(cd, gm)
        data_ref, ltm, ltm_ant, saldo_ant = ctx["base"].ltm(cd, gm, anuais)
        fonte_fund = "CVM (DFP/ITR, consolidado)"
        # ações
        on_b3 = S.num_br(info_b3.get("numberCommonShares")) or 0
        pn_b3 = S.num_br(info_b3.get("numberPreferredShares")) or 0
        hist_acoes = acoes_cvm({**ctx["dfp"], **{f"i{k}": v for k, v in ctx["itr"].items()}}, cnpj, on_b3 + pn_b3)
        ult = hist_acoes[max(hist_acoes)] if hist_acoes else None
        if ult:   # composição do capital do último ITR/DFP (fonte: a própria companhia na CVM)
            # desdobramento ou grupamento depois da data do ITR: o preço já está ajustado, a quantidade precisa estar também
            fs = fator_splits(splits, max(hist_acoes))
            acoes_on, acoes_pn = (ult[1] - ult[3]) * fs, (ult[2] - ult[4]) * fs
            if fs != 1:
                aviso(t, f"quantidade de ações da CVM ajustada por desdobramento/grupamento posterior ao ITR (fator {fs:g})")
            if abs((acoes_on + acoes_pn) / max(on_b3 + pn_b3, 1) - 1) > 0.05:
                aviso(t, f"total de ações CVM ({acoes_on + acoes_pn:,.0f}) difere da B3 ({on_b3 + pn_b3:,.0f}); usado CVM")
        else:
            acoes_on, acoes_pn = on_b3, pn_b3
            aviso(t, "sem composição do capital na CVM; usado total da B3 sem descontar tesouraria")
        acoes = acoes_on + acoes_pn
        # valor de mercado somando classes
        vm = 0.0
        partes = []
        for cls, q in (("ON", acoes_on), ("PN", acoes_pn)):
            if q <= 0:
                continue
            tk = ativo.get("classes", {}).get(cls)
            p = None
            if tk:
                dfc = serie_completa(precos.get(tk + ".SA"))
                p = float(dfc["Close"].iloc[-1]) if dfc is not None and len(dfc) else None
            if p is None:
                p = preco_papel / (ativo.get("acoes_por_papel") or 1)
                aviso(t, f"sem preço da classe {cls}; usado preço do papel")
            vm += p * q
            partes.append({"classe": cls, "ticker": tk, "acoes": q, "preco": p})
        res["valor_mercado_partes"] = partes
        preco_calc = preco_papel
        fator = ativo.get("acoes_por_papel") or 1
        moeda = "BRL"
        vm_brl = vm
        dpa_lista = proventos_b3(info_b3, ativo, splits)
        fonte_prov = "B3 (proventos em dinheiro)"
        if not dpa_lista:
            dpa_lista = proventos_yf(divs_yf)
            fonte_prov = "yfinance" if dpa_lista else "sem proventos"
        # anos anteriores ao início da lista da B3 vêm do yfinance (sem separação dividendo/JCP)
        dpa_ano = dpa_por_ano(dpa_lista)
        res["proventos_ano_fonte"] = {a: ("B3" if fonte_prov.startswith("B3") else "yfinance") for a in dpa_ano}
        try:
            if dpa_lista and fonte_prov.startswith("B3"):
                ini_b3 = min(int(p["data_com"][:4]) for p in dpa_lista)
                for a, v in dpa_por_ano(proventos_yf(divs_yf)).items():
                    if a < ini_b3 or (a == ini_b3 and v > dpa_ano.get(a, 0)):
                        dpa_ano[a] = v
                        res["proventos_ano_fonte"][a] = "yfinance"
        except Exception:
            pass
        acionistas = fre_acionistas(ctx["fre"], cnpj)
        seg_fca = fca_segmentos(ctx["fca"], cnpj)
        comunic, calendario = comunicados_cvm(ctx["ipe"], cd)
        seg_b3 = (info_b3.get("segment") or "").upper()
        seg_nome = SEGMENTOS_B3.get(seg_b3, seg_b3 or None)
        if ativo.get("segmento_listagem") and seg_b3 and ativo["segmento_listagem"].upper() != seg_b3:
            aviso(t, f"segmento no universe ({ativo['segmento_listagem']}) difere da B3 ({seg_b3})")
        tag, tag_fonte = ativo.get("tag_along"), "universe.json"
        if tag is None:
            classe_papel = "ON" if t.endswith("3") else ("UNIT" if t.endswith("11") else "PN")
            if seg_b3 in ("NM", "N2", "MA", "M2"):
                tag, tag_fonte = 100, f"regra do segmento {seg_nome}"
            elif classe_papel == "ON":
                tag, tag_fonte = 80, "Lei 6.404 art. 254-A (ações ON)"
            else:
                tag, tag_fonte = None, "PN fora do Novo Mercado/N2: depende do estatuto (preencher em universe.json)"
        res["governanca"] = {**acionistas, "segmento_b3": seg_b3, "segmento_fca": seg_fca.get(t) or next(iter(seg_fca.values()), None),
                             "tag_along": tag, "tag_along_fonte": tag_fonte, "segmento_listagem": ativo.get("segmento_listagem") or seg_nome}
        ativo["tag_along"] = tag
        # histórico de ações ajustado por desdobramento, por exercício
        acoes_ano = {}
        for a in anuais:
            cand = [d for d in hist_acoes if d <= f"{a}-12-31"]
            if cand:
                q = hist_acoes[cand[-1]][0] * fator_splits(splits, cand[-1])
                acoes_ano[a] = (q, False)
            elif hist_acoes:
                d0 = min(hist_acoes)
                acoes_ano[a] = (hist_acoes[d0][0] * fator_splits(splits, d0), True)
        df_hist = df_papel
        precos_classes = {cls: serie_completa(precos.get(tk + ".SA")) for cls, tk in ativo.get("classes", {}).items()}
        frac = {p["classe"]: p["acoes"] / acoes for p in partes} if acoes else {}

        def vm_em(data, q):
            v = 0.0
            for cls, fr in frac.items():
                dfc = precos_classes.get(cls)
                p = preco_em(dfc, data) if dfc is not None else None
                if p is None:
                    p0 = preco_em(df_papel, data)
                    p = p0 / fator if p0 else None
                if p is None:
                    return None
                v += p * q * fr
            return v
    else:
        # ---------------- BDR
        ext = ativo["ticker_exterior"]
        df_ext = serie_completa(precos.get(ext))
        if df_ext is None or df_ext.empty:
            aviso(t, f"sem preço do papel no exterior {ext}")
            return res
        mercado_ext = stats_preco(df_ext, serie_completa(precos.get("^GSPC")))
        if tipo == "BDR_EXTERIOR":
            mercado["beta"] = mercado_ext.get("beta")
        else:
            mercado["beta"] = stats_preco(df_papel, serie_completa(precos.get("^BVSP"))).get("beta")
        cik = S.sec_cik(ext)
        res["cik"] = cik
        anuais, ltm, ltm_ant, saldo_ant, data_ref = {}, {}, None, None, None
        fonte_fund = "SEC EDGAR (XBRL)"
        acoes, hist_sh = None, []
        moeda_rep = ativo.get("moeda_reporte") or "USD"
        facts = {}
        if cik:
            try:
                facts = S.sec_companyfacts(cik)
                fz = sec.fundamentos(facts, moeda_rep)
                anuais, ltm, ltm_ant, saldo_ant, data_ref = fz["anuais"], fz["ltm"] or {}, fz["ltm_ant"], fz["saldo_ant"], fz["data_ref"]
                acoes, hist_sh = sec.acoes_em_circulacao(facts)
            except Exception as e:
                aviso(t, f"SEC: {e}")
        if not ltm or ltm.get("lucro_liq") is None:
            ly = sec.ltm_yfinance(ext)
            if ly.get("lucro_liq") is not None:
                ltm = ly
                data_ref = ly.get("_fim")
                fonte_fund = "SEC EDGAR (XBRL anual) + yfinance (LTM trimestral)"
                aviso(t, "SEC sem trimestrais em XBRL (emissor estrangeiro, 6-K); LTM pelo yfinance")
            for a, d in sec.anuais_yfinance(ext).items():
                if a not in anuais:
                    anuais[a] = d
        yx = S.acoes_yf(ext)
        if not acoes:
            try:
                acoes = float(yx.fast_info.get("shares") or yx.info.get("sharesOutstanding"))
                aviso(t, "número de ações pelo yfinance (SEC sem dei:EntityCommonStockSharesOutstanding)")
            except Exception:
                acoes = None
        splits = S.acoes_de(precos.get(ext), "Stock Splits")
        # empresa que reporta em reais (XP, Inter): preço lá fora convertido pela PTAX para casar com o balanço
        conv = ptax if moeda_rep == "BRL" and ptax else 1.0
        preco_calc = mercado_ext["preco"] * conv
        fator = 1
        moeda = moeda_rep
        vm = preco_calc * acoes if acoes else None
        vm_brl = vm * (1.0 if moeda_rep == "BRL" else ptax) if vm and ptax else None
        res["mercado_exterior"] = mercado_ext
        dpa_lista = proventos_yf(S.acoes_de(precos.get(ext), "Dividends"))
        for p_ in dpa_lista:
            p_["valor"] *= conv
        fonte_prov = "yfinance (proventos do papel no exterior" + (", convertidos pela PTAX atual)" if conv != 1 else ", US$)")
        dpa_ano = dpa_por_ano(dpa_lista)
        acoes_ano = {}
        for a, d in anuais.items():
            fim = d.get("_fim") or f"{a}-12-31"
            cand = [(e, v) for e, v in hist_sh if e <= fim]
            if cand:
                acoes_ano[a] = (cand[-1][1] * fator_splits(splits, cand[-1][0]), False)
            elif acoes:
                acoes_ano[a] = (acoes, True)
        df_hist = df_ext
        if conv != 1 and ctx.get("ptax_hist"):
            px = pd.Series(ctx["ptax_hist"])
            px.index = pd.to_datetime(px.index)
            px = px.sort_index().reindex(df_ext.index.union(px.index)).ffill().reindex(df_ext.index).fillna(conv)
            df_hist = df_ext.copy()
            df_hist["Close"] = df_ext["Close"] * px.values
        res["_facts"] = facts
        comunic = comunicados_sec(cik) if cik else []
        calendario = None
        res["governanca"] = {"segmento_listagem": ativo.get("segmento_listagem"), "tag_along": None}

        ptax_hist = ctx.get("ptax_hist") or {}

        def vm_em(data, q):
            p = preco_em(df_ext, data)
            if p and conv != 1:   # histórico em reais: PTAX da data (ou a mais próxima anterior)
                ds = [d for d in ptax_hist if d <= data]
                p *= ptax_hist[max(ds)] if ds else conv
            return p * q if p and q else None

        # bloco BDR (sempre em US$ no exterior)
        px_ext = mercado_ext["preco"]
        prop = ativo.get("proporcao_bdr")
        justo = px_ext * ptax / prop if prop and ptax else None
        implicita = px_ext * ptax / preco_papel if ptax and preco_papel else None
        res["bdr"] = {"ticker_exterior": ext, "bolsa_exterior": ativo.get("bolsa_exterior"), "proporcao": prop,
                      "proporcao_fonte": ativo.get("proporcao_fonte"), "preco_exterior": px_ext,
                      "data_exterior": mercado_ext["data"], "ptax": ptax, "preco_justo": justo,
                      "agio": preco_papel / justo - 1 if justo else None, "proporcao_implicita": implicita,
                      "proporcao_confere": bool(implicita and prop and abs(implicita / prop - 1) < cfg["bdr_alerta_proporcao"])}
        if implicita and prop and abs(implicita / prop - 1) >= cfg["bdr_alerta_proporcao"]:
            aviso(t, f"proporção declarada {prop} difere da implícita pelo preço {implicita:.2f}")

    res["fonte_fundamentos"] = fonte_fund
    res["fonte_proventos"] = fonte_prov
    res["data_balanco"] = data_ref
    res["moeda_fundamentos"] = moeda
    res["comunicados"] = comunic
    res["calendario"] = calendario

    # ---------------- proventos 12m
    corte = (pd.Timestamp(mercado["data"]) - pd.Timedelta(days=365)).strftime("%Y-%m-%d")
    p12 = [p for p in dpa_lista if p["data_com"] > corte]
    dpa_12m = sum(p["valor"] for p in p12) if dpa_lista is not None else None
    jcp12 = sum(p["valor"] for p in p12 if p["tipo"] == "JCP")
    por_tipo = {}
    for p in dpa_lista:
        a = p["data_com"][:4]
        por_tipo.setdefault(a, {"DIVIDENDO": 0.0, "JCP": 0.0, "OUTROS": 0.0})
        por_tipo[a][p["tipo"] if p["tipo"] in ("DIVIDENDO", "JCP") else "OUTROS"] += p["valor"]
    res["proventos"] = {"lista": dpa_lista[:60], "por_ano": dpa_ano, "por_ano_tipo": por_tipo, "fonte": fonte_prov,
                        "fonte_por_ano": res.get("proventos_ano_fonte"), "moeda": "USD" if bdr else "BRL"}
    dpa_12m_calc = dpa_12m
    if not bdr and fator != 1:
        pass  # proventos da B3 já vêm por papel (unit = 1 ON + 2 PN)

    # ---------------- snapshot LTM
    m_ltm = {"preco": preco_calc, "valor_mercado": vm, "acoes": acoes, "dpa_12m": dpa_12m_calc, "acoes_por_papel": fator}
    ind = I.calcular(ltm, m_ltm, gm) if ltm else {}
    ind["preco"] = preco_papel
    ind["valor_mercado_brl"] = vm_brl
    ind["acoes"] = acoes
    ind["jcp_pct_12m"] = jcp12 / dpa_12m if dpa_12m else None
    ind["recompras_ltm"] = abs(ltm.get("recompras")) if I.ok(ltm.get("recompras")) else None
    ind["porte"] = I.porte(vm_brl, cfg["porte_faixas_brl"])
    for k in ("liquidez_21", "liquidez_63", "volatilidade", "beta", "drawdown_5a"):
        ind[k] = mercado.get(k)
    gov = res.get("governanca", {})
    ind["free_float"] = gov.get("free_float")
    ind["controlador_pct"] = gov.get("controlador_pct")
    ind["tag_along"] = ativo.get("tag_along")

    # ---------------- histórico anual
    hist = {}
    for a, f in sorted(anuais.items()):
        fim = f.get("_fim") or f"{a}-12-31"
        q, est = acoes_ano.get(a, (None, True))
        vma = vm_em(fim, q) if q else None
        dpa_a = dpa_ano.get(int(fim[:4]))
        p_fim = preco_em(df_hist, fim)
        h = I.calcular(f, {"preco": p_fim, "valor_mercado": vma, "acoes": q, "dpa_12m": dpa_a, "acoes_por_papel": fator}, gm)
        h.update({"receita": f.get("receita"), "lucro_liq": f.get("lucro_liq"), "ebit": f.get("ebit"), "pl_contabil": f.get("pl"),
                  "acoes": q, "acoes_estimadas": est, "preco_fim": p_fim, "dpa": dpa_a, "fim": fim})
        if gm == "BANCO":
            h["carteira"] = f.get("carteira")
        hist[a] = h
    res["historico"] = hist

    ult5 = sorted(hist)[-5:]
    ult3 = sorted(hist)[-3:]
    ult_fy = max(hist) if hist else None
    # médias de 5 anos de todos os indicadores numéricos do histórico
    medias = {}
    for k in set(k for a in ult5 for k in hist[a]):
        vals = [hist[a].get(k) for a in ult5]
        if all(isinstance(v, (int, float)) or v is None for v in vals) and k not in ("acoes", "fim"):
            medias[k] = I.media(vals)
    res["medias_5a"] = medias

    def vs_media(k):
        return ind[k] / medias[k] - 1 if I.ok(ind.get(k), medias.get(k)) and medias[k] > 0 else None
    ind["pl_vs_media5"] = vs_media("pl")
    ind["evebitda_vs_media5"] = vs_media("ev_ebitda")
    ind["pvp_vs_media5"] = vs_media("pvp")

    # crescimento
    for k, nome in (("receita", "receita"), ("ebitda", "ebitda"), ("lucro_liq", "lucro"), ("lpa", "lpa")):
        for n in (5, 10):
            v, _ = cagr_serie(hist, k, n)
            if v is None and n == 10:
                disp = [a for a in sorted(hist) if I.ok(hist[a].get(k))]
                if len(disp) >= 7:
                    v = I.cagr(hist[disp[0]][k], hist[disp[-1]][k], disp[-1] - disp[0])
                    ind[f"cagr_{nome}_10a_anos"] = disp[-1] - disp[0]
            ind[f"cagr_{nome}_{n}a"] = v
    ano_completo = AGORA.year - 1
    for n in (5, 10):
        ini = ano_completo - n
        ind[f"cagr_dpa_{n}a"] = I.cagr(dpa_ano.get(ini), dpa_ano.get(ano_completo), n)
    ind["cresc_receita_ltm"] = I.div(ltm.get("receita"), (ltm_ant or {}).get("receita")) - 1 if I.ok(I.div(ltm.get("receita"), (ltm_ant or {}).get("receita"))) and (ltm_ant or {}).get("receita", 0) > 0 else None
    la = (ltm_ant or {}).get("lucro_liq")
    ind["cresc_lucro_ltm"] = ltm["lucro_liq"] / la - 1 if I.ok(ltm.get("lucro_liq"), la) and la > 0 else None
    ult10 = sorted(hist)[-11:]
    ind["consist_receita"] = I.consistencia_crescimento([hist[a].get("receita") for a in ult10])
    ind["consist_lucro"] = I.consistencia_crescimento([hist[a].get("lucro_liq") for a in ult10])
    ind["anos_historico"] = len(hist)
    # Piotroski F-Score: dois últimos exercícios anuais (não se aplica a bancos e seguradoras)
    if gm not in ("BANCO", "SEGURADORA") and len(hist) >= 2:
        a1, a0 = sorted(hist)[-1], sorted(hist)[-2]
        pts, testes = I.piotroski(hist[a1], hist[a0])
        ind["piotroski"] = pts
        res["piotroski"] = {"pontos": pts, "testes": testes, "anos": [a0, a1]}
    # proventos
    anos_compl = [a for a in range(ano_completo - 9, ano_completo + 1)]
    serie_dpa = [dpa_ano.get(a, 0.0) for a in anos_compl if a >= min(dpa_ano or {ano_completo: 0})]
    ind["anos_pagando"] = I.anos_seguidos_positivos([dpa_ano.get(a, 0.0) for a in anos_compl])
    ind["anos_corte"] = I.anos_com_corte(serie_dpa)
    dys = []
    for a in range(ano_completo - 4, ano_completo + 1):
        p = preco_em(df_hist, f"{a}-12-31")
        if p and a in dpa_ano:
            dys.append(dpa_ano[a] / p)
        elif p:
            dys.append(0.0)
    ind["dy_medio_5a"] = I.media(dys)
    dpa_medio_5 = I.media([dpa_ano.get(a, 0.0) for a in range(ano_completo - 4, ano_completo + 1)])
    # governança: diluição
    if acoes and acoes_ano:
        for n in (3, 5):
            a0 = AGORA.year - n
            cand = [a for a in acoes_ano if a <= a0]
            if cand and not acoes_ano[max(cand)][1]:
                ind[f"diluicao_{n}a"] = acoes / acoes_ano[max(cand)][0] - 1
    # Graham e Bazin (por papel; BDR em US$ sobre o preço lá fora)
    ind["graham"] = I.graham(ind.get("lpa"), ind.get("vpa"))
    ind["graham_margem"] = I.margem_seguranca(ind["graham"], preco_calc)
    ind["bazin"] = I.bazin(dpa_medio_5, cfg["bazin_taxa"])
    ind["bazin_margem"] = I.margem_seguranca(ind["bazin"], preco_calc)
    ind["peg"] = I.peg(ind.get("pl"), ind.get("cagr_lpa_5a"))
    # estabilidade de margem
    ml = [hist[a].get("margem_liquida") for a in ult5 if I.ok(hist[a].get("margem_liquida"))]
    ind["estab_margem"] = pstdev(ml) if len(ml) >= 3 else None

    # ---------------- TIR e crescimento implícitos
    ind["g"] = g
    ind["taxa_referencia"] = taxa_ref
    lucro3 = I.media(hist[a].get("lucro_liq") for a in ult3)
    fcl3 = I.media(hist[a].get("fcl") for a in ult3)
    if gm in FIN:
        roe3 = I.media(hist[a].get("roe") for a in ult3)
        pay = ind.get("payout")
        ind["roe_sustentavel"] = roe3
        ind["tir_banco"] = I.tir_banco(roe3, pay if pay is not None else 0.5, ind.get("pvp"))
        ind["tir_lucro"] = I.tir_por_lucro(lucro3, vm, g)
        ind["tir_implicita"] = ind["tir_banco"]
        ind["cresc_implicito"] = I.crescimento_implicito_banco(roe3, ind.get("pvp"), taxa_ref) if taxa_ref else None
        ind["cresc_historico_ref"] = ind.get("cagr_lucro_5a")
    else:
        ind["tir_lucro"] = I.tir_por_lucro(lucro3, vm, g)
        ind["tir_caixa"] = I.tir_por_caixa(fcl3, vm, g)
        cres = ind.get("cagr_receita_5a")
        mfcl = I.media(I.div(hist[a].get("fcl"), hist[a].get("receita")) for a in ult5)
        ind["margem_fcl_5a"] = mfcl
        ind["cresc_dcf_usado"] = max(cfg["dcf_piso_crescimento"], min(cfg["dcf_teto_crescimento"], cres)) if I.ok(cres) else None
        ind["tir_dcf"] = I.tir_dcf_reverso(ind.get("ev"), ltm.get("receita"), cres if I.ok(cres) else 0.0, mfcl, g,
                                           cfg["dcf_anos"], cfg["dcf_teto_crescimento"], cfg["dcf_piso_crescimento"])
        tirs = [x for x in (ind["tir_lucro"], ind["tir_caixa"], ind["tir_dcf"]) if I.ok(x)]
        ind["tir_implicita"] = I.mediana(tirs)
        ind["cresc_implicito"] = I.crescimento_implicito(ind.get("ev"), fcl3, taxa_ref) if taxa_ref else None
        ind["cresc_historico_ref"] = ind.get("cagr_receita_5a")
    ind["cresc_gap"] = ind["cresc_implicito"] - ind["cresc_historico_ref"] if I.ok(ind.get("cresc_implicito"), ind.get("cresc_historico_ref")) else None
    ind["tir_spread_ref"] = ind["tir_implicita"] - titulo_ref if I.ok(ind.get("tir_implicita"), titulo_ref) else None
    ind["titulo_ref"] = titulo_ref
    if modelo == "RECUPERACAO":
        # fluxos de empresa em recuperação judicial ou extrajudicial (fornecedores congelados, dívida convertida) não sustentam TIR
        ind["tir_calculo_recuperacao"] = {k: ind.get(k) for k in ("tir_lucro", "tir_caixa", "tir_dcf", "cresc_implicito")}
        for k in ("tir_lucro", "tir_caixa", "tir_dcf", "tir_implicita", "cresc_implicito", "cresc_gap", "tir_spread_ref",
                  "graham", "graham_margem", "bazin", "bazin_margem", "peg"):
            ind[k] = None
        ind["suprimido_recuperacao"] = True
    if modelo == "TESOURARIA_CRIPTO":
        # valor da empresa depende do bitcoin em caixa; lucro contábil é marcação a mercado do BTC
        btc_usd = serie_completa(precos.get("BTC-USD"))
        btc_brl = None
        if btc_usd is not None and len(btc_usd) and ctx.get("ptax_hist"):
            px = pd.Series(ctx["ptax_hist"])
            px.index = pd.to_datetime(px.index)
            px = px.sort_index().reindex(btc_usd.index.union(px.index)).ffill().reindex(btc_usd.index)
            btc_brl = btc_usd.copy()
            btc_brl["Close"] = btc_usd["Close"] * px.values   # BTC em R$ = BTC em US$ x PTAX do dia
        unidades, data_btc, fonte_btc = None, None, None
        if bdr:
            unidades, data_btc = sec.btc_em_caixa(res.get("_facts") or {})
            fonte_btc = "SEC XBRL us-gaap:CryptoAssetNumberOfUnits"
            preco_btc = float(btc_usd["Close"].iloc[-1]) if btc_usd is not None and len(btc_usd) else None
        else:
            v_bal, conta = ltm.get("cripto"), "criptoativos"
            if not v_bal:
                # IFRS (IAS 38): bitcoin costuma ficar no intangível, pelo custo; a estimativa pode subestimar a quantidade
                v_bal, conta = ltm.get("intangivel"), "intangível (BTC pelo custo, IAS 38: estimativa conservadora)"
            p_bal = preco_em(btc_brl, data_ref) if data_ref else None
            if I.ok(v_bal) and v_bal > 0 and p_bal:
                unidades, data_btc = v_bal / p_bal, data_ref
                fonte_btc = f"CVM, saldo de {conta} no balanço / preço do BTC em R$ na data do balanço. Para o número exato, preencha manuais.btc_em_caixa"
            preco_btc = float(btc_brl["Close"].iloc[-1]) if btc_brl is not None and len(btc_brl) else None
        man = ((ctx.get("notas") or {}).get(t) or {}).get("manuais") or {}
        if I.ok(man.get("btc_em_caixa")):
            unidades, fonte_btc = man["btc_em_caixa"], "notes.json (manual): " + str(man.get("fonte") or "")
        valor_btc = unidades * preco_btc if I.ok(unidades) and preco_btc else None
        ind["btc_em_caixa"] = unidades
        ind["valor_btc"] = valor_btc
        ind["mnav"] = vm / valor_btc if I.ok(vm) and valor_btc else None
        ind["btc_por_acao"] = unidades / acoes if I.ok(unidades) and acoes else None
        res["cripto"] = {"btc": unidades, "data": data_btc, "fonte": fonte_btc, "preco_btc": preco_btc}
        for k in ("pl", "peg", "tir_lucro", "tir_caixa", "tir_dcf", "tir_implicita", "cresc_implicito", "cresc_gap",
                  "tir_spread_ref", "graham", "graham_margem", "earnings_yield"):
            ind[k] = None
        ind["suprimido_cripto"] = True
    ind["roic_spread"] = ind["roic"] - taxa_ref if I.ok(ind.get("roic"), taxa_ref) else None

    # bancos: carteira
    if gm == "BANCO":
        c0 = (saldo_ant or {}).get("carteira")
        ind["cresc_carteira"] = ltm.get("carteira") / c0 - 1 if I.ok(ltm.get("carteira"), c0) and c0 > 0 else None
    # BDR
    if bdr:
        ind["bdr_preco_justo"] = res["bdr"]["preco_justo"]
        ind["bdr_agio"] = res["bdr"]["agio"]

    # ---------------- sinais para regras de risco
    anos_ord = sorted(hist)
    fcl_ser = [hist[a].get("fcl") for a in anos_ord]
    neg = 0
    for x in reversed(fcl_ser):
        if I.ok(x) and x < 0:
            neg += 1
        else:
            break
    ml_ser = [hist[a].get("margem_liquida") for a in anos_ord]
    dl_ant = I.calcular(ltm_ant, {}, gm).get("divida_liquida") if ltm_ant else None
    luc = [hist[a].get("lucro_liq") for a in anos_ord]
    ind["sinais"] = {
        "fcl_negativo_anos": neg,
        "margem_queda_3a": I.queda_seguida(ml_ser, 3),
        "lucro_caindo": bool(I.ok(ind.get("cresc_lucro_ltm")) and ind["cresc_lucro_ltm"] < 0 and len(luc) >= 2 and I.ok(luc[-1], luc[-2]) and luc[-1] < luc[-2]),
        "divida_subindo": bool(I.ok(ind.get("divida_liquida"), dl_ant) and ind["divida_liquida"] > dl_ant * 1.05),
        "dividendo_sem_caixa": bool(ind.get("dividendo_sem_caixa")),
        "acao_abaixo_1": bool(not bdr and preco_papel < 1),
        "recuperacao_judicial": "RECUPERA" in (ctx["cadastro"].get(res.get("cd_cvm", ""), {}).get("nome") or "").upper(),
    }
    ind.pop("dividendo_sem_caixa", None)
    ind["tag_along"] = (res.get("governanca") or {}).get("tag_along")
    res["acoes_por_papel"] = fator
    res["classes"] = ativo.get("classes")
    res.pop("_facts", None)
    res["ind"] = {k: (r4(v) if isinstance(v, float) else v) for k, v in ind.items()}
    res["ltm_contas"] = {k: v for k, v in ltm.items() if not k.startswith("_")}
    return res


# ===================================================================== setor
def grupos(universo: list[dict]) -> dict[str, list[str]]:
    """Para cada ativo, o grupo de comparação: setor micro (>= N pares), senão setor macro, senão a família."""
    n = CFG["grupo_minimo_pares"]
    out = {}
    for a in universo:
        micro = [b["ticker"] for b in universo if b["setor_micro"] == a["setor_micro"]]
        macro = [b["ticker"] for b in universo if b["setor_macro"] == a["setor_macro"]]
        fam_fin = a["modelo_analise"] in FIN
        familia = [b["ticker"] for b in universo if (b["modelo_analise"] in FIN) == fam_fin]
        if len(micro) >= n:
            out[a["ticker"]] = ("setor_micro", a["setor_micro"], micro)
        elif len(macro) >= n:
            out[a["ticker"]] = ("setor_macro", a["setor_macro"], macro)
        else:
            out[a["ticker"]] = ("familia", "Financeiras" if fam_fin else "Não financeiras", familia)
    return out


# ===================================================================== principal
def main():
    sem_noticias = "--sem-noticias" in sys.argv
    print("Universo...")
    universo = json.loads((DATA / "universe.json").read_text(encoding="utf-8"))
    notas = json.loads((DATA / "notes.json").read_text(encoding="utf-8")) if (DATA / "notes.json").exists() else {}

    print("Macro...")
    mac = macro()
    ptax_hist = mac.pop("_ptax_hist", {})

    print("CVM...")
    cad = S.cvm_cadastro()
    cods, cnpjs = set(), set()
    cnpj_de = {}
    # emissores das ações + investidas das holdings (para o desconto de holding)
    emissores = {a["emissor_b3"] for a in universo if a["tipo"] == "ACAO_BR"}
    emissores |= {p[:4] for a in universo for p in a.get("participacoes_listadas", [])}
    for e in sorted(emissores):
        try:
            c = S.b3_emissor(e)["codeCVM"].lstrip("0")
            cods.add(c)
            cnpjs.add(cad[c]["cnpj"])
            cnpj_de[e] = cad[c]["cnpj"]
        except Exception as ex:
            aviso(e, f"B3/CVM cadastro: {ex}")
    ano = AGORA.year
    dfp = {y: S.cvm_arquivo("DFP", y, cods, cnpjs, 30 if y < ano - 1 else 1) for y in range(ano - 10, ano)}
    itr = {y: S.cvm_arquivo("ITR", y, cods, cnpjs, 30 if y < ano - 1 else 1) for y in (ano - 2, ano - 1, ano)}
    ipe = [S.cvm_arquivo("IPE", y, cods, cnpjs, 0.25).get("ipe_cia_aberta") for y in (ano - 1, ano)]
    fre = S.cvm_arquivo("FRE", ano, cods, cnpjs, 7) or S.cvm_arquivo("FRE", ano - 1, cods, cnpjs, 7)
    fca = S.cvm_arquivo("FCA", ano, cods, cnpjs, 7)
    # classes (ON/PN) e composição de units pelo FCA, quando não estão no universe.json
    for a in universo:
        if a["tipo"] != "ACAO_BR" or a["emissor_b3"] not in cnpj_de:
            continue
        r = classes_fca(fca, cnpj_de[a["emissor_b3"]], a["ticker"])
        if not a.get("classes") and r.get("classes"):
            a["classes"] = dict(r["classes"])
            if a["ticker"].endswith("3") and not a.get("composicao_unit"):
                # ação ON pura: a PN só entra se a companhia tiver ações PN (verificado adiante pela composição do capital)
                pass
        if a["ticker"].endswith("11") and not a.get("composicao_unit"):
            if r.get("composicao_unit"):
                a["composicao_unit"], a["acoes_por_papel"] = r["composicao_unit"], r["acoes_por_papel"]
            else:
                aviso(a["ticker"], "unit sem composição no FCA; preencha composicao_unit e acoes_por_papel em universe.json")
        a.setdefault("classes", {})
        if not a["classes"]:
            a["classes"] = {("ON" if a["ticker"].endswith("3") else "PN"): a["ticker"]}

    print("Preços (yfinance)...")
    tks = set()
    for a in universo:
        tks.add(a["ticker"] + ".SA")
        for c in (a.get("classes") or {}).values():
            tks.add(c + ".SA")
        for p in a.get("participacoes_listadas", []):
            tks.add(p + ".SA")
        if a.get("ticker_exterior"):
            tks.add(a["ticker_exterior"])
    tks |= {"^BVSP", "^GSPC", "BTC-USD"} | set(MERCADO_FAIXA)
    precos = S.precos_yf(sorted(tks))
    faltam = sorted(tks - set(precos))
    if faltam:
        aviso("PRECOS", f"sem histórico: {faltam}")
    brapi = S.brapi_quote([a["ticker"] for a in universo])

    base = cvm.BaseCVM(dfp, itr)
    ctx = {"macro": mac, "precos": precos, "brapi": brapi, "cadastro": cad, "base": base, "dfp": dfp, "itr": itr,
           "ipe": ipe, "fre": fre, "fca": fca, "ptax_hist": ptax_hist, "notas": notas}

    print("Ativos...")
    resultados = {}
    for a in universo:
        print(" ", a["ticker"])
        try:
            r = processar(a, ctx)
            # indicadores que só existem em release (bancos, seguradoras): notes.json -> manuais
            man = (notas.get(a["ticker"]) or {}).get("manuais") or {}
            if "ind" in r:
                for k, v in man.items():
                    if k in I.META and isinstance(v, (int, float)):
                        r["ind"][k] = v
                r["manuais_fonte"] = man.get("fonte")
            resultados[a["ticker"]] = r
        except Exception as e:
            traceback.print_exc()
            aviso(a["ticker"], f"falha no processamento: {e}")

    # ---------------- desconto de holding (participações listadas declaradas no FRE)
    for a in universo:
        t = a["ticker"]
        r = resultados.get(t)
        if not a.get("participacoes_listadas") or not r or "ind" not in r:
            continue
        partes, soma, completo = [], 0.0, True
        manual = ((notas.get(t) or {}).get("manuais") or {}).get("participacoes") or {}
        for p in a["participacoes_listadas"]:
            if p in manual:
                pct, fonte_pct = manual[p], "notes.json (manual)"
            else:
                pct, fonte_pct = fre_participacao(fre, cnpj_de.get(a["emissor_b3"]), cnpj_de.get(p[:4])), "FRE (participação direta)"
            vm_p = (resultados.get(p) or {}).get("ind", {}).get("valor_mercado")
            if vm_p is None:
                vm_p = valor_mercado_simples(p, precos)
            if pct is None or vm_p is None:
                completo = False
                aviso(t, f"participação em {p} não encontrada no FRE como participação direta (pode ser indireta, via veículo); "
                         f"informe em notes.json > manuais > participacoes")
                partes.append({"ticker": p, "pct": None, "valor_mercado": vm_p, "valor_participacao": None, "fonte": "não encontrada"})
                continue
            partes.append({"ticker": p, "pct": pct, "valor_mercado": vm_p, "valor_participacao": pct * vm_p, "fonte": fonte_pct})
            soma += pct * vm_p
        vm_h = r["ind"].get("valor_mercado")
        soma = soma if completo else None
        r["holding"] = {"partes": partes, "soma_partes": soma, "completo": completo,
                        "nota": "Soma das partes listadas pelo valor de mercado de hoje e a participação declarada no Formulário de Referência "
                                "(participação direta). Não inclui ativos não listados nem a dívida da holding. Se alguma participação estiver "
                                "em veículo intermediário, o desconto fica n/d até ser informada em notes.json."}
        r["ind"]["soma_partes"] = soma
        r["ind"]["desconto_holding"] = vm_h / soma - 1 if vm_h and soma else None

    # ---------------- estatística de setor
    gr = grupos(universo)
    chaves = sorted({k for r in resultados.values() for k, v in (r.get("ind") or {}).items() if isinstance(v, (int, float)) and not isinstance(v, bool)})
    setor_stats = {}
    emissor = {a["ticker"]: (resultados.get(a["ticker"], {}).get("cd_cvm") or a.get("ticker_exterior") or a["ticker"]) for a in universo}
    for t, (nivel, nome, membros) in gr.items():
        r = resultados.get(t)
        if not r or "ind" not in r:
            continue
        # uma empresa conta uma vez só nas medianas e no score (BBDC3 e BBDC4 são a mesma companhia)
        vistos, unicos = {emissor[t]}, [t]
        for m in membros:
            if m != t and emissor[m] not in vistos:
                vistos.add(emissor[m])
                unicos.append(m)
        membros = unicos
        med, pct = {}, {}
        micro = [b["ticker"] for b in universo if b["setor_micro"] == next(x for x in universo if x["ticker"] == t)["setor_micro"]]
        med_micro = {}
        for k in chaves:
            pop = [resultados[m]["ind"].get(k) for m in membros if m in resultados and "ind" in resultados[m]]
            med[k] = I.mediana(pop)
            pct[k] = I.percentil(r["ind"].get(k), pop)
            med_micro[k] = I.mediana([resultados[m]["ind"].get(k) for m in micro if m in resultados and "ind" in resultados[m]])
        setor_stats[t] = {"grupo_nivel": nivel, "grupo_nome": nome, "grupo_membros": membros,
                          "mediana_grupo": {k: r4(v, 5) for k, v in med.items() if v is not None}, "percentil": {k: round(v) for k, v in pct.items() if v is not None}, "pares_micro": micro}

    # ---------------- saídas
    print("Gravando...")
    datas_px = [r["mercado"]["data"] for r in resultados.values() if r.get("mercado")]
    data_fech = max(set(datas_px), key=datas_px.count) if datas_px else None
    trims = [r.get("data_balanco") for t, r in resultados.items() if r.get("data_balanco")]
    def tri(d):
        y, m = int(d[:4]), int(d[5:7])
        return f"{(m - 1) // 3 + 1}T{y}"
    ref_bal = max(set(trims), key=trims.count) if trims else None

    idx_px = {}
    for k in ("^BVSP", "^GSPC", "BTC-USD", *MERCADO_FAIXA):
        df = serie_completa(precos.get(k))
        if df is not None and len(df) >= 2:
            c = df["Close"].dropna()
            if len(c) < 2:
                continue
            idx_px[k] = {"valor": float(c.iloc[-1]), "var_dia": float(c.iloc[-1] / c.iloc[-2] - 1), "data": c.index[-1].strftime("%Y-%m-%d"),
                         "_serie": c}
    mac["ibovespa"] = idx_px.get("^BVSP")
    mac["sp500"] = idx_px.get("^GSPC")
    # séries que o Yahoo só entrega como cotação do dia (IFIX): variação contra o valor gravado na execução anterior
    try:
        ant = json.loads((DATA / "macro.json").read_text(encoding="utf-8"))
    except Exception:
        ant = {}
    for k, nome in MERCADO_FAIXA.items():
        if k in idx_px:
            continue
        df = serie_completa(precos.get(k))
        c = df["Close"].dropna() if df is not None and len(df) else None
        if c is None or not len(c):
            continue
        atual = {"valor": float(c.iloc[-1]), "var_dia": None, "data": c.index[-1].strftime("%Y-%m-%d")}
        velho = ant.get(nome) or {}
        if velho.get("valor") and velho.get("data", "") < atual["data"]:
            atual["var_dia"] = atual["valor"] / velho["valor"] - 1
            atual["anterior"] = {"valor": velho["valor"], "data": velho["data"]}
        elif velho.get("data") == atual["data"]:
            atual["var_dia"], atual["anterior"] = velho.get("var_dia"), velho.get("anterior")
        idx_px[k] = atual
    for k, nome in MERCADO_FAIXA.items():
        mac[nome] = idx_px.get(k)
    # bitcoin em reais = BTC em US$ x dólar comercial do mesmo dia
    if idx_px.get("BTC-USD") and idx_px.get("BRL=X"):
        b, d = idx_px["BTC-USD"]["_serie"], idx_px["BRL=X"]["_serie"]
        d = d.reindex(b.index.union(d.index)).ffill().reindex(b.index)
        brl = (b * d).dropna()
        if len(brl) >= 2:
            mac["bitcoin_brl"] = {"valor": float(brl.iloc[-1]), "var_dia": float(brl.iloc[-1] / brl.iloc[-2] - 1),
                                  "data": brl.index[-1].strftime("%Y-%m-%d")}
    for v in idx_px.values():
        v.pop("_serie", None)
    gravar(DATA / "macro.json", mac)

    meta = {"gerado_em": AGORA.isoformat(), "data_fechamento": data_fech, "balancos_ate": tri(ref_bal) if ref_bal else None,
            "balancos_ate_data": ref_bal, "fontes": ["CVM Dados Abertos (DFP, ITR, IPE, FRE, FCA, cadastro)", "B3 (dados do emissor e proventos)",
                                                    "yfinance (preços e volumes)", "brapi.dev (cotação, quando há token)", "SEC EDGAR (companyfacts, submissions)",
                                                    "Banco Central SGS e Focus", "Tesouro Direto", "FRED", "Google News RSS"]}
    gravar(DATA / "meta.json", meta)
    gravar(DATA / "indicators_meta.json", {"indicadores": I.meta_json(), "fatores": I.FATORES, "piotroski_testes": I.PIOTROSKI_TESTES})

    prices, fundamentals, dividends = {}, {}, {}
    for a in universo:
        t = a["ticker"]
        r = resultados.get(t, {})
        if not r.get("mercado"):
            continue
        df = serie_completa(precos.get(t + ".SA"))
        spark = [round(float(x), 4) for x in df["Close"].iloc[-63:]]
        prices[t] = {**{k: r["mercado"].get(k) for k in ("preco", "data", "var_dia", "var_mes", "var_ano", "var_12m", "var_5a", "max_52s", "min_52s", "liquidez_21", "liquidez_63", "preco_brapi")},
                     "spark_3m": spark}
        fundamentals[t] = {"ind": r.get("ind", {}), "medias_5a": r.get("medias_5a", {}), "setor": setor_stats.get(t, {}),
                           "data_balanco": r.get("data_balanco"), "trimestre": tri(r["data_balanco"]) if r.get("data_balanco") else None,
                           "fonte": r.get("fonte_fundamentos"), "moeda": r.get("moeda_fundamentos"), "governanca": r.get("governanca"),
                           "bdr": r.get("bdr"), "mercado_exterior": {k: (r.get("mercado_exterior") or {}).get(k) for k in ("preco", "data", "var_dia")} if r.get("mercado_exterior") else None,
                           "valor_mercado_partes": r.get("valor_mercado_partes"), "cd_cvm": r.get("cd_cvm"), "cik": r.get("cik"),
                           "holding": r.get("holding"), "cripto": r.get("cripto"), "piotroski": r.get("piotroski"), "acoes_por_papel": r.get("acoes_por_papel"),
                           "classes": r.get("classes"), "composicao_unit": a.get("composicao_unit"), "manuais_fonte": r.get("manuais_fonte"),
                           "avisos": AVISOS.get(t, [])}
        dividends[t] = r.get("proventos")
        # histórico sob demanda
        semanal = df["Close"].resample("W-FRI").last().dropna()
        diario = df["Close"].iloc[-260:]
        hist_px = {"semanal": [[d.strftime("%Y-%m-%d"), round(float(v), 4)] for d, v in semanal.items()],
                   "diario": [[d.strftime("%Y-%m-%d"), round(float(v), 4)] for d, v in diario.items()]}
        gravar(DATA / "history" / f"{t}.json", {"ticker": t, "anual": r.get("historico", {}), "precos": hist_px,
                                                "ltm_contas": r.get("ltm_contas"), "moeda": r.get("moeda_fundamentos")})
    gravar(DATA / "prices.json", prices)
    gravar(DATA / "fundamentals.json", fundamentals)
    gravar(DATA / "dividends.json", dividends)

    # ---------------- notícias e comunicados
    idx_news = {}
    limite48 = AGORA - dt.timedelta(hours=48)
    for a in universo:
        t = a["ticker"]
        r = resultados.get(t, {})
        arq = DATA / "news" / f"{t}.json"
        antigo = json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else {}
        noticias = antigo.get("noticias", [])
        if not sem_noticias:
            try:
                nome = a["nome"]
                q = f'"{nome}" OR {t}'
                noticias = S.google_news(q, "pt-BR", "BR", 15)
                if a["tipo"].startswith("BDR") and a.get("ticker_exterior"):
                    en = S.google_news(f'"{nome}" OR {a["ticker_exterior"]} stock', "en-US", "US", 15)
                    for x in en:
                        x["lingua"] = "en"
                    noticias = sorted(noticias + en, key=lambda x: x["data"] or "", reverse=True)[:15]
            except Exception as e:
                aviso(t, f"notícias: {e}")
        com = r.get("comunicados", antigo.get("comunicados", []))
        prox = None
        try:
            if a["tipo"] == "ACAO_BR" or a.get("ticker_exterior"):
                cal = S.acoes_yf(a["ticker_exterior"] if a["tipo"] == "BDR_EXTERIOR" or a["tipo"] == "BDR_EXPOSICAO_BR" else t + ".SA").calendar
                ed = cal.get("Earnings Date") if isinstance(cal, dict) else None
                if ed:
                    d0 = ed[0] if isinstance(ed, list) else ed
                    if str(d0) >= AGORA.date().isoformat():
                        prox = {"data": str(d0), "fonte": "yfinance (calendário)"}
        except Exception:
            pass
        novos = 0
        for x in noticias:
            try:
                if x.get("data") and pd.Timestamp(x["data"]) >= pd.Timestamp(limite48):
                    novos += 1
            except Exception:
                pass
        for x in com:
            try:
                if x.get("data") and pd.Timestamp(x["data"]).tz_localize(TZ) >= pd.Timestamp(limite48.date()).tz_localize(TZ):
                    novos += 1
            except Exception:
                pass
        gravar(arq, {"ticker": t, "atualizado_em": AGORA.isoformat(), "noticias": noticias, "comunicados": com,
                     "proximo_resultado": prox, "calendario_cvm": r.get("calendario")})
        idx_news[t] = {"novos_48h": novos, "total_noticias": len(noticias), "total_comunicados": len(com)}
    gravar(DATA / "news" / "_index.json", idx_news)

    relatorio_cobertura(universo, resultados, meta)
    print("OK.", meta)


def relatorio_cobertura(universo, resultados, meta):
    meta_ind = I.meta_json()
    linhas = [f"# Relatório de cobertura de dados",
              "", f"Gerado em {AGORA.strftime('%d/%m/%Y %H:%M')} | Preços de fechamento de {meta['data_fechamento']} | Balanços até {meta['balancos_ate']}", ""]
    linhas.append("| Ticker | Modelo | Balanço | Fonte | Indicadores com valor | Faltando |")
    linhas.append("|---|---|---|---|---|---|")
    detalhes = []
    for a in universo:
        t = a["ticker"]
        r = resultados.get(t, {})
        ind = r.get("ind", {})
        aplic = aplicaveis(a)
        tem = [k for k in aplic if ind.get(k) is not None]
        falta = [k for k in aplic if ind.get(k) is None]
        linhas.append(f"| {t} | {a['modelo_analise']} | {r.get('data_balanco')} | {r.get('fonte_fundamentos')} | {len(tem)}/{len(aplic)} | {len(falta)} |")
        detalhes.append(f"\n## {t}\n")
        if AVISOS.get(t):
            detalhes.append("Avisos do pipeline:\n" + "\n".join(f"- {x}" for x in AVISOS[t]))
        if falta:
            detalhes.append("\nIndicadores sem valor e motivo:\n")
            for k in falta:
                detalhes.append(f"- {meta_ind[k]['nome']} (`{k}`): {motivo(k, a, r)}")
    # sinais de estresse financeiro (informativo): "Em recuperação" só vale para pedido de RJ ou RE, marcado à mão no universe.json
    linhas_d = []
    for a in universo:
        r = resultados.get(a["ticker"], {})
        i = r.get("ind", {})
        if not i:
            continue
        crit = []
        pl_c = (r.get("ltm_contas") or {}).get("pl")
        if pl_c is not None and pl_c < 0:
            crit.append("patrimônio líquido negativo")
        if (i.get("divliq_ebitda") or 0) > 5 or ((i.get("ebitda") or 1) <= 0 and (i.get("divida_liquida") or 0) > 0):
            crit.append(f"dív.líq/EBITDA {i.get('divliq_ebitda') if i.get('divliq_ebitda') is not None else 'com EBITDA negativo'}")
        if i.get("cobertura_juros") is not None and i["cobertura_juros"] < 1:
            crit.append(f"EBIT não cobre juros ({i['cobertura_juros']:.2f}x)")
        if (i.get("sinais") or {}).get("recuperacao_judicial"):
            crit.append("recuperação judicial no cadastro da CVM")
        if (i.get("sinais") or {}).get("acao_abaixo_1"):
            crit.append("ação abaixo de R$ 1")
        if len(crit) >= 2 and a["modelo_analise"] != "RECUPERACAO":
            sug = "monitorar: conferir se houve pedido de recuperação judicial ou extrajudicial"
            linhas_d.append(f"| {a['ticker']} | {a['modelo_analise']} | {'; '.join(crit) or 'nenhum'} | {sug} |")
    if linhas_d:
        detalhes.append("\n## Sinais de estresse financeiro\n\nEmpresas fora do modelo RECUPERACAO com dois ou mais entre PL negativo, Dív.líq/EBITDA acima de 5x (ou EBITDA negativo com dívida), EBIT abaixo dos juros, recuperação judicial, ação abaixo de R$ 1.\n")
        detalhes.append("| Ticker | Modelo atual | Critérios atingidos | Sugestão |\n|---|---|---|---|\n" + "\n".join(linhas_d))
    if AVISOS.get("MACRO") or AVISOS.get("PRECOS"):
        detalhes.append("\n## Geral\n" + "\n".join(f"- {x}" for x in AVISOS.get("MACRO", []) + AVISOS.get("PRECOS", [])))
    REL.mkdir(exist_ok=True)
    (REL / "cobertura.md").write_text("\n".join(linhas + detalhes) + "\n", encoding="utf-8")


def aplicaveis(a):
    m = a["modelo_analise"]
    base = [k for k, v in I.META.items() if v[3] not in ("Banco", "Seguradora", "BDR", "Holding", "Cripto")]
    suprimidos = {"tir_lucro", "tir_caixa", "tir_dcf", "tir_implicita", "cresc_implicito", "cresc_gap", "tir_spread_ref",
                  "graham", "graham_margem", "bazin", "bazin_margem", "peg", "pl", "earnings_yield"}
    if m in ("RECUPERACAO", "TESOURARIA_CRIPTO"):
        base = [k for k in base if k not in suprimidos]
    if m == "TESOURARIA_CRIPTO":
        base += [k for k, v in I.META.items() if v[3] == "Cripto"]
    if a.get("participacoes_listadas"):
        base += ["soma_partes", "desconto_holding"]
    nao_fin = {"divida_bruta", "divida_liquida", "ev", "p_ebitda", "p_ebit", "psr", "p_capital_giro", "p_acl", "ev_ebitda", "ev_ebit",
               "ev_receita", "earnings_yield", "fcf_yield", "divliq_pl", "divliq_ebitda", "divliq_ebit", "liquidez_corrente",
               "liquidez_seca", "liquidez_imediata", "cobertura_juros", "divida_cp_pct", "margem_bruta", "margem_ebitda", "margem_ebit",
               "giro_ativo", "pmr", "pme", "pmp", "ciclo_financeiro", "roic", "roic_spread", "fco", "capex", "fcl", "ebitda",
               "capex_depreciacao", "conversao_caixa", "dividendos_sobre_fcl", "tir_caixa", "tir_dcf", "evebitda_vs_media5",
               "cagr_ebitda_5a", "cagr_ebitda_10a"}
    if m in FIN:
        base = [k for k in base if k not in nao_fin]
        base = [k for k in base if k != "pl_vs_media5" or True]
    else:
        base = [k for k in base if k not in ("tir_banco", "pvp_vs_media5")]
    if m == "BANCO":
        base += [k for k, v in I.META.items() if v[3] == "Banco"]
    if m == "SEGURADORA":
        base += [k for k, v in I.META.items() if v[3] == "Seguradora"]
    if a["tipo"].startswith("BDR"):
        base += ["bdr_preco_justo", "bdr_agio"]
        base = [k for k in base if k not in ("free_float", "controlador_pct", "tag_along")]
    if a["tipo"] == "ACAO_BR" and len(a.get("classes", {})) < 2:
        pass
    return [k for k in base if k not in ("preco", "valor_mercado")]


def motivo(k, a, r):
    ind = r.get("ind", {})
    contas = r.get("ltm_contas", {})
    nhist = ind.get("anos_historico") or 0
    if k in ("basileia", "inadimplencia_90", "cobertura_pdd", "indice_combinado", "sinistralidade"):
        return "não existe nas demonstrações padronizadas da CVM/SEC; preencher a partir do release em notes.json (campo manuais)"
    if k.startswith("cagr_dpa"):
        return "sem proventos no ano inicial ou final (CAGR exige valores positivos nos dois extremos)"
    if k.startswith("cagr_") and "10a" in k:
        return f"histórico disponível de {nhist} exercícios ou extremos negativos"
    if k.startswith("cagr_"):
        return "extremo da série negativo ou ausente"
    if k in ("pl", "p_ebit", "p_ebitda", "ev_ebitda", "ev_ebit", "peg", "earnings_yield", "graham", "graham_margem"):
        return "lucro, EBIT, EBITDA ou PL negativo/ausente (múltiplo sem sentido)"
    if k in ("tir_lucro", "tir_caixa", "tir_dcf", "tir_implicita", "cresc_implicito", "cresc_gap", "tir_spread_ref"):
        return "lucro ou FCL médio negativo, ou margem FCL média <= 0 (sem fluxo positivo para descontar)"
    if k in ("diluicao_3a", "diluicao_5a"):
        return "composição do capital na CVM só existe a partir de 2020 ou quantidade histórica estimada"
    if k in ("free_float", "controlador_pct"):
        return "FRE sem acionista marcado como controlador (controle difuso)"
    if k in ("bazin", "bazin_margem", "dy_medio_5a", "anos_corte"):
        return "sem proventos suficientes nos últimos 5 anos"
    if k == "fcf_yield" or k == "conversao_caixa":
        return "FCL negativo ou lucro negativo"
    if k in ("pme", "ciclo_financeiro") and not contas.get("estoques"):
        return "empresa sem estoques relevantes"
    if k in ("pmr", "pmp", "pme", "ciclo_financeiro", "margem_bruta"):
        return "conta de custo, recebíveis ou fornecedores não identificada no plano de contas"
    if k in ("cobertura_juros",):
        return "despesa financeira não identificada"
    if k in ("p_capital_giro", "p_acl"):
        return "capital de giro ou ativo circulante líquido negativo"
    if k == "beta":
        return "histórico de preço curto"
    if k in ("pl_vs_media5", "evebitda_vs_media5", "pvp_vs_media5"):
        return "múltiplo atual ou médio sem valor positivo"
    if k == "cresc_carteira":
        return "carteira de crédito não identificada nas duas datas"
    if k == "jcp_pct_12m":
        return "sem proventos nos últimos 12 meses"
    if k == "recompras_ltm":
        return "sem linha de recompra na DFC"
    return "conta não encontrada na fonte ou não aplicável ao modelo"


CFG = json.loads((DATA / "config.json").read_text(encoding="utf-8"))

if __name__ == "__main__":
    main()
