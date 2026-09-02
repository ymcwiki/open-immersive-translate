export function readPdfFile(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read failed"));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("FileReader returned an unexpected value"));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(file);
  });
}

export async function fetchPdfFile(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim());
  }
  return new Uint8Array(await response.arrayBuffer());
}

export function isPdfFile(file: File): boolean {
  return (
    file.type.toLowerCase() === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}
