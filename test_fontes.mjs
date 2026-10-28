import axios from 'axios';

async function testarFontes() {
  console.log('--- TESTANDO JIOSAAVN ---');
  try {
    const res = await axios.get('https://saavn-api.vercel.app/api/search/songs?query=eminem lose yourself&limit=3', { timeout: 6000 });
    console.log('Saavn (saavn-api.vercel.app/api):', res.status, res.data?.data?.results?.length || res.data?.results?.length || 0, 'resultados');
    const first = res.data?.data?.results?.[0] || res.data?.results?.[0];
    if (first) {
      console.log('Primeira música Saavn:', first.name || first.title, first.downloadUrl?.[0]?.link || first.url);
    }
  } catch (e) {
    console.log('Saavn saavn-api falhou:', e.message);
  }

  try {
    const res = await axios.get('https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=eminem lose yourself&limit=3', { timeout: 6000 });
    console.log('Saavn (jiosaavn-api-privatecvc2):', res.status, res.data?.data?.results?.length || 0, 'resultados');
  } catch (e) {
    console.log('Saavn jiosaavn-api falhou:', e.message);
  }

  console.log('\n--- TESTANDO SOUNDCLOUD ---');
  try {
    const cid = 'iZIs9mchVcX5lhVR1SlKKdooUegaLIQ2';
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
