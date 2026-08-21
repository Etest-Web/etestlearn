import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verify Certificate",
  description:
    "Verify the authenticity of an Etest Learning certificate by its verification link.",
  robots: { index: false },
};

export default function VerifyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
