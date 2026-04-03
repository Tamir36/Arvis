"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import { mn } from "@/locales/mn";
import toast from "react-hot-toast";

const ORDER_STATUSES = [
  { value: "PENDING", label: "Хүлээгдэж байна" },
  { value: "CONFIRMED", label: "Баталгаажсан" },
  { value: "PACKED", label: "Савласан" },
  { value: "SHIPPED", label: "Илгээсэн" },
  { value: "DELIVERED", label: "Хүргэсэн" },
  { value: "CANCELLED", label: "Цуцлагдсан" },
  { value: "RETURNED", label: "Хойшлуулсан" },
];

const PAYMENT_STATUSES = [
  { value: "UNPAID", label: "Төлөөгүй" },
  { value: "PAID", label: "Төлсөн" },
  { value: "PARTIAL", label: "Хэсэгчлэн" },
  { value: "REFUNDED", label: "Буцаан олгосон" },
];

interface OrderActionsProps {
  order: {
    id: string;
    status: string;
    paymentStatus: string;
  };
}

export default function OrderActions({ order }: OrderActionsProps) {
  const router = useRouter();
  const [status, setStatus] = useState(order.status);
  const [paymentStatus, setPaymentStatus] = useState(order.paymentStatus);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, paymentStatus }),
      });
      if (!res.ok) throw new Error("Алдаа гарлаа");
      toast.success("Захиалга шинэчлэгдлээ");
      router.refresh();
    } catch {
      toast.error("Шинэчлэхэд алдаа гарлаа");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Захиалга удирдах</CardTitle>
      </CardHeader>
      <div className="space-y-4">
        <Select
          label="Захиалгын статус"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={ORDER_STATUSES}
        />
        <Select
          label="Төлбөрийн статус"
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value)}
          options={PAYMENT_STATUSES}
        />
        <Button
          className="w-full"
          isLoading={isSaving}
          onClick={handleSave}
        >
          Хадгалах
        </Button>
      </div>
    </Card>
  );
}
