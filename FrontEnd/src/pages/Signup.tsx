import { useState, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { AxiosError } from "axios";
import { toast } from "sonner";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { maskDocument } from "@/utils/masks/maskDocument";
import { maskCEP } from "@/utils/masks/maskCEP";
import { fetchAddressByCEP, formatAddressFromCEP } from "@/services/ViaCEPService";
import { maskPhone } from "@/utils/masks/maskPhone";
import { clearSpecialChars } from "@/utils/clearSpecialChars";
import { userService } from "@/services/UserService/UserService";
import { UserRole } from "@/services/UserService/models/UserRole";
import type { CreateUserRequest } from "@/services/UserService/models/CreateUserRequest";
import {
  maxBirthDate,
  validatePersonField,
  type PersonField,
} from "@/utils/validation/personFields";

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
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const documentRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();

  const handleCEPLookup = async (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 8) {
      try {
        const data = await fetchAddressByCEP(digits);
        if (data) {
          setAddress(formatAddressFromCEP(data, "logradouro"));
          setCity(data.localidade);
          setUf(data.uf.toUpperCase());
          setErrors((prev) => ({
            ...prev,
            address: "",
            city: "",
            uf: "",
          }));
        } else {
          toast.error("CEP não encontrado.");
        }
      } catch (error) {
        console.error("Erro ao buscar CEP", error);
      }
    }
  };

  const validateField = (fieldName: string, value: string) => {
    const errorMsg = validatePersonField(fieldName as PersonField, value);
    setErrors((prev) => ({ ...prev, [fieldName]: errorMsg }));
    return errorMsg;
  };

  const handleDocumentBlur = () => {
    validateField("document", document);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const errorsList = {
      name: validateField("name", name),
      birthDate: validateField("birthDate", birthDate),
      document: validateField("document", document),
      email: validateField("email", email),
      phone: validateField("phone", phone),
      address: validateField("address", address),
      city: validateField("city", city),
      uf: validateField("uf", uf),
      cep: validateField("cep", cep),
      password: validateField("password", password),
    };

    if (Object.values(errorsList).some((err) => err !== "")) {
      toast.error("Por favor, corrija os erros no formulário antes de enviar.");
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
      toast.success(
        `Cadastro realizado com sucesso! Prossiga para o login e aproveite a plataforma.`,
      );

      navigate("/login");
    } catch (error) {
      if (error instanceof AxiosError && error.response?.data) {
        const data = error.response.data;
        if (data.document) {
          toast.error("Este documento já está cadastrado.");
          setErrors((prev) => ({ ...prev, document: "Este documento já está cadastrado." }));
          return;
        }

        if (data.email) {
          toast.error("Este e-mail já está em uso.");
          setErrors((prev) => ({ ...prev, email: "Este e-mail já está em uso." }));
          return;
        }
      }
      toast.error(
        "Ocorreu um problema com o cadastro. Tente novamente mais tarde.",
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
              <div className="w-16 h-16 bg-primary/10 text-primary dark:text-primary-bright rounded-2xl flex items-center justify-center mx-auto mb-5">
                <MaterialIcon icon="person_add" size={32} />
              </div>
              <h1 className="font-headline text-3xl font-bold text-primary dark:text-primary-bright">
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
            </div>

            <form className="space-y-5" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Nome Completo*
                </label>
                <input
                  type="text"
                  placeholder="João da Silva"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) validateField("name", e.target.value);
                  }}
                  onBlur={(e) => validateField("name", e.target.value)}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.name ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                />
                {errors.name && <p className="text-[11px] text-error font-medium mt-1">{errors.name}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Data de Nascimento*
                </label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => {
                    setBirthDate(e.target.value);
                    if (errors.birthDate) validateField("birthDate", e.target.value);
                  }}
                  onBlur={(e) => validateField("birthDate", e.target.value)}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.birthDate ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                  min="1900-01-01"
                  max={maxBirthDate()}
                />
                {errors.birthDate ? (
                  <p className="text-[11px] text-error font-medium mt-1">{errors.birthDate}</p>
                ) : (
                  <p className="text-[11px] text-outline font-medium">
                    É necessário ter 18 anos ou mais para se cadastrar.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  CPF / CNPJ*
                </label>
                <input
                  type="text"
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                  value={document}
                  ref={documentRef}
                  onChange={(e) => {
                    setDocument(maskDocument(e.target.value));
                    if (errors.document) validateField("document", e.target.value);
                  }}
                  onBlur={handleDocumentBlur}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.document ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                />
                {errors.document ? (
                  <p className="text-[11px] text-error font-medium mt-1">{errors.document}</p>
                ) : (
                  <p className="text-[11px] text-outline font-medium">
                    Requisito para formalização do contrato na plataforma.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  E-mail*
                </label>
                <input
                  type="email"
                  placeholder="contato@email.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) validateField("email", e.target.value);
                  }}
                  onBlur={(e) => validateField("email", e.target.value)}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.email ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                />
                {errors.email && <p className="text-[11px] text-error font-medium mt-1">{errors.email}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Telefone *
                </label>
                <input
                  type="tel"
                  placeholder="(00) 90000-0000"
                  value={phone}
                  onChange={(e) => {
                    setPhone(maskPhone(e.target.value));
                    if (errors.phone) validateField("phone", e.target.value);
                  }}
                  onBlur={(e) => validateField("phone", e.target.value)}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.phone ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                />
                {errors.phone && <p className="text-[11px] text-error font-medium mt-1">{errors.phone}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  CEP*
                </label>
                <input
                  type="text"
                  placeholder="00000-000"
                  value={cep}
                  onChange={(e) => {
                    const masked = maskCEP(e.target.value);
                    setCep(masked);
                    if (errors.cep) validateField("cep", masked);
                    handleCEPLookup(masked);
                  }}
                  onBlur={(e) => {
                    validateField("cep", e.target.value);
                    handleCEPLookup(e.target.value);
                  }}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.cep ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                />
                {errors.cep && <p className="text-[11px] text-error font-medium mt-1">{errors.cep}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Endereço*
                </label>
                <input
                  type="text"
                  placeholder="Rua, número, complemento"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    if (errors.address) validateField("address", e.target.value);
                  }}
                  onBlur={(e) => validateField("address", e.target.value)}
                  className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.address ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                  required
                />
                {errors.address && <p className="text-[11px] text-error font-medium mt-1">{errors.address}</p>}
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
                    onChange={(e) => {
                      setCity(e.target.value);
                      if (errors.city) validateField("city", e.target.value);
                    }}
                    onBlur={(e) => validateField("city", e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.city ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                    required
                  />
                  {errors.city && <p className="text-[11px] text-error font-medium mt-1">{errors.city}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                    Estado*
                  </label>
                  <select
                    value={uf}
                    onChange={(e) => {
                      setUf(e.target.value);
                      if (errors.uf) validateField("uf", e.target.value);
                    }}
                    onBlur={(e) => validateField("uf", e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.uf ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
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
                  {errors.uf && <p className="text-[11px] text-error font-medium mt-1">{errors.uf}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-outline">
                  Senha*
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errors.password) validateField("password", e.target.value);
                    }}
                    onBlur={(e) => validateField("password", e.target.value)}
                    className={`w-full bg-surface-container border rounded-lg px-4 py-3.5 pr-12 text-sm focus:ring-2 focus:outline-none text-on-surface transition-shadow ${errors.password ? "border-error focus:ring-error" : "border-transparent focus:ring-primary"}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary dark:hover:text-primary-bright transition-colors flex items-center justify-center p-1"
                  >
                    <MaterialIcon icon={showPassword ? "visibility_off" : "visibility"} size={20} />
                  </button>
                </div>
                {errors.password && <p className="text-[11px] text-error font-medium mt-1">{errors.password}</p>}
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
                className="font-bold text-primary dark:text-primary-bright hover:underline"
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
