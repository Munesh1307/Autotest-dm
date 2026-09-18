"use client";

import Header from "@/components/Header";
import { usePathname } from "next/navigation";
import React from "react";

export default function RootLayout({ children }) {
  const pathname = usePathname();

  if (
    pathname === "/weather" ||
    pathname === "/mock-Quij" ||
    pathname === "/birthday-wishes"
  ) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />

      <main className="pt-[80px]">
        {children}
      </main>
    </>
  );
}