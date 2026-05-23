import { db } from "@/db";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ClientForm } from "../../client-form";
import { updateClient } from "../../actions";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (isNaN(clientId)) notFound();

  const client = db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) notFound();

  const boundAction = updateClient.bind(null, clientId);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link
        href={`/clients/${clientId}`}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
      >
        &larr; Back to {client.name}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Edit {client.name}</h1>
      <ClientForm client={client} action={boundAction} submitLabel="Save Changes" />
    </div>
  );
}
