import axios from 'axios';
import ytdl from '@distube/ytdl-core';
import { escolherMelhorIndice } from '../lib/iaEscolher.js';

// ==========================================================
// HELPERS
// ==========================================================

let idSoundCloud = null;
let ultimaAtualizacaoChave = 0;

const INSTANCIAS_PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt'
];

async function obterIdSoundCloud() {
  if (idSoundCloud && Date.now() - ultimaAtualizacaoChave < 3600000) return idSoundCloud;
  try {
    const { data: html } = await axios.get('https://soundcloud.com/discover', { headers: { 'User-Agent': 'Mozilla/5.0' }});
    const urlsScript = html.match(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g) || [];
    for (const tagUrl of urlsScript.reverse().slice(0, 5)) {
        try {
            const url = tagUrl.match(/src="([^"]+)"/)[1];
            const { data: js } = await axios.get(url);
            const correspondencia = js.match(/client_id:"([a-zA-Z0-9]{32})"/);
            if (correspondencia) {
                idSoundCloud = correspondencia[1];
                ultimaAtualizacaoChave = Date.now();
                return idSoundCloud;
            }
        } catch(e) {}
    }
  } catch (e) {
    console.error('[SC-ID] Erro ao obter ID:', e.message);
  }
  return idSoundCloud || 'LBCcHmRB8XSStWL6wKH2HPACspQlXg2P';
}

export default async function rotasTransmissao(servidor) {

  // ROTA PRINCIPAL DE STREAM (YOUTUBE COM FALLBACK)
  servidor.get('/stream/:idVideo', {
    schema: {
      description: 'Stream de vídeo do YouTube (retorna URL direta para streaming)',
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
          description: 'URL direta para streaming do áudio'
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
    let tituloVideo = 'Música';
    
    try {
      // 1. TENTA OBTER LINK DIRETO DO YOUTUBE (PODE FALHAR EM SERVERLESS/VERCEL)
      const informacao = await ytdl.getInfo(idVideo);
      tituloVideo = informacao.videoDetails.title;
      const formato = ytdl.chooseFormat(informacao.formats, { 
        quality: 'highestaudio', 
        filter: 'audioonly' 
      });

      if (!formato || !formato.url) {
        throw new Error('Formato YouTube não encontrado');
      }
      
      // Em vez de redirecionar, fazemos um proxy do stream diretamente pelo servidor
      resposta.header('Content-Type', formato.mimeType || 'audio/mpeg');
      resposta.header('Content-Disposition', 'inline');

      if (formato.contentLength) {
        resposta.header('Content-Length', formato.contentLength);
      }

      const youtubeStream = ytdl(idVideo, { format: formato });

      youtubeStream.on('error', (streamErr) => {
        console.error(`[STREAM] Erro no stream do ytdl para ${idVideo}:`, streamErr.message);
        if (!resposta.headersSent) {
          return resposta.status(500).send({ 
            erro: 'Erro ao transmitir áudio do YouTube',
            detalhes: streamErr.message
          });
        }
      });

      return youtubeStream.pipe(resposta);

    } catch (erro) {
      // Identifica se o erro é o famoso 403 (IP bloqueado pelo YouTube no servidor)
      console.warn(`[STREAM] ytdl falhou para ${idVideo} (Vercel IP?). Tentando Piped...`);

      // TENTATIVA ALTERNATIVA: Buscar stream via Piped (Bypass de 403)
      for (const instancia of INSTANCIAS_PIPED) {
        try {
          const { data } = await axios.get(`${instancia}/streams/${idVideo}`, { timeout: 4000 });
          const audioStream = data.audioStreams?.find(s => s.format === 'MPEG_4' || s.format === 'WEB_M_OPUS') || data.audioStreams?.[0];

          if (audioStream && audioStream.url) {
            console.log(`[STREAM] Sucesso via Piped (${instancia})`);
            
            const { data: fluxo, headers } = await axios({
              method: 'get',
              url: audioStream.url,
              responseType: 'stream',
              timeout: 10000
            });

            resposta.header('Content-Type', headers['content-type'] || 'audio/mpeg');
            resposta.header('Content-Disposition', 'inline');
            if (headers['content-length']) resposta.header('Content-Length', headers['content-length']);

            return resposta.send(fluxo);
          }
        } catch (e) {
          continue; // Tenta a próxima instância
        }
      }
      
      // FALLBACK FINAL: BUSCA EM OUTRAS PLATAFORMAS SE O YOUTUBE ESTIVER TOTALMENTE BLOQUEADO
      try {
        if (tituloVideo === 'Música') {
            const infoVideo = await axios.get(`https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${idVideo}&format=json`);
            tituloVideo = infoVideo.data.title;
        }

        const tituloLimpo = tituloVideo
            .replace(/\(Official.*?\)/gi, '')
            .replace(/\[Official.*\]/gi, '')
            .replace(/Video Clipe/gi, '')
            .replace(/Clipe Oficial/gi, '')
            .trim();

        console.log(`[FALLBACK] Buscando áudio para: ${tituloLimpo}`);

        const cid = await obterIdSoundCloud();
        const [buscaSc, buscaAudius, buscaSaavn] = await Promise.all([
          axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
            params: { q: tituloLimpo, client_id: cid, limit: 5 }
          }).catch(() => ({ data: { collection: [] } })),
          axios.get(`https://discoveryprovider.audius.co/v1/tracks/search`, {
            params: { query: tituloLimpo, app_name: 'VIBESOM' }
          }).catch(() => ({ data: { data: [] } })),
          axios.get(`https://saavn.me/search/songs`, {
            params: { query: tituloLimpo, limit: 5 }
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
          console.log(
            `[FALLBACK] IA escolheu ${escolhido.source}: ${escolhido.titulo} — ${escolhido.artista}`
          );
          return resposta.redirect(escolhido.redirect);
        }

        return resposta.status(404).send({ 
            erro: 'Não foi possível encontrar uma fonte de áudio alternativa.',
            titulo: tituloVideo
        });

      } catch (erroFallback) {
        console.error('[STREAM-FALLBACK] Erro fatal:', erroFallback.message);
        return resposta.status(500).send({ 
            erro: 'Erro ao processar stream e fallback',
            original: erro.message
        });
      }
    }
  });
}