import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import MaterialIcon from "@/components/MaterialIcon";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import heroBg from "@/assets/hero-bg.jpg";
import machine1 from "@/assets/machine-1.jpg";
import machine2 from "@/assets/machine-2.jpg";
import machine3 from "@/assets/machine-3.jpg";

const featuredListings = [
  { id: 1, image: machine1, title: "Colheitadeira JD S700", location: "Sorriso, MT", price: "R$ 480", activity: "Colheita", hours: "2.450 h", rating: 4.8 },
  { id: 2, image: machine2, title: "Trator Valtra BH194", location: "Lucas do Rio Verde, MT", price: "R$ 320", activity: "Preparo de Solo", hours: "1.800 h", rating: 4.5 },
  { id: 3, image: machine3, title: "Pulverizador Jacto", location: "Rondonópolis, MT", price: "R$ 250", activity: "Pulverização", hours: "950 h", rating: 4.9 },
];

const steps = {
  locatario: [
    { icon: "search", title: "Busque Máquinas", desc: "Filtre por safra, atividade e localização" },
    { icon: "task_alt", title: "Reserve e Assine", desc: "Solicite reserva e assine contrato digital" },
    { icon: "check_circle", title: "Acompanhe", desc: "Monitore a locação e avalie ao encerrar" },
  ],
  locador: [
    { icon: "agriculture", title: "Cadastre Equipamento", desc: "Registre com número Renagro" },
    { icon: "campaign", title: "Publique Anúncio", desc: "Fotos, preço e disponibilidade" },
    { icon: "account_balance_wallet", title: "Receba Pagamento", desc: "Assine contrato e monetize sua frota" },
  ],
};

