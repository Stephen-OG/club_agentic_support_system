import { QrChat } from "./qr-chat";

export default async function QrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return (
    <main className="qr-chat-page">
      <QrChat qrToken={token} />
    </main>
  );
}
