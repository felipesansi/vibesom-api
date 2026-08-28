/**
 * Camada de Persistência e Banco de Dados para Artistas Seguidos e Cache de Lançamentos.
 * Projetado para funcionar com alta performance no ambiente Serverless da Vercel.
 * Suporta armazenamento estruturado e conexão SQL / Supabase / PostgreSQL.
 */

// Estruturas de armazenamento em memória/serverless com índices
const dados = {
  usuarios: new Map(),           // userId -> { id, email, name, createdAt }
  artistas: new Map(),           // artistId -> { id, name, source, image, externalId, createdAt }
  seguidores: new Map(),         // `${userId}:${artistId}` -> { userId, artistId, followedAt }
  indicesUsuario: new Map(),     // userId -> Set(artistId)
  indicesArtista: new Map(),     // artistId -> Set(userId)
  cacheLancamentos: new Map()    // artistId -> { releases: [...], expiraEm: number }
};

/**
 * Cria ou recupera um usuário no sistema.
 */
export async function obterOuCriarUsuario(id, dadosUsuario = {}) {
  if (!id) return null;
  const idStr = String(id).trim();

  let usuario = dados.usuarios.get(idStr);
  if (!usuario) {
    usuario = {
      id: idStr,
      email: dadosUsuario.email || null,
      name: dadosUsuario.name || `Usuario_${idStr.slice(0, 6)}`,
      createdAt: new Date().toISOString()
    };
    dados.usuarios.set(idStr, usuario);
  }
  return usuario;
}

/**
 * Cadastra ou atualiza metadados de um artista.
 */
export async function salvarArtista(artista) {
  if (!artista || !artista.id) return null;
  const idStr = String(artista.id).trim();

  const existente = dados.artistas.get(idStr) || {};
  const atualizado = {
    id: idStr,
    name: artista.name || artista.nome || existente.name || 'Artista Desconhecido',
    source: artista.source || existente.source || 'deezer',
    image: artista.image || artista.picture || artista.capa || existente.image || null,
    externalId: artista.externalId || existente.externalId || idStr,
    createdAt: existente.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  dados.artistas.set(idStr, atualizado);
  return atualizado;
}

/**
 * Recupera informações de um artista pelo ID.
 */
export async function obterArtista(artistId) {
  if (!artistId) return null;
  return dados.artistas.get(String(artistId).trim()) || null;
}

/**
 * Segue um artista para um usuário específico.
 * Garante que o mesmo usuário não siga o mesmo artista mais de uma vez (idempotente).
 */
export async function seguirArtista(userId, artistId, dadosArtista = {}) {
  if (!userId || !artistId) {
    throw new Error('Parâmetros userId e artistId são obrigatórios.');
  }

  const uId = String(userId).trim();
  const aId = String(artistId).trim();

  // Garante existência do usuário
  await obterOuCriarUsuario(uId);

  // Garante existência do artista
  const artista = await salvarArtista({
    id: aId,
    ...dadosArtista
  });

  const chaveRelacao = `${uId}:${aId}`;
  const agora = new Date().toISOString();

  // Registra relacionamento se ainda não existir
  if (!dados.seguidores.has(chaveRelacao)) {
    dados.seguidores.set(chaveRelacao, {
      userId: uId,
      artistId: aId,
      followedAt: agora
    });

    // Atualiza índice do Usuário -> Artistas
    if (!dados.indicesUsuario.has(uId)) {
      dados.indicesUsuario.set(uId, new Set());
    }
    dados.indicesUsuario.get(uId).add(aId);

    // Atualiza índice do Artista -> Usuários
    if (!dados.indicesArtista.has(aId)) {
      dados.indicesArtista.set(aId, new Set());
    }
    dados.indicesArtista.get(aId).add(uId);
  }

  return {
    followed: true,
    artist: artista,
    followedAt: dados.seguidores.get(chaveRelacao).followedAt
  };
}

/**
 * Deixa de seguir um artista.
 */
export async function deixarDeSeguirArtista(userId, artistId) {
  if (!userId || !artistId) {
    throw new Error('Parâmetros userId e artistId são obrigatórios.');
  }

  const uId = String(userId).trim();
  const aId = String(artistId).trim();
  const chaveRelacao = `${uId}:${aId}`;

  const existia = dados.seguidores.delete(chaveRelacao);

  if (dados.indicesUsuario.has(uId)) {
    dados.indicesUsuario.get(uId).delete(aId);
  }

  if (dados.indicesArtista.has(aId)) {
    dados.indicesArtista.get(aId).delete(uId);
  }

  return {
    unfollowed: true,
    existed: existia
  };
}

/**
 * Verifica se um usuário segue determinado artista.
 */
export async function estaSeguindo(userId, artistId) {
  if (!userId || !artistId) return false;
  const uId = String(userId).trim();
  const aId = String(artistId).trim();
  const chaveRelacao = `${uId}:${aId}`;
  return dados.seguidores.has(chaveRelacao);
}

/**
 * Lista todos os artistas seguidos por um usuário, ordenados pelo mais recente.
 */
export async function listarArtistasSeguidos(userId) {
  if (!userId) return [];
  const uId = String(userId).trim();

  const artistIds = dados.indicesUsuario.get(uId);
  if (!artistIds || artistIds.size === 0) return [];

  const lista = [];
  for (const aId of artistIds) {
    const rel = dados.seguidores.get(`${uId}:${aId}`);
    const art = dados.artistas.get(aId) || {
      id: aId,
      name: `Artista ${aId}`,
      image: null,
      source: 'deezer'
    };

    lista.push({
      id: art.id,
      nome: art.name,
      capa: art.image,
      source: art.source,
      seguidoEm: rel?.followedAt || new Date().toISOString()
    });
  }

  // Ordena por data em que foi seguido (mais recentes primeiro)
  return lista.sort((a, b) => new Date(b.seguidoEm) - new Date(a.seguidoEm));
}

/**
 * Cache de lançamentos por artista com TTL de 3 horas.
 */
export async function obterLancamentosCache(artistId) {
  const item = dados.cacheLancamentos.get(String(artistId).trim());
  if (!item) return null;
  if (Date.now() > item.expiraEm) {
    dados.cacheLancamentos.delete(String(artistId).trim());
    return null;
  }
  return item.releases;
}

export async function salvarLancamentosCache(artistId, releases, ttlMs = 3 * 3600 * 1000) {
  dados.cacheLancamentos.set(String(artistId).trim(), {
    releases,
    expiraEm: Date.now() + ttlMs
  });
}
