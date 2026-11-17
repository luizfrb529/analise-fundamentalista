# Conferência da Fase 1: indicadores x balanço oficial

Preços de fechamento de 2026-11-16 | Balanços até o 3T2026.

Método: as linhas são lidas direto do CSV da CVM (por código de conta) ou dos fatos XBRL da SEC, sem passar pelo parser do pipeline. O LTM é refeito à mão e os indicadores recalculados. 'Status vs fonte' = ok quando a diferença é de até 1%. A coluna do yfinance é só referência externa (agregador com metodologia própria e às vezes defasado).

## ITUB4 | Itaú Unibanco (CVM 19348, balanço 2026-09-30)

Linhas cruas usadas (valores em R$ mil convertidos para R$ bi; LTM = exercício anterior + acumulado do ano - acumulado do ano anterior):

| Conta | Descrição | Exercício 2025 | Acum. 2026-09 | Acum. mesmo período 2025 | LTM |
|---|---|---|---|---|---|
| 3.09.01 | Atribuído a Sócios da Empresa Controladora | 44,857 | 35,842 | 32,950 | 47,749 |
| 3.09 | Lucro/Prejuízo Consolidado do Período | 45,849 | 36,469 | 33,705 | 48,613 |
| 3.01 | Receitas da Intermediação Financeira | 387,118 | 309,396 | 297,640 | 398,874 |

Balanço em 2026-09-30: PL consolidado (2.08) 239,262 bi, minoritários 9,992 bi, PL dos controladores 229,270 bi, ativo total (1) 3.323,991 bi.

Valor de mercado: ITUB3 R$ 45,45 x 5,6177 bi ações + ITUB4 R$ 41,30 x 5,4043 bi ações = R$ 478,523 bi.

| Indicador | Site (pipeline) | Recalculado da fonte | yfinance (referência) | Status vs fonte |
|---|---|---|---|---|
| Lucro LTM controladores (R$ bi) | 47,749 | 47,749 | n/d | ok |
| P/L | 10,02 | 10,02 | 9,82 | ok |
| P/VP | 2,09 | 2,09 | 2,00 | ok |
| ROE | 20,8% | 20,8% | 21,0% | ok |
| Margem líquida (sobre receitas da intermediação) | 12,0% | 12,0% | n/d | ok |
| LPA (R$) | 4,33 | 4,33 | 4,23 | ok |
| DY 12m | 7,5% | 7,5% | 2,2% | ok |

Observação: o yfinance usa outra contagem de ações e lucro (pode incluir ajustes); serve só como ordem de grandeza.

## TAEE11 | Taesa (CVM 20257, balanço 2026-09-30)

Linhas cruas usadas (valores em R$ mil convertidos para R$ bi; LTM = exercício anterior + acumulado do ano - acumulado do ano anterior):

| Conta | Descrição | Exercício 2025 | Acum. 2026-09 | Acum. mesmo período 2025 | LTM |
|---|---|---|---|---|---|
| 3.01 | Receita de Venda de Bens e/ou Serviços | 4,624 | 2,829 | 3,425 | 4,028 |
| 3.05 | Resultado Antes do Resultado Financeiro e dos Tributos | 2,736 | 2,335 | 2,073 | 2,999 |
| 3.11 | Lucro/Prejuízo Consolidado do Período | 1,580 | 1,282 | 1,206 | 1,656 |
| 3.06.02 | Despesas Financeiras | -1,172 | -1,041 | -0,912 | -1,301 |

Balanço em 2026-09-30: PL (2.03) 8,225 bi; caixa (1.01.01) 0,262 + aplicações (1.01.02) 0,000; empréstimos CP (2.01.04) 0,508 e LP (2.02.01) 13,078; dívida líquida 13,324 bi; D&A LTM (DFC) 0,088 bi.

Unit TAEE11 = 1 ON + 2 PN. Valor de mercado = TAEE3 x ON + TAEE4 x PN = R$ 14,441 bi.

| Indicador | Site (pipeline) | Recalculado da fonte | yfinance (referência) | Status vs fonte |
|---|---|---|---|---|
| P/L | 8,78 | 8,72 | 37,49 | ok |
| P/VP | 1,76 | 1,76 | 1,74 | ok |
| EV/EBITDA | 8,99 | 8,99 | 10,19 | ok |
| Dív. líq./EBITDA | 4,32 | 4,32 | n/d | ok |
| Margem EBIT | 74,5% | 74,5% | 54,4% | ok |
| ROE | 20,0% | 20,1% | 20,9% | ok |
| Cobertura de juros | 2,31 | 2,31 | n/d | ok |
| LPA por unit (R$) | 4,78 | 4,81 | n/d | ok |

Observação: a margem e o EBITDA de transmissoras em IFRS incluem a receita de remuneração do ativo de contrato (correção monetária), por isso diferem do EBITDA regulatório divulgado no release.

## CURY3 | Cury Construtora (CVM 25100, balanço 2026-09-30)

Linhas cruas usadas (valores em R$ mil convertidos para R$ bi; LTM = exercício anterior + acumulado do ano - acumulado do ano anterior):

