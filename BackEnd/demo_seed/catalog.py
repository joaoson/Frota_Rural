"""Illustrative equipment configurations, rather than manufacturer specifications."""

import json
from pathlib import Path

PROFILES = (
    ('joao', 'Sítio Horizonte — Estrada Rural de Demonstração, km 12', 'Curitiba', 'PR', '80010-000'),
    ('maria', 'Fazenda Boa Safra — Estrada Rural de Demonstração, km 8', 'Curitiba', 'PR', '80010-000'),
    ('carlos', 'Comunidade Boa Safra — Rua de Demonstração, 32', 'Curitiba', 'PR', '80010-000'),
    ('ana', 'Fazenda Santa Clara — Estrada Rural de Demonstração, km 18', 'Londrina', 'PR', '86010-000'),
    ('pedro', 'Sítio das Araucárias — Estrada Rural de Demonstração, km 6', 'Londrina', 'PR', '86010-000'),
    ('fernanda', 'Comunidade das Araucárias — Rua de Demonstração, 45', 'Londrina', 'PR', '86010-000'),
)

# Preserve the index order of seed.MACHINES: it defines persistent UUIDs.
# Each entry describes a fictitious rental configuration, not a certified spec sheet.
EQUIPMENT = (
    ('Plantio de soja em grandes áreas', 'trator', 'semeadora de grande porte', 'talhões planos e consolidados'),
    ('Preparo profundo do solo', 'trator', 'escarificador e grade pesada', 'solos argilosos com acesso largo'),
    ('Plantio e transporte interno', 'trator', 'plantadeira e carreta agrícola', 'áreas de grãos e estradas internas'),
    ('Semeadura de milho e soja', 'trator', 'plantadeira de precisão', 'talhões extensos com curvas suaves'),
    ('Gradagem e incorporação de cobertura', 'trator', 'grade niveladora', 'áreas de plantio convencional'),
    ('Pulverização com implemento tracionado', 'trator', 'pulverizador de arrasto', 'linhas de cultivo com acesso controlado'),
    ('Colheita de soja', 'colheitadeira', 'plataforma de corte de grãos', 'lavouras maduras com terreno firme'),
    ('Colheita de milho e soja', 'colheitadeira', 'plataforma compatível definida na retirada', 'talhões grandes e secos'),
    ('Manejo de pequenas propriedades', 'trator', 'roçadeira e distribuidor de insumos', 'sítios e corredores de serviço'),
    ('Preparo e plantio de inverno', 'trator', 'grade e semeadora de cobertura', 'áreas de aveia e trigo'),
    ('Colheita de grãos em larga escala', 'colheitadeira', 'plataforma de grãos e sistema de descarga', 'áreas com ponto de transbordo'),
    ('Manejo de pastagens', 'trator', 'roçadeira de arrasto', 'pastagens sem obstáculos ocultos'),
    ('Aplicação de insumos em pequenas áreas', 'trator', 'distribuidor de adubo', 'talhões pequenos e acesso rural'),
    ('Preparo de solo para cereais', 'trator', 'arado e grade niveladora', 'terrenos previamente vistoriados'),
    ('Implantação de lavoura de verão', 'trator', 'plantadeira e distribuidor', 'talhões médios com acesso de carreta'),
    ('Pulverização e apoio ao cultivo', 'trator', 'pulverizador tracionado', 'lavouras de menor escala'),
    ('Escarificação e plantio direto', 'trator', 'escarificador e semeadora', 'solo com umidade adequada ao manejo'),
    ('Plantio e apoio à colheita', 'trator', 'plantadeira e carreta de transbordo', 'áreas mistas de grãos'),
    ('Colheita de trigo e soja', 'colheitadeira', 'plataforma de grãos', 'lavouras maduras e terreno seco'),
    ('Preparo de área e nivelamento', 'trator', 'grade aradora e niveladora', 'áreas de rotação de culturas'),
)

CROPS = ('soja', 'milho', 'trigo', 'aveia')
CANCELLATIONS = (
    'Chuva acumulada deixou o acesso ao talhão impraticável; serviço reagendado pelo produtor.',
    'Produtor antecipou a operação com equipamento próprio e dispensou a reserva.',
    'Equipe solicitou outro implemento após vistoria do terreno; reserva cancelada antes da retirada.',
    'Janela de colheita mudou após inspeção da umidade dos grãos.',
)


def photos():
    return json.loads(Path(__file__).with_name('photos.json').read_text(encoding='utf-8'))


def specifications(index, machine):
    brand, model, year, _, power = machine
    operation, category, implement, terrain = EQUIPMENT[index]
    return (
        f'FICHA DE DEMONSTRAÇÃO — {brand} {model}\n'
        f'Categoria: {category}. Ano cadastrado: {year}. Potência cadastrada: {power} cv.\n'
        f'Aplicação proposta: {operation}.\n'
        f'Conjunto ilustrativo: {implement}; compatibilidade e inclusão confirmadas no chat.\n'
        f'Ambiente de uso: {terrain}.\n'
        'Entrega: limpeza, níveis, pneus, iluminação e comandos conferidos junto ao operador.\n'
        'Acompanhamento: leitura do horímetro na retirada e na devolução; horas não alteram a diária.\n'
        'Logística: transporte em prancha combinado à parte; combustível e operador tratados na reserva.\n'
        'Configuração fictícia para explorar o aplicativo; não substitui o manual do fabricante.'
    )


def description(index, machine, location, asset_base_url):
    brand, model, _, _, _ = machine
    operation, category, implement, terrain = EQUIPMENT[index]
    return (
        f'{brand} {model} — {operation.lower()}\n\n'
        f'{category.capitalize()} de demonstração disponível em {location}. Indicado para {terrain}. '
        f'Planejamento do serviço com {implement}, conforme a necessidade registrada pelo locatário.\n\n'
        'RETIRADA E DEVOLUÇÃO\nAtendimento das 08h às 17h, com agendamento. '
        'Conferência conjunta do estado do equipamento, níveis, acessórios e horímetro. '
        'Informar largura do acesso, distância até o talhão e ponto de descarga da prancha.\n\n'
        'O QUE COMBINAR\nOperador, frete, combustível, implementos e área prevista devem ser confirmados '
        'na conversa antes da reserva. Não operar em terreno alagado nem fora da finalidade combinada.\n\n'
        'PREÇO\nDiária equivalente a 8 horas da tarifa cadastrada; início e fim contam como dias inteiros. '
        'A cotação acrescenta a taxa de 5% da plataforma. O horímetro serve ao acompanhamento do uso.\n\n'
        'ANÚNCIO FICTÍCIO\nAs fotografias são ilustrativas da marca/categoria e podem mostrar outra versão. '
        'A máquina, o endereço de retirada e as condições descritas são exemplos para demonstração. '
        f'Autores, modelos fotografados e licenças: {asset_base_url}/credits.html#machine-{index:02d}'
    )


def rental_notes(index, machine_index):
    operation, _, implement, terrain = EQUIPMENT[machine_index]
    return (
        f'DEMONSTRAÇÃO — {operation}. Cultura: {CROPS[index % len(CROPS)]}; '
        f'área estimada: {18 + index * 3} hectares, em {terrain}. '
        f'Implemento a confirmar: {implement}. Retirada prevista às 08h no pátio do locador; '
        'acesso por estrada de cascalho e descarga em terreno nivelado. '
        'Operador orientado a conferir pneus, níveis, comandos e horímetro antes da saída. '
        'Combustível e transporte alinhados no chat; devolver limpo e comunicar qualquer ocorrência.'
    )
