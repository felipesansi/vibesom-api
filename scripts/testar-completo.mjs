import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rotasPesquisa from '../src/routes/pesquisa.js';
import rotasTransmissao from '../src/routes/transmissao.js';
import rotasAudius from '../src/routes/audius.js';
import rotasSoundCloud from '../src/routes/soundcloud.js';
import rotasJamendo from '../src/routes/jamendo.js';
import rotasArchive from '../src/routes/archive.js';
import rotasMixcloud from '../src/routes/mixcloud.js';
import rotasHearThis from '../src/routes/hearthis.js';
import rotasBandcamp from '../src/routes/bandcamp.js';
import rotasDailymotion from '../src/routes/dailymotion.js';
import rotasVideo from '../src/routes/video.js';
import rotasSaavn from '../src/routes/saavn.js';
import rotasPalco from '../src/routes/palco.js';
import rotasYoutube from '../src/routes/youtube.js';
import rotasMusicBrainz from '../src/routes/MusicBrainz.js';
import rotasResolver from '../src/routes/resolver.js';
import rotasArtists from '../src/routes/artists.js';

async function executarTestes() {
  console.log('====================================================');
  console.log('🎵 INICIANDO SUÍTE DE TESTES COMPLETOS DA VIBESOM API');
  console.log('====================================================\n');

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: '*' });

  await app.register(rotasPesquisa);
  await app.register(rotasTransmissao);
  await app.register(rotasAudius);
  await app.register(rotasSoundCloud);
  await app.register(rotasJamendo);
  await app.register(rotasArchive);
  await app.register(rotasMixcloud);
  await app.register(rotasHearThis);
  await app.register(rotasBandcamp);
  await app.register(rotasDailymotion);
  await app.register(rotasMusicBrainz);
  await app.register(rotasVideo);
  await app.register(rotasSaavn);
  await app.register(rotasPalco);
  await app.register(rotasYoutube);
  await app.register(rotasResolver);
  await app.register(rotasArtists);

  app.get('/', async () => ({ status: 'VibeSom API Online', versao: '1.1.0' }));

  await app.ready();

  let sucessos = 0;
  let falhas = 0;

  function assert(condicao, mensagem) {
    if (condicao) {
      console.log(`  ✅ [PASSOU] ${mensagem}`);
      sucessos++;
    } else {
      console.error(`  ❌ [FALHOU] ${mensagem}`);
      falhas++;
    }
  }

  // TESTE 1: STATUS RAIZ
  console.log('--- Teste 1: Rota Raiz ---');
  const resRaiz = await app.inject({ method: 'GET', url: '/' });
  assert(resRaiz.statusCode === 200, 'Status HTTP 200 na raiz');
  assert(resRaiz.json().status === 'VibeSom API Online', 'Mensagem de status correta');

  // TESTE 2: RESOLVER MULTI-PROVEDOR COM FALLBACK
  console.log('\n--- Teste 2: Resolver Multi-Provedor (/resolver) ---');
  const resResolver = await app.inject({
    method: 'GET',
    url: '/resolver?artista=Eminem&faixa=Lose%20Yourself'
  });
  assert(resResolver.statusCode === 200, 'Status HTTP 200 no resolver');
  const dadosResolver = resResolver.json();
  assert(!!dadosResolver.source, `Fonte identificada: ${dadosResolver.source}`);
  assert(!!dadosResolver.streamUrl, `URL de stream retornada: ${dadosResolver.streamUrl}`);
  assert(!!dadosResolver.titulo, `Título retornado: ${dadosResolver.titulo}`);

  // TESTE 3: BUSCA SAAVN
  console.log('\n--- Teste 3: Busca Saavn (/saavn/search/eminem) ---');
  const resSaavn = await app.inject({ method: 'GET', url: '/saavn/search/eminem' });
  assert(resSaavn.statusCode === 200, 'Status HTTP 200 no Saavn');
  const dadosSaavn = resSaavn.json();
  assert(Array.isArray(dadosSaavn) && dadosSaavn.length > 0, `Saavn retornou ${dadosSaavn.length} músicas`);

  // TESTE 4: STREAM COM SUPORTE A RANGE HEADERS
  console.log('\n--- Teste 4: Stream com Range Headers (/saavn/stream) ---');
  if (dadosSaavn[0]?.streamUrl) {
    const resStream = await app.inject({
      method: 'GET',
      url: dadosSaavn[0].streamUrl,
      headers: { Range: 'bytes=0-1024' }
    });
    assert(
      resStream.statusCode === 200 || resStream.statusCode === 206 || resStream.statusCode === 302,
      `Status HTTP ${resStream.statusCode} no stream com Range`
    );
    assert(
      resStream.headers['content-type']?.includes('audio') || resStream.headers['accept-ranges'] === 'bytes' || resStream.statusCode === 302,
      'Headers de áudio ou Accept-Ranges presentes'
    );
  }

  // TESTE 5: SOUNDCLOUD BUSCA E FALLBACK CLIENT ID
  console.log('\n--- Teste 5: SoundCloud Busca (/soundcloud/search/eminem) ---');
  const resSc = await app.inject({ method: 'GET', url: '/soundcloud/search/eminem' });
  assert(resSc.statusCode === 200, 'Status HTTP 200 no SoundCloud');
  const dadosSc = resSc.json();
  assert(Array.isArray(dadosSc) && dadosSc.length > 0, `SoundCloud retornou ${dadosSc.length} músicas`);

  // TESTE 6: AUDIUS BUSCA
  console.log('\n--- Teste 6: Audius Busca (/audius/search/electronic) ---');
  const resAu = await app.inject({ method: 'GET', url: '/audius/search/electronic' });
  assert(resAu.statusCode === 200, 'Status HTTP 200 no Audius');
  const dadosAu = resAu.json();
  assert(Array.isArray(dadosAu) && dadosAu.length > 0, `Audius retornou ${dadosAu.length} músicas`);

  // TESTE 7: SEGUIR ARTISTA (AUTENTICAÇÃO & IDEMPOTÊNCIA)
  console.log('\n--- Teste 7: Seguir Artista (/artists/:artistId/follow) ---');
  const userId = 'user_teste_123';

  // Tentativa sem autenticação -> deve retornar 401
  const resFollowSemAuth = await app.inject({
    method: 'POST',
    url: '/artists/13/follow'
  });
  assert(resFollowSemAuth.statusCode === 401, 'Retornou 401 para requisição sem autenticação');

  // Seguir artista com usuário autenticado
  const resFollow1 = await app.inject({
    method: 'POST',
    url: '/artists/13/follow',
    headers: { 'x-user-id': userId },
    payload: { name: 'Eminem' }
  });
  assert(resFollow1.statusCode === 200, 'Status HTTP 200 ao seguir artista');
  assert(resFollow1.json().following === true, 'following = true retornado');

  // Seguir novamente (idempotência)
  const resFollow2 = await app.inject({
    method: 'POST',
    url: '/artists/13/follow',
    headers: { 'x-user-id': userId }
  });
  assert(resFollow2.statusCode === 200, 'Status HTTP 200 na repetição de follow (idempotente)');
  assert(resFollow2.json().following === true, 'following = true mantido');

  // Seguir segundo artista (Daft Punk = 27)
  await app.inject({
    method: 'POST',
    url: '/artists/27/follow',
    headers: { 'x-user-id': userId },
    payload: { name: 'Daft Punk' }
  });

  // TESTE 8: VERIFICAR SE SEGUE ARTISTA
  console.log('\n--- Teste 8: Verificar se Segue Artista (/artists/:artistId/following) ---');
  const resCheck13 = await app.inject({
    method: 'GET',
    url: '/artists/13/following',
    headers: { 'x-user-id': userId }
  });
  assert(resCheck13.statusCode === 200, 'Status HTTP 200 na checagem');
  assert(resCheck13.json().following === true, 'Usuário segue o artista 13');

  const resCheck9999 = await app.inject({
    method: 'GET',
    url: '/artists/99999999/following',
    headers: { 'x-user-id': userId }
  });
  assert(resCheck9999.statusCode === 200, 'Status HTTP 200 na checagem de artista não seguido');
  assert(resCheck9999.json().following === false, 'Usuário NÃO segue o artista 99999999');

  // TESTE 9: LISTAR ARTISTAS SEGUIDOS
  console.log('\n--- Teste 9: Listar Artistas Seguidos (/artists/following) ---');
  const resList = await app.inject({
    method: 'GET',
    url: '/artists/following',
    headers: { 'x-user-id': userId }
  });
  assert(resList.statusCode === 200, 'Status HTTP 200 na listagem');
  const dadosList = resList.json();
  assert(Array.isArray(dadosList) && dadosList.length === 2, `Lista contém 2 artistas seguidos (retornou ${dadosList.length})`);
  assert(dadosList.some(a => a.id === '13'), 'Contém Eminem (ID 13)');
  assert(dadosList.some(a => a.id === '27'), 'Contém Daft Punk (ID 27)');

  // TESTE 10: NOVOS LANÇAMENTOS DOS ARTISTAS SEGUIDOS
  console.log('\n--- Teste 10: Novos Lançamentos dos Artistas Seguidos (/artists/new-releases) ---');
  const resReleases = await app.inject({
    method: 'GET',
    url: '/artists/new-releases?page=1&limit=10',
    headers: { 'x-user-id': userId }
  });
  assert(resReleases.statusCode === 200, 'Status HTTP 200 em novos lançamentos');
  const dadosReleases = resReleases.json();
  assert(dadosReleases.pagina === 1, 'Página = 1');
  assert(dadosReleases.limite === 10, 'Limite = 10');
  assert(Array.isArray(dadosReleases.lancamentos) && dadosReleases.lancamentos.length > 0, `Retornou ${dadosReleases.lancamentos?.length} lançamentos agregados`);
  
  if (dadosReleases.lancamentos?.length > 0) {
    const primeiro = dadosReleases.lancamentos[0];
    console.log(`    Primeiro lançamento: "${primeiro.titulo}" por ${primeiro.artista} (${primeiro.dataLancamento || 'sem data'})`);
    assert(!!primeiro.titulo, 'Lançamento possui título');
    assert(!!primeiro.streamUrl, 'Lançamento possui streamUrl para reprodução');
  }

  // TESTE 11: DEIXAR DE SEGUIR ARTISTA
  console.log('\n--- Teste 11: Deixar de Seguir Artista (DELETE /artists/:artistId/follow) ---');
  const resUnfollow = await app.inject({
    method: 'DELETE',
    url: '/artists/13/follow',
    headers: { 'x-user-id': userId }
  });
  assert(resUnfollow.statusCode === 200, 'Status HTTP 200 ao deixar de seguir');
  assert(resUnfollow.json().following === false, 'following = false retornado');

  const resCheck13After = await app.inject({
    method: 'GET',
    url: '/artists/13/following',
    headers: { 'x-user-id': userId }
  });
  assert(resCheck13After.json().following === false, 'Artista 13 agora consta como não seguido');

  const resListAfter = await app.inject({
    method: 'GET',
    url: '/artists/following',
    headers: { 'x-user-id': userId }
  });
  assert(resListAfter.json().length === 1, 'Lista agora contém 1 artista seguido');

  // TESTE 12: BUSCA GERAL UNIFICADA
  console.log('\n--- Teste 12: Busca Geral (/pesquisa?termo=daft%20punk) ---');
  const resPesquisa = await app.inject({
    method: 'GET',
    url: '/pesquisa?termo=daft%20punk'
  });
  assert(resPesquisa.statusCode === 200, 'Status HTTP 200 na busca geral');
  const dadosPesquisa = resPesquisa.json();
  assert(Array.isArray(dadosPesquisa) && dadosPesquisa.length > 0, `Busca geral retornou ${dadosPesquisa.length} músicas`);

  // RESULTADOS FINAIS
  console.log('\n====================================================');
  console.log(`📊 RESULTADO DOS TESTES: ${sucessos} Passaram, ${falhas} Falharam`);
  console.log('====================================================\n');

  if (falhas > 0) {
    process.exit(1);
  }
}

executarTestes().catch(err => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