const reviews = [
  { name: "Marcos Souza", initials: "MS", role: "Produtor · Sorriso, MT", rating: 5, comment: "Estava sem colheitadeira na semana mais crítica da safra. Em 2 horas encontrei um equipamento a 18 km e assinei o contrato pelo celular." },
  { name: "José Oliveira", initials: "JO", role: "Locador · Lucas do Rio Verde, MT", rating: 5, comment: "Minha colheitadeira ficava 4 meses parada por ano. Hoje ela trabalha para outros produtores e já pagou a manutenção da temporada." },
  { name: "Ana Cavalcanti", initials: "AC", role: "Produtora · Rondonópolis, MT", rating: 5, comment: "O contrato com cláusulas específicas para o agronegócio é o que me convenceu. Qualquer problema resolvido dentro da plataforma." },
];

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <header className="relative pt-32 pb-24 overflow-hidden min-h-[716px] flex items-center">
        <div className="absolute inset-0 z-0">
          <img src={heroBg} alt="Campo agrícola ao pôr do sol" className="w-full h-full object-cover opacity-20 grayscale-[0.5]" width={1920} height={1080} />
          <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
        </div>
        <div className="max-w-[1200px] mx-auto px-6 relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="font-headline text-[clamp(36px,5vw,64px)] font-black text-primary leading-[1.1] tracking-tighter mb-6 max-w-3xl"
          >
            Alugue maquinário agrícola perto de você
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-xl leading-[1.3] text-tertiary max-w-2xl font-medium mb-10"
          >
            Conectamos produtores rurais e proprietários de máquinas com precisão e confiança.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="flex flex-wrap gap-4"
          >
            <Link to="/buscar" className="bg-primary text-on-primary px-8 py-4 rounded-lg font-bold text-lg hover:bg-primary-container transition-all shadow-lg hover:shadow-xl inline-flex items-center gap-2">
              <MaterialIcon icon="search" size={20} /> Buscar Máquinas
            </Link>
            <Link to="/cadastro" className="bg-secondary-container text-on-secondary-container px-8 py-4 rounded-lg font-bold text-lg hover:brightness-95 transition-all">
              Anuncie sua Frota
            </Link>
          </motion.div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 space-y-24 pb-32">

        {/* Busca rápida */}
        <section className="-mt-16 relative z-20">
          <div className="bg-surface-container-lowest rounded-2xl shadow-xl px-10 py-10 border border-outline-variant/50">
            <h2 className="font-headline text-lg font-bold text-primary mb-8">Encontre o equipamento ideal para a sua safra</h2>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-[3] space-y-1.5">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Busca</label>
                <input type="text" placeholder="Ex: Trator, Colheitadeira, Pulverizador..." className="w-full bg-surface-container border-none rounded-lg px-4 py-3 text-on-surface text-sm focus:ring-2 focus:ring-primary transition-shadow" />
              </div>
              <div className="flex-[2] space-y-1.5">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Localização</label>
                <input type="text" placeholder="Ex: Sorriso, MT" className="w-full bg-surface-container border-none rounded-lg px-4 py-3 text-on-surface text-sm focus:ring-2 focus:ring-primary transition-shadow" />
              </div>
            </div>
            <div className="flex flex-col md:flex-row items-end gap-4 mt-2">
              <div className="flex-[2] space-y-1.5 w-full">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Atividade Agrícola</label>
                <select className="w-full bg-surface-container border-none rounded-lg px-4 py-3 text-on-surface text-sm focus:ring-2 focus:ring-primary transition-shadow">
                  <option>Todas</option><option>Plantio</option><option>Pulverização</option><option>Colheita</option><option>Preparo de Solo</option>
                </select>
              </div>
              <div className="flex-1 space-y-1.5 w-full">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Data Início</label>
                <input type="date" className="w-full bg-surface-container border-none rounded-lg px-4 py-3 text-on-surface text-sm focus:ring-2 focus:ring-primary transition-shadow" />
              </div>
              <div className="flex-1 space-y-1.5 w-full">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Data Fim</label>
                <input type="date" className="w-full bg-surface-container border-none rounded-lg px-4 py-3 text-on-surface text-sm focus:ring-2 focus:ring-primary transition-shadow" />
              </div>
              <Link to="/buscar" className="bg-gradient-to-r from-primary to-primary-container text-on-primary px-8 py-3 rounded-lg font-bold text-sm hover:shadow-lg transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0">
                <MaterialIcon icon="search" size={18} /> Buscar
              </Link>
            </div>
          </div>
        </section>

        {/* Anúncios em destaque */}
        <section>
          <p className="text-xs font-bold text-tertiary uppercase tracking-widest mb-3">Em destaque esta semana</p>
          <h2 className="font-headline text-4xl font-bold text-primary mb-2">Maquinário disponível agora</h2>
          <div className="h-1 w-24 bg-secondary-container mb-10" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {featuredListings.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
                className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl overflow-hidden group shadow-sm hover:shadow-xl transition-all duration-300"
              >
                <div className="h-56 relative overflow-hidden bg-surface-container-high">
                  <img src={item.image} alt={item.title} loading="lazy" width={800} height={600} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute top-4 right-4 bg-primary text-on-primary text-[10px] font-bold px-3 py-1.5 rounded uppercase tracking-widest shadow-lg">
                    Safra 2026
                  </div>
                  <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg flex items-center gap-2 border border-outline-variant/20 shadow-sm">
                    <MaterialIcon icon="verified_user" className="text-primary" size={16} />
                    <span className="text-xs font-bold text-tertiary">Operador com NR-31</span>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-headline text-xl font-bold text-primary leading-tight">{item.title}</h4>
                      <div className="flex items-center bg-secondary-container/10 px-2 py-0.5 rounded">
                        <MaterialIcon icon="star" filled className="text-secondary-container" size={14} />
                        <span className="text-xs font-bold text-on-secondary-container ml-1">{item.rating}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-on-surface-variant font-medium text-sm">
                      <MaterialIcon icon="location_on" size={16} /> {item.location}
                    </div>
                  </div>
                    <div className="flex gap-4 border-t border-b border-outline-variant/20 py-3">
                    <div className="flex-1">
                      <div className="text-[10px] uppercase font-bold text-outline tracking-wider">Atividade</div>
                      <div className="text-sm font-bold text-tertiary mt-0.5">{item.activity}</div>
                    </div>
                    <div className="flex-1 border-l border-outline-variant/20 pl-4">
                      <div className="text-[10px] uppercase font-bold text-outline tracking-wider">Horas de Uso</div>
                      <div className="text-sm font-bold text-tertiary mt-0.5">{item.hours}</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <span className="text-xs text-on-surface-variant font-bold uppercase tracking-wider block mb-1">Custo</span>
                      <div className="text-2xl font-black text-primary leading-none">{item.price}<span className="text-sm font-bold text-tertiary">/hora</span></div>
                    </div>
                    <Link to="/buscar" className="bg-primary text-on-primary px-5 py-2.5 rounded-lg font-bold text-sm shadow hover:bg-primary/90 transition-colors">
                      Reservar
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Como funciona */}
        <section>
          <h2 className="font-headline text-4xl font-bold text-primary mb-2">Como Funciona</h2>
          <div className="h-1 w-24 bg-secondary-container mb-10" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {(["locatario", "locador"] as const).map((role) => (
              <div key={role}>
                <h3 className="font-headline text-2xl font-bold text-tertiary mb-6">
                  {role === "locatario" ? "Para o Locatário" : "Para o Locador"}
                </h3>
                <div className="space-y-6">
                  {steps[role].map((s, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: role === "locatario" ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.15 }} className="flex items-start gap-4">
                      <div className={`w-12 h-12 ${role === "locatario" ? "bg-primary/10" : "bg-secondary-container/20"} rounded-xl flex items-center justify-center shrink-0`}>
                        <MaterialIcon icon={s.icon} className="text-primary" size={24} />
                      </div>
                      <div>
                        <h4 className="font-headline font-bold text-primary text-lg">{s.title}</h4>
                        <p className="text-on-surface-variant text-sm">{s.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Por que formalizar */}
        <section className="bg-surface-container-low rounded-3xl p-12">
          <h2 className="font-headline text-4xl font-bold text-primary mb-2">Por que utilizar a Frota Rural?</h2>
          <div className="h-1 w-24 bg-secondary-container mb-10" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: "tag", title: "Renagro Verificado", desc: "Identificação nacional do maquinário agrícola" },
              { icon: "description", title: "Contrato Formal", desc: "Cláusulas específicas do agronegócio" },
              { icon: "credit_card", title: "Pagamento Seguro", desc: "Sem negociações externas" },
              { icon: "verified_user", title: "Operador Validado", desc: "Credenciais e NR-31 verificados" },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/20"
              >
                <div className="mb-4"><MaterialIcon icon={item.icon} className="text-primary" size={32} /></div>
                <h4 className="font-headline font-bold text-primary text-lg mb-2">{item.title}</h4>
                <p className="text-on-surface-variant text-sm">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Avaliações */}
        <section className="bg-surface-container-low rounded-3xl p-12">
          <p className="text-xs font-bold text-tertiary uppercase tracking-widest text-center mb-3">Quem já usa, recomenda</p>
          <h2 className="font-headline text-4xl font-bold text-primary mb-10 text-center">O campo já está colhendo resultados</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {reviews.map((r, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant/20"
              >
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: r.rating }).map((_, j) => (
                    <MaterialIcon key={j} icon="star" filled className="text-secondary-container" size={18} />
                  ))}
                </div>
                <p className="text-on-surface text-sm mb-6 leading-relaxed">"{r.comment}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary-container/30 flex items-center justify-center text-sm font-bold text-tertiary">
                    {r.initials}
                  </div>
                  <div>
                    <div className="font-bold text-on-surface text-sm">{r.name}</div>
                    <div className="text-xs text-on-surface-variant">{r.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA Locador */}
        <section className="bg-primary rounded-3xl p-12 text-center">
          <h2 className="font-headline text-4xl font-bold text-on-primary mb-4">O maquinário certo, no campo, na hora certa.</h2>
          <p className="text-on-primary/70 text-lg max-w-xl mx-auto mb-8">
            Cadastre-se e comece a conectar sua fazenda com os melhores equipamentos disponíveis. Segurança e formalização garantidas.
          </p>
          <Link to="/cadastro" className="inline-block bg-secondary-container text-on-secondary-container px-10 py-4 rounded-lg font-bold text-lg hover:brightness-95 transition-all">
            Criar conta
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
