# PROTÓTIPO SALA DE JOGOS VERSÁTIL v0.18

Correções desta versão:

1. Batalha Naval
- removida a espera artificial do jogador virtual na Batalha Naval;
- nenhum cronômetro ou limite de tempo;
- tiro do bot escolhe sempre uma casa ainda não atacada;
- proteção contra repetição/posição inválida que poderia interromper a sequência;
- 5 embarcações de uma casa continuam mantidas.

2. Poker — data de nascimento
- entrada no formato DD/MM/AAAA;
- aceita no máximo 8 algarismos;
- ano fica obrigatoriamente limitado a quatro dígitos;
- validação de data real e de 18 anos completos permanece local.

3. Poker — mesa e ações
- mesa reorganizada para não sobrepor controles;
- as quatro posições continuam visíveis;
- controles de aposta foram retirados do centro da mesa e colocados abaixo dela;
- botão de progressão da mão fica separado, grande e visível: ABRIR FLOP, ABRIR TURN, ABRIR RIVER e MOSTRAR RESULTADO;
- pot e cartas comunitárias permanecem no centro.

4. Celular
- layout específico para telas até 620 px e refinamento até 390 px;
- assentos, cartas e mesa reduzem proporcionalmente;
- ações viram grade de duas colunas;
- botão da etapa permanece em largura total;
- Batalha Naval mantém toque direto.
