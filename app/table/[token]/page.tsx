import { TableChat } from "./table-chat";

export default async function TablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tableLabel = token
    .replace("demo-", "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <main className="page">
      <TableChat tableToken={token} tableLabel={tableLabel} />
    </main>
  );
}
