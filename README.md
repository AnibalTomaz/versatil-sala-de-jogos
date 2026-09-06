# PROTÓTIPO SALA DE JOGOS VERSÁTIL v0.12

Revisão dos sintomas observados na v0.11.

## 1. `Jogar de novo` — corrigido para um clique por jogador
A causa foi identificada: depois do primeiro clique, o voto de revanche atualizava o Firebase,
mas a atualização da sala ainda continha o resultado da partida. O `render()` reabria o modal,
dando a impressão de que era necessário clicar novamente.

Agora:
- cada jogador humano clica `Jogar de novo` apenas UMA vez;
- depois do clique, o modal permanece fechado;
- aparece `Aguardando o adversário aceitar jogar de novo…`;
- quando o segundo jogador clicar uma vez, a nova rodada começa automaticamente nos dois aparelhos;
- o placar é preservado;
- contra jogador virtual, a revanche continua imediata com um único clique.

## 2. Cores no PC — cache e renderização corrigidos
A v0.11 atualizava o `app.js`, mas o `styles.css` ainda podia ser reutilizado do cache pelo navegador do PC.

Agora:
- `styles.css?v=0.12`;
- `app.js?v=0.12`;
- instruções de no-cache na página;
- X azul e O vermelho também são aplicados diretamente pelo JavaScript;
- regras CSS usam prioridade para manter as cores inclusive em casas desabilitadas.

Cores:
- X = azul `#1565c0`
- O = vermelho `#d32f2f`

## 3. Revisão preservada
- placar abaixo de cada nick;
- vitória soma 1;
- empate não altera placar;
- código da sala continua oculto;
- nick automático SHV001–SHV999;
- sem edição humana do nick;
- pareamento humano e jogador virtual preservados.
