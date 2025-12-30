import axios from 'axios';

export default async function rotasTransmissao(servidor) {

  // --- ROTA AUDIUS (VERSÃO ULTRA ESTÁVEL) ---
  servidor.get('/audius/stream/:id', async (requisicao, resposta) => {
    try {
      const { id } = requisicao.params;

      // 1. Pegar um host saudável da rede Audius dinamicamente
      const hostsResponse = await axios.get('https://api.audius.co');
      const hosts = hostsResponse.data.data;
      const baseHost = hosts[Math.floor(Math.random() * hosts.length)];

      console.log(`[AUDIUS] Usando host: ${baseHost}`);

      // 2. Construir a URL de stream
      // Usamos a API v1 que aceita o ID da track diretamente
      const streamUrl = `${baseHost}/v1/tracks/${id}/stream?app_name=VIBESOM`;

      // 3. Validar se o ID existe antes de redirecionar
      try {
        const check = await axios.get(`${baseHost}/v1/tracks/${id}?app_name=VIBESOM`);
        if (check.data) {
          return resposta.status(302).redirect(streamUrl);
        }
      } catch (e) {
        return resposta.status(404).send({ 
          erro: 'Música não encontrada', 
          detalhes: 'O ID informado não existe no Audius.' 
        });
      }

    } catch (erro) {
      console.error('[AUDIUS ERRO]:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao conectar na rede Audius' });
    }
  });

  // --- MANTENDO A ROTA YOUTUBE (COBALT FALLBACK) ---
  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;
    try {
      // Tentativa direta via Cobalt (mais estável para Vercel)
      const cobalt = await axios.post('https://api.cobalt.tools/api/json', 
        { url: `https://www.youtube.com/watch?v=${idVideo}`, downloadMode: 'audio' },
        { headers: { 'Origin': 'https://cobalt.tools', 'Referer': 'https://cobalt.tools/' } }
      );
      if (cobalt.data?.url) return resposta.status(302).redirect(cobalt.data.url);
    } catch (e) {
      return resposta.status(503).send({ erro: 'YouTube Offline' });
    }
  });
}