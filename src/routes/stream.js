import axios from 'axios';
import ytdl from '@distube/ytdl-core';

export default async function rotasTransmissao(servidor) {

  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;
    const youtubeUrl = `https://www.youtube.com/watch?v=${idVideo}`;

    // 1. TENTATIVA COM PIPED (Instâncias que ainda funcionam com Vercel)
    const instanciasPiped = [
      'https://api.piped.private.coffee',
      'https://pipedapi.adminforge.de',
      'https://pipedapi.leptons.xyz',
      'https://pipedapi.kavin.rocks',
      'https://api.piped.yt',
      'https://pipedapi-libre.kavin.rocks',
      'https://pipedapi.lunar.icu'
    ];

    for (const api of instanciasPiped) {
      try {
        const res = await axios.get(`${api}/streams/${idVideo}`, { timeout: 3000 });
        const stream = res.data.audioStreams.find(s => s.format === 'M4A') || res.data.audioStreams[0];
        if (stream?.url) return resposta.status(302).redirect(stream.url);
      } catch (e) { continue; }
    }

    // 2. TENTATIVA COM COBALT (Instâncias Comunitárias)
    const instanciasCobalt = [
      'https://api.qwkuns.me',
      'https://cobalt-backend.canine.tools',
      'https://nuko-c.meowing.de',
      'https://api.kektube.com',
      'https://api.cobalt.tools'
    ];

    for (const api of instanciasCobalt) {
      try {
        const cobalt = await axios.post(`${api}/api/json`, {
          url: youtubeUrl,
          downloadMode: 'audio',
          audioFormat: 'mp3'
        }, {
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
          },
          timeout: 4000
        });

        const streamUrl = cobalt.data.url || cobalt.data.picker?.[0]?.url;
        if (streamUrl) return resposta.status(302).redirect(streamUrl);
      } catch (e) { continue; }
    }

    // 3. TENTATIVA COM INVIDIOUS
    const instanciasInvidious = [
      'https://invidious.snopyta.org',
      'https://yewtu.be',
      'https://invidious.kavin.rocks'
    ];

    for (const inv of instanciasInvidious) {
      try {
        const { data } = await axios.get(`${inv}/api/v1/videos/${idVideo}`, { timeout: 3000 });
        const format = data.formatStreams.find(s => s.container === 'm4a') || data.adaptiveFormats.find(s => s.type.includes('audio'));
        if (format?.url) return resposta.status(302).redirect(format.url);
      } catch (e) { continue; }
    }

    // 4. ÚLTIMA TENTATIVA COM YTDL-CORE (Geralmente bloqueado no Vercel)
    try {
      const info = await ytdl.getInfo(youtubeUrl);
      const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
      if (format?.url) return resposta.status(302).redirect(format.url);
    } catch (e) {
      console.error("ytdl-core falhou:", e.message);
    }

    return resposta.status(503).send({ 
      erro: "Todas as fontes falharam",
      ajuda: "O Google bloqueou este IP da Vercel. Tente novamente em instantes ou utilize a rota do Audius." 
    });
  });

  // ROTA AUDIUS (A mais estável)
  servidor.get('/audius/stream/:id', async (requisicao, resposta) => {
    const { id } = requisicao.params;
    // Usando o gateway oficial de redirecionamento do Audius
    return resposta.status(302).redirect(`https://discoveryprovider.audius.co/v1/tracks/${id}/stream?app_name=VIBESOM`);
  });
}