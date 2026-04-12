import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { maskDocument } from "@/utils/masks/maskDocument";
import { maskCEP } from "@/utils/masks/maskCEP";
import { maskPhone } from "@/utils/masks/maskPhone";
import { clearSpecialChars } from "@/utils/clearSpecialChars";
import { userService } from "@/services/UserService/UserService";
import { validateCNPJ } from "@/utils/validation/validateCNPJ";
import { validateCPF } from "@/utils/validation/validateCPF";
import { UserRole } from "@/services/UserService/models/UserRole";
import type { CreateUserRequest } from "@/services/UserService/models/CreateUserRequest";
import { passwordPattern } from "@/utils/regexPatterns";

const Signup = () => {
  const [role, setRole] = useState<UserRole>(UserRole.Locatario);
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [document, setDocument] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [cep, setCep] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const documentRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();

  function validateDocument(value: string): boolean {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 11) return validateCPF(digits);
    if (digits.length === 14) return validateCNPJ(digits);
    return false;
  }

  function calculateMaxBirthDate() {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().split("T")[0];
  }

  const handleDocumentBlur = () => {
    const input = documentRef.current;
    if (!input) return;
    const digits = document.replace(/\D/g, "");
    if (digits.length === 0) return;
    if (!validateDocument(document)) {
      const msg =
        digits.length === 14
          ? "CNPJ inválido. Verifique os dígitos informados."
          : "CPF inválido. Verifique os dígitos informados.";
      input.setCustomValidity(msg);
      input.reportValidity();
    } else {
      input.setCustomValidity("");
    }
  };

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateDocument(document)) {
      documentRef.current?.setCustomValidity("CPF ou CNPJ inválido.");
      documentRef.current?.reportValidity();
      return;
    }
    setLoading(true);
    try {
      const payload: CreateUserRequest = {
        name: name.trim(),
        birth_date: birthDate,
        document: clearSpecialChars(document),
        email: email.toLowerCase().trim(),
        phone: `+55${clearSpecialChars(phone)}`,
        role,
        address: address.trim(),
        city: city.trim(),
        state: uf,
        cep: clearSpecialChars(cep),
        password,
      };

      await userService.register(payload);

      if (role === UserRole.Operador) {
        navigate("/signup/document-upload");
      } else {
        navigate("/signup/profile-upload");
      }
    } catch (error) {
      console.log(error);
      toast.error(
        `Ocorreu um problema com o cadastro. Tente novamente mais tarde.`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 pt-32 pb-20 flex items-center justify-center px-6">
        <div className="w-full max-w-lg">
          <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-xl p-10">
            <div className="text-center mb-10">
              <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-5">
                <MaterialIcon icon="person_add" size={32} />
              </div>
              <h1 className="font-headline text-3xl font-bold text-primary">
                Criar Conta
              </h1>
              <div className="h-1 w-16 bg-secondary-container mx-auto mt-3 mb-2" />
              <p className="text-sm text-on-surface-variant">
                Preencha seus dados para começar
              </p>
            </div>

            <div className="flex rounded-xl border border-outline-variant/50 overflow-hidden mb-8">
              <button
                onClick={() => setRole(UserRole.Locatario)}
                className={`flex-1 py-3.5 text-sm font-bold transition-all ${role === UserRole.Locatario ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}
              >
                Sou Locatário
              </button>
              <button
                onClick={() => setRole(UserRole.Locador)}
                className={`flex-1 py-3.5 text-sm font-bold transition-all border-l border-outline-variant/30 ${role === UserRole.Locador ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}
              >
                Sou Locador
              </button>
              <button
                onClick={() => setRole(UserRole.Operador)}
                className={`flex-1 py-3.5 text-sm font-bold transition-all border-l border-outline-variant/30 ${role === UserRole.Operador ? "bg-primary text-on-primary shadow-sm" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"}`}
              >
                Sou Operador
              </button>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Nome Completo*
                </label>
                <input
                  type="text"
                  placeholder="João da Silva"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Data de Nascimento*
                </label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                  min="1900-01-01"
                  max={calculateMaxBirthDate()}
                />
                <p className="text-[11px] text-outline font-medium">
                  É necessário ter 18 anos ou mais para se cadastrar.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  CPF / CNPJ {role}*
                </label>
                <input
                  type="text"
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                  value={document}
                  ref={documentRef}
                  onChange={(e) => {
                    setDocument(maskDocument(e.target.value));
                    documentRef.current?.setCustomValidity("");
                  }}
                  onBlur={handleDocumentBlur}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                  pattern="\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}"
                  title="Informe um CPF válido (000.000.000-00) ou CNPJ válido (00.000.000/0001-00)"
                />
                <p className="text-[11px] text-outline font-medium">
                  Requisito para formalização do contrato na plataforma.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  E-mail*
                </label>
                <input
                  type="email"
                  placeholder="contato@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Telefone *
                </label>
                <input
                  type="tel"
                  placeholder="(00) 90000-0000"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                  pattern="\(\d{2}\) \d{4,5}-\d{4}"
                  title="Informe um telefone válido no formato (00) 90000-0000"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Endereço*
                </label>
                <input
                  type="text"
                  placeholder="Rua, número, complemento"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Cidade*
                  </label>
                  <input
                    type="text"
                    placeholder="Sorriso"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Estado*
                  </label>
                  <select
                    value={uf}
                    onChange={(e) => setUf(e.target.value)}
                    className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                    required
                  >
                    <option value="">Selecione</option>
                    <option>AC</option>
                    <option>AL</option>
                    <option>AP</option>
                    <option>AM</option>
                    <option>BA</option>
                    <option>CE</option>
                    <option>DF</option>
                    <option>ES</option>
                    <option>GO</option>
                    <option>MA</option>
                    <option>MT</option>
                    <option>MS</option>
                    <option>MG</option>
                    <option>PA</option>
                    <option>PB</option>
                    <option>PR</option>
                    <option>PE</option>
                    <option>PI</option>
                    <option>RJ</option>
                    <option>RN</option>
                    <option>RS</option>
                    <option>RO</option>
                    <option>RR</option>
                    <option>SC</option>
                    <option>SP</option>
                    <option>SE</option>
                    <option>TO</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  CEP*
                </label>
                <input
                  type="text"
                  placeholder="00000-000"
                  value={cep}
                  onChange={(e) => setCep(maskCEP(e.target.value))}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                  pattern="\d{5}-\d{3}"
                  title="Informe um CEP válido no formato 00000-000"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Senha*
                </label>
                <input
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-container border-none rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:ring-primary text-on-surface transition-shadow"
                  required
                  pattern={passwordPattern.regex.source}
                  title={passwordPattern.title}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold py-3.5 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  "Criando conta..."
                ) : (
                  <>
                    <MaterialIcon icon="person_add" size={20} /> Criar Conta
                  </>
                )}
              </button>
            </form>

            <p className="text-center text-sm text-on-surface-variant mt-8">
              Já tem conta?{" "}
              <Link
                to="/login"
                className="font-bold text-primary hover:underline"
              >
                Faça login
              </Link>
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Signup;
