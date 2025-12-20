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

// Rota raiz para teste
servidor.get('/', async () => {
  return { status: "VibeSom API Online", versao: "1.0.0" }
})

servidor.register(rotasPesquisa)
servidor.register(rotasTransmissao)

// Para rodar localmente ou em serviços como Render/Railway
const port = process.env.PORT || 3333;

if (process.env.VERCEL) {
  // Export para o Vercel (opcional, já que está usando serverless lá)
  console.log('Rodando modo Vercel');
} else {
  servidor.listen({
    port: port,
    host: '0.0.0.0'
  }).then(() => {
    console.log(`Servidor rodando em: http://0.0.0.0:${port}`);
  });
}

// Export para o Vercel
export default async (requisicao, resposta) => {
  await servidor.ready();
  servidor.server.emit('request', requisicao, resposta);
}
