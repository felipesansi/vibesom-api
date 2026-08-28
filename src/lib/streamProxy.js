import axios from 'axios';

/**
 * Faz proxy de uma URL de áudio/vídeo repassando headers de Range (essencial para mobile),
 * Content-Type, Content-Length, Content-Range e garantindo reprodução inline.
 * 
 * @param {import('fastify').FastifyRequest} requisicao 
 * @param {import('fastify').FastifyReply} resposta 
 * @param {string} urlStream 
 * @param {object} opcoes 
 */
export async function fazerProxyStream(requisicao, resposta, urlStream, opcoes = {}) {
  try {
    const headersEnvio = {
      'User-Agent': opcoes.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity'
    };

    // Repassa cabeçalho Range se o player mobile (React Native / iOS / Android) solicitou
    const range = requisicao.headers.range || requisicao.headers.Range;
    if (range) {
      headersEnvio['Range'] = range;
    }

    if (opcoes.headers) {
      Object.assign(headersEnvio, opcoes.headers);
    }

    const axiosResponse = await axios({
      method: 'get',
      url: urlStream,
      responseType: 'stream',
      timeout: opcoes.timeout || 20000,
      headers: headersEnvio,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400
    });

    const status = axiosResponse.status;
    const headersRecebidos = axiosResponse.headers;

    // Define status HTTP (200 OK ou 206 Partial Content)
    resposta.status(status);

    // Repassa tipo de conteúdo (garante audio/mpeg ou audio/mp4 por padrão)
    const contentType = headersRecebidos['content-type'] || opcoes.defaultContentType || 'audio/mpeg';
    resposta.header('Content-Type', contentType);
    resposta.header('Content-Disposition', 'inline');
    resposta.header('Accept-Ranges', 'bytes');

    // Headers de tamanho e range
    if (headersRecebidos['content-length']) {
      resposta.header('Content-Length', headersRecebidos['content-length']);
    }
    if (headersRecebidos['content-range']) {
      resposta.header('Content-Range', headersRecebidos['content-range']);
    }
    if (headersRecebidos['cache-control']) {
      resposta.header('Cache-Control', headersRecebidos['cache-control']);
    } else {
      resposta.header('Cache-Control', 'public, max-age=3600');
    }

    // CORS para áudio
    resposta.header('Access-Control-Allow-Origin', '*');
    resposta.header('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Authorization');
    resposta.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    return resposta.send(axiosResponse.data);

  } catch (erro) {
    console.error(`[STREAM-PROXY] Erro ao conectar em ${urlStream}:`, erro.message);

    // Se o proxy falhar por timeout ou erro de rede, tenta redirecionar o player direto para a URL
    if (!resposta.sent) {
      if (erro.response && erro.response.status === 404) {
        return resposta.status(404).send({
          erro: 'Arquivo de áudio não encontrado na fonte original.'
        });
      }

      // Redirecionamento 302 como último recurso
      return resposta.status(302).redirect(urlStream);
    }
  }
}
