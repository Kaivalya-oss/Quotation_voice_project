import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { inventory, vehicles } from "@/data/mockData";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({ meta: [{ title: "Inventory — QuoteSpeak" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Inventory" description="Manage physical stock across dealerships." />
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium">Vehicle ID</th>
                <th className="px-6 py-3 font-medium">Model</th>
                <th className="px-6 py-3 font-medium">VIN / Chassis</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {inventory.map(inv => {
                const vehicle = vehicles.find(v => v.id === inv.vehicleId);
                return (
                  <tr key={inv.id} className="hover:bg-muted/20">
                    <td className="px-6 py-4 font-medium">{inv.id}</td>
                    <td className="px-6 py-4">{vehicle?.brand} {vehicle?.model} ({vehicle?.color})</td>
                    <td className="px-6 py-4 font-mono">{inv.vin}</td>
                    <td className="px-6 py-4">
                      <Badge variant={inv.status === 'Available' ? 'default' : 'secondary'}>{inv.status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
