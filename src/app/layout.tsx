import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Teleprompter",
    description: "Collaborative web teleprompter for remote live production"
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
