# Assinaturas — `ContractSignatures`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/contracts/models.py:114` — dentro de `ContractSignatures`, imediatamente antes de `class Meta`, inserir:

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

`BackEnd/contracts/signature_evidence.py:130` — procurar `def record_signature(`

Dentro de `ContractSignatures.objects.create`, entre `signer=signer,` e `signer_name=signer_name,`, inserir:
```python
categoria_autoria_id=signer.categoria_autoria_id if signer else None,
```
A FK é metadado auxiliar do exercício, fora da impressão digital atual. Se o enunciado exigir que integre a evidência assinada, também será necessário versionar a canonicalização/verificação; este trecho sozinho não faz isso. Não atualizar registros de assinatura.

## 4 Saída persistida

`BackEnd/contracts/serializer.py:79` — procurar `class ContractSignatureOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `ContractSignatureOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

`ContractService.get_evidence` já retorna `contract.signatures.all()` serializadas por `ContractEvidenceOutputSerializer.assinaturas`. Este é o caminho para exibir a FK efetivamente gravada.

## 5 Frontend e comprovação

Ampliar `signatureEvidenceApiSchema`, `SignatureEvidence` e seu mapper em `features/contracts/api/contractMapper.ts`. Em `pages/contracts/Contrato.tsx`, no painel de evidências, exibir `categoriaNome` de cada assinatura recebida por `useContractEvidence`. Não pegar o gênero atual do perfil para exibir o histórico.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
