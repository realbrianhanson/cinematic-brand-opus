import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import ConversionDashboard from "@/components/admin/ConversionDashboard";
import { conversionSearch } from "@/lib/conversions";

export const Route = createFileRoute("/admin/conversions")({
  validateSearch: conversionSearch,
  search: { middlewares: [stripSearchParams({ days: 30 })] },
  component: ConversionsRoute,
});

function ConversionsRoute() {
  const { days } = Route.useSearch();
  return <ConversionDashboard days={days} />;
}
