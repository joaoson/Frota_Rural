/**
 * Rota inicial de cada papel.
 *
 * Existia duplicada no Login e no ProtectedRoute, e as duas divergiram: o
 * ProtectedRoute conhecia "admin", o Login não — então todo admin caía no
 * `else` e ia parar em /dashboard-locatario. Mapeamento agora mora aqui.
 */
export function homeRouteForRole(role: string | null | undefined): string {
  switch (role) {
    case "locador":
      return "/dashboard";
    case "locatario":
      return "/dashboard-locatario";
    case "admin":
      return "/admin";
    // Não existe painel de operador ainda. O login mandava operador para o
    // painel do locatário (caía no `else`) enquanto o ProtectedRoute mandava
    // para "/". Mantido o comportamento do login para não regredir; quando
    // houver uma tela própria de operador, é aqui que muda.
    case "operador":
      return "/dashboard-locatario";
    default:
      return "/";
  }
}
