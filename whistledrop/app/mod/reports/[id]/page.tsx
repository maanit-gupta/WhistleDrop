import type { Metadata } from "next";
import { ReportDetailView } from "./ReportDetailView";

export const metadata: Metadata = { title: "Report" };

export default async function ModReportPage({ params }: PageProps<"/mod/reports/[id]">) {
  const { id } = await params;
  return <ReportDetailView id={id} />;
}
