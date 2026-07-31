import axios from 'axios';

export default async function rotasDailymotion(servidor) {
  
  // BUSCA DAILYMOTION
  servidor.get('/dailymotion/search/:consulta', {
    schema: {
      description: 'Busca específica de vídeos no Dailymotion',
      tags: ['Dailymotion', 'Busca'],
      params: {
        type: 'object',
        required: ['consulta'],
        properties: {
          consulta: {
            type: 'string',
            description: 'Termo de busca (vídeo, música ou artista)'
          }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', example: 'Dailymotion' },
              id: { type: 'string', description: 'ID do vídeo' },
              titulo: { type: 'string', description: 'Título do vídeo' },
              artista: { type: 'string', description: 'Nome do criador' },
              capa: { type: 'string', description: 'URL da thumbnail' },
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
      const { data } = await axios.get('https://api.dailymotion.com/videos', {
        params: {
          search: consulta,
          fields: 'id,title,owner,duration,thumbnail_url,views_total',
          limit: 15,
          sort: 'relevance'
        },
        timeout: 5000
      });

      if (!data.list || data.list.length === 0) {
        return resposta.status(404).send({ erro: 'Nada encontrado no Dailymotion' });
      }

      const musicas = data.list.map(video => ({
        id: video.id,
        titulo: video.title,
        artista: video.owner || 'Dailymotion', // Dailymotion só dá o ID do owner aqui, mas ok
        capa: video.thumbnail_url,
        duracao: video.duration,
        plays: video.views_total,
        genero: 'Video/Clip',
        streamUrl: `/dailymotion/stream/${video.id}`
      }));

      return resposta.status(200).send(musicas);

    } catch (erro) {
      console.error('[DAILYMOTION] Erro na busca:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao buscar no Dailymotion' });
    }
  });

  // STREAM DAILYMOTION (RESOLVER HLS)
  servidor.get('/dailymotion/stream/:id', {
    schema: {
      description: 'Stream de vídeo do Dailymotion',
      tags: ['Dailymotion', 'Streaming'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'ID do vídeo no Dailymotion'
          }
        }
      },
      response: {
        200: {
          type: 'string',
          description: 'URL do stream HLS (.m3u8)'
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
        // Pega metadados do player interno para achar o HLS (.m3u8)
        const { data } = await axios.get(`https://www.dailymotion.com/player/metadata/video/${id}`, {
            timeout: 5000
        });

        const qualities = data.qualities;
        if (!qualities) throw new Error('Sem streams disponíveis');

        // Tenta pegar a melhor qualidade mp4/m3u8
        // Dailymotion geralmente retorna um objeto com chaves 'auto', '1080', '720', etc.
        // Cada chave é um array de objetos { type: 'application/x-mpegURL', url: '...' }

        let streamUrl = null;
        
        // Prioriza 'auto' (HLS master playlist)
        if (qualities.auto && qualities.auto[0]) {
            streamUrl = qualities.auto[0].url;
        } else {
            // Se não tiver auto, pega a maior resolução disponível
            const resKeys = Object.keys(qualities).filter(k => k !== 'auto').sort((a,b) => parseInt(b) - parseInt(a));
            if (resKeys.length > 0) {
                streamUrl = qualities[resKeys[0]][0].url;
            }
        }

        if (!streamUrl) throw new Error('URL de stream não encontrada');

        // Redireciona para o .m3u8 (HLS)
        // Frontend deve usar um player compatível com HLS (Ex: React Native Video, VideoJS)
        return resposta.status(302).redirect(streamUrl);

    } catch (erro) {
      console.error('[DAILYMOTION] Erro no stream:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao gerar stream Dailymotion',
        detalhes: 'Dailymotion requer player compatível com HLS (.m3u8)'
      });
    }
  });
}
