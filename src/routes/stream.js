import ytdl from '@distube/ytdl-core';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { PassThrough } from 'stream';

// Configura o caminho do FFmpeg
ffmpeg.setFfmpegPath(ffmpegPath.path);

export default async function rotasTransmissao(servidor) {
  servidor.get('/stream/:idVideo', async (requisicao, resposta) => {
    const { idVideo } = requisicao.params;

    if (!ytdl.validateID(idVideo)) {
      return resposta.status(400).send({ erro: 'ID do YouTube inválido' });
    }

    const urlVideo = `https://www.youtube.com/watch?v=${idVideo}`;

    try {
      // Criar um agente com Visitor Data para tentar evitar o bloqueio de "bot"
      const agente = ytdl.createAgent();

      // Obter informações do vídeo com headers e configurações extras
      const informacoes = await ytdl.getInfo(urlVideo, { 
        agent: agente,
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
          }
        }
      });

      // Tenta encontrar o melhor formato de áudio
      const formatos = informacoes.formats || [];
      console.log(`[DEBUG] Formatos encontrados: ${formatos.length}`);

      let formato = ytdl.chooseFormat(formatos, { 
        filter: 'audioonly', 
        quality: 'highestaudio' 
      });

      // Fallback: se não achar 'audioonly', pega qualquer um que tenha áudio
      if (!formato) {
        formato = ytdl.chooseFormat(formatos, { 
          filter: f => f.hasAudio,
          quality: 'highestaudio'
        });
      }

      if (!formato) {
        throw new Error(`Nenhum formato de áudio compatível encontrado entre ${formatos.length} opções.`);
      }

      // Ponte para o streaming
      const ponte = new PassThrough();

      // Configurar headers de resposta
      resposta.type('audio/mpeg');
      resposta.header('Accept-Ranges', 'bytes');
      resposta.header('Cache-Control', 'no-cache');

      // Criar o fluxo de áudio do YouTube usando o formato escolhido
      const fluxoAudio = ytdl.downloadFromInfo(informacoes, {
        format: formato,
        highWaterMark: 1 << 25,
        agent: agente
      });

      let processoFFmpeg;
      try {
        processoFFmpeg = ffmpeg(fluxoAudio)
          .inputOptions([
            '-reconnect 1',
            '-reconnect_streamed 1',
            '-reconnect_delay_max 5'
          ])
          .audioBitrate(128)
          .format('mp3')
          .on('error', (erro) => {
            console.error('[ERROR] Erro FFmpeg:', erro.message);
            if (!ponte.destroyed) ponte.destroy(erro);
          });

        // Pipeline: YouTube -> FFmpeg -> Ponte -> Fastify
        processoFFmpeg.pipe(ponte, { end: true });
      } catch (erro) {
        console.error('[CRITICAL] FFmpeg falhou ao iniciar:', erro.message);
        fluxoAudio.pipe(ponte);
      }

      // Limpeza ao fechar a conexão
      requisicao.raw.on('close', () => {
        if (!fluxoAudio.destroyed) fluxoAudio.destroy();
        if (processoFFmpeg) {
          processoFFmpeg.kill();
        }
        if (!ponte.destroyed) ponte.destroy();
      });

      return resposta.send(ponte);

    } catch (erro) {
      console.error('[ERROR] Erro na transmissao YouTube:', erro.message);
      return resposta.status(500).send({ 
        erro: 'Erro ao processar áudio do YouTube',
        detalhes: erro.message 
      });
    }
  });
}
