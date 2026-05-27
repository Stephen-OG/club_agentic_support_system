import { VenueSupportChat } from "./venue-support-chat";

export default async function VenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <main className="qr-chat-page venue-support-page">
      <VenueSupportChat venueSlug={slug} />
    </main>
  );
}
