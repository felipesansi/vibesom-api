import axios from 'axios';

const INSTANCIAS_PIPED = [
  'https://api.piped.victr.me',
  'https://pipedapi.kavin.rocks',
  'https://piped-api.garudalinux.org',
  'https://api-piped.mha.fi'
];

export default async function rotasTransmissao(servidor) {
  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;
    const youtubeUrl = `https://www.youtube.com/watch?v=${idVideo}`;

    // 1. TENTATIVA COM PIPED (Rápido e direto)
    for (const instancia of INSTANCIAS_PIPED) {
      try {
        const { data } = await axios.get(`${instancia}/streams/${idVideo}`, { 
          timeout: 3500,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const audioStream = data.audioStreams.find(s => s.format === 'M4A') || data.audioStreams[0];
        
        if (audioStream?.url) {
          console.log(`[PIPED] Sucesso via ${instancia}`);
          return resposta.redirect(302, audioStream.url);
        }
      } catch (e) {
        console.error(`[PIPED] Falha na instância ${instancia}`);
        continue;
      }
    }

    // 2. PLANO B: COBALT API (Extremamente resiliente)
    try {
      console.log(`[COBALT] Tentando recuperar áudio para: ${idVideo}`);
      const cobaltRes = await axios.post('https://api.cobalt.tools/api/json', {
        url: youtubeUrl,
        downloadMode: 'audio',
        audioFormat: 'mp3',
        audioBitrate: '128'
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: 6000
      });

      if (cobaltRes.data?.url) {
        return resposta.redirect(302, cobaltRes.data.url);
      }
    } catch (e) {
      console.error(`[COBALT] Falha crítica:`, e.message);
    }

    // 3. SE TUDO FALHAR
    return resposta.status(503).send({ 
      erro: 'Serviço temporariamente indisponível',
      ajuda: 'O Google bloqueou as requisições. Tente novamente em instantes.' 
    });
  });

  // Audius permanece como uma ótima alternativa estável
  servidor.get('/audius/stream/:id', async (requisicao, resposta) => {
    const { id } = requisicao.params;
    return resposta.redirect(302, `https://discoveryprovider.audius.co/v1/tracks/${id}/stream?app_name=VIBESOM`);
  });
}