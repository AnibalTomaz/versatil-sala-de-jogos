# PROTÓTIPO SALA DE JOGOS VERSÁTIL v0.17

## Poker — replay e apostas fictícias

Foi corrigido o fluxo de `Jogar de novo` depois de vencer uma mão.

O pot não é editado diretamente, porque no poker ele é consequência das apostas. Em vez disso, agora o jogador pode:
- `Mesa / Check`, quando não há valor a pagar;
- `Pagar para ver`, quando existe uma aposta atual;
- `Aumentar`, escolhendo um valor;
- `All in`, usando todas as fichas fictícias disponíveis;
- `Desistir`.

Todas as fichas continuam sendo exclusivamente fictícias (`play money`), sem valor real, prêmio, depósito ou retirada.

Ao iniciar uma nova mão:
- as cartas são redistribuídas;
- o placar permanece;
- as fichas fictícias remanescentes permanecem;
- blinds fictícios de 10 fichas são recolocados;
- quem ficar com menos de 10 fichas recebe nova carga fictícia de 1000 para manter a simulação recreativa.

## Batalha Naval — frota nova

Cada jogador agora possui exatamente 5 embarcações, todas ocupando somente 1 casa:
- 2 caravelas;
- 2 submarinos;
- 1 caiaque.

Cada embarcação aparece sobre uma única casa do próprio tabuleiro.
Ao atacar:
- água = gota azul;
- embarcação atingida = a casa/embarcação fica vermelha;
- vence quem atingir as 5 embarcações do adversário.

Os demais jogos e o aviso +18 do Poker foram preservados.
