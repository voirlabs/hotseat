import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // Every instance is private to its owner, so nothing should be indexed.
  return { rules: { userAgent: "*", disallow: "/" } };
}
