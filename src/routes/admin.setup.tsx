import { createFileRoute } from "@tanstack/react-router";
import SiteSetup from "@/components/admin/SiteSetup";
export const Route = createFileRoute("/admin/setup")({ component: SiteSetup });
