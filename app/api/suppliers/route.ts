import { createParty, listParties } from "@/lib/party-api";

export async function GET(request: Request) {
  return listParties(request, "suppliers");
}

export async function POST(request: Request) {
  return createParty(request, "suppliers");
}
