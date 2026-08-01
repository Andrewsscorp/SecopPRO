import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from 'sonner';
import Sidebar from '@/components/layout/Sidebar';
import GlobalChat from '@/components/chat/GlobalChat';

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
      <body className={`${inter.className} antialiased text-gray-900 bg-white flex h-screen w-full overflow-hidden`}>
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto bg-[#f8fafc]">
          {children}
        </div>
        <GlobalChat />
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
