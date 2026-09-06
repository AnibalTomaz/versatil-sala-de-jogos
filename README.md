# PROTÓTIPO SALA DE JOGOS VERSÁTIL v0.7 — PAREAMENTO SINCRONIZADO

Correção do sintoma observado na v0.6:
- PC entrava rapidamente na partida humano × humano.
- Celular demorava para receber a partida e podia disparar o fallback para jogador virtual.

## Causa
Na v0.6, o criador da sala entrava imediatamente, mas o segundo jogador dependia de nova varredura/polling para descobrir a sala. Em celular/rede mais lenta, o timer do bot podia vencer essa corrida.

## Correção v0.7
- cada jogador passa a ouvir em tempo real sua própria entrada de fila;
- o criador da sala marca as DUAS filas como `matched` e grava `roomId`;
- o segundo aparelho recebe o `roomId` por listener em tempo real;
- o timer do bot é cancelado assim que a fila fica `matched`;
- antes de criar bot, o cliente verifica novamente se já existe pareamento humano;
- cada cliente só remove a própria fila depois de validar e entrar na sala;
- o tempo de fallback foi ampliado de ~8 para ~12 segundos para dar margem a redes móveis;
- sessão e nick continuam vinculados ao pareamento atual.

## Teste esperado
PC: `Tucano27`
Celular: `Atlas15`

Ao entrar quase simultaneamente:
- PC deve mostrar `Atlas15` — Jogador online.
- Celular deve mostrar `Tucano27` — Jogador online.
- nenhum dos dois deve trocar para jogador virtual depois que a sala humana for criada.

Protótipo isolado; não contém `data.json` e não altera o APP Versátil oficial.
