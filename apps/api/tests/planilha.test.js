require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');

const planilha = require('../dist/lib/planilhaAntiga');

const data = (texto) => new Date(`${texto}T00:00:00.000Z`);
const hoje = data('2026-09-11');

test('CPF da planilha recupera os zeros da frente e recusa os inválidos', () => {
  assert.deepEqual(planilha.cpfDaPlanilha(1234567890), { cpf: '01234567890', problema: null });
  assert.deepEqual(planilha.cpfDaPlanilha('012.345.678-90'), { cpf: '01234567890', problema: null });
  assert.deepEqual(planilha.cpfDaPlanilha(''), { cpf: null, problema: 'vazio' });
  assert.deepEqual(planilha.cpfDaPlanilha(12345678900), { cpf: null, problema: 'invalido' });
});

test('situação da matrícula a partir de ATIVO/CANCELADO e QUITADO?', () => {
  assert.deepEqual(planilha.situacaoDaPlanilha('Em dia', 'SIM'), { situacao: 'QUITADO', reconhecida: true });
  assert.deepEqual(planilha.situacaoDaPlanilha('Cancelado', 'Sim'), { situacao: 'CANCELADO', reconhecida: true });
  assert.deepEqual(planilha.situacaoDaPlanilha('Inadimplente', ''), { situacao: 'ATRASADO', reconhecida: true });
  assert.deepEqual(planilha.situacaoDaPlanilha('SC', ''), { situacao: 'EM_DIA', reconhecida: false });
  // Repetidas: Em dia/Quitada antes de Trial, que vem antes das demais
  assert.ok(planilha.prioridadeSituacao('QUITADO') < planilha.prioridadeSituacao('TRIAL'));
  assert.ok(planilha.prioridadeSituacao('TRIAL') < planilha.prioridadeSituacao('ATRASADO'));
  assert.ok(planilha.prioridadeSituacao('ATRASADO') < planilha.prioridadeSituacao('CANCELADO'));
});

test('datas escritas no texto, com e sem o ano', () => {
  assert.deepEqual(planilha.dataDoTexto('Enviado em 30/04/2025', null, hoje), data('2025-04-30'));
  // Sem o ano: o primeiro depois da data do lote
  assert.deepEqual(planilha.dataDoTexto('Enviado 07/07 email', data('2025-06-30'), hoje), data('2025-07-07'));
  assert.deepEqual(planilha.dataDoTexto('Enviado 05/01', data('2025-11-30'), hoje), data('2026-01-05'));
  assert.equal(planilha.dataDoTexto('sem data', null, hoje), null);
  assert.deepEqual(planilha.dataCelula('13/07/2024'), data('2024-07-13'));
  assert.deepEqual(planilha.dataLoteDaPlanilha('Enviado em 31/03/2025', hoje), data('2025-03-31'));
});

test('status do certificado digital', () => {
  assert.deepEqual(planilha.certificadoDigitalDaPlanilha('Enviado 07/07 wpp', data('2025-06-30'), hoje), {
    situacao: 'entregue',
    data: data('2025-07-07'),
    canal: 'whatsapp',
  });
  assert.equal(planilha.certificadoDigitalDaPlanilha('recebido 10/02', data('2025-01-31'), hoje).situacao, 'recebido');
  assert.equal(planilha.certificadoDigitalDaPlanilha('Será enviado somente físico', null, hoje).situacao, 'desconhecido');
  assert.equal(planilha.certificadoDigitalDaPlanilha('', null, hoje), null);
});

test('notas guardadas como número ou texto', () => {
  assert.deepEqual(planilha.notaDaPlanilha(90), { nota: 90, invalida: false });
  assert.deepEqual(planilha.notaDaPlanilha('85'), { nota: 85, invalida: false });
  assert.deepEqual(planilha.notaDaPlanilha('87,5'), { nota: 87.5, invalida: false });
  assert.deepEqual(planilha.notaDaPlanilha({ formula: 'A1', result: 70 }), { nota: 70, invalida: false });
  assert.deepEqual(planilha.notaDaPlanilha(120), { nota: null, invalida: true });
  assert.deepEqual(planilha.notaDaPlanilha(null), { nota: null, invalida: false });
});

test('nome do módulo sem o prefixo "Módulo N"', () => {
  assert.equal(planilha.nomeDoModulo('Módulo IIII - Avaliação funcional do movimento'), 'Avaliação funcional do movimento');
  assert.equal(planilha.nomeDoModulo('MODULO 1:Como treinar e periodizar'), 'Como treinar e periodizar');
  assert.equal(planilha.nomeDoModulo('MÓDULO IX -Kettlebell'), 'Kettlebell');
});

