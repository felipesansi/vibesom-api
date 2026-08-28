import axios from 'axios';
import { obterLancamentosCache, salvarLancamentosCache } from './db.js';
import { obterServidorAtivo as obterServidorAtivoAudius } from '../routes/audius.js';

function normalizarTexto(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Obtém os lançamentos mais recentes de um artista individual a partir de múltiplas fontes.
 */
export async function obterLancamentosArtista(artista) {
  if (!artista || !artista.id) return [];
  const artistId = String(artista.id).trim();
  const nomeArtista = artista.name || artista.nome || '';

  // 1. Verifica cache existente
  const emCache = await obterLancamentosCache(artistId);
  if (emCache && Array.isArray(emCache) && emCache.length > 0) {
    return emCache;
  }

  const lancamentos = [];
  const titulosVistos = new Set();

  // 2. FONTE PRINCIPAL: DEEZER (Metadados ricos de discografia, singles e álbuns oficiais)
  try {
    let idDeezer = /^\d+$/.test(artistId) ? artistId : null;

    // Se o ID não for numérico, busca o ID do artista no Deezer pelo nome
    if (!idDeezer && nomeArtista) {
      const { data: buscaDeezer } = await axios.get(
        `https://api.deezer.com/search/artist?q=${encodeURIComponent(nomeArtista)}`,
        { timeout: 4000 }
      );
      if (buscaDeezer?.data?.[0]?.id) {
        idDeezer = String(buscaDeezer.data[0].id);
      }
    }

    if (idDeezer) {
      // Busca álbuns e singles recentes do artista
      const { data: albunsRes } = await axios.get(
        `https://api.deezer.com/artist/${idDeezer}/albums?limit=25`,
        { timeout: 5000 }
      );

      const albuns = albunsRes?.data || [];

      for (const alb of albuns) {
        const dataLancamento = alb.release_date || null;
        const capaAlbum = alb.cover_xl || alb.cover_medium || alb.cover_big;

        // Se for single, o próprio álbum é a música
        if (alb.record_type === 'single' || alb.record_type === 'ep') {
          const chave = normalizarTexto(alb.title);
          if (!titulosVistos.has(chave)) {
            titulosVistos.add(chave);
            lancamentos.push({
              id: `dz_${alb.id}`,
              titulo: alb.title,
              artista: nomeArtista || alb.artist?.name,
              artistaId: artistId,
              album: alb.title,
              tipo: alb.record_type,
              capa: capaAlbum,
              dataLancamento: dataLancamento,
              duracao: 0,
              source: 'Deezer',
              streamUrl: `/resolver?artista=${encodeURIComponent(nomeArtista || alb.artist?.name)}&faixa=${encodeURIComponent(alb.title)}`
            });
          }
        } else {
          // Para álbuns completos, adiciona as faixas do álbum (limitado a top 5 mais recentes)
          try {
            const { data: faixasRes } = await axios.get(
              `https://api.deezer.com/album/${alb.id}/tracks?limit=5`,
              { timeout: 3500 }
            );
            const faixas = faixasRes?.data || [];
            for (const f of faixas) {
              const chave = normalizarTexto(f.title);
              if (!titulosVistos.has(chave)) {
                titulosVistos.add(chave);
                lancamentos.push({
                  id: `dz_${f.id}`,
                  titulo: f.title,
                  artista: nomeArtista || f.artist?.name,
                  artistaId: artistId,
                  album: alb.title,
                  tipo: alb.record_type || 'album',
                  capa: capaAlbum,
                  dataLancamento: dataLancamento,
                  duracao: f.duration || 0,
                  previewUrl: f.preview || null,
                  source: 'Deezer',
                  streamUrl: `/resolver?artista=${encodeURIComponent(nomeArtista || f.artist?.name)}&faixa=${encodeURIComponent(f.title)}`
                });
              }
            }
          } catch (e) {}
        }
      }

      // Se ainda tiver poucas faixas, busca Top Tracks do artista
      if (lancamentos.length < 5) {
        const { data: topRes } = await axios.get(
          `https://api.deezer.com/artist/${idDeezer}/top?limit=15`,
          { timeout: 4000 }
        );
        const topTracks = topRes?.data || [];
        for (const t of topTracks) {
          const chave = normalizarTexto(t.title);
          if (!titulosVistos.has(chave)) {
            titulosVistos.add(chave);
            lancamentos.push({
              id: `dz_${t.id}`,
              titulo: t.title,
              artista: nomeArtista || t.artist?.name,
              artistaId: artistId,
              album: t.album?.title || 'Top Track',
              tipo: 'track',
              capa: t.album?.cover_xl || t.album?.cover_medium,
              dataLancamento: null, // Deezer top tracks nem sempre traz release_date no item
              duracao: t.duration || 0,
              source: 'Deezer',
              streamUrl: `/resolver?artista=${encodeURIComponent(nomeArtista || t.artist?.name)}&faixa=${encodeURIComponent(t.title)}`
            });
          }
        }
      }
    }
  } catch (e) {
    console.warn(`[RELEASES] Erro Deezer para ${nomeArtista || artistId}:`, e.message);
  }

  // 3. FONTE ALTERNATIVA: AUDIUS (se artista for do Audius ou se Deezer retornou vazio)
  if (lancamentos.length === 0 && nomeArtista) {
    try {
      const host = await obterServidorAtivoAudius();
      const { data: audiusTracks } = await axios.get(`${host}/v1/tracks/search`, {
        params: { query: nomeArtista, limit: 15, app_name: 'VIBESOM' },
        timeout: 4000
      });

      for (const t of audiusTracks?.data || []) {
        const chave = normalizarTexto(t.title);
        if (!titulosVistos.has(chave)) {
          titulosVistos.add(chave);
          lancamentos.push({
            id: `au_${t.id}`,
            titulo: t.title,
            artista: t.user?.name || nomeArtista,
            artistaId: artistId,
            album: 'Audius Release',
            tipo: 'single',
            capa: t.artwork?.['480x480'] || t.artwork?.['150x150'] || null,
            dataLancamento: t.release_date || null,
            duracao: t.duration || 0,
            source: 'Audius',
            streamUrl: `/audius/stream/${t.id}`
          });
        }
      }
    } catch (e) {}
  }

  // 4. FONTE ALTERNATIVA: SAAVN (músicas populares e recentes)
  if (lancamentos.length === 0 && nomeArtista) {
    try {
      const { data: saavnRes } = await axios.get(`https://saavn.me/search/songs`, {
        params: { query: nomeArtista, limit: 10 },
        timeout: 4000
      });
      for (const t of saavnRes?.data?.results || []) {
        const chave = normalizarTexto(t.name);
        if (!titulosVistos.has(chave)) {
          titulosVistos.add(chave);
          const urlDownload = t.downloadUrl?.find(q => q.quality === '320kbps')?.link || t.downloadUrl?.[0]?.link;
          lancamentos.push({
            id: `sv_${t.id}`,
            titulo: t.name,
            artista: t.primaryArtists || nomeArtista,
            artistaId: artistId,
            album: t.album?.name || 'Single',
            tipo: 'single',
            capa: t.image?.[2]?.link || t.image?.[0]?.link,
            dataLancamento: t.year ? `${t.year}-01-01` : null,
            duracao: t.duration || 0,
            source: 'Saavn',
            streamUrl: urlDownload ? `/saavn/stream?url=${encodeURIComponent(urlDownload)}` : `/resolver?artista=${encodeURIComponent(nomeArtista)}&faixa=${encodeURIComponent(t.name)}`
          });
        }
      }
    } catch (e) {}
  }

  // Salva no cache
  if (lancamentos.length > 0) {
    await salvarLancamentosCache(artistId, lancamentos);
  }

  return lancamentos;
}

/**
 * Agrega e pagina os lançamentos de todos os artistas que o usuário segue.
 * Ordena rigorosamente do mais recente para o mais antigo e remove duplicatas.
 */
export async function agregarNovosLancamentos(artistasSeguidos, { pagina = 1, limite = 20 } = {}) {
  if (!Array.isArray(artistasSeguidos) || artistasSeguidos.length === 0) {
    return {
      pagina: Number(pagina),
      limite: Number(limite),
      total: 0,
      totalPaginas: 0,
      lancamentos: []
    };
  }

  // Busca lançamentos de todos os artistas em paralelo
  const promessas = artistasSeguidos.map(art => obterLancamentosArtista(art));
  const resultados = await Promise.allSettled(promessas);

  const todosLancamentos = [];
  const vistos = new Set();

  for (const res of resultados) {
    if (res.status === 'fulfilled' && Array.isArray(res.value)) {
      for (const item of res.value) {
        const chaveUnica = `${normalizarTexto(item.titulo)}:::${normalizarTexto(item.artista)}`;
        if (!vistos.has(chaveUnica)) {
          vistos.add(chaveUnica);
          todosLancamentos.push(item);
        }
      }
    }
  }

  // Ordenação: Lançamentos mais recentes primeiro
  todosLancamentos.sort((a, b) => {
    // Se ambos têm data de lançamento no formato YYYY-MM-DD
    if (a.dataLancamento && b.dataLancamento) {
      return new Date(b.dataLancamento).getTime() - new Date(a.dataLancamento).getTime();
    }
    // Quem tem data fica na frente de quem não tem
    if (a.dataLancamento && !b.dataLancamento) return -1;
    if (!a.dataLancamento && b.dataLancamento) return 1;
    return 0;
  });

  // Paginação
  const pageNum = Math.max(1, parseInt(pagina, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limite, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const paginados = todosLancamentos.slice(offset, offset + limitNum);
  const total = todosLancamentos.length;
  const totalPaginas = Math.ceil(total / limitNum);

  return {
    pagina: pageNum,
    limite: limitNum,
    total,
    totalPaginas,
    lancamentos: paginados
  };
}
