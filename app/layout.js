import "./globals.css";

export const metadata = {
  title: "Pet Planet — Asset Generator",
  description: "Local internal asset generator for Pet Planet.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
