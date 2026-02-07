"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { useState } from "react"

export default function Docs() {
    const [activeSection, setActiveSection] = useState("overview")

    const sections = [
        { id: "overview", title: "01. Overview" },
        { id: "anchor", title: "02. Anchor Protocol" },
        { id: "whisper", title: "03. Whisper Mechanism" },
        { id: "feepayer", title: "04. Fee Payer" },
        { id: "openprotocol", title: "05. Open Protocol" },
        { id: "groupchat", title: "06. Group Chat" },
        { id: "encryption", title: "07. Encryption Deep Dive" },
        { id: "developers", title: "08. Developer Guide" },
        { id: "sustainability", title: "09. Sustainability" },
        { id: "manifesto", title: "10. Manifesto" }
    ]

    const fadeIn = {
        hidden: { opacity: 0, x: -20 },
        visible: { opacity: 1, x: 0, transition: { duration: 0.6 } }
    }

    return (
        <div className="docs-container">
            {/* Sidebar Navigation */}
            <aside className="docs-sidebar">
                <div className="mb-12">
                    <Link href="/" className="accent font-serif text-2xl tracking-widest no-underline">KEY</Link>
                    <p className="mono text-[10px] opacity-40 mt-1">INTERNAL_DOCS_V1</p>
                </div>

                <nav>
                    {sections.map((section) => (
                        <a
                            key={section.id}
                            href={`#${section.id}`}
                            className={activeSection === section.id ? "active" : ""}
                            onClick={() => setActiveSection(section.id)}
                        >
                            {section.title}
                        </a>
                    ))}
                    <Link href="/" className="mt-8 opacity-40 hover:opacity-100 italic">
                        ← Exit Docs
                    </Link>
                </nav>
            </aside>

            {/* Main Content Area */}
            <main className="docs-content">
                <div className="max-w-[800px]">
                    <motion.div initial="hidden" animate="visible" variants={fadeIn}>
                        <h1 className="title-large mb-12">System Architecture</h1>
                    </motion.div>

                    <section id="overview" className="mb-32">
                        <h2 className="text-3xl font-serif italic mb-8 border-b border-[var(--accent)] pb-4 inline-block pr-12">
                            01. Overview
                        </h2>
                        <div className="space-y-6">
                            <p className="text-lg leading-relaxed">
                                The Key Protocol is an <span className="accent">algorithmic baroque</span> approach to
                                digital sovereignty. It provides a layer of absolute privacy for communication
                                atop the high-performance Solana ledger.
                            </p>
                            <p className="text-lg leading-relaxed opacity-80">
                                Unlike traditional messaging apps, Key does not utilize a traditional database for
                                message storage. Instead, it leverages the ledger as an immutable, append-only
                                transmission medium, using the Fee Payer Network to subsidize the friction of
                                blockchain interactions.
                            </p>
                            <div className="p-6 bg-[rgba(212,175,55,0.03)] border border-[rgba(212,175,55,0.1)] rounded-lg">
                                <h3 className="mono text-xs accent uppercase mb-4 tracking-widest">Key Principles</h3>
                                <ul className="space-y-3 mono text-sm opacity-80">
                                    <li>• Identity is local and absolute.</li>
                                    <li>• Transmission is public, content is private.</li>
                                    <li>• Sovereignty is gasless.</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section id="anchor" className="mb-32">
                        <h2 className="text-3xl font-serif italic mb-8 border-b border-[var(--accent)] pb-4 inline-block pr-12">
                            02. Anchor Protocol
                        </h2>
                        <p className="mb-8 opacity-80 leading-relaxed">
                            The identity registry is governed by a secure Anchor program. It manages the
                            mapping of human-readable handles to cryptographic public keys.
                        </p>

                        <div className="code-block">
                            <pre className="text-blue-400">#[program]</pre>
                            <pre className="text-white">pub mod key_registry &#123;</pre>
                            <pre className="text-emerald-400">    pub fn register_username(ctx: Context, username: String) -&gt; Result&lt;()&gt; &#123;</pre>
                            <pre className="text-gray-400">        let user_account = &mut ctx.accounts.user_account;</pre>
                            <pre className="text-gray-400">        user_account.owner = ctx.accounts.owner.key();</pre>
                            <pre className="text-gray-400">        user_account.username = username.to_lowercase();</pre>
                            <pre className="text-emerald-400">        Ok(())</pre>
                            <pre className="text-white">    &#125;</pre>
                            <pre className="text-white">&#125;</pre>
                        </div>

                        <p className="leading-relaxed opacity-80">
                            Each username exists as a <span className="accent">Program Derived Address (PDA)</span>.
                            This design prevents handle-space collisions and ensures that each handle can only
                            be initialized once, effectively creating a decentralized name service for messaging.
                        </p>
                    </section>

                    <section id="whisper" className="mb-32">
                        <h2 className="text-3xl font-serif italic mb-8 border-b border-[var(--accent)] pb-4 inline-block pr-12">
                            03. Whisper Mechanism
                        </h2>
                        <p className="mb-8 opacity-80 leading-relaxed">
                            Communication is achieved through "Whisper Transactions" — tiny SOL transfers
                            carrying encrypted payloads in their memo data.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                            <div className="bg-[rgba(255,255,255,0.02)] p-6 border border-white/5">
                                <h4 className="mono accent text-xs mb-4 uppercase">Phase I: Local</h4>
                                <p className="text-sm opacity-70">
                                    Sender generates an ephemeral keypair and performs a Diffie-Hellman exchange
                                    to derive a symmetric key. The message is encrypted via XSalsa20-Poly1305.
                                </p>
                            </div>
                            <div className="bg-[rgba(255,255,255,0.02)] p-6 border border-white/5">
                                <h4 className="mono accent text-xs mb-4 uppercase">Phase II: Ledger</h4>
                                <p className="text-sm opacity-70">
                                    The Fee Payer prepares a transaction with a SystemProgram::transfer
                                    of 1 lamport to the recipient, embedding the encrypted blob in a
                                    SplMemo instruction.
                                </p>
                            </div>
                        </div>

                        <div className="p-8 border-l border-[var(--signal)] bg-[rgba(0,127,255,0.03)] text-sm">
                            <p className="mono text-[var(--signal)] mb-2 uppercase tracking-widest text-[10px]">Security Note</p>
                            <p className="opacity-70 italic font-serif">
                                "The ledger acts as a public waterfall. While everyone can see the water falling,
                                only those who hold the matching key can extract the meaning from the spray."
                            </p>
                        </div>
                    </section>

                    <section id="feepayer" className="mb-32">
                        <h2 className="text-3xl font-serif italic mb-8 border-b border-[var(--accent)] pb-4 inline-block pr-12">
                            04. Fee Payer
                        </h2>
                        <p className="mb-8 opacity-80 leading-relaxed">
                            To enable a frictionless user experience, Key operates a robust Fee Payer Network.
                            This off-chain service manages the operational treasury required to fund user activity.
                        </p>

                        <ul className="space-y-8">
                            <li>
                                <h4 className="font-serif accent text-xl mb-2">Automated Underwriting</h4>
                                <p className="opacity-70">
                                    The API uses sophisticated rate-limiting and spending caps (0.01 SOL/day per user)
                                    to ensure the sustainability of the free-forever model while preventing malicious drain.
                                </p>
                            </li>
                            <li>
                                <h4 className="font-serif accent text-xl mb-2">Non-Custodial Design</h4>
                                <p className="opacity-70">
                                    While the Fee Payer signs for gas, it never has access to identity keys or
                                    message content. It is a blind service, underwriting the costs of sovereignty
                                    without compromising it.
                                </p>
                            </li>
                        </ul>
                    </section>

                    <section id="openprotocol" className="mb-32">
                        <h2 className="text-3xl font-serif italic mb-8 border-b border-[var(--accent)] pb-4 inline-block pr-12">
                            05. Open Protocol
                        </h2>
                        <div className="space-y-6">
                            <p className="text-lg leading-relaxed">
                                Key is a <span className="accent">permissionless protocol</span> - anyone can build alternative frontends, backends, or fee-payer services.
                            </p>
                            <div className="p-6 bg-[rgba(212,175,55,0.03)] border border-[rgba(212,175,55,0.1)] rounded-lg">
                                <h3 className="mono text-xs accent uppercase mb-4 tracking-widest">Program Address</h3>
                                <code className="mono text-sm opacity-80">96hG67JxhNEptr1LkdtDcrqvtWiHH3x4GibDBcdh4MYQ</code>
                            </div>
                            <div className="space-y-4">
                                <h4 className="mono accent text-sm uppercase tracking-widest">Public Instructions</h4>
                                <ul className="space-y-2 mono text-sm opacity-80">
                                    <li>• <code>registerUsername(username, encryption_key)</code> - Permissionless registration</li>
                                    <li>• <code>lookupUsername(username)</code> - Query username → public key mapping</li>
                                    <li>• <code>updateEncryptionKey(new_key)</code> - Owner-only key rotation</li>
                                    <li>• <code>transferUsername(new_owner)</code> - Transfer username ownership</li>
                                    <li>• <code>closeAccount()</code> - Burn username, recover rent</li>
                                </ul>
                            </div>
                            <div className="space-y-4">
                                <h4 className="mono accent text-sm uppercase tracking-widest">Building Alternative Frontends</h4>
                                <p className="leading-relaxed opacity-80">
                                    Developers can:
                                </p>
                                <ul className="space-y-2 mono text-sm opacity-80">
                                    <li>1. Call program instructions directly via Solana RPC (no Key API needed)</li>
                                    <li>2. Build custom UI with their own design</li>
                                    <li>3. Implement custom fee-payer services</li>
                                    <li>4. Use different encryption libraries (compatible with X25519)</li>
                                    <li>5. Create platform-specific apps (desktop, CLI, browser extension)</li>
                                </ul>
                            </div>
                            <div className="p-6 bg-[rgba(0,127,255,0.05)] border border-[rgba(0,127,255,0.1)] rounded-lg">
                                <h4 className="mono text-xs signal uppercase mb-3 tracking-widest">No Vendor Lock-In</h4>
                                <ul className="space-y-2 mono text-sm opacity-80">
                                    <li>• Users control their keypairs (local storage)</li>
                                    <li>• Messages stored on public blockchain (Solana + Arweave)</li>
                                    <li>• Username registry is on-chain (永久 permanent)</li>
                                    <li>• Alternative clients can decrypt messages (if user imports keypair)</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section id="groupchat" className="mb-32">
                        <h2 className="text-3xl font-serif italic mb-8 border-b border-[var(--accent)] pb-4 inline-block pr-12">
                            06. Group Chat
                        </h2>
                        <div className="space-y-6">
                            <p className="text-lg leading-relaxed">
                                Key implements <span className="accent">Signal-style hybrid encryption</span> for group messaging,
                                supporting up to 50 members with full end-to-end encryption.
                            </p>

                            <div className="p-6 bg-[rgba(212,175,55,0.03)] border border-[rgba(212,175,55,0.1)] rounded-lg">
                                <h3 className="mono text-xs accent uppercase mb-4 tracking-widest">Architecture Overview</h3>
                                <p className="text-sm opacity-80 leading-relaxed">
                                    Each group message uses a randomly generated symmetric key to encrypt the content,
                                    then that key is individually encrypted for each group member using their X25519 public key.
                                    This ensures perfect forward secrecy and allows members to be added/removed without
                                    re-encrypting historical messages.
                                </p>
                            </div>

                            <div className="space-y-4">
                                <h4 className="mono accent text-sm uppercase tracking-widest">Encryption Flow</h4>
                                <ol className="space-y-3 text-sm leading-relaxed opacity-80">
                                    <li>1. <strong>Generate</strong> random ChaCha20 symmetric key (32 bytes)</li>
                                    <li>2. <strong>Encrypt</strong> message with symmetric key</li>
                                    <li>3. <strong>Encrypt</strong> symmetric key separately for each member using their X25519 public key</li>
                                    <li>4. <strong>Upload</strong> to Arweave: {`{encryptedMessage, encryptedKeys: {member1Pubkey: key1, ...}}`}</li>
                                    <li>5. <strong>Notify</strong> each member via Solana transaction with memo: {`group:groupId:arweaveTxId`}</li>
                                    <li>6. <strong>Receive</strong> notification → Fetch from Arweave → Decrypt personal key → Decrypt message</li>
                                </ol>
                            </div>

                            <div className="space-y-4">
                                <h4 className="mono accent text-sm uppercase tracking-widest">Data Storage Model</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-[rgba(255,255,255,0.02)] border border-white/5">
                                        <h5 className="mono text-xs signal uppercase mb-2">Redis</h5>
                                        <p className="text-xs opacity-60">Group metadata only (name, member list)</p>
                                        <p className="text-xs opacity-40 mt-1">NO MESSAGES STORED</p>
                                    </div>
                                    <div className="p-4 bg-[rgba(255,255,255,0.02)] border border-white/5">
                                        <h5 className="mono text-xs accent uppercase mb-2">Arweave</h5>
                                        <p className="text-xs opacity-60">Encrypted message payloads</p>
                                        <p className="text-xs opacity-40 mt-1">Cannot decrypt without member keys</p>
                                    </div>
                                    <div className="p-4 bg-[rgba(255,255,255,0.02)] border border-white/5">
                                        <h5 className="mono text-xs accent uppercase mb-2">Solana</h5>
                                        <p className="text-xs opacity-60">Notification transactions</p>
                                        <p className="text-xs opacity-40 mt-1">Pointers only, no content</p>
                                    </div>
                                    <div className="p-4 bg-[rgba(255,255,255,0.02)] border border-white/5">
                                        <h5 className="mono text-xs signal uppercase mb-2">Your Device</h5>
                                        <p className="text-xs opacity-60">Decryption keys</p>
                                        <p className="text-xs opacity-40 mt-1">Never leave your device</p>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-[rgba(0,127,255,0.05)] border border-[rgba(0,127,255,0.1)] rounded-lg">
                                <h4 className="mono text-xs signal uppercase mb-3 tracking-widest">Privacy Guarantees</h4>
                                <ul className="space-y-2 mono text-xs opacity-80">
                                    <li>✓ End-to-end encrypted - only group members can decrypt</li>
                                    <li>✓ No plaintext storage - messages encrypted before Arweave upload</li>
                                    <li>✓ Server cannot read - backend only routes encrypted blobs</li>
                                    <li>✓ Forward secrecy - new symmetric key per message</li>
                                    <li>✓ Metadata on-chain - groups stored on Solana with Redis cache</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section id="encryption" className="mb-32">
                        <h2 className="text-3xl font-serif italic mb-8 border-b border-[var(--accent)] pb-4 inline-block pr-12">
                            07. Encryption Deep Dive
                        </h2>
                        <div className="space-y-8">
                            <div>
                                <h4 className="mono accent text-sm uppercase tracking-widest mb-4">Encryption Flow</h4>
                                <ol className="space-y-3 text-sm leading-relaxed opacity-80">
                                    <li>1. Sender generates message plaintext</li>
                                    <li>2. Client fetches recipient's X25519 public key from on-chain registry</li>
                                    <li>3. Client encrypts with NaCl box (Diffie-Hellman + ChaCha20-Poly1305)</li>
                                    <li>4. Client signs transaction with Ed25519 keypair</li>
                                    <li>5. Transaction sent to blockchain with two instructions:
                                        <ul className="ml-6 mt-2 space-y-1">
                                            <li>a. SystemProgram.transfer(1 lamport) → triggers recipient's listener</li>
                                            <li>b. MemoProgram instruction → stores "senderPubkey|encryptedMessage"</li>
                                        </ul>
                                    </li>
                                </ol>
                            </div>

                            <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-white/5">
                                <h4 className="mono accent text-sm uppercase tracking-widest mb-4">On-Chain Storage</h4>
                                <ul className="space-y-2 text-sm leading-relaxed opacity-80">
                                    <li>• Messages live in Solana transaction logs (memo instructions)</li>
                                    <li>• Anyone can read the encrypted ciphertext (public blockchain)</li>
                                    <li>• Only recipient can decrypt (requires their private X25519 key)</li>
                                    <li>• Large messages (&gt;750 bytes) uploaded to Arweave, memo stores "ar:txId"</li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="mono accent text-sm uppercase tracking-widest mb-4">Security Properties</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 bg-[rgba(0,255,0,0.05)] border border-[rgba(0,255,0,0.1)]">
                                        <p className="mono text-xs text-green-400 mb-2">✓ SECURE</p>
                                        <ul className="space-y-1 text-sm opacity-80">
                                            <li>• End-to-end encrypted</li>
                                            <li>• Forward secrecy (random nonce)</li>
                                            <li>• Authenticated encryption</li>
                                            <li>• Publicly verifiable</li>
                                        </ul>
                                    </div>
                                    <div className="p-4 bg-[rgba(255,0,0,0.05)] border border-[rgba(255,0,0,0.1)]">
                                        <p className="mono text-xs text-red-400 mb-2">✗ LIMITATIONS</p>
                                        <ul className="space-y-1 text-sm opacity-80">
                                            <li>• No perfect forward secrecy</li>
                                            <li>• Metadata visible</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h4 className="mono accent text-sm uppercase tracking-widest mb-4">Why It's Secure</h4>
                                <ul className="space-y-2 text-sm leading-relaxed opacity-80">
                                    <li>• Private keys never leave device (stored in OS keychain)</li>
                                    <li>• Server is stateless fee-payer (can't decrypt without private keys)</li>
                                    <li>• Encryption happens client-side before transmission</li>
                                    <li>• Uses audited cryptography library (TweetNaCl)</li>
                                    <li>• X25519 provides 128-bit security level</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section id="developers" className="mb-32">
                        <h2 className="text-3xl font-serif italic mb-8 border-b border-[var(--accent)] pb-4 inline-block pr-12">
                            08. Developer Guide
                        </h2>
                        <div className="space-y-8">
                            <div className="p-6 bg-[rgba(0,127,255,0.08)] border border-[rgba(0,127,255,0.2)] rounded-lg mb-8">
                                <p className="text-lg leading-relaxed opacity-90 mb-4">
                                    Build your own Key client using the open protocol. No permission needed - the protocol is fully permissionless.
                                </p>
                                <Link href="/developers" className="inline-flex items-center gap-2 mono text-sm signal hover:underline">
                                    View Full Developer Portal & API Reference →
                                </Link>
                            </div>

                            <div className="p-6 bg-[rgba(212,175,55,0.03)] border border-[rgba(212,175,55,0.1)] rounded-lg">
                                <h3 className="mono text-xs accent uppercase mb-4 tracking-widest">What You Can Build</h3>
                                <ul className="space-y-2 text-sm opacity-80">
                                    <li>• <strong>Custom Frontends:</strong> Desktop apps, CLI tools, browser extensions, mobile clients</li>
                                    <li>• <strong>Alternative Backends:</strong> Your own fee-payer service with custom rate limits</li>
                                    <li>• <strong>Bots & Automation:</strong> Automated messaging, notification systems, integrations</li>
                                    <li>• <strong>Analytics Tools:</strong> On-chain message analytics (encrypted content remains private)</li>
                                    <li>• <strong>Bridge Services:</strong> Connect Key to other messaging platforms</li>
                                </ul>
                            </div>

                            <div>
                                <h4 className="mono accent text-sm uppercase tracking-widest mb-4">1. Register Username (via API)</h4>
                                <div className="code-block">
                                    <pre className="text-emerald-400">{`// Step 1: Generate keypair`}</pre>
                                    <pre className="text-white">{`const keypair = nacl.sign.keyPair();`}</pre>
                                    <pre className="text-white">{`const encKeypair = nacl.box.keyPair.fromSecretKey(keypair.secretKey.slice(0, 32));`}</pre>
                                    <pre>&nbsp;</pre>
                                    <pre className="text-emerald-400">{`// Step 2: Register on-chain`}</pre>
                                    <pre className="text-white">{`await fetch('https://api.trykey.app/api/username/register', {`}</pre>
                                    <pre className="text-gray-400">{`  method: 'POST',`}</pre>
                                    <pre className="text-gray-400">{`  headers: { 'Content-Type': 'application/json' },`}</pre>
                                    <pre className="text-gray-400">{`  body: JSON.stringify({`}</pre>
                                    <pre className="text-blue-400">{`    username: 'alice',`}</pre>
                                    <pre className="text-blue-400">{`    publicKey: bs58.encode(keypair.publicKey),`}</pre>
                                    <pre className="text-blue-400">{`    encryptionKey: base64(encKeypair.publicKey),`}</pre>
                                    <pre className="text-blue-400">{`    signature: base64(signature),`}</pre>
                                    <pre className="text-blue-400">{`    timestamp: Date.now()`}</pre>
                                    <pre className="text-gray-400">{`  })`}</pre>
                                    <pre className="text-white">{`});`}</pre>
                                </div>
                            </div>

                            <div>
                                <h4 className="mono accent text-sm uppercase tracking-widest mb-4">2. Send 1-on-1 Message</h4>
                                <div className="code-block">
                                    <pre className="text-emerald-400">{`// Encrypt message with recipient's public key`}</pre>
                                    <pre className="text-white">{`const nonce = nacl.randomBytes(24);`}</pre>
                                    <pre className="text-white">{`const encrypted = nacl.box(messageBytes, nonce, recipientPubKey, mySecretKey);`}</pre>
                                    <pre className="text-white">{`const combined = new Uint8Array([...nonce, ...encrypted]);`}</pre>
                                    <pre>&nbsp;</pre>
                                    <pre className="text-emerald-400">{`// Send via API`}</pre>
                                    <pre className="text-white">{`await fetch('https://api.trykey.app/api/message/send', {`}</pre>
                                    <pre className="text-gray-400">{`  method: 'POST',`}</pre>
                                    <pre className="text-gray-400">{`  body: JSON.stringify({`}</pre>
                                    <pre className="text-blue-400">{`    encryptedMessage: base64(combined),`}</pre>
                                    <pre className="text-blue-400">{`    recipientPubkey: recipientPubkey,`}</pre>
                                    <pre className="text-blue-400">{`    senderPubkey: myPubkey,`}</pre>
                                    <pre className="text-blue-400">{`    signature: base64(signature),`}</pre>
                                    <pre className="text-blue-400">{`    timestamp: Date.now()`}</pre>
                                    <pre className="text-gray-400">{`  })`}</pre>
                                    <pre className="text-white">{`});`}</pre>
                                </div>
                            </div>

                            <div>
                                <h4 className="mono accent text-sm uppercase tracking-widest mb-4">3. Send Group Message</h4>
                                <div className="code-block">
                                    <pre className="text-emerald-400">{`// Step 1: Generate symmetric key`}</pre>
                                    <pre className="text-white">{`const symmetricKey = nacl.randomBytes(32);`}</pre>
                                    <pre className="text-white">{`const nonce = nacl.randomBytes(24);`}</pre>
                                    <pre className="text-white">{`const encrypted = nacl.secretbox(messageBytes, nonce, symmetricKey);`}</pre>
                                    <pre>&nbsp;</pre>
                                    <pre className="text-emerald-400">{`// Step 2: Encrypt symmetric key for each member`}</pre>
                                    <pre className="text-white">{`const encryptedKeys = {};`}</pre>
                                    <pre className="text-white">{`for (const memberPubKey of groupMembers) {`}</pre>
                                    <pre className="text-gray-400">{`  const keyNonce = nacl.randomBytes(24);`}</pre>
                                    <pre className="text-gray-400">{`  const encKey = nacl.box(symmetricKey, keyNonce, memberPubKey, mySecretKey);`}</pre>
                                    <pre className="text-gray-400">{`  encryptedKeys[base58(memberPubKey)] = base64([...keyNonce, ...encKey]);`}</pre>
                                    <pre className="text-white">{`}`}</pre>
                                    <pre>&nbsp;</pre>
                                    <pre className="text-emerald-400">{`// Step 3: Send to group`}</pre>
                                    <pre className="text-white">{`await fetch('https://api.trykey.app/api/message/group/GROUP_ID/send', {`}</pre>
                                    <pre className="text-gray-400">{`  method: 'POST',`}</pre>
                                    <pre className="text-gray-400">{`  body: JSON.stringify({`}</pre>
                                    <pre className="text-blue-400">{`    encryptedMessage: base64([...nonce, ...encrypted]),`}</pre>
                                    <pre className="text-blue-400">{`    encryptedKeys: encryptedKeys,`}</pre>
                                    <pre className="text-blue-400">{`    senderPubkey: myPubkey,`}</pre>
                                    <pre className="text-blue-400">{`    signature: base64(signature),`}</pre>
                                    <pre className="text-blue-400">{`    timestamp: Date.now()`}</pre>
                                    <pre className="text-gray-400">{`  })`}</pre>
                                    <pre className="text-white">{`});`}</pre>
                                </div>
                            </div>

                            <div>
                                <h4 className="mono accent text-sm uppercase tracking-widest mb-4">4. Direct Program Calls (No API)</h4>
                                <p className="text-sm opacity-80 mb-4">
                                    For fully decentralized clients, call the Solana program directly:
                                </p>
                                <div className="code-block">
                                    <pre className="text-emerald-400">{`// Register username (direct on-chain)`}</pre>
                                    <pre className="text-blue-400">{`const PROGRAM_ID = new PublicKey('96hG67JxhNEptr1LkdtDcrqvtWiHH3x4GibDBcdh4MYQ');`}</pre>
                                    <pre className="text-white">{`const [userPDA] = PublicKey.findProgramAddressSync(`}</pre>
                                    <pre className="text-gray-400">{`  [Buffer.from('username'), Buffer.from('alice')],`}</pre>
                                    <pre className="text-gray-400">{`  PROGRAM_ID`}</pre>
                                    <pre className="text-white">{`);`}</pre>
                                    <pre>&nbsp;</pre>
                                    <pre className="text-emerald-400">{`// Send message (direct memo instruction)`}</pre>
                                    <pre className="text-blue-400">{`const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');`}</pre>
                                    <pre className="text-white">{`const tx = new Transaction().add(`}</pre>
                                    <pre className="text-gray-400">{`  SystemProgram.transfer({ fromPubkey: sender, toPubkey: recipient, lamports: 1 }),`}</pre>
                                    <pre className="text-gray-400">{`  new TransactionInstruction({`}</pre>
                                    <pre className="text-gray-400">{`    programId: MEMO_PROGRAM,`}</pre>
                                    <pre className="text-gray-400">{`    keys: [],`}</pre>
                                    <pre className="text-gray-400">{`    data: Buffer.from(senderPubkey + '|' + encryptedMessage)`}</pre>
                                    <pre className="text-gray-400">{`  })`}</pre>
                                    <pre className="text-white">{`);`}</pre>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-6 bg-[rgba(0,127,255,0.05)] border border-[rgba(0,127,255,0.1)] rounded-lg">
                                    <h4 className="mono text-xs signal uppercase mb-3 tracking-widest">Required Libraries</h4>
                                    <ul className="space-y-2 mono text-xs opacity-80">
                                        <li>• @solana/web3.js - Blockchain</li>
                                        <li>• tweetnacl - Encryption</li>
                                        <li>• bs58 - Encoding</li>
                                    </ul>
                                </div>
                                <div className="p-6 bg-[rgba(212,175,55,0.03)] border border-[rgba(212,175,55,0.1)] rounded-lg">
                                    <h4 className="mono text-xs accent uppercase mb-3 tracking-widest">API Endpoints</h4>
                                    <ul className="space-y-2 mono text-xs opacity-80">
                                        <li>• /api/username/register</li>
                                        <li>• /api/message/send</li>
                                        <li>• /api/message/inbox/:pubkey</li>
                                        <li>• /api/groups/create</li>
                                        <li>• /api/groups/invite</li>
                                        <li>• /api/groups/leave</li>
                                        <li>• /api/groups/join/:code</li>
                                        <li>• /api/groups/public/search</li>
                                        <li>• /api/message/group/:id/send</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="p-6 bg-[rgba(212,175,55,0.05)] border border-[rgba(212,175,55,0.15)] rounded-lg">
                                <h4 className="mono text-sm accent uppercase mb-3 tracking-widest">🔓 Fully Permissionless</h4>
                                <p className="text-sm opacity-80">
                                    No API keys, no approval process, no vendor lock-in. Build your client today and connect
                                    to the Key network immediately. All program calls are on-chain and publicly accessible.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section id="sustainability" className="mb-32">
                        <h2 className="text-3xl font-serif italic mb-8 border-b border-[var(--accent)] pb-4 inline-block pr-12">
                            09. Sustainability
                        </h2>
                        <div className="space-y-8">
                            <p className="font-serif italic text-2xl leading-relaxed text-[var(--accent)] opacity-90 border-l-2 border-[var(--accent)] pl-8">
                                "True privacy should not have a subscription fee. The Key Protocol is sustained by the $KEY token on Pump.fun. We utilize the creator fees generated by $KEY volume to subsidize gas costs for every message sent on the network. By holding $KEY, you are not just an investor; you are a Patron of privacy."
                            </p>
                            <p className="opacity-80 leading-relaxed">
                                The Key Protocol is a native Solana protocol. Every whisper, every registry update, and every signal is a permanent, onchain record on the Solana blockchain. We don't hide behind sidechains; we leverage the raw performance of the mainnet.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-white/5">
                                    <h4 className="mono accent text-xs mb-2 uppercase">Network</h4>
                                    <p className="text-xl font-serif">Solana Mainnet</p>
                                </div>
                                <div className="p-6 bg-[rgba(255,255,255,0.02)] border border-white/5">
                                    <h4 className="mono accent text-xs mb-2 uppercase">Token Launch</h4>
                                    <p className="text-xl font-serif">Pump.fun</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section id="manifesto" className="pb-40">
                        <h2 className="text-3xl font-serif italic mb-8 border-b border-[var(--ink)] pb-4 inline-block pr-12">
                            10. Manifesto
                        </h2>
                        <div className="font-serif italic text-2xl leading-relaxed opacity-90 border-l-2 border-[var(--accent)] pl-8 space-y-8">
                            <p>
                                In an era of digital panopticons, we reclaim the whisper.
                                We believe that privacy is not a luxury for the guilty,
                                but a prerequisite for the free.
                            </p>
                            <p>
                                Key is not just a tool, but a statement. It is the architectural
                                embodiment of the idea that code can be as immutable as stone
                                and as fleeting as thought.
                            </p>
                            <p className="text-[var(--accent)]">
                                Verba Volant, Scripta Manent.
                            </p>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    )
}
