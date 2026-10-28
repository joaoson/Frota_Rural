/**
 * Exibe o timestamp do aceite em UTC, sem converter para o fuso do navegador.
 *
 * O `signed_at` é gravado em UTC pelo servidor e é assim que ele consta na
 * evidência; converter aqui faria o recibo na tela divergir do registro.
 */
export function formatarUtcCompleto(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ` +
    `às ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}
