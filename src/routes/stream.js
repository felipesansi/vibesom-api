import axios from 'axios';

export default async function rotasTransmissao(servidor) {

  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;
    const youtubeUrl = `https://www.youtube.com/watch?v=${idVideo}`;

    // TENTATIVA 1: COBALT COM HEADERS DE NAVEGADOR (Mais potente)
    try {
      const cobalt = await axios.post('https://api.cobalt.tools/api/json', {
        url: youtubeUrl,
        downloadMode: 'audio',
        audioFormat: 'mp3'
      }, {
        headers: {
          'Origin': 'https://cobalt.tools',
          'Referer': 'https://cobalt.tools/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 5000
      });

      if (cobalt.data?.url) {
        return resposta.status(302).redirect(cobalt.data.url);
      }
    } catch (e) {
      console.log("Cobalt falhou, tentando Invidious...");
    }

    // TENTATIVA 2: INVIDIOUS (Instância com Proxy próprio)
    const invidiousInstances = [
      'https://invidious.flokinet.to',
      'https://iv.ggtyler.dev',
      'https://invidious.projectsegfau.lt'
    ];

    for (const inst of invidiousInstances) {
      try {
        const res = await axios.get(`${inst}/api/v1/videos/${idVideo}`, { timeout: 3000 });
        const format = res.data.adaptiveFormats.find(f => f.container === 'm4a' || f.type.includes('audio/mp4'));
        if (format?.url) {
          return resposta.status(302).redirect(format.url);
        }
      } catch (err) { continue; }
    }

    // ÚLTIMO RECURSO: Redirecionar para um serviço de terceiro estável
    // Se nada funcionar, o app do usuário tenta abrir o link via esse serviço
    return resposta.status(302).redirect(`https://api.cobalt.tools/api/json?url=${youtubeUrl}`);
  });

  // AUDIUS - Usando o nó da Cloudflare (mais rápido do mundo)
  servidor.get('/audius/stream/:id', async (requisicao, resposta) => {
    const { id } = requisicao.params;
    // O ID deve ser o numérico ou o slug correto.
    const url = `https://audius-discovery-1.ledger-nodes.com/v1/tracks/${id}/stream?app_name=VIBESOM`;
    return resposta.status(302).redirect(url);
  });
}