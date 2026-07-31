import axios from 'axios';

export default async function rotasMixcloud(servidor) {
  
  // BUSCA NO MIXCLOUD
  servidor.get('/mixcloud/search/:consulta', {
    schema: {
      description: 'Busca específica de músicas no Mixcloud',
      tags: ['Mixcloud', 'Busca'],
      params: {
        type: 'object',
        required: ['consulta'],
        properties: {
          consulta: {
            type: 'string',
            description: 'Termo de busca (música, artista ou set)'
          }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', example: 'Mixcloud' },
              id: { type: 'string', description: 'ID da música/set' },
              titulo: { type: 'string', description: 'Título da música/set' },
              artista: { type: 'string', description: 'Nome do artista' },
              capa: { type: 'string', description: 'URL da capa' },
              duracao: { type: 'number', description: 'Duração em segundos' },
              streamUrl: { type: 'string', description: 'URL para streaming' }
            }
          }
        },
        404: {
          type: 'object',
          properties: {
            erro: { type: 'string' }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { consulta } = requisicao.params;
    
    try {
      const { data } = await axios.get('https://api.mixcloud.com/search/', {
        params: {
          q: consulta,
          type: 'cloudcast', // Busca sets/músicas
          limit: 30
        },
        timeout: 5000
      });

      if (!data.data || data.data.length === 0) {
        return resposta.status(404).send({ erro: 'Nada encontrado no Mixcloud' });
      }

      const musicas = data.data.map(track => ({
        id: track.key, // Ex: /spartacus/party-time/
        titulo: track.name,
        artista: track.user?.name,
        capa: track.pictures?.large || track.pictures?.medium,
        duracao: track.audio_length, // Em segundos
        plays: track.play_count,
        genero: 'Mix/Set',
        // Mixcloud requer um player web, mas podemos tentar extrair o stream m4a se disponível
        // ou redirecionar para uma webview. Por enquanto vamos retornar o link web.
        streamUrl: track.url,
        isWebLink: true // Indica pro frontend que deve abrir em Webview/Browser
      }));

      return resposta.status(200).send(musicas);

    } catch (erro) {
      console.error('[MIXCLOUD] Erro na busca:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao buscar no Mixcloud' });
    }
  });
}
