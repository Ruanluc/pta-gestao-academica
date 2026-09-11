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
| `npm run importar:planilha -w apps/api -- "<planilha.xlsx>" [--aplicar]` | Importa a planilha antiga (sem `--aplicar` só simula) |
| `npm run importar:remessas -w apps/api -- "<... - INOVE.xlsx>" "<... - USINA.xlsx>" [--aplicar]` | Importa as remessas das certificadoras (sem `--aplicar` só simula) |
| `npm --workspace apps/api run db:migrate:dev -- --name <nome>` | Cria uma nova migração após alterar o `schema.prisma` |

## Perfis de acesso

| Perfil | Pode |
| --- | --- |
| **Administrador** | Tudo: configurar turmas e módulos, usuários, auditoria, exclusões definitivas e situação das matrículas |
| **Equipe CS** | Alunos, matrículas, documentos, notas e certificação (não cria/edita turmas e módulos nem usuários) |
| **Professor** | Consultar turmas e alunos (sem documentos pessoais) e lançar notas |
| **Certificadora** | Só os lotes já enviados **à certificadora dela** (INOVE, USINA...): baixa os históricos, registra/anexa os certificados e anota pendências |
| **Financeiro** | Só a tela **Financeiro**: situação de cada matrícula (Em dia, Atrasado, Cancelado...) |

## Regras acadêmicas

- Cada turma tem **`MODULOS_POR_TURMA` módulos** (18), que variam de turma para turma. Não é possível cadastrar mais que isso.
- Cada módulo tem uma **avaliação individual de 0 a 100**. O aluno é aprovado no módulo com nota ≥ `MEDIA_MINIMA` (70).
  Curso EAD: a **frequência é sempre 100%** (não se lança; sai 100% no histórico).
- O **período** do curso é o da turma (18 meses, igual para todos os alunos); a data de entrada de cada aluno fica
  registrada na matrícula.
- **Situação da matrícula** (Em dia, Trial, Atrasado, Suspenso, Cancelado, Quitado, Finalizado): mantida à mão pelo
  financeiro, porque a Eduzz não tem API. Só **Cancelado** fica fora dos lotes de certificação.
- **Troca de turma (migração)**: é uma matrícula nova; as notas não passam, porque os módulos mudam de uma turma para outra.
- O curso só é concluído quando a turma tem todos os módulos cadastrados e o aluno foi aprovado em cada um deles.
- **Documentos exigidos**: RG, CPF, certidão de nascimento ou casamento e comprovante de endereço, mais:
  - cursando a graduação → declaração de matrícula;
  - graduação concluída sem diploma → declaração de conclusão + histórico da graduação;
  - graduação concluída com diploma → diploma + histórico da graduação.
- **Semáforo do aluno** (recalculado automaticamente):
  - 🔴 **Falta documentação** — algum documento exigido não foi enviado ou foi rejeitado;
  - 🟡 **Falta avaliação** — documento aguardando análise, módulo sem nota ou reprovação;
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
- **Documentos sempre em PDF** (exigência do MEC): fotos JPG/PNG são convertidas em PDF no envio, em página A4 e
  já em pé (a rotação das fotos de celular é corrigida). Vários arquivos enviados juntos — ex.: frente e verso do
  RG — viram **um único PDF**, na ordem escolhida (até 10 por documento). Um PDF sozinho é guardado como veio.
  WEBP e outros formatos não são aceitos.
- **Acesso sem senha**: por um link pessoal válido por `LINK_ALUNO_DIAS` (7) dias. Na página do aluno, o botão
  **"Gerar link de acesso"** envia por e-mail (se houver SMTP) e mostra o link para copiar e mandar por WhatsApp.
  Gerar um novo link invalida o anterior. O aluno também pode pedir um link novo em `/portal/entrar` (CPF + e-mail).
- A sessão do aluno só vale no portal; ela nunca dá acesso às telas da equipe.

## Certificação (lotes mensais)

- **Certificadoras** (INOVE, USINA...) são cadastradas pelo administrador em **Usuários**. Cada lote vai para uma
  delas, e cada usuário do perfil Certificadora fica ligado à sua: só vê, recebe avisos e acessa a pasta dos lotes dela.
- Em **Certificação**, a equipe cria o lote do mês, escolhendo a certificadora, com os alunos **aptos**: histórico final gerado (todos os módulos
  aprovados e dados pessoais completos), documentação aprovada e matrícula não cancelada. Quem concluiu os módulos
  mas ainda tem pendência aparece separado, com o motivo.
- **Enviar para a certificadora** congela o lote, começa a contar o prazo (`PRAZO_CERTIFICADORA_DIAS`, 30 dias),
  avisa a certificadora por e-mail e, com o Google Drive configurado, monta a pasta
  `Lote de certificação AAAA-MM / Aluno - CPF /` (histórico + documentos aprovados) com uma planilha-índice,
  compartilhada com o e-mail de cada usuário certificadora.
- A equipe é avisada quando faltam `ALERTA_PRAZO_DIAS` (5) dias para o prazo e quando ele vence.
- **Perfil Certificadora** (crie em Usuários): acesso **somente** aos lotes já enviados. Ela baixa os históricos,
  registra cada certificado (número e data) ou "todos os pendentes"; o lote se conclui sozinho.
