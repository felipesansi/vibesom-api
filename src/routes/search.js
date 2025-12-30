import axios from 'axios';

// Lista de instâncias com melhor uptime para busca em 2025
const INSTANCIAS_PIPED = [
  'https://api-piped.mha.fi',
  'https://pipedapi.lunar.icu',
  'https://pipedapi.oxit.uk',
  'https://pipedapi.astartes.nl'
];

export default async function rotasPesquisa(servidor) {
  servidor.get('/pesquisa', async (requisicao, resposta) => {
    const { termo } = requisicao.query;

    if (!termo) {
      return resposta.status(400).send({ erro: 'Termo de busca vazio' });
    }

    for (const instancia of INSTANCIAS_PIPED) {
      try {
        const { data } = await axios.get(`${instancia}/search`, {
          params: { q: termo, filter: 'music_videos' },
          timeout: 4000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
          }
        });

        // O Piped retorna os resultados no campo 'items' ou 'streams' dependendo da versão
        const resultados = data.items || data.streams;

        if (!resultados || resultados.length === 0) continue;

        const musicas = resultados
          .filter(item => item.type === 'stream')
          .map(item => {
            // Extração segura do ID do vídeo
            const idVideo = item.url ? item.url.split('v=')[1] : item.id;
            
            return {
              id: idVideo,
              titulo: item.title,
              artista: item.uploaderName,
              capa: item.thumbnail,
              duracao: item.duration,
              views: item.views
            };
          });

        // IMPORTANTE: Enviar a resposta corretamente
        return resposta.status(200).send(musicas);

      } catch (erro) {
        console.error(`[BUSCA] Falha na instância ${instancia}: ${erro.message}`);
        continue;
      }
    }

    return resposta.status(503).send({ 
      erro: 'Serviço de busca indisponível',
      ajuda: 'As instâncias do Piped estão sobrecarregadas. Tente novamente.'
    });
  });
}