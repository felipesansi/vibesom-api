import axios from 'axios';
import { obterUsuarioAutenticado } from '../lib/authHelper.js';
import { seguirArtista, deixarDeSeguirArtista, estaSeguindo, listarArtistasSeguidos, salvarArtista } from '../lib/db.js';
import { agregarNovosLancamentos } from '../lib/releasesManager.js';

export default async function rotasArtists(servidor) {

  // ─── SEGUIR ARTISTA ────────────────────────────────────────────────────────
  servidor.post('/artists/:artistId/follow', {
    schema: {
      description: 'Associa o artista ao usuário autenticado (Seguir Artista)',
      tags: ['Artista'],
      params: {
        type: 'object',
        required: ['artistId'],
        properties: {
          artistId: { type: 'string', description: 'ID do artista (ex: ID do Deezer ou Audius)' }
        }
      },
      body: {
        type: 'object',
        nullable: true,
        properties: {
          name: { type: 'string', description: 'Nome do artista (opcional)' },
          image: { type: 'string', description: 'URL da foto do artista (opcional)' },
          source: { type: 'string', description: 'Plataforma de origem (ex: deezer, audius)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            sucesso: { type: 'boolean' },
            mensagem: { type: 'string' },
            artistId: { type: 'string' },
            following: { type: 'boolean' }
          }
        },
        400: { type: 'object', properties: { erro: { type: 'string' } } },
        401: { type: 'object', properties: { erro: { type: 'string' } } }
      }
    }
  }, async (requisicao, resposta) => {
    const usuario = obterUsuarioAutenticado(requisicao, resposta);
    if (!usuario) return; // 401 já enviado pelo helper

    const { artistId } = requisicao.params;
    if (!artistId) {
      return resposta.status(400).send({ erro: 'O parâmetro artistId é obrigatório.' });
    }

    const corpo = requisicao.body || {};
    let nomeArtista = corpo.name || corpo.nome;
    let capaArtista = corpo.image || corpo.capa || corpo.picture;
    let source = corpo.source || 'deezer';

    // Se o nome não foi enviado no body, tenta buscar automaticamente no Deezer
    if (!nomeArtista && /^\d+$/.test(artistId)) {
      try {
        const { data: deezerArtist } = await axios.get(`https://api.deezer.com/artist/${artistId}`, { timeout: 3000 });
        if (deezerArtist?.name) {
          nomeArtista = deezerArtist.name;
          capaArtista = deezerArtist.picture_xl || deezerArtist.picture_medium || capaArtista;
        }
      } catch (e) {}
    }

    try {
      await seguirArtista(usuario.id, artistId, {
        name: nomeArtista || `Artista ${artistId}`,
        image: capaArtista,
        source
      });

      return resposta.send({
        sucesso: true,
        mensagem: 'Artista seguido com sucesso.',
        artistId: String(artistId),
        following: true
      });
    } catch (erro) {
      console.error('[ARTISTS] Erro ao seguir artista:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao seguir artista.', detalhes: erro.message });
    }
  });

  // ─── DEIXAR DE SEGUIR ARTISTA ──────────────────────────────────────────────
  servidor.delete('/artists/:artistId/follow', {
    schema: {
      description: 'Remove o relacionamento entre usuário e artista (Deixar de Seguir)',
      tags: ['Artista'],
      params: {
        type: 'object',
        required: ['artistId'],
        properties: {
          artistId: { type: 'string', description: 'ID do artista' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            sucesso: { type: 'boolean' },
            mensagem: { type: 'string' },
            artistId: { type: 'string' },
            following: { type: 'boolean' }
          }
        },
        400: { type: 'object', properties: { erro: { type: 'string' } } },
        401: { type: 'object', properties: { erro: { type: 'string' } } }
      }
    }
  }, async (requisicao, resposta) => {
    const usuario = obterUsuarioAutenticado(requisicao, resposta);
    if (!usuario) return;

    const { artistId } = requisicao.params;
    if (!artistId) {
      return resposta.status(400).send({ erro: 'O parâmetro artistId é obrigatório.' });
    }

    try {
      await deixarDeSeguirArtista(usuario.id, artistId);

      return resposta.send({
        sucesso: true,
        mensagem: 'Deixou de seguir o artista com sucesso.',
        artistId: String(artistId),
        following: false
      });
    } catch (erro) {
      console.error('[ARTISTS] Erro ao deixar de seguir:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao deixar de seguir artista.', detalhes: erro.message });
    }
  });

  // ─── LISTAR ARTISTAS SEGUIDOS ──────────────────────────────────────────────
  servidor.get('/artists/following', {
    schema: {
      description: 'Retorna a lista de artistas seguidos pelo usuário autenticado',
      tags: ['Artista'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              nome: { type: 'string' },
              capa: { type: 'string' },
              source: { type: 'string' },
              seguidoEm: { type: 'string' }
            }
          }
        },
        401: { type: 'object', properties: { erro: { type: 'string' } } }
      }
    }
  }, async (requisicao, resposta) => {
    const usuario = obterUsuarioAutenticado(requisicao, resposta);
    if (!usuario) return;

    try {
      const artistas = await listarArtistasSeguidos(usuario.id);
      return resposta.send(artistas);
    } catch (erro) {
      console.error('[ARTISTS] Erro ao listar artistas seguidos:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao listar artistas seguidos.', detalhes: erro.message });
    }
  });

  // ─── VERIFICAR SE SEGUE DETERMINADO ARTISTA ────────────────────────────────
  servidor.get('/artists/:artistId/following', {
    schema: {
      description: 'Verifica se o usuário autenticado já segue determinado artista',
      tags: ['Artista'],
      params: {
        type: 'object',
        required: ['artistId'],
        properties: {
          artistId: { type: 'string', description: 'ID do artista' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            artistId: { type: 'string' },
            following: { type: 'boolean' }
          }
        },
        401: { type: 'object', properties: { erro: { type: 'string' } } }
      }
    }
  }, async (requisicao, resposta) => {
    const usuario = obterUsuarioAutenticado(requisicao, resposta);
    if (!usuario) return;

    const { artistId } = requisicao.params;

    try {
      const segue = await estaSeguindo(usuario.id, artistId);
      return resposta.send({
        artistId: String(artistId),
        following: Boolean(segue)
      });
    } catch (erro) {
      console.error('[ARTISTS] Erro ao verificar seguimento:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao verificar status de artista seguido.', detalhes: erro.message });
    }
  });

  // ─── NOVOS LANÇAMENTOS DOS ARTISTAS SEGUIDOS ───────────────────────────────
  servidor.get('/artists/new-releases', {
    schema: {
      description: 'Retorna os novos lançamentos dos artistas seguidos pelo usuário autenticado, com paginação e links de streaming',
      tags: ['Artista'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1, description: 'Número da página' },
          limit: { type: 'integer', default: 20, description: 'Quantidade de lançamentos por página' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            pagina: { type: 'integer' },
            limite: { type: 'integer' },
            total: { type: 'integer' },
            totalPaginas: { type: 'integer' },
            lancamentos: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  titulo: { type: 'string' },
                  artista: { type: 'string' },
                  artistaId: { type: 'string' },
                  album: { type: 'string' },
                  tipo: { type: 'string' },
                  capa: { type: 'string' },
                  dataLancamento: { type: 'string' },
                  duracao: { type: 'number' },
                  source: { type: 'string' },
                  streamUrl: { type: 'string' },
                  previewUrl: { type: 'string' }
                }
              }
            }
          }
        },
        401: { type: 'object', properties: { erro: { type: 'string' } } }
      }
    }
  }, async (requisicao, resposta) => {
    const usuario = obterUsuarioAutenticado(requisicao, resposta);
    if (!usuario) return;

    const { page = 1, limit = 20 } = requisicao.query;

    try {
      const artistasSeguidos = await listarArtistasSeguidos(usuario.id);

      if (artistasSeguidos.length === 0) {
        return resposta.send({
          pagina: Number(page),
          limite: Number(limit),
          total: 0,
          totalPaginas: 0,
          lancamentos: []
        });
      }

      const resultado = await agregarNovosLancamentos(artistasSeguidos, {
        pagina: page,
        limite: limit
      });

      return resposta.send(resultado);

    } catch (erro) {
      console.error('[ARTISTS] Erro ao buscar novos lançamentos:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao buscar novos lançamentos.', detalhes: erro.message });
    }
  });

}
