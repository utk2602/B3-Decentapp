import { Metadata } from "next"

export const metadata: Metadata = {
    title: "Developers | Key Protocol",
    description: "Build on Key Protocol - developer documentation, API reference, code examples, and community resources"
}

export default function DevelopersLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return children
}
