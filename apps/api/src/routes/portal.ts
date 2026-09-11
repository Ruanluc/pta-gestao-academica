import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import {
  alunoDoPortal,
  autenticarAluno,
  criarSessaoAluno,
  enviarLinkAcessoPorEmail,
  gerarLinkAcessoAluno,
  validarLinkAcesso,
} from '../lib/acessoAluno';
import { registrarAuditoria } from '../lib/audit';
import { HttpError } from '../lib/errors';
import { contentDisposition } from '../lib/http';
import { criarLimitador } from '../lib/rateLimit';
import { abrirArquivo } from '../lib/storage';
import { calcularSemaforo, documentosObrigatorios } from '../lib/semaforo';
import { cpfSchema, dataOpcional, emailSchema, idParams, textoObrigatorio, textoOpcional } from '../lib/validation';
import { classificarAlteracoes } from '../lib/correcaoDados';
import { receberDocumento, responderArquivo } from '../services/documentos';
import { sincronizarAluno } from '../services/academico';
import type { Prisma } from '@prisma/client';

const limitarPedidoLink = criarLimitador({ max: 5, janelaMs: 15 * 60 * 1000 });

/** Portal do aluno: acesso por link pessoal, sem senha. */
export const portalRoutes: FastifyPluginAsync = async (app) => {
  /** Troca o link recebido por uma sessão do portal. */
  app.post('/acesso', async (request) => {
    const { token } = z.object({ token: z.string().min(10, 'Link de acesso inválido') }).parse(request.body ?? {});

    const aluno = await validarLinkAcesso(token);
    if (!aluno) throw new HttpError(401, 'Link de acesso inválido ou expirado. Peça um novo link.');

    await registrarAuditoria({ acao: 'ACESSO_PORTAL', entidade: 'Aluno', entidadeId: aluno.id });
    return { sessao: criarSessaoAluno(aluno.id), aluno: { nome: aluno.nome } };
  });

  /** O aluno pede um novo link informando CPF e e-mail do cadastro. */
  app.post('/solicitar-link', async (request) => {
    const { cpf, email } = z.object({ cpf: cpfSchema, email: emailSchema }).parse(request.body ?? {});
    limitarPedidoLink(`${request.ip}:${cpf}`);

    const aluno = await prisma.aluno.findUnique({ where: { cpf }, select: { id: true, nome: true, email: true } });
    if (aluno && aluno.email.trim().toLowerCase() === email) {
      const { link, expiraEm } = await gerarLinkAcessoAluno(aluno.id);
      await enviarLinkAcessoPorEmail(aluno, link, expiraEm);
      await registrarAuditoria({ acao: 'LINK_PORTAL_SOLICITADO', entidade: 'Aluno', entidadeId: aluno.id });
    }

    // Mesma resposta sempre, para não revelar quem tem cadastro
    return { message: 'Se os dados conferirem com o cadastro, você receberá o link de acesso por e-mail em instantes.' };
  });

  await app.register(async (privado) => {
    privado.addHook('onRequest', autenticarAluno);

    privado.get('/eu', async (request) => {
      const aluno = await prisma.aluno.findUnique({
        where: { id: alunoDoPortal(request).id },
        include: {
          documentos: {
            orderBy: { criadoEm: 'desc' },
            select: { id: true, tipo: true, nomeArquivo: true, mimeType: true, tamanho: true, status: true, motivoRejeicao: true, criadoEm: true },
          },
          notas: { select: { disciplinaId: true, media: true, frequencia: true } },
          matriculas: {
            orderBy: { dataInclusao: 'desc' },
            select: {
              turma: { select: { nome: true, dataInicio: true, dataFim: true, disciplinas: { select: { id: true } } } },
              itemLote: { select: { id: true, certificadoEmitidoEm: true, certificadoRef: true } },
            },
          },
          solicitacoes: { orderBy: { criadoEm: 'desc' }, take: 1 },
        },
      });
      if (!aluno) throw new HttpError(404, 'Cadastro não encontrado');

      const { pendencias } = calcularSemaforo(
        {
          condicaoGraduacao: aluno.condicaoGraduacao,
          documentos: aluno.documentos,
          turmas: aluno.matriculas.map((matricula) => matricula.turma),
          notas: aluno.notas,
          dadosPessoais: aluno,
        },
        config.regras,
      );

      return {
        nome: aluno.nome,
        email: aluno.email,
        condicaoGraduacao: aluno.condicaoGraduacao,
        statusSemaforo: aluno.statusSemaforo,
        pendencias,
        documentosObrigatorios: documentosObrigatorios(aluno.condicaoGraduacao),
        documentos: aluno.documentos,
        turmas: aluno.matriculas.map(({ turma }) => ({ nome: turma.nome, dataInicio: turma.dataInicio, dataFim: turma.dataFim })),
        certificados: aluno.matriculas.flatMap(({ turma, itemLote }) =>
          itemLote?.certificadoRef ? [{ id: itemLote.id, turma: turma.nome, emitidoEm: itemLote.certificadoEmitidoEm }] : [],
        ),
        dados: {
          nome: aluno.nome,
          email: aluno.email,
          telefone: aluno.telefone,
          dataNascimento: aluno.dataNascimento,
          nacionalidade: aluno.nacionalidade,
          naturalidade: aluno.naturalidade,
          filiacao: aluno.filiacao,
          rgNumero: aluno.rgNumero,
          rgOrgaoEmissor: aluno.rgOrgaoEmissor,
        },
        ultimaSolicitacao: aluno.solicitacoes[0]
          ? {
              status: aluno.solicitacoes[0].status,
              dados: JSON.parse(aluno.solicitacoes[0].dados),
              motivoRecusa: aluno.solicitacoes[0].motivoRecusa,
              criadoEm: aluno.solicitacoes[0].criadoEm,
              analisadoEm: aluno.solicitacoes[0].analisadoEm,
            }
          : null,
      };
    });

    /**
     * Correção de dados pelo aluno: campos vazios (e o telefone) mudam na hora;
     * alterar um dado já preenchido vira solicitação para a secretaria aprovar.
     */
    privado.put('/dados', async (request) => {
      const alunoId = alunoDoPortal(request).id;
      const novos = z
        .object({
          nome: textoObrigatorio(3, 200).optional(),
          email: emailSchema.optional(),
          telefone: textoOpcional(30),
          dataNascimento: dataOpcional,
          nacionalidade: textoOpcional(80),
          naturalidade: textoOpcional(120),
          filiacao: textoOpcional(300),
          rgNumero: textoOpcional(30),
          rgOrgaoEmissor: textoOpcional(30),
        })
        .parse(request.body ?? {});

      const aluno = await prisma.aluno.findUnique({ where: { id: alunoId } });
      if (!aluno) throw new HttpError(404, 'Cadastro não encontrado');

      const { diretas, emAnalise } = classificarAlteracoes(aluno, novos);

      if (Object.keys(diretas).length) {
        await prisma.aluno.update({ where: { id: alunoId }, data: diretas as Prisma.AlunoUpdateInput });
      }

      if (Object.keys(emAnalise).length) {
        const pendente = await prisma.solicitacaoAlteracao.findFirst({ where: { alunoId, status: 'PENDENTE' } });
        const dados = JSON.stringify({ ...(pendente ? JSON.parse(pendente.dados) : {}), ...emAnalise });
        if (pendente) await prisma.solicitacaoAlteracao.update({ where: { id: pendente.id }, data: { dados } });
        else await prisma.solicitacaoAlteracao.create({ data: { alunoId, dados } });
      }

      await registrarAuditoria({
        acao: 'DADOS_ALTERADOS_PORTAL',
        entidade: 'Aluno',
        entidadeId: alunoId,
        detalhes: { aplicados: Object.keys(diretas), emAnalise: Object.keys(emAnalise) },
      });
      await sincronizarAluno(alunoId);

      return { aplicados: Object.keys(diretas), emAnalise: Object.keys(emAnalise) };
    });

    /** Upload pelo aluno: campo "tipo" antes do campo "arquivo". */
    privado.post('/documentos', async (request, reply) => {
      const documento = await receberDocumento(request, { alunoIdFixo: alunoDoPortal(request).id, enviadoPorId: null });
      return reply.code(201).send(documento);
    });

    privado.get('/documentos/:id/arquivo', async (request, reply) => {
      const { id } = idParams.parse(request.params);
      // Só os documentos do próprio aluno
      const documento = await prisma.documento.findFirst({ where: { id, alunoId: alunoDoPortal(request).id } });
      if (!documento) throw new HttpError(404, 'Documento não encontrado');
      return responderArquivo(reply, documento);
    });

    /** Certificado digital do próprio aluno. */
    privado.get('/certificados/:id/arquivo', async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const item = await prisma.itemLote.findFirst({
        where: { id, matricula: { alunoId: alunoDoPortal(request).id } },
        select: { certificadoRef: true, certificadoNomeArquivo: true },
      });
      if (!item?.certificadoRef) throw new HttpError(404, 'Certificado não encontrado');

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', contentDisposition(item.certificadoNomeArquivo ?? 'certificado.pdf'))
        .header('Cache-Control', 'private, no-store')
        .send(await abrirArquivo(item.certificadoRef));
    });
  });
};
