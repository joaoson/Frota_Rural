# Fotos de anúncios — `PostingsPhotos`

Base: [catálogo](../01_api_services_e_rotas.md) e [seletor](../02_frontend_repository_store_componente.md). Linhas do código em 28/10/2026; os nomes dos métodos são as âncoras estáveis.

## 1 Modelo e migration

`BackEnd/postings/models.py:39` — dentro de `PostingsPhotos`, imediatamente antes de `class Meta`, inserir:

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
python manage.py makemigrations postings
python manage.py migrate --plan
python manage.py migrate
```

## 2 Origem da seleção

Concluir o [guia de usuários](../04_usuarios_pelo_fluxo_existente.md). Selecionar uma opção em Minha Conta e salvar antes da operação abaixo. Neste exemplo de ensaio, o registro novo copia o ID selecionado pelo usuário; adaptar o significado da categoria ao enunciado.

## 3 Alteração no service real

`BackEnd/postings/services.py:174` — procurar `def _save_photo(`

Dentro de `PostingsPhotos.objects.create`, entre `postings=posting,` e `image_url=image_path,`, inserir:
```python
categoria_autoria_id=posting.machinery.owner.categoria_autoria_id,
```
O método `PostingPhotoService.upload` continua validando o dono, enviando a imagem e chamando `_save_photo`. Nenhuma alteração na assinatura do upload é necessária para copiar a seleção salva no perfil.

## 4 Saída persistida

`BackEnd/postings/serializer.py:255` — procurar `class PostingPhotoUploadOutputSerializer`. Entre a abertura da classe e `class Meta`, acrescentar:

```python
categoria_nome = serializers.CharField(
    source="categoria_autoria.Genero", read_only=True, allow_null=True, default=None,
)
```
Em `PostingPhotoUploadOutputSerializer.Meta.fields`, acrescentar ao final da lista:

```python
"categoria_autoria",
"categoria_nome",
```

Na leitura após F5, `PostingDetailOutputSerializer.get_photos` monta dicionários manualmente. Dentro do dicionário de cada `photo`, após `"is_primary"`, inserir:
```python
"categoria_autoria": str(photo.categoria_autoria_id) if photo.categoria_autoria_id else None,
"categoria_nome": photo.categoria_autoria.Genero if photo.categoria_autoria_id else None,
```
Declarar UUID nullable e CharField nullable também em `PostingPhotoUrlSerializer`.

## 5 Frontend e comprovação

Ampliar `postingPhotoApiSchema`, `uploadedPhotoApiSchema`, os tipos `PostingPhoto`/`UploadedPhoto` e os dois mapeamentos de foto em `postingMapper.ts`. Na galeria do anúncio, exibir `photo.categoriaNome` junto à imagem. A resposta do upload sozinha não comprova a leitura posterior; recarregar o detalhe. Upload depende do armazenamento de imagens configurado.

Executar a operação original, conferir a FK da tabela alvo no DBeaver e recarregar a consulta. Linhas antigas continuam com FK nula; não refazer pagamentos/assinaturas para preencher histórico.
