"""Fundos imobiliários (FIIs): dados oficiais para as páginas de cada fundo.

Fontes (todas automáticas):
  - CVM Dados Abertos, Informe Mensal de FII: patrimônio líquido, valor patrimonial da cota, cotistas,
    dividend yield do mês, rentabilidade, taxa de administração e composição do ativo.
  - CVM Dados Abertos, Informe Trimestral de FII: carteira ativo a ativo (CRI, cotas de outros FIIs, ações),
    imóveis (endereço, área, vacância), vencimento e indexador dos contratos, setor dos inquilinos.
  - FundosNet (B3): avisos de rendimentos (valor, data base, pagamento), relatórios gerenciais,
    fatos relevantes, comunicados e assembleias, com link para o documento original.
  - Yahoo Finance: preço, histórico e proventos, usados para conferir os rendimentos do FundosNet.

Lista de fundos: data/fiis.json. Saída: data/fiis/<TICKER>.json e data/fiis/_index.json.
Uso: python pipeline/fiis.py
"""
from __future__ import annotations

import datetime as dt
import io
import json
import re
import sys
import time
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sources as S  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
DATA = RAIZ / "data"
SAIDA = DATA / "fiis"
CACHE = Path(__file__).resolve().parent / ".cache" / "fii"
HOJE = dt.date.today()
FNET = "https://fnet.bmfbovespa.com.br/fnet/publico"
CAB = {"User-Agent": "Mozilla/5.0", "X-Requested-With": "XMLHttpRequest"}


def so_digitos(x) -> str:
    return re.sub(r"\D", "", str(x or ""))


def num(x):
    try:
        v = float(str(x).replace(",", "."))
        return v if v == v else None
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- CVM
def cvm_zip(tipo: str, ano: int) -> zipfile.ZipFile | None:
    """Baixa (com cache) o zip do informe mensal ou trimestral de FII de um ano."""
    pasta = {"mensal": "INF_MENSAL", "trimestral": "INF_TRIMESTRAL"}[tipo]
    arq = CACHE / f"inf_{tipo}_fii_{ano}.zip"
    validade = 1 if ano >= HOJE.year - 1 else 60          # dias
    if not arq.exists() or (time.time() - arq.stat().st_mtime) > validade * 86400:
        url = f"https://dados.cvm.gov.br/dados/FII/DOC/{pasta}/DADOS/inf_{tipo}_fii_{ano}.zip"
        try:
            r = S.get(url)
            CACHE.mkdir(parents=True, exist_ok=True)
            arq.write_bytes(r.content)
        except Exception as e:
            print(f"CVM {tipo} {ano}: {e}")
            if not arq.exists():
                return None
    try:
        return zipfile.ZipFile(arq)
    except zipfile.BadZipFile:
        return None


def tabela(z: zipfile.ZipFile | None, parte: str) -> pd.DataFrame:
    if z is None:
        return pd.DataFrame()
    nome = next((n for n in z.namelist() if re.search(rf"_fii_{parte}_\d{{4}}\.csv$", n)), None)
    if not nome:
        return pd.DataFrame()
    df = pd.read_csv(z.open(nome), sep=";", encoding="latin1", dtype=str)
    df["_cnpj"] = df[[c for c in df.columns if c.startswith("CNPJ_Fundo")][0]].map(so_digitos)
    return df


def carregar_cvm(anos: list[int]) -> dict:
    m = {p: [] for p in ("geral", "complemento", "ativo_passivo")}
    t = {p: [] for p in ("geral", "ativo", "imovel", "complemento", "imovel_renda_acabado_inquilino")}
    for ano in anos:
        zm, zt = cvm_zip("mensal", ano), cvm_zip("trimestral", ano)
        for p in m:
            m[p].append(tabela(zm, p))
        for p in t:
            t[p].append(tabela(zt, p))
    junta = lambda lst: pd.concat([x for x in lst if not x.empty], ignore_index=True) if any(not x.empty for x in lst) else pd.DataFrame()  # noqa: E731
    return {"mensal": {k: junta(v) for k, v in m.items()}, "trimestral": {k: junta(v) for k, v in t.items()}, "fiagro": carregar_fiagro()}


def carregar_fiagro(desde: str = "2025-05") -> pd.DataFrame:
    """Informe Mensal de Fiagro da CVM (os Fiagros saíram do informe de FII em 2025). Um zip por mês."""
    pasta, partes = CACHE / "fiagro", []
    pasta.mkdir(parents=True, exist_ok=True)
    m = dt.date(int(desde[:4]), int(desde[5:7]), 1)
    while m <= HOJE:
        ym = f"{m.year}{m.month:02d}"
        arq = pasta / f"inf_mensal_fiagro_{ym}.zip"
        recente = (HOJE.year * 12 + HOJE.month) - (m.year * 12 + m.month) <= 3
        if not arq.exists() or (recente and time.time() - arq.stat().st_mtime > 86400):
            try:
                r = S.get(f"https://dados.cvm.gov.br/dados/FIAGRO/DOC/INF_MENSAL/DADOS/inf_mensal_fiagro_{ym}.zip")
                arq.write_bytes(r.content)
            except Exception as e:
                if recente:
                    print(f"Fiagro {ym}: {e}")
        if arq.exists():
            try:
                z = zipfile.ZipFile(arq)
                nome = next((n for n in z.namelist() if re.search(r"inf_mensal_fiagro_\d{6}\.csv$", n)), None)
                if nome:
                    partes.append(pd.read_csv(z.open(nome), sep=";", encoding="latin1", dtype=str))
            except zipfile.BadZipFile:
                arq.unlink(missing_ok=True)
        m = dt.date(m.year + (m.month == 12), m.month % 12 + 1, 1)
    if not partes:
        return pd.DataFrame()
    df = pd.concat(partes, ignore_index=True)
    df["_cnpj"] = df["CNPJ_Classe"].map(so_digitos)
    return df


