import axios from 'axios';

export default async function rotasArquivo(servidor) {
  
  // BUSCA NO INTERNET ARCHIVE
  servidor.get('/archive/search/:consulta', {
    schema: {
      description: 'Busca específica de músicas no Internet Archive',
      tags: ['Archive', 'Busca'],
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
              source: { type: 'string', example: 'Archive' },
              id: { type: 'string', description: 'ID do arquivo' },
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
      // Busca avançada filtrando apenas áudio
      const url = 'https://archive.org/advancedsearch.php';
      const parametros = {
        q: `${consulta} AND mediatype:(audio)`,
        fl: ['identifier', 'title', 'creator', 'description', 'format'],
        sort: ['downloads desc'], // Mais populares primeiro
        rows: 30,
        page: 1,
        output: 'json'
      };

      const { data } = await axios.get(url, { params: parametros, timeout: 6000 });

      if (!data.response || data.response.docs.length === 0) {
        return resposta.status(404).send({ erro: 'Nenhum áudio encontrado no Archive.org' });
      }

      const musicas = data.response.docs.map(item => ({
        id: item.identifier,
        titulo: item.title,
        artista: item.creator || 'Desconhecido',
        capa: `https://archive.org/services/img/${item.identifier}`, // Capa automática do item
        genero: 'Archive',
        streamUrl: `/archive/stream/${item.identifier}`
      }));

      return resposta.status(200).send(musicas);

    } catch (erro) {
      console.error('[ARCHIVE] Erro na busca:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao buscar no Archive.org' });
    }
  });

  // STREAM (Proxy para garantir stream inline)
  servidor.get('/archive/stream/:id', {
    schema: {
      description: 'Stream de música do Internet Archive',
      tags: ['Archive', 'Streaming'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'ID do arquivo no Internet Archive'
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
      // Primeiro, pegamos os metadados para achar o arquivo MP3 original
      const { data } = await axios.get(`https://archive.org/metadata/${id}`, { timeout: 5000 });
      
      if (!data.files || data.files.length === 0) {
        throw new Error('Sem arquivos disponíveis');
      }

      // Procura o melhor arquivo de áudio (VBR MP3 ou MP3)
      const arquivoAudio = data.files.find(f => f.format === 'VBR MP3') || 
                           data.files.find(f => f.format === 'MP3') ||
                           data.files.find(f => f.name.endsWith('.mp3'));

      if (!arquivoAudio) {
        return resposta.status(404).send({ erro: 'Nenhum arquivo MP3 reproduzível encontrado.' });
      }

      // Monta a URL direta de download/stream
      const urlFluxo = `https://${data.d1}${data.dir}/${arquivoAudio.name}`;
      
      // Proxy para garantir que toca direto e não baixa
      const { data: fluxo, headers } = await axios({
          method: 'get',
          url: urlFluxo,
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
      console.error('[ARCHIVE] Erro no stream:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao gerar stream do Archive.org',
        detalhes: erro.message
      });
    }
  });
}
