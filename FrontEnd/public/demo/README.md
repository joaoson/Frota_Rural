# Imagens de demonstração

Este diretório é servido em `/demo` pelo Vite e copiado para `dist/demo` no build.
O seed usa URLs absolutas; `Devops/dev.py` calcula a porta do frontend automaticamente.
Veja [as instruções do seed](../../../../Devops/SEED.md) para popular o banco.

## Máquinas

São 33 arquivos JPEG, distribuídos em 37 fotos de galeria para 20 anúncios. Algumas
fotos representam a mesma marca/categoria, mas outra versão do modelo cadastrado;
essa condição aparece nos anúncios e nos créditos. Não são fotografias de bens
oferecidos para locação real.

[photos.json](photos.json) registra o arquivo original, a origem no Wikimedia Commons,
autor, licença, URL da licença, tamanho e SHA-256 de cada arquivo local. A cópia
em `BackEnd/demo_seed/photos.json` define a galeria usada pelo seed. Os arquivos
são thumbnails fornecidos pelo Commons, sem retoques. Cada imagem mantém sua
licença CC BY, CC BY-SA ou CC0; a licença do código não substitui essas licenças.
[credits.html](credits.html) apresenta os créditos e as imagens no navegador.

## Perfis

Os seis retratos em `profiles/` representam adultos inteiramente fictícios, gerados
com a ferramenta integrada `image_gen`, sem fotografias de pessoas reais como referência.
Os PNGs originais foram copiados sem edição. O conjunto completo de prompts está
em [profile-prompts.json](profile-prompts.json): João, Maria, Carlos, Ana, Pedro e Fernanda.
O seed preserva qualquer foto que já esteja cadastrada, inclusive nas contas demo.

Nenhuma chamada ao gerador de imagens, Wikimedia ou Firebase é feita ao executar
o seed. A aplicação carrega as cópias locais pelo servidor do frontend.
