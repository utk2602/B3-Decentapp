"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import Footer from "@/components/Footer"

export default function Whitepaper() {
    const fadeIn = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.8 } }
    }

    return (
        <div className="whitepaper-container">
            <div className="bg-overlay" />

            <header className="fixed-header">
                <div className="header-content">
                    <Link href="/" className="accent font-serif" style={{ fontSize: '1.5rem', letterSpacing: '0.2em', textDecoration: 'none' }}>
                        KEY
                    </Link>
                    <nav className="header-nav">
                        <Link href="/docs" className="mono" style={{ fontSize: '0.875rem' }}>
                            Docs
                        </Link>
                        <Link href="/" className="mono" style={{ fontSize: '0.875rem' }}>
                            Home
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="main-content">
                <div className="content-max">
                    <motion.div initial="hidden" animate="visible" variants={fadeIn}>
                        <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem' }}>Technical Whitepaper V1.0</p>
                        <h1 className="font-serif" style={{ fontSize: '3.75rem', marginBottom: '1.5rem' }}>Key Protocol</h1>
                        <p className="font-serif" style={{ fontSize: '1.5rem', opacity: 0.6, fontStyle: 'italic', marginBottom: '4rem' }}>
                            A Permissionless Messaging Protocol on Solana
                        </p>
                    </motion.div>

                    <section className="section-large">
                        <h2 className="section-title">Abstract</h2>
                        <p style={{ fontSize: '1.125rem', lineHeight: 1.75, opacity: 0.8, marginBottom: '1.5rem' }}>
                            Key is an open, permissionless messaging protocol built on Solana that combines end-to-end encryption
                            with blockchain immutability. By abstracting transaction costs through a fee-payer model and storing
                            encrypted messages on-chain via memo instructions, Key provides a censorship-resistant communication
                            layer with no vendor lock-in.
                        </p>
                        <p style={{ lineHeight: 1.75, opacity: 0.7 }}>
                            This whitepaper describes the technical architecture, cryptographic implementation, and economic
                            sustainability model that enables truly sovereign digital communication.
                        </p>
                    </section>

                    <section className="section-large">
                        <h2 className="section-title">Problem Statement</h2>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <p style={{ lineHeight: 1.75, opacity: 0.8, marginBottom: '1.5rem' }}>
                                Modern messaging platforms suffer from three critical vulnerabilities:
                            </p>
                            <div className="grid-3">
                                <div className="card-red">
                                    <h4 className="card-label">Centralization</h4>
                                    <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>Messages stored on corporate servers, subject to surveillance and deletion.</p>
                                </div>
                                <div className="card-red">
                                    <h4 className="card-label">Vendor Lock-In</h4>
                                    <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>Users cannot export their identity or migrate to alternative clients.</p>
                                </div>
                                <div className="card-red">
                                    <h4 className="card-label">Cost Barriers</h4>
                                    <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>Blockchain-based solutions impose transaction fees that hinder adoption.</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="section-large">
                        <h2 className="section-title">Solution Architecture</h2>
                        <div style={{ marginBottom: '2rem' }}>
                            <div>
                                <h3 className="mono" style={{ color: 'var(--accent)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem' }}>1. Username Registry (Anchor Program)</h3>
                                <p style={{ lineHeight: 1.75, opacity: 0.8, marginBottom: '1rem' }}>
                                    A Solana program deployed at <code className="mono" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>96hG67JxhNEptr1LkdtDcrqvtWiHH3x4GibDBcdh4MYQ</code> manages
                                    the mapping of human-readable usernames to cryptographic public keys.
                                </p>
                                <div className="card-white">
                                    <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>Program Data Account (PDA):</p>
                                    <ul className="list-no-style mono" style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                                        <li>• Owner: Ed25519 public key (32 bytes)</li>
                                        <li>• Username: UTF-8 string (3-20 characters)</li>
                                        <li>• Encryption Key: X25519 public key (32 bytes)</li>
                                        <li>• Created At: Unix timestamp (8 bytes)</li>
                                    </ul>
                                </div>
                            </div>

                            <div>
                                <h3 className="mono" style={{ color: 'var(--accent)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem' }}>2. Message Transmission (Memo + Arweave)</h3>
                                <p style={{ lineHeight: 1.75, opacity: 0.8, marginBottom: '1rem' }}>
                                    Messages are transmitted via Solana memo instructions. For messages under 750 bytes, the encrypted
                                    content is stored directly in the memo. Larger messages are uploaded to Arweave with only the
                                    transaction ID stored on-chain.
                                </p>
                                <div className="card-white">
                                    <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>Transaction Structure:</p>
                                    <ul className="list-no-style mono" style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                                        <li>1. SystemProgram.transfer(1 lamport) → Triggers recipient listener</li>
                                        <li>2. MemoProgram → Stores "senderPubkey|encryptedMessage"</li>
                                        <li>3. Fee Payer Signature → Server subsidizes cost</li>
                                    </ul>
                                </div>
                            </div>

                            <div>
                                <h3 className="mono" style={{ color: 'var(--accent)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem' }}>3. Encryption Scheme (X25519 + ChaCha20)</h3>
                                <p style={{ lineHeight: 1.75, opacity: 0.8, marginBottom: '1rem' }}>
                                    All messages use NaCl box (X25519 Elliptic Curve Diffie-Hellman + ChaCha20-Poly1305 AEAD cipher).
                                    Encryption keys are derived from Ed25519 signing keys using the first 32 bytes.
                                </p>
                                <div className="card-green">
                                    <p className="mono card-label-green">Security Guarantees:</p>
                                    <ul className="list-no-style" style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                                        <li>• 128-bit security level (X25519)</li>
                                        <li>• Authenticated encryption (Poly1305 MAC)</li>
                                        <li>• Random nonce per message (forward secrecy)</li>
                                        <li>• Client-side encryption (server never sees plaintext)</li>
                                    </ul>
                                </div>
                            </div>

                            <div>
                                <h3 className="mono" style={{ color: 'var(--accent)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem' }}>4. Fee Abstraction (Gasless UX)</h3>
                                <p style={{ lineHeight: 1.75, opacity: 0.8 }}>
                                    Users never pay transaction fees. A fee-payer service signs and submits all transactions to Solana.
                                    Users only sign with their own keypair to prove authorship.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="section-large">
                        <h2 className="section-title">Security Model</h2>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <div>
                                <h3 className="mono" style={{ color: 'var(--accent)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem' }}>Threat Model</h3>
                                <div className="grid-2">
                                    <div>
                                        <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.75rem' }}>Protected Against:</p>
                                        <ul className="list-no-style" style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.5rem' }}>
                                            <li>• Server-side decryption (keys never leave device)</li>
                                            <li>• Message tampering (authenticated encryption)</li>
                                            <li>• Replay attacks (5-minute timestamp window)</li>
                                            <li>• Spoofing (Ed25519 signature verification)</li>
                                        </ul>
                                    </div>
                                    <div>
                                        <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.75rem' }}>Limitations:</p>
                                        <ul className="list-no-style" style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.5rem' }}>
                                            <li>• Metadata visible (sender/recipient/timestamp)</li>
                                            <li>• No perfect forward secrecy (no key ratcheting)</li>
                                            <li>• Compromised keypair leaks all messages</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="section-large">
                        <h2 className="section-title">Tokenomics</h2>
                        <p style={{ lineHeight: 1.75, opacity: 0.8, marginBottom: '1.5rem' }}>
                            The Key Protocol is sustained by the $KEY token launched on Pump.fun. Creator fees from $KEY trading
                            volume fund the fee-payer service, subsidizing all transaction costs for users.
                        </p>
                        <div className="card-accent" style={{ borderRadius: '0.5rem' }}>
                            <p className="font-serif" style={{ fontSize: '1.125rem', fontStyle: 'italic', color: 'var(--accent)' }}>
                                "By holding $KEY, you are not just an investor; you are a Patron of privacy."
                            </p>
                        </div>
                    </section>

                    <section className="section-large">
                        <h2 className="section-title">Decentralization & Open Protocol</h2>
                        <p style={{ lineHeight: 1.75, opacity: 0.8, marginBottom: '1.5rem' }}>
                            Key is fully open and permissionless. Any developer can:
                        </p>
                        <ul className="list-no-style" style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.75rem' }}>
                            <li>• Build alternative frontends with custom UI/UX</li>
                            <li>• Deploy their own fee-payer service</li>
                            <li>• Call the username registry program directly via Solana RPC</li>
                            <li>• Create platform-specific clients (desktop, CLI, mobile)</li>
                        </ul>
                        <p style={{ lineHeight: 1.75, opacity: 0.7, marginTop: '1.5rem' }}>
                            Users retain full sovereignty over their keypairs and can export their identity to any compatible client.
                        </p>
                    </section>

                    <section className="section-large">
                        <h2 className="section-title">Group Chat Architecture</h2>
                        <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '1.5rem', lineHeight: 1.75 }}>
                            Key implements Signal-style hybrid encryption for group messaging, supporting up to 50 members
                            with full end-to-end encryption. No group messages are stored in plaintext - ever.
                        </p>

                        <h3 className="font-serif" style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--accent)' }}>Encryption Flow</h3>
                        <div style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '1.5rem' }}>
                            <p style={{ marginBottom: '0.75rem' }}><strong style={{ color: 'var(--accent)' }}>1. Message Encryption:</strong> Generate random ChaCha20 symmetric key → Encrypt message with symmetric key</p>
                            <p style={{ marginBottom: '0.75rem' }}><strong style={{ color: 'var(--accent)' }}>2. Key Distribution:</strong> Encrypt symmetric key separately for each member using their X25519 public key</p>
                            <p style={{ marginBottom: '0.75rem' }}><strong style={{ color: 'var(--accent)' }}>3. Storage:</strong> Upload encrypted payload to Arweave: {`{encryptedMessage, encryptedKeys: {member1: key1, ...}}`}</p>
                            <p style={{ marginBottom: '0.75rem' }}><strong style={{ color: 'var(--accent)' }}>4. Notification:</strong> Send 1 lamport transaction to each member with memo: {`group:groupId:arweaveTxId`}</p>
                            <p><strong style={{ color: 'var(--accent)' }}>5. Decryption:</strong> Member receives notification → Fetches from Arweave → Decrypts their personal key → Decrypts message</p>
                        </div>

                        <h3 className="font-serif" style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--accent)' }}>Data Storage</h3>
                        <ul className="list-no-style" style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                            <li style={{ marginBottom: '0.5rem' }}>• <strong>Redis:</strong> Group metadata only (name, member list) - NO MESSAGES</li>
                            <li style={{ marginBottom: '0.5rem' }}>• <strong>Arweave:</strong> Encrypted message payloads (cannot be decrypted without member keys)</li>
                            <li style={{ marginBottom: '0.5rem' }}>• <strong>Solana:</strong> Notification transactions (pointers only, no content)</li>
                            <li>• <strong>Your Device:</strong> Decryption keys never leave your device</li>
                        </ul>
                    </section>

                    <section className="section-large">
                        <h2 className="section-title">Roadmap</h2>
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                                <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--signal)' }}>LIVE</span>
                                <div>
                                    <p className="font-serif">Group Chat Support ✓</p>
                                    <p style={{ fontSize: '0.875rem', opacity: 0.6 }}>Hybrid encryption for up to 50 members with Arweave storage</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                                <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>Q2 2026</span>
                                <div>
                                    <p className="font-serif">Ephemeral Messages</p>
                                    <p style={{ fontSize: '0.875rem', opacity: 0.6 }}>Self-destructing messages with local-only mode</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>Q3 2026</span>
                                <div>
                                    <p className="font-serif">Desktop Clients</p>
                                    <p style={{ fontSize: '0.875rem', opacity: 0.6 }}>Native macOS/Windows/Linux applications</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="section-large">
                        <h2 className="section-title">References</h2>
                        <ul className="list-no-style mono" style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                            <li style={{ marginBottom: '0.5rem' }}>• Program: <a href="https://explorer.solana.com/address/96hG67JxhNEptr1LkdtDcrqvtWiHH3x4GibDBcdh4MYQ?cluster=devnet" className="accent" style={{ textDecoration: 'none' }} target="_blank" rel="noopener">96hG67JxhNEptr1LkdtDcrqvtWiHH3x4GibDBcdh4MYQ</a></li>
                            <li style={{ marginBottom: '0.5rem' }}>• Source Code: <a href="https://github.com/SerPepe/KeyApp" className="accent" style={{ textDecoration: 'none' }} target="_blank" rel="noopener">github.com/SerPepe/KeyApp</a></li>
                            <li style={{ marginBottom: '0.5rem' }}>• API: <a href="https://api.trykey.app" className="accent" style={{ textDecoration: 'none' }} target="_blank" rel="noopener">api.trykey.app</a></li>
                            <li>• Solana Docs: <a href="https://docs.solana.com" className="accent" style={{ textDecoration: 'none' }} target="_blank" rel="noopener">docs.solana.com</a></li>
                        </ul>
                    </section>
                </div>
            </main>

            <Footer />
        </div>
    )
}
