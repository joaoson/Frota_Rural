"""
Seed script to populate the database with sample data.
Run: python manage.py shell < seed.py
"""
import os
import uuid
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mysite.settings")
django.setup()

from datetime import date, datetime, timedelta
from decimal import Decimal
from api.models import (
    Users, Credentials, Machines, Postings, PostingsPhotos,
    Rentals, Contracts, Messages, Reviews,
)
from django.contrib.auth.hashers import make_password
from django.utils import timezone

now = timezone.now()

DEFAULT_PASSWORD = "Teste1234"
_seed_password_hash = make_password(DEFAULT_PASSWORD)


# ── Users (20) ──────────────────────────────────────────────────────────────
users_data = [
    ("João Silva", "111.222.333-01", "joao.silva@email.com", "locador", "(11) 91111-0001"),
    ("Maria Oliveira", "111.222.333-02", "maria.oliveira@email.com", "locatario", "(11) 91111-0002"),
    ("Carlos Santos", "111.222.333-03", "carlos.santos@email.com", "operador", "(11) 91111-0003"),
    ("Ana Pereira", "111.222.333-04", "ana.pereira@email.com", "locador", "(11) 91111-0004"),
    ("Pedro Costa", "111.222.333-05", "pedro.costa@email.com", "locatario", "(11) 91111-0005"),
    ("Fernanda Lima", "111.222.333-06", "fernanda.lima@email.com", "operador", "(11) 91111-0006"),
    ("Ricardo Almeida", "111.222.333-07", "ricardo.almeida@email.com", "locador", "(11) 91111-0007"),
    ("Juliana Ferreira", "111.222.333-08", "juliana.ferreira@email.com", "locatario", "(11) 91111-0008"),
    ("Marcos Souza", "111.222.333-09", "marcos.souza@email.com", "operador", "(11) 91111-0009"),
    ("Patrícia Rocha", "111.222.333-10", "patricia.rocha@email.com", "locador", "(11) 91111-0010"),
    ("Gustavo Martins", "111.222.333-11", "gustavo.martins@email.com", "locatario", "(11) 91111-0011"),
    ("Camila Ribeiro", "111.222.333-12", "camila.ribeiro@email.com", "locador", "(11) 91111-0012"),
    ("Lucas Barbosa", "111.222.333-13", "lucas.barbosa@email.com", "operador", "(11) 91111-0013"),
    ("Beatriz Carvalho", "111.222.333-14", "beatriz.carvalho@email.com", "locatario", "(11) 91111-0014"),
    ("Rafael Gomes", "111.222.333-15", "rafael.gomes@email.com", "locador", "(11) 91111-0015"),
    ("Larissa Araújo", "111.222.333-16", "larissa.araujo@email.com", "locatario", "(11) 91111-0016"),
    ("Diego Nascimento", "111.222.333-17", "diego.nascimento@email.com", "operador", "(11) 91111-0017"),
    ("Vanessa Castro", "111.222.333-18", "vanessa.castro@email.com", "locador", "(11) 91111-0018"),
    ("Thiago Mendes", "111.222.333-19", "thiago.mendes@email.com", "admin", "(11) 91111-0019"),
    ("Isabela Dias", "111.222.333-20", "isabela.dias@email.com", "admin", "(11) 91111-0020"),
]

users = []
for i, (name, doc, email, role, phone) in enumerate(users_data):
    u = Users.objects.create(
        id=uuid.uuid4(), name=name, document=doc, email=email,
        password=_seed_password_hash,
        phone=phone, role=role, status="active",
        address=f"Rua Exemplo, {100 + i} - Curitiba/PR",
        birth_date=date(1980 + (i % 30), 1 + (i % 12), 1 + (i % 27)),
    )
    users.append(u)
print(f"[OK]{len(users)} Users created (senha padrão: {DEFAULT_PASSWORD})")

# Helpers: users by role
locadores = [u for u in users if u.role == "locador"]
locatarios = [u for u in users if u.role == "locatario"]
operadores = [u for u in users if u.role == "operador"]


# ── Credentials (20) ───────────────────────────────────────────────────────
cred_statuses = ["pending", "approved", "rejected"]
credentials = []
for i in range(20):
    c = Credentials.objects.create(
        id=uuid.uuid4(),
        user=users[i],
        type="cnh" if i % 2 == 0 else "certificado",
        document_number=f"DOC-{1000 + i}",
        expiration_date=(now + timedelta(days=365 - i * 10)).date(),
        file_url=f"https://storage.example.com/credentials/{i + 1}.pdf",
        status=cred_statuses[i % 3],
        created_at=now - timedelta(days=30 - i),
    )
    credentials.append(c)
print(f"[OK]{len(credentials)} Credentials created")