test('aba de histórico: dados da turma e módulos, começando em qualquer coluna', () => {
  const linhas = [
    ['', '', 'Carga Horária:', '360 horas'],
    ['', 'Pós-Graduado no curso de: Curso Exemplo - EX1', '', 'Período de Realização:'],
    ['', 'HISTÓRICO ESCOLAR DO CURSO DE ESPECIALIZAÇÃO EM: Curso Exemplo'],
    ['', '(Nas disposições da resolução CES/CNE nº 1,de 06 de Abril de 2018.)'],
    ['', 'Disciplinas', '', 'CH', 'Corpo Docente', 'Titulação', 'Frequência', 'Média'],
    ['', 'Módulo I - Primeiro módulo', '', '20H', 'Docente Um', 'Mestre', '1', '100'],
    ['', 'MÓDULO II -Segundo módulo', '', '20H', 'Docente Dois', 'Doutora', '1', '90'],
  ];
  assert.deepEqual(planilha.lerHistoricoPlanilha(linhas), {
    nomeTurma: 'Curso Exemplo - EX1',
    curso: 'Curso Exemplo',
    resolucao: 'resolução CES/CNE nº 1,de 06 de Abril de 2018',
    cargaHoraria: 360,
    modulos: [
      { nome: 'Primeiro módulo', cargaHoraria: 20, docente: 'Docente Um', titulacao: 'Mestre' },
      { nome: 'Segundo módulo', cargaHoraria: 20, docente: 'Docente Dois', titulacao: 'Doutora' },
    ],
  });
});

test('endereço deslocado: rua em "Quitado?" e CEP em "Cidade"', () => {
  const esquerda = planilha.montarEndereco({
    quitado: 'Rua A',
    campos: ['10', 'Casa', 'Centro', '01001-000', 'São Paulo', 'SP', ''],
    temCep: true,
    whatsapp: '',
  });
  assert.equal(esquerda.corrigido, true);
  assert.deepEqual(esquerda.endereco, { rua: 'Rua A', numero: '10', complemento: 'Casa', bairro: 'Centro', cep: '01001-000', cidade: 'São Paulo', estado: 'SP' });

  const semColunaCep = planilha.montarEndereco({ quitado: 'Não', campos: ['Rua B', '5', '', 'Centro', '12345-678', 'Campinas'], temCep: false, whatsapp: 'SP' });
  assert.equal(semColunaCep.corrigido, true);
  assert.deepEqual(semColunaCep.endereco, { rua: 'Rua B', numero: '5', complemento: null, bairro: 'Centro', cep: '12345-678', cidade: 'Campinas', estado: 'SP' });

  const normal = planilha.montarEndereco({ quitado: 'SIM', campos: ['Rua C', '1', '', 'Bairro', '1001000', 'Rio de Janeiro', 'rj'], temCep: true, whatsapp: '' });
  assert.equal(normal.corrigido, false);
  assert.equal(normal.endereco.cep, '01001-000');
  assert.equal(normal.endereco.estado, 'RJ');
});

test('colunas da aba de turma: 1 a 12 pela posição quando o título está vazio ou errado', () => {
  const cabecalho = [''];
  cabecalho[1] = '///';
  cabecalho[6] = 'ATIVO/CANCELADO';
  cabecalho[9] = '';
  cabecalho[10] = '-------------';
  cabecalho[12] = 'CPF (Formatar essa coluna como texto)';
  cabecalho[16] = 'QUITOU?';
  cabecalho[26] = 'Link da pasta';
  cabecalho[39] = 'N° RG';
  const colunas = planilha.mapearColunas(cabecalho);
  assert.equal(colunas.matricula, 1);
  assert.equal(colunas.nome, 9);
  assert.equal(colunas.email, 10);
  assert.equal(colunas.cpf, 12);
  assert.equal(colunas.quitado, 16);
  assert.equal(colunas.pasta, 26);
  assert.equal(colunas.rg, 39);
  assert.equal(colunas.cep, null);
  assert.equal(planilha.ehAbaDeTurma(cabecalho), true);
});

test('pasta do Drive, data mais frequente e condição na graduação', () => {
  assert.equal(planilha.pastaDoDrive('https://drive.google.com/drive/folders/1AbCdEfGhIjK_lm-no?usp=sharing'), '1AbCdEfGhIjK_lm-no');
  assert.deepEqual(planilha.dataMaisFrequente([data('2026-01-18'), data('2026-01-18'), data('2026-07-09'), null]), data('2026-01-18'));
  assert.equal(planilha.condicaoPelosDocumentos(new Set(['RG', 'DIPLOMA'])), 'CONCLUIDO_COM_DIPLOMA');
  assert.equal(planilha.condicaoPelosDocumentos(new Set(['DECLARACAO_CONCLUSAO'])), 'CONCLUIDO_SEM_DIPLOMA');
  assert.equal(planilha.condicaoPelosDocumentos(new Set(['DECLARACAO_MATRICULA'])), 'CURSANDO');
});
