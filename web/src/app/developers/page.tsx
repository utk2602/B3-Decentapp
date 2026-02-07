"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import Footer from "@/components/Footer"

export default function Developers() {
    const fadeIn = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.8 } }
    }

    return (
        <div className="developers-container">
            <div className="bg-overlay" style={{ background: 'linear-gradient(to bottom, transparent, rgba(0,127,255,0.02), transparent)' }} />

            <header className="fixed-header">
                <div className="header-content">
                    <Link href="/" className="accent font-serif" style={{ fontSize: '1.5rem', letterSpacing: '0.2em', textDecoration: 'none' }}>
                        KEY
                    </Link>
                    <nav className="header-nav">
                        <Link href="/docs" className="mono" style={{ fontSize: '0.875rem' }}>
                            Docs
                        </Link>
                        <Link href="/whitepaper" className="mono" style={{ fontSize: '0.875rem' }}>
                            Whitepaper
                        </Link>
                        <Link href="/" className="mono" style={{ fontSize: '0.875rem' }}>
                            Home
                        </Link>
                    </nav>
                </div>
            </header>

            <main className="main-content">
                <div className="content-max-wide">
                    <motion.div initial="hidden" animate="visible" variants={fadeIn}>
                        <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem' }}>Developer Portal</p>
                        <h1 className="font-serif" style={{ fontSize: '3.75rem', marginBottom: '1.5rem', color: 'var(--signal)' }}>Build on Key</h1>
                        <p className="font-serif" style={{ fontSize: '1.5rem', opacity: 0.6, fontStyle: 'italic', marginBottom: '4rem' }}>
                            Open protocol, infinite possibilities
                        </p>
                    </motion.div>

                    {/* Quick Start */}
                    <section className="section-large">
                        <h2 className="section-title" style={{ borderColor: 'var(--signal)' }}>Quick Start</h2>
                        <div className="grid-2" style={{ marginBottom: '2rem' }}>
                            <div className="card-signal">
                                <h3 className="mono card-label-signal">Option 1: Use Key API</h3>
                                <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '1rem' }}>
                                    Quickest way to get started. Use our API for username registration, message sending, and inbox fetching.
                                </p>
                                <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                                    No blockchain knowledge required
                                </p>
                            </div>
                            <div className="card-accent">
                                <h3 className="mono card-label">Option 2: Direct Program Calls</h3>
                                <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '1rem' }}>
                                    Maximum control. Call the Solana program directly, implement your own fee-payer, build custom infrastructure.
                                </p>
                                <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                                    Full customization, no dependencies
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* API Reference */}
                    <section className="section-large">
                        <h2 className="section-title" style={{ borderColor: 'var(--signal)' }}>API Reference</h2>
                        <div style={{ marginBottom: '2rem' }}>
                            <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>Base URL:</p>
                            <p className="api-url">https://api.trykey.app</p>
                            <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '1rem', marginBottom: '1rem' }}>
                                All requests require the following headers:
                            </p>
                            <div className="code-block">
                                <pre>Content-Type: application/json</pre>
                                <pre>X-API-Key: YOUR_API_KEY</pre>
                            </div>
                        </div>

                        <div className="api-box">
                            <div className="api-endpoint">
                                <div>
                                    <code className="mono" style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>POST /api/username/register</code>
                                    <p style={{ fontSize: '0.875rem', opacity: 0.6, marginTop: '0.5rem' }}>Register a new username on-chain</p>
                                </div>
                            </div>
                            <div className="code-block" style={{ fontSize: '0.75rem' }}>
                                <pre className="text-emerald-400">// Request Body</pre>
                                <pre>&#123;</pre>
                                <pre>  "username": "alice",</pre>
                                <pre>  "publicKey": "Fkf3...base58",</pre>
                                <pre>  "encryptionKey": "Ab4d...base64",</pre>
                                <pre>  "signature": "YzNm...base64",</pre>
                                <pre>  "timestamp": 1704067200000</pre>
                                <pre>&#125;</pre>
                            </div>
                        </div>

                        <div className="api-box">
                            <div className="api-endpoint">
                                <div>
                                    <code className="mono" style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>POST /api/message/send</code>
                                    <p style={{ fontSize: '0.875rem', opacity: 0.6, marginTop: '0.5rem' }}>Send encrypted message to recipient</p>
                                </div>
                            </div>
                            <div className="code-block" style={{ fontSize: '0.75rem' }}>
                                <pre className="text-emerald-400">// Request Body</pre>
                                <pre>&#123;</pre>
                                <pre>  "encryptedMessage": "base64_ciphertext",</pre>
                                <pre>  "recipientPubkey": "Fkf3...base58",</pre>
                                <pre>  "senderPubkey": "Ab4d...base58",</pre>
                                <pre>  "signature": "YzNm...base64",</pre>
                                <pre>  "timestamp": 1704067200000</pre>
                                <pre>&#125;</pre>
                            </div>
                        </div>

                        <div className="api-box">
                            <div className="api-endpoint">
                                <div>
                                    <code className="mono" style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>GET /api/message/inbox/:pubkey</code>
                                    <p style={{ fontSize: '0.875rem', opacity: 0.6, marginTop: '0.5rem' }}>Fetch received messages</p>
                                </div>
                            </div>
                            <div className="code-block" style={{ fontSize: '0.75rem' }}>
                                <pre className="text-emerald-400">// Response</pre>
                                <pre>&#123;</pre>
                                <pre>  "messages": [</pre>
                                <pre>    &#123;</pre>
                                <pre>      "signature": "tx_sig",</pre>
                                <pre>      "senderPubkey": "Fkf3...base58",</pre>
                                <pre>      "encryptedMessage": "base64_ciphertext",</pre>
                                <pre>      "timestamp": 1704067200</pre>
                                <pre>    &#125;</pre>
                                <pre>  ]</pre>
                                <pre>&#125;</pre>
                            </div>
                        </div>

                        <div className="api-box">
                            <div className="api-endpoint">
                                <div>
                                    <code className="mono" style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>POST /api/groups/create</code>
                                    <p style={{ fontSize: '0.875rem', opacity: 0.6, marginTop: '0.5rem' }}>Create a new group chat</p>
                                </div>
                            </div>
                            <div className="code-block" style={{ fontSize: '0.75rem' }}>
                                <pre className="text-emerald-400">// Request Body</pre>
                                <pre>&#123;</pre>
                                <pre>  "name": "My Group",</pre>
                                <pre>  "maxMembers": 50,</pre>
                                <pre>  "creatorPubkey": "Ab4d...base58",</pre>
                                <pre>  "signature": "YzNm...base64",</pre>
                                <pre>  "timestamp": 1704067200000</pre>
                                <pre>&#125;</pre>
                            </div>
                        </div>

                        <div className="api-box">
                            <div className="api-endpoint">
                                <div>
                                    <code className="mono" style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>POST /api/message/group/:id/send</code>
                                    <p style={{ fontSize: '0.875rem', opacity: 0.6, marginTop: '0.5rem' }}>Send encrypted message to group</p>
                                </div>
                            </div>
                            <div className="code-block" style={{ fontSize: '0.75rem' }}>
                                <pre className="text-emerald-400">// Request Body</pre>
                                <pre>&#123;</pre>
                                <pre>  "encryptedMessage": "base64_ciphertext",</pre>
                                <pre>  "encryptedKeys": &#123;</pre>
                                <pre>    "member1_pubkey": "encrypted_key_1",</pre>
                                <pre>    "member2_pubkey": "encrypted_key_2"</pre>
                                <pre>  &#125;,</pre>
                                <pre>  "senderPubkey": "Ab4d...base58",</pre>
                                <pre>  "signature": "YzNm...base64",</pre>
                                <pre>  "timestamp": 1704067200000</pre>
                                <pre>&#125;</pre>
                            </div>
                        </div>
                    </section>

                    {/* API Key */}
                    <section className="section-large">
                        <h2 className="section-title" style={{ borderColor: 'var(--signal)' }}>API Key</h2>
                        <div className="card-accent" style={{ marginBottom: '1rem' }}>
                            <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '1rem' }}>
                                To use the Key API, include your API key in the <code className="mono" style={{ color: 'var(--accent)' }}>X-API-Key</code> header.
                            </p>
                            <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>Request Example:</p>
                            <div className="code-block" style={{ fontSize: '0.75rem' }}>
                                <pre>fetch('https://api.trykey.app/api/message/inbox/PUBKEY', &#123;</pre>
                                <pre>  headers: &#123;</pre>
                                <pre>    'Content-Type': 'application/json',</pre>
                                <pre>    'X-API-Key': 'your_api_key_here'</pre>
                                <pre>  &#125;</pre>
                                <pre>&#125;);</pre>
                            </div>
                        </div>
                        <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                            Contact us at <a href="mailto:dev@trykey.app" className="accent" style={{ textDecoration: 'none' }}>dev@trykey.app</a> to obtain your API key for production use.
                        </p>
                    </section>

                    {/* Program IDL */}
                    <section className="section-large">
                        <h2 className="section-title" style={{ borderColor: 'var(--signal)' }}>Program Interface (IDL)</h2>
                        <div className="card-white" style={{ marginBottom: '1.5rem' }}>
                            <p className="mono" style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>Program Address:</p>
                            <code className="mono" style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>96hG67JxhNEptr1LkdtDcrqvtWiHH3x4GibDBcdh4MYQ</code>
                        </div>
                        <div style={{ marginBottom: '1rem' }}>
                            <div className="card-white">
                                <h4 className="mono card-label">registerUsername</h4>
                                <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.75rem' }}>Create a new username account (PDA derived from username)</p>
                                <div className="code-block" style={{ fontSize: '0.75rem' }}>
                                    <pre>pub fn register_username(</pre>
                                    <pre>  ctx: Context&lt;RegisterUsername&gt;,</pre>
                                    <pre>  username: String,</pre>
                                    <pre>  encryption_key: [u8; 32]</pre>
                                    <pre>) -&gt; Result&lt;()&gt;</pre>
                                </div>
                            </div>

                            <div className="card-white">
                                <h4 className="mono card-label">updateEncryptionKey</h4>
                                <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.75rem' }}>Rotate encryption key (owner-only)</p>
                                <div className="code-block" style={{ fontSize: '0.75rem' }}>
                                    <pre>pub fn update_encryption_key(</pre>
                                    <pre>  ctx: Context&lt;UpdateEncryptionKey&gt;,</pre>
                                    <pre>  new_key: [u8; 32]</pre>
                                    <pre>) -&gt; Result&lt;()&gt;</pre>
                                </div>
                            </div>

                            <div className="card-white">
                                <h4 className="mono card-label">transferUsername</h4>
                                <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.75rem' }}>Transfer username to new owner</p>
                                <div className="code-block" style={{ fontSize: '0.75rem' }}>
                                    <pre>pub fn transfer_username(</pre>
                                    <pre>  ctx: Context&lt;TransferUsername&gt;,</pre>
                                    <pre>  new_owner: Pubkey</pre>
                                    <pre>) -&gt; Result&lt;()&gt;</pre>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Code Examples */}
                    <section className="section-large">
                        <h2 className="section-title" style={{ borderColor: 'var(--signal)' }}>Code Examples</h2>
                        <div style={{ marginBottom: '2rem' }}>
                            <h3 className="mono" style={{ color: 'var(--accent)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem' }}>TypeScript (Client)</h3>
                            <div className="code-block">
                                <pre className="text-emerald-400">// Encrypt a message with TweetNaCl</pre>
                                <pre>import nacl from 'tweetnacl';</pre>
                                <pre>import bs58 from 'bs58';</pre>
                                <pre></pre>
                                <pre>const nonce = nacl.randomBytes(nacl.box.nonceLength);</pre>
                                <pre>const messageBytes = new TextEncoder().encode(message);</pre>
                                <pre>const encrypted = nacl.box(</pre>
                                <pre>  messageBytes,</pre>
                                <pre>  nonce,</pre>
                                <pre>  recipientPublicKey,</pre>
                                <pre>  senderSecretKey</pre>
                                <pre>);</pre>
                            </div>
                        </div>

                        <div>
                            <h3 className="mono" style={{ color: 'var(--accent)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '1rem' }}>Rust (Program)</h3>
                            <div className="code-block">
                                <pre className="text-emerald-400">// Username account structure</pre>
                                <pre>#[account]</pre>
                                <pre>pub struct UserAccount &#123;</pre>
                                <pre>    pub owner: Pubkey,</pre>
                                <pre>    pub username: String,</pre>
                                <pre>    pub encryption_key: [u8; 32],</pre>
                                <pre>    pub created_at: i64,</pre>
                                <pre>    pub bump: u8,</pre>
                                <pre>&#125;</pre>
                            </div>
                        </div>
                    </section>

                    {/* SDKs & Libraries */}
                    <section className="section-large">
                        <h2 className="section-title" style={{ borderColor: 'var(--signal)' }}>SDKs & Libraries</h2>
                        <div className="grid-3">
                            <div className="card-white">
                                <h4 className="mono card-label">JavaScript/TypeScript</h4>
                                <ul className="list-no-style" style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                                    <li style={{ marginBottom: '0.5rem' }}>• @solana/web3.js</li>
                                    <li style={{ marginBottom: '0.5rem' }}>• tweetnacl</li>
                                    <li style={{ marginBottom: '0.5rem' }}>• bs58</li>
                                    <li>• @coral-xyz/anchor</li>
                                </ul>
                            </div>
                            <div className="card-white">
                                <h4 className="mono card-label">Rust</h4>
                                <ul className="list-no-style" style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                                    <li style={{ marginBottom: '0.5rem' }}>• anchor-lang</li>
                                    <li style={{ marginBottom: '0.5rem' }}>• solana-program</li>
                                    <li style={{ marginBottom: '0.5rem' }}>• borsh</li>
                                    <li>• ed25519-dalek</li>
                                </ul>
                            </div>
                            <div className="card-white">
                                <h4 className="mono card-label">Python</h4>
                                <ul className="list-no-style" style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                                    <li style={{ marginBottom: '0.5rem' }}>• solana-py</li>
                                    <li style={{ marginBottom: '0.5rem' }}>• PyNaCl</li>
                                    <li>• base58</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Community */}
                    <section className="section-large">
                        <h2 className="section-title" style={{ borderColor: 'var(--signal)' }}>Community</h2>
                        <div className="grid-2">
                            <a href="https://github.com/SerPepe/KeyApp" className="card-link" target="_blank" rel="noopener">
                                <h4 className="mono card-label-signal">GitHub</h4>
                                <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '1rem' }}>
                                    Source code, issues, pull requests
                                </p>
                                <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--signal)' }}>github.com/SerPepe/KeyApp →</span>
                            </a>
                            <a href="https://discord.gg" className="card-link-gold" target="_blank" rel="noopener">
                                <h4 className="mono card-label">Discord</h4>
                                <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '1rem' }}>
                                    Developer community, support, discussions
                                </p>
                                <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>discord.gg/keyprotocol →</span>
                            </a>
                        </div>
                    </section>
                </div>
            </main>

            <Footer />
        </div>
    )
}