# ── Machines (20) ──────────────────────────────────────────────────────────
machines_data = [
    ("John Deere", "8R 410", 2022, "Plantio e cultivo"),
    ("Case IH", "Magnum 380", 2021, "Preparo de solo"),
    ("New Holland", "T7.315", 2023, "Colheita"),
    ("Massey Ferguson", "MF 8737", 2020, "Plantio e cultivo"),
    ("Valtra", "BH 224", 2022, "Preparo de solo"),
    ("John Deere", "6155J", 2021, "Pulverização"),
    ("Case IH", "Axial-Flow 8250", 2023, "Colheita"),
    ("New Holland", "CR 10.90", 2022, "Colheita"),
    ("Massey Ferguson", "MF 4292", 2019, "Plantio e cultivo"),
    ("Valtra", "A134", 2020, "Preparo de solo"),
    ("John Deere", "S790", 2023, "Colheita"),
    ("Case IH", "Farmall 80", 2021, "Plantio e cultivo"),
    ("New Holland", "TL 75E", 2020, "Pulverização"),
    ("Massey Ferguson", "MF 6713", 2022, "Preparo de solo"),
    ("Valtra", "BT 210", 2021, "Plantio e cultivo"),
    ("John Deere", "5090E", 2019, "Pulverização"),
    ("Case IH", "Puma 185", 2022, "Preparo de solo"),
    ("New Holland", "T6.180", 2023, "Plantio e cultivo"),
    ("Massey Ferguson", "MF 9895", 2021, "Colheita"),
    ("Valtra", "BH 194", 2020, "Preparo de solo"),
]

machines = []
for i, (brand, model, year, purpose) in enumerate(machines_data):
    m = Machines.objects.create(
        id=uuid.uuid4(),
        owner=locadores[i % len(locadores)],
        renagro_number=f"RENAGRO-{2024000 + i}",
        brand=brand, model=model, year=year,
        technical_specifications=f"{brand} {model} - Motor de alta performance, {year}",
        usage_purpose=purpose,
        status="active",
        created_at=now - timedelta(days=60 - i),
        updated_at=now - timedelta(days=i),
    )
    machines.append(m)
print(f"[OK]{len(machines)} Machines created")


# ── Postings (20) ──────────────────────────────────────────────────────────
locations = [
    (-23.55052000, -46.63331100, "São Paulo, SP"),
    (-22.90685000, -43.17290000, "Rio de Janeiro, RJ"),
    (-19.91610000, -43.93450000, "Belo Horizonte, MG"),
    (-25.42780000, -49.27310000, "Curitiba, PR"),
    (-15.79420000, -47.88250000, "Brasília, DF"),
    (-30.03460000, -51.23080000, "Porto Alegre, RS"),
    (-12.97110000, -38.51080000, "Salvador, BA"),
    (-8.05280000, -34.87170000, "Recife, PE"),
    (-3.71900000, -38.54340000, "Fortaleza, CE"),
    (-16.68690000, -49.26480000, "Goiânia, GO"),
    (-20.31520000, -40.31280000, "Vitória, ES"),
    (-2.50430000, -44.28260000, "São Luís, MA"),
    (-22.32840000, -49.07110000, "Bauru, SP"),
    (-21.17860000, -47.81030000, "Ribeirão Preto, SP"),
    (-23.31040000, -51.16280000, "Londrina, PR"),
    (-21.76100000, -43.34960000, "Juiz de Fora, MG"),
    (-27.59690000, -48.54950000, "Florianópolis, SC"),
    (-20.44280000, -54.64640000, "Campo Grande, MS"),
    (-1.45580000, -48.50240000, "Belém, PA"),
    (-3.10190000, -60.02170000, "Manaus, AM"),
]

ad_statuses = ["active", "active", "active", "inactive"]
postings = []
for i in range(20):
    lat, lng, addr = locations[i]
    p = Postings.objects.create(
        id=uuid.uuid4(),
        machinery=machines[i],
        hourly_rate=Decimal(f"{150 + i * 25}.00"),
        location_lat=Decimal(str(lat)),
        location_lng=Decimal(str(lng)),
        location_address=addr,
        availability_start=now + timedelta(days=i),
        availability_end=now + timedelta(days=30 + i),
        description=f"Disponível para aluguel: {machines[i].brand} {machines[i].model} em {addr}",
        status=ad_statuses[i % len(ad_statuses)],
        created_at=now - timedelta(days=20 - i),
        updated_at=now - timedelta(days=i),
    )
    postings.append(p)
print(f"[OK]{len(postings)} Postings created")


# ── PostingsPhotos (20) ────────────────────────────────────────────────────
photos = []
for i in range(20):
    ph = PostingsPhotos.objects.create(
        id=uuid.uuid4(),
        postings=postings[i],
        image_url=f"https://storage.example.com/postings/{postings[i].id}/photo_{i + 1}.jpg",
        is_primary=(i % 3 == 0),
        created_at=now - timedelta(days=19 - i),
    )
    photos.append(ph)
