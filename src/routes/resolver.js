import axios from 'axios';
import yts from 'yt-search';
import { obterIdCliente as obterIdClienteSoundCloud } from './soundcloud.js';
import { obterServidorAtivo as obterServidorAtivoAudius } from './audius.js';

// Instâncias Piped para o YouTube
const INSTANCIAS_PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt'
];

/**
 * Tenta buscar o stream de áudio via Piped.
 */
async function resolverPiped(idVideo) {
  for (const instancia of INSTANCIAS_PIPED) {
    try {
      const { data } = await axios.get(`${instancia}/streams/${idVideo}`, {
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const audio = data.audioStreams?.find(s => s.url);
      if (audio?.url) return audio.url;
      const video = data.videoStreams?.find(s => !s.videoOnly && s.url);
      if (video?.url) return video.url;
    } catch (e) {
      continue;
    }
  }
  return null;
}

export default async function rotasResolver(servidor) {
  servidor.get('/resolver', {
    schema: {
      description: 'Resolve a melhor fonte de áudio sequencialmente (YouTube -> SoundCloud -> Audius -> Saavn)',
      tags: ['Streaming', 'Busca'],
      querystring: {
        type: 'object',
        required: ['artista', 'faixa'],
        properties: {
          artista: { type: 'string', description: 'Nome do artista' },
          faixa: { type: 'string', description: 'Título da música' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            url: { type: 'string' },
            titulo: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: { erro: { type: 'string' } }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { artista, faixa } = requisicao.query;
    const termo = `${artista} - ${faixa}`;
    
    console.log(`[RESOLVER] Buscando sequencialmente: "${termo}"`);

    // 1. TENTATIVA: YOUTUBE / PIPED
    try {
      const ytResult = await yts({ query: `${termo} oficial audio`, pages: 1 });
      const video = ytResult.videos?.[0];
      if (video) {
        const streamPiped = await resolverPiped(video.videoId);
        if (streamPiped) {
          console.log('[RESOLVER] ✅ Encontrado no YouTube via Piped');
          return resposta.send({
            source: 'YouTube',
            url: `/youtube/stream/${video.videoId}`,
            titulo: video.title
          });
        }
      }
    } catch (e) {
      console.warn('[RESOLVER] Falha no YouTube:', e.message);
    }

    // 2. TENTATIVA: SOUNDCLOUD
    try {
      const cid = await obterIdClienteSoundCloud();
      const scRes = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
        params: { q: termo, client_id: cid, limit: 1 },
        timeout: 5000
      });
      const scTrack = scRes.data.collection?.[0];
      if (scTrack) {
        console.log('[RESOLVER] ✅ Encontrado no SoundCloud');
        return resposta.send({
          source: 'SoundCloud',
          url: `/soundcloud/stream/${scTrack.id}`,
          titulo: scTrack.title
        });
      }
    } catch (e) {
      console.warn('[RESOLVER] Falha no SoundCloud:', e.message);
    }

    // 3. TENTATIVA: AUDIUS
    try {
      const host = await obterServidorAtivoAudius();
      const auRes = await axios.get(`${host}/v1/tracks/search`, {
        params: { query: termo, limit: 1 },
        timeout: 5000
      });
      const auTrack = auRes.data.data?.[0];
      if (auTrack) {
        console.log('[RESOLVER] ✅ Encontrado no Audius');
        return resposta.send({
          source: 'Audius',
          url: `/audius/stream/${auTrack.id}`,
          titulo: auTrack.title
        });
      }
    } catch (e) {
      console.warn('[RESOLVER] Falha no Audius:', e.message);
    }

    // 4. TENTATIVA: SAAVN
    try {
      const svRes = await axios.get(`https://saavn.me/search/songs`, {
        params: { query: termo, limit: 1 },
        timeout: 5000
      });
      const svTrack = svRes.data.data?.results?.[0];
      if (svTrack) {
        const urlDownload = svTrack.downloadUrl?.find(q => q.quality === '320kbps')?.link || 
                            svTrack.downloadUrl?.[0]?.link;
        if (urlDownload) {
          console.log('[RESOLVER] ✅ Encontrado no Saavn');
          return resposta.send({
            source: 'Saavn',
            url: `/saavn/stream?url=${encodeURIComponent(urlDownload)}`,
            titulo: svTrack.name
          });
        }
      }
    } catch (e) {
      console.warn('[RESOLVER] Falha no Saavn:', e.message);
    }

    console.warn(`[RESOLVER] ❌ Nenhuma fonte encontrada para: "${termo}"`);
    return resposta.status(404).send({ erro: 'Áudio não encontrado em nenhuma plataforma.' });
  });
}
