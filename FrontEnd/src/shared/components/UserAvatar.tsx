import { useState } from "react";

interface UserAvatarProps {
  photoUrl?: string | null;
  initials: string;
  className?: string;
}

export function UserAvatar({ photoUrl, initials, className = "" }: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  return (
    <div className={`shrink-0 overflow-hidden rounded-full flex items-center justify-center font-headline font-bold ${className}`}>
      {photoUrl && photoUrl !== failedUrl ? (
        <img
          src={photoUrl}
          alt="Foto de perfil"
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(photoUrl)}
        />
      ) : initials}
    </div>
  );
}
