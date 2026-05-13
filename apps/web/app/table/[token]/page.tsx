import { getTableDisplay } from "@/lib/table-display";
import { TableChat } from "./table-chat";

export default async function TablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const table = getTableDisplay(token);

  return (
    <main className="page">
      <TableChat tableToken={table.tableToken} tableLabel={table.label} />
    </main>
  );
}
