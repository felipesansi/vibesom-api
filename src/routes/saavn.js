import axios from 'axios';
import { fazerProxyStream } from '../lib/streamProxy.js';

// Espelhos da API JioSaavn de alta disponibilidade
const SAAVN_MIRRORS = [
  'https://saavn-api.vercel.app/api',
  'https://jiosaavn-api-privatecvc2.vercel.app',
  'https://saavn-api.vercel.app'
];

async function buscarSaavnComEspelhos(consulta) {
  for (const api of SAAVN_MIRRORS) {
    try {
      const endpoint = api.endsWith('/api') ? `${api}/search/songs` : `${api}/search/songs`;
      const { data } = await axios.get(endpoint, {
        params: { query: consulta, limit: 10 },
        timeout: 5000,
        validateStatus: (status) => status >= 200 && status < 500
      });

      const dadosValidos = typeof data === 'string' ? data : data ?? {};
      if (typeof dadosValidos === 'string' && /<!doctype html|<html/i.test(dadosValidos)) {
        continue;
      }

      const resultados = data?.data?.results || (Array.isArray(data) ? data : data?.results);

      if (Array.isArray(resultados) && resultados.length > 0) {
        return resultados.map(musica => {
          const urlDownload = musica.downloadUrl?.find(q => q.quality === '320kbps')?.link || 
                              musica.downloadUrl?.find(q => q.quality === '160kbps')?.link || 
                              musica.downloadUrl?.[0]?.link ||
                              musica.url;
          if (!urlDownload) return null;
          
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
        }).filter(Boolean);
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

  // STREAM / REDIRECT COM SUPORTE A RANGE
  servidor.get('/saavn/stream', {
    schema: {
      description: 'Stream de música do Saavn com suporte a Range headers e redirecionamento otimizado',
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
      }
    }
  }, async (requisicao, resposta) => {
    const { url } = requisicao.query;
    if (!url) return resposta.status(400).send({ erro: 'URL necessária' });

    const urlDecodificada = decodeURIComponent(url);

    // Otimização para Vercel: se for URL do CDN oficial Saavn, redireciona 302 direto
    resposta.header('Access-Control-Allow-Origin', '*');
    resposta.header('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Authorization');
    resposta.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    return fazerProxyStream(requisicao, resposta, urlDecodificada, {
      defaultContentType: 'audio/mp4'
    });
  });
}

export { buscarSaavnComEspelhos };
