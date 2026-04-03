"use client";

import { useState, useEffect } from "react";
import Header from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Plus, Truck, Users, MapPin, Clock } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface DeliveryZone {
  id: string;
  name: string;
  fee: number;
  isActive: boolean;
}

interface DeliveryAgent {
  id: string;
  user: { name: string; phone: string };
  vehicleType: string | null;
  vehiclePlate: string | null;
  isAvailable: boolean;
}

interface DeliveryAssignment {
  id: string;
  order: { orderNumber: string; customer: { name: string } };
  agent: { user: { name: string } };
  status: string;
}

export default function DeliveryPage() {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [agents, setAgents] = useState<DeliveryAgent[]>([]);
  const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/delivery/zones").then((r) => r.json()),
      fetch("/api/delivery/drivers").then((r) => r.json()),
      fetch("/api/delivery/assignments").then((r) => r.json()),
    ])
      .then(([z, a, d]) => {
        setZones(z.data ?? []);
        setAgents(a.data ?? []);
        setAssignments(d.data ?? []);
      })
      .catch(() => toast.error("Өгөгдөл уншихад алдаа гарлаа"))
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div>
      <Header title="Хүргэлт" />

      <div className="p-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: <MapPin className="w-5 h-5" />, title: "Нийт бүс", value: zones.length, color: "blue" },
            { icon: <Truck className="w-5 h-5" />, title: "Идэвхтэй жолооч", value: agents.filter((a) => a.isAvailable).length, color: "orange" },
            { icon: <Clock className="w-5 h-5" />, title: "Хүлээгдэж байгаа", value: assignments.filter((a) => a.status === "ASSIGNED").length, color: "purple" },
          ].map((item, idx) => (
            <Card key={idx} className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${item.color === "blue" ? "bg-blue-100" : item.color === "orange" ? "bg-orange-100" : "bg-purple-100"}`}>
                <span className={item.color === "blue" ? "text-blue-600" : item.color === "orange" ? "text-orange-600" : "text-purple-600"}>{item.icon}</span>
              </div>
              <div>
                <p className="text-xs text-slate-400">{item.title}</p>
                <p className="text-2xl font-bold text-slate-800">{item.value}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Zones */}
        <Card>
          <div className="flex items-center justify-between mb-5">
            <CardTitle>Хүргэлтийн бүс</CardTitle>
            <Button variant="outline" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>
              Нэмэх
            </Button>
          </div>
          <div className="space-y-2">
            {zones.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Хүргэлтийн бүс байхгүй</p>
            ) : (
              zones.map((zone) => (
                <div key={zone.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <p className="font-medium text-slate-800">{zone.name}</p>
                    <p className="text-xs text-slate-400">Хүргэлт: {formatPrice(zone.fee)}</p>
                  </div>
                  <Badge variant={zone.isActive ? "success" : "default"}>
                    {zone.isActive ? "Идэвхтэй" : "Идэвхгүй"}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Drivers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Жолоочид ({agents.length})
            </CardTitle>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {agents.length === 0 ? (
              <p className="col-span-full text-sm text-slate-400 text-center py-8">Жолооч байхгүй</p>
            ) : (
              agents.map((agent) => (
                <div key={agent.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-slate-800">{agent.user.name}</p>
                      <p className="text-xs text-slate-400">{agent.user.phone}</p>
                    </div>
                    <Badge variant={agent.isAvailable ? "success" : "default"}>
                      {agent.isAvailable ? "Байна" : "Бүрэлхэн"}
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-500 space-y-1">
                    {agent.vehicleType && <p>🚗 {agent.vehicleType} ({agent.vehiclePlate})</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent assignments */}
        <Card>
          <CardHeader>
            <CardTitle>Сүүлийн хуваарилалтууд</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left p-3 text-xs font-semibold text-slate-400">Захиалга</th>
                  <th className="text-left p-3 text-xs font-semibold text-slate-400">Харилцагч</th>
                  <th className="text-left p-3 text-xs font-semibold text-slate-400">Жолооч</th>
                  <th className="text-left p-3 text-xs font-semibold text-slate-400">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {assignments.slice(0, 5).map((a) => (
                  <tr key={a.id}>
                    <td className="p-3 font-medium text-blue-600">{a.order.orderNumber}</td>
                    <td className="p-3">{a.order.customer.name}</td>
                    <td className="p-3">{a.agent.user.name}</td>
                    <td className="p-3">
                      <Badge variant={a.status === "ASSIGNED" ? "warning" : "success"}>
                        {a.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
