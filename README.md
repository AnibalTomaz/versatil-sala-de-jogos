# SALA DE JOGOS VERSÁTIL v0.26

Ajuste na exibição dos banners.

## Transição
Os banners agora usam uma transição contínua e suave em crossfade:

- o banner atual reduz a opacidade gradualmente (fade out);
- ao mesmo tempo, o próximo banner aumenta a opacidade (fade in);
- duração aproximada da transição: 1,2 segundo;
- não há corte brusco entre as imagens;
- a rotação durante os jogos continua acontecendo a cada 60 segundos;
- no primeiro carregamento do acesso, o banner aparece imediatamente;
- somente banners efetivamente carregados participam da rotação.

A solução usa duas camadas sobrepostas no mesmo espaço do banner, permitindo que uma imagem desapareça enquanto a próxima surge.

Mantidos:
- 6 banners;
- área Admin de modelo;
- compatibilidade com celular;
- Sala de Jogos e páginas dos jogos;
- Batalha Naval sem temporizador;
- estatísticas/telemetria.
