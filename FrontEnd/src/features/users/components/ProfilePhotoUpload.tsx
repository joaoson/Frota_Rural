import { useId, useRef } from "react";
import { toast } from "sonner";

import { HttpError } from "@/shared/http/errors";

import { useUploadProfilePhoto } from "../hooks/useUsers";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export function ProfilePhotoUpload({ userId }: { userId: string | null }) {
  const upload = useUploadProfilePhoto();
  const inputRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const helpId = useId();

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Permite selecionar o mesmo arquivo novamente depois de uma falha.
    event.target.value = "";
    if (!userId || !file || submitting.current) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Tipo de arquivo não suportado. Envie JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("A foto deve ter no máximo 5 MB.");
      return;
    }

    submitting.current = true;
    try {
      await upload.mutateAsync({ id: userId, file });
      toast.success("Foto de perfil atualizada.");
    } catch (error) {
      toast.error(error instanceof HttpError
        ? error.firstFieldError()?.message ?? error.message
        : "Não foi possível enviar a foto. Tente novamente.");
    } finally {
      submitting.current = false;
    }
  };

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        aria-label="Selecionar foto de perfil"
        aria-describedby={helpId}
        className="hidden"
        disabled={!userId || upload.isPending}
        onChange={(event) => void handleChange(event)}
      />
      <button
        type="button"
        disabled={!userId || upload.isPending}
        aria-describedby={helpId}
        aria-busy={upload.isPending}
        onClick={() => inputRef.current?.click()}
        className="text-sm font-bold text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {upload.isPending ? "Enviando foto..." : "Alterar foto"}
      </button>
      <p id={helpId} className="text-xs text-on-surface-variant">JPG, PNG ou WEBP. Até 5 MB.</p>
    </div>
  );
}
