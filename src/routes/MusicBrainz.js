import axios from "axios";

const MB_HEADERS = {
  "User-Agent": "Vibesom/1.0 (contato: felipesansi2012@gmail.com)"
};

const MB_URL = "https://musicbrainz.org/ws/2";


export default async function rotasMusicBrainz(servidor) {

  // Buscar artista
  servidor.get("/musicbrainz/artista/:nome", async (req, reply) => {
    try {
      const { nome } = req.params;

      const resposta = await axios.get(
        `${MB_URL}/artist`,
        {
          headers: MB_HEADERS,
          params: {
            query: `artist:${nome}`,
            fmt: "json"
          }
        }
      );

      return resposta.data.artists.slice(0, 5);

    } catch (erro) {
      console.error(erro.message);

      return reply.code(500).send({
        erro: "Erro ao buscar artista"
      });
    }
  });


  // Buscar álbum
  servidor.get("/musicbrainz/album/:id", async (req, reply) => {
    try {
      const { id } = req.params;

      const resposta = await axios.get(
        `${MB_URL}/release-group`,
        {
          headers: MB_HEADERS,
          params: {
            artist: id,
            fmt: "json"
          }
        }
      );

      return resposta.data.release_groups;

    } catch (erro) {
      return reply.code(500).send({
        erro: "Erro ao buscar álbuns"
      });
    }
  });


  // Buscar músicas
  servidor.get("/musicbrainz/musicas/:id", async (req, reply) => {
    try {
      const { id } = req.params;

      const resposta = await axios.get(
        `${MB_URL}/recording`,
        {
          headers: MB_HEADERS,
          params: {
            artist: id,
            fmt: "json"
          }
        }
      );

      return resposta.data.recordings;

    } catch (erro) {
      return reply.code(500).send({
        erro: "Erro ao buscar músicas"
      });
    }
  });

}