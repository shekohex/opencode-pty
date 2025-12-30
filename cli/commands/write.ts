import { client } from "../client.ts";

interface WriteOptions {
  json?: boolean;
}

interface WriteResult {
  success: boolean;
  bytes: number;
}

export async function writeCommand(
  id: string,
  data: string,
  options: WriteOptions
): Promise<void> {
  await client.ensureDaemon();

  const result = await client.call<WriteResult>("write", {
    id,
    data,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const preview = data.length > 50 ? data.slice(0, 50) + "..." : data;
    const displayPreview = preview
      .replace(/\x03/g, "^C")
      .replace(/\x04/g, "^D")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r");
    console.log(`Sent ${result.bytes} bytes to ${id}: "${displayPreview}"`);
  }
}
