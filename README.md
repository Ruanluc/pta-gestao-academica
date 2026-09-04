# PTA Academic MVP

## Visão geral
Este workspace contém um MVP de gestão acadêmica de pós-graduação com:
- Backend em Node.js + TypeScript + Fastify + Prisma
- Frontend em Next.js + Tailwind CSS
- Banco PostgreSQL com schema Prisma para turmas, alunos, disciplinas, matrículas, documentos e notas
- Estrutura pronta para integração com Google Drive

## Como executar
1. Instale as dependências com `npm install`
2. Configure o banco PostgreSQL e defina `DATABASE_URL` em `apps/api/.env`
3. Execute as migrações com `npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name init`
4. Inicie o backend: `npm run dev:api`
5. Inicie o frontend: `npm run dev:web`

## Próximos passos recomendados
- Adicionar autenticação real com JWT em rotas protegidas
- Implementar upload e vinculação de documentos ao Google Drive
- Gerar PDF de histórico escolar com Puppeteer
- Criar formulários CRUD completos para cada módulo
