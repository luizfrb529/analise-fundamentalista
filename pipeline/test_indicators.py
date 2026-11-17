"""Testes das fórmulas. Rodar: .venv\\Scripts\\python -m pytest pipeline -q"""
import math
import pytest
import indicators as I

ap = pytest.approx


def test_div_e_soma():
    assert I.div(10, 2) == 5
    assert I.div(10, 0) is None
    assert I.div(None, 2) is None
    assert I.pos_div(10, -2) is None
    assert I.soma(1, None, 2) == 3
    assert I.soma(None, None) is None


def test_cagr():
    assert I.cagr(100, 200, 5) == ap(2 ** 0.2 - 1)
    assert I.cagr(-1, 200, 5) is None
    assert I.cagr(100, 0, 5) is None


def test_percentil():
    assert I.percentil(3, [1, 2, 3, 4, 5]) == ap(50)
    assert I.percentil(5, [1, 2, 3, 4, 5]) == ap(90)
    assert I.percentil(None, [1]) is None


def test_ltm():
    # exercício 2025 = 100, 9M26 = 90, 9M25 = 70 -> LTM 120
    assert I.ltm(100, 90, 70) == 120
    assert I.ltm(100, None, 70) is None


def test_porte():
    f = {"large": 50e9, "mid": 10e9, "small": 2e9}
    assert I.porte(60e9, f) == "Large cap"
    assert I.porte(20e9, f) == "Mid cap"
    assert I.porte(3e9, f) == "Small cap"
    assert I.porte(1e9, f) == "Micro cap"


def test_consistencias():
    assert I.consistencia_crescimento([1, 2, 1, 3, 4]) == 3
    assert I.anos_seguidos_positivos([0, 1, 1, 1]) == 3
    assert I.anos_com_corte([1, 1, 0.5, 0.6]) == 1
    assert I.queda_seguida([5, 4, 3, 2]) is True
    assert I.queda_seguida([5, 4, 5, 2]) is False


def test_graham():
    assert I.graham(2, 20) == ap(math.sqrt(22.5 * 40))
    assert I.graham(-1, 20) is None
    assert I.margem_seguranca(20, 16) == ap(0.25)


def test_peg():
    assert I.peg(10, 0.10) == ap(1.0)
    assert I.peg(10, -0.1) is None


def test_tir_lucro_caixa():
    assert I.tir_por_lucro(10, 100, 0.04) == ap(0.14)
    assert I.tir_por_lucro(-10, 100, 0.04) is None
    assert I.tir_por_caixa(5, 100, 0.04) == ap(0.09)


def test_dcf_reverso_recupera_taxa():
    # gera um EV com taxa conhecida e confere que a bisseção recupera a taxa
    r_true = 0.13
    ev = I.vp_dcf(r_true, 1000, 0.08, 0.10, 0.04, 5)
    r = I.tir_dcf_reverso(ev, 1000, 0.08, 0.10, 0.04, 5, teto=0.15)
    assert r == ap(r_true, abs=1e-5)


def test_dcf_reverso_limites():
    assert I.tir_dcf_reverso(1000, 1000, 0.05, -0.1, 0.04) is None
    # crescimento acima do teto é limitado ao teto
    ev = I.vp_dcf(0.12, 1000, 0.15, 0.1, 0.04, 5)
    assert I.tir_dcf_reverso(ev, 1000, 0.40, 0.1, 0.04, teto=0.15) == ap(0.12, abs=1e-5)


def test_crescimento_implicito_gordon():
    # EV = FCL*(1+g)/(r-g) com FCL=10, r=12%, g=5% -> EV = 150
    ev = 10 * 1.05 / (0.12 - 0.05)
    assert I.crescimento_implicito(ev, 10, 0.12) == ap(0.05)
    assert I.crescimento_implicito(100, -5, 0.12) is None


def test_tir_banco_e_crescimento_banco():
    # ROE 20%, payout 50%, P/VP 2 -> 0.2*0.5 + 0.5*0.2/2 = 0.15
    assert I.tir_banco(0.20, 0.5, 2.0) == ap(0.15)
    # P/VP = (ROE - g)/(r - g); ROE 20%, r 15%, g 5% -> P/VP 1.5
    assert I.crescimento_implicito_banco(0.20, 1.5, 0.15) == ap(0.05)
    assert I.crescimento_implicito_banco(0.20, 1.0, 0.15) is None


def test_taxa_referencia():
    assert I.taxa_referencia(0.07, 0.035, 0.05) == ap(1.07 * 1.035 - 1 + 0.05)
    assert I.taxa_referencia(None, 0.035, 0.05, nominal_direto=0.042) == ap(0.092)


