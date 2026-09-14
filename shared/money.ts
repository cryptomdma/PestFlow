export function dollarsToCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) {
    return null;
  }

  return Math.round(num * 100);
}

export function centsToDollars(cents: number | null | undefined): number {
  return (cents ?? 0) / 100;
}

export function formatCents(cents: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centsToDollars(cents));
}

/** "$50" for whole dollars, "$12.50" otherwise - for pills and chips where ".00" is noise. */
export function formatCentsCompact(cents: number | null | undefined): string {
  const value = cents ?? 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function centsToDollarString(cents: number | null | undefined): string {
  return centsToDollars(cents).toFixed(2);
}
