# PROTÓTIPO SALA DE JOGOS VERSÁTIL v0.13 — DEMAIS JOGOS + POKER (+18)

Esta versão expande a Sala de Jogos para:

- Jogo da Velha
- Quatro em Linha
- Batalha Naval
- Xadrez
- Poker — Texas Hold’em (+18)

## Regra visual e placar
Nos jogos de dois participantes:
- usuário/lado azul;
- adversário/lado vermelho;
- placar de vitórias abaixo de cada nick;
- o placar permanece ao usar `Jogar de novo` com os mesmos oponentes;
- empate não soma ponto.

O código interno da sala permanece oculto.

## Poker — Texas Hold’em (+18)
Antes de entrar na mesa, o usuário recebe o Aviso Legal fornecido e precisa:
1. marcar `Li e me declaro ciente!`;
2. informar a data de nascimento;
3. clicar `Entrar na mesa`;
4. ter 18 anos completos ou mais.

A data de nascimento é usada somente para validação local do acesso e não é gravada no Firebase.

O poker desta versão:
- é recreativo e gratuito;
- usa apenas fichas fictícias;
- não tem depósito, retirada, dinheiro real ou prêmio;
- mostra 4 lugares;
- tenta primeiro encontrar outro participante humano e completa os lugares restantes com jogadores virtuais;
- preserva placar entre os mesmos participantes;
- usa uma simulação Texas Hold’em com cartas fechadas, flop, turn, river e avaliação automática no showdown.

## Observação de protótipo
As regras atuais do Firebase continuam as regras amplas de prototipagem já usadas nas versões anteriores. Antes de produção, devem ser endurecidas para restringir escrita/leitura às salas e participantes corretos.