- **Documentação para a certificadora**: na página do lote, **Baixar lote completo (.zip)** (ou **Documentos**, por
  aluno) gera um pacote com uma pasta por aluno — histórico e documentos aprovados, em PDF — e uma planilha-índice.
  Documentos conferidos antes do sistema, que só existem na pasta antiga do Drive, entram como um aviso com o link
  da pasta. A certificadora baixa pelo login dela (só os lotes dela); com o Google Drive configurado, a pasta do
  lote no Drive continua disponível também.
- **Certificado digital**: ao **anexar o PDF** do certificado (certificadora ou equipe), ele é guardado na pasta do
  aluno, enviado a ele **por e-mail com o PDF anexo** e fica para download no portal. A equipe pode reenviar por e-mail
  ou **registrar uma entrega feita por fora** (WhatsApp etc.). Só o certificado digital é controlado (o físico não).

## Avisos por e-mail

Enviados automaticamente (e registrados na página do aluno): documento recusado (com o motivo), documentação
completa, todos os módulos concluídos, certificado emitido, resposta à correção de dados, novo lote (para a
certificadora), prazo do lote (para a equipe) e um **lembrete de pendências** a cada `LEMBRETE_PENDENCIAS_DIAS` (7).
Sem SMTP configurado, os avisos ficam só registrados. `AVISOS_EMAIL=false` desliga todos.

## Correção de dados pelo aluno

No portal, em **Meus dados**: campos vazios (e o telefone) o aluno preenche direto; alterar um dado já preenchido
vira uma solicitação que a secretaria aprova ou recusa em **Documentos** (ou na página do aluno). O CPF só a
secretaria altera.

## Importação da planilha antiga

Importação única da "CONTROLE DE ALUNOS" (uma aba por turma, "Notas XX" e "Historico XX"), para abandonar a planilha:

```bash
npm run importar:planilha -w apps/api -- "C:\caminho\CONTROLE DE ALUNOS - PLANILHA.xlsx"            # simulação
npm run importar:planilha -w apps/api -- "C:\caminho\CONTROLE DE ALUNOS - PLANILHA.xlsx" --aplicar  # grava
```

- A simulação não grava nada: mostra o resumo e salva um relatório detalhado em `apps/api/storage/importacao/<data>/`
  (fora do git, porque tem nomes e CPFs): linhas ignoradas (sem CPF/CPF inválido), repetidas, notas cujo nome não
  bate com a aba da turma e textos de certificado não entendidos.
- **Turmas**: uma por aba, com o código da aba (TF4, B7...). Nome, curso, resolução e os **módulos com docente e
  titulação** vêm da aba "Historico"; o período é a data final que mais se repete na aba, com 18 meses.
- **Alunos**: um por CPF (os zeros perdidos na planilha são recuperados). CPF repetido na mesma turma: fica a linha
  Em dia/Quitada, depois Trial, depois as demais. Endereços deslocados de coluna são corrigidos.
- **Matrículas**: nº de matrícula, situação, data de entrada, cancelamento e migração.
- **Documentos** marcados "SIM" entram como **aprovados** ("Conferido na planilha antiga"), com o link da pasta antiga
  do Drive; o arquivo continua lá.
- **Notas**: casadas pelo nome do aluno com a aba da turma; frequência 100%.
- **Lotes antigos**: um por mês de envio à certificadora, com a entrega do certificado digital quando registrada.
  Ficam marcados como "planilha antiga" e não geram alertas de prazo.
- Nenhum e-mail é enviado aos alunos durante a importação. Depois, o semáforo é recalculado e o histórico final é
  gerado para quem já concluiu todos os módulos. Pode rodar de novo: o que já existe não é duplicado nem sobrescrito.

## Importação das remessas das certificadoras

As planilhas "Novas demandas de confecção dos certificados - INOVE.xlsx" / "- USINA.xlsx" (uma aba por curso, um
bloco por turma com "Remessa solicitada dia", os nomes e o andamento ao lado) complementam a importação acima:

```bash
npm run importar:remessas -w apps/api -- "C:\...\... - INOVE.xlsx" "C:\...\... - USINA.xlsx"            # simulação
npm run importar:remessas -w apps/api -- "C:\...\... - INOVE.xlsx" "C:\...\... - USINA.xlsx" --aplicar  # grava
```

- A certificadora vem do fim do nome do arquivo (" - INOVE") e é cadastrada se ainda não existir.
- Cada remessa (certificadora + data) vira um lote. Os alunos (casados pelo nome com a turma, ex.: Biomecânica
  Turma 03 → B3) saem dos lotes mensais da planilha de controle e vão para o lote da remessa; lote mensal que fica
  vazio é removido. O que já estava registrado (emissão, entrega) é mantido.
- "ENTREGUE"/"OK" = certificado **emitido e entregue** ao aluno na data da remessa; "RECEBEMOS" = emitido. As demais
  anotações ("FALTA CPF", "ENVIADO PARA IES", "CERTIFICADO DE EXTENSÃO"...) ficam como **anotação** do aluno no lote.
- Turmas que só aparecem nas remessas (ex.: B2, SmartFit) são criadas **vazias**: as planilhas não têm CPF, então os
  alunos delas vão para o relatório (`alunos-de-turmas-novas.csv`) para serem cadastrados.
- Remessas ainda dentro do prazo de 30 dias viram lotes normais (com alertas); as antigas não geram alertas.
  Pode rodar de novo sem duplicar.

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
