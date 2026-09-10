require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calcularSemaforo,
  dadosFaltantesHistorico,
  documentosObrigatorios,
  matriculaConcluida,
  situacaoDisciplina,
} = require('../dist/lib/semaforo');

const dadosCompletos = {
  rgNumero: '12.345.678-9',
  rgOrgaoEmissor: 'SSP/SP',
  dataNascimento: new Date('1990-01-01T00:00:00Z'),
  nacionalidade: 'Brasileira',
  naturalidade: 'São Paulo - SP',
  filiacao: 'Maria Souza',
};

test('dados pessoais do histórico: lista o que falta', () => {
  assert.deepEqual(dadosFaltantesHistorico(dadosCompletos), []);
  assert.deepEqual(dadosFaltantesHistorico({ ...dadosCompletos, rgNumero: ' ', dataNascimento: null }), [
    'documento de identidade (RG)',
    'data de nascimento',
  ]);
});

test('dados pessoais incompletos deixam o aluno vermelho', () => {
  const documentos = documentosObrigatorios('CURSANDO').map((tipo) => ({ tipo, status: 'APROVADO' }));
  const entrada = { condicaoGraduacao: 'CURSANDO', documentos, turmas: [], notas: [] };
  const regras = { mediaMinima: 70, frequenciaMinima: 75, modulosPorTurma: 2 };

  assert.equal(calcularSemaforo({ ...entrada, dadosPessoais: dadosCompletos }, regras).status, 'VERDE');
  const incompleto = calcularSemaforo({ ...entrada, dadosPessoais: { ...dadosCompletos, filiacao: null } }, regras);
  assert.equal(incompleto.status, 'VERMELHO');
  assert.ok(incompleto.pendencias[0].includes('filiação'));
});

// Nota de 0 a 100, aprovação com 70; turmas de teste com 2 módulos
const regras = { mediaMinima: 70, frequenciaMinima: 75, modulosPorTurma: 2 };
const aprovados = (tipos) => tipos.map((tipo) => ({ tipo, status: 'APROVADO' }));
const disciplinas = [{ id: 'd1' }, { id: 'd2' }];
const turmas = [{ nome: 'Turma A', disciplinas }];
const notasOk = [
  { disciplinaId: 'd1', media: 80, frequencia: 90 },
  { disciplinaId: 'd2', media: 70, frequencia: 75 },
];

test('documentos obrigatórios variam conforme a condição de graduação', () => {
  assert.deepEqual(documentosObrigatorios('CURSANDO'), ['RG', 'CPF', 'COMPROVANTE_ENDERECO', 'DECLARACAO_MATRICULA']);
  assert.ok(documentosObrigatorios('CONCLUIDO_COM_DIPLOMA').includes('DIPLOMA'));
  assert.ok(documentosObrigatorios('CONCLUIDO_SEM_DIPLOMA').includes('DECLARACAO_CONCLUSAO'));
});

test('sem documentos o aluno fica vermelho', () => {
  const resultado = calcularSemaforo({ condicaoGraduacao: 'CURSANDO', documentos: [], turmas: [], notas: [] }, regras);
  assert.equal(resultado.status, 'VERMELHO');
  assert.ok(resultado.pendencias.some((pendencia) => pendencia.includes('RG')));
});

test('documento apenas rejeitado mantém vermelho', () => {
  const documentos = [
    ...aprovados(['CPF', 'COMPROVANTE_ENDERECO', 'DECLARACAO_MATRICULA']),
    { tipo: 'RG', status: 'REJEITADO' },
  ];
  const resultado = calcularSemaforo({ condicaoGraduacao: 'CURSANDO', documentos, turmas: [], notas: [] }, regras);
  assert.equal(resultado.status, 'VERMELHO');
  assert.ok(resultado.pendencias.some((pendencia) => pendencia.includes('rejeitado')));
});

test('documento aguardando análise deixa amarelo', () => {
  const documentos = [...aprovados(['CPF', 'COMPROVANTE_ENDERECO', 'DECLARACAO_MATRICULA']), { tipo: 'RG', status: 'PENDENTE' }];
  const resultado = calcularSemaforo({ condicaoGraduacao: 'CURSANDO', documentos, turmas: [], notas: [] }, regras);
  assert.equal(resultado.status, 'AMARELO');
});

test('módulo sem nota deixa amarelo', () => {
  const documentos = aprovados(documentosObrigatorios('CURSANDO'));
  const resultado = calcularSemaforo({ condicaoGraduacao: 'CURSANDO', documentos, turmas, notas: [notasOk[0]] }, regras);
  assert.equal(resultado.status, 'AMARELO');
  assert.ok(resultado.pendencias.some((pendencia) => pendencia.includes('módulo(s) sem nota')));
});

test('turma sem todos os módulos cadastrados deixa amarelo', () => {
  const documentos = aprovados(documentosObrigatorios('CURSANDO'));
  const resultado = calcularSemaforo(
    { condicaoGraduacao: 'CURSANDO', documentos, turmas, notas: notasOk },
    { ...regras, modulosPorTurma: 18 },
  );
  assert.equal(resultado.status, 'AMARELO');
  assert.ok(resultado.pendencias.includes('Turma A: 2 de 18 módulos cadastrados'));
});

test('documentação aprovada e todos os módulos aprovados deixa verde', () => {
  const documentos = aprovados(documentosObrigatorios('CONCLUIDO_COM_DIPLOMA'));
  const resultado = calcularSemaforo({ condicaoGraduacao: 'CONCLUIDO_COM_DIPLOMA', documentos, turmas, notas: notasOk }, regras);
  assert.deepEqual(resultado, { status: 'VERDE', pendencias: [] });
});

test('aprovação no módulo exige nota 70 ou mais (escala 0 a 100)', () => {
  assert.equal(situacaoDisciplina(undefined, regras), 'PENDENTE');
  assert.equal(situacaoDisciplina({ media: 80, frequencia: null }, regras), 'PENDENTE');
  assert.equal(situacaoDisciplina({ media: 70, frequencia: 75 }, regras), 'APROVADO');
  assert.equal(situacaoDisciplina({ media: 100, frequencia: 100 }, regras), 'APROVADO');
  assert.equal(situacaoDisciplina({ media: 69.9, frequencia: 100 }, regras), 'REPROVADO');
  assert.equal(situacaoDisciplina({ media: 95, frequencia: 74 }, regras), 'REPROVADO');
});

test('matriculaConcluida exige todos os módulos previstos e aprovação em cada um', () => {
  assert.equal(matriculaConcluida([], [], regras), false);
  assert.equal(matriculaConcluida(disciplinas, notasOk, regras), true);
  assert.equal(matriculaConcluida(disciplinas, [notasOk[0]], regras), false);
  assert.equal(matriculaConcluida(disciplinas, notasOk, { ...regras, modulosPorTurma: 18 }), false);
  assert.equal(matriculaConcluida(disciplinas, notasOk, { ...regras, modulosPorTurma: 0 }), true);
});
