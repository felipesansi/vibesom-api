import axios from 'axios';

export default async function rotasPalco(servidor) {

  // BUSCA PALCO MP3
  servidor.get('/palco/search/:consulta', {
    schema: {
      description: 'Busca específica de músicas no Palco MP3',
      tags: ['Palco MP3', 'Busca'],
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
              source: { type: 'string', example: 'Palco MP3' },
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
      // Busca a página de busca do Palco MP3
      const { data: html } = await axios.get(`https://www.palcomp3.com.br/busca.htm?q=${encodeURIComponent(consulta)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeout: 8000
      });

      // Extrai o estado do Apollo que contém os resultados
      const match = html.match(/window\.__APOLLO_STATE__\s*=\s*"(.*?)";/);
      if (!match) {
        // Tenta formato alternativo (objeto direto)
        const matchObj = html.match(/window\.__APOLLO_STATE__\s*=\s*(\{.*?\});/);
        if (!matchObj) return resposta.send([]);
        
        const state = JSON.parse(matchObj[1]);
        return resposta.send(formatarResultados(state));
      }

      // O estado vem como uma string JSON escapada dentro de aspas
      const stateStr = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      try {
        const state = JSON.parse(stateStr);
        return resposta.send(formatarResultados(state));
      } catch (e) {
        console.error('[PALCO] Erro ao parsear JSON:', e.message);
        return resposta.send([]);
      }

    } catch (erro) {
      console.error('[PALCO] Erro na busca:', erro.message);
      return resposta.send([]);
    }
  });

  // STREAM / PROXY (Filtra headers para garantir stream "inline" no mobile/browser)
  servidor.get('/palco/stream', {
    schema: {
      description: 'Stream de música do Palco MP3',
      tags: ['Palco MP3', 'Streaming'],
      querystring: {
        type: 'object',
        required: ['url'],
        properties: {
          url: {
            type: 'string',
            description: 'URL da música para streaming'
          }
        }
      },
      response: {
        200: {
          type: 'string',
          description: 'Arquivo de áudio MP3'
        },
        400: {
          type: 'object',
          properties: {
            erro: { type: 'string' }
          }
        }
      }
    }
  }, async (requisicao, resposta) => {
    const { url } = requisicao.query;
    if (!url) return resposta.status(400).send({ erro: 'URL necessária' });

    try {
        const streamUrl = decodeURIComponent(url);
        const { data: stream, headers } = await axios({
            method: 'get',
            url: streamUrl,
            responseType: 'stream',
            timeout: 10000
        });

        // Repassa headers essenciais, mas força inline para não baixar
        resposta.header('Content-Type', headers['content-type'] || 'audio/mpeg');
        resposta.header('Content-Disposition', 'inline');
        
        if (headers['content-length']) {
            resposta.header('Content-Length', headers['content-length']);
        }

        return resposta.send(stream);
    } catch (e) {
        console.error('[PALCO-STREAM] Erro:', e.message);
        // Fallback: Redireciona se o proxy falhar (pode baixar mas é melhor que erro 500)
        return resposta.redirect(decodeURIComponent(url));
    }
  });
}

/**
 * Filtra e formata os dados do Apollo State para o padrão do app
 */
function formatarResultados(state) {
  const musicas = [];
  
  // No Palco MP3, as músicas ficam em chaves que começam com "Music:"
  Object.keys(state).forEach(key => {
    if (key.startsWith('Music:')) {
      const track = state[key];
      
      // Só pega se tiver o arquivo mp3
      if (track.mp3File && track.title) {
        // Busca o artista relacionado
        let nomeArtista = 'Artista Desconhecido';
        let capa = null;
        
        if (track.artist && track.artist.id && state[track.artist.id]) {
          nomeArtista = state[track.artist.id].name || nomeArtista;
          
          // Busca a thumbnail do artista se disponível
          const artistData = state[track.artist.id];
          if (artistData.thumbnail && artistData.thumbnail.id && state[artistData.thumbnail.id]) {
            capa = state[artistData.thumbnail.id].url || null;
          }
        }

        // Se não achou na thumbnail do artista, tenta na discografia/capa do disco
        if (!capa && track.discs && track.discs.edges && track.discs.edges[0]) {
            const discEdgeId = track.discs.edges[0].id;
            const discNodeId = state[discEdgeId]?.node?.id;
            const discData = state[discNodeId];
            if (discData && discData.picture && state[discData.picture.id]) {
                capa = state[discData.picture.id].url;
            }
        }

        musicas.push({
          source: 'PalcoMP3',
          id: String(track.musicID || track.id),
          titulo: track.title,
          artista: nomeArtista,
          capa: capa,
          duracao: track.duration || 0,
          streamUrl: `/palco/stream?url=${encodeURIComponent(track.mp3File)}`
        });
      }
    }
  });

  // Remove duplicatas por ID e limita resultados
  const unique = [];
  const ids = new Set();
  
  // Prioriza músicas que tem capa
  musicas.sort((a, b) => (b.capa ? 1 : 0) - (a.capa ? 1 : 0));

  for (const m of musicas) {
    if (!ids.has(m.id)) {
      ids.add(m.id);
      unique.push(m);
    }
  }

  return unique.slice(0, 20);
}