def mensal_fiagro(fg: pd.DataFrame) -> list[dict]:
    """Série mensal no mesmo formato do informe de FII (o de Fiagro traz percentuais em %, aqui em fração)."""
    out = []
    for _, r in fg.iterrows():
        taxa = sum(abs(num(r.get(c)) or 0) for c in ("Percentual_Despesas_Taxa_Administracao", "Percentual_Despesas_Taxa_Gestao", "Percentual_Despesas_Taxa_Distribuicao")) / 100
        pct = lambda c: num(r.get(c)) / 100 if num(r.get(c)) is not None else None  # noqa: E731
        out.append({"ref": r["Data_Referencia"][:7], "pl": num(r["Patrimonio_Liquido"]), "vp_cota": num(r["Valor_Patrimonial_Cotas"]), "cotas": num(r["Cotas_Emitidas"]),
                    "cotistas": num(r["Numero_Cotistas"]), "ativo": num(r["Valor_Ativo"]), "dy_mes": pct("Dividend_Yield_Mes"),
                    "rent_efetiva": pct("Rentabilidade_Efetiva_Mes"), "rent_patrimonial": pct("Rentabilidade_Patrimonial_Mes"),
                    "taxa_adm_mes": taxa if 0 < taxa < 0.003 else None})
    return out


def composicao_fiagro(a) -> dict:
    """Composição do ativo de um Fiagro pelo informe mensal (os campos são o detalhe do Total_Investido)."""
    v = lambda *cs: sum(num(a.get(c)) or 0 for c in cs)  # noqa: E731
    tipos = {"Caixa e renda fixa": v("Total_Necessidades_Liquidez"), "CRA": v("CRA", "Outros_Titulos_Securitizacao"), "CRI": v("CRI"),
             "CPR, CDCA e outros títulos do agro": v("Valor_Titulos_Credito"), "Direitos creditórios": v("Demais_Direitos_Creditorios"),
             "Cotas de fundos": v("Cotas_Fundos_Investimento"), "LCA, LCI e títulos bancários": v("Ativos_Financeiros"),
             "Debêntures e notas comerciais": v("Titulos_Divida_Corporativa"), "Imóveis rurais": v("Imoveis_Rurais"),
             "Participações e ações": v("Participacoes_Societarias", "Titulos_Participacoes_Societarias"),
             "Créditos de carbono": v("Creditos_Carbono_Agronegocio", "Creditos_Descarbonizacao")}
    tipos = {k: x for k, x in tipos.items() if x > 0}
    faixas = [("Até 30 dias", "A_Vencer_Ate30Dias"), ("31 a 60 dias", "A_Vencer_31a60Dias"), ("61 a 90 dias", "A_Vencer_61a90Dias"), ("91 a 120 dias", "A_Vencer_91a120Dias"),
              ("121 a 180 dias", "A_Vencer_121a180Dias"), ("181 a 360 dias", "A_Vencer_181a360Dias"), ("1 a 2 anos", "A_Vencer_361a720Dias"), ("2 a 3 anos", "A_Vencer_721a1080Dias"),
              ("Acima de 3 anos", "A_Vencer_Acima1080_Dias"), ("Vencidos", "Vencidos")]
    tot = v("Total_Ativos_Prazo_Vencimento") or sum(v(c) for _, c in faixas)
    venc = [{"faixa": rot, "pct": v(c) / tot} for rot, c in faixas if tot and v(c) > 0]
    return {"tipos": tipos, "vencimento": venc}


def cnpj_por_ticker(geral: pd.DataFrame, ticker: str) -> str | None:
    """O ISIN das cotas de FII é BR + 4 letras do ticker + CTF..., então o ticker identifica o fundo no informe."""
    if geral.empty:
        return None
    x = geral[geral["Codigo_ISIN"].fillna("").str.upper().str.startswith("BR" + ticker[:4].upper())]
    return x["_cnpj"].iloc[-1] if len(x) else None


# ---------------------------------------------------------------- segmentos
def classificar_imovel(nome: str, setor: str = "") -> str:
    n = f"{nome} {setor}".lower()
    if any(p in n for p in ("fazenda", "faz.", "gleba", "zona rural", "sítio", "sitio", "agrícola", "agricola")):
        return "Terras agrícolas"
    if any(p in n for p in ("usina", "solar", "fotovolt", "ufv", "energia", "eólic", "eolic", "pch")):
        return "Energia"
    if "shopping" in n or "mall" in n or "outlet" in n:
        return "Shoppings"
    if any(p in n for p in ("galp", "logíst", "logist", "centro de distribui", "condomínio logístico")):
        return "Logística e industrial"
    if any(p in n for p in ("hospital", "clínica", "clinica")):
        return "Hospitais"
    if any(p in n for p in ("hotel", "suíte", "suite", "resid", "apart")):
        return "Residencial e hotelaria"
    if any(p in n for p in ("edif", "torre", "corporate", "office", "lajes", "faria lima", "paulista")):
        return "Lajes corporativas"
    return "Imóveis (outros)"


SEG_CVM = {
    "shoppings": "Shoppings", "lajes corporativas": "Lajes corporativas", "logística": "Logística e industrial", "logistica": "Logística e industrial",
    "títulos e val. mob.": "Papéis (via FII)", "titulos e val. mob.": "Papéis (via FII)", "hospital": "Hospitais", "residencial": "Residencial e hotelaria",
    "hotel": "Residencial e hotelaria", "híbrido": "Híbridos e multicategoria", "hibrido": "Híbridos e multicategoria", "multicategoria": "Híbridos e multicategoria",
    "agro": "Agro", "educacional": "Educacional",
}


def tx(*v) -> str:
    """Primeiro texto não vazio (as tabelas da CVM trazem NaN em campos vazios)."""
    return next((x.strip() for x in v if isinstance(x, str) and x.strip()), "")


def segmento_fii(seg: str) -> str:
    s = (seg if isinstance(seg, str) else "").strip().lower()
    return SEG_CVM.get(s, "Outros FIIs")


# ---------------------------------------------------------------- FundosNet
def fnet_documentos(cnpj: str, maximo: int = 400) -> list[dict]:
    docs, inicio = [], 0
    while inicio < maximo:
        url = (f"{FNET}/pesquisarGerenciadorDocumentosDados?d=1&s={inicio}&l=100&o%5B0%5D%5BdataEntrega%5D=desc&cnpjFundo={cnpj}")
        try:
            j = S.get(url, headers=CAB).json()
        except Exception as e:
            print(f"FundosNet {cnpj}: {e}")
            break
        lote = j.get("data") or []
        docs += lote
        inicio += 100
        if len(lote) < 100 or inicio >= (j.get("recordsTotal") or 0):
            break
    return docs


