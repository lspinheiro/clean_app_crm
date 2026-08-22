type ServiceRecord = {
  name: string;
  slug?: string | null;
};

const knownServiceKeys = [
  "office-clean",
  "standard-clean",
  "deep-clean",
  "end-of-lease-clean",
] as const;

export type KnownServiceKey = (typeof knownServiceKeys)[number];

function isKnownServiceKey(value: string): value is KnownServiceKey {
  return knownServiceKeys.some((key) => key === value);
}

export function getServiceLabel(
  service: ServiceRecord,
  translate: (key: KnownServiceKey) => string,
) {
  return service.slug && isKnownServiceKey(service.slug) ? translate(service.slug) : service.name;
}
