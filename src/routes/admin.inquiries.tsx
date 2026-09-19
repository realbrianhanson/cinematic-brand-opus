import { createFileRoute } from "@tanstack/react-router";
import SpeakingInquiries from "@/components/admin/SpeakingInquiries";

export const Route = createFileRoute("/admin/inquiries")({
  component: SpeakingInquiries,
});
