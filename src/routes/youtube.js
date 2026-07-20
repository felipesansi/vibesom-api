import yts from 'yt-search';
import axios from 'axios';

// Mesmas instâncias Piped já usadas no projeto
const INSTANCIAS_PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt'
];

/**
 * Tenta buscar o stream de áudio via Piped.
 * Retorna a URL direta do áudio ou null se falhar.
 */
async function resolverStreamViaPiped(idVideo) {
  for (const instancia of INSTANCIAS_PIPED) {
    try {
      const { data } = await axios.get(`${instancia}/streams/${idVideo}`, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      // Prefere audioStreams (só áudio, menor tamanho)
      const audio = data.audioStreams?.find(s => s.url);
      if (audio?.url) {
        console.log(`[YT] Piped OK (${instancia}) — audioStream`);
        return { url: audio.url, tipo: 'audio/mp4' };
      }

      // Fallback: vídeo com áudio embutido
      const video = data.videoStreams?.find(s => !s.videoOnly && s.url);
      if (video?.url) {
        console.log(`[YT] Piped OK (${instancia}) — videoStream`);
        return { url: video.url, tipo: 'video/mp4' };
      }
    } catch (e) {
      console.warn(`[YT] Piped ${instancia} falhou:`, e.message);
    }
  }
  return null;
}

export default async function rotasYoutube(servidor) {

  // ─── BUSCA ────────────────────────────────────────────────────────────────
  servidor.get('/youtube/busca', {
    schema: {
      description: 'Busca músicas diretamente no YouTube (sem login / sem Spotify)',
      tags: ['YouTube'],
      querystring: {
        type: 'object',
        required: ['termo'],
        properties: {
          termo: {
            type: 'string',
            description: 'Termo de busca (nome da música, artista etc.)'
          },
          limite: {
            type: 'integer',
            default: 10,
            description: 'Quantidade máxima de resultados (padrão: 10)'
          }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source:    { type: 'string' },
              id:        { type: 'string' },
              titulo:    { type: 'string' },
              artista:   { type: 'string' },
              capa:      { type: 'string' },
              duracao:   { type: 'number' },
              streamUrl: { type: 'string' }
            }
          }
        },
        400: { type: 'object', properties: { erro: { type: 'string' } } },
        404: { type: 'object', properties: { erro: { type: 'string' } } }
      }
    }
  }, async (requisicao, resposta) => {
    const { termo, limite = 10 } = requisicao.query;
    if (!termo) return resposta.status(400).send({ erro: 'Parâmetro "termo" é obrigatório.' });

    try {
      console.log(`[YT BUSCA] "${termo}"`);

      const resultado = await yts({ query: `${termo} music`, pages: 1 });
      const videos = resultado.videos.slice(0, Number(limite));

      if (videos.length === 0) {
        return resposta.status(404).send({ erro: 'Nenhum resultado encontrado no YouTube.' });
      }

      const itens = videos.map(v => ({
        source:    'YouTube',
        id:        v.videoId,
        titulo:    v.title,
        artista:   v.author?.name || 'Desconhecido',
        capa:      v.thumbnail,
        duracao:   v.seconds || 0,
        streamUrl: `/youtube/stream/${v.videoId}`
      }));

      return resposta.send(itens);
    } catch (erro) {
      console.error('[YT BUSCA] Erro:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao buscar no YouTube.', detalhes: erro.message });
    }
  });

  // ─── STREAM ───────────────────────────────────────────────────────────────
  servidor.get('/youtube/stream/:idVideo', {
    schema: {
      description: 'Stream de áudio de um vídeo do YouTube via Piped (sem login)',
      tags: ['YouTube'],
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
        200:  { type: 'string', description: 'Áudio em streaming' },
        404:  { type: 'object', properties: { erro: { type: 'string' } } },
        500:  { type: 'object', properties: { erro: { type: 'string' } } }
      }
    }
  }, async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;

    try {
      console.log(`[YT STREAM] ID: ${idVideo}`);

      const stream = await resolverStreamViaPiped(idVideo);

      if (!stream?.url) {
        return resposta.status(404).send({
          erro: 'Não foi possível obter o stream deste vídeo. Tente novamente em instantes.'
        });
      }

      // Faz proxy do stream para o cliente
      const { data: fluxo, headers } = await axios({
        method: 'get',
        url: stream.url,
        responseType: 'stream',
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      resposta.header('Content-Type', headers['content-type'] || stream.tipo || 'audio/mp4');
      resposta.header('Content-Disposition', 'inline');
      if (headers['content-length']) {
        resposta.header('Content-Length', headers['content-length']);
      }

      return resposta.send(fluxo);
    } catch (erro) {
      console.error('[YT STREAM] Erro:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao processar stream.', detalhes: erro.message });
    }
  });

  // ─── INFO ─────────────────────────────────────────────────────────────────
  servidor.get('/youtube/info/:idVideo', {
    schema: {
      description: 'Retorna metadados de um vídeo do YouTube (sem login)',
      tags: ['YouTube'],
      params: {
        type: 'object',
        required: ['idVideo'],
        properties: {
          idVideo: { type: 'string', description: 'ID do vídeo do YouTube' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id:       { type: 'string' },
            titulo:   { type: 'string' },
            artista:  { type: 'string' },
            capa:     { type: 'string' },
            duracao:  { type: 'number' },
            views:    { type: 'number' },
            descricao:{ type: 'string' }
          }
        },
        404: { type: 'object', properties: { erro: { type: 'string' } } }
      }
    }
  }, async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;

    try {
      const resultado = await yts({ videoId: idVideo });

      if (!resultado) {
        return resposta.status(404).send({ erro: 'Vídeo não encontrado.' });
      }

      return resposta.send({
        id:        resultado.videoId,
        titulo:    resultado.title,
        artista:   resultado.author?.name || 'Desconhecido',
        capa:      resultado.thumbnail,
        duracao:   resultado.seconds || 0,
        views:     resultado.views || 0,
        descricao: resultado.description || ''
      });
    } catch (erro) {
      console.error('[YT INFO] Erro:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao buscar informações.', detalhes: erro.message });
    }
  });
}
