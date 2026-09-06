# PROTÓTIPO SALA DE JOGOS VERSÁTIL v0.10

Correção do sintoma observado no PC na v0.9: versão visual atualizada, porém o botão do Jogo da Velha não respondia.

Mudanças:
- os eventos dos botões são registrados antes da inicialização assíncrona do Firebase;
- o botão Jogo da Velha começa desabilitado enquanto o nick está sendo criado;
- o campo mostra `Gerando…`;
- somente após `Firebase online` + nick SHV válido o botão é habilitado;
- se a inicialização falhar, o botão permanece desabilitado e o campo mostra `Indisponível`;
- `app.js?v=0.10` força o navegador a buscar o JavaScript desta versão e reduz problema de cache entre HTML novo e JS antigo;
- nick continua automático, não editável, no formato SHV001–SHV999;
- o nick do acesso imediatamente anterior no mesmo aparelho não é repetido;
- nicks ocupados continuam sendo silenciosamente ignorados.

O pareamento humano da v0.8/v0.9 foi preservado para novo teste depois desta correção de inicialização.
