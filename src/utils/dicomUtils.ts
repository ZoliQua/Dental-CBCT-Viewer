export function formatDicomDate(dateStr: string): string {
  if (!dateStr) return '';
  // Already delimited (ISO "YYYY-MM-DD" or "YYYY.MM.DD") → normalize separators
  const iso = dateStr.match(/^(\d{4})[-.](\d{2})[-.](\d{2})/);
  if (iso) return `${iso[1]}.${iso[2]}.${iso[3]}`;
  // DICOM "YYYYMMDD"
  if (dateStr.length < 8) return dateStr;
  return `${dateStr.slice(0, 4)}.${dateStr.slice(4, 6)}.${dateStr.slice(6, 8)}`;
}

export function formatDicomName(name: string): string {
  return name.replace(/\^/g, ' ').trim();
}
