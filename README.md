# PROTÓTIPO SALA DE JOGOS VERSÁTIL v0.9 — NICK SHV AUTOMÁTICO

Alteração solicitada:

- o usuário não pode mais escrever ou editar o próprio nick;
- não existe botão para escolher/alterar nick;
- o sistema gera automaticamente um nick no formato `SHV001`;
- `SHV` é sempre fixo;
- somente os três números finais são randômicos (`001` a `999`);
- a cada novo acesso/carregamento é atribuído um novo nick;
- nicks já reservados por outro usuário são simplesmente ignorados e nunca são apresentados como opção;
- não há mensagem dizendo que determinado nick já está em uso;
- a reserva é feita atomicamente no Firebase para impedir duplicidade simultânea;
- a reserva é removida na desconexão.

Exemplo:
`SHV037`
`SHV412`
`SHV908`

O pareamento humano e o fallback para jogador virtual da v0.8 foram preservados.

Não contém `data.json` e não altera o APP Versátil oficial.
