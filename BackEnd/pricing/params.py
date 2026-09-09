"""Parâmetros da precificação, versionados.

Tudo que é "constante de negócio" da sugestão de valor/hora mora aqui, num só
lugar e com uma versão explícita. Duas razões:

1. **Explicabilidade.** Quando o mesmo anúncio for sugerido a R$ 192 em março e
   R$ 210 em julho, a diferença tem de ser rastreável até uma mudança de
   parâmetro — e não até "a IA respondeu diferente".
2. **Calibração.** `bookable_days_year`, `target_occupancy` e `margin` são hoje
   estimativas. Conforme a plataforma acumular locações concluídas, eles devem
   ser recalculados a partir do histórico real. Trocar um número aqui e subir a
   versão é a operação inteira.

Os coeficientes de reparo (`rf1`/`rf2`) vêm do padrão ASABE EP496/D497, a
referência de engenharia agrícola para custo de máquinas — não são chute.
"""

from dataclasses import dataclass

# Sobe a cada mudança de valor neste arquivo. Fica gravado em cada sugestão.
PARAMS_VERSION = "2026.09.1"

# Horas faturadas por dia de reserva. Espelha `payments.pricing.HORAS_POR_DIARIA`:
# a plataforma cobra por dia de calendário, não por hora de horímetro, e o
# motor de precificação precisa raciocinar na mesma unidade em que fatura.
BILLED_HOURS_PER_DAY = 8

# Depreciação temporal: cai com a idade e tende a um piso. Máquina velha já
# perdeu o que tinha para perder.
DEPRECIATION_INITIAL_RATE = 0.15   # d_0  — ao ano, máquina nova
DEPRECIATION_FLOOR_RATE = 0.05     # d_min — assíntota
DEPRECIATION_DECAY = 0.15          # k     — velocidade da queda

# Preço do diesel (R$/L) e consumo específico (L por cv por hora de motor), a
# carga parcial típica de campo. Só entram quando o anúncio inclui combustível.
DIESEL_PRICE_BRL = 6.20
DIESEL_LITERS_PER_CV_HOUR = 0.15

# Custo horário do operador com encargos. Só entra quando o anúncio o inclui.
OPERATOR_COST_BRL_HOUR = 52.00

# Banda de sanidade: custo horário como fração do valor de mercado do usado.
# Fora dela, a sugestão não é apresentada — é sinal de que algum insumo veio
# errado (valor pesquisado furado, horímetro implausível, categoria trocada).
SANITY_MIN_RATIO = 0.0002   # 0,02% do valor por hora faturada
SANITY_MAX_RATIO = 0.0010   # 0,10%

# Largura da faixa mostrada ao locador em torno do valor sugerido.
SUGGESTION_BAND = 0.15


@dataclass(frozen=True)
class CategoryParams:
    """Parâmetros de uma categoria de maquinário."""

    life_hours: int
    """Vida útil econômica, em horas de motor."""

    salvage_fraction: float
    """Valor residual ao fim da vida, como fração do valor de novo."""

    bookable_days_year: int
    """Dias por ano em que a máquina é realisticamente reservável (janela
    sazonal da atividade). Junto com `target_occupancy`, é o parâmetro mais
    sensível do modelo inteiro."""

    target_occupancy: float
    """Fração dos dias reserváveis que se espera de fato locar."""

    load_factor: float
    """Horas de motor por hora faturada. A plataforma cobra 8 h por dia de
    reserva, mas a máquina não roda 8 h; sem isto o desgaste seria cobrado sobre
    horas que não existiram."""

    rf1: float
    rf2: float
    """Coeficientes ASABE da curva de reparo acumulado."""

    insurance_rate: float
    """Seguro, tributos e guarda, ao ano, sobre o valor do usado."""

    capital_rate: float
    """Custo de capital real (já descontada a inflação), ao ano."""

    time_depreciation_share: float
    """Fração da depreciação anual atribuída ao tempo. O resto é atribuído ao
    uso, via vida útil em horas. Existe para não contar a mesma perda de valor
    duas vezes: o preço de mercado observado já embute envelhecimento e
    desgaste."""

    margin: float
    """Margem do locador sobre o custo."""


CATEGORY_PARAMS = {
    "trator": CategoryParams(
        life_hours=12000, salvage_fraction=0.20, bookable_days_year=120,
        target_occupancy=0.55, load_factor=0.65, rf1=0.007, rf2=2.0,
        insurance_rate=0.02, capital_rate=0.08, time_depreciation_share=0.55,
        margin=0.20,
    ),
    "colheitadeira": CategoryParams(
        life_hours=9000, salvage_fraction=0.20, bookable_days_year=45,
        target_occupancy=0.70, load_factor=0.75, rf1=0.040, rf2=2.1,
        insurance_rate=0.02, capital_rate=0.08, time_depreciation_share=0.55,
        margin=0.20,
    ),
    "pulverizador": CategoryParams(
        life_hours=10000, salvage_fraction=0.20, bookable_days_year=90,
        target_occupancy=0.55, load_factor=0.70, rf1=0.028, rf2=2.1,
        insurance_rate=0.02, capital_rate=0.08, time_depreciation_share=0.55,
        margin=0.20,
    ),
}

DEFAULT_CATEGORY = "trator"

# `machines.usage_purpose` é texto livre — o formulário oferece quatro opções,
# mas o banco aceita qualquer coisa e os dados de seed já divergem ("Colheita",
# "Colheita de Grãos", "Plantio e cultivo"). O mapeamento é por palavra-chave
# em vez de igualdade para não quebrar a cada variação de digitação.
_PURPOSE_KEYWORDS = (
    ("colheita", "colheitadeira"),
    ("colhedora", "colheitadeira"),
    ("pulveriza", "pulverizador"),
    ("plantio", "trator"),
    ("cultivo", "trator"),
    ("preparo", "trator"),
    ("solo", "trator"),
)


def category_for(usage_purpose):
    """Deduz a categoria de precificação a partir da finalidade de uso.

    Cai em `DEFAULT_CATEGORY` quando não reconhece: trator é a categoria mais
    comum e a de parâmetros mais conservadores.
    """
    if not usage_purpose:
        return DEFAULT_CATEGORY
    normalized = usage_purpose.strip().lower()
    for keyword, category in _PURPOSE_KEYWORDS:
        if keyword in normalized:
            return category
    return DEFAULT_CATEGORY


def params_for(category):
    return CATEGORY_PARAMS.get(category, CATEGORY_PARAMS[DEFAULT_CATEGORY])
