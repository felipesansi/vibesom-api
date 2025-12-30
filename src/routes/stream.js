import axios from 'axios';

export default async function rotasTransmissao(servidor) {

  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;
    const youtubeUrl = `https://www.youtube.com/watch?v=${idVideo}`;

    // 1. TENTATIVA COM PIPED (Instâncias que ainda funcionam com Vercel)
    const instanciasPiped = [
      'https://pipedapi.lunar.icu',
      'https://api-piped.mha.fi',
      'https://pipedapi.oxit.uk'
    ];

    for (const api of instanciasPiped) {
      try {
        const res = await axios.get(`${api}/streams/${idVideo}`, { timeout: 3000 });
        const stream = res.data.audioStreams.find(s => s.format === 'M4A') || res.data.audioStreams[0];
        if (stream?.url) return resposta.status(302).redirect(stream.url);
      } catch (e) { continue; }
    }

    // 2. TENTATIVA COM A NOVA API DO COBALT (v10)
    try {
      // O Cobalt agora exige headers específicos e mudou o endpoint
      const cobalt = await axios.post('https://api.cobalt.tools/api/json', {
        url: youtubeUrl,
        downloadMode: 'audio',
        audioFormat: 'mp3'
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
        }
      });

      // Na v10, a URL pode vir dentro de 'url' ou 'picker'
      const streamUrl = cobalt.data.url || cobalt.data.picker?.[0]?.url;
      
      if (streamUrl) {
        return resposta.status(302).redirect(streamUrl);
      }
    } catch (e) {
      console.error("Cobalt v10 falhou ou IP bloqueado.");
    }

    return resposta.status(503).send({ 
      erro: "Todas as fontes falharam",
      ajuda: "O Google bloqueou este IP da Vercel. Tente novamente em instantes." 
    });
  });

  // ROTA AUDIUS (A mais estável)
  servidor.get('/audius/stream/:id', async (requisicao, resposta) => {
    const { id } = requisicao.params;
    // Usando o gateway oficial de redirecionamento do Audius
    return resposta.status(302).redirect(`https://discoveryprovider.audius.co/v1/tracks/${id}/stream?app_name=VIBESOM`);
  });
}