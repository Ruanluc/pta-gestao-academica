import { z } from 'zod';

// Mensagens de validação em português
z.setErrorMap((issue, ctx) => {
  const campo = issue.path.join('.') || 'valor';

  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return {
        message: issue.received === 'undefined' || issue.received === 'null' ? `Campo obrigatório: ${campo}` : `Valor inválido em ${campo}`,
      };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: `${campo}: informe pelo menos ${issue.minimum} caractere(s)` };
      if (issue.type === 'number') return { message: `${campo}: o valor mínimo é ${issue.minimum}` };
      if (issue.type === 'array') return { message: `${campo}: informe pelo menos ${issue.minimum} item(ns)` };
      break;
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `${campo}: no máximo ${issue.maximum} caracteres` };
      if (issue.type === 'number') return { message: `${campo}: o valor máximo é ${issue.maximum}` };
      if (issue.type === 'array') return { message: `${campo}: no máximo ${issue.maximum} itens` };
      break;
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `Valor inválido em ${campo}` };
    case z.ZodIssueCode.invalid_date:
      return { message: `Data inválida em ${campo}` };
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'E-mail inválido' };
      if (issue.validation === 'uuid') return { message: `Identificador inválido em ${campo}` };
      break;
    default:
      break;
  }

  return { message: ctx.defaultError };
});

const vazioParaNull = (valor: unknown) => (typeof valor === 'string' && valor.trim() === '' ? null : valor);

export const textoObrigatorio = (min = 1, max = 255) => z.string().trim().min(min).max(max);

export const textoOpcional = (max = 255) => z.preprocess(vazioParaNull, z.string().trim().max(max).nullable().optional());

export const dataObrigatoria = z.coerce.date();

export const dataOpcional = z.preprocess(vazioParaNull, z.coerce.date().nullable().optional());

export const numeroOpcional = (min: number, max: number) =>
  z.preprocess(vazioParaNull, z.coerce.number().min(min).max(max).nullable().optional());

export const booleano = z.preprocess((valor) => (valor === 'true' ? true : valor === 'false' ? false : valor), z.boolean());

export const emailSchema = z.string().trim().toLowerCase().email();

export const idSchema = z.string().uuid();

export const idParams = z.object({ id: idSchema });

export const somenteDigitos = (valor: string) => valor.replace(/\D/g, '');

export const cpfValido = (valor: string) => {
  const cpf = somenteDigitos(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const digitoVerificador = (base: string) => {
    const pesoInicial = base.length + 1;
    const soma = base.split('').reduce((total, digito, indice) => total + Number(digito) * (pesoInicial - indice), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digitoVerificador(cpf.slice(0, 9)) === Number(cpf[9]) && digitoVerificador(cpf.slice(0, 10)) === Number(cpf[10]);
};

export const cpfSchema = z.string().transform(somenteDigitos).refine(cpfValido, 'CPF inválido');
