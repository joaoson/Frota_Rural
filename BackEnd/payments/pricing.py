from decimal import Decimal, ROUND_HALF_UP

HORAS_POR_DIARIA = 8
TAXA_PLATAFORMA = Decimal('0.05')


def calcular_diarias(inicio, fim):
    if not inicio or not fim:
        return 0
    dias = (fim.date() - inicio.date()).days
    if dias < 0:
        return 0
    return dias + 1


def calcular_total(rental):
    diarias = calcular_diarias(rental.start_date, rental.end_date)
    valor_diaria = Decimal(rental.postings.hourly_rate) * HORAS_POR_DIARIA
    subtotal = valor_diaria * diarias
    total = subtotal * (Decimal('1') + TAXA_PLATAFORMA)
    return total.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
