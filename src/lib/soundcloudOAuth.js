import crypto from 'node:crypto';

const URL_AUTORIZACAO = 'https://secure.soundcloud.com/authorize';
const URL_CRIAR_CONTA = 'https://soundcloud.com/signup';

function configuracao() {
  return {
    clientId: process.env.SOUNDCLOUD_CLIENT_ID?.trim(),
    clientSecret: process.env.SOUNDCLOUD_CLIENT_SECRET?.trim(),
    redirectUri: process.env.SOUNDCLOUD_REDIRECT_URI?.trim(),
  };
}

export function obterUrlCriarContaSoundCloud() {
  return URL_CRIAR_CONTA;
}

/** Cria a URL OAuth opcional; o cliente mantém state e PKCE na sua sessão. */
export function criarAutorizacaoSoundCloud({ state, codeChallenge } = {}) {
  const { clientId, redirectUri } = configuracao();
  // SoundCloud exige PKCE para o fluxo authorization_code.
  if (!clientId || !redirectUri || !codeChallenge) return null;

  const parametros = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    display: 'popup',
    state: state || crypto.randomBytes(24).toString('base64url'),
  });

  if (codeChallenge) {
    parametros.set('code_challenge', codeChallenge);
    parametros.set('code_challenge_method', 'S256');
  }

  return `${URL_AUTORIZACAO}?${parametros.toString()}`;
}

export function soundCloudOAuthConfigurado() {
  const { clientId, clientSecret, redirectUri } = configuracao();
  return Boolean(clientId && clientSecret && redirectUri);
}

export function obterTokenSoundCloud(requisicao) {
  const token = requisicao.headers['x-soundcloud-access-token'];
  return typeof token === 'string' && /^[A-Za-z0-9._~+/=-]+$/.test(token)
    ? token
    : null;
}

export async function trocarCodigoSoundCloud(codigo, codeVerifier) {
  const { clientId, clientSecret, redirectUri } = configuracao();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('OAuth do SoundCloud não está configurado no servidor.');
  }

  const corpo = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code: codigo,
    code_verifier: codeVerifier,
  });

  const resposta = await fetch('https://secure.soundcloud.com/oauth/token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: corpo.toString(),
  });

  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok || !dados?.access_token) {
    throw new Error(dados?.error_description || dados?.error || 'Não foi possível conectar a conta SoundCloud.');
  }

  return dados;
}
