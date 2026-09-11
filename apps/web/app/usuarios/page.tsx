'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../lib/api';
import { formatarData } from '../lib/formato';
import { ROTULOS_ROLE, type Role, type Usuario } from '../lib/tipos';
import { useUsuario } from '../components/AppShell';
import { Aviso, Cabecalho, Campo, Carregando, Cartao, cls, useMensagem } from '../components/ui';

const FORM_VAZIO = { nome: '', email: '', senha: '', role: 'SECRETARIA' as Role };

export default function UsuariosPage() {
  const { usuario: logado } = useUsuario();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const { mensagem, definir, erro, sucesso, limpar } = useMensagem();

  const carregar = useCallback(async () => {
    try {
      setUsuarios(await api<Usuario[]>('/usuarios'));
    } catch (falha) {
      erro(falha);
    }
  }, [erro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const criar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    limpar();
    try {
      await api('/usuarios', { method: 'POST', json: form });
      sucesso(`Usuário ${form.email} criado.`);
      setForm(FORM_VAZIO);
      await carregar();
    } catch (falha) {
      erro(falha);
    } finally {
      setSalvando(false);
    }
  };

  const atualizar = async (usuario: Usuario, dados: Partial<Usuario> & { senha?: string }, texto: string) => {
    limpar();
    try {
      await api(`/usuarios/${usuario.id}`, { method: 'PUT', json: dados });
      sucesso(texto);
      await carregar();
    } catch (falha) {
      erro(falha);
    }
  };

  const redefinirSenha = (usuario: Usuario) => {
    const senha = window.prompt(`Nova senha para ${usuario.nome} (mínimo 8 caracteres):`);
    if (!senha) return;
    if (senha.length < 8) {
      definir({ tipo: 'erro', texto: 'A senha deve ter pelo menos 8 caracteres.' });
      return;
    }
    void atualizar(usuario, { senha }, `Senha de ${usuario.nome} redefinida.`);
  };

  return (
    <div className="space-y-6">
      <Cabecalho
        titulo="Usuários"
        descricao="Contas de acesso. Administrador: acesso total. Equipe CS: alunos, documentos, notas e certificação (sem configurar turmas nem usuários). Professor: lança notas e consulta. Certificadora: só os lotes enviados. Financeiro: só a situação das matrículas."
      />
      <Aviso mensagem={mensagem} onFechar={limpar} />

      <Cartao titulo="Novo usuário">
        <form onSubmit={criar} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Nome">
            <input value={form.nome} onChange={(evento) => setForm({ ...form, nome: evento.target.value })} required minLength={2} className="input" />
          </Campo>
          <Campo rotulo="E-mail">
            <input type="email" value={form.email} onChange={(evento) => setForm({ ...form, email: evento.target.value })} required className="input" />
          </Campo>
          <Campo rotulo="Senha inicial">
            <input
              type="password"
              autoComplete="new-password"
              value={form.senha}
              onChange={(evento) => setForm({ ...form, senha: evento.target.value })}
              required
              minLength={8}
              className="input"
            />
          </Campo>
          <Campo rotulo="Perfil">
            <select value={form.role} onChange={(evento) => setForm({ ...form, role: evento.target.value as Role })} className="input">
              {(Object.keys(ROTULOS_ROLE) as Role[]).map((role) => (
                <option key={role} value={role}>
                  {ROTULOS_ROLE[role]}
                </option>
              ))}
            </select>
          </Campo>
          <div className="lg:col-span-4">
            <button type="submit" disabled={salvando} className="btn btn-primario">
              {salvando ? 'Criando...' : 'Criar usuário'}
            </button>
          </div>
        </form>
      </Cartao>

      <Cartao titulo="Usuários cadastrados">
        {!usuarios ? (
          <Carregando />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th>Situação</th>
                  <th className="hidden md:table-cell">Criado em</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => {
                  const proprio = usuario.id === logado.id;
                  return (
                    <tr key={usuario.id} className={cls(!usuario.ativo && 'opacity-60')}>
                      <td>
                        <p className="font-medium text-slate-900">
                          {usuario.nome} {proprio ? <span className="text-xs text-slate-400">(você)</span> : null}
                        </p>
                        <p className="text-xs text-slate-500">{usuario.email}</p>
                      </td>
                      <td>
                        <select
                          value={usuario.role}
                          disabled={proprio}
                          onChange={(evento) =>
                            void atualizar(usuario, { role: evento.target.value as Role }, `Perfil de ${usuario.nome} atualizado.`)
                          }
                          className="input mt-0 w-auto py-1"
                        >
                          {(Object.keys(ROTULOS_ROLE) as Role[]).map((role) => (
                            <option key={role} value={role}>
                              {ROTULOS_ROLE[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          disabled={proprio}
                          onClick={() =>
                            void atualizar(usuario, { ativo: !usuario.ativo }, `${usuario.nome} ${usuario.ativo ? 'desativado' : 'reativado'}.`)
                          }
                          className={cls('btn btn-sm', usuario.ativo ? 'btn-secundario' : 'bg-emerald-600 text-white hover:bg-emerald-700')}
                        >
                          {usuario.ativo ? 'Ativo · desativar' : 'Inativo · reativar'}
                        </button>
                      </td>
                      <td className="hidden text-slate-600 md:table-cell">{formatarData(usuario.criadoEm)}</td>
                      <td className="text-right">
                        <button type="button" onClick={() => redefinirSenha(usuario)} className="btn btn-fantasma btn-sm">
                          <KeyRound className="h-3.5 w-3.5" /> Redefinir senha
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}
