import type { ClientWithSites } from "./types";

export function filterClients(clients: ClientWithSites[], searchTerm: string) {
  const query = searchTerm.trim().toLocaleLowerCase("en-AU");
  if (!query) return clients;

  return clients.flatMap((client) => {
    if (client.name.toLocaleLowerCase("en-AU").includes(query)) return [client];

    const matchingSites = client.sites.filter((site) =>
      site.name.toLocaleLowerCase("en-AU").includes(query),
    );
    return matchingSites.length ? [{ ...client, sites: matchingSites }] : [];
  });
}
