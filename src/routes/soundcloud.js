import axios from 'axios';
import { fazerProxyStream } from '../lib/streamProxy.js';
import {
  criarAutorizacaoSoundCloud,
  obterUrlCriarContaSoundCloud,
  obterTokenSoundCloud,
  soundCloudOAuthConfigurado,
  trocarCodigoSoundCloud,
} from '../lib/soundcloudOAuth.js';

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

  // A conta é opcional: conteúdo público pode continuar sendo pesquisado e
  // reproduzido mesmo quando esta conexão OAuth não estiver configurada.
  servidor.get('/soundcloud/acesso', {
    schema: {
      description: 'Informa como criar ou conectar opcionalmente uma conta SoundCloud',
      tags: ['SoundCloud'],
      querystring: {
        type: 'object',
        properties: {
          state: { type: 'string', description: 'Nonce OAuth gerado pelo cliente' },
          code_challenge: { type: 'string', description: 'Desafio PKCE S256 gerado pelo cliente' }
        }
      }
    }
  }, async (requisicao) => {
    const { state, code_challenge: codeChallenge } = requisicao.query || {};
    const oauthConfigurado = soundCloudOAuthConfigurado();

    return {
      requerContaParaPublico: false,
      mensagem: 'A conta SoundCloud é opcional. Use-a para recursos pessoais; busca e reprodução públicas continuam disponíveis como alternativa quando o YouTube falhar.',
      criarContaUrl: obterUrlCriarContaSoundCloud(),
      conectarUrl: oauthConfigurado
        ? criarAutorizacaoSoundCloud({ state, codeChallenge })
        : null,
      oauthConfigurado,
    };
  });

  // Troca o código de autorização pelo token sem expor o client_secret ao app.
  // O aplicativo deve guardar os tokens em armazenamento seguro do dispositivo.
  servidor.post('/soundcloud/token', {
    schema: {
      description: 'Troca um código OAuth SoundCloud por tokens de acesso (OAuth 2.1 + PKCE)',
      tags: ['SoundCloud'],
      body: {
        type: 'object',
        required: ['code', 'codeVerifier'],
        properties: {
          code: { type: 'string' },
          codeVerifier: { type: 'string', minLength: 43, maxLength: 128 }
        }
      }
    }
  }, async (requisicao, resposta) => {
    if (!soundCloudOAuthConfigurado()) {
      return resposta.status(503).send({ erro: 'OAuth do SoundCloud ainda não foi configurado.' });
    }

    try {
      const tokens = await trocarCodigoSoundCloud(requisicao.body.code, requisicao.body.codeVerifier);
      return resposta.send({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        scope: tokens.scope,
      });
    } catch (erro) {
      return resposta.status(400).send({ erro: erro.message });
    }
  });

  servidor.get('/soundcloud/me', {
    schema: {
      description: 'Obtém o perfil da conta SoundCloud conectada',
      tags: ['SoundCloud']
    }
  }, async (requisicao, resposta) => {
    const token = obterTokenSoundCloud(requisicao);
    if (!token) return resposta.status(401).send({ erro: 'Envie x-soundcloud-access-token para consultar a conta.' });

    try {
      const { data } = await axios.get('https://api.soundcloud.com/me', {
        headers: { Authorization: `OAuth ${token}` },
        timeout: 5_000,
      });
      return resposta.send({ id: data.id, nome: data.username, avatarUrl: data.avatar_url });
    } catch {
      return resposta.status(401).send({ erro: 'A conexão SoundCloud expirou ou não é válida.' });
    }
  });

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
      const tokenConta = obterTokenSoundCloud(requisicao);
      const { data } = tokenConta
        ? await axios.get('https://api.soundcloud.com/tracks', {
          params: { q: consulta, limit: 30 },
          headers: { Authorization: `OAuth ${tokenConta}` },
          timeout: 5000,
        })
        : await axios.get('https://api-v2.soundcloud.com/search/tracks', {
          params: {
            q: consulta,
            client_id: await obterIdCliente(),
            limit: 30,
            app_version: '1705658603',
            app_locale: 'en'
          },
          timeout: 5000
        });

      const colecao = Array.isArray(data) ? data : data.collection;

      if (!colecao || colecao.length === 0) {
        return resposta.status(404).send({ erro: 'Nenhuma música encontrada' });
      }

      const musicas = colecao
        .filter(musica => musica.duration > 30000)
        .map(musica => {
          let capa = musica.artwork_url || musica.user?.avatar_url;
          if (capa) capa = capa.replace('large', 't500x500');

          return {
            source: 'SoundCloud',
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
      const tokenConta = obterTokenSoundCloud(requisicao);
      const { data: musica } = tokenConta
        ? await axios.get(`https://api.soundcloud.com/tracks/${encodeURIComponent(id)}`, {
          headers: { Authorization: `OAuth ${tokenConta}` },
          timeout: 5000,
        })
        : await axios.get(`https://api-v2.soundcloud.com/tracks/${encodeURIComponent(id)}`, {
          params: { client_id: await obterIdCliente() },
          timeout: 5000,
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

      const { data: informacaoFluxo } = await axios.get(alvo.url, tokenConta
        ? { headers: { Authorization: `OAuth ${tokenConta}` }, timeout: 5000 }
        : { params: { client_id: await obterIdCliente() }, timeout: 5000 });

      if (!informacaoFluxo?.url) {
        throw new Error('URL de stream do SoundCloud vazia');
      }

      return fazerProxyStream(requisicao, resposta, informacaoFluxo.url, {
        defaultContentType: 'audio/mpeg',
        ...(tokenConta ? { headers: { Authorization: `OAuth ${tokenConta}` } } : {})
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
