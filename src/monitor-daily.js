const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value) {
  if (!DATE_RE.test(String(value || ""))) return false;
  const parts = value.split("-").map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
}

export function normalizeDailyRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const date = validDate(record.date) ? record.date : null;
  if (record.calendar_basis !== "utc_calendar_day" || !date) {
    return {
      ok: true,
      available: false,
      reason: record.reason === "no_data" ? "no_data" : "daily_boundary_unverified",
      date,
      calendar_basis: "unknown",
      day_start_utc: null,
      day_end_utc_exclusive: null,
      health: null,
      tps: null,
      gas: null,
      wld: null,
    };
  }
  const parts = date.split("-").map(Number);
  const start = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { ...record, available: true, day_start_utc: start.toISOString(), day_end_utc_exclusive: end.toISOString() };
}
