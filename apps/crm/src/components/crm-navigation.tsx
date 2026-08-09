import Link from "next/link";

const destinations = [
  ["Roster", "/roster"],
  ["Jobs", "/jobs"],
  ["Clients", "/clients"],
  ["Pool", "/pool"],
  ["Money", "/money"],
] as const;

export function CrmNavigation() {
  return (
    <nav aria-label="Primary navigation" className="primary-navigation">
      {destinations.map(([label, href]) => (
        <Link href={href} key={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
