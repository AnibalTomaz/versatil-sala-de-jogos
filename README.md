# PROTÓTIPO SALA DE JOGOS VERSÁTIL v0.6 — FILA/SESSÃO CORRIGIDA

Protótipo isolado. Não altera o APP SERVIÇOS VERSÁTIL oficial e não inclui `data.json`.

## Correção principal da v0.6
A v0.5 conseguiu parear dois aparelhos pela internet, porém em um teste o nick escolhido no celular (`Atlas15`) não correspondeu ao nick exibido no PC (`Nuvem95`).

A v0.6 corrige isso com uma identidade de sessão de matchmaking:

- cada entrada no Jogo da Velha recebe um `sessionId` novo;
- existe somente uma entrada de fila por usuário;
- a entrada antiga do mesmo usuário é substituída;
- entradas de fila vencidas são removidas;
- entradas sem presença online são descartadas;
- antes do pareamento o adversário é reconfirmado no Firebase;
- a sala é identificada pelas sessões atuais, e não apenas pelo UID;
- uma sala antiga não pode ser reutilizada por uma sessão nova;
- o cliente só aceita uma sala que contenha seu UID **e o sessionId atual**;
- o nick gravado na sala é o nick da entrada de fila que efetivamente foi pareada;
- antes de criar um jogador virtual existe uma última verificação de adversário humano válido.

## O que testar
1. Atualize os quatro arquivos do repositório `versatil-sala-de-jogos`.
2. Aguarde o GitHub Pages republicar.
3. Abra PC e celular.
4. No PC use, por exemplo, `Tucano27`.
5. No celular use `Atlas15`.
6. Entre no Jogo da Velha nos dois quase ao mesmo tempo.
7. No PC deve aparecer `Atlas15` + `Jogador online`.
8. No celular deve aparecer `Tucano27` + `Jogador online`.

## Mantido
- Firebase Authentication anônimo.
- Realtime Database.
- fallback para jogador virtual.
- `Você perdeu!`.
- `Jogar de novo`.
- `Voltar à Sala de Jogos`.
- nenhuma alteração no app oficial.
