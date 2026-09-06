import { useEffect } from "react";
import { useLocation } from "react-router";

const BASE = "Frota Rural";

/**
 * Mapa de rota → título, avaliado na ordem de declaração (o primeiro padrão que
 * casa vence). Rotas dinâmicas usam expressões regulares para os segmentos
 * variáveis. Manter os padrões mais específicos antes dos mais genéricos.
 */
const TITULOS: ReadonlyArray<[RegExp, string]> = [
  [/^\/$/, "Início"],
  [/^\/help$/, "Ajuda"],
  [/^\/signup\/document-upload$/, "Envio de CNH"],
  [/^\/signup\/profile-upload$/, "Envio de foto de perfil"],
  [/^\/signup$/, "Criar conta"],
  [/^\/login$/, "Entrar"],
  [/^\/forgot-password$/, "Recuperar senha"],
  [/^\/reset-password$/, "Redefinir senha"],
  [/^\/document\/cnh$/, "Envio de CNH"],
  [/^\/document\/certification(\/.*)?$/, "Envio de certificação"],
  [/^\/dashboard\/novo-equipamento$/, "Novo equipamento"],
  [/^\/dashboard\/novo-anuncio$/, "Novo anúncio"],
  [/^\/dashboard\/gerenciar-anuncio\/.+$/, "Gerenciar anúncio"],
  [/^\/dashboard$/, "Painel do locador"],
  [/^\/dashboard-locatario\/locacoes\/.+$/, "Análise da locação"],
  [/^\/dashboard-locatario$/, "Painel do locatário"],
  [/^\/admin\/users$/, "Administração · Usuários"],
  [/^\/admin\/anuncios$/, "Administração · Anúncios"],
  [/^\/admin\/documentos$/, "Administração · Documentos"],
  [/^\/admin\/denuncias$/, "Administração · Denúncias"],
  [/^\/admin\/relatorios$/, "Administração · Relatórios"],
  [/^\/admin(\/.*)?$/, "Administração"],
  [/^\/buscar-maquinario$/, "Buscar maquinário"],
  [/^\/anuncio\/.+$/, "Detalhe do anúncio"],
  [/^\/reservar\/.+$/, "Reservar maquinário"],
  [/^\/contrato\/.+$/, "Contrato de locação"],
];

/**
 * Atualiza `document.title` a cada mudança de rota. Sem isso, todas as telas se
 * anunciam com o mesmo título — quem navega por leitor de tela não distingue em
 * qual página está. Não renderiza nada.
 */
export default function PageTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const encontrado = TITULOS.find(([re]) => re.test(pathname));
    document.title = encontrado ? `${encontrado[1]} · ${BASE}` : `${BASE} — Locação de Maquinário Agrícola`;
  }, [pathname]);

  return null;
}