def data_br(s: str | None) -> str | None:
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})(?:\s+(\d{2}:\d{2}))?", s or "")
    if not m:
        return None
    return f"{m[3]}-{m[2]}-{m[1]}" + (f"T{m[4]}" if m[4] else "")


def rendimento_xml(doc_id: int) -> list[dict]:
    """Lê um aviso de rendimentos estruturado do FundosNet (XML); usa cache local por documento."""
    arq = CACHE / "fnet" / f"{doc_id}.xml"
    if not arq.exists():
        r = S.get(f"{FNET}/downloadDocumento?id={doc_id}", headers={"User-Agent": "Mozilla/5.0"})
        arq.parent.mkdir(parents=True, exist_ok=True)
        arq.write_bytes(r.content)
    try:
        raiz = ET.fromstring(arq.read_bytes())
    except ET.ParseError:
        return []
    out = []
    for p in raiz.iter("Provento"):
        cod = (p.findtext("CodNegociacao") or "").strip()
        for tag, tipo in (("Rendimento", "Rendimento"), ("Amortizacao", "Amortização")):
            for r in p.iter(tag):
                v = num(r.findtext("ValorProvento"))
                base, pag = (r.findtext("DataBase") or "")[:10], (r.findtext("DataPagamento") or "")[:10]
                if base and pag and pag < base:                   # data base com erro de digitação (o pagamento vem depois dela)
                    ref = (r.findtext("PeriodoReferencia") or "").strip().lower()
                    m = re.match(r"([a-zç]+)\s+(\d{4})", ref)
                    meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
                    if m and m.group(1) in meses:                 # usa o mês de referência do próprio aviso: último dia útil dele
                        base = (pd.Timestamp(int(m.group(2)), meses.index(m.group(1)) + 1, 1) + pd.offsets.BMonthEnd(0)).date().isoformat()
                    else:
                        try:
                            b = dt.date.fromisoformat(base).replace(year=int(pag[:4]))
                            if b.isoformat() > pag:
                                b = b.replace(year=b.year - 1)
                            base = b.isoformat()
                        except ValueError:
                            pass
                if v:
                    out.append({"codigo": cod, "tipo": tipo, "valor": v, "data_base": base or None,
                                "pagamento": pag or None, "referencia": (r.findtext("PeriodoReferencia") or "").strip().capitalize() or None,
                                "isento_ir": (r.findtext("RendimentoIsentoIR") or "").strip().lower() == "sim", "doc": doc_id})
    return out


def link_doc(doc_id) -> str:
    return f"{FNET}/exibirDocumento?id={doc_id}&cvm=true"


