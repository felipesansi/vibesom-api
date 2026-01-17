import axios from 'axios';

// ============================================================================
// CONFIGURAÇÕES E HELPERS
// ============================================================================

// Instâncias Piped (YouTube)
const INSTANCIAS_PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt'
];

// Helper para scraping de ID de Cliente do SoundCloud (simplificado)
async function obterIdSoundCloud() {
    return 'LBCcHmRB8XSStWL6wKH2HPACspQlXg2P'; // Fallback rápido
}

export default async function rotasPesquisa(servidor) {
  
  servidor.get('/pesquisa', {
    schema: {
      description: 'Busca geral de músicas em todas as plataformas suportadas',
      tags: ['Busca'],
      querystring: {
        type: 'object',
        required: ['termo'],
        properties: {
          termo: {
            type: 'string',
            description: 'Termo de busca para músicas, artistas ou álbuns'
          }
        }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              source: { type: 'string', description: 'Plataforma de origem' },
              id: { type: 'string', description: 'ID único da música' },
              titulo: { type: 'string', description: 'Título da música' },
              artista: { type: 'string', description: 'Nome do artista' },
              capa: { type: 'string', description: 'URL da capa do álbum' },
              duracao: { type: 'number', description: 'Duração em segundos' },
              streamUrl: { type: 'string', description: 'URL para streaming' }
            }
          }
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
    const { termo } = requisicao.query;
    if (!termo) return resposta.status(400).send({ erro: 'Termo vazio' });

    const termoCodificado = encodeURIComponent(termo);
    const promessas = [];

    // SoundCloud
    const buscaSoundCloud = (async () => {
        try {
            const cid = await obterIdSoundCloud();
            
            const { data } = await axios.get(`https://api-v2.soundcloud.com/search/tracks`, {
                params: { q: termo, client_id: cid, limit: 15 },
                timeout: 4500
            });
            return data.collection.map(t => ({
                source: 'SoundCloud',
                id: String(t.id),
                titulo: t.title,
                artista: t.user?.username,
                capa: t.artwork_url ? t.artwork_url.replace('large', 't500x500') : t.user?.avatar_url,
                duracao: Math.floor(t.duration / 1000),
                streamUrl: `/soundcloud/stream/${t.id}`
            }));
        } catch(e) { return []; }
    })();

    promessas.push(buscaSoundCloud);

    // AUDIUS
    promessas.push((async () => {
        try {
            const { data } = await axios.get(`https://discoveryprovider.audius.co/v1/tracks/search`, {
                params: { query: termo, app_name: 'VIBESOM' },
                timeout: 4000
            });
            return data.data.slice(0, 10).map(t => ({
                source: 'Audius',
                id: t.id,
                titulo: t.title,
                artista: t.user.name,
                capa: t.artwork ? t.artwork['480x480'] : null,
                duracao: t.duration,
                streamUrl: `/audius/stream/${t.id}`
            }));
        } catch(e) { return []; }
    })());

    // JAMENDO
    promessas.push((async () => {
        try {
            const { data } = await axios.get('https://api.jamendo.com/v3.0/tracks/', {
                params: { client_id: 'c9720322', format: 'json', limit: 10, search: termo, include: 'musicinfo' },
                timeout: 4000
            });
            return data.results.map(t => ({
                source: 'Jamendo',
                id: t.id,
                titulo: t.name,
                artista: t.artist_name,
                capa: t.album_image,
                duracao: t.duration,
                streamUrl: `/jamendo/stream/${t.id}`
            }));
        } catch(e) { return []; }
    })());

    // ARCHIVE.ORG
    promessas.push((async () => {
        try {
            const { data } = await axios.get('https://archive.org/advancedsearch.php', {
                params: { q: `${termo} AND mediatype:(audio)`, fl: ['identifier', 'title', 'creator'], rows: 10, output: 'json' },
                timeout: 4000
            });
            return data.response.docs.map(t => ({
                source: 'Archive',
                id: t.identifier,
                titulo: t.title,
                artista: t.creator,
                capa: `https://archive.org/services/img/${t.identifier}`,
                streamUrl: `/archive/stream/${t.identifier}`
            }));
        } catch(e) { return []; }
    })());

    // BANDCAMP
    promessas.push((async () => {
        return [];
    })());

    // SAAVN
    promessas.push((async () => {
        try {
            const { data } = await axios.get(`https://saavn.me/search/songs`, {
                params: { query: termo, limit: 10 },
                timeout: 4500
            });
            if (!data.data || !data.data.results) return [];
            return data.data.results.map(t => {
                const urlDownload = t.downloadUrl?.find(q => q.quality === '320kbps')?.link || 
                                    t.downloadUrl?.find(q => q.quality === '160kbps')?.link || 
                                    t.downloadUrl?.[0]?.link;
                return {
                    source: 'Saavn',
                    id: t.id,
                    titulo: t.name,
                    artista: t.primaryArtists,
                    capa: t.image?.[2]?.link || t.image?.[0]?.link,
                    duracao: t.duration,
                    streamUrl: `/saavn/stream?url=${encodeURIComponent(urlDownload)}`
                };
            });
        } catch(e) { return []; }
    })());

    // YOUTUBE / PIPED
    promessas.push((async () => {
        for (const instancia of INSTANCIAS_PIPED) {
            try {
                const { data } = await axios.get(`${instancia}/search`, {
                    params: { q: termo, filter: 'music_videos' },
                    timeout: 2500,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const itens = data.items || data.streams;
                if (itens && itens.length > 0) {
                    return itens.filter(i => i.type === 'stream').map(i => ({
                        source: 'YouTube',
                        id: i.url ? i.url.split('v=')[1] : i.id,
                        titulo: i.title,
                        artista: i.uploaderName,
                        capa: i.thumbnail,
                        duracao: i.duration,
                        streamUrl: `/stream/${i.url ? i.url.split('v=')[1] : i.id}`
                    }));
                }
            } catch (e) { continue; }
        }
        return [];
    })());

    // PALCO MP3
    promessas.push((async () => {
        try {
            const { data: html } = await axios.get(`https://www.palcomp3.com.br/busca.htm?q=${termoCodificado}`, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 5000
            });
            const correspondencia = html.match(/window\.__APOLLO_STATE__\s*=\s*"(.*?)";/);
            if (!correspondencia) return [];
            const stringEstado = correspondencia[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const estado = JSON.parse(stringEstado);
            const musicas = [];
            Object.keys(estado).forEach(chave => {
                if (chave.startsWith('Music:')) {
                    const musica = estado[chave];
                    if (musica.mp3File && musica.title) {
                        let nomeArtista = 'Artista Desconhecido';
                        let capa = null;
                        if (musica.artist && musica.artist.id && estado[musica.artist.id]) {
                            nomeArtista = estado[musica.artist.id].name || nomeArtista;
                            const dadosArtista = estado[musica.artist.id];
                            if (dadosArtista.thumbnail && estado[dadosArtista.thumbnail.id]) {
                                capa = estado[dadosArtista.thumbnail.id].url || null;
                            }
                        }
                        musicas.push({
                            source: 'PalcoMP3',
                            id: String(musica.musicID || musica.id),
                            titulo: musica.title,
                            artista: nomeArtista,
                            capa: capa,
                            duracao: musica.duration || 0,
                            streamUrl: `/palco/stream?url=${encodeURIComponent(musica.mp3File)}`
                        });
                    }
                }
            });
            return musicas.slice(0, 10);
        } catch(e) { return []; }
    })());

    // EXECUÇÃO EM PARALELO
    try {
        const resultados = await Promise.all(promessas);
        const unificados = resultados.flat();

        if (unificados.length === 0) {
            return resposta.status(404).send({ erro: 'Nada encontrado.' });
        }

        // Mistura os resultados
        return resposta.send(unificados.sort(() => Math.random() - 0.5));

    } catch (erro) {
        return resposta.status(500).send({ erro: 'Erro fatal na busca' });
    }
  });
}
