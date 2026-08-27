const MOBILE_HIDDEN_CLASSES = /class="[^"]*\bhidden\b[^"]*\bmd:table-cell\b[^"]*"/;

function hiddenBelowMd(openingTag: string): boolean {
  return MOBILE_HIDDEN_CLASSES.test(openingTag);
}

function headerCells(markup: string): { openingTag: string; label: string }[] {
  return [...markup.matchAll(/(<th(?:\s[^>]*)?>)([^<]*)/g)].map((match) => ({
    openingTag: match[1] ?? "",
    label: (match[2] ?? "").trim(),
  }));
}

function firstBodyRow(markup: string): string {
  return markup.match(/<tbody><tr[^>]*>(.*?)<\/tr>/s)?.[1] ?? "";
}

export function tbodyRows(markup: string): string[] {
  const body = markup.match(/<tbody>([\s\S]*)<\/tbody>/)?.[1] ?? "";
  return body.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
}

export function hrefsIn(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
}

export function headersHiddenBelowMd(markup: string): string[] {
  return headerCells(markup)
    .filter((cell) => hiddenBelowMd(cell.openingTag))
    .map((cell) => cell.label);
}

export function headersShownBelowMd(markup: string): string[] {
  return headerCells(markup)
    .filter((cell) => !hiddenBelowMd(cell.openingTag))
    .map((cell) => cell.label);
}

export function bodyCellsHiddenBelowMd(markup: string): boolean[] {
  return [...firstBodyRow(markup).matchAll(/<td[^>]*>/g)].map((match) =>
    hiddenBelowMd(match[0]),
  );
}
