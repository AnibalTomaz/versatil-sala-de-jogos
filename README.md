# SALA DE JOGOS VERSÁTIL v0.23

Correção específica da Batalha Naval.

## Problema revisado
A versão anterior ainda dependia do fluxo genérico de turno do jogador virtual, que utilizava uma chamada assíncrona separada. Em partidas mais longas, isso podia deixar o estado aguardando o retorno do turno e fazer com que novos cliques não fossem registrados visualmente.

## Correção
Na Batalha Naval não existe mais nenhum temporizador de jogada.

Quando a partida é Humano × Jogador virtual:
1. o clique do humano é gravado;
2. a gota ou o acerto é registrado;
3. se a partida não terminou, o jogador virtual faz seu disparo imediatamente;
4. o turno volta ao humano;
5. tudo acontece dentro da mesma transação do Firebase.

Isso elimina o estado intermediário em que o tabuleiro poderia ficar esperando a jogada do bot.

Em Humano × Humano, o turno continua sendo passado normalmente entre os dois participantes.

Mantidos:
- 5 embarcações de uma casa para cada jogador;
- 2 caravelas, 2 submarinos e 1 caiaque;
- água = gota azul;
- acerto = vermelho;
- compatibilidade com celular;
- banners, contador da fila e demais jogos sem alteração.
