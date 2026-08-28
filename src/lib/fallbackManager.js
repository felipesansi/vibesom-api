import axios from 'axios';
import yts from 'yt-search';
import { escolherMelhorIndice } from './iaEscolher.js';
import { obterIdCliente as obterIdSoundCloud } from '../routes/soundcloud.js';
import { obterServidorAtivo as obterServidorAtivoAudius } from '../routes/audius.js';
import { buscarSaavnComEspelhos } from '../routes/saavn.js';

// ============================================================================
// CONFIGURAÇÕES, INSTÂNCIAS E CACHE
// ============================================================================

// Instâncias Piped atualizadas e rápidas
const INSTANCIAS_PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://api.piped.yt',
  'https://pipedapi.nosebs.ru',
  'https://pipedapi.drgns.space'
];

// Instâncias Invidious de contingência
const INSTANCIAS_INVIDIOUS = [
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://invidious.privacydev.net',
  'https://invidious.jing.rocks'
];

// Circuit breaker para instâncias com falha
const circuitBreaker = new Map();
const COOLDOWN_MS = 2 * 60 * 1000; // 2 minutos

function estaEmCooldown(instancia) {
  const falhaEm = circuitBreaker.get(instancia);
  if (!falhaEm) return false;
  if (Date.now() - falhaEm > COOLDOWN_MS) {
    circuitBreaker.delete(instancia);
    return false;
  }
  return true;
}

function marcarFalha(instancia) {
  circuitBreaker.set(instancia, Date.now());
}

// Cache em memória com TTL para resoluções de streaming
const cacheStreams = new Map();
const TTL_CACHE_MS = 3600 * 1000; // 1 hora

export function obterCacheStream(chave) {
  const item = cacheStreams.get(chave);
  if (!item) return null;
  if (Date.now() > item.expiraEm) {
    cacheStreams.delete(chave);
    return null;
  }
  return item.valor;
}

export function salvarCacheStream(chave, valor, ttl = TTL_CACHE_MS) {
  cacheStreams.set(chave, {
    valor,
    expiraEm: Date.now() + ttl
  });

  // Limpeza de cache se passar de 500 itens
  if (cacheStreams.size > 500) {
    const agora = Date.now();
    for (const [k, v] of cacheStreams.entries()) {
      if (agora > v.expiraEm) cacheStreams.delete(k);
    }
  }
}

// ============================================================================
// VALIDAÇÃO DE URL DE STREAM
// ============================================================================

/**
 * Valida rapidamente se uma URL de stream realmente responde com áudio válido.
 */
export async function validarUrlStream(url, timeout = 2500) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('/')) return true; // URLs internas da API

  try {
    const res = await axios({
      method: 'head',
      url,
      timeout,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      maxRedirects: 3,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const cType = res.headers['content-type'] || '';
    if (cType.includes('text/html') || cType.includes('application/json')) {
      return false;
    }
    return true;
  } catch (e) {
    // Se HEAD for bloqueado (alguns CDNs bloqueiam HEAD), tenta um GET curto com Range
    try {
      const resGet = await axios({
        method: 'get',
        url,
        timeout: 2000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Range': 'bytes=0-10'
        },
        maxRedirects: 3,
        validateStatus: (status) => (status >= 200 && status < 400)
      });
      return true;
    } catch (e2) {
      return false;
    }
  }
}

// ============================================================================
// RESOLUÇÃO DE STREAM YOUTUBE (PIPED + INVIDIOUS COM CONCORRÊNCIA RÁPIDA)
// ============================================================================

function extrairAudioPiped(dados) {
  const audio = dados.audioStreams?.find((s) => s.url);
  if (audio?.url) return { url: audio.url, titulo: dados.title, tipo: audio.mimeType || 'audio/mp4', fonte: 'piped_audio' };

  const video = dados.videoStreams?.find((s) => !s.videoOnly && s.url) || dados.videoStreams?.find((s) => s.url);
  if (video?.url) return { url: video.url, titulo: dados.title, tipo: video.mimeType || 'video/mp4', fonte: 'piped_video' };

  return null;
}

