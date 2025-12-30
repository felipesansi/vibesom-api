import ytdl from '@distube/ytdl-core';

async function test() {
  const idVideo = 'N4bFqW_eu2I';
  const urlVideo = `https://www.youtube.com/watch?v=${idVideo}`;
  
  try {
    console.log('Obtendo info...');
    const informacoes = await ytdl.getInfo(urlVideo, { 
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        }
      }
    });
    
    console.log('Formatos encontrados:', informacoes.formats.length);
    
    let formato = ytdl.chooseFormat(informacoes.formats, { 
      filter: 'audioonly', 
      quality: 'highestaudio' 
    });

    if (!formato) {
      console.log('audioonly falhou, tentando hasAudio...');
      formato = ytdl.chooseFormat(informacoes.formats, { 
        filter: f => f.hasAudio,
        quality: 'highestaudio'
      });
    }

    if (formato) {
      console.log('Formato encontrado:', formato.mimeType, formato.url.substring(0, 50) + '...');
    } else {
      console.log('Nenhum formato!');
    }
  } catch (e) {
    console.error('Erro:', e.message);
  }
}

test();
