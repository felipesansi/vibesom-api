import axios from "axios";

export default async function rotasMusicBrainz(servidor) {

  // Buscar artista (Agora usando Deezer)
  servidor.get("/musicbrainz/artista/:nome", async (req, reply) => {
    try {
      const { nome } = req.params;

      const resposta = await axios.get(
        `https://api.deezer.com/search/artist?q=${encodeURIComponent(nome)}`
      );

      if (!resposta.data || !resposta.data.data) {
        return [];
      }

      // Mapeia para o formato esperado e retorna os 5 melhores
      const artistas = resposta.data.data.slice(0, 5).map(art => ({
        id: String(art.id),
        name: art.name,
        picture: art.picture_xl || art.picture_medium,
        fans: art.nb_fan,
        albums: art.nb_album
      }));

      return artistas;

    } catch (erro) {
      console.error(erro.message);
      return reply.code(500).send({
        erro: "Erro ao buscar artista"
      });
    }
  });


  // Buscar álbum (Agora usando Deezer)
  servidor.get("/musicbrainz/album/:id", async (req, reply) => {
    try {
      const { id } = req.params;

      const resposta = await axios.get(
        `https://api.deezer.com/artist/${id}/albums?limit=50`
      );

      if (!resposta.data || !resposta.data.data) {
        return [];
      }

      // Mapeia para o formato que a interface consome
      const albuns = resposta.data.data.map(alb => ({
        id: String(alb.id),
        title: alb.title,
        cover: alb.cover_xl || alb.cover_medium,
        "first-release-date": alb.release_date,
        type: alb.record_type
      }));

      return albuns;

    } catch (erro) {
      console.error(erro.message);
      return reply.code(500).send({
        erro: "Erro ao buscar álbuns"
      });
    }
  });


  // Buscar músicas / Top Tracks do artista (Agora usando Deezer)
  servidor.get("/musicbrainz/musicas/:id", async (req, reply) => {
    try {
      const { id } = req.params;

      const resposta = await axios.get(
        `https://api.deezer.com/artist/${id}/top?limit=50`
      );

      if (!resposta.data || !resposta.data.data) {
        return [];
      }

      // Mapeia para o formato que a interface consome
      const musicas = resposta.data.data.map(trk => ({
        id: String(trk.id),
        title: trk.title,
        length: trk.duration * 1000, // Converte segundos para ms como o MusicBrainz
        preview: trk.preview,
        cover: trk.album?.cover_medium,
        album: trk.album?.title
      }));

      return musicas;

    } catch (erro) {
      console.error(erro.message);
      return reply.code(500).send({
        erro: "Erro ao buscar músicas"
      });
    }
  });

}