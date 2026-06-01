import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app directory. Without this, Next infers the
  // root from the nearest lockfile and can pick up an unrelated parent lockfile,
  // emitting a "inferred workspace root" warning during build.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
