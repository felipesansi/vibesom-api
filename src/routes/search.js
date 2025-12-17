import axios from 'axios'


export default async function searchRoutes(app) {
  app.get('/pesquisa', async (request, reply) => {
    try {
    const { termo } = request.query

    const response = await axios.get(
      'https://www.googleapis.com/youtube/v3/search',
      {
        params: {
          part: 'snippet',
          q: termo,
          key: process.env.YOUTUBE_API_KEY
        }
      }
    )

    return response.data
    } catch (error) {
      console.log(error)
        console.error('Erro ao buscar vídeos:', error)
        return reply.status(500).send({ error: 'Erro ao buscar vídeos' })
    }
  })
}
