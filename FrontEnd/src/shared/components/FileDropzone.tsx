import { useState } from "react";

import MaterialIcon from "@/components/MaterialIcon";

/**
 * Área de upload com arrastar-e-soltar.
 *
 * Havia quatro implementações: três quase idênticas nas telas de documento e
 * uma em `NovoAnuncio` que **não tinha estado de arraste nenhum** — nenhum
 * retorno visual ao arrastar. Unificar corrige isso de passagem.
 */
interface FileDropzoneProps {
  /** Recebe os arquivos escolhidos, por arraste ou por seleção. */
  onFiles: (files: FileList) => void;
  accept: string;
  multiple?: boolean;
  file?: File | null;
  /** Arquivo já enviado antes, se houver. */
  existingUrl?: string | null;
  /** Rótulo do estado vazio. */
  emptyLabel?: string;
  /** Linha de formatos/limite abaixo do rótulo. */
  hint?: string;
  /** Marca a área como inválida. */
  hasError?: boolean;
  existingLabel?: string;
  /** Ícone do estado vazio. */
  emptyIcon?: string;
}

export function FileDropzone({
  onFiles,
  accept,
  multiple = false,
  file = null,
  existingUrl = null,
  emptyLabel = "Arraste o arquivo ou clique para selecionar",
  hint,
  hasError = false,
  existingLabel = "Arquivo enviado anteriormente",
  emptyIcon = "upload_file",
}: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  const border = dragging
    ? "border-primary bg-primary/5"
    : hasError
      ? "border-error bg-error/5"
      : file || existingUrl
        ? "border-primary/50 bg-primary/5"
        : "border-outline-variant/60 hover:border-primary/50 hover:bg-primary/5";

  return (
    <label
      className={`block border-2 border-dashed rounded-xl px-6 py-8 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${border}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
      }}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) onFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {file ? (
        <>
          <MaterialIcon icon="check_circle" size={40} className="text-primary mb-2" />
          <div className="font-bold text-primary text-sm">{file.name}</div>
          <div className="text-[10px] font-bold text-outline mt-1 uppercase tracking-widest">
            Clique para substituir
          </div>
        </>
      ) : existingUrl ? (
        <>
          <MaterialIcon icon="insert_drive_file" size={40} className="text-primary mb-2" />
          <div className="font-bold text-primary text-sm">{existingLabel}</div>
          <div className="text-[10px] font-bold text-outline mt-1 uppercase tracking-widest">
            Clique para substituir
          </div>
        </>
      ) : (
        <>
          <MaterialIcon icon={emptyIcon} className="text-outline mb-2" size={40} />
          <div className="font-bold text-tertiary text-sm">{emptyLabel}</div>
          {hint && (
            <div className="text-[10px] font-bold text-outline mt-1 uppercase tracking-widest">
              {hint}
            </div>
          )}
        </>
      )}
    </label>
  );
}
