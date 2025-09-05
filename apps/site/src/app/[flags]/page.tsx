import Link from "next/link";
import { areWeLive, rootFlags } from "@/lib/flags";

export default async function Page({
  params,
}: {
  params: Promise<{ flags: string }>;
}) {
  const { flags } = await params;
  let live = false;
  try {
    live = await areWeLive(flags, rootFlags);
  } catch {
    live = false;
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-white">
      <h1 className="text-4xl font-bold mb-4 text-center">uvacompute</h1>
      <p className="text-lg text-gray-600 text-center">
        your friendly local supercomputing company
      </p>
      {live ? (
        <Link
          href="./(protected)/login"
          className="mt-8 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
        >
          Log in
        </Link>
      ) : null}
    </main>
  );
}
