import axios from 'axios';

export default async function rotasHearThis(servidor) {
  
  // BUSCA HEARTHIS.AT
  servidor.get('/hearthis/search/:consulta', {
    schema: {
      description: 'Busca específica de músicas no HearThis.at',
      tags: ['HearThis', 'Busca'],
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
              source: { type: 'string', example: 'HearThis' },
              id: { type: 'string', description: 'ID da música' },
              titulo: { type: 'string', description: 'Título da música' },
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
      const { data } = await axios.get(`https://api-v2.hearthis.at/search`, {
        params: { t: consulta, count: 20 },
        timeout: 5000
      });

      if (!data || data.length === 0) {
        return resposta.status(404).send({ erro: 'Nada encontrado no HearThis.at' });
      }

      const musicas = data.map(musica => ({
        source: 'HearThis',
        id: track.id,
        titulo: track.title,
        artista: track.user?.username,
        capa: track.artwork_url || track.thumb,
        duracao: track.duration,
        plays: track.playback_count,
        genero: track.genre,
        // Usando proxy para evitar download forçado
        streamUrl: `/hearthis/stream?url=${encodeURIComponent(track.stream_url)}`
      }));

      return resposta.status(200).send(musicas);

    } catch (erro) {
      console.error('[HEARTHIS] Erro:', erro.message);
      return resposta.status(500).send({ erro: 'Erro no HearThis.at' });
    }
  });

  // STREAM / PROXY
  servidor.get('/hearthis/stream', {
    schema: {
      description: 'Stream de música do HearThis.at',
      tags: ['HearThis', 'Streaming'],
      querystring: {
        type: 'object',
        required: ['url'],
        properties: {
          url: {
            type: 'string',
            description: 'URL da música para streaming'
          }
        }
      },
      response: {
        200: {
          type: 'string',
          description: 'Arquivo de áudio MP3'
        },
        400: {
          type: 'object',
          properties: {
            erro: { type: 'string' }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { url } = requisicao.query;
    if (!url) return resposta.status(400).send({ erro: 'URL necessária' });

    try {
        const streamUrl = decodeURIComponent(url);
        const { data: stream, headers } = await axios({
            method: 'get',
            url: streamUrl,
            responseType: 'stream',
            timeout: 10000
        });

        resposta.header('Content-Type', headers['content-type'] || 'audio/mpeg');
        resposta.header('Content-Disposition', 'inline');
        
        if (headers['content-length']) {
            resposta.header('Content-Length', headers['content-length']);
        }

        return resposta.send(stream);
    } catch (e) {
        console.error('[HEARTHIS-STREAM] Erro:', e.message);
        return resposta.redirect(decodeURIComponent(url));
    }
  });
}
