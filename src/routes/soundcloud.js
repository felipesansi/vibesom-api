import axios from 'axios';
import { fazerProxyStream } from '../lib/streamProxy.js';

let cache = {
  clientId: null,
  expires: 0
};

// Client IDs de contingência conhecidos
const CLIENT_IDS_FALLBACK = [
  'a3e059563d7fd3372b49b37f00a00bcf',
  '2t9loNMn9nKuUsjQcvqwyAffM2xjTGum',
  'iZIs9mchVcX5lhVR1SlKKdooUegaLIQ2',
  'b4Jh9DlmFhyHjJ6qf16N5vKj7m3i9e7a'
];

async function validarClientId(clientId) {
  try {
    const res = await axios.get("https://api-v2.soundcloud.com/search/tracks", {
      params: {
        q: "test",
        limit: 1,
        client_id: clientId
      },
      timeout: 3000
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function obterIdCliente() {
  if (cache.clientId && Date.now() < cache.expires) {
    return cache.clientId;
  }

  // 1. Tenta extrair client_id raspando soundcloud.com
  try {
    const { data: html } = await axios.get(
      "https://soundcloud.com/discover",
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        timeout: 4000
      }
    );

    const scripts = [
      ...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js/g)
    ].map(x => x[0]);

    for (const script of scripts.reverse().slice(0, 5)) {
      try {
        const { data: js } = await axios.get(script, { timeout: 3000 });
        const encontrados = [...js.matchAll(/[A-Za-z0-9]{32}/g)];

        for (const item of encontrados) {
          const candidato = item[0];
          if (await validarClientId(candidato)) {
            cache.clientId = candidato;
            cache.expires = Date.now() + 1000 * 60 * 60 * 6; // 6 horas
            return candidato;
          }
        }
      } catch {}
    }
  } catch (e) {
    console.warn('[SOUNDCLOUD] Scraping falhou, testando fallback IDs...');
  }

  // 2. Fallback para client_ids de contingência
  for (const fallbackId of CLIENT_IDS_FALLBACK) {
    if (await validarClientId(fallbackId)) {
      cache.clientId = fallbackId;
      cache.expires = Date.now() + 1000 * 60 * 60 * 2; // 2 horas
      return fallbackId;
    }
  }

  // Retorna o primeiro fallback se tudo mais falhar
  return CLIENT_IDS_FALLBACK[0];
}

export default async function rotasSoundCloud(servidor) {

  // BUSCA SOUNDCLOUD
  servidor.get('/soundcloud/search/:consulta', {
    schema: {
      description: 'Busca específica de músicas no SoundCloud',
      tags: ['SoundCloud', 'Busca'],
      params: {
        type: 'object',
        required: ['consulta'],
        properties: {
          consulta: {
            type: 'string',
            description: 'Termo de busca (música, artista ou álbum)'
          }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', example: 'SoundCloud' },
              id: { type: 'string', description: 'ID da música' },
              titulo: { type: 'string', description: 'Título da música' },
              artista: { type: 'string', description: 'Nome do artista' },
              capa: { type: 'string', description: 'URL da capa' },
              duracao: { type: 'number', description: 'Duração em segundos' },
              streamUrl: { type: 'string', description: 'URL para streaming' }
            }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { consulta } = requisicao.params;

    try {
      const cid = await obterIdCliente();
      const { data } = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
        params: {
          q: consulta,
          client_id: cid,
          limit: 30,
          app_version: '1705658603',
          app_locale: 'en'
        },
        timeout: 5000
      });

      if (!data.collection || data.collection.length === 0) {
        return resposta.status(404).send({ erro: 'Nenhuma música encontrada' });
      }

      const musicas = data.collection
        .filter(musica => musica.duration > 30000)
        .map(musica => {
          let capa = musica.artwork_url || musica.user?.avatar_url;
          if (capa) capa = capa.replace('large', 't500x500');

          return {
            id: String(musica.id),
            titulo: musica.title,
            artista: musica.user?.username,
            capa: capa,
            duracao: Math.floor(musica.duration / 1000),
            plays: musica.playback_count,
            genero: musica.genre,
            streamUrl: `/soundcloud/stream/${musica.id}`
          };
        });

      if (musicas.length === 0) {
        return resposta.status(404).send({ erro: 'Nenhuma música de tamanho completo encontrada.' });
      }

      return resposta.status(200).send(musicas);

    } catch (erro) {
      console.error('[SOUNDCLOUD] Erro na busca:', erro.message);
      return resposta.status(500).send({
        erro: 'Erro ao buscar no SoundCloud',
        detalhes: erro.message
      });
    }
  });

  // STREAMING SOUNDCLOUD (com proxy e suporte a Range headers)
  servidor.get('/soundcloud/stream/:id', {
    schema: {
      description: 'Stream de música do SoundCloud com suporte a Range headers',
      tags: ['SoundCloud', 'Streaming'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'ID da música no SoundCloud'
          }
        }
      },
      response: {
        200: {
          type: 'string',
          description: 'Arquivo de áudio MP3'
        },
        404: {
          type: 'object',
          properties: {
            erro: { type: 'string' }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { id } = requisicao.params;

    try {
      const cid = await obterIdCliente();

      const { data: musica } = await axios.get(`https://api-v2.soundcloud.com/tracks/${id}`, {
        params: { client_id: cid },
        timeout: 5000
      });

      if (!musica.media || !musica.media.transcodings) {
        throw new Error('Música não streamável');
      }

      const progressivo = musica.media.transcodings.find(t => t.format.protocol === 'progressive');
      const hls = musica.media.transcodings.find(t => t.format.protocol === 'hls');
      const alvo = progressivo || hls;

      if (!alvo) {
        throw new Error('Nenhum formato compatível encontrado');
      }

      const { data: informacaoFluxo } = await axios.get(`${alvo.url}`, {
        params: { client_id: cid },
        timeout: 5000
      });

      if (!informacaoFluxo?.url) {
        throw new Error('URL de stream do SoundCloud vazia');
      }

      return fazerProxyStream(requisicao, resposta, informacaoFluxo.url, {
        defaultContentType: 'audio/mpeg'
      });

    } catch (erro) {
      console.error('[SOUNDCLOUD] Erro no stream:', erro.message);
      return resposta.status(500).send({
        erro: 'Erro ao gerar stream do SoundCloud',
        detalhes: erro.message
      });
    }
  });

  // CHART BRASIL / TOP 50
  servidor.get('/soundcloud/charts/brasil', {
    schema: {
      description: 'Top músicas brasileiras do SoundCloud',
      tags: ['SoundCloud'],
      response: {
        200: {
          type: 'object',
          properties: {
            titulo: { type: 'string' },
            descricao: { type: 'string' },
            musicas: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string', example: 'SoundCloud' },
                  id: { type: 'string', description: 'ID da música' },
                  titulo: { type: 'string', description: 'Título da música' },
                  artista: { type: 'string', description: 'Nome do artista' },
                  capa: { type: 'string', description: 'URL da capa' },
                  duracao: { type: 'number', description: 'Duração em segundos' },
                  streamUrl: { type: 'string', description: 'URL para streaming' }
                }
              }
            }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    try {
      const cid = await obterIdCliente();

      const urls = [
        `https://api-v2.soundcloud.com/charts?kind=top&genre=soundcloud%3Agenres%3Aworld&client_id=${cid}&limit=25`,
        `https://api-v2.soundcloud.com/charts?kind=top&genre=soundcloud%3Agenres%3Ahiphoprap&client_id=${cid}&limit=25`
      ];

      const respostas = await Promise.all(urls.map(url => axios.get(url).catch(() => ({ data: { collection: [] } }))));

      let unificados = [];
      respostas.forEach(r => {
        if (r.data?.collection) unificados.push(...r.data.collection);
      });

      const musicas = unificados
        .map(item => {
          const musica = item.track;
          if (!musica) return null;

          let capa = musica.artwork_url || musica.user?.avatar_url;
          if (capa) capa = capa.replace('large', 't500x500');

          return {
            id: String(musica.id),
            titulo: musica.title,
            artista: musica.user?.username,
            capa: capa,
            duracao: Math.floor(musica.duration / 1000),
            plays: musica.playback_count,
            genero: musica.genre,
            streamUrl: `/soundcloud/stream/${musica.id}`,
            source: 'SoundCloud'
          };
        })
        .filter(Boolean)
        .filter((v, i, a) => a.findIndex(v2 => (v2.id === v.id)) === i)
        .sort((a, b) => (b.plays || 0) - (a.plays || 0))
        .slice(0, 50);

      return resposta.status(200).send({
        titulo: "Top 50 Brasil (SoundCloud)",
        descricao: "As faixas de Funk, Trap e Hits mais tocadas no momento",
        musicas: musicas
      });

    } catch (erro) {
      console.error('[SOUNDCLOUD] Erro no Top Brasil:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao gerar Top 50 Brasil' });
    }
  });

  // TRENDING GERAL
  servidor.get('/soundcloud/trending', {
    schema: {
      description: 'Músicas em alta no SoundCloud',
      tags: ['SoundCloud'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', example: 'SoundCloud' },
              id: { type: 'string', description: 'ID da música' },
              titulo: { type: 'string', description: 'Título da música' },
              artista: { type: 'string', description: 'Nome do artista' },
              capa: { type: 'string', description: 'URL da capa' },
              duracao: { type: 'number', description: 'Duração em segundos' },
              streamUrl: { type: 'string', description: 'URL para streaming' }
            }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    try {
      const cid = await obterIdCliente();
      const url = `https://api-v2.soundcloud.com/charts?kind=top&genre=soundcloud%3Agenres%3Aall-music&client_id=${cid}&limit=30`;

      const { data } = await axios.get(url, { timeout: 5000 });

      const musicas = (data.collection || []).map(item => {
        const musica = item.track;
        if (!musica) return null;

        let capa = musica.artwork_url || musica.user?.avatar_url;
        if (capa) capa = capa.replace('large', 't500x500');

        return {
          id: String(musica.id),
          titulo: musica.title,
          artista: musica.user?.username,
          capa: capa,
          duracao: Math.floor(musica.duration / 1000),
          plays: musica.playback_count,
          genero: musica.genre,
          streamUrl: `/soundcloud/stream/${musica.id}`
        };
      }).filter(Boolean);

      return resposta.status(200).send(musicas);

    } catch (erro) {
      return resposta.status(500).send({ erro: 'Erro ao buscar trending' });
    }
  });
}
