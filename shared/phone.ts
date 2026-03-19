export function normalizePhone(value: string | null | undefined): string | null {
  if (!value) return null;

  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 11 && digits.startsWith("1")) {
    return digits;
  }

  if (digits.length === 10) {
    return digits;
  }

  return digits;
}

export function formatPhoneDisplay(value: string | null | undefined): string {
  if (!value) return "";

  const digits = normalizePhone(value) || value;

  if (/^\d{10}$/.test(digits)) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (/^1\d{10}$/.test(digits)) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (/^\d{7}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return value;
}

export function formatPhoneHref(value: string | null | undefined): string | null {
  const normalized = normalizePhone(value);
  if (!normalized) return null;

  if (normalized.length === 11 && normalized.startsWith("1")) {
    return `tel:+${normalized}`;
  }

  if (normalized.length === 10) {
    return `tel:+1${normalized}`;
  }

  return `tel:${normalized}`;
}
