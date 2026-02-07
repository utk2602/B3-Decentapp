import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Whitepaper | Key Protocol",
    description: "Technical whitepaper for the Key Protocol - a permissionless messaging protocol on Solana with end-to-end encryption"
}

export default function WhitepaperLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return children
}
