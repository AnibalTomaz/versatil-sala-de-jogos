# PROTÓTIPO SALA DE JOGOS VERSÁTIL v0.11

Alterações desta versão:

1. **Placar entre os mesmos oponentes**
   - cada jogador passa a ter um número de vitórias abaixo do próprio nick;
   - vitória soma 1 ponto ao vencedor;
   - empate não altera o placar;
   - ao usar `Jogar de novo`, o placar é preservado enquanto os mesmos oponentes continuam na mesma disputa;
   - funciona tanto humano × humano quanto humano × jogador virtual.

2. **Código da sala suprimido**
   - o identificador `Sala ...` não é mais mostrado abaixo de `Jogo da Velha`;
   - o código continua existindo internamente no Firebase apenas para sincronização.

3. **Cores das peças**
   - `X` azul;
   - `O` vermelho.

Preservado:
- nick automático `SHV001` a `SHV999`;
- sem edição humana do nick;
- nick ocupado é ignorado silenciosamente;
- pareamento online;
- fallback para jogador virtual;
- mensagens `Você venceu!`, `Você perdeu!` e `Empate`;
- revanche entre os mesmos oponentes.
