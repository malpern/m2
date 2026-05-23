import Link from "next/link";
import { ClientForm } from "../client-form";
import { createClient } from "../actions";

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <Link
        href="/clients"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
      >
        &larr; Back to Clients
      </Link>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Add Client</h1>
      <ClientForm action={createClient} submitLabel="Add Client" />
    </div>
  );
}
