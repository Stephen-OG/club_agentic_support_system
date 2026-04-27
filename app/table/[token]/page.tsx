import { TableChat } from "./table-chat";

export default function TablePage({ params }: { params: { token: string } }) {
  const tableLabel = params.token
    .replace("demo-", "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <main className="page">
      <TableChat tableToken={params.token} tableLabel={tableLabel} />
    </main>
  );
}
