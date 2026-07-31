import axios from 'axios';
import { escolherMelhorIndice } from '../lib/iaEscolher.js';
import { obterIdCliente as obterIdSoundCloud } from './soundcloud.js';

const INSTANCIAS_PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt'
];

function limparTitulo(titulo) {
  return titulo
    .replace(/\(Official.*?\)/gi, '')
    .replace(/\[Official.*\]/gi, '')
    .replace(/Video Clipe/gi, '')
    .replace(/Clipe Oficial/gi, '')
    .trim();
}

function escolherStreamPiped(dados) {
  const audio = dados.audioStreams?.find((s) => s.url);
  if (audio?.url) return { url: audio.url, titulo: dados.title, fonte: 'audio' };

  const video =
    dados.videoStreams?.find((s) => !s.videoOnly && s.url) ||
    dados.videoStreams?.find((s) => s.url);
  if (video?.url) return { url: video.url, titulo: dados.title, fonte: 'video' };

  return null;
}

async function resolverViaPiped(idVideo) {
  for (const instancia of INSTANCIAS_PIPED) {
    try {
      const { data } = await axios.get(`${instancia}/streams/${idVideo}`, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const stream = escolherStreamPiped(data);
      if (stream) {
        console.log(`[STREAM] Piped OK (${instancia}) — ${stream.fonte}`);
        return stream;
      }
    } catch (erro) {
      console.warn(`[STREAM] Piped ${instancia}:`, erro.message);
    }
  }
  return null;
}

async function obterTituloVideo(idVideo) {
  try {
    const { data } = await axios.get(
      `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${idVideo}&format=json`,
      { timeout: 5000 }
    );
    if (data?.title) return data.title;
  } catch (erro) {
    console.warn('[STREAM] oEmbed falhou:', erro.message);
  }

  const piped = await resolverViaPiped(idVideo);
  return piped?.titulo || null;
}

async function proxyStream(resposta, urlStream) {
  const { data: fluxo, headers } = await axios({
    method: 'get',
    url: urlStream,
    responseType: 'stream',
    timeout: 20000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  resposta.header('Content-Type', headers['content-type'] || 'audio/mp4');
  resposta.header('Content-Disposition', 'inline');
  if (headers['content-length']) {
    resposta.header('Content-Length', headers['content-length']);
  }

  return resposta.send(fluxo);
}

export default async function rotasTransmissao(servidor) {

  servidor.get('/stream/:idVideo', {
    schema: {
      description: 'Stream de áudio do YouTube via Piped, com fallback para SoundCloud/Audius/Saavn',
      tags: ['Streaming'],
      params: {
        type: 'object',
        required: ['idVideo'],
        properties: {
          idVideo: {
            type: 'string',
            description: 'ID do vídeo do YouTube (ex: dQw4w9WgXcQ)'
          }
        }
      },
      response: {
        200: {
          type: 'string',
          description: 'Arquivo de áudio em streaming'
        },
        404: {
          type: 'object',
          properties: {
            erro: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            erro: { type: 'string' }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;

    try {
      console.log(`[STREAM] Resolvendo ID: ${idVideo}`);

      const piped = await resolverViaPiped(idVideo);
      if (piped?.url) {
        console.log(`[STREAM] YouTube direto: ${piped.titulo || idVideo}`);
        return proxyStream(resposta, piped.url);
      }

      const tituloOriginal = await obterTituloVideo(idVideo);
      if (!tituloOriginal) {
        return resposta.status(404).send({
          erro: 'Não foi possível obter metadados deste vídeo do YouTube.'
        });
      }

      const tituloLimpo = limparTitulo(tituloOriginal);
      console.log(`[STREAM] Fallback para: ${tituloLimpo}`);

      const cid = await obterIdSoundCloud();
      const [buscaSc, buscaAudius, buscaSaavn] = await Promise.all([
        axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
          params: { q: tituloLimpo, client_id: cid, limit: 5 },
          timeout: 8000
        }).catch(() => ({ data: { collection: [] } })),
        axios.get(`https://discoveryprovider.audius.co/v1/tracks/search`, {
          params: { query: tituloLimpo, app_name: 'VIBESOM' },
          timeout: 8000
        }).catch(() => ({ data: { data: [] } })),
        axios.get(`https://saavn.me/search/songs`, {
          params: { query: tituloLimpo, limit: 5 },
          timeout: 8000
        }).catch(() => ({ data: { data: { results: [] } } }))
      ]);

      const candidatos = [];

      for (const faixa of buscaSc.data.collection || []) {
        candidatos.push({
          source: 'SoundCloud',
          titulo: faixa.title,
          artista: faixa.user?.username,
          redirect: `/soundcloud/stream/${faixa.id}`
        });
      }

      for (const faixa of (buscaAudius.data.data || []).slice(0, 5)) {
        candidatos.push({
          source: 'Audius',
          titulo: faixa.title,
          artista: faixa.user?.name,
          redirect: `/audius/stream/${faixa.id}`
        });
      }

      for (const faixa of buscaSaavn.data.data?.results || []) {
        const urlDownload =
          faixa.downloadUrl?.find((q) => q.quality === '320kbps')?.link ||
          faixa.downloadUrl?.[faixa.downloadUrl.length - 1]?.link;
        if (!urlDownload) continue;
        candidatos.push({
          source: 'Saavn',
          titulo: faixa.name,
          artista: faixa.primaryArtists,
          redirect: `/saavn/stream?url=${encodeURIComponent(urlDownload)}`
        });
      }

      if (candidatos.length > 0) {
        const indice = await escolherMelhorIndice(tituloLimpo, candidatos);
        const escolhido = candidatos[indice];
        console.log(`[STREAM] Fallback IA: ${escolhido.source} — ${escolhido.titulo}`);
        return resposta.redirect(escolhido.redirect);
      }

      return resposta.status(404).send({
        erro: 'Não foi possível encontrar áudio para este vídeo.',
        titulo: tituloOriginal
      });
    } catch (erro) {
      console.error('[STREAM] Erro fatal:', erro.message);
      return resposta.status(500).send({
        erro: 'Erro ao processar stream',
        detalhes: erro.message
      });
    }
  });
}
