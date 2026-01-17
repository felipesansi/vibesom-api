import 'dotenv/config'
import Fastify from "fastify";
import cors from "@fastify/cors";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import rotasPesquisa from "./src/routes/pesquisa.js";
import rotasTransmissao from "./src/routes/transmissao.js";
import rotasAudius from './src/routes/audius.js';
import rotasSoundCloud from './src/routes/soundcloud.js';
import rotasJamendo from './src/routes/jamendo.js';
import rotasArchive from './src/routes/archive.js';
import rotasMixcloud from './src/routes/mixcloud.js';
import rotasHearThis from './src/routes/hearthis.js';
import rotasBandcamp from './src/routes/bandcamp.js';
import rotasDailymotion from './src/routes/dailymotion.js';
import rotasVideo from './src/routes/video.js';
import rotasSaavn from './src/routes/saavn.js';
import rotasPalco from './src/routes/palco.js';

const servidor = Fastify({
  logger: false
})

// Configuração do Swagger
servidor.register(swagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'VibeSom API',
      description: 'API para busca e streaming de músicas de múltiplas plataformas',
      version: '1.0.0'
    },
    servers: [
      {
        url: 'https://vibesom-api-c7re.vercel.app',
        description: 'Servidor de produção'
      }
    ],
    tags: [
      { name: 'Geral', description: 'Rotas gerais da API' },
      { name: 'Busca', description: 'Rotas de busca de músicas' },
      { name: 'Streaming', description: 'Rotas de streaming de músicas' },
      { name: 'SoundCloud', description: 'Rotas específicas do SoundCloud' },
      { name: 'Audius', description: 'Rotas específicas do Audius' },
      { name: 'Jamendo', description: 'Rotas específicas do Jamendo' },
      { name: 'Archive', description: 'Rotas específicas do Internet Archive' },
      { name: 'Mixcloud', description: 'Rotas específicas do Mixcloud' },
      { name: 'HearThis', description: 'Rotas específicas do HearThis.at' },
      { name: 'Dailymotion', description: 'Rotas específicas do Dailymotion' },
      { name: 'Bandcamp', description: 'Rotas específicas do Bandcamp' },
      { name: 'Palco MP3', description: 'Rotas específicas do Palco MP3' },
      { name: 'Saavn', description: 'Rotas específicas do Saavn' }
    ]
  }
})

servidor.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'full',
    deepLinking: false
  },
  staticCSP: true,
  transformStaticCSP: (header) => header
})

// Habilita CORS para o React Native
servidor.register(cors, {
  origin: "*",
  methods: ["GET"]
})

// Rota raiz para teste
servidor.get('/', {
  schema: {
    description: 'Verifica o status da API',
    tags: ['Geral'],
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          versao: { type: 'string' }
        }
      }
    }
  }
}, async () => {
  return { status: "VibeSom API Online", versao: "1.0.0" }
})

servidor.register(rotasPesquisa)
servidor.register(rotasTransmissao)
servidor.register(rotasAudius)
servidor.register(rotasSoundCloud)
servidor.register(rotasJamendo)
servidor.register(rotasArchive)
servidor.register(rotasMixcloud)
servidor.register(rotasHearThis)
servidor.register(rotasBandcamp)
servidor.register(rotasDailymotion)
servidor.register(rotasVideo)
servidor.register(rotasSaavn)
servidor.register(rotasPalco)

// Para rodar localmente ou em serviços como Render/Railway
const porta = process.env.PORT || 3333;

if (process.env.VERCEL) {
  // Export para o Vercel (opcional, já que está usando serverless lá)
  console.log('Rodando em modo Vercel');
} else {
  servidor.listen({
    port: porta,
    host: '0.0.0.0'
  }).then(() => {
    console.log(`Servidor rodando em: http://0.0.0.0:${porta}`);
  });
}

// Export para o Vercel
export default async (requisicao, resposta) => {
  await servidor.ready();
  servidor.server.emit('request', requisicao, resposta);
}
