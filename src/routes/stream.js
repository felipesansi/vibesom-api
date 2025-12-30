import axios from 'axios';

export default async function rotasTransmissao(servidor) {

  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;
    
    // Lista de instâncias que rodam em infraestruturas diferentes (menos bloqueios)
    const instancias = [
      'https://pipedapi.kavin.rocks',
      'https://piped-api.lunar.icu',
      'https://api.piped.privacydev.net'
    ];

    for (const api of instancias) {
      try {
        const res = await axios.get(`${api}/streams/${idVideo}`, {
          timeout: 4000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        const stream = res.data.audioStreams.find(s => s.format === 'M4A') || res.data.audioStreams[0];
        if (stream?.url) {
          return resposta.status(302).redirect(stream.url);
        }
      } catch (err) {
        console.error(`Falha na instância: ${api}`);
        continue;
      }
    }

    // Se falhar, tentamos o Invidious (Outra rede alternativa ao Piped)
    try {
      const invidiousRes = await axios.get(`https://invidious.sethforprivacy.com/api/v1/videos/${idVideo}`, { timeout: 4000 });
      const adaptive = invidiousRes.data.adaptiveFormats.find(f => f.type.includes('audio/mp4'));
      if (adaptive?.url) return resposta.status(302).redirect(adaptive.url);
    } catch (e) {}

    return resposta.status(503).send({ 
      erro: "Bloqueio do Google detectado",
      ajuda: "Tente novamente em 5 segundos ou use um ID do Audius." 
    });
  });

  // Audius sem frescura (Direto para o nó principal)
  servidor.get('/audius/stream/:id', async (requisicao, resposta) => {
    const { id } = requisicao.params;
    const url = `https://audius-discovery-1.thenode.io/v1/tracks/${id}/stream?app_name=VIBESOM`;
    return resposta.status(302).redirect(url);
  });
}