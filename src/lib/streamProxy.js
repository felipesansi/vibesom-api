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
    const urlAlvo = new URL(urlStream);
    if (!['http:', 'https:'].includes(urlAlvo.protocol)) {
      return resposta.status(400).send({ erro: 'A URL do stream deve usar HTTP ou HTTPS.' });
    }

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
      validateStatus: () => true
    });

    const status = axiosResponse.status;
    const headersRecebidos = axiosResponse.headers;

    if (status >= 400) {
      axiosResponse.data.destroy();
      if (status === 404) {
        return resposta.status(404).send({ erro: 'Arquivo de áudio não encontrado na fonte original.' });
      }
      if (status === 416) {
        resposta.status(416);
        if (headersRecebidos['content-range']) {
          resposta.header('Content-Range', headersRecebidos['content-range']);
        }
        return resposta.send();
      }
      return resposta.status(502).send({ erro: `A fonte de áudio respondeu com HTTP ${status}.` });
    }

    resposta.status(status);

    const contentType = headersRecebidos['content-type'] || opcoes.defaultContentType || 'audio/mpeg';
    if (/^(text\/html|application\/(json|problem\+json))(?:;|$)/i.test(contentType)) {
      axiosResponse.data.destroy();
      return resposta.status(502).send({ erro: 'A fonte não retornou um arquivo de áudio reproduzível.' });
    }

    resposta.header('Content-Type', contentType);
    resposta.header('Content-Disposition', 'inline');

    if (headersRecebidos['content-length']) {
      resposta.header('Content-Length', headersRecebidos['content-length']);
    }
    if (headersRecebidos['content-range']) {
      resposta.header('Content-Range', headersRecebidos['content-range']);
    }
    if (headersRecebidos['accept-ranges'] || status === 206) {
      resposta.header('Accept-Ranges', headersRecebidos['accept-ranges'] || 'bytes');
    }
    if (headersRecebidos['cache-control']) {
      resposta.header('Cache-Control', headersRecebidos['cache-control']);
    } else {
      resposta.header('Cache-Control', 'public, max-age=3600');
    }

    resposta.header('Access-Control-Allow-Origin', '*');
    resposta.header('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Authorization');
    resposta.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    return resposta.send(axiosResponse.data);

  } catch (erro) {
    let host = 'URL inválida';
    try {
      host = new URL(urlStream).host;
    } catch {}
    requisicao.log?.error(
      { host, code: erro.code, message: erro.message },
      'Falha ao obter stream da fonte'
    );

    if (!resposta.sent) {
      return resposta.status(502).send({ erro: 'Não foi possível obter o áudio da fonte original.' });
    }
  }
}
