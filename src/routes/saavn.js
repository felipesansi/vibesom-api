import axios from 'axios';
import CryptoJS from 'crypto-js';
import { fazerProxyStream } from '../lib/streamProxy.js';

// Chave estática DES utilizada pelo JioSaavn para descriptografia de URLs de mídia
const DES_KEY = CryptoJS.enc.Utf8.parse('38346591');

function decodificarUrlSaavn(urlCriptografada) {
  if (!urlCriptografada || typeof urlCriptografada !== 'string') return null;
  try {
    const dec = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(urlCriptografada.trim()) },
      DES_KEY,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    const url = dec.toString(CryptoJS.enc.Utf8);
    if (!url || !url.startsWith('http')) return null;
    // Substitui bitrate base de 96k por 320k para qualidade máxima
    return url.replace(/_96\.mp4$/, '_320.mp4');
  } catch {
    return null;
  }
}

function decodificarEntidadesHtml(texto) {
  if (!texto || typeof texto !== 'string') return '';
  return texto
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// Espelhos de contingência da API JioSaavn
const SAAVN_MIRRORS = [
  'https://saavn-api.vercel.app/api',
  'https://jiosaavn-api-privatecvc2.vercel.app',
  'https://saavn-api.vercel.app'
];

async function buscarSaavnComEspelhos(consulta) {
  // 1. TENTA PRIMEIRO A API OFICIAL DO JIOSAAVN (Mais estável, nunca sai do ar por quota)
  try {
    const { data } = await axios.get('https://www.jiosaavn.com/api.php', {
      params: {
        __call: 'search.getResults',
        _format: 'json',
        _marker: '0',
        ctx: 'android',
        p: '1',
        n: '15',
        q: consulta
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 5000
    });

    const resultados = data?.results;
    if (Array.isArray(resultados) && resultados.length > 0) {
      const formatadas = resultados.map(musica => {
        const urlDownload = decodificarUrlSaavn(musica.encrypted_media_url) || musica.media_preview_url;
        if (!urlDownload) return null;

        const titulo = decodificarEntidadesHtml(musica.song || musica.title || musica.name);
        const artista = decodificarEntidadesHtml(musica.primary_artists || musica.singers || musica.music || 'Desconhecido');
        const capa = musica.image ? musica.image.replace(/150x150/g, '500x500') : null;

        return {
          source: 'Saavn',
          id: String(musica.id),
          titulo,
          artista,
          capa,
          duracao: Number(musica.duration) || 0,
          album: decodificarEntidadesHtml(musica.album || ''),
          ano: musica.year,
          streamUrl: `/saavn/stream?url=${encodeURIComponent(urlDownload)}`
        };
      }).filter(Boolean);

      if (formatadas.length > 0) {
        return formatadas;
      }
    }
  } catch (erroDireto) {
    console.warn('[SAAVN] Falha na consulta direta à API JioSaavn, tentando espelhos...');
  }

  // 2. FALLBACK PARA ESPELHOS
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

    // Fastify já decodifica os parâmetros de query. Decodificar novamente
    // pode alterar a URL assinada do CDN (por exemplo, %2F ou %3D).
    const urlDecodificada = url;

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
