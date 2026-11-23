"""
Leitura das demonstrações da CVM (DFP anual e ITR trimestral) e montagem de:
  - séries anuais (exercícios fechados em 31/12)
  - LTM (últimos 12 meses) e LTM de um ano antes
Todas as contas são localizadas pela descrição (sem acento, minúscula) e pelo nível do código,
porque o plano de contas varia entre empresas (layout geral, banco e seguradora).
"""
from __future__ import annotations

import re
import unicodedata
from collections import defaultdict

import pandas as pd

TABELAS = ["DRE", "BPA", "BPP", "DFC_MI", "DFC_MD"]


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.lower()).strip()


def preparar(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return pd.DataFrame()
    d = df.copy()
    d["cd"] = d["CD_CVM"].str.lstrip("0")
    esc = d["ESCALA_MOEDA"].map(lambda x: 1000.0 if str(x).upper().startswith("MIL") else 1.0)
    d["v"] = pd.to_numeric(d["VL_CONTA"], errors="coerce") * esc
    d["ds"] = d["DS_CONTA"].map(norm)
    d["ordem"] = d["ORDEM_EXERC"].map(lambda x: "U" if norm(x).startswith("ult") else "P")
    d["nivel"] = d["CD_CONTA"].str.count(r"\.") + 1
    d["VERSAO"] = pd.to_numeric(d["VERSAO"], errors="coerce")
    vmax = d.groupby(["cd", "DT_REFER"])["VERSAO"].transform("max")
    d = d[d["VERSAO"] == vmax]
    if "DT_INI_EXERC" not in d.columns:
        d["DT_INI_EXERC"] = None
    return d


class Contas:
    """Contas de uma demonstração para um período: {codigo: (descricao_normalizada, valor)}."""

    def __init__(self, rows: pd.DataFrame | None):
        self.c = {}
        if rows is not None:
            for cd, ds, v in zip(rows["CD_CONTA"], rows["ds"], rows["v"]):
                self.c[cd] = (ds, v)

    def __bool__(self):
        return bool(self.c)

    def cod(self, codigo):
        x = self.c.get(codigo)
        return x[1] if x else None

    def desc(self, codigo):
        x = self.c.get(codigo)
        return x[0] if x else ""

    def achar(self, padrao, prefixo="", nivel=None, excluir=None):
        """Primeira conta (ordem de código) cuja descrição casa com o padrão."""
        for cd in sorted(self.c, key=_ordem):
            ds, v = self.c[cd]
            if prefixo and not (cd == prefixo or cd.startswith(prefixo + ".")):
                continue
            if nivel and cd.count(".") + 1 != nivel:
                continue
            if re.search(padrao, ds) and not (excluir and re.search(excluir, ds)):
                return cd, v
        return None, None

    def val(self, *a, **k):
        return self.achar(*a, **k)[1]

    def somar(self, padrao, prefixo="", nivel_min=1, excluir=None, sinal=None):
        """Soma contas que casam, sem contar filho de conta já contada."""
        tot, usados, achou = 0.0, [], False
        for cd in sorted(self.c, key=_ordem):
            ds, v = self.c[cd]
            if prefixo and not cd.startswith(prefixo + "."):
                continue
            if cd.count(".") + 1 < nivel_min or any(cd.startswith(u + ".") for u in usados):
                continue
            if re.search(padrao, ds) and not (excluir and re.search(excluir, ds)):
                if v is None or pd.isna(v):
                    continue
                if sinal == "neg" and v > 0:
                    continue
                tot += v
                usados.append(cd)
                achou = True
        return tot if achou else None

    def filhos_somar(self, codigo, padrao):
        tot = 0.0
        for cd, (ds, v) in self.c.items():
            if cd.startswith(codigo + ".") and re.search(padrao, ds) and pd.notna(v):
                tot += v
        return tot


def _ordem(cd):
    return [int(p) for p in cd.split(".")]


# ----------------------------------------------------------- extração
def fluxos(dre: Contas, dfc: Contas, modelo: str) -> dict:
    f = {}
    if dre:
        f["lucro_liq"] = dre.val(r"socios da (empresa )?controladora|acionistas controladores")
        f["lucro_consol"] = dre.val(r"(lucro|prejuizo|resultado).*consolidado do periodo", nivel=2)
        if f["lucro_consol"] is None:   # demonstração individual: "Lucro/Prejuízo do Período"
            f["lucro_consol"] = dre.val(r"^(lucro|prejuizo).*(do periodo|do exercicio)$", nivel=2)
        # sem minoritários, várias empresas deixam a linha "atribuído à controladora" zerada
        if f["lucro_liq"] in (None, 0) and f["lucro_consol"]:
            f["lucro_liq"] = f["lucro_consol"]
        f["lair"] = dre.val(r"antes dos tributos sobre o lucro", nivel=2)
        f["ir"] = dre.val(r"imposto de renda e contribuicao social", nivel=2)
        if modelo == "BANCO":
            f["rec_interm"] = dre.cod("3.01")
            f["receita"] = f["rec_interm"]
            f["juros_rec"] = dre.val(r"receitas? de juros", prefixo="3.01")
            f["juros_desp"] = dre.val(r"despesas? de juros", prefixo="3.02")
            f["pdd"] = dre.somar(r"(perda|provisao).*(credito)", nivel_min=3, excluir=r"demais ativos")
            f["rec_servicos_fora"] = dre.somar(r"prestacao de servicos", prefixo="3.04")
            f["rec_servicos"] = dre.somar(r"prestacao de servicos", nivel_min=3)
            f["desp_pessoal"] = dre.somar(r"pessoal", prefixo="3.04", nivel_min=3)
            f["desp_adm"] = dre.somar(r"administrativas", prefixo="3.04", nivel_min=3, excluir=r"pessoal")
        elif modelo == "SEGURADORA" and not (dre.cod("3.01") or 0):
            # holding de seguros (BB Seguridade): receita = comissões + equivalência patrimonial
            com = dre.val(r"receitas? de comiss") or 0
            eq = dre.val(r"resultado de equivalencia patrimonial", nivel=2) or 0
            f["receita"] = com + eq if (com or eq) else None
            f["ebit"] = dre.val(r"antes do resultado financeiro", nivel=2)
            f["res_fin"] = dre.val(r"^resultado financeiro$", nivel=2)
            f["rec_fin"] = dre.val(r"^receitas financeiras$", nivel=3)
            f["desp_fin"] = dre.val(r"^despesas financeiras$", nivel=3)
        else:
            f["receita"] = dre.cod("3.01")
            f["custo"] = dre.cod("3.02")
            f["lucro_bruto"] = dre.cod("3.03")
            f["ebit"] = dre.val(r"antes do resultado financeiro", nivel=2)
            f["res_fin"] = dre.val(r"^resultado financeiro", nivel=2)
            f["rec_fin"] = dre.val(r"^receitas financeiras", nivel=3)
            f["desp_fin"] = dre.val(r"^despesas financeiras", nivel=3)
    if dfc and modelo not in ("BANCO",):
        f["fco"] = dfc.cod("6.01")
        f["da"] = dfc.somar(r"deprecia|amortiza|exaust", prefixo="6.01", nivel_min=3,
                            excluir=r"custo|captac|emprestimo|juros|debenture|agio|desagio|premio|ajuste a valor")
        f["capex"] = dfc.somar(r"imobilizado|intangivel|ativo fixo", prefixo="6.02", nivel_min=3,
                               excluir=r"venda|alienac|recebimento|baixa", sinal="neg")
        f["div_pagos"] = dfc.somar(r"dividend|juros sobre (o )?capital", prefixo="6.03", nivel_min=3,
                                   excluir=r"recebid", sinal="neg")
        f["recompras"] = dfc.somar(r"recompra|acoes em tesouraria|aquisicao de acoes|acoes proprias", prefixo="6.03",
                                   nivel_min=3, sinal="neg")
    return f


def saldos(bpa: Contas, bpp: Contas, modelo: str) -> dict:
    s = {}
    if not bpa or not bpp:
        return s
    s["ativo"] = bpa.cod("1")
    pl_tot_cd, pl_tot = bpp.achar(r"patrimonio liquido", nivel=2)
    mino = None
    if pl_tot_cd:
        mino = bpp.val(r"nao controladores", prefixo=pl_tot_cd)
    s["minoritarios"] = mino or 0.0
    s["pl"] = pl_tot - (mino or 0.0) if pl_tot is not None else None
    if modelo == "BANCO":
        s["caixa"] = bpa.val(r"caixa e equivalentes", nivel=2)
        s["carteira"] = bpa.somar(r"^operacoes de credito", nivel_min=3)
        return s
    s["cripto"] = bpa.somar(r"cripto|bitcoin|ativos? digita", nivel_min=3)
    s["intangivel"] = bpa.val(r"^intangive", prefixo="1.02", nivel=3)
    s["ativo_circ"] = bpa.val(r"ativo circulante", nivel=2)
    cx = bpa.val(r"caixa e equivalentes", prefixo="1.01") or 0.0
    apl = bpa.val(r"aplicacoes financeiras", prefixo="1.01", nivel=3) or 0.0
    s["caixa"] = cx + apl
    s["receber"] = bpa.val(r"contas a receber|clientes", prefixo="1.01", nivel=3)
    s["estoques"] = bpa.val(r"estoques", prefixo="1.01", nivel=3)
    s["passivo_circ"] = bpp.val(r"passivo circulante", nivel=2)
    s["passivo_nc"] = bpp.val(r"passivo nao circulante", nivel=2)
    s["fornecedores"] = bpp.val(r"fornecedores", prefixo="2.01", nivel=3)
    for chave, pref in (("divida_cp", "2.01"), ("divida_lp", "2.02")):
        cd, v = bpp.achar(r"emprestimos e financiamentos", prefixo=pref, nivel=3)
        if cd:
            v = (v or 0.0) - bpp.filhos_somar(cd, r"arrendamento")
        if not v:
            # há empresas (ex.: Allos) que lançam a dívida dentro de "Outras obrigações"
            extra = bpp.somar(r"emprestimo|financiamento|debenture", prefixo=pref, nivel_min=4, excluir=r"arrendamento|receber|derivativ")
            if extra:
                v = extra
        s[chave] = v
    return s


# ----------------------------------------------------------- montagem dos períodos
class BaseCVM:
    def __init__(self, dfp: dict[int, dict], itr: dict[int, dict]):
        """dfp/itr: {ano: {nome_tabela: DataFrame}} como devolvido por sources.cvm_arquivo."""
        self.t = defaultdict(list)
        for origem, por_ano in (("DFP", dfp), ("ITR", itr)):
            for ano, tabs in por_ano.items():
                for tab in TABELAS:
                    for tipo in ("con", "ind"):
                        nome = f"{origem.lower()}_cia_aberta_{tab}_{tipo}"
                        if nome in tabs and not tabs[nome].empty:
                            d = preparar(tabs[nome])
                            d["origem"] = origem
                            d["tipo"] = tipo
                            self.t[tab].append(d)
        self.t = {k: pd.concat(v, ignore_index=True) for k, v in self.t.items()}
        # empresas sem demonstração consolidada (ex.: Sanepar) usam a individual
        dre = self.t.get("DRE")
        com_con = set(dre[dre.tipo == "con"].cd) if dre is not None else set()
        self.tipo_de = lambda cd: "con" if cd in com_con else "ind"

    def _rows(self, tab, cd, origem, dt_refer, ordem, dt_ini="acumulado"):
        """Linhas de um período. Para contas de fluxo usa o acumulado do exercício (data inicial mais antiga),
        o que funciona para qualquer data de fechamento do ano fiscal (dezembro, março, junho...)."""
        d = self.t.get(tab)
        if d is None:
            return None
        x = d[(d.cd == cd) & (d.tipo == self.tipo_de(cd)) & (d.origem == origem) & (d.DT_REFER == dt_refer) & (d.ordem == ordem)]
        if tab in ("DRE", "DFC_MI", "DFC_MD") and len(x):
            ini = x.DT_INI_EXERC.dropna()
            if len(ini):
                x = x[x.DT_INI_EXERC == ini.min()]
        return x if len(x) else None

    def _dfc(self, cd, origem, dt_refer, ordem):
        r = self._rows("DFC_MI", cd, origem, dt_refer, ordem)
        if r is None:
            r = self._rows("DFC_MD", cd, origem, dt_refer, ordem)
        return Contas(r)

    def periodo(self, cd, origem, dt_refer, ordem, modelo, com_saldo=True):
        f = fluxos(Contas(self._rows("DRE", cd, origem, dt_refer, ordem)), self._dfc(cd, origem, dt_refer, ordem), modelo)
        if com_saldo:
            f.update(saldos(Contas(self._rows("BPA", cd, origem, dt_refer, ordem)),
                            Contas(self._rows("BPP", cd, origem, dt_refer, ordem)), modelo))
        return f

    def datas(self, tab, cd, origem):
        d = self.t.get(tab)
        if d is None:
            return []
        return sorted(d[(d.cd == cd) & (d.tipo == self.tipo_de(cd)) & (d.origem == origem)].DT_REFER.unique())

    def anuais(self, cd, modelo) -> dict[int, dict]:
        """Exercícios fechados, indexados pelo ano da data de encerramento; '_fim' guarda a data exata."""
        out = {}
        for dref in self.datas("DRE", cd, "DFP"):
            ano = int(dref[:4])
            atual = self.periodo(cd, "DFP", dref, "U", modelo)
            atual["_fim"] = dref
            out[ano] = atual
            if ano - 1 not in out:
                ant = self.periodo(cd, "DFP", dref, "P", modelo)
                ant["_fim"] = f"{ano - 1}{dref[4:]}"
                if any(v is not None for k, v in ant.items() if not k.startswith("_")):
                    out[ano - 1] = ant
        return {k: v for k, v in sorted(out.items()) if v.get("lucro_liq") is not None}

    def acumulados(self, cd, modelo, desde: str) -> dict:
        """{data_fim: (início do exercício, fluxos acumulados)} de ITR e DFP a partir de 'desde' (AAAA-MM-DD)."""
        out = {}
        for origem in ("ITR", "DFP"):
            for dref in self.datas("DRE", cd, origem):
                if dref < desde:
                    continue
                rows = self._rows("DRE", cd, origem, dref, "U")
                if rows is None:
                    continue
                ini = rows.DT_INI_EXERC.dropna()
                if not len(ini):
                    continue
                out[dref] = (ini.min(), self.periodo(cd, origem, dref, "U", modelo, com_saldo=False))
        return out

    @staticmethod
    def _base(anuais, antes_de):
        cand = [a for a in anuais.values() if a.get("_fim") and a["_fim"] < antes_de]
        return max(cand, key=lambda a: a["_fim"]) if cand else {}

    def ltm(self, cd, modelo, anuais: dict[int, dict]):
        """Devolve (data_ref, ltm, ltm_ano_anterior, saldo_ano_anterior)."""
        itr = self.datas("DRE", cd, "ITR")
        fim_anual = max((a["_fim"] for a in anuais.values()), default=None)
        ult_itr = itr[-1] if itr else None
        if fim_anual and (not ult_itr or ult_itr <= fim_anual):
            ult = max(anuais.values(), key=lambda a: a["_fim"])
            ant = self._base(anuais, fim_anual)
            return fim_anual, dict(ult), ant or None, ant or None
        if not ult_itr:
            return None, {}, None, None
        atual = self.periodo(cd, "ITR", ult_itr, "U", modelo)
        ytd_ant = self.periodo(cd, "ITR", ult_itr, "P", modelo, com_saldo=False)
        ltm = combinar(self._base(anuais, ult_itr), atual, ytd_ant)
        # um ano antes: ITR do ano anterior na mesma data
        dref_ant = f"{int(ult_itr[:4]) - 1}{ult_itr[4:]}"
        ltm_ant, saldo_ant = None, None
        if dref_ant in itr:
            atual_ant = self.periodo(cd, "ITR", dref_ant, "U", modelo)
            ytd_ant2 = self.periodo(cd, "ITR", dref_ant, "P", modelo, com_saldo=False)
            ltm_ant = combinar(self._base(anuais, dref_ant), atual_ant, ytd_ant2)
            saldo_ant = atual_ant
        return ult_itr, ltm, ltm_ant, saldo_ant


FLUXOS = {"receita", "custo", "lucro_bruto", "ebit", "res_fin", "rec_fin", "desp_fin", "lair", "ir", "lucro_liq",
          "lucro_consol", "rec_interm", "juros_rec", "juros_desp", "pdd", "rec_servicos", "rec_servicos_fora",
          "desp_pessoal", "desp_adm", "fco", "da", "capex", "div_pagos", "recompras"}


def combinar(anual_ant: dict, ytd: dict, ytd_ant: dict) -> dict:
    """LTM: fluxos = anual anterior + acumulado atual - acumulado do ano anterior; saldos = os do acumulado atual."""
    out = {}
    for k, v in ytd.items():
        if k in FLUXOS:
            a, b = anual_ant.get(k), ytd_ant.get(k)
            if v is not None and a is not None and b is not None:
                out[k] = a + v - b
            else:
                out[k] = None
        else:
            out[k] = v
    return out
