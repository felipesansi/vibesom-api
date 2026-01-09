import axios from 'axios';
import ytdl from '@distube/ytdl-core';

export default async function rotasTransmissao(servidor) {

  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;
    const youtubeUrl = `https://www.youtube.com/watch?v=${idVideo}`;

    // Função para embaralhar arrays
    const shuffle = (array) => array.sort(() => Math.random() - 0.5);

    // 1. TENTATIVA COM INVIDIOUS (A mais resiliente no Vercel via local=true)
    // Removida nadeko temporariamente por instabilidade no servidor de mídia (inv-cl2)
    const instanciasInvidious = shuffle([
      'https://invidious.nerdvpn.de',
      'https://yewtu.be',
      'https://invidious.snopyta.org',
      'https://invidious.kavin.rocks',
      'https://inv.tux.pro',
      'https://invidious.drgns.space',
      'https://iv.ggtyler.dev',
      'https://invidious.lunar.icu'
    ]);

    for (const inv of instanciasInvidious) {
       // Redirecionamento direto sem verificação prévia (check)
       const proxyUrl = `${inv}/latest_version?id=${idVideo}&itag=140&local=true`;
       return resposta.status(302).redirect(proxyUrl);
    }

    // 2. TENTATIVA COM COBALT (Instâncias Comunitárias)
    const instanciasCobalt = shuffle([
      'https://api.qwkuns.me',
      'https://cobalt-backend.canine.tools',
      'https://nuko-c.meowing.de',
      'https://api.kektube.com'
    ]);

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
            'User-Agent': 'Mozilla/5.0'
          },
          timeout: 5000
        });

        const streamUrl = cobalt.data.url || cobalt.data.picker?.[0]?.url;
        if (streamUrl) return resposta.status(302).redirect(streamUrl);
      } catch (e) { continue; }
    }

    // 3. TENTATIVA COM PIPED
    const instanciasPiped = shuffle([
      'https://api.piped.private.coffee',
      'https://pipedapi.adminforge.de',
      'https://pipedapi.kavin.rocks',
      'https://api.piped.yt'
    ]);

    for (const api of instanciasPiped) {
      try {
        const res = await axios.get(`${api}/streams/${idVideo}`, { timeout: 4000 });
        const stream = res.data.audioStreams.find(s => s.format === 'M4A') || res.data.audioStreams[0];
        if (stream?.url) return resposta.status(302).redirect(stream.url);
      } catch (e) { continue; }
    }

    // 4. ÚLTIMA TENTATIVA COM YTDL-CORE
    try {
      const info = await ytdl.getInfo(youtubeUrl);
      const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
      if (format?.url) return resposta.status(302).redirect(format.url);
    } catch (e) {
      console.error("ytdl-core falhou:", e.message);
    }

    return resposta.status(503).send({ 
      erro: "Fontes detectaram bot",
      ajuda: "O YouTube bloqueou a requisição. Tente outro vídeo ou utilize a rota Audius." 
    });
  });

  // ROTA AUDIUS (A mais estável)
  servidor.get('/audius/stream/:id', async (requisicao, resposta) => {
    const { id } = requisicao.params;
    // Usando o gateway oficial de redirecionamento do Audius
    return resposta.status(302).redirect(`https://discoveryprovider.audius.co/v1/tracks/${id}/stream?app_name=VIBESOM`);
  });
}