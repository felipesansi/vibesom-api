import axios from 'axios';

const CHAVE_GEMINI = (
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  ''
).trim();

const MODELOS_GEMINI_PADRAO = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash'
];

const CHAVE_OPENAI = (process.env.OPENAI_API_KEY || '').trim();
const URL_OPENAI = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const MODELO_OPENAI = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const INSTRUCAO_SISTEMA =
  'Você é um especialista em curadoria musical. Sua tarefa é identificar a melhor correspondência para uma busca, priorizando versões originais, oficiais e de estúdio. Evite remixes, covers ou versões ao vivo, a menos que explicitamente solicitado. Responda estritamente em JSON.';

const RUIDO_TITULO =
  /\b(remix|mashup|flip|cover|karaoke|8d|slowed|reverb|extended mix|nonstop|full album|live|ao vivo|instrumental|parody|tribute|sped up|nightcore|loop|reverb)\b/i;

function modelosGemini() {
  const lista = (
    process.env.GEMINI_MODELS ||
    process.env.GEMINI_MODEL ||
    ''
  )
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  return lista.length ? lista : MODELOS_GEMINI_PADRAO;
}

function temProvedorIA() {
  return !!(CHAVE_GEMINI || CHAVE_OPENAI);
}

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rotuloOpcao(opcao) {
  if (typeof opcao === 'string') return opcao;
  if (opcao.rotulo) return opcao.rotulo;
  const partes = [opcao.titulo, opcao.artista, opcao.source].filter(Boolean);
  return partes.join(' — ');
}

function pontuarRelevancia(contexto, opcao) {
  const alvo = normalizar(contexto);
  const titulo = normalizar(opcao.titulo || '');
  const artista = normalizar(opcao.artista || '');
  const rotulo = rotuloOpcao(opcao);
  if (!alvo) return 0;

  const palavras = alvo.split(' ').filter((p) => p.length > 1);
  if (!palavras.length) return 0;

  const noTitulo = palavras.filter((p) => titulo.includes(p)).length;
  const noArtista = palavras.filter((p) => artista.includes(p)).length;

  let pontos = (noTitulo / palavras.length) * 0.75 + (noArtista / palavras.length) * 0.25;

  if (palavras.every((p) => titulo.includes(p))) pontos += 0.45;
  if (titulo === alvo) pontos += 0.65;
  else if (titulo.includes(alvo) || alvo.includes(titulo)) pontos += 0.3;

  // Bônus se o artista for mencionado no contexto e bater com a opção
  if (artista && (alvo.includes(artista) || artista.includes(alvo))) pontos += 0.25;

  if (RUIDO_TITULO.test(rotulo) && !RUIDO_TITULO.test(contexto)) pontos -= 0.3;

  return Math.max(0, pontos);
}

function ordenarHeuristica(contexto, itens) {
  return [...itens].sort(
    (a, b) => pontuarRelevancia(contexto, b) - pontuarRelevancia(contexto, a)
  );
}

function parseJsonResposta(bruto) {
  const limpo = String(bruto)
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
  return JSON.parse(limpo);
}

function erroRecuperavelGemini(erro) {
  const status = erro.response?.status;
  return status === 429 || status === 404 || status === 503 || status === 400;
}

async function chamarGeminiModelo(modelo, prompt, timeout) {
  const { data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      systemInstruction: { parts: [{ text: INSTRUCAO_SISTEMA + ' Não inclua markdown na resposta.' }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json'
      }
    },
    {
      params: { key: CHAVE_GEMINI },
      headers: { 'Content-Type': 'application/json' },
      timeout
    }
  );

  const bruto = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!bruto) throw new Error('Resposta vazia do Gemini');
  return parseJsonResposta(bruto);
}

async function chamarGemini(prompt, timeout = 5000) {
  let ultimoErro;

  for (const modelo of modelosGemini()) {
    try {
      const resultado = await chamarGeminiModelo(modelo, prompt, timeout);
      console.log(`[IA] Gemini OK (${modelo})`);
      return resultado;
    } catch (erro) {
      ultimoErro = erro;
      if (!erroRecuperavelGemini(erro)) throw erro;
      const msg =
        erro.response?.data?.error?.message?.split('\n')[0] || erro.message;
      console.warn(`[IA] Gemini ${modelo}: ${msg}`);
    }
  }

  throw ultimoErro || new Error('Nenhum modelo Gemini disponível');
}

