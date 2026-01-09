import axios from 'axios';
import ytdl from '@distube/ytdl-core';

export default async function rotasTransmissao(servidor) {

  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;
    const youtubeUrl = `https://www.youtube.com/watch?v=${idVideo}`;

    // Função para embaralhar arrays
    const shuffle = (array) => array.sort(() => Math.random() - 0.5);

    // 1. TENTATIVA COM INVIDIOUS PROXY (Mais chance de funcionar para o usuário final)
    const instanciasInvidious = shuffle([
      'https://invidious.nerdvpn.de',
      'https://yewtu.be',
      'https://inv.nadeko.net',
      'https://invidious.snopyta.org',
      'https://invidious.kavin.rocks',
      'https://inv.tux.pro',
      'https://invidious.drgns.space'
    ]);

    for (const inv of instanciasInvidious) {
      try {
        // O padrão 'latest_version' com 'local=true' força o Invidious a fazer proxy do áudio
        // Isso evita o erro de IP bloqueado (403) no dispositivo do usuário
        const proxyUrl = `${inv}/latest_version?id=${idVideo}&itag=140&local=true`;
        
        // Fazemos um pequeno head para ver se a instância está viva
        const check = await axios.head(proxyUrl, { timeout: 2500, validateStatus: false });
        if (check.status === 302 || check.status === 200) {
           return resposta.status(302).redirect(proxyUrl);
        }
      } catch (e) { continue; }
    }

    // 2. TENTATIVA COM COBALT (Instâncias Comunitárias)
    const instanciasCobalt = shuffle([
      'https://api.qwkuns.me',
      'https://cobalt-backend.canine.tools',
      'https://nuko-c.meowing.de',
      'https://api.kektube.com',
      'https://api.cobalt.tools'
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
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
          },
          timeout: 4000
        });

        let streamUrl = cobalt.data.url || cobalt.data.picker?.[0]?.url;
        if (!streamUrl && cobalt.data.status === 'stream') streamUrl = cobalt.data.url;
        if (streamUrl) return resposta.status(302).redirect(streamUrl);
      } catch (e) { 
        try {
           const cobaltRoot = await axios.post(`${api}`, { url: youtubeUrl, downloadMode: 'audio' }, { timeout: 3000 });
           if (cobaltRoot.data.url) return resposta.status(302).redirect(cobaltRoot.data.url);
        } catch (err) { continue; }
      }
    }

    // 3. TENTATIVA COM PIPED
    const instanciasPiped = shuffle([
      'https://api.piped.private.coffee',
      'https://pipedapi.adminforge.de',
      'https://pipedapi.leptons.xyz',
      'https://pipedapi.kavin.rocks',
      'https://api.piped.yt',
      'https://pipedapi-libre.kavin.rocks',
      'https://pipedapi.lunar.icu'
    ]);

    for (const api of instanciasPiped) {
      try {
        const res = await axios.get(`${api}/streams/${idVideo}`, { timeout: 3000 });
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
      erro: "Todas as fontes falharam",
      ajuda: "O Google detectou tráfego automatizado. Tente novamente em 10 segundos ou use a rota Audius." 
    });
  });

  // ROTA AUDIUS (A mais estável)
  servidor.get('/audius/stream/:id', async (requisicao, resposta) => {
    const { id } = requisicao.params;
    // Usando o gateway oficial de redirecionamento do Audius
    return resposta.status(302).redirect(`https://discoveryprovider.audius.co/v1/tracks/${id}/stream?app_name=VIBESOM`);
  });
}