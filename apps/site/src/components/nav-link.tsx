import Link from "next/link";

export function NavLink({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`relative py-2 text-sm transition-colors ${
        isActive ? "text-black" : "text-gray-500 hover:text-black"
      }`}
    >
      {children}
      {isActive && (
        <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange-accent" />
      )}
    </Link>
  );
}
