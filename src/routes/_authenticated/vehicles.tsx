import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { vehicles } from "@/data/mockData";

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => ({ meta: [{ title: "Vehicles — QuoteSpeak" }] }),
  component: VehiclesPage,
});

function VehiclesPage() {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader title="Vehicles Catalogue" description="Browse available models and pricing." />
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {vehicles.map(v => (
          <Card key={v.id} className="overflow-hidden hover-lift">
            <div className="h-40 bg-muted flex items-center justify-center text-muted-foreground">
              [Image: {v.brand} {v.model}]
            </div>
            <CardContent className="p-4">
              <h3 className="font-semibold text-lg">{v.brand} {v.model}</h3>
              <p className="text-sm text-muted-foreground mb-3">{v.variant} · {v.color}</p>
              <div className="flex justify-between items-center font-medium">
                <span className="text-muted-foreground text-sm">Ex-Showroom</span>
                <span>₹{v.exShowroomPrice.toLocaleString('en-IN')}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