def test_mercado():
    p = [100 * (1.01 ** i) for i in range(100)]
    assert I.volatilidade_anual(p) == ap(0, abs=1e-9)
    assert I.max_drawdown([100, 120, 60, 130]) == ap(-0.5)
    idx = [100 + i + (i % 3) for i in range(200)]
    assert I.beta(idx, idx) == ap(1.0)


def _base():
    f = dict(receita=1000, custo=-600, lucro_bruto=400, ebit=200, da=50, desp_fin=-40, rec_fin=10,
             lair=170, ir=-50, lucro_liq=120, fco=180, capex=-80, div_pagos=-60,
             ativo=2000, ativo_circ=800, caixa=150, receber=200, estoques=150,
             passivo_circ=400, passivo_nc=600, fornecedores=100, divida_cp=100, divida_lp=400,
             pl=1000, minoritarios=0)
    m = dict(preco=10, valor_mercado=1200, acoes=120, dpa_12m=0.5, acoes_por_papel=1)
    return f, m


def test_calcular_geral():
    f, m = _base()
    r = I.calcular(f, m, "GERAL")
    assert r["divida_bruta"] == 500
    assert r["divida_liquida"] == 350
    assert r["ebitda"] == 250
    assert r["ev"] == 1550
    assert r["pl"] == ap(10)
    assert r["pvp"] == ap(1.2)
    assert r["ev_ebitda"] == ap(6.2)
    assert r["divliq_ebitda"] == ap(1.4)
    assert r["liquidez_corrente"] == ap(2)
    assert r["liquidez_seca"] == ap(650 / 400)
    assert r["cobertura_juros"] == ap(5)
    assert r["margem_bruta"] == ap(0.4)
    assert r["margem_liquida"] == ap(0.12)
    assert r["roe"] == ap(0.12)
    assert r["fcl"] == 100
    assert r["fcf_yield"] == ap(100 / 1200)
    assert r["conversao_caixa"] == ap(100 / 120)
    assert r["lpa"] == ap(1)
    assert r["vpa"] == ap(1000 / 120)
    assert r["dy"] == ap(0.05)
    assert r["payout"] == ap(0.5)
    assert r["dividendos_sobre_fcl"] == ap(0.6)
    # ROIC: alíquota efetiva 50/170, capital = 1000 + 0 + 350
    assert r["roic"] == ap(200 * (1 - 50 / 170) / 1350)
    assert r["pmr"] == ap(200 / 1000 * 365)
    assert r["ciclo_financeiro"] == ap((0.2 + 0.25 - 100 / 600) * 365)


def test_calcular_unit():
    f, m = _base()
    m["acoes_por_papel"] = 3
    r = I.calcular(f, m, "GERAL")
    assert r["lpa"] == ap(3)
    assert r["payout"] == ap(0.5 / 3)


def test_calcular_banco_sem_ev():
    f = dict(rec_interm=500, juros_rec=400, juros_desp=-250, pdd=-50, desp_adm=-90, desp_pessoal=0,
             lucro_liq=60, ativo=5000, pl=400)
    m = dict(preco=10, valor_mercado=800, acoes=80, dpa_12m=0.4)
    r = I.calcular(f, m, "BANCO")
    assert r["ev"] is None and r["ev_ebitda"] is None and r["divida_liquida"] is None
    assert r["pvp"] == ap(2)
    assert r["roe"] == ap(0.15)
    assert r["nim"] == ap(150 / 5000)
    assert r["indice_eficiencia"] == ap(90 / 250)
    assert r["custo_credito_sobre_margem"] == ap(50 / 150)


def test_meta_tem_campos():
    m = I.meta_json()
    for k in ("pl", "tir_dcf", "cresc_implicito", "roic", "bdr_agio"):
        assert m[k]["formula"]
    for fator in I.FATORES.values():
        for k in fator:
            assert k in m, k


def test_piotroski():
    ant = dict(roa=0.05, fco=90, lucro_liq=80, receita=1000, giro_ativo=0.5, divida_bruta=600, liquidez_corrente=1.2,
               acoes=100, margem_bruta=0.30)
    atu = dict(roa=0.06, fco=150, lucro_liq=120, receita=1200, giro_ativo=0.6, divida_bruta=500, liquidez_corrente=1.4,
               acoes=100, margem_bruta=0.32)
    pts, t = I.piotroski(atu, ant)
    assert pts == 9 and all(t.values())
    pior = dict(atu, roa=-0.01, fco=-5, lucro_liq=-20, acoes=130)
    pts2, t2 = I.piotroski(pior, ant)
    assert t2["roa_positivo"] is False and t2["sem_emissao"] is False and pts2 == 5
    pts3, _ = I.piotroski({"roa": 0.1}, {"roa": 0.05})
    assert pts3 is None


