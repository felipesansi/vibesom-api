import 'dotenv/config';
import axios from 'axios';

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.log('GEMINI_API_KEY ausente');
  process.exit(1);
}

try {
  const { status, data } = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}:generateContent`,
    {
      contents: [{ parts: [{ text: 'Responda apenas: {"ok":true}' }] }],
      generationConfig: { responseMimeType: 'application/json' }
    },
    { params: { key }, timeout: 15000 }
  );
  console.log('Status HTTP:', status);
  console.log('Resposta:', data.candidates?.[0]?.content?.parts?.[0]?.text);
} catch (e) {
  console.log('Status HTTP:', e.response?.status);
  console.log('Codigo:', e.response?.data?.error?.code);
  console.log('Mensagem:', e.response?.data?.error?.message);
}
