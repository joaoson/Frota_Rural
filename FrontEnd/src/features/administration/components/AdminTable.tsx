import MaterialIcon from "@/components/MaterialIcon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AdminColumn {
  label: string;
  align?: "left" | "right";
}

interface AdminTableProps {
  columns: AdminColumn[];
  children: React.ReactNode;
}

export function AdminTable({ columns, children }: AdminTableProps) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-container-low">
            {columns.map((column) => (
              <TableHead
                key={column.label}
                className={`px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-outline${
                  column.align === "right" ? " text-right" : ""
                }`}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

export function AdminTableMessage({
  colSpan,
  icon,
  children,
}: {
  colSpan: number;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-on-surface-variant">
        {icon && <MaterialIcon icon={icon} size={20} className="text-outline mr-2" />}
        {children}
      </TableCell>
    </TableRow>
  );
}
