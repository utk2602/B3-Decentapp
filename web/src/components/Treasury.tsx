"use client"

import { motion } from "framer-motion"

export default function Treasury() {
    return (
        <section className="treasury-section">
            <div className="treasury-content">
                <motion.h2
                    className="accent"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1 }}
                >Support the Foundation.</motion.h2>

                <motion.p
                    className="subtitle"
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 0.8 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3, duration: 1 }}
                >
                    "The Key Foundation is a non-profit initiative to protect the right to whisper in a digital age. Direct contributions fuel the gas relayer and extend the network's lifespan."
                </motion.p>

                <div className="treasury-grid">
                    <motion.div
                        className="treasury-info"
                        initial={{ opacity: 0, x: -30 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: 0.5 }}
                    >

                        <div className="address-bar" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                            <span className="mono">6V1AyUweJhZTNqZFHMFZKFxgDEBZhQSTqGjTkRJ3d2jQ</span>
                        </div>
                    </motion.div>

                    <div className="qr-container">
                        <LabyrinthQR />
                    </div>
                </div>
            </div>
        </section>
    )
}

function LabyrinthQR() {
    return (
        <motion.svg
            viewBox="0 0 200 200"
            className="labyrinth-qr"
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5 }}
        >
            {/* Labyrinth-styled "QR" shape */}
            <motion.path
                d="M 20 20 L 180 20 L 180 180 L 20 180 Z"
                stroke="var(--accent)" strokeWidth="0.5" fill="transparent"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                transition={{ duration: 2 }}
            />
            <motion.path
                d="M 40 40 L 160 40 L 160 160 L 40 160 Z"
                stroke="var(--accent)" strokeWidth="0.5" fill="transparent"
                opacity="0.6"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                transition={{ duration: 2, delay: 0.3 }}
            />

            {/* Maze bits */}
            <motion.path
                d="M 40 80 H 100 V 120 H 60 V 100 M 120 40 V 100 H 160 M 60 40 V 80 H 80"
                stroke="var(--accent)" strokeWidth="0.8" fill="transparent"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                transition={{ duration: 3, delay: 0.5 }}
            />
            <motion.path
                d="M 120 160 V 130 H 140 V 160 M 80 160 V 140 H 100"
                stroke="var(--accent)" strokeWidth="0.8" fill="transparent"
                initial={{ pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                transition={{ duration: 3, delay: 0.7 }}
            />

            <motion.circle
                cx="100" cy="100" r="5"
                fill="var(--signal)"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
            />
        </motion.svg>
    )
}
