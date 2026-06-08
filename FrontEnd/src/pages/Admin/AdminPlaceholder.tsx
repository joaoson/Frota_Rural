import MaterialIcon from "@/components/MaterialIcon";

const AdminPlaceholder = ({ title }: { title: string }) => (
  <>
    <header className="h-16 border-b border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-md flex items-center px-8 sticky top-0 z-10">
      <h1 className="font-headline font-black text-lg text-on-surface tracking-tight">
        {title}
      </h1>
    </header>
    <div className="p-8 max-w-[1200px]">
      <div className="bg-surface-container-low rounded-2xl border border-outline-variant/30 p-10 text-center">
        <MaterialIcon icon="construction" size={32} className="text-outline" />
        <h2 className="font-headline font-bold text-on-surface text-lg mt-3">
          Em breve
        </h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Esta seção ainda não foi implementada.
        </p>
      </div>
    </div>
  </>
);

export default AdminPlaceholder;
