'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { formatarData } from '../lib/formato';
import { ROTULOS_ROLE, type Certificadora, type Role, type Usuario } from '../lib/tipos';
import { useUsuario } from '../components/AppShell';
import { Aviso, Cabecalho, Campo, Carregando, Cartao, cls, useMensagem, Vazio } from '../components/ui';

const FORM_VAZIO = { nome: '', email: '', senha: '', role: 'SECRETARIA' as Role, certificadoraId: '' };
const CERTIFICADORA_VAZIA = { nome: '', email: '' };

export default function UsuariosPage() {
  const { usuario: logado } = useUsuario();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [certificadoras, setCertificadoras] = useState<Certificadora[]>([]);
  const [form, setForm] = useState(FORM_VAZIO);
  const [novaCertificadora, setNovaCertificadora] = useState(CERTIFICADORA_VAZIA);
  const [salvando, setSalvando] = useState(false);
  const { mensagem, definir, erro, sucesso, limpar } = useMensagem();

  const carregar = useCallback(async () => {
    try {
      const [listaUsuarios, listaCertificadoras] = await Promise.all([api<Usuario[]>('/usuarios'), api<Certificadora[]>('/certificadoras')]);
      setUsuarios(listaUsuarios);
      setCertificadoras(listaCertificadoras);
    } catch (falha) {
      erro(falha);
    }
  }, [erro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ativas = certificadoras.filter((certificadora) => certificadora.ativa);

  const criar = async (evento: FormEvent) => {
    evento.preventDefault();
    setSalvando(true);
    limpar();
    try {
      await api('/usuarios', { method: 'POST', json: { ...form, certificadoraId: form.role === 'CERTIFICADORA' ? form.certificadoraId : null } });
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

  const alterarPerfil = (usuario: Usuario, role: Role) => {
    // Quem vira certificadora precisa de uma certificadora: começa pela primeira ativa (dá para trocar ao lado)
    const certificadora = role === 'CERTIFICADORA' && !usuario.certificadoraId ? ativas[0]?.id : undefined;
    if (role === 'CERTIFICADORA' && !usuario.certificadoraId && !certificadora) {
      definir({ tipo: 'erro', texto: 'Cadastre uma certificadora antes (abaixo).' });
      return;
    }
    void atualizar(usuario, { role, ...(certificadora ? { certificadoraId: certificadora } : {}) }, `Perfil de ${usuario.nome} atualizado.`);
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

  const criarCertificadora = async (evento: FormEvent) => {
    evento.preventDefault();
    limpar();
    try {
      await api('/certificadoras', { method: 'POST', json: novaCertificadora });
      sucesso(`Certificadora ${novaCertificadora.nome.toUpperCase()} cadastrada.`);
      setNovaCertificadora(CERTIFICADORA_VAZIA);
      await carregar();
    } catch (falha) {
      erro(falha);
    }
  };

  const alternarCertificadora = async (certificadora: Certificadora) => {
    limpar();
    try {
      await api(`/certificadoras/${certificadora.id}`, {
        method: 'PUT',
        json: { nome: certificadora.nome, email: certificadora.email ?? '', ativa: !certificadora.ativa },
      });
      sucesso(`${certificadora.nome} ${certificadora.ativa ? 'desativada' : 'reativada'}.`);
      await carregar();
    } catch (falha) {
      erro(falha);
    }
  };

  return (
    <div className="space-y-6">
      <Cabecalho
        titulo="Usuários"
        descricao="Contas de acesso. Administrador: acesso total. Equipe CS: alunos, documentos, notas e certificação (sem configurar turmas nem usuários). Professor: lança notas e consulta. Certificadora: só os lotes enviados à certificadora dela. Financeiro: só a situação das matrículas."
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
          {form.role === 'CERTIFICADORA' ? (
            <Campo rotulo="Certificadora" dica="O usuário só verá os lotes enviados a ela.">
              <select value={form.certificadoraId} onChange={(evento) => setForm({ ...form, certificadoraId: evento.target.value })} required className="input">
                <option value="">Escolha...</option>
                {ativas.map((certificadora) => (
                  <option key={certificadora.id} value={certificadora.id}>
                    {certificadora.nome}
                  </option>
                ))}
              </select>
            </Campo>
          ) : null}
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
                        <div className="flex flex-wrap gap-1.5">
                          <select
                            value={usuario.role}
                            disabled={proprio}
                            onChange={(evento) => alterarPerfil(usuario, evento.target.value as Role)}
                            className="input mt-0 w-auto py-1"
                          >
                            {(Object.keys(ROTULOS_ROLE) as Role[]).map((role) => (
                              <option key={role} value={role}>
                                {ROTULOS_ROLE[role]}
                              </option>
                            ))}
                          </select>
                          {usuario.role === 'CERTIFICADORA' ? (
                            <select
                              value={usuario.certificadoraId ?? ''}
                              onChange={(evento) =>
                                void atualizar(usuario, { certificadoraId: evento.target.value }, `Certificadora de ${usuario.nome} atualizada.`)
                              }
                              className="input mt-0 w-auto py-1"
                              aria-label={`Certificadora de ${usuario.nome}`}
                            >
                              {usuario.certificadoraId ? null : <option value="">Escolha...</option>}
                              {certificadoras.map((certificadora) => (
                                <option key={certificadora.id} value={certificadora.id}>
                                  {certificadora.nome}
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
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

      <Cartao titulo="Certificadoras" descricao="Instituições que emitem os certificados. Cada lote vai para uma delas e cada usuário certificadora só vê os lotes da sua.">
        {certificadoras.length === 0 ? (
          <Vazio>Nenhuma certificadora cadastrada.</Vazio>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {certificadoras.map((certificadora) => (
              <li key={certificadora.id} className={cls('flex flex-wrap items-center justify-between gap-3 p-3 text-sm', !certificadora.ativa && 'opacity-60')}>
                <span>
                  <span className="font-medium text-slate-900">{certificadora.nome}</span>
                  {certificadora.email ? <span className="ml-2 text-slate-500">{certificadora.email}</span> : null}
                  <span className="ml-2 text-xs text-slate-400">
                    {certificadora._count?.usuarios ?? 0} usuário(s) · {certificadora._count?.lotes ?? 0} lote(s)
                  </span>
                </span>
                <button type="button" onClick={() => void alternarCertificadora(certificadora)} className="btn btn-secundario btn-sm">
                  {certificadora.ativa ? 'Desativar' : 'Reativar'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={criarCertificadora} className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr,1.4fr,auto]">
          <input
            value={novaCertificadora.nome}
            onChange={(evento) => setNovaCertificadora({ ...novaCertificadora, nome: evento.target.value })}
            placeholder="Nome (ex.: INOVE)"
            required
            minLength={2}
            className="input mt-0"
          />
          <input
            type="email"
            value={novaCertificadora.email}
            onChange={(evento) => setNovaCertificadora({ ...novaCertificadora, email: evento.target.value })}
            placeholder="E-mail de contato (opcional)"
            className="input mt-0"
          />
          <button type="submit" className="btn btn-primario">
            <Plus className="h-4 w-4" /> Cadastrar
          </button>
        </form>
      </Cartao>
    </div>
  );
}
