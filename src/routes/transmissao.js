import axios from 'axios';
import ytdl from '@distube/ytdl-core';
import { escolherMelhorIndice } from '../lib/iaEscolher.js';

// ==========================================================
// HELPERS
// ==========================================================

let idSoundCloud = null;
let ultimaAtualizacaoChave = 0;

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

      if (formato && formato.url) {
        return resposta.redirect(formato.url);
      }
      
      throw new Error('Formato YouTube não encontrado');

    } catch (erro) {
      // Identifica se o erro é o famoso 403 (IP bloqueado pelo YouTube no servidor)
      const isBlocked = erro.message?.includes('403') || erro.statusCode === 403;
      if (isBlocked) {
        console.warn(`[STREAM] YouTube bloqueou a requisição (403) para ${idVideo}.`);
      }

      console.log(`[STREAM] Falha no ytdl para ${idVideo}, tentando fallback...`);
      
      // FALLBACK: BUSCA NO SOUNDCLOUD, AUDIUS OU SAAVN PELO TÍTULO
      try {
        // Se ainda não temos o título (erro no ytdl.getInfo), tenta via oEmbed
        if (tituloVideo === 'Música') {
            const infoVideo = await axios.get(`https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${idVideo}&format=json`);
            tituloVideo = infoVideo.data.title;
        }

        const tituloLimpo = tituloVideo
            .replace(/\(Official.*\)/gi, '')
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