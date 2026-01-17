import axios from 'axios';
import ytdl from '@distube/ytdl-core';

export default async function rotasVideo(servidor) {

  // Instâncias Cobalt (Alta taxa de sucesso para downloads)
  const INSTANCIAS_COBALT = [
      'https://api.cobalt.tools',
      'https://co.wuk.sh',
      'https://cobalt.res.yafs.net'
  ];

  // Instâncias Piped para rotação
  const INSTANCIAS_PIPED = [
      'https://api.piped.private.coffee',
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.adminforge.de',
      'https://api.piped.yt',
      'https://pipedapi.nosebs.ru'
  ];

  servidor.get('/video/:id', {
    schema: {
      description: 'Download de vídeo do YouTube em formato MP4',
      tags: ['YouTube', 'Download'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'ID do vídeo do YouTube'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          qualidade: {
            type: 'string',
            enum: ['360p', '480p', '720p', '1080p'],
            default: '720p',
            description: 'Qualidade do vídeo desejada'
          }
        }
      },
      response: {
        200: {
          type: 'string',
          description: 'URL para download do vídeo MP4'
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
    const { qualidade = '720p' } = requisicao.query; 

    console.log(`[VIDEO] Buscando MP4 para ${id} (${qualidade})...`);

    // TENTATIVA 1: COBALT (A melhor opção atual para bypass)
    for (const api of INSTANCIAS_COBALT) {
        try {
            const { data } = await axios.post(`${api}/api/json`, {
                url: `https://www.youtube.com/watch?v=${id}`,
                vCodec: 'h264', // Garante MP4 compatível
                vQuality: quality.replace('p', ''),
                aFormat: 'mp3',
                isAudioOnly: false
            }, { 
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                timeout: 5000 
            });

            const link = data.url || data.picker?.[0]?.url;
            if (link) {
                console.log(`[VIDEO] ✅ Cobalt Sucesso (${api})`);
                return resposta.status(302).redirect(link);
            }
        } catch (e) { continue; }
    }

    // TENTATIVA 2: PIPED (Fallback robusto)
    for (const api of INSTANCIAS_PIPED) {
        try {
            const { data } = await axios.get(`${api}/streams/${id}`, { timeout: 4000 });
            
            // Procura streams de vídeo (MP4/WebM)
            const videoStreams = data.videoStreams;
            if (!videoStreams || videoStreams.length === 0) continue;

            // Filtra MP4 preferencialmente, senão WebM
            let stream = videoStreams.find(s => s.quality === qualidade || s.quality.includes(qualidade) && s.format === 'mp4');
            
            // Se não achar a qualidade exata, pega a melhor disponível
            if (!stream) {
                 stream = videoStreams.find(s => s.quality === '1080p' && !s.videoOnly) || 
                          videoStreams.find(s => s.quality === '720p' && !s.videoOnly) ||
                          videoStreams[0];
            }

            if (stream && stream.url) {
                console.log(`[VIDEO] ✅ Piped Sucesso (${api})`);
                return resposta.status(302).redirect(stream.url);
            }
        } catch (e) { continue; }
    }

    // TENTATIVA 3: YTDL-CORE (Último recurso, geralmente bloqueado em serverless)
    try {
        const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${id}`, {
            requestOptions: {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            }
        });

        const formato = ytdl.chooseFormat(info.formats, { 
            quality: 'highest', 
            filter: 'audioandvideo' 
        });

        if (formato && formato.url) {
            console.log('[VIDEO] ✅ YTDL Sucesso!');
            return resposta.status(302).redirect(formato.url);
        }
    } catch (e) {}

    return resposta.status(503).send({ 
        erro: 'Não foi possível gerar o vídeo MP4', 
        detalhes: 'YouTube bloqueou todas as tentativas de extração de vídeo.'
    });
  });
}
