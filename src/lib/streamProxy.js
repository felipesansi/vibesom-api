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
      if (axiosResponse.data?.destroy) axiosResponse.data.destroy();
      // Fallback gracioso: se o proxy falhar mas tivermos a URL, tenta redirecionar
      return resposta.redirect(302, urlStream);
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
    // Se der erro no proxy, tenta redirect 302 direto para não quebrar a música
    if (urlStream && urlStream.startsWith('http')) {
      resposta.header('Access-Control-Allow-Origin', '*');
      return resposta.redirect(302, urlStream);
    }

    if (!resposta.sent) {
      return resposta.status(502).send({ erro: 'Não foi possível reproduzir a faixa.', detalhes: erro.message });
    }
  }
}
