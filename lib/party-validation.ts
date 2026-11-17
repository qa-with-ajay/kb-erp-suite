import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const partyFields = {
  name: z.string().trim().min(1).max(120),
  phone: optionalText(30),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  gstin: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/).optional().or(z.literal("")),
  addressLine1: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  pincode: optionalText(12),
};

export const partyCreateSchema = z.object(partyFields);

export const partyPatchSchema = z.object({
  name: partyFields.name.optional(),
  phone: partyFields.phone.optional(),
  email: partyFields.email.optional(),
  gstin: partyFields.gstin.optional(),
  addressLine1: partyFields.addressLine1.optional(),
  city: partyFields.city.optional(),
  state: partyFields.state.optional(),
  pincode: partyFields.pincode.optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const partyListSchema = z.object({
  search: z.string().trim().max(100).default(""),
  active: z.enum(["all", "true", "false"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function parsePartyList(searchParams: URLSearchParams) {
  return partyListSchema.safeParse({
    search: searchParams.get("search") ?? "",
    active: searchParams.get("active") ?? "all",
    page: searchParams.get("page") ?? "1",
    pageSize: searchParams.get("pageSize") ?? "20",
  });
}
