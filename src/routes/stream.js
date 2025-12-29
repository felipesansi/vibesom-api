import axios from 'axios';

const INSTANCIAS_PIPED = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.rekindle.ph',
  'https://api.piped.privacydev.net'
];

export default async function rotasTransmissao(servidor) {
  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;

    if (!idVideo) {
      return resposta.status(400).send({ erro: 'ID do vídeo é obrigatório' });
    }

    for (const instancia of INSTANCIAS_PIPED) {
      try {
        // Obtém os dados de stream do vídeo
        const { data } = await axios.get(`${instancia}/streams/${idVideo}`, {
          timeout: 4000
        });

        // Tenta encontrar o melhor stream de áudio (M4A é ótimo para dispositivos móveis)
        // Filtrando por formato e qualidade para garantir que toque em qualquer player
        const audioStream = data.audioStreams.find(s => s.codec === 'opus') || 
                           data.audioStreams.find(s => s.format === 'M4A') ||
                           data.audioStreams[0];

        if (!audioStream || !audioStream.url) continue;

        console.log(`[SUCESSO] Link de áudio obtido via ${instancia}`);

        // Adicionamos headers para ajudar o player do App a gerenciar o cache e o tipo
        resposta.header('Cache-Control', 'public, max-age=3600');
        
        // Redirecionamento 302 (Encontrado)
        // O App receberá o link direto da CDN do YouTube/Google que o Piped extraiu
        // Isso remove a carga de processamento do seu servidor Vercel.
        return resposta.redirect(302, audioStream.url);

      } catch (erro) {
        console.error(`[FALHA] Instância ${instancia} falhou no stream:`, erro.message);
        continue;
      }
    }

    return resposta.status(503).send({ 
      erro: 'Não foi possível gerar o link de áudio',
      ajuda: 'Tente outro vídeo ou aguarde alguns segundos.'
    });
  });

  // Rota extra para Audius (Opcional, mas muito estável)
  servidor.get('/audius/stream/:id', async (requisicao, resposta) => {
    const { id } = requisicao.params;
    // Redireciona direto para a API oficial da Audius que é livre e sem anúncios
    return resposta.redirect(302, `https://discoveryprovider.audius.co/v1/tracks/${id}/stream?app_name=VIBESOM`);
  });
}

