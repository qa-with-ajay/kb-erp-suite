const TZ = "Asia/Kolkata"; // fixed so server and client render identical text (no hydration mismatch)

export const money = (value: number, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value);

export const fmtDate = (iso: string, withTime = false) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: TZ,
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  }).format(d);
};

export const methodLabel = (m: string) =>
  m.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
