import { updateParty } from "@/lib/party-api";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return updateParty(request, "suppliers", id);
}
