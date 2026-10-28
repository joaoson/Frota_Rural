"""Utilitários de banco compartilhados pelos services."""

from django.db import connection


def enforce_constraints_now() -> None:
    """Faz as constraints da transação atual serem checadas a cada comando.

    O Django cria as FKs no Postgres como `DEFERRABLE INITIALLY DEFERRED`: dentro
    de um `transaction.atomic`, apagar um registro ainda referenciado só estoura
    no COMMIT, ao sair do bloco atômico, longe do `except IntegrityError` que
    traduziria o erro para 409. Chamado antes da escrita, o erro aparece na
    linha que o causou.
    """
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
