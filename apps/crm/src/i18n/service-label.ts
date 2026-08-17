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

type KnownServiceKey = (typeof knownServiceKeys)[number];

function isKnownServiceKey(value: string): value is KnownServiceKey {
  return knownServiceKeys.some((key) => key === value);
}

export function getServiceLabel(
  service: ServiceRecord,
  translate: (key: KnownServiceKey) => string,
) {
  if (service.slug && isKnownServiceKey(service.slug)) {
    return translate(service.slug);
  }
  return service.name;
}