def test_wacc_e_criterios():
    assert I.wacc(0.15, 0.12, 100, 0, 0.34) == ap(0.15)
    assert I.wacc(0.15, 0.10, 60, 40, 0.34) == ap(0.6 * 0.15 + 0.4 * 0.10 * 0.66)
    boa = dict(roic=0.25, roe=0.22, ebitda=100, divliq_ebitda=0.5, margem_ebitda=0.3, cagr_receita_5a=0.10, cagr_lucro_5a=0.12,
               consist_lucro=7, fcl=50, margem_fcl_5a=0.1, ev_ebitda=6, pl=10, peg=0.8, cobertura_juros=9, valor_mercado=1000, divida_bruta=100)
    r = I.criterios(boa, {"margem_ebitda": 0.2, "ev_ebitda": 8, "pl": 12}, 0.15, 0.12, 0.34, 0.04, False)
    assert r["nota"] == ap(10) and r["avaliados"] == 10
    ruim = dict(boa, roe=0.10, divliq_ebitda=3.5, peg=1.6)
    r2 = I.criterios(ruim, {"margem_ebitda": 0.2, "ev_ebitda": 8, "pl": 12}, 0.15, 0.12, 0.34, 0.04, False)
    assert r2["testes"]["roe"] is False and r2["testes"]["divida"] is False and r2["testes"]["pl"] is False
    assert r2["nota"] == ap(10 * (46 - 5 - 5 - 4) / 46)
    banco = I.criterios(dict(roe=0.2, pl=8, peg=0.5, cagr_lucro_5a=0.1, consist_lucro=5, cagr_receita_5a=0.08), {}, 0.15, None, 0.34, 0.04, True)
    assert banco["avaliados"] == 4 and banco["testes"]["roic"] is None


def test_controlador_estatal():
    assert I.controlador_estatal([{"nome": "União Federal", "pct": 0.29}]) == "União Federal"
    assert I.controlador_estatal([{"nome": "Governo do Estado do Rio Grande do Sul"}])
    assert I.controlador_estatal([{"nome": "Vila Velha S.A. - Administração e Participações"}]) is None
    assert I.controlador_estatal([{"nome": "LTD Administração e Participações S.A."}]) is None


def test_trimestres_por_diferenca():
    acc = {"2025-03-31": ("2025-01-01", {"receita": 100, "lucro_liq": 10, "ebit": 15, "da": -5}),
           "2025-06-30": ("2025-01-01", {"receita": 220, "lucro_liq": 25, "ebit": 33, "da": -10}),
           "2025-09-30": ("2025-01-01", {"receita": 350, "lucro_liq": 40, "ebit": 52, "da": -15}),
           "2025-12-31": ("2025-01-01", {"receita": 500, "lucro_liq": 60, "ebit": 75, "da": -20}),
           "2026-03-31": ("2026-01-01", {"receita": 130, "lucro_liq": 14, "ebit": 20, "da": -6})}
    q = I.trimestres_por_diferenca(acc)
    assert q["receita"] == {"2025-03-31": 100, "2025-06-30": 120, "2025-09-30": 130, "2025-12-31": 150, "2026-03-31": 130}
    s = I.serie_trimestral(q)
    assert s[-1]["rotulo"] == "1T26" and s[-1]["ebitda"] == ap(26) and s[0]["margem_liquida"] == ap(0.1)
    assert s[3]["rotulo"] == "4T25" and s[3]["lucro_liq"] == 20


def test_proxima_divulgacao():
    ent = [("2025-09-30", "ITR", "2025-10-22", "l1"), ("2025-12-31", "DFP", "2026-02-25", "l2"), ("2026-03-31", "ITR", "2026-04-29", "l3"),
           ("2026-06-30", "ITR", "2026-07-22", "l4"), ("2026-09-30", "ITR", "2026-10-21", "l5"), ("2024-12-31", "DFP", "2025-02-26", "l0")]
    r = I.proxima_divulgacao(ent, "2026-11-17")
    assert r["ultima"]["rotulo"] == "3T26" and r["ultima"]["entrega"] == "2026-10-21"
    p = r["proxima"]
    assert p["doc"] == "DFP" and p["fim"] == "2026-12-31" and p["rotulo"] == "4T26"
    assert p["data"] == "2027-02-25" and p["prazo_legal"] == "2027-03-31" and not p["passou"]
    r2 = I.proxima_divulgacao([("2026-06-30", "ITR", "2026-08-10", "x")], "2026-11-17")
    assert r2["proxima"]["doc"] == "ITR" and r2["proxima"]["data"] == "2026-11-14" and r2["proxima"]["passou"]
