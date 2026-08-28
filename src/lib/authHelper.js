/**
 * Utilitário de Autenticação para endpoints protegidos (Seguir Artistas).
 * Suporta JWT Bearer, tokens opacos, headers x-user-id e query params.
 */

function decodificarJwtPayload(token) {
  try {
    const partes = token.split('.');
    if (partes.length === 3) {
      const payloadBase64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = Buffer.from(payloadBase64, 'base64').toString('utf8');
      return JSON.parse(json);
    }
  } catch (e) {}
  return null;
}

/**
 * Extrai e valida a identidade do usuário a partir da requisição.
 * 
 * @param {import('fastify').FastifyRequest} requisicao 
 * @param {import('fastify').FastifyReply} resposta 
 * @returns {object|null} Retorna { id, email, name } ou envia 401 e retorna null
 */
export function obterUsuarioAutenticado(requisicao, resposta) {
  let userId = null;
  let email = null;
  let name = null;

  // 1. Header Authorization: Bearer <token>
  const authHeader = requisicao.headers.authorization || requisicao.headers.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      const payload = decodificarJwtPayload(token);
      if (payload) {
        userId = payload.sub || payload.user_id || payload.userId || payload.id || payload.email;
        email = payload.email || null;
        name = payload.name || payload.user_metadata?.name || null;
      } else {
        // Token opaco simples ou ID direto
        userId = token;
      }
    }
  }

  // 2. Headers customizados (x-user-id, user-id)
  if (!userId) {
    userId = requisicao.headers['x-user-id'] || 
             requisicao.headers['user-id'] || 
             requisicao.headers['x-user-email'];
    email = requisicao.headers['x-user-email'] || null;
    name = requisicao.headers['x-user-name'] || null;
  }

  // 3. Query params de contingência (userId, user_id)
  if (!userId && requisicao.query) {
    userId = requisicao.query.userId || requisicao.query.user_id;
  }

  // Se não encontrou usuário autenticado, responde com 401
  if (!userId) {
    resposta.status(401).send({
      erro: 'Não autorizado. Forneça o token no cabeçalho Authorization ou identificador no cabeçalho x-user-id.'
    });
    return null;
  }

  return {
    id: String(userId).trim(),
    email: email ? String(email).trim() : null,
    name: name ? String(name).trim() : `Usuario_${String(userId).slice(0, 6)}`
  };
}
