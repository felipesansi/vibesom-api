# 🎵 VibeSom API

[![API Status](https://img.shields.io/badge/Status-Online-green)](https://vibesom-api.vercel.app)
[![Version](https://img.shields.io/badge/Version-1.0.0-blue)](https://github.com/felipesansi/vibesom-api)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

> API completa para busca e streaming de músicas de múltiplas plataformas musicais

## 📋 Sobre

A **VibeSom API** é uma API RESTful desenvolvida em Node.js que permite buscar e fazer streaming de músicas de 11 plataformas diferentes. Totalmente documentada com Swagger/OpenAPI e otimizada para aplicações mobile e web.

## 🌟 Funcionalidades

- 🔍 **Busca Unificada**: Pesquisa em todas as plataformas simultaneamente
- 🎵 **Streaming Direto**: URLs de streaming para todas as músicas encontradas
- 📚 **Documentação Completa**: Interface Swagger interativa
- 🌐 **CORS Habilitado**: Compatível com aplicações web e mobile
  
- ⚡ **Alta Performance**: Respostas rápidas e confiáveis

## 🎯 Plataformas Suportadas

| Plataforma | Busca | Streaming | Recursos Especiais |
|------------|-------|-----------|-------------------|
| **SoundCloud** | ✅ | ✅ | Charts Brasil, Trending |
| **Audius** | ✅ | ✅ | Trending, Busca de Artistas |
| **Jamendo** | ✅ | ✅ | Trending |
| **Internet Archive** | ✅ | ✅ | - |
| **Mixcloud** | ✅ | ❌ | - |
| **HearThis.at** | ✅ | ✅ | - |
| **Dailymotion** | ✅ | ✅ | - |
| **Bandcamp** | ✅ | ✅ | - |
| **Palco MP3** | ✅ | ✅ | - |
| **Saavn** | ✅ | ✅ | - |
| **YouTube** | ❌ | ✅ | Download de Vídeo |

## 🚀 Quick Start

### Status da API
```bash
curl https://vibesom-api.vercel.app/
# {"status":"VibeSom API Online","versao":"1.0.0"}
```

### Busca Geral
```bash
curl "https://vibesom-api-c7re.vercel.app/pesquisa?termo=eminem"
```

### Busca Específica por Plataforma
```bash
# SoundCloud
curl "https://vibesom-api-c7re.vercel.app/soundcloud/search/eminem"

# Audius
curl "https://vibesom-api-c7re.vercel.app/audius/search/eminem"

# Jamendo
curl "https://vibesom-api-c7re.vercel.app/jamendo/search/eminem"
```

### Streaming de Música
```bash
# YouTube
curl "https://vibesom-api-c7re.vercel.app/stream/dQw4w9WgXcQ"

# SoundCloud
curl "https://vibesom-api-c7re.vercel.app/soundcloud/stream/123456789"

# Audius
curl "https://vibesom-api-c7re.vercel.app/audius/stream/D7A7y"
```

## 📖 Documentação da API

### 📚 Documentação Interativa
Acesse a documentação completa no Swagger UI:
- **URL**: [https://vibesom-api-c7re.vercel.app/docs](https://vibesom-api-c7re.vercel.app/docs)
- **Formato**: OpenAPI 3.0
- **Recursos**: Teste em tempo real, exemplos, schemas

### 📋 Principais Endpoints

#### Busca
- `GET /pesquisa?termo={termo}` - Busca geral em todas as plataformas
- `GET /{plataforma}/search/{consulta}` - Busca específica por plataforma

#### Streaming
- `GET /stream/{idVideo}` - Streaming YouTube
- `GET /{plataforma}/stream/{id}` - Streaming por plataforma

#### Especiais
- `GET /soundcloud/charts/brasil` - Top músicas brasileiras
- `GET /soundcloud/trending` - Músicas em alta SoundCloud
- `GET /audius/trending` - Músicas em alta Audius
- `GET /jamendo/trending` - Músicas em alta Jamendo

### 📄 Formato de Resposta

#### Busca (Array de objetos)
```json
[
  {
    "source": "SoundCloud",
    "id": "123456789",
    "titulo": "Nome da Música",
    "artista": "Nome do Artista",
    "capa": "https://url.da.capa.jpg",
    "duracao": 180,
    "streamUrl": "/soundcloud/stream/123456789"
  }
]
```

#### Streaming (Arquivo de áudio direto)
```
Content-Type: audio/mpeg
[bytes do arquivo de áudio]
```

## 🛠️ Tecnologias Utilizadas

- **Runtime**: Node.js 20.x
- **Framework**: Fastify
- **Documentação**: Swagger/OpenAPI 3.0
- **HTTP Client**: Axios
- **YouTube**: @distube/ytdl-core
- **Deploy**: Vercel (Serverless)
- **CORS**: @fastify/cors

## 📦 Instalação e Desenvolvimento

### Pré-requisitos
- Node.js 20.x ou superior
- npm ou yarn

### Instalação
```bash
# Clone o repositório
git clone https://github.com/felipesansi/vibesom-api.git
cd vibesom-api

# Instale as dependências
npm install

# Execute em modo desenvolvimento
npm run dev

# Ou execute em produção
npm start
```

### Estrutura do Projeto
```
vibesom-api/
├── index.js              # Servidor principal
├── package.json          # Dependências e scripts
├── vercel.json          # Configuração Vercel
├── src/
│   └── routes/          # Rotas por plataforma
│       ├── pesquisa.js  # Busca geral
│       ├── soundcloud.js
│       ├── audius.js
│       ├── jamendo.js
│       └── ...
└── README.md            # Este arquivo
```

## 🌐 Deploy

A API está hospedada no **Vercel** com funções serverless:

- **Produção**: [https://vibesom-api-c7re.vercel.app](https://vibesom-api-c7re.vercel.app)
- **Documentação**: [https://vibesom-api-c7re.vercel.app/documentacao](https://vibesom-api-c7re.vercel.app/documentacao)

## 📊 Limitações e Considerações

### Rate Limiting
- Algumas plataformas têm limitações de taxa
- Recomendado: máximo 10 requisições/minuto por IP

### Disponibilidade
- URLs de streaming podem mudar
- Algumas músicas podem não estar disponíveis
- Dependente da disponibilidade das plataformas originais

### Timeout
- Requisições têm timeout de 30 segundos
- Streaming pode levar mais tempo dependendo do arquivo

## 🤝 Contribuição

Contribuições são bem-vindas! Para contribuir:

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 👨‍💻 Autor

**Felipe Sansi**
- GitHub: [@felipesansi](https://github.com/felipesansi)
- LinkedIn: [felipesansi](https://LinkedIn.com/felipesansi)
