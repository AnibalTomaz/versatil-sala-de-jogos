# PROTÓTIPO SALA DE JOGOS VERSÁTIL v0.5 — ONLINE

Protótipo isolado; não altera o app oficial e não inclui data.json.

Funciona com Firebase Authentication anônimo + Realtime Database. O Jogo da Velha tenta parear dois usuários reais e, sem adversário, insere um jogador virtual após cerca de 8 segundos.

## Teste recomendado
Hospede esta pasta em uma URL HTTPS de teste (por exemplo, GitHub Pages separado). Abra a mesma URL em dois aparelhos diferentes, use nicks diferentes e clique em Jogo da Velha nos dois.

## Importante
Abrir index.html diretamente por file:// pode bloquear módulos ES. Para teste local use um servidor HTTP, por exemplo: python -m http.server 8080

## Próximo passo
Validar o Jogo da Velha online em dois dispositivos. Depois generalizar a infraestrutura para Quatro em Linha, Batalha Naval e Xadrez. Poker fica por último e exige lógica mais autoritativa e cartas privadas.
