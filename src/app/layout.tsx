import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Roxom.TV Teleprompter",
    description: "Standalone WAN teleprompter for Roxom.TV remote production"
};

type RootLayoutProps = Readonly<{
    children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
