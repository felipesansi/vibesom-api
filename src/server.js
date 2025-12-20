import 'dotenv/config'
import Fastify from "fastify";
import cors from "@fastify/cors";
import rotasPesquisa from "./routes/search.js";
import rotasTransmissao from "./routes/stream.js";

const servidor = Fastify({
  logger: false
})

// Habilita CORS para o React Native
servidor.register(cors, {
  origin: "*",
  methods: ["GET"]
})

servidor.register(rotasPesquisa)
servidor.register(rotasTransmissao)

// Para rodar localmente
if (process.env.NODE_ENV !== 'production') {
  servidor.listen({
    port: 3333,
    host: '0.0.0.0'
  })
}

// Export para o Vercel
export default async (requisicao, resposta) => {
  await servidor.ready();
  servidor.server.emit('request', requisicao, resposta);
}
