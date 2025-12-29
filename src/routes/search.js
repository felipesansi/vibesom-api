import axios from 'axios';

// Lista de instâncias públicas do Piped (fallback caso uma caia)
const INSTANCIAS_PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.rekindle.ph',
  'https://api.piped.privacydev.net'
];

export default async function rotasPesquisa(servidor) {
  servidor.get('/pesquisa', async (requisicao, resposta) => {
    const { termo } = requisicao.query;

    if (!termo) {
      return resposta.status(400).send({ erro: 'Termo de busca vazio' });
    }

    // Tenta as instâncias uma por uma
    for (const instancia of INSTANCIAS_PIPED) {
      try {
        const { data } = await axios.get(`${instancia}/search`, {
          params: { q: termo, filter: 'music_videos' },
          timeout: 5000
        });

        if (!data || !data.streams) continue;

        const musicas = data.streams
          .filter(item => item.type === 'stream')
          .map(item => ({
            id: item.url.split('v=')[1],
            titulo: item.title,
            artista: item.uploaderName,
            capa: item.thumbnail,
            duracao: item.duration,
            views: item.views
          }));

        return musicas;
      } catch (erro) {
        console.error(`Instância ${instancia} falhou na busca.`);
        continue;
      }
    }

    return resposta.status(503).send({ 
      erro: 'Serviço temporariamente indisponível',
      detalhes: 'Todas as instâncias de busca falharam. Tente novamente em instantes.'
    });
  });
}
