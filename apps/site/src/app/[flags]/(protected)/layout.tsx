import { redirect } from "next/navigation";
import { areWeLive, rootFlags } from "@/lib/flags";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ flags: string }>;
}) {
  const { flags } = await params;
  const live = await areWeLive(flags, rootFlags);
  if (!live) redirect("/");
  return children;
}
