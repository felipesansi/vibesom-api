FROM node:20-alpine

# Cria e define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependência, alterando a propriedade
COPY --chown=node:node package*.json ./

# Instala as dependências
RUN npm install

# Copia o restante do código, alterando a propriedade
COPY --chown=node:node . .

# Exponha a porta 7860, que é a porta padrão do Hugging Face Spaces
EXPOSE 7860

# Define a variável de ambiente PORT para 7860 para o Fastify escutar corretamente
ENV PORT=7860

# Usa o usuário `node` (UID 1000) por segurança e compatibilidade com o Hugging Face Spaces
USER node

# Comando para iniciar a API
CMD ["npm", "start"]
