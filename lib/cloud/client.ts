import postgres from "postgres";
let client: ReturnType<typeof postgres> | undefined;
export function cloudSQL() {
  if (!process.env.DATABASE_URL || !process.env.SUPABASE_CA_CERT)
    throw Error("Cloud database configuration is incomplete");
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete("sslmode");
  client ??= postgres(url.toString(), {
    max: 1,
    prepare: false,
    max_pipeline: 1,
    ssl: { rejectUnauthorized: true, ca: process.env.SUPABASE_CA_CERT },
    connect_timeout: 15,
    idle_timeout: 20,
    onnotice: () => {},
  });
  return client;
}
