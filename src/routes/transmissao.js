import axios from 'axios';
import ytdl from '@distube/ytdl-core';

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

        // 1. TENTA SOUNDCLOUD (Proxy Interno)
        const cid = await obterIdSoundCloud();
        const buscaSc = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
            params: { q: tituloLimpo, client_id: cid, limit: 1 }
        });

        if (buscaSc.data.collection?.[0]) {
            const idSc = buscaSc.data.collection[0].id;
            console.log(`[FALLBACK] Encontrado no SoundCloud: ${idSc}`);
            return resposta.redirect(`/soundcloud/stream/${idSc}`);
        }

        // 2. TENTA AUDIUS (Proxy Interno)
        const buscaAudius = await axios.get(`https://discoveryprovider.audius.co/v1/tracks/search`, {
            params: { query: tituloLimpo, app_name: 'VIBESOM' }
        });

        if (buscaAudius.data.data?.[0]) {
            const idAudius = buscaAudius.data.data[0].id;
            console.log(`[FALLBACK] Encontrado no Audius: ${idAudius}`);
            return resposta.redirect(`/audius/stream/${idAudius}`);
        }

        // 3. TENTA SAAVN (Proxy Interno)
        const buscaSaavn = await axios.get(`https://saavn.me/search/songs`, {
            params: { query: tituloLimpo, limit: 1 }
        });

        if (buscaSaavn.data.data?.results?.[0]) {
            const musicaSaavn = buscaSaavn.data.data.results[0];
            const urlDownload = musicaSaavn.downloadUrl?.find(q => q.quality === '320kbps')?.link || 
                                musicaSaavn.downloadUrl?.[musicaSaavn.downloadUrl.length - 1]?.link;
            if (urlDownload) {
                console.log(`[FALLBACK] Encontrado no Saavn: ${musicaSaavn.id}`);
                return resposta.redirect(`/saavn/stream?url=${encodeURIComponent(urlDownload)}`);
            }
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