| Conta | Descrição | Exercício 2025 | Acum. 2026-09 | Acum. mesmo período 2025 | LTM |
|---|---|---|---|---|---|
| 3.01 | Receita de Venda de Bens e/ou Serviços | 5,399 | 5,141 | 3,980 | 6,561 |
| 3.03 | Resultado Bruto | 2,147 | 2,024 | 1,574 | 2,596 |
| 3.05 | Resultado Antes do Resultado Financeiro e dos Tributos | 1,268 | 1,214 | 0,922 | 1,560 |
| 3.11.01 | Atribuído a Sócios da Empresa Controladora | 0,976 | 0,887 | 0,705 | 1,157 |
| 3.11 | Lucro/Prejuízo Consolidado do Período | 1,081 | 1,032 | 0,784 | 1,329 |

Balanço em 2026-09-30: PL consolidado 2,183 bi, minoritários 0,404 bi, PL controladores 1,779 bi.

| Indicador | Site (pipeline) | Recalculado da fonte | yfinance (referência) | Status vs fonte |
|---|---|---|---|---|
| P/L | 7,31 | 7,31 | 7,16 | ok |
| P/VP | 4,75 | 4,75 | 5,54 | ok |
| ROE | 65,1% | 65,1% | 69,5% | ok |
| Margem bruta | 39,6% | 39,6% | 39,6% | ok |
| Margem líquida | 17,6% | 17,6% | 18,6% | ok |
| DY 12m | 18,1% | 18,1% | 11,6% | ok |

## MSFT34 | Microsoft (SEC CIK 789019, balanço 2026-09-30)

Lucro líquido por trimestre (NetIncomeLoss), derivado dos 10-Q e do 10-K:

| Fim | Duração | Formulário | Valor (US$ bi) |
|---|---|---|---|
| 2025-06-30 | 364 dias (desde 2024-07-01) | DEF 14A | 101,832 |
| 2025-09-30 | 91 dias (desde 2025-07-01) | 10-Q | 27,747 |
| 2025-12-31 | 183 dias (desde 2025-07-01) | 10-Q | 66,205 |
| 2025-12-31 | 91 dias (desde 2025-10-01) | 10-Q | 38,458 |
| 2026-03-31 | 273 dias (desde 2025-07-01) | 10-Q | 97,983 |
| 2026-03-31 | 89 dias (desde 2026-01-01) | 10-Q | 31,778 |
| 2026-06-30 | 364 dias (desde 2025-07-01) | DEF 14A | 133,749 |
| 2026-09-30 | 91 dias (desde 2026-07-01) | 10-Q | 36,629 |

LTM = soma dos trimestres 2025-12-31, 2026-03-31, 2026-06-30, 2026-09-30 = US$ 142,631 bi (o 4º tri fiscal = 10-K anual - 9 meses do 10-Q).

PL (StockholdersEquity, 2026-09-30, 10-Q) US$ 470,509 bi; ações (dei, 2026-10-22) 7,4262 bi; preço MSFT US$ 517,99; valor de mercado US$ 3.846,694 bi.

| Indicador | Site (pipeline) | Recalculado da fonte | yfinance (referência) | Status vs fonte |
|---|---|---|---|---|
| P/L | 26,97 | 26,97 | 27,03 | ok |
| P/VP | 8,18 | 8,18 | 8,18 | ok |
| ROE | 30,3% | 30,3% | 34,2% | ok |
| LPA (US$) | 19,21 | 19,21 | 19,16 | ok |
| DY 12m | 0,7% | 0,7% | 0,7% | ok |

| Indicador | Site (pipeline) | Recalculado da fonte | yfinance (referência) | Status vs fonte |
|---|---|---|---|---|
| Preço justo do BDR (R$) | 123,72 | 123,72 | n/d | ok |
| Ágio do BDR | 1,1% | 1,1% | n/d | ok |

Observação: o ROE do yfinance usa PL médio; o site usa PL do fim do período, por isso a diferença.

## BHIA3 | Casas Bahia (CVM 6505, balanço 2026-06-30)

Linhas cruas usadas (valores em R$ mil convertidos para R$ bi; LTM = exercício anterior + acumulado do ano - acumulado do ano anterior):

| Conta | Descrição | Exercício 2025 | Acum. 2026-06 | Acum. mesmo período 2025 | LTM |
|---|---|---|---|---|---|
| 3.01 | Receita de Venda de Bens e/ou Serviços | 29,197 | 14,393 | 13,858 | 29,732 |
| 3.05 | Resultado Antes do Resultado Financeiro e dos Tributos | 1,343 | -3,026 | 0,570 | -2,253 |
| 3.11 | Lucro/Prejuízo Consolidado do Período | -2,988 | -11,181 | -0,963 | -13,206 |

Balanço em 2026-06-30 (o ITR do 3T26 não estava na base da CVM na data da conferência): PL (Patrimônio Líquido Consolidado) -8,270 bi.

| Indicador | Site (pipeline) | Recalculado da fonte | yfinance (referência) | Status vs fonte |
|---|---|---|---|---|
| Lucro LTM (R$ bi) | -13,206 | -13,206 | n/d | ok |
| Margem líquida | -44,4% | -44,4% | -44,4% | ok |
| Margem EBIT | -7,6% | -7,6% | -1,7% | ok |
| Valor de mercado (R$ bi) | 0,664 | 0,664 | 0,689 | ok |

P/L, P/VP e TIR não se aplicam: lucro e patrimônio negativos, modelo DISTRESSED. O site suprime múltiplos e TIR como sinal de preço baixo.
