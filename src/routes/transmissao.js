import {
  resolverYouTubeDireto,
  obterMetadadosYouTube,
  limparTituloMusica,
  resolverMelhorFonteAudio
} from '../lib/fallbackManager.js';
import { fazerProxyStream } from '../lib/streamProxy.js';

export default async function rotasTransmissao(servidor) {

  servidor.get('/stream/:idVideo', {
    schema: {
      description: 'Stream de áudio do YouTube com suporte a Range headers e fallback multi-provedor (JioSaavn, SoundCloud, Audius, Jamendo)',
      tags: ['Streaming'],
      params: {
        type: 'object',
        required: ['idVideo'],
        properties: {
          idVideo: {
            type: 'string',
            description: 'ID do vídeo do YouTube (ex: dQw4w9WgXcQ)'
          }
        }
      },
      response: {
        200: {
          type: 'string',
          description: 'Arquivo de áudio em streaming'
        },
        404: {
          type: 'object',
          properties: {
            erro: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            erro: { type: 'string' }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;

    try {
      console.log(`[STREAM] Resolvendo ID do YouTube: ${idVideo}`);

      // 1. TENTATIVA DIRETA: Instâncias Piped / Invidious (Race com timeout ágil)
      const streamYt = await resolverYouTubeDireto(idVideo);
      if (streamYt?.url) {
        console.log(`[STREAM] YouTube direto OK (${streamYt.fonte}): ${streamYt.titulo || idVideo}`);
        return fazerProxyStream(requisicao, resposta, streamYt.url, {
          defaultContentType: streamYt.tipo || 'audio/mp4'
        });
      }

      // 2. FALLBACK INTELIGENTE: Obter título do vídeo e buscar em fontes de alta taxa de sucesso
      const metadados = await obterMetadadosYouTube(idVideo);
      const tituloOriginal = metadados?.titulo;

      if (!tituloOriginal) {
        return resposta.status(404).send({
          erro: 'Não foi possível obter metadados deste vídeo do YouTube para fallback.'
        });
      }

      const tituloLimpo = limparTituloMusica(tituloOriginal);
      const artista = metadados.artista || '';
      console.log(`[STREAM] Iniciando fallback multi-provedor para: "${artista} - ${tituloLimpo}"`);

      const melhorFonte = await resolverMelhorFonteAudio(artista, tituloLimpo);

      if (melhorFonte && melhorFonte.streamUrl) {
        console.log(`[STREAM] ✅ Fallback redirecionado para: ${melhorFonte.source} — ${melhorFonte.titulo}`);
        return resposta.redirect(melhorFonte.streamUrl);
      }

      return resposta.status(404).send({
        erro: 'Não foi possível encontrar áudio reproduzível para este vídeo.',
        titulo: tituloOriginal
      });

    } catch (erro) {
      console.error('[STREAM] Erro fatal no processamento:', erro.message);
      return resposta.status(500).send({
        erro: 'Erro ao processar stream',
        detalhes: erro.message
      });
    }
  });
}
