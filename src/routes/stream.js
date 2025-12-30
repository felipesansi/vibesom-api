import axios from 'axios';

const INSTANCIAS_PIPED = [
  'https://pipedapi.oxit.uk',
  'https://api-piped.mha.fi',
  'https://pipedapi.astartes.nl'
];

export default async function rotasTransmissao(servidor) {
  
  // --- ROTA YOUTUBE ---
  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;
    
    for (const instancia of INSTANCIAS_PIPED) {
      try {
        const { data } = await axios.get(`${instancia}/streams/${idVideo}`, { timeout: 3000 });
        const audio = data.audioStreams?.find(s => s.format === 'M4A') || data.audioStreams?.[0];
        if (audio?.url) return resposta.status(302).redirect(audio.url);
      } catch (e) { continue; }
    }

    // Fallback Cobalt
    try {
      const cobalt = await axios.post('https://api.cobalt.tools/api/json', 
        { url: `https://www.youtube.com/watch?v=${idVideo}`, downloadMode: 'audio' },
        { headers: { 'Origin': 'https://cobalt.tools', 'Referer': 'https://cobalt.tools/' } }
      );
      if (cobalt.data?.url) return resposta.status(302).redirect(cobalt.data.url);
    } catch (e) {}

    return resposta.status(503).send({ erro: 'Falha no stream do YouTube' });
  });

  // --- ROTA AUDIUS (CORRIGIDA) ---
  servidor.get('/audius/stream/:id', async (requisicao, resposta) => {
    try {
      const { id } = requisicao.params;
      
      // 1. O Audius agora exige IDs numéricos ou convertidos. 
      // Vamos usar o endpoint de 'resolve' para pegar o stream correto.
      const host = 'https://discoveryprovider.audius.co';
      
      // Se o ID for curto (slug), precisamos primeiro validar a track
      // Tentativa direta com o novo formato de stream
      const streamUrl = `${host}/v1/tracks/${id}/stream?app_name=VIBESOM`;
      
      // Testamos a URL antes de redirecionar para evitar o erro 400 para o usuário
      try {
        await axios.head(streamUrl);
        return resposta.status(302).redirect(streamUrl);
      } catch (e) {
        // Se falhar, tentamos buscar pelo ID alternativo via busca (opcional)
        return resposta.status(400).send({ 
          erro: 'ID do Audius inválido', 
          ajuda: 'Verifique se o ID da música está correto no Audius.' 
        });
      }
    } catch (erro) {
      return resposta.status(500).send({ erro: 'Erro no servidor Audius' });
    }
  });
}