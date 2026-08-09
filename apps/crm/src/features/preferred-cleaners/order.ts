export function moveCleaner(
  cleanerIds: string[],
  cleanerId: string,
  direction: "up" | "down",
) {
  const currentIndex = cleanerIds.indexOf(cleanerId);
  const targetIndex = currentIndex + (direction === "up" ? -1 : 1);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= cleanerIds.length) {
    return cleanerIds;
  }

  const reordered = [...cleanerIds];
  [reordered[currentIndex], reordered[targetIndex]] = [
    reordered[targetIndex],
    reordered[currentIndex],
  ];
  return reordered;
}

export function removeCleaner(cleanerIds: string[], cleanerId: string) {
  return cleanerIds.filter((id) => id !== cleanerId);
}
