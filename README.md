# SALA DE JOGOS VERSÁTIL v0.20 — MODELO DE INTEGRAÇÃO

Esta versão apresenta o modelo solicitado antes da incorporação ao APP.

## Sala de Jogos
- usa o ícone fornecido pelo usuário;
- cabeçalho reorganizado;
- banner no topo sem criar espaço vazio quando nenhum banner existir;
- escolha randômica por acesso, evitando repetir a imagem anterior quando houver mais de uma.

## Banners
Medida recomendada: **1200 × 340 px**.
São previstos **6 banners**.

No modelo Admin desta versão há seis posições de upload e remoção. Para permitir teste imediato sem mexer ainda no APP oficial, as imagens ficam no Local Storage deste navegador. Na integração definitiva, os mesmos seis campos serão ligados ao sistema de publicação do Admin.

## Durante os jogos
- o banner aparece também no cabeçalho da partida;
- começa com o banner selecionado no acesso;
- troca automaticamente a cada **60 segundos**;
- somente banners efetivamente carregados participam da rotação.

## Fila de adversário
- contador regressivo aparece dentro do círculo de busca;
- começa em 15 segundos, correspondente ao tempo atual de procura antes do jogador virtual;
- não é limite de duração da partida; serve somente para mostrar a espera da fila.

## Celular
O cabeçalho, banner, jogos, fila e controles possuem regras responsivas específicas para telas menores.
