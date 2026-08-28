import axios from 'axios';
import { fazerProxyStream } from '../lib/streamProxy.js';

// Espelhos da API Saavn
const SAAVN_MIRRORS = [
  'https://saavn-api.vercel.app',
  'https://saavn.me',
  'https://jiosaavn-api.vercel.app'
];

async function buscarSaavnComEspelhos(consulta) {
  for (const api of SAAVN_MIRRORS) {
    try {
      const { data } = await axios.get(`${api}/search/songs`, {
        params: { query: consulta, limit: 10 },
        timeout: 5000
      });

      // Formato 1: Array direto (saavn-api.vercel.app)
      if (Array.isArray(data) && data.length > 0) {
        return data.map(musica => {
          const urlDownload = musica.url || musica.downloadUrl?.find(q => q.quality === '320kbps')?.link || musica.downloadUrl?.[0]?.link;
          return {
            source: 'Saavn',
            id: String(musica.id),
            titulo: musica.title || musica.name,
            artista: musica.artists || musica.primaryArtists || 'Desconhecido',
            capa: musica.image || (musica.image?.[2]?.link || musica.image?.[0]?.link),
            duracao: Number(musica.duration) || 0,
            album: musica.album || musica.album?.name,
            ano: musica.year,
            streamUrl: `/saavn/stream?url=${encodeURIComponent(urlDownload)}`
          };
        });
      }

      // Formato 2: { status: "SUCCESS", data: { results: [...] } } (saavn.me)
      if (data?.data?.results && data.data.results.length > 0) {
        return data.data.results.map(musica => {
          const urlDownload = musica.downloadUrl?.find(q => q.quality === '320kbps')?.link || 
                              musica.downloadUrl?.find(q => q.quality === '160kbps')?.link || 
                              musica.downloadUrl?.[0]?.link;
          let capa = musica.image?.[2]?.link || musica.image?.[0]?.link || (typeof musica.image === 'string' ? musica.image : null);

          return {
            source: 'Saavn',
            id: String(musica.id),
            titulo: musica.name || musica.title,
            artista: musica.primaryArtists || musica.artists || 'Desconhecido',
            capa: capa,
            duracao: Number(musica.duration) || 0,
            album: musica.album?.name || musica.album,
            ano: musica.year,
            streamUrl: `/saavn/stream?url=${encodeURIComponent(urlDownload)}`
          };
        });
      }
    } catch (e) {
      continue;
    }
  }
  return [];
}

export default async function rotasSaavn(servidor) {

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
      const musicas = await buscarSaavnComEspelhos(consulta);
      return resposta.send(musicas);
    } catch (erro) {
      console.error('[SAAVN] Erro:', erro.message);
      return resposta.send([]);
    }
  });

  // STREAM / PROXY COM SUPORTE A RANGE
  servidor.get('/saavn/stream', {
    schema: {
      description: 'Stream de música do Saavn com suporte a Range headers',
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

    const urlFluxo = decodeURIComponent(url);
    return fazerProxyStream(requisicao, resposta, urlFluxo, {
      defaultContentType: 'audio/mpeg'
    });
  });
}
export { buscarSaavnComEspelhos };
