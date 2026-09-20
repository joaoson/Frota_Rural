import uuid
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.models import Rentals, Reviews
from api.serializer import RentalSerializer, ReviewSerializer
from postings.models import Postings
from payments.pricing import calcular_total
from contracts.models import Contracts
from api.schemas import ContractDocumentSerializer, ContractSignatureSerializer, ErrorResponseSerializer
from contracts.serializer import ContractSerializer
from notifications.events import notify_rental_event

REVIEW_NOT_FOUND = OpenApiResponse(description='Avaliação não encontrada.')
RENTAL_NOT_FOUND = OpenApiResponse(description='Locação não encontrada.')
CONTRACT_NOT_FOUND = OpenApiResponse(description='Contrato não encontrado.')
INVALID_DATA = OpenApiResponse(description='Dados inválidos ou em conflito.')

# --- REVIEWS ---

def _reviews_queryset():
    return Reviews.objects.all().select_related("reviewer", "reviewee")


@extend_schema_view(
    get=extend_schema(
        tags=['Avaliações'],
        summary='Listar avaliações',
        description='Retorna as avaliações registradas, com filtros opcionais por avaliador, avaliado ou locação.',
        parameters=[
            OpenApiParameter('reviewee', type=str, description='ID do usuário avaliado'),
            OpenApiParameter('reviewer', type=str, description='ID do usuário que avaliou'),
            OpenApiParameter('rental', type=str, description='ID da locação'),
        ],
        responses={200: ReviewSerializer(many=True)},
    ),
    post=extend_schema(
        tags=['Avaliações'],
        summary='Criar avaliação',
        description='Registra a avaliação de uma das partes ao final de uma locação. Cada locação aceita uma avaliação por avaliador.',
        request=ReviewSerializer,
        responses={
            201: ReviewSerializer,
            400: OpenApiResponse(
                response=ErrorResponseSerializer,
                description='Dados inválidos ou avaliação já existente para esta locação.',
            ),
        },
        examples=[
            OpenApiExample(
                'Avaliação 5 estrelas',
                summary='Exemplo de uma avaliação excelente',
                value={
                    "rental": "08e8eaa6-467f-4c98-b5c0-93323829911d",
                    "reviewer": "e6a2b8e5-3d71-4a9f-b98a-f4c78d0671f2",
                    "reviewee": "029d15f3-a577-4238-9c59-42011ddcb5be",
                    "rating": 5,
                    "comment": "Trator em perfeito estado e entrega pontual!"
                },
                request_only=True
            )
        ],
    ),
)
@api_view(["GET", "POST"])
def reviews_list(request):
    if request.method == "GET":
        qs = _reviews_queryset().order_by("-created_at", "-id")
        reviewee_id = request.query_params.get("reviewee")
        if reviewee_id:
            qs = qs.filter(reviewee_id=reviewee_id)
        reviewer_id = request.query_params.get("reviewer")
        if reviewer_id:
            qs = qs.filter(reviewer_id=reviewer_id)
        rental_id = request.query_params.get("rental")
        if rental_id:
            qs = qs.filter(rental_id=rental_id)
            
        serializer = ReviewSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = ReviewSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    try:
        serializer.save()
    except IntegrityError:
        return Response(
            {"error": "Dados inválidos ou em conflito (ex.: avaliação já existe para este aluguel)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(
        tags=['Avaliações'],
        summary='Consultar avaliação',
        responses={200: ReviewSerializer, 404: REVIEW_NOT_FOUND},
    ),
    put=extend_schema(
        tags=['Avaliações'],
        summary='Substituir avaliação',
        request=ReviewSerializer,
        responses={200: ReviewSerializer, 400: INVALID_DATA, 404: REVIEW_NOT_FOUND},
    ),
    patch=extend_schema(
        tags=['Avaliações'],
        summary='Atualizar avaliação parcialmente',
        description='Útil para corrigir apenas a nota ou o comentário.',
        request=ReviewSerializer,
        responses={200: ReviewSerializer, 400: INVALID_DATA, 404: REVIEW_NOT_FOUND},
    ),
    delete=extend_schema(
        tags=['Avaliações'],
        summary='Excluir avaliação',
        responses={
            204: OpenApiResponse(description='Avaliação excluída.'),
            404: REVIEW_NOT_FOUND,
            409: OpenApiResponse(
                response=ErrorResponseSerializer,
                description='A avaliação não pode ser excluída por estar referenciada em outro registro.',
            ),
        },
    ),
)
@api_view(["GET", "PUT", "PATCH", "DELETE"])
def review_detail(request, pk):
    try:
        review = _reviews_queryset().get(pk=pk)
    except Reviews.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(ReviewSerializer(review).data, status=status.HTTP_200_OK)

    if request.method == "PUT":
        serializer = ReviewSerializer(review, data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "Dados inválidos ou em conflito."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method == "PATCH":
        serializer = ReviewSerializer(review, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {"error": "Dados inválidos ou em conflito."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(serializer.data, status=status.HTTP_200_OK)

    try:
        review.delete()
    except IntegrityError:
        return Response(
            {"error": "Não é possível excluir esta avaliação."},
            status=status.HTTP_409_CONFLICT,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)


# --- RENTALS ---

def _rentals_for_user(user):
    return Rentals.objects.filter(Q(lessee=user) | Q(postings__machinery__owner=user))

@extend_schema_view(
    get=extend_schema(
        tags=['Locações'],
        summary='Listar locações',
        description='Retorna as locações (reservas), com filtros opcionais por locatário ou por locador dono do maquinário.',
        parameters=[
            OpenApiParameter('lessee', type=str, description='Filtrar pelo ID do locatário'),
            OpenApiParameter('lessor', type=str, description='Filtrar pelo ID do locador'),
        ],
        responses={200: RentalSerializer(many=True)},
    ),
    post=extend_schema(
        tags=['Locações'],
        summary='Criar locação (reserva)',
        description=(
            'Cria a reserva de um anúncio e, junto com ela, o contrato correspondente com status '
            '`pending_signatures`. Não é necessário criar o contrato em uma chamada separada.'
        ),
        request=RentalSerializer,
        responses={201: RentalSerializer, 400: INVALID_DATA},
        examples=[
            OpenApiExample(
                'Nova Reserva de Trator',
                summary='Exemplo de criação de uma locação',
                value={
                    "postings": "f5e1c4a0-56d1-4b7c-9a1b-c1d4e6f8a9b2",
                    "lessee": "e6a2b8e5-3d71-4a9f-b98a-f4c78d0671f2",
                    "start_date": "2026-09-10T08:00:00Z",
                    "end_date": "2026-09-15T18:00:00Z",
                    "total_price": "8500.00"
                },
                request_only=True
            )
        ],
    ),
)
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def rentals_list(request):
    if request.method == "GET":
        qs = _rentals_for_user(request.user).select_related("lessee", "postings__machinery__owner", "contracts")
        posting_id = request.query_params.get("postings")
        if posting_id:
            qs = qs.filter(postings_id=posting_id)
        lessee_id = request.query_params.get("lessee")
        if lessee_id:
            qs = qs.filter(lessee_id=lessee_id)
        lessor_id = request.query_params.get("lessor")
        if lessor_id:
            qs = qs.filter(postings__machinery__owner_id=lessor_id)
        serializer = RentalSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = RentalSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    if serializer.validated_data['lessee'].pk != request.user.pk:
        return Response({'lessee': 'Você só pode criar reservas em seu próprio nome.'}, status=403)
    if serializer.validated_data.get('status', 'pending') != 'pending':
        return Response({'status': 'Novas reservas precisam aguardar o pagamento.'}, status=400)
    if any(field in serializer.validated_data for field in ('initial_hour_meter', 'final_hour_meter')):
        return Response({'detail': 'Leituras de horímetro não fazem parte de uma nova reserva.'}, status=400)

    with transaction.atomic():
        posting = Postings.objects.select_for_update().select_related('machinery').get(pk=serializer.validated_data['postings'].pk)
        serializer.validated_data['postings'] = posting
        # Recheck after locking: a recurrence or another rental may have won
        # the same dates since the initial serializer validation.
        serializer.validate(serializer.validated_data)
        total = calcular_total(Rentals(**serializer.validated_data))
        if not total.is_finite() or total <= 0 or total > Decimal('99999999.99'):
            return Response({'detail': 'O anúncio precisa ter um preço válido para a reserva.'}, status=400)
        rental = serializer.save(total_price=total, status='pending')
        contract = Contracts.objects.create(
            id=uuid.uuid4(), rental=rental, accepted_by_lessor=False,
            accepted_by_lessee=False, status="pending_signatures", created_at=timezone.now(),
        )
        notify_rental_event(rental, 'rental_created', event_key=f'rental:{rental.pk}:created', contract=contract)
    
    return Response(RentalSerializer(rental).data, status=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(
        tags=['Locações'],
        summary='Consultar locação',
        responses={200: RentalSerializer, 404: RENTAL_NOT_FOUND},
    ),
    put=extend_schema(
        tags=['Locações'],
        summary='Substituir locação',
        request=RentalSerializer,
        responses={200: RentalSerializer, 400: INVALID_DATA, 404: RENTAL_NOT_FOUND},
    ),
    patch=extend_schema(
        tags=['Locações'],
        summary='Atualizar locação parcialmente',
        description=(
            'O locatário pode ajustar datas e operador antes do pagamento. As partes podem cancelar '
            'uma reserva pendente sem pagamento; o locador pode registrar leituras e concluir uma '
            'locação confirmada após o término. Pagamento e assinatura controlam os estados active e signed.'
        ),
        request=RentalSerializer,
        responses={200: RentalSerializer, 400: INVALID_DATA, 404: RENTAL_NOT_FOUND},
    ),
    delete=extend_schema(
        tags=['Locações'],
        summary='Excluir locação',
        responses={409: OpenApiResponse(description='Use o cancelamento para preservar o histórico.'), 404: RENTAL_NOT_FOUND},
    ),
)
@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def rental_detail(request, pk):
    try:
        rental = _rentals_for_user(request.user).select_related("contracts", "postings__machinery").get(pk=pk)
    except Rentals.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(RentalSerializer(rental).data, status=status.HTTP_200_OK)

    if request.method == 'DELETE':
        return Response({'detail': 'Cancele a reserva para preservar seu histórico e contrato.'}, status=409)

    with transaction.atomic():
        posting = Postings.objects.select_for_update().select_related('machinery').get(pk=rental.postings_id)
        rental = _rentals_for_user(request.user).select_for_update().get(pk=pk)
        rental.postings = posting
        for field, current in [('lessee', rental.lessee_id), ('postings', rental.postings_id)]:
            if field in request.data and str(request.data[field]) != str(current):
                return Response({field: 'Este vínculo não pode ser alterado após a criação.'}, status=400)
        if 'total_price' in request.data:
            return Response({'total_price': 'O valor é calculado pelo servidor.'}, status=400)

        next_status = request.data.get('status', rental.status)
        if next_status != rental.status:
            cancellable = rental.status == 'pending' and not rental.payments.exclude(status='expired').exists()
            completable = (request.user.pk == posting.machinery.owner_id
                           and rental.status in ('active', 'signed') and rental.end_date <= timezone.now())
            if not ((next_status == 'cancelled' and cancellable) or (next_status == 'completed' and completable)):
                return Response({'status': 'Esta alteração exige o fluxo de pagamento ou assinatura correspondente.'}, status=409)

        if any(field in request.data for field in ('start_date', 'end_date', 'operator')):
            if request.user.pk != rental.lessee_id:
                return Response({'detail': 'Somente o locatário pode alterar os dados de uma reserva pendente.'}, status=403)
            if rental.status != 'pending' or rental.payments.exclude(status='expired').exists():
                return Response({'detail': 'Uma reserva em pagamento ou confirmada não pode ter seus dados alterados.'}, status=409)
        if any(field in request.data for field in ('initial_hour_meter', 'final_hour_meter')):
            if request.user.pk != posting.machinery.owner_id or rental.status not in ('active', 'signed'):
                return Response({'detail': 'Somente o locador pode registrar leituras de uma reserva confirmada.'}, status=403)

        serializer = RentalSerializer(rental, data=request.data, partial=request.method == 'PATCH')
        serializer.is_valid(raise_exception=True)
        previous_status = rental.status
        changed = any(getattr(rental, field) != value for field, value in serializer.validated_data.items())
        save_fields = {'updated_at': timezone.now()}
        if any(field in serializer.validated_data for field in ('start_date', 'end_date')):
            candidate = Rentals(postings=posting,
                                start_date=serializer.validated_data.get('start_date', rental.start_date),
                                end_date=serializer.validated_data.get('end_date', rental.end_date))
            total = calcular_total(candidate)
            if not total.is_finite() or total <= 0 or total > Decimal('99999999.99'):
                return Response({'detail': 'O anúncio precisa ter um preço válido para a reserva.'}, status=400)
            save_fields['total_price'] = total
            changed = changed or rental.total_price != total
        serializer.save(**save_fields)
        if changed:
            event = 'rental_updated'
            if rental.status != previous_status and rental.status in ('cancelled', 'completed'):
                event = f'rental_{rental.status}'
            event_key = f'rental:{rental.pk}:{event}'
            if event == 'rental_updated':
                event_key += f':{uuid.uuid4()}'
            notify_rental_event(rental, event, event_key=event_key)
        return Response(serializer.data, status=status.HTTP_200_OK)
# --- CONTRACTS ---

@extend_schema(
    tags=['Contratos'],
    summary="Listar contratos",
    description="Retorna todos os contratos gerados no sistema, já com locatário, anúncio e maquinário resolvidos.",
    responses={200: ContractSerializer(many=True)}
)
@api_view(["GET"])
def contracts_list(request):
    qs = Contracts.objects.all().select_related("rental__lessee", "rental__postings__machinery__owner")
    serializer = ContractSerializer(qs, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@extend_schema(
    tags=['Contratos'],
    summary="Visualizar documento do contrato",
    description=(
        "Retorna os dados já agregados e formatados (valores em pt-BR, datas e prazos calculados) "
        "prontos para renderizar o PDF do contrato de locação.\n\n"
        "O identificador aceito é o do contrato **ou** o da locação associada."
    ),
    responses={
        200: ContractDocumentSerializer,
        404: CONTRACT_NOT_FOUND,
    }
)
@api_view(["GET"])
def contract_detail(request, pk):
    try:
        contract = Contracts.objects.filter(Q(pk=pk) | Q(rental_id=pk)).select_related("rental__lessee", "rental__postings__machinery__owner").first()
        if not contract:
            return Response(status=status.HTTP_404_NOT_FOUND)
    except (Contracts.DoesNotExist, ValueError):
        return Response(status=status.HTTP_404_NOT_FOUND)

    rental = contract.rental
    posting = rental.postings
    machine = posting.machinery
    lessor = machine.owner
    lessee = rental.lessee

    total_price_formatted = "{:,.2f}".format(rental.total_price).replace(",", "X").replace(".", ",").replace("X", ".") if rental.total_price else "0,00"
    days = max(1, (rental.end_date.date() - rental.start_date.date()).days + 1) if rental.start_date and rental.end_date else 1

    contrato_data = {
        "contrato": {
            "numero": f"#CTR-{str(rental.id)[:4].upper()}",
            "data_geracao": contract.created_at.strftime("%d/%m/%Y") if contract.created_at else "01/06/2026",
            "data_inicio": rental.start_date.strftime("%Y-%m-%d") if rental.start_date else "",
            "data_fim": rental.end_date.strftime("%Y-%m-%d") if rental.end_date else "",
            "prazo_dias": days,
            "valor_unitario": "{:,.2f}".format(posting.hourly_rate).replace(",", "X").replace(".", ",").replace("X", ".") if posting.hourly_rate else "180,00",
            "estimativa_horas": 8 * days,
            "valor_total_estimado": total_price_formatted,
        },
        "operacao": {
            "codigo": f"OP-{str(rental.id)[4:9].upper()}",
        },
        "locador": {
            "razao_social": lessor.name,
            "tipo_documento": "CNPJ" if len(lessor.document) > 11 else "CPF",
            "documento": lessor.document,
            "endereco_completo": lessor.address,
            "representante_nome": lessor.name,
            "representante_cpf": lessor.document if len(lessor.document) <= 11 else "123.456.789-00",
            "representante_estado_civil": "Casado",
            "endereco_equipamento": posting.location_address or lessor.address,
        },
        "locatario": {
            "razao_social": lessee.name,
            "tipo_documento": "CNPJ" if len(lessee.document) > 11 else "CPF",
            "documento": lessee.document,
            "endereco_completo": lessee.address,
            "representante_nome": lessee.name,
            "representante_cpf": lessee.document if len(lessee.document) <= 11 else "987.654.321-00",
            "representante_estado_civil": "Solteiro",
            "municipio": "Castro",
            "uf": "PR",
            "local_servico": lessee.address,
        },
        "equipamento": {
            "tipo": machine.usage_purpose or "Trator agrícola",
            "marca": machine.brand or "John Deere",
            "modelo": machine.model or "6135J",
            "ano": machine.year or 2021,
            "renagro": machine.renagro_number or "RNG-123456",
            "valor_estimado": "350.000,00",
        },
        "anuncio": {
            "tipo_servico": "Locação de Maquinário",
            "finalidade_uso": machine.usage_purpose or "Uso geral",
        },
        "assinatura": {
            "data_locador": contract.created_at.strftime("%d/%m/%Y às 14:00") if contract.accepted_by_lessor else "—",
            "data_locatario": contract.created_at.strftime("%d/%m/%Y às 10:00") if contract.accepted_by_lessee else "—",
        },
    }

    return Response(contrato_data, status=status.HTTP_200_OK)


@extend_schema(
    tags=['Contratos'],
    summary="Assinar contrato digitalmente",
    description=(
        "Registra o aceite do locador ou do locatário. Enquanto só uma parte assinou, o contrato "
        "fica em `lessor_signed` ou `lessee_signed`; quando ambas assinam, contrato e locação "
        "passam a `signed`.\n\n"
        "O identificador aceito é o do contrato **ou** o da locação associada."
    ),
    request=ContractSignatureSerializer,
    responses={
        200: ContractSerializer,
        404: CONTRACT_NOT_FOUND,
    },
    examples=[
        OpenApiExample(
            'Assinatura pelo Locatário',
            summary='Exemplo de assinatura da parte que vai alugar',
            value={
                "role": "locatario",
                "name": "João da Silva - CPF 123.456.789-00"
            },
            request_only=True
        ),
        OpenApiExample(
            'Assinatura pelo Locador',
            summary='Exemplo de assinatura do dono da máquina',
            value={
                "role": "locador",
                "name": "Tratores & Cia - CNPJ 123.456.789/0001-99"
            },
            request_only=True
        )
    ]
)
@api_view(["POST"])
def sign_contract(request, pk):
    try:
        contract = Contracts.objects.filter(Q(pk=pk) | Q(rental_id=pk)).first()
        if not contract:
            return Response(status=status.HTTP_404_NOT_FOUND)
    except (Contracts.DoesNotExist, ValueError):
        return Response(status=status.HTTP_404_NOT_FOUND)

    role = request.data.get("role")
    name = request.data.get("name", "")

    if role == "locatario":
        contract.accepted_by_lessee = True
        if contract.accepted_by_lessor:
            contract.status = "signed"
            contract.rental.status = "signed"
        else:
            contract.status = "lessee_signed"
            contract.rental.status = "active"
    else:
        contract.accepted_by_lessor = True
        if contract.accepted_by_lessee:
            contract.status = "signed"
            contract.rental.status = "signed"
        else:
            contract.status = "lessor_signed"
            contract.rental.status = "signed"

    contract.rental.save()
    contract.save()

    return Response(ContractSerializer(contract).data, status=status.HTTP_200_OK)


# Keep compatibility with previous new backend view naming:
get_contracts = contracts_list
