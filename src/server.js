import 'dotenv/config'
import Fastify from "fastify";
import searchRoutes from "./routes/search.js";

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
      }
    }
  }
})

app.register(searchRoutes)

app.listen({
  port: 3333,
  host: '0.0.0.0'
})
