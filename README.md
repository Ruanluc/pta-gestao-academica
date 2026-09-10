# PTA — Gestão Acadêmica de Pós-Graduação

Sistema para gerir turmas, disciplinas (módulos), alunos, matrículas, documentação, notas e histórico escolar.

- **API**: Node.js + TypeScript + Fastify + Prisma (PostgreSQL) — `apps/api`
- **Web**: Next.js 14 + Tailwind CSS — `apps/web`

O sistema funciona **sem nenhuma integração externa**. Google Drive, SMTP e Redis são opcionais e
são ativados apenas preenchendo o `apps/api/.env` (ver [Integrações](#integrações-opcionais)).

## Requisitos

- Node.js 20 ou superior
- PostgreSQL 14+ (via Docker com o `docker-compose.yml` da raiz, ou instalado no Windows)

## Primeira execução

```bash
# 1. Dependências
npm install

# 2. Banco de dados (se usar Docker; senão, crie um banco "pta" no seu PostgreSQL)
npm run db:up

# 3. Configuração
cp apps/api/.env.example apps/api/.env     # preencha DATABASE_URL, JWT_SECRET e ADMIN_*
cp apps/web/.env.example apps/web/.env.local

# 4. Tabelas + primeiro administrador
npm run db:setup

# 5. Subir API (http://localhost:3000) e Web (http://localhost:3001)
npm run dev
```

Se preferir não usar `ADMIN_EMAIL`/`ADMIN_SENHA`, pule o seed: com o banco vazio a tela de login
oferece **"Primeiro acesso"** para criar o administrador.

Para gerar um `JWT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | API e Web em modo desenvolvimento |
| `npm run build` | Gera o Prisma Client e compila API e Web |
| `npm test` | Compila a API e roda os testes |
| `npm run db:migrate` | Aplica as migrações pendentes (`prisma migrate deploy`) |
| `npm run db:seed` | Cria o administrador definido em `ADMIN_EMAIL`/`ADMIN_SENHA` |
| `npm --workspace apps/api run db:migrate:dev -- --name <nome>` | Cria uma nova migração após alterar o `schema.prisma` |

## Perfis de acesso

| Perfil | Pode |
| --- | --- |
| **Administrador** | Tudo, inclusive usuários, auditoria e exclusões definitivas |
| **Secretaria** | Turmas, disciplinas, alunos, matrículas, documentos e notas |
| **Professor** | Consultar turmas e alunos (sem documentos pessoais) e lançar notas |

## Regras acadêmicas

- Cada turma tem **`MODULOS_POR_TURMA` módulos** (18), que variam de turma para turma. Não é possível cadastrar mais que isso.
- Cada módulo tem uma **avaliação individual de 0 a 100**. O aluno é aprovado no módulo com nota ≥ `MEDIA_MINIMA` (70)
  e frequência ≥ `FREQUENCIA_MINIMA` (75%, exigência da Resolução CNE/CES nº 1/2018; use 0 para não exigir).
- O curso só é concluído quando a turma tem todos os módulos cadastrados e o aluno foi aprovado em cada um deles.
- **Documentos exigidos**: RG, CPF e comprovante de endereço, mais:
  - cursando a graduação → declaração de matrícula;
  - graduação concluída sem diploma → declaração de conclusão + histórico da graduação;
  - graduação concluída com diploma → diploma + histórico da graduação.
- **Semáforo do aluno** (recalculado automaticamente):
  - 🔴 **Falta documentação** — algum documento exigido não foi enviado ou foi rejeitado;
  - 🟡 **Falta avaliação** — documento aguardando análise, disciplina sem nota/frequência ou reprovação;
  - 🟢 **Tudo certo**.
- **Histórico escolar** no **modelo da certificadora** (A4 paisagem): cabeçalho com os dados do aluno, título
  "HISTÓRICO ESCOLAR DO CURSO DE ESPECIALIZAÇÃO EM: <curso>" com a resolução, e a tabela
  Disciplinas | CH | Corpo Docente | Titulação | Frequência | Média.
  - "Pós-Graduado no curso de:" usa o **nome da turma** (ex.: "Biomecânica... - B7"); o título usa o campo **Curso**
    da turma; a linha "(Nas disposições da ...)" usa o campo **Resolução** (vazio = resolução CES/CNE nº 1/2018).
  - Os módulos saem como "Módulo I - ...", "Módulo II - ..." (a não ser que o nome já comece com "Módulo").
  - Assim que o aluno é aprovado em **todos os módulos**, o PDF final é salvo automaticamente **na pasta do aluno**
    (botão "Histórico final" na página dele). Antes disso, dá para baixar uma prévia marcada como não válida.
  - RG, órgão emissor, data de nascimento, nacionalidade, naturalidade e filiação são obrigatórios para o histórico:
    se faltar algum, o aluno fica vermelho com essa pendência e o PDF final não é gerado.

## Inscrição online e portal do aluno

- **Link de inscrição da turma**: na página da turma, em "Inscrição online", clique em **Abrir inscrições** e
  copie o link (`/inscricao/<código>`) para enviar aos alunos (WhatsApp, e-mail...). O aluno preenche os dados e
  **já fica matriculado** na turma. Dá para encerrar as inscrições ou gerar um novo link (o antigo para de funcionar).
  - Aluno novo: entra direto no portal ao terminar a inscrição.
  - CPF já cadastrado: é matriculado, mas os dados não são exibidos nem alterados; o link de acesso vai só para o
    e-mail que já estava no cadastro.
- **Portal do aluno** (`/portal`): o aluno vê sua situação, as pendências, os documentos exigidos, envia e reenvia
  arquivos e vê o motivo de rejeições. A secretaria analisa em **Documentos**, como antes.
- **Acesso sem senha**: por um link pessoal válido por `LINK_ALUNO_DIAS` (7) dias. Na página do aluno, o botão
  **"Gerar link de acesso"** envia por e-mail (se houver SMTP) e mostra o link para copiar e mandar por WhatsApp.
  Gerar um novo link invalida o anterior. O aluno também pode pedir um link novo em `/portal/entrar` (CPF + e-mail).
- A sessão do aluno só vale no portal; ela nunca dá acesso às telas da equipe.

## Integrações opcionais

Todas ficam em `apps/api/.env`. Reinicie a API depois de alterar. A tela inicial mostra o que está ativo.

### Google Drive (armazenamento de documentos e históricos)

Os arquivos (documentos e históricos) ficam na pasta de cada aluno em `apps/api/storage/alunos/<id>/`.
Com o Drive configurado, o botão **"Exportar para o Google Drive"** na página do aluno cria a pasta dele dentro de
`GOOGLE_DRIVE_FOLDER_ID` (uma vez) e envia os arquivos que ainda não estão lá; rodar de novo só envia o que for novo
(por exemplo, um histórico regenerado). Para enviar cada arquivo automaticamente no momento do upload, use
`GOOGLE_DRIVE_ENVIO_AUTOMATICO=true`.

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto e ative a **Google Drive API**.
2. Escolha **uma** forma de credencial:
   - **Conta Gmail pessoal → OAuth** (`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`).
     Crie um "ID do cliente OAuth" e obtenha um refresh token com o escopo `https://www.googleapis.com/auth/drive`
     (por exemplo, pelo [OAuth Playground](https://developers.google.com/oauthplayground), marcando "Use your own OAuth credentials").
   - **Google Workspace → conta de serviço** (`GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY`, ou `GOOGLE_SERVICE_ACCOUNT_JSON`).
     Use uma pasta dentro de um **Drive compartilhado** e adicione o e-mail da conta de serviço como membro.
     > Contas de serviço **não têm cota** no "Meu Drive" de contas comuns: o upload falha com
     > *"Service Accounts do not have storage quota"*. Por isso, com Gmail pessoal use OAuth.
3. Preencha `GOOGLE_DRIVE_FOLDER_ID` com o ID da pasta (o final da URL `drive.google.com/drive/folders/<ID>`).

### E-mail (login por link)

Preencha `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM`. Sem SMTP, em desenvolvimento o
link de acesso aparece no console da API; em produção (`NODE_ENV=production`) a opção fica desativada.

### Cademi (importação das notas dos módulos)

O sistema já sabe **quem é quem** e **quando importar**; falta apenas a chamada à API da Cademi.

- **Módulos**: na página da turma, preencha o campo **"ID na Cademi"** de cada módulo (o identificador da
  avaliação/módulo correspondente na Cademi). Só módulos vinculados recebem notas.
- **Alunos**: são reconhecidos pelo **ID na Cademi**; se estiver vazio, pelo **CPF** e depois pelo **e-mail**.
  Na primeira importação o ID da Cademi é gravado no aluno automaticamente (também pode ser preenchido à mão).
- **Quando importar**: botão **"Importar notas da Cademi"** na página da turma e, opcionalmente, importação
  automática de todas as turmas ativas a cada `CADEMI_SINCRONIZAR_A_CADA_MINUTOS`. Cada importação fica
  registrada (quem fez, quantas notas, alunos/módulos não encontrados).
- Notas importadas ficam marcadas como **"Cademi"**; se alguém corrigir à mão, passam a **"manual"**.
  A próxima importação sobrescreve a nota com o valor da Cademi.

**Para ativar**: preencha `CADEMI_API_URL` e `CADEMI_API_TOKEN` e implemente a função `provedorPadrao` em
`apps/api/src/lib/cademi.ts`, devolvendo os registros no formato `RegistroNotaCademi` (nota já em 0 a 100) e
mudando `PROVEDOR_IMPLEMENTADO` para `true`.

### Redis (fila de históricos)

Preencha `REDIS_URL` (ex.: `redis://127.0.0.1:6379`, o `docker-compose.yml` já sobe um Redis).
Sem Redis, os históricos são gerados no próprio processo da API. Se o Redis cair, a API volta a gerar no processo.

## Estrutura

```
apps/api/src
├── app.ts / main.ts        # montagem do Fastify e inicialização
├── config.ts               # leitura e validação do .env
├── lib/                    # auth, validação, erros, semáforo, PDF, armazenamento, Drive, fila, e-mail
├── services/academico.ts   # recalcula situação do aluno e gera histórico final
├── routes/                 # auth, usuarios, turmas, disciplinas, alunos, matriculas, notas, documentos, dashboard, auditoria
└── scripts/seed.ts         # cria o primeiro administrador
apps/web/app
├── components/             # AppShell (menu + sessão), formulários, documentos, UI
├── lib/                    # cliente da API, tipos e formatação
└── <páginas>               # login, início, turmas, alunos, notas, documentos, usuários, auditoria, conta
```
