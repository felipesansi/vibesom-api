import axios from 'axios';

export default async function rotasBandcamp(servidor) {
  
  // BUSCA BANDCAMP
  servidor.get('/bandcamp/search/:consulta', {
    schema: {
      description: 'Busca específica de músicas no Bandcamp',
      tags: ['Bandcamp', 'Busca'],
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
              source: { type: 'string', example: 'Bandcamp' },
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
      // Bandcamp não tem API pública de busca fácil, usamos a busca HTML
      // Mas para facilitar, vamos usar uma API não documentada de mobile ou scraping leve
      
      // Vamos fazer scraping da página de busca
      const { data: html } = await axios.get(`https://bandcamp.com/search`, {
        params: { q: consulta },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      // Expressão regular simples para extrair resultados (itemurl, arturl, title, artist)
      // O Bandcamp retorna HTML limpo na busca
      
      const resultados = [];
      const expressaoBloco = /<li class="searchresult data-search">([\s\S]*?)<\/li>/g;
      let correspondencia;
      
      while ((correspondencia = expressaoBloco.exec(html)) !== null) {
        const bloco = correspondencia[1];
        
        // Se não for música (track) ou álbum, ignora
        if (!bloco.includes('itemtype="TRACK"') && !bloco.includes('itemtype="ALBUM"')) continue;

        const resultadoTitulo = bloco.match(/<div class="heading">\s*<a[^>]*>([\s\S]*?)<\/a>/);
        const resultadoArtista = bloco.match(/<div class="subhead">\s*by ([\s\S]*?)<\/div>/);
        const resultadoLink = bloco.match(/<div class="itemurl">\s*<a href="([^"]+)"/);
        const resultadoCapa = bloco.match(/<img src="([^"]+)"/);

        if (resultadoTitulo && resultadoLink) {
            // Limpa URL da capa
            let capa = resultadoCapa ? resultadoCapa[1] : '';
            
            // Corrige URL do link
            let link = resultadoLink[1];
            if (link.startsWith('//')) link = 'https:' + link;
            // Codifica o link para passar como ID
            const idSeguro = encodeURIComponent(link);

            resultados.push({
                id: idSeguro, // A URL é o ID no Bandcamp
                titulo: resultadoTitulo[1].trim(),
                artista: resultadoArtista ? resultadoArtista[1].trim() : 'Artista Bandcamp',
                capa: capa,
                duracao: 0, // Bandcamp não mostra duração na busca
                plays: 0,
                genero: 'Indie/Bandcamp',
                streamUrl: `/bandcamp/stream?url=${idSeguro}`
            });
        }
      }

      if (resultados.length === 0) {
        return resposta.status(404).send({ erro: 'Nada encontrado no Bandcamp' });
      }

      return resposta.status(200).send(resultados.slice(0, 15));

    } catch (erro) {
      console.error('[BANDCAMP] Erro na busca:', erro.message);
      return resposta.status(500).send({ erro: 'Erro ao buscar no Bandcamp' });
    }
  });

  // STREAM BANDCAMP (Proxy para garantir stream inline)
  servidor.get('/bandcamp/stream', {
    schema: {
      description: 'Stream de música do Bandcamp',
      tags: ['Bandcamp', 'Streaming'],
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
        const urlAlvo = decodeURIComponent(url);
        const { data: htmlPagina } = await axios.get(urlAlvo, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const correspondenciaDados = htmlPagina.match(/data-tralbum="([^"]*)"/);
        let urlFluxo = null;

        if (correspondenciaDados) {
            const stringJson = correspondenciaDados[1].replace(/&quot;/g, '"');
            try {
                const dados = JSON.parse(stringJson);
                if (dados.trackinfo && dados.trackinfo.length > 0) {
                    const musica = dados.trackinfo[0];
                    if (musica.file) {
                        urlFluxo = musica.file['mp3-128'];
                    }
                }
            } catch (e) {
                console.error('[BANDCAMP] Erro ao parsear JSON:', e.message);
            }
        }
        
        if (!urlFluxo) {
           const correspondenciaScript = htmlPagina.match(/TralbumData\s*=\s*(\{[\s\S]*?\});/);
           if (correspondenciaScript) {
               const correspondenciaArquivo = correspondenciaScript[1].match(/"mp3-128"\s*:\s*"([^"]+)"/);
               if (correspondenciaArquivo) urlFluxo = correspondenciaArquivo[1];
           }
        }

        if (!urlFluxo) {
            return resposta.status(404).send({ erro: 'Stream não encontrado ou bloqueado' });
        }

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
        console.error('[BANDCAMP] Erro no stream:', erro.message);
        return resposta.status(500).send({ 
            erro: 'Erro ao extrair stream Bandcamp',
            detalhes: erro.message
        });
    }
  });
}
