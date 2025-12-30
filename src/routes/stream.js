import axios from 'axios';

const INSTANCIAS_PIPED = [
  'https://pipedapi.oxit.uk',
  'https://api-piped.mha.fi',
  'https://pipedapi.astartes.nl',
  'https://pipedapi.drgns.space'
];

export default async function rotasTransmissao(servidor) {
  
  // ROTA YOUTUBE (PIPED + COBALT)
  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;
    const youtubeUrl = `https://www.youtube.com/watch?v=${idVideo}`;

    for (const instancia of INSTANCIAS_PIPED) {
      try {
        const { data } = await axios.get(`${instancia}/streams/${idVideo}`, { 
          timeout: 3000,
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const audio = data.audioStreams?.find(s => s.format === 'M4A') || data.audioStreams?.[0];
        if (audio?.url) {
          return resposta.status(302).redirect(audio.url);
        }
      } catch (e) { continue; }
    }

    // Fallback Cobalt com Headers de Browser
    try {
      const cobaltRes = await axios.post('https://api.cobalt.tools/api/json', 
        { url: youtubeUrl, downloadMode: 'audio' },
        { headers: { 'Origin': 'https://cobalt.tools', 'Referer': 'https://cobalt.tools/' } }
      );
      if (cobaltRes.data?.url) return resposta.status(302).redirect(cobaltRes.data.url);
    } catch (e) {}

    return resposta.status(503).send({ erro: 'Não foi possível obter o áudio' });
  });

  // ROTA AUDIUS (CORRIGIDA)
  servidor.get('/audius/stream/:id', async (requisicao, resposta) => {
    try {
      const { id } = requisicao.params;
      const urlAudius = `https://discoveryprovider.audius.co/v1/tracks/${id}/stream?app_name=VIBESOM`;
      
      // O erro FST_ERR_BAD_STATUS_CODE ocorre aqui. 
      // Usar .status(302).redirect() garante que o Fastify entenda o comando.
      return resposta.status(302).redirect(urlAudius);
    } catch (erro) {
      return resposta.status(500).send({ erro: 'Erro interno no Audius' });
    }
  });
}