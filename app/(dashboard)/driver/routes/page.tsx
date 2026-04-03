import Header from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";

export default function DriverRoutesPage() {
  return (
    <div>
      <Header title="Маршрут" />

      <div className="p-5">
        <Card className="text-center py-16">
          <h3 className="text-lg font-semibold text-slate-800 mb-2">
            Маршрутын оновчлол
          </h3>
          <p className="text-slate-500">
            Энд байршлын дээр суурилуулан маршрутыг оновчлох систем байх болно.
          </p>
        </Card>
      </div>
    </div>
  );
}
