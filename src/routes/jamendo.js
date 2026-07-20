import axios from 'axios';

// ID do Cliente público do Jamendo (usado em demos oficiais)
const ID_CLIENTE = 'c9720322';

export default async function rotasJamendo(servidor) {
  
  // BUSCA JAMENDO
  servidor.get('/jamendo/search/:consulta', {
    schema: {
      description: 'Busca específica de músicas no Jamendo',
      tags: ['Jamendo', 'Busca'],
      params: {
        type: 'object',
        required: ['consulta'],
        properties: {
          consulta: {
            type: 'string',
            description: 'Termo de busca (música, artista ou álbum)'
          }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', example: 'Jamendo' },
              id: { type: 'string', description: 'ID da música' },
              titulo: { type: 'string', description: 'Título da música' },
              artista: { type: 'string', description: 'Nome do artista' },
              capa: { type: 'string', description: 'URL da capa' },
              duracao: { type: 'number', description: 'Duração em segundos' },
              streamUrl: { type: 'string', description: 'URL para streaming' }
            }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { consulta } = requisicao.params;
    
    try {
      const { data } = await axios.get('https://api.jamendo.com/v3.0/tracks/', {
        params: {
          client_id: ID_CLIENTE,
          format: 'json',
          limit: 30,
          search: consulta,
          include: 'musicinfo'
        },
        timeout: 5000
      });

      if (!data.results || data.results.length === 0) {
        return resposta.status(404).send({ erro: 'Nenhuma música encontrada no Jamendo' });
      }

      const musicas = data.results.map(musica => ({
        id: musica.id,
        titulo: musica.name,
        artista: musica.artist_name,
        capa: musica.album_image,
        duracao: musica.duration,
        plays: musica.stats?.rate_downloads_total || 0, // Jamendo foca em downloads
        genero: musica.musicinfo?.tags?.join(', ') || 'Variado',
        streamUrl: `/jamendo/stream/${musica.id}`
      }));

      return resposta.status(200).send(musicas);

    } catch (erro) {
      console.error('[JAMENDO] Erro na busca:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao buscar no Jamendo',
        detalhes: erro.message
      });
    }
  });

  // TRENDING / TOP MÚSICAS
  servidor.get('/jamendo/trending', {
    schema: {
      description: 'Músicas em alta no Jamendo',
      tags: ['Jamendo'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', example: 'Jamendo' },
              id: { type: 'string', description: 'ID da música' },
              titulo: { type: 'string', description: 'Título da música' },
              artista: { type: 'string', description: 'Nome do artista' },
              capa: { type: 'string', description: 'URL da capa' },
              duracao: { type: 'number', description: 'Duração em segundos' },
              streamUrl: { type: 'string', description: 'URL para streaming' }
            }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    try {
      const { data } = await axios.get('https://api.jamendo.com/v3.0/tracks/', {
        params: {
          client_id: ID_CLIENTE,
          format: 'json',
          limit: 30,
          order: 'popularity_week',
          include: 'musicinfo'
        },
        timeout: 5000
      });

      const musicas = data.results.map(musica => ({
        id: musica.id,
        titulo: musica.name,
        artista: musica.artist_name,
        capa: musica.album_image,
        duracao: musica.duration,
        plays: musica.stats?.rate_downloads_total || 0,
        genero: musica.musicinfo?.tags?.join(', ') || 'Variado',
        streamUrl: `/jamendo/stream/${musica.id}`
      }));

      return resposta.status(200).send(musicas);

    } catch (erro) {
      console.error('[JAMENDO] Erro no trending:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao buscar trending do Jamendo' });
    }
  });

  // STREAM (Proxy para garantir stream inline)
  servidor.get('/jamendo/stream/:id', {
    schema: {
      description: 'Stream de música do Jamendo',
      tags: ['Jamendo', 'Streaming'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'ID da música no Jamendo'
          }
        }
      },
      response: {
        200: {
          type: 'string',
          description: 'Arquivo de áudio MP3'
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
    const { id } = requisicao.params;
    const urlFluxo = `https://api.jamendo.com/v3.0/tracks/file/?client_id=${ID_CLIENTE}&id=${id}&action=stream`;
    
    try {
      const { data: fluxo, headers } = await axios({
          method: 'get',
          url: urlFluxo,
          responseType: 'stream',
          timeout: 10000
      });

      resposta.header('Content-Type', headers['content-type'] || 'audio/mpeg');
      resposta.header('Content-Disposition', 'inline');
      
      if (headers['content-length']) {
          resposta.header('Content-Length', headers['content-length']);
      }

      return resposta.send(fluxo);
    } catch (erro) {
      console.error('[JAMENDO] Erro no stream:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao acessar stream do Jamendo',
        detalhes: erro.message
      });
    }
  });
}
