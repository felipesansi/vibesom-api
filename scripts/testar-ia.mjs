import 'dotenv/config';
import { escolherMelhorIndice, ordenarPorRelevancia } from '../src/lib/iaEscolher.js';

const temChave = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY);
console.log('Chave IA configurada:', temChave ? 'sim' : 'nao');
console.log('Provedor:', process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? 'Gemini' : process.env.OPENAI_API_KEY ? 'OpenAI' : 'heuristica');

const opcoes = [
  { titulo: 'Lose Yourself', artista: 'Eminem', source: 'YouTube' },
  { titulo: 'Random Podcast Intro', artista: 'Unknown', source: 'YouTube' },
  { titulo: 'LOSE YOURSELF (HEXED FLIP)', artista: 'HEXED', source: 'Audius' }
];

console.log('Modelos Gemini:', process.env.GEMINI_MODELS || process.env.GEMINI_MODEL || '(padrao)');

console.log('\n--- escolherMelhorIndice ---');
const indice = await escolherMelhorIndice('eminem lose yourself', opcoes);
console.log('Indice escolhido:', indice, '->', opcoes[indice].titulo, '/', opcoes[indice].artista);

console.log('\n--- ordenarPorRelevancia ---');
const ordenados = await ordenarPorRelevancia('eminem lose yourself', opcoes);
console.log(
  'Ordem:',
  ordenados.map((o) => `${o.titulo} (${o.source})`).join(' > ')
);

console.log('\nOK');