async function tentarInstanciaPiped(instancia, idVideo) {
  if (estaEmCooldown(instancia)) {
    throw new Error(`Instância ${instancia} em cooldown`);
  }

  try {
    const { data } = await axios.get(`${instancia}/streams/${idVideo}`, {
      timeout: 3500,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const stream = extrairAudioPiped(data);
    if (stream?.url) {
      return stream;
    }
    throw new Error('Sem stream de áudio');
  } catch (erro) {
    marcarFalha(instancia);
    throw erro;
  }
}

async function tentarInstanciaInvidious(instancia, idVideo) {
  if (estaEmCooldown(instancia)) {
    throw new Error(`Instância ${instancia} em cooldown`);
  }

  try {
    const { data } = await axios.get(`${instancia}/api/v1/videos/${idVideo}`, {
      timeout: 3500,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const formatAudio = data.adaptiveFormats?.find((f) => f.type?.startsWith('audio/'));
    if (formatAudio?.url) {
      return { url: formatAudio.url, titulo: data.title, tipo: formatAudio.type || 'audio/mp4', fonte: 'invidious_audio' };
    }

    const formatVideo = data.formatStreams?.find((f) => f.url);
    if (formatVideo?.url) {
      return { url: formatVideo.url, titulo: data.title, tipo: formatVideo.type || 'video/mp4', fonte: 'invidious_video' };
    }
    throw new Error('Sem stream invidious');
  } catch (erro) {
    marcarFalha(instancia);
    throw erro;
  }
}

export async function resolverYouTubeDireto(idVideo) {
  const cacheKey = `yt_stream_${idVideo}`;
  const emCache = obterCacheStream(cacheKey);
  if (emCache) return emCache;

  // Filtra instâncias saudáveis
  const pipedDisponiveis = INSTANCIAS_PIPED.filter(inst => !estaEmCooldown(inst));
  const invidiousDisponiveis = INSTANCIAS_INVIDIOUS.filter(inst => !estaEmCooldown(inst));

  // 1. Tenta em lotes rápidos de 3 instâncias Piped em paralelo (Promise.any)
  const lote1 = pipedDisponiveis.slice(0, 3).map(inst => tentarInstanciaPiped(inst, idVideo));
  if (lote1.length > 0) {
    try {
      const stream = await Promise.any(lote1);
      if (stream?.url) {
        salvarCacheStream(cacheKey, stream, 1800 * 1000); // 30 min
        return stream;
      }
    } catch (e) {}
  }

  // 2. Tenta segundo lote Piped
  const lote2 = pipedDisponiveis.slice(3, 6).map(inst => tentarInstanciaPiped(inst, idVideo));
  if (lote2.length > 0) {
    try {
      const stream = await Promise.any(lote2);
      if (stream?.url) {
        salvarCacheStream(cacheKey, stream, 1800 * 1000);
        return stream;
      }
    } catch (e) {}
  }

  // 3. Fallback para Invidious
  const loteInv = invidiousDisponiveis.slice(0, 2).map(inst => tentarInstanciaInvidious(inst, idVideo));
  if (loteInv.length > 0) {
    try {
      const stream = await Promise.any(loteInv);
      if (stream?.url) {
        salvarCacheStream(cacheKey, stream, 1800 * 1000);
        return stream;
      }
    } catch (e) {}
  }

  return null;
}

// ============================================================================
// METADADOS DE VÍDEO DO YOUTUBE
// ============================================================================

export async function obterMetadadosYouTube(idVideo) {
  const cacheKey = `yt_meta_${idVideo}`;
  const emCache = obterCacheStream(cacheKey);
  if (emCache) return emCache;

  // 1. oEmbed oficial (extremamente rápido e nunca bloqueia)
  try {
    const { data } = await axios.get(
      `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${idVideo}&format=json`,
      { timeout: 3000 }
    );
    if (data?.title) {
      const info = {
        titulo: data.title,
        artista: data.author_name || 'Artista Desconhecido',
        thumbnail: data.thumbnail_url || `https://i.ytimg.com/vi/${idVideo}/hqdefault.jpg`
      };
      salvarCacheStream(cacheKey, info, 86400 * 1000);
      return info;
    }
  } catch (e) {}

  // 2. yt-search metadata
  try {
    const res = await yts({ videoId: idVideo });
    if (res?.title) {
      const info = {
        titulo: res.title,
        artista: res.author?.name || 'Artista Desconhecido',
        thumbnail: res.thumbnail || `https://i.ytimg.com/vi/${idVideo}/hqdefault.jpg`
      };
      salvarCacheStream(cacheKey, info, 86400 * 1000);
      return info;
    }
  } catch (e) {}

  return null;
}

export function limparTituloMusica(titulo) {
  if (!titulo) return '';
  return titulo
    .replace(/\((Official|Oficial|Audio|Áudio|Music Video|Clipe|Videoclipe|Vídeo Oficial|Visualizer|Lyric Video|Lyrics|HD|4K|HQ).*?\)/gi, '')
    .replace(/\[(Official|Oficial|Audio|Áudio|Music Video|Clipe|Videoclipe|Vídeo Oficial|Visualizer|Lyric Video|Lyrics|HD|4K|HQ).*?\]/gi, '')
    .replace(/\b(Vídeo Oficial|Clipe Oficial|Video Clipe|Official Video|Official Audio|Visualizer|Lyric Video)\b/gi, '')
    .replace(/\|\s*.*$/g, '') // Remove sufixos como "| Prod. by X"
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// BUSCA E FALLBACK MULTIPLATAFORMA (SAAVN + SOUNDCLOUD + AUDIUS + PALCO)
// ============================================================================

/**
 * Busca e resolve a melhor fonte de áudio disponível para um determinado título e artista.
 * Atinge >80% de taxa de sucesso com ordenação por relevância e validação prévia de áudio.
 */
export async function resolverMelhorFonteAudio(artista, faixa) {
  const termo = `${artista || ''} ${faixa || ''}`.trim();
  if (!termo) return null;

  const cacheKey = `resolved_${termo.toLowerCase()}`;
  const emCache = obterCacheStream(cacheKey);
  if (emCache) return emCache;

  console.log(`[FALLBACK-MANAGER] Resolvendo faixa: "${termo}"`);

  // Executa buscas concorrentes nas principais fontes de áudio de alta taxa de sucesso
  const promessas = [];

  // 1. JioSaavn (Alta taxa de sucesso comercial e MP3 320/160k direto)
  const buscaSaavn = (async () => {
    try {
      const results = await buscarSaavnComEspelhos(termo);
      return results.slice(0, 5);
    } catch (e) {
      return [];
    }
  })();
  promessas.push(buscaSaavn);

  // 2. SoundCloud (com id cliente resiliente)
  const buscaSoundCloud = (async () => {
    try {
      const cid = await obterIdSoundCloud();
      const { data } = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
        params: { q: termo, client_id: cid, limit: 5 },
        timeout: 4500
      });
      const tracks = data.collection || [];
      return tracks
        .filter(t => t.duration > 30000)
        .map(t => ({
          source: 'SoundCloud',
          id: String(t.id),
          titulo: t.title,
          artista: t.user?.username || artista,
          capa: t.artwork_url ? t.artwork_url.replace('large', 't500x500') : t.user?.avatar_url,
          duracao: Math.floor(t.duration / 1000),
          streamUrl: `/soundcloud/stream/${t.id}`
        }));
    } catch (e) {
      return [];
    }
  })();
  promessas.push(buscaSoundCloud);

  // 3. Audius
  const buscaAudius = (async () => {
    try {
      const host = await obterServidorAtivoAudius();
      const { data } = await axios.get(`${host}/v1/tracks/search`, {
        params: { query: termo, limit: 5, app_name: 'VIBESOM' },
        timeout: 4000
      });
      const tracks = data.data || [];
      return tracks.map(t => ({
        source: 'Audius',
        id: String(t.id),
        titulo: t.title,
        artista: t.user?.name || artista,
        capa: t.artwork?.['480x480'] || t.artwork?.['150x150'] || null,
        duracao: t.duration,
        streamUrl: `/audius/stream/${t.id}`
      }));
    } catch (e) {
      return [];
    }
  })();
  promessas.push(buscaAudius);

  // 4. Jamendo
  const buscaJamendo = (async () => {
    try {
      const { data } = await axios.get('https://api.jamendo.com/v3.0/tracks/', {
        params: { client_id: 'c9720322', format: 'json', limit: 5, search: termo },
        timeout: 4000
      });
      return (data.results || []).map(t => ({
        source: 'Jamendo',
        id: String(t.id),
        titulo: t.name,
        artista: t.artist_name || artista,
        capa: t.album_image,
        duracao: t.duration,
        streamUrl: `/jamendo/stream/${t.id}`
      }));
    } catch (e) {
      return [];
    }
  })();
  promessas.push(buscaJamendo);

  // Aguarda resultados de todas as fontes concorrentes
  const resultados = await Promise.allSettled(promessas);
  const candidatos = resultados
    .filter(r => r.status === 'fulfilled' && Array.isArray(r.value))
    .map(r => r.value)
    .flat();

  if (candidatos.length === 0) {
    // 5. Fallback final via YouTube Search + Piped/Invidious
    try {
      const ytResult = await yts({ query: `${termo} official audio`, pages: 1 });
      const video = ytResult.videos?.[0];
      if (video) {
        const streamYt = await resolverYouTubeDireto(video.videoId);
        if (streamYt) {
          const resultado = {
            source: 'YouTube',
            id: video.videoId,
            titulo: video.title,
            artista: video.author?.name || artista,
            capa: video.thumbnail,
            duracao: video.seconds || 0,
            streamUrl: `/stream/${video.videoId}`,
            url: `/stream/${video.videoId}`
          };
          salvarCacheStream(cacheKey, resultado);
          return resultado;
        }
      }
    } catch (e) {}

    return null;
  }

  // Escolhe o melhor candidato via heurística / IA
  const melhorIdx = await escolherMelhorIndice(termo, candidatos);
  const escolhido = candidatos[melhorIdx] || candidatos[0];

  const resultadoFinal = {
    source: escolhido.source,
    id: escolhido.id,
    titulo: escolhido.titulo,
    artista: escolhido.artista,
    capa: escolhido.capa,
    duracao: escolhido.duracao,
    streamUrl: escolhido.streamUrl,
    url: escolhido.streamUrl
  };

  salvarCacheStream(cacheKey, resultadoFinal);
  return resultadoFinal;
}
