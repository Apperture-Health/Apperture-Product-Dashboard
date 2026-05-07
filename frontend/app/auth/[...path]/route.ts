import { NextRequest } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

async function getIdentityToken(): Promise<string | null> {
  try {
    const res = await fetch(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${BACKEND}`,
      { headers: { "Metadata-Flavor": "Google" } }
    );
    return res.ok ? res.text() : null;
  } catch {
    return null; // local dev — no metadata server
  }
}

async function proxy(req: NextRequest, path: string[]) {
  const target = `${BACKEND}/auth/${path.join("/")}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "host") headers.set(key, value);
  });

  const token = await getIdentityToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const body =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.arrayBuffer()
      : undefined;

  const res = await fetch(target, { method: req.method, headers, body });

  const resHeaders = new Headers();
  res.headers.forEach((value, key) => resHeaders.set(key, value));

  return new Response(res.body, { status: res.status, headers: resHeaders });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
