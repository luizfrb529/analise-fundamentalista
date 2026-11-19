"""FI-Infra listados na B3 (FIC de fundos incentivados de infraestrutura): dados oficiais para as páginas.

Os FI-Infra não entregam o Informe de FII nem usam o FundosNet. Fontes (todas automáticas):
  - CVM Dados Abertos, Informe Diário de fundos: valor da cota (valor patrimonial), patrimônio líquido e cotistas.
  - CVM Dados Abertos, Carteira (CDA): composição do fundo, olhando através dos fundos master
    (os ativos sob sigilo temporário entram só pelo total do tipo, como a CVM publica).
  - CVM Dados Abertos, Documentos eventuais: regulamento, demonstrações, fatos relevantes, assembleias.
  - B3, proventos em dinheiro do fundo listado (valor, data com, pagamento).
  - Yahoo Finance: preço e histórico de proventos, usados para conferir a B3 e completar anos antigos.

Os fundos ficam em data/fiis.json com "tipo": "infra" e o CNPJ. O histórico mensal do informe diário fica
guardado em data/fiis/_fi_infra_hist.json, para cada execução baixar só os meses novos.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import time
import zipfile
from pathlib import Path

import pandas as pd

import fiis as F
import sources as S

CACHE = Path(__file__).resolve().parent / ".cache" / "fi"
HIST = F.SAIDA / "_fi_infra_hist.json"
CVM_FI = "https://dados.cvm.gov.br/dados/FI/DOC"
INICIO_HIST = "2021-01"   # antes disso a CVM só publica zips anuais (HIST)
HOJE = F.HOJE
num, tx = F.num, F.tx


def fmt_cnpj(c: str) -> str:
    c = F.so_digitos(c).zfill(14)
    return f"{c[:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:]}"


def meses(desde: str, ate: dt.date) -> list[str]:
    y, m, out = int(desde[:4]), int(desde[5:7]), []
    while (y, m) <= (ate.year, ate.month):
        out.append(f"{y}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def baixar(url: str, arq: Path, validade_h: float | None) -> Path | None:
    """Baixa com cache; validade None = arquivo de mês fechado, não baixa de novo."""
    if arq.exists() and (validade_h is None or time.time() - arq.stat().st_mtime < validade_h * 3600):
        return arq
    try:
        r = S.get(url)
        arq.parent.mkdir(parents=True, exist_ok=True)
        arq.write_bytes(r.content)
        return arq
    except Exception as e:
        print(f"download {url}: {e}")
        return arq if arq.exists() else None


# ---------------------------------------------------------------- informe diário
def informe_diario(ym: str, cnpjs: set[str], recente: bool) -> pd.DataFrame:
    a = ym.replace("-", "")
    arq = baixar(f"{CVM_FI}/INF_DIARIO/DADOS/inf_diario_fi_{a}.zip", CACHE / f"inf_diario_fi_{a}.zip", 12 if recente else None)
    if not arq:
        return None            # falha no download: tenta de novo na próxima execução
    try:
        z = zipfile.ZipFile(arq)
    except zipfile.BadZipFile:
        arq.unlink(missing_ok=True)
        return None
    partes = []
    for nome in z.namelist():
        for ch in pd.read_csv(z.open(nome), sep=";", encoding="latin1", dtype=str, chunksize=400_000):
            col = "CNPJ_FUNDO_CLASSE" if "CNPJ_FUNDO_CLASSE" in ch.columns else "CNPJ_FUNDO"
            ch = ch[ch[col].isin(cnpjs)]
            if len(ch):
                partes.append(ch.rename(columns={col: "CNPJ"}))
    return pd.concat(partes, ignore_index=True) if partes else pd.DataFrame()


def historico(cnpjs: list[str]) -> dict:
    """Fim de cada mês (e o dado diário mais recente) do informe diário, por CNPJ formatado."""
    h = json.loads(HIST.read_text(encoding="utf-8")) if HIST.exists() else {}
    feitos = set(h.get("_meses", []))
    alvo = set(cnpjs)
    todos = meses(INICIO_HIST, HOJE)
    novos_fundos = [c for c in cnpjs if c not in h]
    for ym in todos:
        recente = ym >= todos[-2] if len(todos) > 1 else True
        if ym in feitos and not recente and not novos_fundos:
            continue
        busca = alvo if (ym not in feitos or recente) else set(novos_fundos)
        df = informe_diario(ym, busca, recente)
        if df is None:
            continue
        if df.empty:
            if not recente:
                feitos.add(ym)
            continue
        for c, g in df.groupby("CNPJ"):
            g = g.sort_values("DT_COMPTC")
            u = g.iloc[-1]
            h.setdefault(c, {})[ym] = {"data": u["DT_COMPTC"], "vp_cota": num(u["VL_QUOTA"]), "pl": num(u["VL_PATRIM_LIQ"]), "cotistas": num(u.get("NR_COTST"))}
            if ym == todos[-1] or ym == todos[-2]:
                h.setdefault("_diario", {})[c] = [[r["DT_COMPTC"], num(r["VL_QUOTA"])] for _, r in g.iterrows()]
        if not recente:
            feitos.add(ym)
        print(f"informe diário {ym}: {df['CNPJ'].nunique() if len(df) else 0} fundos")
    h["_meses"] = sorted(feitos)
    HIST.parent.mkdir(parents=True, exist_ok=True)
    HIST.write_text(json.dumps(h, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return h


# ---------------------------------------------------------------- carteira (CDA)
def cda_mais_recente() -> tuple[str | None, dict]:
    for k in range(1, 5):
        d = HOJE.replace(day=1) - pd.DateOffset(months=k)
        a = f"{d.year}{d.month:02d}"
        arq = baixar(f"{CVM_FI}/CDA/DADOS/cda_fi_{a}.zip", CACHE / f"cda_fi_{a}.zip", 24 if k <= 2 else None)
        if not arq:
            continue
        try:
            z = zipfile.ZipFile(arq)
        except zipfile.BadZipFile:
            arq.unlink(missing_ok=True)
            continue
        blocos = {}
        for nome in z.namelist():
            if nome.startswith("cda_fi_") and nome.endswith(".csv"):
                chave = nome[len("cda_fi_"):-len(f"_{a}.csv")]   # BLC_1..BLC_8, CONFID, PL
                blocos[chave] = pd.read_csv(z.open(nome), sep=";", encoding="latin1", dtype=str)
        if blocos:
            return f"{a[:4]}-{a[4:]}", blocos
    return None, {}


GRUPO_APLIC = {"debêntures": "Debêntures de infraestrutura", "títulos públicos": "Títulos públicos", "operações compromissadas": "Caixa (compromissadas e disponível)",
               "disponibilidades": "Caixa (compromissadas e disponível)", "cotas de fundos": "Cotas de outros fundos"}
IGNORA = ("valores a pagar", "valores a receber", "mercado futuro", "obrigações", "outras operações passivas", "swap", "opções", "termo")


def posicoes(blocos: dict, cnpj: str) -> list[dict]:
    out = []
    for k, df in blocos.items():
        if k == "PL" or df.empty:
            continue
        x = df[df["CNPJ_FUNDO_CLASSE"] == cnpj]
        for _, r in x.iterrows():
            out.append({"bloco": k, "aplic": tx(r.get("TP_APLIC")), "ativo": tx(r.get("TP_ATIVO")), "valor": num(r.get("VL_MERC_POS_FINAL")) or 0,
                        "cota_de": tx(r.get("CNPJ_FUNDO_CLASSE_COTA")), "desc": tx(r.get("DS_ATIVO"), r.get("CD_ATIVO"), r.get("EMISSOR"), r.get("TP_TITPUB"), r.get("NM_FUNDO_CLASSE_SUBCLASSE_COTA")),
                        "venc": tx(r.get("DT_VENC")), "confid": k == "CONFID"})
    return out


def composicao(blocos: dict, cnpj_fic: str) -> dict:
    pl = {r["CNPJ_FUNDO_CLASSE"]: num(r["VL_PATRIM_LIQ"]) for _, r in blocos.get("PL", pd.DataFrame()).iterrows()}
    grupos, linhas, confid, vistos, passivo = {}, [], 0.0, set(), 0.0

    def abre(cnpj: str, fator: float, nivel: int):
        nonlocal confid, passivo
        vistos.add(cnpj)
        for p in posicoes(blocos, cnpj):
            a = p["aplic"].lower()
            if "outras operações passivas" in a:
                passivo += abs(p["valor"]) * fator   # compromissada tomada: abate do caixa aplicado em compromissada
                continue
            if any(i in a for i in IGNORA):
                continue
            v = p["valor"] * fator
            if a == "cotas de fundos" and p["cota_de"] and nivel < 2 and p["cota_de"] not in vistos and pl.get(p["cota_de"]):
                abre(p["cota_de"], fator * p["valor"] / pl[p["cota_de"]], nivel + 1)
                continue
            g = GRUPO_APLIC.get(a, "Outros ativos")
            grupos[g] = grupos.get(g, 0) + v
            if p["confid"]:
                confid += v
            elif g == "Debêntures de infraestrutura":
                linhas.append({"tipo": "Debênture", "nome": p["desc"], "valor": v, "segmento": "Infraestrutura", "vencimento": p["venc"] or None})
            elif g == "Títulos públicos":
                linhas.append({"tipo": "Título público", "nome": p["desc"], "valor": v, "segmento": "Títulos públicos", "vencimento": p["venc"] or None})
    abre(cnpj_fic, 1.0, 0)
    cx = "Caixa (compromissadas e disponível)"
    if passivo and grupos.get(cx):
        grupos[cx] = max(0.0, grupos[cx] - passivo)
    juntas = {}
    for l in linhas:
        j = juntas.setdefault(l["nome"], {**l, "valor": 0})
        j["valor"] += l["valor"]
    return {"grupos": {k: v for k, v in grupos.items() if v > 0}, "carteira": sorted(juntas.values(), key=lambda x: -x["valor"])[:15], "sigilo": confid}


# ---------------------------------------------------------------- B3 e documentos
def proventos_b3(ticker: str) -> list[dict]:
    p = base64.b64encode(json.dumps({"cnpj": "0", "identifierFund": ticker[:4], "typeFund": 27}).encode()).decode()
    try:
        d = S.get(f"https://sistemaswebb3-listados.b3.com.br/fundsProxy/fundsCall/GetListedSupplementFunds/{p}", headers={"User-Agent": "Mozilla/5.0"}).json()
    except Exception as e:
        print(f"{ticker}: B3 proventos: {e}")
        return []
    br = lambda s: f"{s[6:10]}-{s[3:5]}-{s[:2]}" if s and len(s) >= 10 else None  # noqa: E731
    out = []
    for x in d.get("cashDividends") or []:
        if not str(x.get("isinCode", "")).startswith("BR" + ticker[:4] + "CTF"):   # só a cota; recibos de subscrição têm outro ISIN
            continue
        rot = (x.get("label") or "").upper()
        out.append({"codigo": ticker, "tipo": "Amortização" if "AMORT" in rot else "Rendimento", "valor": num(x.get("rate")),
                    "data_base": br(x.get("lastDatePrior")), "pagamento": br(x.get("paymentDate")),
                    "referencia": (x.get("relatedTo") or "").split("/")[0].strip().capitalize() or None, "isento_ir": True, "fonte": "B3"})
    return [x for x in out if x["valor"] and x["data_base"]]


TIPO_DOC = {"REGUL FDO": ("Regulamento", "Regulamento do fundo"), "DEMONST CONTAB": ("Demonstrações financeiras", "Demonstrações contábeis auditadas"),
            "FATO RELEV": ("Fato relevante", "Fato relevante"), "ATA AGO": ("Assembleia", "Ata de assembleia geral ordinária"),
            "ATA AGE": ("Assembleia", "Ata de assembleia geral extraordinária"), "EDITAL AGE": ("Assembleia", "Edital de convocação de assembleia"),
            "EDITAL AGO": ("Assembleia", "Edital de convocação de assembleia"), "COMUNIC MERC": ("Comunicado", "Comunicado ao mercado"),
            "SGF ANEXO": ("Comunicado", "Documento anexo (sistema CVM)"), "PROSPECTO": ("Oferta", "Prospecto"), "LAMINA": ("Informe", "Lâmina")}


def documentos_cvm(cnpj_fmt: str) -> list[dict]:
    out = []
    for ano in (HOJE.year - 2, HOJE.year - 1, HOJE.year):
        arq = baixar(f"{CVM_FI}/EVENTUAL/DADOS/eventual_fi_{ano}.csv", CACHE / f"eventual_fi_{ano}.csv", 12 if ano == HOJE.year else 24 * 30)
        if not arq:
            continue
        df = pd.read_csv(arq, sep=";", encoding="latin1", dtype=str)
        for _, r in df[df["CNPJ_FUNDO_CLASSE"] == cnpj_fmt].iterrows():
            cod = tx(r.get("TP_DOC")).upper()
            cat, tipo = TIPO_DOC.get(cod, ("Outros", cod.title()))
            out.append({"id": tx(r.get("NM_ARQ")), "entrega": tx(r.get("DT_RECEB")) or None, "categoria": cat, "tipo": tipo, "especie": "",
                        "referencia": "/".join(reversed(tx(r.get("DT_COMPTC")).split("-"))) or None,
                        "link": tx(r.get("LINK_ARQ")).replace("http://", "https://")})
    vistos, uniq = set(), []
    for d in sorted(out, key=lambda x: x["entrega"] or "", reverse=True):
        if d["link"] and d["link"] not in vistos:
            vistos.add(d["link"])
            uniq.append(d)
    return uniq[:120]


# ---------------------------------------------------------------- montagem
def montar(fii: dict, hist: dict, cda: tuple[str | None, dict], px: pd.DataFrame | None, anterior: dict | None) -> dict:
    t = fii["ticker"]
    cnpj = F.so_digitos(fii["cnpj"])
    cf = fmt_cnpj(cnpj)
    h = {k: v for k, v in hist.get(cf, {}).items()}
    if not h:
        raise RuntimeError("fundo sem dados no informe diário da CVM")
    mensal = []
    for ym in sorted(h):
        v = h[ym]
        cotas = v["pl"] / v["vp_cota"] if v.get("pl") and v.get("vp_cota") else None
        mensal.append({"ref": ym, "pl": v.get("pl"), "vp_cota": v.get("vp_cota"), "cotas": cotas, "cotistas": v.get("cotistas"), "ativo": None,
                       "dy_mes": None, "rent_efetiva": None, "rent_patrimonial": None, "taxa_adm_mes": None})
    ult = mensal[-1]
    # rendimentos: B3 (oficial) + o que já estava publicado + Yahoo para os anos antigos
    prov = {(p["data_base"], p["tipo"]): p for p in (anterior or {}).get("proventos", []) if p.get("fonte") == "B3"}
    for p in proventos_b3(t):
        prov[(p["data_base"], p["tipo"])] = p
    ys = []
    if px is not None and "Dividends" in px:
        dv = px["Dividends"][px["Dividends"] > 0]
        ys = [(pd.Timestamp(d.date()), float(v)) for d, v in dv.items()]
    b3 = sorted(prov.values(), key=lambda x: x["data_base"])
    inicio_b3 = b3[0]["data_base"] if b3 else "9999"
    for d, v in ys:
        base = (d - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
        if base < inicio_b3 and not any(abs((pd.Timestamp(p["data_base"]) - d).days) <= 7 for p in b3):
            prov[(base, "Rendimento")] = {"codigo": t, "tipo": "Rendimento", "valor": v, "data_base": base, "pagamento": None, "referencia": None, "isento_ir": True,
                                          "fonte": "Yahoo Finance (data ex)"}
    proventos = sorted(prov.values(), key=lambda x: x["data_base"])
    diverg = []
    recentes = [p for p in b3 if p["tipo"] == "Rendimento"][-12:]
    for p in recentes:
        b = pd.Timestamp(p["data_base"])
        par = [v for d, v in ys if b < d <= b + pd.Timedelta(days=7)]
        if not par or abs(par[0] - p["valor"]) > 0.005:
            diverg.append(p["data_base"][:7])
    conferencia = {"meses_comparados": len(recentes), "divergentes": diverg, "fonte": "Yahoo Finance"} if ys and recentes else None

    # composição
    ref_cda, blocos = cda
    comp = composicao(blocos, cf) if blocos else {"grupos": {}, "carteira": [], "sigilo": 0}
    tipos = comp["grupos"]
    tot = sum(tipos.values()) or 1

    # preço e indicadores (mesma régua dos FIIs)
    preco = var_12m = mn = mx = liq = var_dia = var_ano = data_preco = cota_base = None
    if px is not None and len(px):
        c = px["Close"].dropna()
        preco, data_preco = float(c.iloc[-1]), c.index[-1].strftime("%Y-%m-%d")
        var_dia = preco / float(c.iloc[-2]) - 1 if len(c) > 1 else None
        fa = c[c.index.year < c.index[-1].year]
        var_ano = preco / float(fa.iloc[-1]) - 1 if len(fa) else None
        um = c[c.index >= c.index[-1] - pd.Timedelta(days=365)]
        mn, mx = float(um.min()), float(um.max())
        var_12m = preco / float(um.iloc[0]) - 1 if len(um) > 1 else None
        if "Volume" in px:
            liq = float((px["Close"] * px["Volume"]).dropna().iloc[-21:].mean())
    rend = [p for p in proventos if p["tipo"] == "Rendimento"]
    r12 = [p for p in rend if p["data_base"] >= (HOJE - dt.timedelta(days=365)).isoformat()]
    soma12 = sum(p["valor"] for p in r12) if r12 else None
    ult_r = rend[-1] if rend else None
    if ult_r and px is not None and len(px):
        idx = px.index.tz_localize(None) if getattr(px.index, "tz", None) is not None else px.index
        antes = px["Close"][idx <= pd.Timestamp(ult_r["data_base"])]
        cota_base = float(antes.iloc[-1]) if len(antes) else None
    diario = hist.get("_diario", {}).get(cf) or []
    vp = diario[-1][1] if diario else ult["vp_cota"]
    caixa = tipos.get("Caixa (compromissadas e disponível)")
    ind = {"preco": preco, "vp_cota": vp, "vp_data": diario[-1][0] if diario else None, "p_vp": preco / vp if preco and vp else None,
           "dy_12m": soma12 / preco if soma12 and preco else None, "rend_12m": soma12, "rend_medio_12m": soma12 / len(r12) if r12 else None,
           "ultimo_rendimento": ult_r["valor"] if ult_r else None, "ultimo_yield": ult_r["valor"] / cota_base if ult_r and cota_base else None, "cota_base": cota_base,
           "pl": ult["pl"], "cotistas": ult["cotistas"], "cotas": ult["cotas"], "valor_mercado": preco * ult["cotas"] if preco and ult["cotas"] else None,
           "caixa": caixa, "caixa_pct": caixa / tot if caixa else None, "liquidez_21": liq, "var_12m": var_12m, "var_dia": var_dia, "var_ano": var_ano,
           "data_preco": data_preco, "min_52s": mn, "max_52s": mx, "taxa_adm_12m": None,
           "cagr_vp_3a": (vp / mensal[-37]["vp_cota"]) ** (1 / 3) - 1 if len(mensal) >= 37 and mensal[-37].get("vp_cota") and vp else None}

    pct = lambda x: f"{x * 100:.1f}".replace(".", ",") + "%"  # noqa: E731
    partes = [f"{k.lower()} {pct(v / tot)}" for k, v in sorted(tipos.items(), key=lambda x: -x[1])]
    deb = tipos.get("Debêntures de infraestrutura", 0) / tot
    sobre = {"perfil": "FI-Infra", "publico": "qualquer investidor (público em geral)",
             "grupos": {"papel": deb, "publicos": tipos.get("Títulos públicos", 0) / tot, "caixa": (caixa or 0) / tot,
                        "outros": max(0.0, 1 - deb - (tipos.get("Títulos públicos", 0) + (caixa or 0)) / tot)},
             "texto": ("FI-Infra: fundo que investe, por meio de fundos master, em debêntures incentivadas de infraestrutura (Lei 12.431). "
                       "Para pessoa física, os rendimentos e o ganho na venda das cotas são isentos de IR, desde que respeitadas as regras da lei. "
                       "Não é um FII: não tem imóveis e informa à CVM pelo informe diário e pela carteira mensal (CDA). "
                       + (f"Pela carteira de {F.mes_extenso(ref_cda)}, olhando através dos fundos master: " + "; ".join(partes) + "." if partes else "")
                       + (f" {pct(comp['sigilo'] / tot)} da carteira está sob sigilo temporário na CVM (aparece só pelo total do tipo de ativo)." if comp["sigilo"] > 0.01 * tot else ""))}
    docs = documentos_cvm(cf)
    return {
        "ticker": t, "cnpj": cnpj, "tipo": "infra", "atualizado_em": dt.datetime.now().isoformat(timespec="seconds"), "sobre": sobre,
        "cadastro": {"nome": fii.get("nome_cvm") or fii.get("nome"), "nome_curto": fii.get("nome"), "segmento": "FI-Infra (debêntures incentivadas)",
                     "mandato": None, "gestao": "Ativa", "administrador": None, "publico": "Público em geral", "inicio": None, "prazo": None, "site": None},
        "indicadores": ind, "mensal": mensal, "proventos": proventos, "conferencia_proventos": conferencia,
        "composicao": {"ref_mensal": ref_cda, "ref_trimestral": None,
                       "por_tipo": sorted([{"nome": k, "valor": v} for k, v in tipos.items()], key=lambda x: -x["valor"]),
                       "por_segmento": [], "vencimento_contratos": [], "indexador_contratos": [], "vencimento_ativos": [], "setor_inquilinos": [],
                       "carteira_top": comp["carteira"], "sigilo": comp["sigilo"]},
        "imoveis": [], "documentos": docs, "relatorio_gerencial": None,
        "fontes": {"cvm": "CVM Dados Abertos: Informe Diário, Carteira (CDA) e Documentos eventuais de fundos", "b3": "B3: proventos do fundo listado",
                   "preco": "Yahoo Finance (B3)"},
    }


def montar_todos(lista: list[dict], pxs: dict) -> list[dict]:
    infra = [f for f in lista if f.get("tipo") == "infra"]
    if not infra:
        return []
    hist = historico([fmt_cnpj(f["cnpj"]) for f in infra])
    cda = cda_mais_recente()
    out = []
    for f in infra:
        t = f["ticker"]
        arq = F.SAIDA / f"{t}.json"
        anterior = json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else None
        try:
            out.append(montar(f, hist, cda, pxs.get(t + ".SA"), anterior))
        except Exception as e:
            print(f"{t}: {e}")
    return out
