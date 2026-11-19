"""Regras de validação dos perfis do quadro "Sobre" (data/perfis/<TICKER>.json).

Usadas pelo robô de revisão automática (revisar_perfis.py) e por quem integrar perfis à mão:
um perfil só é publicado se passar em todas.
"""
from __future__ import annotations

import re

CENARIOS = {"selic_caindo", "dolar_subindo", "commodities_subindo", "pib_acelerando", "inflacao_subindo", "risco_fiscal_subindo"}
TRACOS = "[" + chr(0x2014) + chr(0x2013) + "]"      # travessão e meia-risca, proibidos no texto do site
PROIBIDOS = re.compile(TRACOS + r"|\b(compre|recomenda[cç][aã]o de compra|pre[cç]o-alvo|boa oportunidade|vale a pena|bazin|graham)\b", re.I)
NIVEIS = {"nenhuma", "baixa", "média", "media", "alta", None}


def validar(j: dict, ticker: str) -> list[str]:
    """Lista de problemas; vazia = perfil pode ser publicado."""
    erros = []
    if not isinstance(j, dict):
        return ["não é um objeto JSON"]
    if j.get("ticker") != ticker:
        erros.append(f"ticker {j.get('ticker')!r} diferente de {ticker}")
    texto = " ".join(str(v) for k, v in j.items() if k not in ("fontes", "pendencias"))
    achados = {m.group(0) for m in PROIBIDOS.finditer(texto)}
    if achados:
        erros.append(f"termos proibidos: {sorted(achados)}")
    resumo = j.get("resumo") or ""
    if not resumo or len(resumo) > 260:
        erros.append(f"resumo com {len(resumo)} caracteres (máximo 260)")
    for campo in ("modelo", "momento"):
        if not (j.get(campo) or "").strip():
            erros.append(f"campo {campo} vazio")
    fontes = [f for f in j.get("fontes") or [] if isinstance(f, dict) and str(f.get("url", "")).startswith("http")]
    if len(fontes) < 3:
        erros.append(f"{len(fontes)} fontes com link (mínimo 3)")
    s = j.get("sensibilidade") or {}
    if set(s) != CENARIOS or any(not isinstance(v, dict) or v.get("nota") not in (-2, -1, 0, 1, 2) for v in s.values()):
        erros.append("sensibilidade incompleta ou com nota fora de -2 a 2")
    segs = [x for x in j.get("segmentos") or [] if isinstance(x, dict) and isinstance(x.get("peso_receita"), (int, float))]
    if segs and not 0.9 <= sum(x["peso_receita"] for x in segs) <= 1.1:
        erros.append(f"pesos dos segmentos somam {sum(x['peso_receita'] for x in segs):.2f}")
    dr = j.get("destaques_resultado")
    if dr is not None:
        if not isinstance(dr, dict) or not dr.get("trimestre"):
            erros.append("destaques_resultado sem trimestre")
        else:
            for k, (mi, ma) in {"positivos": (1, 5), "negativos": (1, 5), "atencao": (1, 4)}.items():
                itens = dr.get(k)
                if not isinstance(itens, list) or not mi <= len(itens) <= ma or not all(isinstance(x, str) and x.strip() for x in itens):
                    erros.append(f"destaques_resultado.{k} precisa de {mi} a {ma} itens de texto")
    moeda = j.get("moeda") or {}
    for k in ("receita_em_dolar", "divida_em_dolar"):
        if moeda.get(k) not in NIVEIS:
            erros.append(f"moeda.{k} inválido: {moeda.get(k)!r}")
    return erros


def limpar(j: dict) -> dict:
    """Remove o que não vai para o site."""
    j = dict(j)
    j.pop("pendencias", None)
    return j
