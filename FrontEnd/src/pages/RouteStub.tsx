import { Link } from "react-router";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function RouteStub({ title }: { title: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-20 px-6 max-w-[1200px] mx-auto w-full">
        <h1 className="font-headline text-2xl font-bold text-primary mb-4">{title}</h1>
        <p className="text-on-surface-variant text-sm mb-6">Esta página será implementada em breve.</p>
        <Link to="/" className="text-sm font-bold text-primary hover:underline">
          Voltar ao início
        </Link>
      </main>
      <Footer />
    </div>
  );
}
