import { redirect } from "next/navigation";

export default function LegacyGroupFinancialDashboardPage() {
  redirect("/financial?scope=group");
}
