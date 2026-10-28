# Códigos de assinatura — `ContractSignatureOtps`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/contracts/models.py:164` — dentro de `ContractSignatureOtps`, imediatamente antes de `class Meta`, inserir:

```python
categoria_autoria = models.ForeignKey(
    "autoria.Genero", on_delete=models.PROTECT,
    null=True, blank=True, related_name="+",
)
```

```bash
# Terminal em BackEnd/
source .venv/bin/activate
source ../Devops/autoria.env.sh
python manage.py verify_database
# Esperado: 127.0.0.1:5442 / frota_rural_autoria
python manage.py makemigrations contracts
python manage.py migrate --plan
python manage.py migrate
```

## 2 Origem da seleção

Concluir o [guia de usuários](../04_usuarios_pelo_fluxo_existente.md). Selecionar uma opção em Minha Conta e salvar antes da operação abaixo. Neste exemplo de ensaio, o registro novo copia o ID selecionado pelo usuário; adaptar o significado da categoria ao enunciado.

## 3 Alteração no service real

`BackEnd/contracts/services.py:221` — procurar `def request_otp(`

Dentro de `ContractSignatureOtps.objects.create`, entre `signer=party,` e `revision=revision,`, inserir:
```python
categoria_autoria_id=party.categoria_autoria_id,
```
Manter geração/hash do código, envio de e-mail, validade e rollback se envio falhar. Não retornar código/hash.

## 4 Saída persistida

Não há GET de OTP persistido na API atual. Para leitura autenticada mínima, acrescentar a `ContractService.get_document`, após obter `contract`:

```python
otp = contract.signature_otps.filter(signer=actor).select_related("categoria_autoria").order_by("-created_at").first()
```
Confirmar o `related_name` do modelo antes de usar essa expressão; também pode usar `ContractSignatureOtps.objects.filter(contract=contract, signer=actor)` com import local. No retorno, acrescentar:
```python
"otp_categoria_nome": otp.categoria_autoria.Genero if otp and otp.categoria_autoria_id else None,
```
Declarar `otp_categoria_nome = serializers.CharField(allow_null=True)` em `ContractDocumentOutputSerializer`. A leitura fica limitada ao signatário autenticado.

## 5 Frontend e comprovação

Ampliar `ContratoData` com `otp_categoria_nome?: string | null`; exibir na seção de solicitação de código de `pages/contracts/Contrato.tsx`. Após solicitar OTP, refazer a consulta do documento e usar o campo persistido. O ambiente de ensaio tem OTP desativado e e-mail sem credenciais: esse caso exige configurar o envio ou testar o service com mock de e-mail, sem remover a autenticação.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
