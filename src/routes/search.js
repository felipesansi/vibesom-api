import youtube from 'youtube-search-api';

export default async function rotasPesquisa(servidor) {
  servidor.get('/pesquisa', async (requisicao, resposta) => {
    const { termo } = requisicao.query;

    if (!termo) {
      return resposta.status(400).send({ erro: 'Termo de busca vazio' });
    }

    try {
      // Busca no YouTube (sem precisar de API Key)
      const resultados = await youtube.GetListByKeyword(termo, false, 15);
      
      const musicas = resultados.items
        .filter(item => item.type === 'video') // Garante que são vídeos
        .map(item => ({
          id: item.id,
          titulo: item.title,
          artista: item.channelTitle || 'YouTube Music',
          capa: item.thumbnail.thumbnails[0].url
        }));

      return musicas;
    } catch (erro) {
      console.error('Erro na busca YouTube:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao buscar no YouTube' });
    }
  });
}