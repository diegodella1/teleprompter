import type { Metadata } from "next";
import { Archivo_Narrow, DM_Sans, Space_Mono } from "next/font/google";
import "./globals.css";

const interfaceFont = DM_Sans({
    subsets: ["latin"],
    variable: "--font-interface"
});

const prompterFont = Archivo_Narrow({
    subsets: ["latin"],
    variable: "--font-prompter"
});

const technicalFont = Space_Mono({
    subsets: ["latin"],
    variable: "--font-technical",
    weight: ["400", "700"]
});

export const metadata: Metadata = {
    title: "TelePRO | Collaborative Broadcast Teleprompter",
    description: "Shared script, playback control, and synchronized prompting for remote live production."
};

type RootLayoutProps = Readonly<{
    children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        <html lang="en">
            <body className={`${interfaceFont.variable} ${prompterFont.variable} ${technicalFont.variable}`}>{children}</body>
        </html>
    );
}
