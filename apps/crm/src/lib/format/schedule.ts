const brisbaneTimeFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Brisbane",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatBrisbaneTime(value: string) {
  return brisbaneTimeFormatter.format(new Date(value)).toLowerCase();
}