async function chamarOpenAI(prompt, timeout = 5000) {
  const { data } = await axios.post(
    `${URL_OPENAI}/chat/completions`,
    {
      model: MODELO_OPENAI,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: INSTRUCAO_SISTEMA },
        { role: 'user', content: prompt }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${CHAVE_OPENAI}`,
        'Content-Type': 'application/json'
      },
      timeout
    }
  );

  const bruto = data.choices?.[0]?.message?.content;
  if (!bruto) throw new Error('Resposta vazia do OpenAI');
  return parseJsonResposta(bruto);
}

async function chamarModelo(prompt, timeout = 5000) {
  if (CHAVE_GEMINI) return chamarGemini(prompt, timeout);
  if (CHAVE_OPENAI) return chamarOpenAI(prompt, timeout);
  throw new Error('Nenhuma chave de IA configurada');
}

function melhorIndiceHeuristico(contexto, opcoes) {
  let melhor = 0;
  let maior = -1;
  opcoes.forEach((op, i) => {
    const p = pontuarRelevancia(contexto, op);
    if (p > maior) {
      maior = p;
      melhor = i;
    }
  });
  return melhor;
}

/**
 * Retorna o índice da opção mais relevante para o contexto (ex.: título buscado).
 */
export async function escolherMelhorIndice(contexto, opcoes, { timeout = 5000 } = {}) {
  if (!opcoes?.length) return 0;
  if (opcoes.length === 1) return 0;

  // Calcula melhor opção heurística e sua pontuação
  let melhorHeuristico = 0;
  let maiorPontuacao = -1;
  opcoes.forEach((op, i) => {
    const p = pontuarRelevancia(contexto, op);
    if (p > maiorPontuacao) {
      maiorPontuacao = p;
      melhorHeuristico = i;
    }
  });

  // Se a confiança for muito alta (match exato de título/artista), pula a IA
  if (maiorPontuacao >= 1.5 || !temProvedorIA()) {
    return melhorHeuristico;
  }

  try {
    const lista = opcoes.map((op, i) => ({ i, rotulo: rotuloOpcao(op) }));
    const { indice } = await chamarModelo(
      `Contexto: "${contexto}"
Opções (ID e Rótulo): ${JSON.stringify(lista)}
Qual o índice "i" da opção que melhor corresponde ao contexto musical? Priorize faixas originais. Responda: {"indice": number}`,
      timeout
    );

    if (Number.isInteger(indice) && indice >= 0 && indice < opcoes.length) {
      return indice;
    }
  } catch (erro) {
    console.warn('[IA] escolherMelhorIndice:', erro.message);
  }

  return melhorHeuristico;
}

/**
 * Reordena itens do mais relevante ao menos relevante para o termo de busca.
 */
export async function ordenarPorRelevancia(
  contexto,
  itens,
  { limiteIA = 35, timeout = 8000 } = {}
) {
  if (!itens?.length) return itens;
  if (itens.length === 1) return itens;

  if (!temProvedorIA()) {
    return ordenarHeuristica(contexto, itens);
  }

  const cabeca = itens.slice(0, limiteIA);
  const cauda = itens.slice(limiteIA);

  try {
    const lista = cabeca.map((item, i) => ({
      i,
      rotulo: rotuloOpcao(item)
    }));

    const { ordem } = await chamarModelo(
      `Termo de busca: "${contexto}"
Lista de faixas: ${JSON.stringify(lista)}
Ordene os índices "i" do mais relevante para o menos relevante em relação ao termo de busca. Priorize versões oficiais.
Responda: {"ordem": [number, ...]}`,
      timeout
    );

    if (Array.isArray(ordem) && ordem.length > 0) {
      const vistos = new Set();
      const reordenados = [];

      for (const idx of ordem) {
        if (
          Number.isInteger(idx) &&
          idx >= 0 &&
          idx < cabeca.length &&
          !vistos.has(idx)
        ) {
          vistos.add(idx);
          reordenados.push(cabeca[idx]);
        }
      }

      for (let i = 0; i < cabeca.length; i++) {
        if (!vistos.has(i)) reordenados.push(cabeca[i]);
      }

      return [...reordenados, ...ordenarHeuristica(contexto, cauda)];
    }
  } catch (erro) {
    console.warn('[IA] ordenarPorRelevancia:', erro.message);
  }

  return ordenarHeuristica(contexto, itens);
}
