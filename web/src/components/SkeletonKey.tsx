"use client"

import { motion } from "framer-motion"

export default function SkeletonKey() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draw: any = {
        hidden: { pathLength: 0, opacity: 0 },
        visible: (i: number) => {
            const delay = 1 + i * 0.3;
            return {
                pathLength: 1,
                opacity: 1,
                transition: {
                    pathLength: { delay, type: "spring", duration: 1.5, bounce: 0 },
                    opacity: { delay, duration: 0.01 }
                }
            };
        }
    };

    return (
        <motion.svg
            width="100%"
            height="100%"
            viewBox="0 0 200 200"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="key-svg"
            style={{ filter: "drop-shadow(0 0 10px rgba(212, 175, 55, 0.2))" }}
        >
            {/* Handle - Circle with ornament */}
            <motion.circle
                cx="100"
                cy="50"
                r="30"
                stroke="var(--accent)"
                strokeWidth="1.5"
                fill="transparent"
                variants={draw}
                custom={0}
            />
            <motion.circle
                cx="100"
                cy="50"
                r="22"
                stroke="var(--accent)"
                strokeWidth="0.8"
                fill="transparent"
                variants={draw}
                custom={0.2}
            />

            {/* Intricate handle details */}
            <motion.path
                d="M 75 40 Q 100 20 125 40 M 75 60 Q 100 80 125 60"
                stroke="var(--accent)"
                strokeWidth="0.5"
                fill="transparent"
                variants={draw}
                custom={0.4}
            />

            {/* Shaft */}
            <motion.path
                d="M 100 80 L 100 170"
                stroke="var(--accent)"
                strokeWidth="2"
                variants={draw}
                custom={0.6}
            />

            {/* Teeth */}
            <motion.path
                d="M 100 145 L 125 145 L 125 155 L 100 155"
                stroke="var(--accent)"
                strokeWidth="1.5"
                fill="transparent"
                variants={draw}
                custom={0.8}
            />
            <motion.path
                d="M 100 160 L 120 160 L 120 170 L 100 170"
                stroke="var(--accent)"
                strokeWidth="1.5"
                fill="transparent"
                variants={draw}
                custom={1}
            />

            {/* Wireframe dissolving effect */}
            <motion.circle
                cx="140"
                cy="140"
                r="40"
                stroke="var(--signal)"
                strokeWidth="0.2"
                fill="transparent"
                strokeDasharray="2 2"
                variants={draw}
                custom={1.2}
            />
            <motion.path
                d="M 100 80 L 150 120 L 180 180 M 100 120 L 160 160"
                stroke="var(--signal)"
                strokeWidth="0.3"
                fill="transparent"
                strokeDasharray="4 4"
                variants={draw}
                custom={1.4}
            />

            {/* Geometric circles around the handle */}
            <motion.circle
                cx="100"
                cy="50"
                r="45"
                stroke="var(--signal)"
                strokeWidth="0.1"
                fill="transparent"
                strokeDasharray="1 3"
                variants={draw}
                custom={1.6}
            />
        </motion.svg>
    );
}
