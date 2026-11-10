/**
 * streamProxy.js
 * Proxy de streaming e redirecionamento de áudio otimizado para Vercel Serverless.
 * 
 * Na Vercel:
 * Funções Serverless possuem tempo limite de execução (10s a 30s).
 * Fazer proxy de um arquivo de áudio de 4 minutos causa timeout e corta a reprodução.
 * Por isso, para CDNs públicos de áudio (Saavn, SoundCloud, Audius), o redirecionamento
 * HTTP 302 é a melhor prática: o app/player toca direto do CDN com alta velocidade,
 * suporte nativo a Range/Seek/Buffer e sem sobrecarregar a Vercel.
 */

import axios from 'axios';

const MAX_HLS_PLAYLIST_BYTES = 2 * 1024 * 1024;

function ehManifestoHls(contentType, url) {
  return /mpegurl|vnd\.apple\.mpegurl/i.test(String(contentType || ''))
    || /\.m3u8(?:$|[?#])/i.test(url);
}

function absolutizarUrisHls(playlist, urlBase) {
  const tornarAbsoluta = (uri) => {
    try {
      return new URL(uri.trim(), urlBase).toString();
    } catch {
      return uri;
    }
  };

  return playlist
    .replace(/^(?!#)([^\r\n]+)$/gm, (linha, uri) => tornarAbsoluta(uri))
    .replace(/\bURI="([^"]+)"/gi, (atributo, uri) => `URI="${tornarAbsoluta(uri)}"`);
}

async function lerStreamLimitado(stream, limite) {
  const partes = [];
  let total = 0;

  for await (const parte of stream) {
    total += parte.length;
    if (total > limite) {
      stream.destroy();
      throw new Error('Manifesto HLS excede o limite permitido.');
    }
    partes.push(parte);
  }

  return Buffer.concat(partes, total).toString('utf8');
}

/**
 * Verifica se a URL pertence a um CDN de áudio público com CORS aberto.
 */
export function podeRedirecionarDireto(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  
  const cdnsConhecidos = [
    'aac.saavncdn.com',
    'cf-media.sndcdn.com',
    'cf-hls-media.sndcdn.com',
    'a-v2.sndcdn.com',
    'audius.co',
    'cdn.audius.co',
    'audio.audius.co',
    'jamendo.com',
    'palcomp3.com.br'
  ];

  return cdnsConhecidos.some(cdn => url.includes(cdn));
}

/**
 * Faz proxy de uma URL de áudio ou redirecionamento direto (recomendado na Vercel).
 */
export async function fazerProxyStream(requisicao, resposta, urlStream, opcoes = {}) {
  try {
    if (!urlStream || typeof urlStream !== 'string') {
      return resposta.status(400).send({ erro: 'URL de áudio inválida.' });
    }

    const urlAlvo = new URL(urlStream);
    if (!['http:', 'https:'].includes(urlAlvo.protocol)) {
      return resposta.status(400).send({ erro: 'A URL do stream deve usar HTTP ou HTTPS.' });
    }

    // Configura cabeçalhos de CORS universais para web e mobile
    resposta.header('Access-Control-Allow-Origin', '*');
    resposta.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    resposta.header('Access-Control-Allow-Headers', 'Range, Content-Type, Accept, Authorization');
    resposta.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    // 1. OTIMIZAÇÃO CRÍTICA PARA VERCEL:
    // Se a URL for de CDN confiável ou se for na Vercel sem Range estrito, redireciona 302!
    // Players móveis (React Native Track Player, iOS AVPlayer, Android ExoPlayer)
    // seguem redirects HTTP 302 automaticamente e reproduzem diretamente do CDN.
    if (podeRedirecionarDireto(urlStream)) {
      return resposta.redirect(302, urlStream);
    }

    // 2. PROXY COM STREAM (para fontes que exigem headers customizados ou não permitem redirect)
    const headersEnvio = {
      'User-Agent': opcoes.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity'
    };

    const range = requisicao.headers.range || requisicao.headers.Range;
    if (range) {
      headersEnvio['Range'] = range;
    }

    if (opcoes.headers) {
      Object.assign(headersEnvio, opcoes.headers);
    }

    const buscarStream = (headers) => axios({
      method: 'get',
      url: urlStream,
      responseType: 'stream',
      timeout: opcoes.timeout || 20000,
      headers,
      maxRedirects: 5,
      validateStatus: () => true
    });

    let axiosResponse = await buscarStream(headersEnvio);
    let status = axiosResponse.status;
    let headersRecebidos = axiosResponse.headers;

    if (status >= 400) {
      if (axiosResponse.data?.destroy) axiosResponse.data.destroy();
      const statusCliente = status >= 500 ? 502 : status;
      const erro = status === 404
        ? 'Áudio não encontrado na fonte.'
        : 'A fonte de áudio retornou HTTP ' + status + '.';
      return resposta.status(statusCliente).send({ erro });
    }

    let contentTypeRecebido = String(headersRecebidos['content-type'] || '').toLowerCase();
    let manifestoHls = ehManifestoHls(contentTypeRecebido, urlStream);

    // Manifestos HLS são pequenos documentos; o Range do player pode truncá-los.
    // Busca o manifesto completo para que seus URIs possam ser normalizados.
    if (manifestoHls && range && status === 206) {
      if (axiosResponse.data?.destroy) axiosResponse.data.destroy();
      const headersSemRange = { ...headersEnvio };
      delete headersSemRange.Range;
      axiosResponse = await buscarStream(headersSemRange);
      status = axiosResponse.status;
      headersRecebidos = axiosResponse.headers;

      if (status >= 400) {
        if (axiosResponse.data?.destroy) axiosResponse.data.destroy();
        const statusCliente = status >= 500 ? 502 : status;
        return resposta.status(statusCliente).send({
          erro: status === 404 ? 'Áudio não encontrado na fonte.' : 'A fonte de áudio retornou HTTP ' + status + '.'
        });
      }

      contentTypeRecebido = String(headersRecebidos['content-type'] || '').toLowerCase();
      manifestoHls = manifestoHls || ehManifestoHls(contentTypeRecebido, urlStream);
    }

    if (!manifestoHls && /^(text\/html|application\/json|text\/plain)(;|$)/i.test(contentTypeRecebido)) {
      if (axiosResponse.data?.destroy) axiosResponse.data.destroy();
      return resposta.status(502).send({
        erro: 'A fonte não retornou um arquivo de áudio reproduzível.'
      });
    }

    if (manifestoHls) {
      const playlistOriginal = await lerStreamLimitado(axiosResponse.data, MAX_HLS_PLAYLIST_BYTES);
      const urlBase = axiosResponse.request?.res?.responseUrl || urlStream;
      const playlist = absolutizarUrisHls(playlistOriginal, urlBase);
      const contentType = headersRecebidos['content-type'] || 'application/vnd.apple.mpegurl';
      resposta.status(200);
      resposta.header('Content-Type', contentType);
      resposta.header('Content-Disposition', 'inline');
      resposta.header('Content-Length', Buffer.byteLength(playlist));
      return resposta.send(playlist);
    }

    resposta.status(status);

    const contentType = headersRecebidos['content-type'] || opcoes.defaultContentType || 'audio/mpeg';
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

    return resposta.send(axiosResponse.data);

  } catch (erro) {
    if (!resposta.sent) {
      return resposta.status(502).send({ erro: 'Não foi possível reproduzir a faixa.', detalhes: erro.message });
    }
  }
}
