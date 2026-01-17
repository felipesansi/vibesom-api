import axios from 'axios';

let idCliente = null;
let ultimaBuscaChave = 0;

// IDs de backup rotativos (caso o scraping falhe)
const IDS_BACKUP = [
  'LBCcHmRB8XSStWL6wKH2HPACspQlXg2P',
  'aYf4Fk9x7jS5t7a67fH5f6g7h8i9j0k1',
  'rKwe8HqZ6302e2E7iG5g3g5g3g5g3g5g', // Exemplo
  'Nb28sn2a2s211d12d212d212d212d212'
];

async function obterIdCliente() {
  if (idCliente && Date.now() - ultimaBuscaChave < 1000 * 60 * 60) return idCliente;

  try {
    console.log('[SOUNDCLOUD] Buscando novo ID de Cliente...');
    const { data: html } = await axios.get('https://soundcloud.com/discover', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    // Tenta pegar o último app-*.js (geralmente tem a chave mais nova)
    const urlsScript = html.match(/<script crossorigin src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)
      ?.map(s => s.match(/src="([^"]+)"/)[1]) || [];
      
    // Inverte para pegar os scripts mais recentes primeiro
    for (const url of urlsScript.reverse().slice(0, 8)) {
      try {
        const { data: js } = await axios.get(url);
        const correspondencia = js.match(/client_id:"([a-zA-Z0-9]{32})"/);
        if (correspondencia) {
          idCliente = correspondencia[1];
          ultimaBuscaChave = Date.now();
          console.log('[SOUNDCLOUD] ✅ ID de Cliente renovado:', idCliente);
          return idCliente;
        }
      } catch (e) {}
    }
  } catch (e) {
    console.log('[SOUNDCLOUD] Falha no scraping, usando fallback');
  }
  
  // Escolhe um ID de fallback aleatório
  idCliente = IDS_BACKUP[Math.floor(Math.random() * IDS_BACKUP.length)];
  return idCliente;
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
          app_version: '1705658603', // Versão fictícia
          app_locale: 'en'
        },
        timeout: 5000
      });

      if (!data.collection || data.collection.length === 0) {
        return resposta.status(404).send({ erro: 'Nenhuma música encontrada' });
      }

      const musicas = data.collection
        .filter(musica => musica.duration > 60000) // Filtra áudios com menos de 60 segundos (previews)
        .map(musica => {
        // Pega a melhor imagem disponível
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

      // Se todas foram filtradas (só tinham previews), retorna erro
      if (musicas.length === 0) {
         return resposta.status(404).send({ erro: 'Apenas prévias encontradas. Tente outra busca.' });
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

  // STREAMING SOUNDCLOUD (Proxy para garantir stream inline)
  servidor.get('/soundcloud/stream/:id', {
    schema: {
      description: 'Stream de música do SoundCloud',
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
        params: { client_id: cid }
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
        params: { client_id: cid }
      });

      // Proxy para garantir que toca direto e não baixa
      const { data: fluxo, headers } = await axios({
          method: 'get',
          url: informacaoFluxo.url,
          responseType: 'stream',
          timeout: 10000
      });

      resposta.header('Content-Type', headers['content-type'] || 'audio/mpeg');
      resposta.header('Content-Disposition', 'inline');
      
      if (headers['content-length']) {
          resposta.header('Content-Length', headers['content-length']);
      }

      return resposta.send(fluxo);

    } catch (erro) {
      console.error('[SOUNDCLOUD] Erro no stream:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao gerar stream do SoundCloud',
        detalhes: erro.message
      });
    }
  });

  // CHART BRASIL / TOP 50 (Estilo Spotify)
  servidor.get('/soundcloud/charts/brasil', {
    schema: {
      description: 'Top músicas brasileiras do SoundCloud',
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
      
      const urls = [
        `https://api-v2.soundcloud.com/charts?kind=top&genre=soundcloud%3Agenres%3Aworld&client_id=${cid}&limit=25`, // Funk/Regional
        `https://api-v2.soundcloud.com/charts?kind=top&genre=soundcloud%3Agenres%3Ahiphoprap&client_id=${cid}&limit=25` // Trap/Rap
      ];

      // Busca tudo em paralelo
      const respostas = await Promise.all(urls.map(url => axios.get(url)));
      
      // Junta e mistura os resultados
      let unificados = [];
      respostas.forEach(r => {
        if (r.data.collection) unificados.push(...r.data.collection);
      });

      // Formata e remove duplicatas
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
        // Filtra duplicatas por ID
        .filter((v,i,a)=>a.findIndex(v2=>(v2.id===v.id))===i)
        // Ordena por likes/plays para pegar os maiores hits
        .sort((a, b) => b.plays - a.plays) 
        .slice(0, 50); // Top 50

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

  // TRENDING GERAL (Mantido)
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
      
      const { data } = await axios.get(url);
      
      const musicas = data.collection.map(item => {
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
