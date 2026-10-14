from collections.abc import Mapping
from typing import Any
from uuid import UUID

from django.db import IntegrityError, transaction
from django.db.models import QuerySet
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from common.db import enforce_constraints_now
from common.exceptions import Conflict
from users.enums import UserRole, UserStatus
from users.models import Users
from users.serializer import (
    ChangePasswordInputSerializer,
    OperatorCreateInputSerializer,
    OperatorUpdateInputSerializer,
    UserCreateInputSerializer,
    UserUpdateInputSerializer,
)

ACCOUNT_CONFLICT_MESSAGE = "E-mail ou documento já cadastrado em outra conta."


def _ensure_document_not_banned(data: Mapping[str, Any]) -> None:
    """Quem foi banido não volta pela porta da frente com o mesmo documento."""
    document = data.get("document")
    if document and Users.objects.filter(document=document, status=UserStatus.BANNED).exists():
        raise PermissionDenied(
            "Cadastro bloqueado: documento vinculado a conta banida.", code="document_banned"
        )


def _create_account(validated: Mapping[str, Any], **server_fields: Any) -> Users:
    """Cria a conta com a senha já em hash. Nunca grave `password` via serializer.save()."""
    fields = dict(validated)
    password = fields.pop("password")
    user = Users(**fields, **server_fields)
    user.set_password(password)
    try:
        user.save()
    except IntegrityError as exc:
        # O UniqueValidator cobre e-mail e documento repetidos; aqui sobra a
        # corrida entre dois cadastros simultâneos.
        raise Conflict(ACCOUNT_CONFLICT_MESSAGE) from exc
    return user


class UserService:
    @staticmethod
    def _visible(actor: Users) -> QuerySet[Users]:
        queryset = Users.objects.all()
        return queryset if actor.role == UserRole.ADMIN else queryset.filter(pk=actor.pk)

    @staticmethod
    def get(user_id: UUID, *, actor: Users) -> Users:
        try:
            return UserService._visible(actor).get(id=user_id)
        except Users.DoesNotExist as exc:
            raise NotFound("Usuário não encontrado.") from exc

    @staticmethod
    def get_by_email(email: str, *, actor: Users) -> Users:
        try:
            return UserService._visible(actor).get(email=email)
        except Users.DoesNotExist as exc:
            raise NotFound("Usuário não encontrado.") from exc

    @staticmethod
    @transaction.atomic
    def create(data: Mapping[str, Any]) -> Users:
        _ensure_document_not_banned(data)
        serializer = UserCreateInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return _create_account(serializer.validated_data, status=UserStatus.ACTIVE)

    @staticmethod
    @transaction.atomic
    def update(user_id: UUID, data: Mapping[str, Any], *, actor: Users, partial: bool = False) -> Users:
        user = UserService.get(user_id, actor=actor)
        serializer = UserUpdateInputSerializer(user, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        try:
            return serializer.save()
        except IntegrityError as exc:
            raise Conflict(ACCOUNT_CONFLICT_MESSAGE) from exc

    @staticmethod
    @transaction.atomic
    def delete(user_id: UUID, *, actor: Users) -> None:
        user = UserService.get(user_id, actor=actor)
        enforce_constraints_now()
        try:
            user.delete()
        except IntegrityError as exc:
            raise Conflict(
                "Não é possível excluir esta conta: existem registros vinculados a ela "
                "(ex.: máquinas ou locações).",
                code="has_dependents",
            ) from exc

    @staticmethod
    @transaction.atomic
    def change_password(user_id: UUID, data: Mapping[str, Any], *, actor: Users) -> None:
        if user_id != actor.pk:
            raise NotFound("Usuário não encontrado.")
        user = UserService.get(user_id, actor=actor)
        serializer = ChangePasswordInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        if not user.check_password(serializer.validated_data["current_password"]):
            raise ValidationError("Senha atual incorreta.")

        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])

    @staticmethod
    def list() -> QuerySet[Users]:
        return Users.objects.order_by("name")


class OperatorService:
    """Equipe de operadores de um empregador.

    Toda operação recebe o empregador e filtra por ele: não existe leitura ou
    escrita na equipe de outra pessoa, mesmo conhecendo o id do operador.
    """

    @staticmethod
    def _team(employer: Users) -> QuerySet[Users]:
        return Users.objects.filter(employer=employer, role=UserRole.OPERATOR)

    @staticmethod
    def get(employer: Users, operator_id: UUID) -> Users:
        try:
            return OperatorService._team(employer).get(id=operator_id)
        except Users.DoesNotExist as exc:
            raise NotFound("Operador não encontrado na sua equipe.") from exc

    @staticmethod
    @transaction.atomic
    def create(employer: Users, data: Mapping[str, Any]) -> Users:
        _ensure_document_not_banned(data)
        serializer = OperatorCreateInputSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        return _create_account(
            serializer.validated_data,
            role=UserRole.OPERATOR,
            status=UserStatus.ACTIVE,
            employer=employer,
        )

    @staticmethod
    @transaction.atomic
    def update(employer: Users, operator_id: UUID, data: Mapping[str, Any]) -> Users:
        operator = OperatorService.get(employer, operator_id)
        serializer = OperatorUpdateInputSerializer(operator, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            return serializer.save()
        except IntegrityError as exc:
            raise Conflict(ACCOUNT_CONFLICT_MESSAGE) from exc

    @staticmethod
    @transaction.atomic
    def unlink(employer: Users, operator_id: UUID) -> None:
        """Remove o vínculo sem apagar a conta: o histórico de locações continua íntegro."""
        operator = OperatorService.get(employer, operator_id)
        operator.employer = None
        operator.save(update_fields=["employer"])

    @staticmethod
    def list(employer: Users) -> QuerySet[Users]:
        return OperatorService._team(employer).order_by("name")
