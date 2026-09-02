const ARXIV_HOSTS = new Set(["arxiv.org", "www.arxiv.org"]);

export function normalizePdfUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;

  if (ARXIV_HOSTS.has(url.hostname)) {
    const match = url.pathname.match(
      /^\/(abs|pdf)\/(.+?)(?:\.pdf)?\/?$/i,
    );
    if (match) {
      url.pathname = `/pdf/${match[2]}.pdf`;
      url.hash = "";
    }
  }

  return url.href;
}

export function isPdfUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.pathname.toLowerCase().endsWith(".pdf")) return true;
  return (
    ARXIV_HOSTS.has(url.hostname) && /^\/pdf\/.+\/?$/iu.test(url.pathname)
  );
}

export function pdfUrlFromLocation(
  location: Pick<Location, "search">,
): string | undefined {
  const value = new URLSearchParams(location.search).get("file");
  return value ? normalizePdfUrl(value) : undefined;
}

export function pdfReaderUrl(fileUrl: string, readerBaseUrl: string): string {
  const url = new URL(readerBaseUrl);
  url.searchParams.set("file", fileUrl);
  return url.href;
}
