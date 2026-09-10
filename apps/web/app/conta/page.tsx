'use client';

import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { ROTULOS_ROLE } from '../lib/tipos';
import { useUsuario } from '../components/AppShell';
import { Aviso, Cabecalho, Campo, Cartao, useMensagem } from '../components/ui';

export default function ContaPage() {
  const { usuario } = useUsuario();
  const [form, setForm] = useState({ senhaAtual: '', novaSenha: '', confirmacao: '' });
  const [salvando, setSalvando] = useState(false);
  const { mensagem, definir, erro, sucesso, limpar } = useMensagem();

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault();
    limpar();
    if (form.novaSenha !== form.confirmacao) {
      definir({ tipo: 'erro', texto: 'A confirmação não confere com a nova senha.' });
      return;
    }

    setSalvando(true);
    try {
      await api('/auth/senha', { method: 'PUT', json: { senhaAtual: form.senhaAtual, novaSenha: form.novaSenha } });
      sucesso('Senha alterada com sucesso.');
      setForm({ senhaAtual: '', novaSenha: '', confirmacao: '' });
    } catch (falha) {
      erro(falha);
    } finally {
      setSalvando(false);
    }
  };

  const alterar = (campo: keyof typeof form) => (evento: React.ChangeEvent<HTMLInputElement>) =>
    setForm((atual) => ({ ...atual, [campo]: evento.target.value }));

  return (
    <div>
      <Cabecalho titulo="Minha conta" descricao={`${usuario.nome} · ${usuario.email} · ${ROTULOS_ROLE[usuario.role]}`} />
      <Cartao titulo="Alterar senha" className="max-w-lg">
        <Aviso mensagem={mensagem} onFechar={limpar} />
        <form onSubmit={enviar} className="space-y-4">
          <Campo rotulo="Senha atual">
            <input type="password" autoComplete="current-password" value={form.senhaAtual} onChange={alterar('senhaAtual')} required className="input" />
          </Campo>
          <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres.">
            <input type="password" autoComplete="new-password" value={form.novaSenha} onChange={alterar('novaSenha')} required minLength={8} className="input" />
          </Campo>
          <Campo rotulo="Confirme a nova senha">
            <input type="password" autoComplete="new-password" value={form.confirmacao} onChange={alterar('confirmacao')} required minLength={8} className="input" />
          </Campo>
          <button type="submit" disabled={salvando} className="btn btn-primario">
            {salvando ? 'Salvando...' : 'Alterar senha'}
          </button>
        </form>
      </Cartao>
    </div>
  );
}
