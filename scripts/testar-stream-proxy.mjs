import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import Fastify from 'fastify';
import { after, before, test } from 'node:test';
import { fazerProxyStream } from '../src/lib/streamProxy.js';

const bytesAudio = Buffer.from('0123456789');
const manifestoHls = Buffer.from([
  '#EXTM3U',
  '#EXT-X-KEY:METHOD=AES-128,URI="keys/key.bin"',
  '#EXTINF:4.0,',
  'v0.m3u8',
  ''
].join('\n'));
const rangesManifestoHls = [];
const origem = http.createServer((requisicao, resposta) => {
  if (requisicao.url === '/not-found') {
    resposta.writeHead(404, { 'Content-Type': 'application/json' });
    resposta.end('{"erro":"not found"}');
    return;
  }

  if (requisicao.url === '/html') {
    resposta.writeHead(200, { 'Content-Type': 'text/html' });
    resposta.end('<html>blocked</html>');
    return;
  }

  if (requisicao.url === '/hls/master.m3u8') {
    rangesManifestoHls.push(requisicao.headers.range || null);
    if (requisicao.headers.range === 'bytes=0-9') {
      const parcial = manifestoHls.subarray(0, 10);
      resposta.writeHead(206, {
        'Accept-Ranges': 'bytes',
        'Content-Length': parcial.length,
        'Content-Range': `bytes 0-9/${manifestoHls.length}`,
        'Content-Type': 'application/x-mpegurl'
      });
      resposta.end(parcial);
      return;
    }

    resposta.writeHead(200, {
      'Content-Length': manifestoHls.length,
      'Content-Type': 'application/x-mpegurl'
    });
    resposta.end(manifestoHls);
    return;
  }

  const range = requisicao.headers.range;
  if (range === 'bytes=2-5') {
    const parcial = bytesAudio.subarray(2, 6);
    resposta.writeHead(206, {
      'Accept-Ranges': 'bytes',
      'Content-Length': parcial.length,
      'Content-Range': `bytes 2-5/${bytesAudio.length}`,
      'Content-Type': 'audio/mpeg'
    });
    resposta.end(parcial);
    return;
  }

  resposta.writeHead(200, {
    'Accept-Ranges': 'bytes',
    'Content-Length': bytesAudio.length,
    'Content-Type': 'audio/mpeg'
  });
  resposta.end(bytesAudio);
});

const servidor = Fastify({ logger: false });
let urlOrigem;

before(async () => {
  origem.listen(0, '127.0.0.1');
  await once(origem, 'listening');
  urlOrigem = `http://127.0.0.1:${origem.address().port}`;

  servidor.get('/audio', (requisicao, resposta) =>
    fazerProxyStream(requisicao, resposta, `${urlOrigem}/audio`)
  );
  servidor.get('/not-found', (requisicao, resposta) =>
    fazerProxyStream(requisicao, resposta, `${urlOrigem}/not-found`)
  );
  servidor.get('/html', (requisicao, resposta) =>
    fazerProxyStream(requisicao, resposta, `${urlOrigem}/html`)
  );
  servidor.get('/playlist', (requisicao, resposta) =>
    fazerProxyStream(requisicao, resposta, `${urlOrigem}/hls/master.m3u8`)
  );
  servidor.get('/invalid', (requisicao, resposta) =>
    fazerProxyStream(requisicao, resposta, 'file:///tmp/audio.mp3')
  );
  await servidor.ready();
});

after(async () => {
  await servidor.close();
  origem.close();
});

test('encaminha áudio completo e informa que a origem aceita Range', async () => {
  const resposta = await servidor.inject('/audio');

  assert.equal(resposta.statusCode, 200);
  assert.equal(resposta.headers['content-type'], 'audio/mpeg');
  assert.equal(resposta.headers['accept-ranges'], 'bytes');
  assert.equal(resposta.body, bytesAudio.toString());
});

test('encaminha Range e preserva resposta parcial 206', async () => {
  const resposta = await servidor.inject({
    url: '/audio',
    headers: { range: 'bytes=2-5' }
  });

  assert.equal(resposta.statusCode, 206);
  assert.equal(resposta.headers['content-range'], 'bytes 2-5/10');
  assert.equal(resposta.headers['content-length'], '4');
  assert.equal(resposta.body, '2345');
});

test('não redireciona quando a fonte retorna 404', async () => {
  const resposta = await servidor.inject('/not-found');

  assert.equal(resposta.statusCode, 404);
  assert.match(resposta.json().erro, /não encontrado/i);
});

test('rejeita páginas HTML como se fossem streams de áudio', async () => {
  const resposta = await servidor.inject('/html');

  assert.equal(resposta.statusCode, 502);
  assert.match(resposta.json().erro, /não retornou um arquivo de áudio/i);
});

test('normaliza URIs relativos do manifesto HLS e ignora Range truncado', async () => {
  const resposta = await servidor.inject({
    url: '/playlist',
    headers: { range: 'bytes=0-9' }
  });

  assert.equal(resposta.statusCode, 200);
  assert.equal(resposta.headers['content-type'], 'application/x-mpegurl');
  assert.match(resposta.body, new RegExp(`${urlOrigem}/hls/keys/key\\.bin`));
  assert.match(resposta.body, new RegExp(`${urlOrigem}/hls/v0\\.m3u8`));
  assert.deepEqual(rangesManifestoHls, ['bytes=0-9', null]);
});

test('rejeita esquemas de URL que não sejam HTTP ou HTTPS', async () => {
  const resposta = await servidor.inject('/invalid');

  assert.equal(resposta.statusCode, 400);
});
