import axios from 'axios';
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

  // ROTA PRINCIPAL DE STREAM (Busca automática em fontes alternativas)
  servidor.get('/stream/:idVideo', {
    schema: {
      description: 'Obtém áudio equivalente de fontes estáveis (SoundCloud/Audius) usando um ID de referência',
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
    
    try {
      // 1. Obtém apenas o título do vídeo via oEmbed (API leve e sem bloqueios de streaming)
      console.log(`[STREAM] Resolvendo título para ID: ${idVideo}`);
      const infoVideo = await axios.get(`https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${idVideo}&format=json`);
      const tituloOriginal = infoVideo.data.title;
      
      const tituloLimpo = tituloOriginal
            .replace(/\(Official.*?\)/gi, '')
            .replace(/\[Official.*\]/gi, '')
            .replace(/Video Clipe/gi, '')
            .replace(/Clipe Oficial/gi, '')
            .trim();

      console.log(`[STREAM] Buscando áudio equivalente para: ${tituloLimpo}`);

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
            `[STREAM] IA selecionou ${escolhido.source}: ${escolhido.titulo}`
          );
          return resposta.redirect(escolhido.redirect);
        }

        return resposta.status(404).send({ 
            erro: 'Não foi possível encontrar uma fonte de áudio estável para este vídeo.',
            titulo: tituloOriginal
        });

    } catch (erro) {
      console.error('[STREAM] Erro fatal:', erro.message);
      return resposta.status(500).send({ 
          erro: 'Erro ao processar busca de áudio estável',
          detalhes: erro.message
      });
    }
  });
}