# ---------------------------------------------------------------- montagem
def montar(fii: dict, cvm: dict, geral_todos: pd.DataFrame, px: pd.DataFrame | None) -> dict:
    t = fii["ticker"]
    cnpj = fii.get("cnpj") and so_digitos(fii["cnpj"]) or cnpj_por_ticker(geral_todos, t)
    if not cnpj:
        raise RuntimeError("CNPJ não encontrado no informe da CVM")
    M, T = cvm["mensal"], cvm["trimestral"]
    g = M["geral"][M["geral"]["_cnpj"] == cnpj].sort_values("Data_Referencia")
    cad = g.iloc[-1] if len(g) else None

    # série mensal (informe mensal)
    comp = M["complemento"][M["complemento"]["_cnpj"] == cnpj].sort_values(["Data_Referencia", "Versao"]).drop_duplicates("Data_Referencia", keep="last")
    mensal = [{"ref": r["Data_Referencia"][:7], "pl": num(r["Patrimonio_Liquido"]), "vp_cota": num(r["Valor_Patrimonial_Cotas"]), "cotas": num(r["Cotas_Emitidas"]),
               "cotistas": num(r["Total_Numero_Cotistas"]), "ativo": num(r["Valor_Ativo"]), "dy_mes": num(r["Percentual_Dividend_Yield_Mes"]),
               "rent_efetiva": num(r["Percentual_Rentabilidade_Efetiva_Mes"]), "rent_patrimonial": num(r["Percentual_Rentabilidade_Patrimonial_Mes"]),
               "taxa_adm_mes": num(r["Percentual_Despesas_Taxa_Administracao"])} for _, r in comp.iterrows()]
    fg = pd.DataFrame()
    if fii.get("tipo") == "fiagro" and len(cvm.get("fiagro", [])):
        F = cvm["fiagro"]
        fg = F[F["_cnpj"] == cnpj].sort_values(["Data_Referencia", "Versao"]).drop_duplicates("Data_Referencia", keep="last")
        if len(fg):
            novos = {m["ref"]: m for m in mensal_fiagro(fg)}
            mensal = [m for m in mensal if m["ref"] not in novos] + list(novos.values())
            mensal.sort(key=lambda m: m["ref"])
    ult_m = mensal[-1] if mensal else {}

    # composição do ativo (informe mensal, mês mais recente)
    ap = M["ativo_passivo"][M["ativo_passivo"]["_cnpj"] == cnpj].sort_values(["Data_Referencia", "Versao"])
    tipos = {}
    if len(ap):
        a = ap.iloc[-1]
        soma = lambda cols: sum(num(a.get(c)) or 0 for c in cols)  # noqa: E731
        maior = lambda cols: max(num(a.get(c)) or 0 for c in cols)  # noqa: E731  (campos que repetem o mesmo valor em versões do informe)
        # "Direitos_Bens_Imoveis" é o total dos imóveis; os demais campos de imóveis são o detalhe dele
        imov = num(a.get("Direitos_Bens_Imoveis")) or soma(["Terrenos", "Imoveis_Renda_Acabados", "Imoveis_Renda_Construcao", "Imoveis_Venda_Acabados", "Imoveis_Venda_Construcao", "Outros_Direitos_Reais"])
        tipos = {"Caixa e renda fixa": soma(["Disponibilidades", "Titulos_Publicos", "Titulos_Privados", "Fundos_Renda_Fixa"]),
                 "CRI e CRA": maior(["CRI", "CRI_CRA"]), "Cotas de FII": soma(["FII"]),
                 "Imóveis": imov,
                 "LCI, LCA e LIG": maior(["LCI", "LCI_LCA"]) + soma(["LIG", "Letras_Hipotecarias"]),
                 "Ações e outros": soma(["Acoes", "Debentures", "Fundo_Acoes", "FIP", "FDIC", "Outras_Cotas_FI", "Acoes_Sociedades_Atividades_FII", "Cotas_Sociedades_Atividades_FII", "Outros_Valores_Mobliarios"])}
        tipos = {k: v for k, v in tipos.items() if v > 0}
        ref_ativo = a["Data_Referencia"][:7]
    else:
        ref_ativo = None
    venc_fiagro = []
    if len(fg):
        cf = composicao_fiagro(fg.iloc[-1])
        tipos, venc_fiagro, ref_ativo = cf["tipos"], cf["vencimento"], fg.iloc[-1]["Data_Referencia"][:7]

    # trimestral: carteira, imóveis, contratos
    def ultimo(df):
        x = df[df["_cnpj"] == cnpj] if not df.empty else df
        return x[x["Data_Referencia"] == x["Data_Referencia"].max()] if len(x) else x
    ativos, imoveis, ctr, inq = ultimo(T["ativo"]), ultimo(T["imovel"]), ultimo(T["complemento"]), ultimo(T["imovel_renda_acabado_inquilino"])
    ref_tri = ativos["Data_Referencia"].iloc[0] if len(ativos) else (imoveis["Data_Referencia"].iloc[0] if len(imoveis) else None)
    if ref_tri and ref_tri < (HOJE - dt.timedelta(days=450)).isoformat():
        ativos, imoveis, ctr, inq = ativos.iloc[0:0], imoveis.iloc[0:0], ctr.iloc[0:0], inq.iloc[0:0]
        ref_tri = None

    seg_por_cnpj = {r["_cnpj"]: r.get("Segmento_Atuacao") for _, r in geral_todos.iterrows()}
    nome_por_cnpj = {r["_cnpj"]: r.get("Nome_Fundo_Classe") for _, r in geral_todos.iterrows()}
    segmentos, carteira = {}, []
    for _, r in ativos.iterrows():
        v = num(r["Valor"]) or 0
        tipo = tx(r["Tipo"])
        emissor = so_digitos(r["CNPJ_Emissor"])
        if tipo.upper() == "FII":
            seg = segmento_fii(seg_por_cnpj.get(emissor))
            nome = tx(nome_por_cnpj.get(emissor), r.get("Emissor"))
        elif "CRI" in tipo.upper() or "CRA" in tipo.upper():
            seg, nome = "Papéis (CRI e CRA)", tx(r.get("Emissor"))
        else:
            seg, nome = "Ações e outros", tx(r.get("Emissor"), r.get("Nome_Ativo"))
        segmentos[seg] = segmentos.get(seg, 0) + v
        carteira.append({"tipo": tipo, "nome": nome, "valor": v, "segmento": seg})
    # imóveis entram pelo valor do informe mensal, repartido pela receita de cada imóvel (aproximação)
    renda = imoveis[imoveis["Classe"].fillna("").str.contains("renda", case=False)] if len(imoveis) else imoveis
    venda = imoveis[imoveis["Classe"].fillna("").str.contains("venda", case=False)] if len(imoveis) else imoveis
    if len(ap):
        a = ap.iloc[-1]
        v_renda = sum(num(a.get(c)) or 0 for c in ("Imoveis_Renda_Acabados", "Imoveis_Renda_Construcao"))
        v_venda = sum(num(a.get(c)) or 0 for c in ("Imoveis_Venda_Acabados", "Imoveis_Venda_Construcao", "Terrenos"))
        pesos = [(classificar_imovel(r["Nome_Imovel"]), num(r["Percentual_Receitas_FII"]) or 0) for _, r in renda.iterrows()]
        tot = sum(p for _, p in pesos)
        for seg, p in pesos:
            segmentos[seg] = segmentos.get(seg, 0) + (v_renda * p / tot if tot else v_renda / max(len(pesos), 1))
        for _, r in venda.iterrows():
            seg = classificar_imovel(r["Nome_Imovel"])
            segmentos[seg] = segmentos.get(seg, 0) + v_venda * (num(r["Percentual_Imovel_Total_Investido"]) or (1 / max(len(venda), 1)))
        caixa = sum(num(a.get(c)) or 0 for c in ("Disponibilidades", "Titulos_Publicos", "Titulos_Privados", "Fundos_Renda_Fixa"))
        if caixa:
            segmentos["Caixa e renda fixa"] = segmentos.get("Caixa e renda fixa", 0) + caixa

    lista_imoveis = []
    for _, r in imoveis.iterrows():
        end = tx(r.get("Endereco"))
        uf = re.search(r"\b([A-Z]{2})\b\s*$", end) or re.search(r"[-/,]\s*([A-Z]{2})\b", end)
        lista_imoveis.append({"nome": tx(r["Nome_Imovel"]), "classe": tx(r.get("Classe")), "endereco": end, "uf": uf.group(1) if uf else None,
                              "area": num(r.get("Area")), "vacancia": num(r.get("Percentual_Vacancia")), "inadimplencia": num(r.get("Percentual_Inadimplencia")),
                              "pct_receitas": num(r.get("Percentual_Receitas_FII")), "segmento": classificar_imovel(r["Nome_Imovel"])})
    vencimento, indexador = [], []
    if len(ctr):
        c = ctr.iloc[0]
        faixas = [("Até 3 meses", "Ate_3Meses"), ("3 a 6 meses", "3a6Meses"), ("6 a 9 meses", "6a9Meses"), ("9 a 12 meses", "9a12Meses"), ("12 a 15 meses", "12a15Meses"),
                  ("15 a 18 meses", "15a18Meses"), ("18 a 21 meses", "18a21Meses"), ("21 a 24 meses", "21a24Meses"), ("24 a 27 meses", "24a27Meses"), ("27 a 30 meses", "27a30Meses"),
                  ("30 a 33 meses", "30a33Meses"), ("33 a 36 meses", "33a36Meses"), ("Acima de 36 meses", "Acima_36Meses"), ("Indeterminado", "Indeterminado")]
        for rot, suf in faixas:
            v = num(c.get(f"Percentual_Vencimento_Valor_Total_Faixa_{suf}"))
            if v:
                vencimento.append({"faixa": rot, "pct": v})
        for col in c.index:
            m = re.match(r"Percentual_Indexador_Valor_Total_(.+)", col)
            v = num(c[col])
            if m and v:
                indexador.append({"indexador": m.group(1).replace("_", " ").replace("IGPM", "IGP-M").replace("IGPDI", "IGP-DI"), "pct": v})
    setores_inq = {}
    for _, r in inq.iterrows():
        s = (tx(r.get("Setor_Atuacao")) or "Outros")
        setores_inq[s] = setores_inq.get(s, 0) + (num(r.get("Percentual_Receitas_FII")) or 0)

    # FundosNet: documentos e rendimentos
    docs = fnet_documentos(cnpj)
    rend = []
    for d in docs:
        if "rendimento" in f"{d.get('tipoDocumento')} {d.get('categoriaDocumento')}".lower() and "estruturado" in (d.get("categoriaDocumento") or "").lower():
            try:
                rend += [x for x in rendimento_xml(d["id"]) if not x["codigo"] or x["codigo"].upper() == t]
            except Exception as e:
                print(f"{t}: aviso {d.get('id')}: {e}")
    vistos, proventos = set(), []
    for x in sorted(rend, key=lambda x: (x["data_base"] or "", x["doc"]), reverse=True):   # retificações: fica a mais nova
        k = (x["data_base"], x["tipo"])
        if k not in vistos:
            vistos.add(k)
            proventos.append(x)
    proventos.sort(key=lambda x: x["data_base"] or "")
    documentos = [{"id": d["id"], "entrega": data_br(d.get("dataEntrega")), "categoria": (d.get("categoriaDocumento") or "").strip(), "tipo": (d.get("tipoDocumento") or "").strip(),
                   "especie": (d.get("especieDocumento") or "").strip(), "referencia": (d.get("dataReferencia") or "").strip(), "link": link_doc(d["id"])}
                  for d in docs[:120]]
    documentos.sort(key=lambda x: x["entrega"] or "", reverse=True)
    rel = next((d for d in documentos if "relatório gerencial" in d["tipo"].lower()), None)

    # conferência dos rendimentos com o Yahoo (segunda fonte)
    conferencia = None
    if px is not None and "Dividends" in px:
        dy = px["Dividends"][px["Dividends"] > 0]
        # o Yahoo registra a data ex (primeiro pregão depois da data base): casa cada aviso do FundosNet com o
        # provento do Yahoo até 7 dias depois da data base e compara os valores
        ys = [(pd.Timestamp(d.date()), float(v)) for d, v in dy.items()]
        recentes = [p for p in proventos if p["tipo"] == "Rendimento" and p["data_base"]][-12:]
        diverg = []
        for p in recentes:
            b = pd.Timestamp(p["data_base"])
            par = [v for d, v in ys if b < d <= b + pd.Timedelta(days=7)]
            if not par or abs(par[0] - p["valor"]) > 0.005:
                diverg.append(p["data_base"][:7])
        conferencia = {"meses_comparados": len(recentes), "divergentes": diverg, "fonte": "Yahoo Finance"}

    # preço e indicadores
    preco = var_12m = mn = mx = liq = var_dia = var_ano = data_preco = None
    if px is not None and len(px):
        c = px["Close"].dropna()
        preco = float(c.iloc[-1])
        data_preco = c.index[-1].strftime("%Y-%m-%d")
        if len(c) > 1:
            var_dia = preco / float(c.iloc[-2]) - 1
        fim_ano = c[c.index.year < c.index[-1].year]
        if len(fim_ano):
            var_ano = preco / float(fim_ano.iloc[-1]) - 1
        um_ano = c[c.index >= c.index[-1] - pd.Timedelta(days=365)]
        mn, mx = float(um_ano.min()), float(um_ano.max())
        if len(um_ano) > 1:
            var_12m = preco / float(um_ano.iloc[0]) - 1
        if "Volume" in px:
            liq = float((px["Close"] * px["Volume"]).dropna().iloc[-21:].mean())
    rend12 = [p for p in proventos if p["tipo"] == "Rendimento" and p["data_base"] and p["data_base"] >= (HOJE - dt.timedelta(days=365)).isoformat()]
    soma12 = sum(p["valor"] for p in rend12) if rend12 else None
    ult_r = next((p for p in reversed(proventos) if p["tipo"] == "Rendimento"), None)
    cota_base = None
    if ult_r and px is not None and len(px):
        antes = px["Close"][px.index.tz_localize(None) <= pd.Timestamp(ult_r["data_base"])] if getattr(px.index, "tz", None) is not None else px["Close"][px.index <= pd.Timestamp(ult_r["data_base"])]
        cota_base = float(antes.iloc[-1]) if len(antes) else None
    vp = ult_m.get("vp_cota")
    caixa_pct = (tipos.get("Caixa e renda fixa") or 0) / ult_m["ativo"] if ult_m.get("ativo") else None
    ind = {
        "preco": preco, "vp_cota": vp, "p_vp": preco / vp if preco and vp else None,
        "dy_12m": soma12 / preco if soma12 and preco else None, "rend_12m": soma12, "rend_medio_12m": soma12 / len(rend12) if rend12 else None,
        "ultimo_rendimento": ult_r["valor"] if ult_r else None, "ultimo_yield": ult_r["valor"] / cota_base if ult_r and cota_base else None, "cota_base": cota_base,
        "pl": ult_m.get("pl"), "cotistas": ult_m.get("cotistas"), "cotas": ult_m.get("cotas"), "valor_mercado": preco * ult_m["cotas"] if preco and ult_m.get("cotas") else None,
        "caixa": tipos.get("Caixa e renda fixa"), "caixa_pct": caixa_pct, "liquidez_21": liq, "var_12m": var_12m, "var_dia": var_dia, "var_ano": var_ano, "data_preco": data_preco, "min_52s": mn, "max_52s": mx,
        "taxa_adm_12m": sum(m["taxa_adm_mes"] for m in mensal[-12:]) if len(mensal) >= 12 and all(m.get("taxa_adm_mes") is not None for m in mensal[-12:]) else None,
        "cagr_vp_3a": (vp / mensal[-37]["vp_cota"]) ** (1 / 3) - 1 if len(mensal) >= 37 and mensal[-37].get("vp_cota") and vp else None,
    }
    # resumo automático do perfil e da carteira (papel x tijolo x cotas de FII x caixa)
    CLASSE = {"Papéis (CRI e CRA)": "papel", "Papéis (via FII)": "papel", "Caixa e renda fixa": "caixa", "Ações e outros": "outros",
              "Híbridos e multicategoria": "fiis", "Outros FIIs": "fiis"}
    tot_seg = sum(v for v in segmentos.values() if v > 0) or 1
    grupos, tijolo = {}, {}
    for k, v in segmentos.items():
        if v <= 0:
            continue
        c = CLASSE.get(k, "tijolo")
        grupos[c] = grupos.get(c, 0) + v / tot_seg
        if c == "tijolo":
            tijolo[k] = tijolo.get(k, 0) + v / tot_seg
    pct = lambda x: f"{x * 100:.1f}".replace(".", ",") + "%"  # noqa: E731
    partes = []
    if grupos.get("papel"):
        partes.append(f"{pct(grupos['papel'])} em papel (CRI e CRA)")
    if grupos.get("tijolo"):
        det = ", ".join(f"{k.lower()} {pct(v)}" for k, v in sorted(tijolo.items(), key=lambda x: -x[1]))
        partes.append(f"{pct(grupos['tijolo'])} em tijolo ({det})")
    if grupos.get("fiis"):
        partes.append(f"{pct(grupos['fiis'])} em cotas de outros FIIs híbridos ou diversos")
    if grupos.get("caixa"):
        partes.append(f"{pct(grupos['caixa'])} em caixa e renda fixa")
    if grupos.get("outros"):
        partes.append(f"{pct(grupos['outros'])} em ações e outros ativos")
    dom_tijolo = max(tijolo.items(), key=lambda x: x[1])[0] if tijolo else None
    perfil = "agro (terras agrícolas)" if dom_tijolo == "Terras agrícolas" and tijolo[dom_tijolo] >= 0.5 else "energia" if dom_tijolo == "Energia" and tijolo[dom_tijolo] >= 0.5 else "papel" if grupos.get("papel", 0) >= 0.67 else "tijolo" if grupos.get("tijolo", 0) >= 0.67 else "fundo de fundos" if grupos.get("fiis", 0) >= 0.67 else "híbrido"
    publico = (cad.get("Publico_Alvo") if cad is not None else "") or ""
    publico_txt = "investidores qualificados" if "QUALIF" in publico.upper() and "NAO" not in publico.upper() else "investidores profissionais" if "PROFISS" in publico.upper() else "qualquer investidor (público em geral)"
    sobre = {
        "perfil": perfil, "publico": publico_txt, "grupos": grupos,
        "texto": (f"Fundo {perfil} de gestão {((cad.get('Tipo_Gestao') if cad is not None else '') or '').lower() or 'não informada'}, "
                  f"segmento {((cad['Segmento_Atuacao'] if cad is not None else '') or 'não informado').lower()} na CVM, aberto a {publico_txt}. "
                  + (f"Pela carteira informada à CVM em {mes_extenso(ref_tri or ref_ativo)}: " + "; ".join(partes) + "." if partes else "")),
    }

    if len(fg):
        # Fiagro: cadastro, perfil e resumo da carteira pelo informe mensal de Fiagro
        a = fg.iloc[-1]
        tot = sum(tipos.values()) or 1
        papel = sum(tipos.get(k, 0) for k in ("CRA", "CRI", "CPR, CDCA e outros títulos do agro", "Direitos creditórios", "Debêntures e notas comerciais")) / tot
        publico = tx(a.get("Publico_Alvo")).upper()
        publico_txt = "investidores qualificados" if "QUALIF" in publico and "NAO" not in publico else "investidores profissionais" if "PROFISS" in publico else "qualquer investidor (público em geral)"
        partes = [f"{k} {pct(v / tot)}" for k, v in sorted(tipos.items(), key=lambda x: -x[1])]
        sobre = {"perfil": "Fiagro de papel" if papel >= 0.67 else "Fiagro", "publico": publico_txt,
                 "grupos": {"papel": papel, "caixa": tipos.get("Caixa e renda fixa", 0) / tot, "fiis": tipos.get("Cotas de fundos", 0) / tot,
                            "tijolo": tipos.get("Imóveis rurais", 0) / tot, "outros": max(0.0, 1 - papel - (tipos.get("Caixa e renda fixa", 0) + tipos.get("Cotas de fundos", 0) + tipos.get("Imóveis rurais", 0)) / tot)},
                 "texto": (f"Fiagro (fundo de investimento nas cadeias do agronegócio) gerido por {tx(a.get('Nome_Gestor')).title() or 'gestor não informado'}, "
                           f"aberto a {publico_txt}. Desde 2025 informa à CVM pelo Informe Mensal de Fiagro. "
                           f"Pela carteira de {mes_extenso(ref_ativo)}: " + "; ".join(partes) + ".")}
        cad = {"Nome_Fundo_Classe": tx(a.get("Nome_Classe")), "Segmento_Atuacao": "Fiagro", "Mandato": None, "Tipo_Gestao": None,
               "Nome_Administrador": tx(a.get("Nome_Administrador")), "Publico_Alvo": tx(a.get("Publico_Alvo")),
               "Data_Funcionamento": cad.get("Data_Funcionamento") if cad is not None else None, "Prazo_Duracao": "Indeterminado" if tx(a.get("Prazo_Duracao")).startswith("0 ") else tx(a.get("Prazo_Duracao")), "Site": tx(a.get("Site"))}
        vencimento, indexador, segmentos, carteira, lista_imoveis = [], [], {}, [], []
    return {
        "ticker": t, "cnpj": cnpj, "tipo": fii.get("tipo") or "fii", "atualizado_em": dt.datetime.now().isoformat(timespec="seconds"), "sobre": sobre,
        "cadastro": {"nome": (cad["Nome_Fundo_Classe"] if cad is not None else fii.get("nome")), "nome_curto": fii.get("nome"),
                     "segmento": cad["Segmento_Atuacao"] if cad is not None else None, "mandato": cad.get("Mandato") if cad is not None else None,
                     "gestao": cad.get("Tipo_Gestao") if cad is not None else None, "administrador": cad.get("Nome_Administrador") if cad is not None else None,
                     "publico": cad.get("Publico_Alvo") if cad is not None else None, "inicio": cad.get("Data_Funcionamento") if cad is not None else None,
                     "prazo": cad.get("Prazo_Duracao") if cad is not None else None, "site": cad.get("Site") if cad is not None else None},
        "indicadores": ind, "mensal": mensal, "proventos": proventos, "conferencia_proventos": conferencia,
        "composicao": {"ref_mensal": ref_ativo, "ref_trimestral": ref_tri,
                       "por_tipo": sorted([{"nome": k, "valor": v} for k, v in tipos.items()], key=lambda x: -x["valor"]),
                       "por_segmento": sorted([{"nome": k, "valor": v} for k, v in segmentos.items() if v > 0], key=lambda x: -x["valor"]),
                       "vencimento_contratos": vencimento, "indexador_contratos": indexador, "vencimento_ativos": venc_fiagro,
                       "setor_inquilinos": sorted([{"nome": k, "pct": v} for k, v in setores_inq.items()], key=lambda x: -x["pct"]),
                       "carteira_top": sorted(carteira, key=lambda x: -x["valor"])[:15]},
        "imoveis": lista_imoveis, "documentos": documentos, "relatorio_gerencial": rel,
        "fontes": {"cvm": "CVM Dados Abertos: Informe Mensal de Fiagro (desde 2025) e Informe Mensal de FII (histórico)" if len(fg) else "CVM Dados Abertos: Informe Mensal e Informe Trimestral de FII", "fundosnet": "FundosNet (B3): avisos de rendimentos e documentos", "preco": "Yahoo Finance (B3)"},
    }


MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]


def mes_extenso(ref: str | None) -> str:
    try:
        return f"{MESES[int(ref[5:7]) - 1]} de {ref[:4]}"
    except (TypeError, ValueError, IndexError):
        return "data não informada"


def limpo(x):
    """Troca NaN/infinito (campos vazios do informe) por None, para o JSON ser válido no navegador."""
    if isinstance(x, float) and (x != x or x in (float("inf"), float("-inf"))):
        return None
    if isinstance(x, dict):
        return {k: limpo(v) for k, v in x.items()}
    if isinstance(x, list):
        return [limpo(v) for v in x]
    return x


def eventos_fundo_b3(ticker: str, tipo: str | None) -> list[dict]:
    """Desdobramentos, grupamentos e bonificações do fundo informados pela B3."""
    import base64
    p = base64.b64encode(json.dumps({"cnpj": "0", "identifierFund": ticker[:4], "typeFund": 27 if tipo == "infra" else 7}).encode()).decode()
    try:
        d = S.get(f"https://sistemaswebb3-listados.b3.com.br/fundsProxy/fundsCall/GetListedSupplementFunds/{p}", headers={"User-Agent": "Mozilla/5.0"}).json()
    except Exception as e:
        print(f"{ticker}: eventos B3: {e}")
        return []
    return S.eventos_b3(d.get("stockDividends"), lambda isin: isin.startswith("BR" + ticker[:4] + "CTF"))


