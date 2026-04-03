"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PaymentReceivedToggleProps {
  orderId: string;
  paymentStatus: string;
}

export default function PaymentReceivedToggle({ orderId, paymentStatus }: PaymentReceivedToggleProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const isChecked = paymentStatus === "PAID";

  const handleToggle = async () => {
    const nextStatus = isChecked ? "UNPAID" : "PAID";

    setIsSaving(true);
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paymentStatus: nextStatus }),
      });

      if (!response.ok) {
        throw new Error("Тооцоо орсон төлөв хадгалах үед алдаа гарлаа");
      }

      router.refresh();
    } catch {
      // Keep this silent to avoid noisy UI in the summary row.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <label className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium ${isChecked ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"}`}>
      <input
        type="checkbox"
        checked={isChecked}
        disabled={isSaving}
        onChange={handleToggle}
        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
      />
      <span>{isSaving ? "Хадгалж байна..." : "Тооцоо орсон"}</span>
    </label>
  );
}