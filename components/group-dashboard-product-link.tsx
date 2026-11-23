"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = { businessUnitId: string; productId: string; productName: string };

export function GroupDashboardProductLink({ businessUnitId, productId, productName }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openProduct() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/business-units/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessUnitId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to open this business unit.");
      router.push(`/inventory/products/${productId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open this product.");
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button type="button" onClick={() => void openProduct()} disabled={loading}
        className="text-left font-medium text-emerald-900 hover:underline disabled:opacity-60"
        aria-busy={loading}>
        {loading ? "Opening…" : productName}
      </button>
      {error && <span role="alert" className="mt-1 text-xs text-red-700">{error}</span>}
    </span>
  );
}
