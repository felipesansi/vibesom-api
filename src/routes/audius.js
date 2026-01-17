import axios from 'axios';

// Hosts de descoberta do Audius (Load Balancing)
const AUDIUS_DISCOVERY_NODES = [
  'https://discoveryprovider.audius.co',
  'https://discoveryprovider2.audius.co',
  'https://discoveryprovider3.audius.co',
  'https://audius-dp.delhi.creatorseed.com'
];

const obterServidorAtivo = async () => {
  for (const host of AUDIUS_DISCOVERY_NODES) {
    try {
      await axios.get(`${host}/health_check`, { timeout: 2000 });
      return host;
    } catch (e) {
      continue;
    }
  }
  return AUDIUS_DISCOVERY_NODES[0]; // Fallback para o primeiro
};

export default async function rotasAudius(servidor) {
  
  // ROTA DE BUSCA AUDIUS
  servidor.get('/audius/search/:consulta', {
    schema: {
      description: 'Busca específica de músicas no Audius',
      tags: ['Audius', 'Busca'],
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
              source: { type: 'string', example: 'Audius' },
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
            erro: { type: 'string' },
            consulta: { type: 'string' }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { consulta } = requisicao.params;
    
    try {
      const host = await obterServidorAtivo();
      const { data } = await axios.get(`${host}/v1/tracks/search`, {
        params: { query: consulta, limit: 30 },
        timeout: 5000
      });

      if (!data.data || data.data.length === 0) {
        return resposta.status(404).send({ 
          erro: 'Nenhuma música encontrada',
          consulta: consulta
        });
      }

      const musicas = data.data.map(musica => ({
        id: musica.id,
        titulo: musica.title,
        artista: musica.user.name,
        capa: musica.artwork?.['480x480'] || musica.artwork?.['150x150'] || null,
        duracao: musica.duration,
        plays: musica.play_count,
        genero: musica.genre,
        streamUrl: `/audius/stream/${musica.id}`
      }));

      return resposta.status(200).send(musicas);
    } catch (erro) {
      console.error('[AUDIUS] Erro na busca:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao buscar no Audius',
        detalhes: erro.message
      });
    }
  });

  // ROTA DE TRENDING (MÚSICAS EM ALTA)
  servidor.get('/audius/trending', {
    schema: {
      description: 'Músicas em alta no Audius',
      tags: ['Audius'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', example: 'Audius' },
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
      const host = await obterServidorAtivo();
      const { data } = await axios.get(`${host}/v1/tracks/trending`, {
        params: { limit: 30, time: 'week' },
        timeout: 5000
      });

      if (!data.data || data.data.length === 0) {
        return resposta.status(404).send({ erro: 'Nenhuma música em alta' });
      }

      const trending = data.data.map(musica => ({
        id: musica.id,
        titulo: musica.title,
        artista: musica.user.name,
        capa: musica.artwork?.['480x480'] || musica.artwork?.['150x150'] || null,
        duracao: musica.duration,
        plays: musica.play_count,
        genero: musica.genre,
        streamUrl: `/audius/stream/${musica.id}`
      }));

      return resposta.status(200).send(trending);
    } catch (erro) {
      console.error('[AUDIUS] Erro ao buscar trending:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao buscar trending do Audius',
        detalhes: erro.message
      });
    }
  });

  // ROTA DE STREAMING (Proxy para garantir stream inline)
  servidor.get('/audius/stream/:id', {
    schema: {
      description: 'Stream de música do Audius',
      tags: ['Audius', 'Streaming'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'ID da música no Audius'
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
    
    try {
      const host = await obterServidorAtivo();
      const streamUrl = `${host}/v1/tracks/${id}/stream?app_name=VIBESOM`;
      
      const { data: stream, headers } = await axios({
          method: 'get',
          url: streamUrl,
          responseType: 'stream',
          timeout: 10000
      });

      // Repassa headers essenciais
      resposta.header('Content-Type', headers['content-type'] || 'audio/mpeg');
      resposta.header('Content-Disposition', 'inline');
      
      if (headers['content-length']) {
          resposta.header('Content-Length', headers['content-length']);
      }

      return resposta.send(stream);
    } catch (erro) {
      console.error('[AUDIUS] Erro no stream:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao acessar stream do Audius',
        detalhes: erro.message
      });
    }
  });

  // ROTA DE INFORMAÇÕES DA TRACK
  servidor.get('/audius/track/:id', async (requisicao, resposta) => {
    const { id } = requisicao.params;
    
    try {
      const host = await obterServidorAtivo();
      const { data } = await axios.get(`${host}/v1/tracks/${id}`, {
        timeout: 5000
      });

      if (!data.data) {
        return resposta.status(404).send({ erro: 'Música não encontrada' });
      }

      const track = data.data;
      return resposta.status(200).send({
        id: track.id,
        titulo: track.title,
        artista: track.user.name,
        capa: track.artwork?.['1000x1000'] || track.artwork?.['480x480'] || null,
        duracao: track.duration,
        plays: track.play_count,
        genero: track.genre,
        descricao: track.description,
        lancamento: track.release_date,
        streamUrl: `/audius/stream/${track.id}`
      });
    } catch (erro) {
      console.error('[AUDIUS] Erro ao buscar track:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao buscar informações da música',
        detalhes: erro.message
      });
    }
  });

  // ROTA DE BUSCA DE ARTISTAS
  servidor.get('/audius/artist/search/:consulta', {
    schema: {
      description: 'Busca de artistas no Audius',
      tags: ['Audius'],
      params: {
        type: 'object',
        required: ['consulta'],
        properties: {
          consulta: {
            type: 'string',
            description: 'Nome do artista para buscar'
          }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'ID do artista' },
              nome: { type: 'string', description: 'Nome do artista' },
              handle: { type: 'string', description: 'Handle do artista' },
              foto: { type: 'string', description: 'URL da foto do perfil' },
              seguidores: { type: 'number', description: 'Número de seguidores' },
              tracksUrl: { type: 'string', description: 'URL para buscar músicas do artista' }
            }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { consulta } = requisicao.params;
    
    try {
      const host = await obterServidorAtivo();
      const { data } = await axios.get(`${host}/v1/users/search`, {
        params: { query: consulta, limit: 20 },
        timeout: 5000
      });

      if (!data.data || data.data.length === 0) {
        return resposta.status(404).send({ 
          erro: 'Nenhum artista encontrado',
          query: query
        });
      }

      const artistas = data.data.map(user => ({
        id: user.id,
        nome: user.name,
        handle: user.handle,
        foto: user.profile_picture?.['480x480'] || user.profile_picture?.['150x150'] || null,
        seguidores: user.follower_count,
        totalMusicas: user.track_count,
        bio: user.bio,
        verificado: user.is_verified,
        tracksUrl: `/audius/artist/${user.id}/tracks`
      }));

      return resposta.status(200).send(artistas);
    } catch (erro) {
      console.error('[AUDIUS] Erro ao buscar artistas:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao buscar artistas no Audius',
        detalhes: erro.message
      });
    }
  });

  // ROTA DE MÚSICAS DE UM ARTISTA
  servidor.get('/audius/artist/:id/tracks', {
    schema: {
      description: 'Busca todas as músicas de um artista específico no Audius',
      tags: ['Audius'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'ID do artista no Audius'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            default: 50,
            description: 'Número máximo de músicas a retornar'
          },
          offset: {
            type: 'number',
            default: 0,
            description: 'Número de músicas a pular (para paginação)'
          }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', example: 'Audius' },
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
    const { id } = requisicao.params;
    const { limit = 50, offset = 0 } = requisicao.query;
    
    try {
      const host = await obterServidorAtivo();
      const { data } = await axios.get(`${host}/v1/users/${id}/tracks`, {
        params: { limit, offset },
        timeout: 5000
      });

      if (!data.data || data.data.length === 0) {
        return resposta.status(404).send({ 
          erro: 'Nenhuma música encontrada para este artista'
        });
      }

      const musicas = data.data.map(track => ({
        id: track.id,
        titulo: track.title,
        artista: track.user.name,
        capa: track.artwork?.['480x480'] || track.artwork?.['150x150'] || null,
        duracao: track.duration,
        plays: track.play_count,
        genero: track.genre,
        lancamento: track.release_date,
        streamUrl: `/audius/stream/${track.id}`
      }));

      return resposta.status(200).send({
        total: data.data.length,
        offset: offset,
        musicas: musicas
      });
    } catch (erro) {
      console.error('[AUDIUS] Erro ao buscar músicas do artista:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao buscar músicas do artista',
        detalhes: erro.message
      });
    }
  });
}
