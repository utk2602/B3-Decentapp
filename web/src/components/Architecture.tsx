"use client"

import { motion } from "framer-motion"

export default function Architecture() {
    const specs = [
        { title: "Invisible Cryptography", desc: "Keys generated locally. No wallet connection required." },
        { title: "Ephemeral Relay", desc: "Messages vanish from the relay upon decryption." },
        { title: "Censorship Resistant", desc: "Usernames etched immutably onto the Solana ledger." }
    ]

    return (
        <section className="arch-section">
            <div className="container">
                <div className="arch-header">
                    <motion.h2
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 1 }}
                    >Zero Knowledge. Zero Cost.</motion.h2>
                </div>

                <div className="arch-grid">
                    <div className="arch-visual">
                        <SmartphoneSketch />
                    </div>

                    <div className="arch-specs">
                        {specs.map((spec, i) => (
                            <motion.div
                                key={i}
                                className="spec-item"
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.8, delay: i * 0.2 }}
                            >
                                <h3 className="accent">{spec.title}</h3>
                                <p className="mono">{spec.desc}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}

function SmartphoneSketch() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lineVariants: any = {
        hidden: { pathLength: 0, opacity: 0 },
        visible: (i: number) => ({
            pathLength: 1,
            opacity: 0.6,
            transition: {
                pathLength: { delay: i * 0.1, duration: 2, ease: "easeInOut" },
                opacity: { delay: i * 0.1, duration: 0.5 }
            }
        })
    }

    return (
        <motion.svg viewBox="0 0 400 500" className="arch-svg">
            {/* Smartphone Outer Shell */}
            <motion.rect
                x="100" y="50" width="180" height="360" rx="20"
                stroke="var(--ink)" strokeWidth="0.5" fill="transparent"
                variants={lineVariants} custom={0} initial="hidden" whileInView="visible" viewport={{ once: true }}
            />

            {/* Exploded Screen Plate */}
            <motion.rect
                x="130" y="20" width="180" height="360" rx="20"
                stroke="var(--accent)" strokeWidth="0.3" fill="transparent"
                variants={lineVariants} custom={5} initial="hidden" whileInView="visible" viewport={{ once: true }}
            />

            {/* Connection lines for exploded view */}
            <motion.path
                d="M 100 50 L 130 20 M 280 50 L 310 20 M 100 410 L 130 380 M 280 410 L 310 380"
                stroke="var(--accent)" strokeWidth="0.2" strokeDasharray="2 2"
                variants={lineVariants} custom={8} initial="hidden" whileInView="visible" viewport={{ once: true }}
            />

            {/* Internal Circuits / Chips */}
            <motion.rect
                x="140" y="100" width="100" height="80"
                stroke="var(--signal)" strokeWidth="0.3" fill="transparent"
                variants={lineVariants} custom={10} initial="hidden" whileInView="visible" viewport={{ once: true }}
            />
            <motion.circle
                cx="190" cy="140" r="20"
                stroke="var(--signal)" strokeWidth="0.2" fill="transparent"
                variants={lineVariants} custom={12} initial="hidden" whileInView="visible" viewport={{ once: true }}
            />

            {/* Manuscript labels */}
            <text x="50" y="70" fill="var(--ink)" className="mono" style={{ fontSize: '10px', opacity: 0.5 }}>FIG. I - ANATOMY</text>
            <text x="320" y="50" fill="var(--accent)" className="mono" style={{ fontSize: '10px', opacity: 0.5 }}>SHIELD LAYER</text>
            <text x="250" y="170" fill="var(--signal)" className="mono" style={{ fontSize: '10px', opacity: 0.5 }}>ZK-MODULE</text>

            {/* Da Vinci style hatching/shading lines */}
            <motion.path
                d="M 110 300 L 140 300 M 110 310 L 140 310 M 110 320 L 140 320"
                stroke="var(--ink)" strokeWidth="0.1"
                variants={lineVariants} custom={15} initial="hidden" whileInView="visible" viewport={{ once: true }}
            />
        </motion.svg>
    )
}
