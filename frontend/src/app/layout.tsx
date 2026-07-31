import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SecopPRO - Auditoría",
  description: "Sistema de auditoría automatizada con latencia cero.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} antialiased text-gray-900 bg-white`}>
        {children}
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
