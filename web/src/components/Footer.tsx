"use client"

import { motion } from "framer-motion"
import Link from "next/link"

export default function Footer() {
    return (
        <footer className="footer">
            <motion.div
                className="footer-logo"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                whileHover={{ scale: 1.05, textShadow: "0 0 40px rgba(212,175,55,0.4)" }}
                viewport={{ once: true }}
                transition={{ duration: 1.5 }}
            >
                <h2 style={{
                    fontSize: '2.5rem',
                    letterSpacing: '0.4em',
                    marginBottom: '0.5rem',
                    fontFamily: 'var(--font-cinzel)',
                    color: 'var(--accent)',
                    textShadow: '0 0 30px rgba(212, 175, 55, 0.2)'
                }}>KEY</h2>
            </motion.div>

            <nav className="footer-nav">
                <Link href="/docs#manifesto">Manifesto</Link>
                <Link href="/docs">Technical Docs</Link>
                <Link href="/whitepaper">Whitepaper</Link>
                <Link href="/developers">Developers</Link>
                <a href="https://github.com/SerPepe/KeyApp" target="_blank" rel="noopener noreferrer">Source Code</a>
                <Link href="/privacy">Privacy Policy</Link>
                <a href="https://dexscreener.com" target="_blank" rel="noopener noreferrer">$PRIVACY Chart</a>
                <a href="https://x.com/" target="_blank" rel="noopener noreferrer">Twitter</a>
            </nav>

            <motion.div
                className="tagline"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 0.4, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 1, duration: 2 }}
                style={{ marginTop: '4rem' }}
            >
                <p className="mono" style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>Verba Volant, Scripta Manent.</p>
                <p style={{ fontSize: '0.65rem', marginTop: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', opacity: 0.6 }}>
                    (Spoken words fly away, written words remain)
                </p>
            </motion.div>
        </footer>
    )
}
