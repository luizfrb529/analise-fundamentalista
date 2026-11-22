"""Revisão automática do quadro "Sobre" das empresas (data/perfis/<TICKER>.json).

Roda no GitHub Actions (workflow perfis.yml). Para cada empresa que divulgou um resultado mais novo do que o
último revisado no perfil (agenda.ultima em data/fundamentals.json), pede à IA da Anthropic que refaça a pesquisa
com busca e leitura na web, seguindo pipeline/brief_perfil.md, valida o JSON (pipeline/perfis.py) e grava.
Perfis que não passam na validação não são publicados: o anterior continua no ar.

Sem a variável ANTHROPIC_API_KEY o script não faz nada (encerra com sucesso).
Uso: python pipeline/revisar_perfis.py [--max N] [--tickers PETR4,VALE3] [--simular]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import perfis as P  # noqa: E402

RAIZ = Path(__file__).resolve().parents[1]
DATA = RAIZ / "data"
PASTA = DATA / "perfis"
MODELO = "claude-opus-5-5"
HOJE = dt.date.today().isoformat()
REVISAO_MAXIMA_DIAS = 120          # mesmo sem resultado novo, revisa perfis mais velhos que isso


def ler(caminho: Path, padrao=None):
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except Exception:
        return padrao


def pendentes(universo: list, fundamentals: dict) -> list[tuple[str, str]]:
    """[(ticker, motivo)] em ordem de prioridade: resultado novo primeiro, depois perfis mais antigos."""
    novos, velhos = [], []
    for a in universo:
        t = a["ticker"]
        perfil = ler(PASTA / f"{t}.json", {}) or {}
        ult = ((fundamentals.get(t) or {}).get("agenda") or {}).get("ultima") or {}
        rotulo = ult.get("rotulo")
        revisado = perfil.get("revisado_em") or "2000-01-01"
        if not perfil:
            novos.append((t, "sem perfil"))
        elif rotulo and perfil.get("ultimo_resultado") and rotulo != perfil.get("ultimo_resultado"):
            novos.append((t, f"resultado novo {rotulo} (perfil cobre {perfil.get('ultimo_resultado')})"))
        elif rotulo and ult.get("entrega") and ult["entrega"] > revisado:
            novos.append((t, f"resultado {rotulo} entregue em {ult['entrega']}, depois da revisão de {revisado}"))
        elif not perfil.get("destaques_resultado"):
            velhos.insert(0, (t, "sem os destaques do último resultado"))
        elif (dt.date.today() - dt.date.fromisoformat(revisado[:10])).days > REVISAO_MAXIMA_DIAS:
            velhos.append((t, f"perfil revisado há mais de {REVISAO_MAXIMA_DIAS} dias"))
    return novos + velhos


def extrair_json(texto: str):
    texto = texto.strip()
    texto = re.sub(r"^```(?:json)?\s*|\s*```$", "", texto)
    ini, fim = texto.find("{"), texto.rfind("}")
    if ini < 0 or fim <= ini:
        return None
    try:
        return json.loads(texto[ini:fim + 1])
    except json.JSONDecodeError:
        return None


def pedir(client, mensagens: list) -> str:
    """Conversa com a IA até ela terminar, retomando quando as ferramentas de servidor pausam o turno."""
    ferramentas = [
        {"type": "web_search_20260209", "name": "web_search", "max_uses": 15},
        {"type": "web_fetch_20260209", "name": "web_fetch", "max_uses": 12},
    ]
    for _ in range(8):
        with client.beta.messages.stream(
            model=MODELO,
            max_tokens=64000,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "high"},
            tools=ferramentas,
            messages=mensagens,
        ) as stream:
            resposta = stream.get_final_message()
        if resposta.stop_reason == "pause_turn":           # ferramenta de servidor atingiu o limite de iterações: continua
            mensagens.append({"role": "assistant", "content": resposta.content})
            continue
        if resposta.stop_reason == "refusal":
            raise RuntimeError(f"pedido recusado: {getattr(resposta.stop_details, 'category', None)}")
        mensagens.append({"role": "assistant", "content": resposta.content})
        return "".join(b.text for b in resposta.content if b.type == "text")
    raise RuntimeError("a pesquisa não terminou depois de 8 retomadas")


def revisar(client, brief: str, ativo: dict, fundamentals: dict) -> dict:
    t = ativo["ticker"]
    atual = ler(PASTA / f"{t}.json", {}) or {}
    ult = ((fundamentals.get(t) or {}).get("agenda") or {}).get("ultima") or {}
    contexto = {
        "ticker": t, "nome": ativo["nome"], "tipo": ativo["tipo"], "setor": f"{ativo['setor_macro']} / {ativo['setor_micro']}",
        "ticker_exterior": ativo.get("ticker_exterior"), "hoje": HOJE,
        "ultimo_resultado_divulgado": ult.get("rotulo"), "documento": ult.get("doc"), "entregue_em": ult.get("entrega"), "link_documento": ult.get("link"),
        "notas_atuais_de_sensibilidade": {k: (v.get("nota") if isinstance(v, dict) else v)
                                          for k, v in (atual.get("sensibilidade") or ativo.get("sensibilidade") or {}).items()},
    }
    pedido = (f"{brief}\n\n## Empresa\n{json.dumps(contexto, ensure_ascii=False, indent=1)}\n\n"
              f"## Perfil atual (revise e atualize; mantenha o que continua correto)\n{json.dumps(P.limpar(atual), ensure_ascii=False, indent=1) if atual else '(sem perfil)'}")
    mensagens = [{"role": "user", "content": pedido}]
    for tentativa in range(2):
        j = extrair_json(pedir(client, mensagens))
        erros = P.validar(j, t, ativo["tipo"] == "STOCK_US") if j is not None else ["a resposta não trouxe um JSON válido"]
        if not erros:
            j["revisado_em"] = HOJE
            j["ultimo_resultado"] = ult.get("rotulo")
            j["revisao"] = "automática"
            return j
        if tentativa == 0:
            mensagens.append({"role": "user", "content": "O JSON não passou na validação: " + "; ".join(erros)
                              + ". Corrija só esses pontos e responda de novo apenas com o JSON completo."})
    raise RuntimeError("; ".join(erros))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=int(os.environ.get("MAX_PERFIS", "6")))
    ap.add_argument("--tickers", default="")
    ap.add_argument("--simular", action="store_true", help="só lista o que seria revisado")
    args = ap.parse_args()

    universo = ler(DATA / "universe.json", [])
    fundamentals = ler(DATA / "fundamentals.json", {})
    por_ticker = {a["ticker"]: a for a in universo}
    if args.tickers:
        fila = [(t.strip().upper(), "pedido manual") for t in args.tickers.split(",") if t.strip().upper() in por_ticker]
    else:
        fila = pendentes(universo, fundamentals)
    print(f"{len(fila)} perfis pendentes de revisão")
    for t, motivo in fila[:args.max]:
        print(f"  {t}: {motivo}")
    if args.simular:
        return
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY não configurada: revisão automática desligada")
        return

    import anthropic
    client = anthropic.Anthropic()
    briefs = {k: (Path(__file__).resolve().parent / f"brief_perfil{k}.md").read_text(encoding="utf-8") for k in ("", "_stock")}
    feitos, falhas = [], []
    for t, motivo in fila[:args.max]:
        try:
            perfil = revisar(client, briefs["_stock" if por_ticker[t]["tipo"] == "STOCK_US" else ""], por_ticker[t], fundamentals)
            (PASTA / f"{t}.json").write_text(json.dumps(P.limpar(perfil), ensure_ascii=False, indent=1), encoding="utf-8")
            feitos.append(t)
            print(f"{t}: revisado ({motivo})")
        except anthropic.RateLimitError as e:
            print(f"{t}: limite de uso da API, para por hoje ({e})")
            break
        except anthropic.APIStatusError as e:
            falhas.append(t)
            print(f"{t}: erro da API {e.status_code}: {e.message}")
        except anthropic.APIConnectionError as e:
            falhas.append(t)
            print(f"{t}: falha de conexão: {e}")
        except Exception as e:                       # perfil reprovado: mantém o anterior no ar
            falhas.append(t)
            print(f"{t}: perfil não publicado ({e})")
    print(f"revisados: {feitos or 'nenhum'}; não publicados: {falhas or 'nenhum'}")


if __name__ == "__main__":
    main()
