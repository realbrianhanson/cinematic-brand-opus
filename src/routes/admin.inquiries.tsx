import { createFileRoute } from "@tanstack/react-router";
import { adminHead } from "@/lib/adminHead";
import SpeakingInquiries from "@/components/admin/SpeakingInquiries";

export const Route = createFileRoute("/admin/inquiries")({
  head: adminHead("Speaking inquiries"),
  component: SpeakingInquiries,
});
