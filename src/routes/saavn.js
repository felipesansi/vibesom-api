import axios from 'axios';

export default async function rotasSaavn(servidor) {

  // API pública de proxy para o JioSaavn (Trocado para saavn.me por estabilidade)
  const SAAVN_API = 'https://saavn.me';

  // BUSCA SAAVN
  servidor.get('/saavn/search/:consulta', {
    schema: {
      description: 'Busca específica de músicas no Saavn',
      tags: ['Saavn', 'Busca'],
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
              source: { type: 'string', example: 'Saavn' },
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
      const { data } = await axios.get(`${SAAVN_API}/search/songs`, {
        params: { query: consulta, limit: 10 },
        timeout: 6000
      });

      // A estrutura do saavn.me retorna { status: "SUCCESS", data: { results: [...] } }
      if (!data.data || !data.data.results || data.data.results.length === 0) {
        return resposta.send([]);
      }

      const musicas = data.data.results.map(musica => {
        // saavn.me retorna a URL de download dentro de 'downloadUrl' (array)
        const urlDownload = musica.downloadUrl?.find(q => q.quality === '320kbps')?.link || 
                            musica.downloadUrl?.find(q => q.quality === '160kbps')?.link || 
                            musica.downloadUrl?.[0]?.link;

        let capa = musica.image?.[2]?.link || musica.image?.[0]?.link; // 500x500

        return {
           source: 'Saavn',
           id: musica.id,
           titulo: musica.name,
           artista: musica.primaryArtists,
           capa: capa,
           duracao: musica.duration,
           album: musica.album?.name,
           ano: musica.year,
           streamUrl: `/saavn/stream?url=${encodeURIComponent(urlDownload)}`
        };
      });

      return resposta.send(musicas);

    } catch (erro) {
      console.error('[SAAVN] Erro:', erro.message);
      return resposta.send([]);
    }
  });

  // STREAM / PROXY
  servidor.get('/saavn/stream', {
    schema: {
      description: 'Stream de música do Saavn',
      tags: ['Saavn', 'Streaming'],
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
        const urlFluxo = decodeURIComponent(url);
        const { data: fluxo, headers } = await axios({
            method: 'get',
            url: urlFluxo,
            responseType: 'stream',
            timeout: 10000
        });

        // Repassa headers essenciais, mas força inline para não baixar
        resposta.header('Content-Type', headers['content-type'] || 'audio/mpeg');
        resposta.header('Content-Disposition', 'inline');
        
        if (headers['content-length']) {
            resposta.header('Content-Length', headers['content-length']);
        }

        return resposta.send(fluxo);
    } catch (erro) {
      console.error('[SAAVN-STREAM] Erro:', erro.message);
      return resposta.redirect(decodeURIComponent(url));
    }
  });
}
