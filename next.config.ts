import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    reactStrictMode: true,
    outputFileTracingRoot: process.cwd(),
    eslint: {
        ignoreDuringBuilds: true
    }
};

export default nextConfig;
