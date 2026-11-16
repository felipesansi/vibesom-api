import axios from 'axios';
import { buscarSaavnComEspelhos } from './src/routes/saavn.js';
import { obterIdCliente } from './src/routes/soundcloud.js';

async function testarFontes() {
  console.log('--- TESTANDO JIOSAAVN ---');
  try {
    const musicas = await buscarSaavnComEspelhos('eminem lose yourself');
    console.log('JioSaavn direto/espelhos:', musicas.length, 'músicas encontradas');
    if (musicas[0]) {
      console.log('Primeira música Saavn:', musicas[0].titulo, 'por', musicas[0].artista, musicas[0].streamUrl);
    }
  } catch (e) {
    console.log('JioSaavn falhou:', e.message);
  }

  console.log('\n--- TESTANDO SOUNDCLOUD ---');
  try {
    const cid = await obterIdCliente();
    console.log('SoundCloud Client ID obtido:', cid);
    const res = await axios.get('https://api-v2.soundcloud.com/search/tracks', {
      params: { q: 'eminem lose yourself', client_id: cid, limit: 3 },
      timeout: 6000
    });
    console.log('SoundCloud:', res.status, res.data?.collection?.length || 0, 'tracks');
  } catch (e) {
    console.log('SoundCloud falhou:', e.message);
  }

  console.log('\n--- TESTANDO AUDIUS ---');
  try {
    const resNode = await axios.get('https://api.audius.co', { timeout: 5000 });
    const host = resNode.data?.data?.[0] || 'https://discoveryprovider.audius.co';
    console.log('Audius host:', host);
    const res = await axios.get(`${host}/v1/tracks/search?query=electronic&limit=3&app_name=VIBESOM`, { timeout: 6000 });
    console.log('Audius tracks:', res.data?.data?.length || 0);
  } catch (e) {
    console.log('Audius falhou:', e.message);
  }
}

testarFontes();
