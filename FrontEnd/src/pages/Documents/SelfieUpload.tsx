import { useState } from "react";
import { Link } from "react-router";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const tips = [
  "Centralize seu rosto no centro da câmera",
  "Tire a foto na frente de um fundo claro e com boa iluminação",
  "Evite acessórios que cubram o rosto",
];

const SelfieUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (selected: File) => {
    if (selected.type.startsWith("image/")) setFile(selected);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-24 sm:pt-32 pb-16 sm:pb-20 max-w-4xl mx-auto px-4 sm:px-6 w-full">
        <div className="mb-8 sm:mb-10">
          <h1 className="font-headline text-2xl sm:text-3xl font-bold text-primary mb-1">
            Foto Pessoal
          </h1>
          <div className="h-1 w-16 bg-secondary-container mb-3" />
          <p className="text-on-surface-variant text-sm">
            Envie uma foto do seu rosto para verificação de identidade
          </p>
        </div>

        <form
          className="space-y-6 sm:space-y-8 bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-6 sm:p-10 shadow-sm"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="rounded-xl border border-outline-variant/30 overflow-hidden flex flex-col">
              <div className="flex-1 flex justify-center items-center bg-surface-container-high px-6 py-6">
                <img
                  src="/selfie_example.jpg"
                  alt="Exemplo de posicionamento de foto de perfil"
                  className="h-44 sm:h-52 w-44 sm:w-52 object-cover rounded-full"
                />
              </div>

              <div className="px-5 py-3 bg-surface-container border-t border-outline-variant/30">
                <p className="text-[11px] text-outline font-medium text-center">
                  Posicione seu rosto dentro do círculo
                </p>
              </div>
            </div>

            {/* Tips */}
            <div className="rounded-xl border border-outline-variant/40 bg-surface-container overflow-hidden flex flex-col">
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-outline-variant/30 bg-surface-container-high">
                <MaterialIcon
                  icon="tips_and_updates"
                  size={18}
                  className="text-primary"
                />
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                  Dicas para uma boa foto
                </span>
              </div>
              <ul className="px-5 py-4 space-y-4 flex-1">
                {tips.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-sm text-on-surface"
                  >
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                      {i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Upload area */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
              Foto Pessoal *
            </label>
            <label
              className={`block border-2 border-dashed rounded-xl px-6 py-8 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                dragging
                  ? "border-primary bg-primary/5"
                  : file
                    ? "border-primary/50 bg-primary/5"
                    : "border-outline-variant/60 hover:border-primary/50 hover:bg-primary/5"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFile(e.target.files[0]);
                }}
                required={!file}
              />
              {file ? (
                <>
                  <MaterialIcon
                    icon="check_circle"
                    size={40}
                    className="text-primary mb-2"
                  />
                  <div className="font-bold text-primary text-sm">
                    {file.name}
                  </div>
                  <div className="text-[10px] font-bold text-outline mt-1 uppercase tracking-widest">
                    Clique para substituir
                  </div>
                </>
              ) : (
                <>
                  <MaterialIcon
                    icon="add_a_photo"
                    className="text-outline mb-2"
                    size={40}
                  />
                  <div className="font-bold text-tertiary text-sm">
                    Arraste a foto ou clique para selecionar
                  </div>
                  <div className="text-[10px] font-bold text-outline mt-1 uppercase tracking-widest">
                    JPG, PNG — Máx. 5MB
                  </div>
                </>
              )}
            </label>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3.5 sm:py-4 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 text-base"
          >
            <MaterialIcon icon="upload" size={20} /> Enviar Foto
          </button>
        </form>
      </div>
      <Footer />
    </div>
  );
};

export default SelfieUpload;
