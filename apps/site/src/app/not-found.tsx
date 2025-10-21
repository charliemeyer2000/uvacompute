import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-8 font-mono">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-6xl font-normal mb-4 leading-tight">404</h1>
        <h2 className="text-xl font-semibold mb-4 text-black">
          page not found
        </h2>
        <p className="mb-8 text-base leading-relaxed text-gray-600">
          the page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/">go home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
