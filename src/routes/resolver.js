import { resolverMelhorFonteAudio } from '../lib/fallbackManager.js';

export default async function rotasResolver(servidor) {
  servidor.get('/resolver', {
    schema: {
      description: 'Resolve a melhor fonte de áudio sequencialmente com alta taxa de sucesso e validação (JioSaavn -> YouTube -> SoundCloud -> Audius -> Jamendo)',
      tags: ['Streaming', 'Busca'],
      querystring: {
        type: 'object',
        required: ['artista', 'faixa'],
        properties: {
          artista: { type: 'string', description: 'Nome do artista' },
          faixa: { type: 'string', description: 'Título da música' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            url: { type: 'string' },
            streamUrl: { type: 'string' },
            titulo: { type: 'string' },
            artista: { type: 'string' },
            capa: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: { erro: { type: 'string' } }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { artista, faixa } = requisicao.query;

    if (!artista && !faixa) {
      return resposta.status(400).send({ erro: 'Informe o artista ou a faixa para resolução.' });
    }

    try {
      const melhor = await resolverMelhorFonteAudio(artista, faixa);

      if (melhor && (melhor.streamUrl || melhor.url)) {
        return resposta.send({
          source: melhor.source,
          url: melhor.streamUrl || melhor.url,
          streamUrl: melhor.streamUrl || melhor.url,
          titulo: melhor.titulo,
          artista: melhor.artista,
          capa: melhor.capa
        });
      }

      return resposta.status(404).send({ erro: 'Áudio não encontrado em nenhuma plataforma.' });
    } catch (erro) {
      console.error('[RESOLVER] Erro:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao resolver fonte de áudio.', detalhes: erro.message });
    }
  });
}