def ajustar_desdobramentos(d: dict, eventos_b3: list[dict] | None = None) -> list:
    """Desdobramento, grupamento ou bonificação de cotas quebram as séries por cota. Fonte principal: eventos da B3
    (fator e data com oficiais). Reserva: o informe mensal (número de cotas multiplica ou divide e o valor patrimonial
    faz o inverso pelo mesmo fator), para evento que a B3 ainda não mostra. O histórico fica na base de cotas atual,
    como faz a B3; o valor anunciado fica em valor_original."""
    m = d.get("mensal") or []
    eventos = [{"data_com": e["data_com"], "fator": e["fator"], "fonte": "B3", "evento": e["evento"]} for e in (eventos_b3 or [])]
    for a, b in zip(m, m[1:]):
        if not (a.get("cotas") and b.get("cotas") and a.get("vp_cota") and b.get("vp_cota")):
            continue
        rc, rv = b["cotas"] / a["cotas"], a["vp_cota"] / b["vp_cota"]
        if rc >= 1.8:
            f = float(round(rc))
        elif rc <= 0.55:
            f = 1 / round(1 / rc)
        else:
            continue
        if abs(rc / f - 1) < 0.05 and abs(rv / f - 1) < 0.15:
            ja = any(abs((dt.date.fromisoformat(e["data_com"]) - dt.date.fromisoformat(b["ref"] + "-15")).days) <= 75 for e in eventos)
            if not ja:
                eventos.append({"data_com": None, "ref": b["ref"], "fator": f, "fonte": "Informe Mensal da CVM", "evento": "Desdobramento" if f > 1 else "Grupamento"})
    provs = [p for p in d.get("proventos", []) if p.get("data_base") and not str(p.get("fonte", "")).startswith("Yahoo")]
    for e in eventos:
        f = e["fator"]
        mes_ex = (e["data_com"] or "")[:7] if e["data_com"] else e["ref"]
        if e["data_com"]:
            # mês em que a cota já é a nova: o do pregão seguinte à data com
            ex = dt.date.fromisoformat(e["data_com"]) + dt.timedelta(days=1)
            mes_ex = ex.strftime("%Y-%m")
        for x in m:
            if x["ref"] < mes_ex:
                x["vp_cota"] = x["vp_cota"] / f if x.get("vp_cota") else x.get("vp_cota")
                x["cotas"] = x["cotas"] * f if x.get("cotas") else x.get("cotas")
        if e["data_com"]:
            antes = [p for p in provs if p["data_base"] <= e["data_com"]]
        else:   # sem data oficial: pelo mês e, no próprio mês, pelo tamanho do valor
            depois = [p["valor"] for p in provs if p["data_base"][:7] > e["ref"] and p["tipo"] == "Rendimento"][:3]
            ref_pos = sorted(depois)[len(depois) // 2] if depois else None
            lim = (lambda v: v > ref_pos * f / 2) if f > 1 else (lambda v: v < ref_pos * f * 2)
            antes = [p for p in provs if p["data_base"][:7] < e["ref"] or (p["data_base"][:7] == e["ref"] and ref_pos and lim(p["valor"]))]
        for p in antes:
            p.setdefault("valor_original", p["valor"])
            p["valor"] = p["valor"] / f
    if eventos:
        d["desdobramentos"] = [{"data_com": e["data_com"], "mes": e.get("ref"), "fator": e["fator"], "evento": e["evento"], "fonte": e["fonte"]} for e in eventos]
        i, ms = d["indicadores"], m
        vp = i.get("vp_cota")
        i["cagr_vp_3a"] = (vp / ms[-37]["vp_cota"]) ** (1 / 3) - 1 if len(ms) >= 37 and ms[-37].get("vp_cota") and vp else None
        r12 = [p for p in d["proventos"] if p["tipo"] == "Rendimento" and p.get("data_base") and p["data_base"] >= (HOJE - dt.timedelta(days=365)).isoformat()]
        if r12:
            i["rend_12m"] = sum(p["valor"] for p in r12)
            i["rend_medio_12m"] = i["rend_12m"] / len(r12)
            i["dy_12m"] = i["rend_12m"] / i["preco"] if i.get("preco") else None
        ult = next((p for p in reversed(d["proventos"]) if p["tipo"] == "Rendimento"), None)
        if ult:
            i["ultimo_rendimento"] = ult["valor"]
    return [(e["data_com"] or e["ref"], e["fator"], e["fonte"]) for e in eventos]


def setor_padrao(d: dict) -> str:
    """Setor para fundos novos sem classificação no fiis.json, pela carteira informada à CVM."""
    if d.get("tipo") == "infra":
        return "FI-Infra"
    if d.get("tipo") == "fiagro":
        return "Fiagro"
    g = (d.get("sobre") or {}).get("grupos") or {}
    if g.get("papel", 0) >= 0.6:
        return "Recebíveis (CRI)"
    if g.get("fiis", 0) >= 0.5:
        return "Fundos de fundos"
    if g.get("tijolo", 0) >= 0.6:
        return "Tijolo multissetorial"
    return "Híbridos"


def cagr_rendimentos(proventos: list[dict], anos: int = 3) -> float | None:
    """Crescimento anual dos rendimentos: soma dos últimos 12 meses contra a soma de 12 meses de 3 anos antes."""
    r = [p for p in proventos if p.get("tipo") == "Rendimento" and p.get("data_base") and p.get("valor")]
    fim = HOJE
    soma = lambda a, b: sum(p["valor"] for p in r if a.isoformat() < p["data_base"] <= b.isoformat())  # noqa: E731
    agora = soma(fim - dt.timedelta(days=365), fim)
    antes = soma(fim - dt.timedelta(days=365 * (anos + 1)), fim - dt.timedelta(days=365 * anos))
    primeiro = min((p["data_base"] for p in r), default=None)
    if not agora or not antes or not primeiro or primeiro > (fim - dt.timedelta(days=365 * (anos + 1) - 45)).isoformat():
        return None
    return (agora / antes) ** (1 / anos) - 1


def main():
    lista = json.loads((DATA / "fiis.json").read_text(encoding="utf-8"))
    anos = list(range(HOJE.year - 3, HOJE.year + 1))
    cvm = carregar_cvm(anos)
    geral = cvm["mensal"]["geral"].sort_values("Data_Referencia").drop_duplicates("_cnpj", keep="last") if not cvm["mensal"]["geral"].empty else pd.DataFrame()
    pxs = S.precos_yf([f["ticker"] + ".SA" for f in lista], anos=11)
    SAIDA.mkdir(parents=True, exist_ok=True)
    indice = []
    import fi_infra  # FI-Infra: fontes próprias (informe diário e carteira da CVM, proventos da B3)
    infra = {d["ticker"]: d for d in fi_infra.montar_todos(lista, pxs)}
    for f in lista:
        t = f["ticker"]
        try:
            d = infra[t] if f.get("tipo") == "infra" else montar(f, cvm, geral, pxs.get(t + ".SA"))
        except KeyError:
            continue
        except Exception as e:
            print(f"{t}: {e}")
            continue
        # objetivo oficial do fundo (relatório gerencial ou regulamento), cadastrado no fiis.json
        sb = d.setdefault("sobre", {})
        if f.get("objetivo"):
            sb["objetivo"] = f["objetivo"]
        else:
            print(f"{t}: ATENÇÃO, sem objetivo oficial cadastrado em data/fiis.json (ler o relatório gerencial ou o regulamento)")
        if f.get("perfil") and sb.get("perfil"):
            sb["texto"] = (sb.get("texto") or "").replace(f"Fundo {sb['perfil']} ", f"FII de {f['perfil']} ", 1)
            sb["perfil"] = f["perfil"]
        if f.get("rotulo_outros"):
            sb["texto"] = (sb.get("texto") or "").replace("em ações e outros ativos", f"em {f['rotulo_outros']}")
        ev = ajustar_desdobramentos(d, eventos_fundo_b3(t, f.get("tipo")))
        if ev:
            print(f"{t}: desdobramentos {ev}")
        d = limpo(d)
        (SAIDA / f"{t}.json").write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
        i = d["indicadores"]
        hoje = HOJE.isoformat()
        prox = next((p for p in d["proventos"] if p.get("pagamento") and p["pagamento"] > hoje), None)
        docs = [{k: x.get(k) for k in ("entrega", "categoria", "tipo", "link")} for x in d["documentos"] if "informes periódicos" not in (x.get("categoria") or "").lower()][:4]
        indice.append({"ticker": t, "tipo": d.get("tipo") or "fii", "nome": d["cadastro"]["nome_curto"] or d["cadastro"]["nome"], "segmento": d["cadastro"]["segmento"],
                       "setor": f.get("setor") or setor_padrao(d), "cagr_rend_3a": cagr_rendimentos(d["proventos"]),
                       "prox": {k: prox.get(k) for k in ("valor", "data_base", "pagamento", "referencia")} if prox else None, "docs": docs,
                       **{k: i.get(k) for k in ("preco", "p_vp", "dy_12m", "rend_12m", "ultimo_rendimento", "pl", "cotistas", "liquidez_21", "var_12m", "cagr_vp_3a", "vp_cota")}})
        c = d["conferencia_proventos"] or {}
        print(f"{t}: PL {i.get('pl')}, P/VP {i.get('p_vp')}, DY 12m {i.get('dy_12m')}, {len(d['proventos'])} rendimentos; conferência Yahoo: {c.get('meses_comparados')} meses, divergentes {c.get('divergentes')}")
    (SAIDA / "_index.json").write_text(json.dumps(limpo({"atualizado_em": dt.datetime.now().isoformat(timespec="seconds"), "fiis": indice}), ensure_ascii=False, allow_nan=False), encoding="utf-8")


if __name__ == "__main__":
    main()