print(f"[OK]{len(photos)} PostingsPhotos created")


# ── Rentals (20) ───────────────────────────────────────────────────────────
rental_statuses = ["pending", "active", "completed", "cancelled"]
rentals = []
for i in range(20):
    start = now + timedelta(days=i * 2)
    end = start + timedelta(days=3 + i % 5)
    hours = int((end - start).total_seconds() / 3600)
    r = Rentals.objects.create(
        id=uuid.uuid4(),
        postings=postings[i],
        lessee=locatarios[i % len(locatarios)],
        operator=operadores[i % len(operadores)] if i % 3 != 0 else None,
        start_date=start,
        end_date=end,
        total_price=Decimal(str(hours * (150 + i * 25))),
        initial_hour_meter=1000 + i * 50,
        final_hour_meter=1000 + i * 50 + hours if i % 2 == 0 else None,
        status=rental_statuses[i % 4],
        created_at=now - timedelta(days=15 - i),
        updated_at=now - timedelta(days=i),
    )
    rentals.append(r)
print(f"[OK]{len(rentals)} Rentals created")


# ── Contracts (20) ─────────────────────────────────────────────────────────
contract_statuses = ["pending_signatures", "signed", "cancelled"]
contracts = []
for i in range(20):
    ct = Contracts.objects.create(
        id=uuid.uuid4(),
        rental=rentals[i],
        document_url=f"https://storage.example.com/contracts/contract_{i + 1}.pdf",
        accepted_by_lessor=i % 3 != 2,
        accepted_by_lessee=i % 2 == 0,
        status=contract_statuses[i % 3],
        created_at=now - timedelta(days=14 - i),
    )
    contracts.append(ct)
print(f"[OK]{len(contracts)} Contracts created")


# ── Messages (20) ──────────────────────────────────────────────────────────
msg_contents = [
    "Olá, tenho interesse no aluguel da máquina.",
    "Qual a disponibilidade para a próxima semana?",
    "Podemos negociar o valor da hora?",
    "A máquina está em bom estado de conservação?",
    "Preciso para plantio de soja, serve?",
    "Qual o consumo médio de combustível?",
    "Aceito a proposta, vamos fechar!",
    "Pode enviar mais fotos da máquina?",
    "O operador está incluído no valor?",
    "Quando posso retirar a máquina?",
    "Preciso de nota fiscal para o serviço.",
    "A máquina possui GPS integrado?",
    "Vou precisar por pelo menos 5 dias.",
    "Tem seguro incluso no aluguel?",
    "Qual a potência do motor?",
    "Podemos combinar entrega no local?",
    "Obrigado pela resposta rápida!",
    "Vou confirmar até amanhã.",
    "Contrato assinado, tudo certo!",
    "Excelente experiência, recomendo!",
]

messages = []
for i in range(20):
    sender = locatarios[i % len(locatarios)]
    receiver = locadores[i % len(locadores)]
    m = Messages.objects.create(
        id=uuid.uuid4(),
        sender=sender,
        receiver=receiver,
        rental=rentals[i],
        content=msg_contents[i],
        sent_at=now - timedelta(hours=200 - i * 10),
        flagged_for_moderation=(i == 15),
    )
    messages.append(m)
print(f"[OK]{len(messages)} Messages created")


# ── Reviews (20) ───────────────────────────────────────────────────────────
review_comments = [
    "Ótima máquina, funcionou perfeitamente!",
    "Equipamento em bom estado, recomendo.",
    "Atendimento excelente do locador.",
    "Máquina apresentou pequenos problemas.",
    "Muito satisfeito com o serviço.",
    "Entrega pontual e máquina limpa.",
    "Preço justo pelo serviço prestado.",
    "Operador muito competente e atencioso.",
    "Poderia melhorar a comunicação.",
    "Superou minhas expectativas!",
    "Máquina potente, deu conta do trabalho.",
    "Recomendo para quem precisa de qualidade.",
    "Bom custo-benefício.",
    "Tive uma experiência mediana.",
    "Voltarei a alugar com certeza!",
    "Maquinário de primeira linha.",
    "Processo de locação muito simples.",
    "Precisou de manutenção durante o uso.",
    "Tudo conforme combinado.",
    "Excelente parceria, profissional demais!",
]

reviews = []
for i in range(20):
    reviewer = locatarios[i % len(locatarios)]
    reviewee = locadores[i % len(locadores)]
    rv = Reviews.objects.create(
        id=uuid.uuid4(),
        rental=rentals[i],
        reviewer=reviewer,
        reviewee=reviewee,
        rating=max(1, min(5, 3 + (i % 5) - 1)),
        comment=review_comments[i],
        created_at=now - timedelta(days=10 - i),
    )
    reviews.append(rv)
print(f"[OK]{len(reviews)} Reviews created")

print("\nSeed completo! Banco populado com sucesso.")
