import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { chatService } from "@/services/ChatService/ChatService";
import type { AdminFlaggedMessage } from "@/services/ChatService/models/ChatModels";

export default function Denuncias() {
  const [rows, setRows] = useState<AdminFlaggedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await chatService.listFlagged({ status: "pending" });
      setRows(page.results);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao carregar a fila.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (id: string, decision: "dismiss" | "hide") => {
    try {
      const res = await chatService.resolveFlagged(id, decision);
      toast.success(res.message);
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao registrar a decisão.");
    }
  };

  return (
    <div>
      <h1 className="mb-4 font-headline text-2xl font-bold text-on-surface">Denúncias</h1>

      {loading ? (
        <p className="text-sm text-on-surface-variant">Carregando...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Nenhuma mensagem pendente de moderação.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant/30">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container-low text-on-surface-variant">
              <tr>
                <th className="p-3 font-medium">Mensagem</th>
                <th className="p-3 font-medium">De / Para</th>
                <th className="p-3 font-medium">Origem</th>
                <th className="p-3 font-medium">Motivo</th>
                <th className="p-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {rows.map((row) => (
                <tr key={row.message_id} className="align-top">
                  <td className="max-w-sm p-3 text-on-surface">
                    <p className="whitespace-pre-wrap break-words">{row.content}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {new Date(row.sent_at).toLocaleString("pt-BR")}
                    </p>
                  </td>
                  <td className="p-3 text-on-surface-variant">
                    {row.sender?.name ?? "?"} → {row.receiver?.name ?? "?"}
                  </td>
                  <td className="p-3 text-on-surface-variant">
                    {row.source === "report" ? "Denúncia" : "Automática"}
                  </td>
                  <td className="max-w-xs p-3 text-on-surface-variant">
                    {row.reports.map((r) => (
                      <p key={r.id} className="break-words">
                        {r.reason}
                      </p>
                    ))}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => decide(row.message_id, "dismiss")}>
                        Arquivar
                      </Button>
                      <Button size="sm" onClick={() => decide(row.message_id, "hide")}>
                        Ocultar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
