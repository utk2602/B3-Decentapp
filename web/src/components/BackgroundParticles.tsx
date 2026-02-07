"use client"

import { useEffect, useState } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

export default function BackgroundParticles() {
    const [init, setInit] = useState(false);

    useEffect(() => {
        initParticlesEngine(async (engine) => {
            await loadSlim(engine);
        }).then(() => {
            setInit(true);
        });
    }, []);

    if (!init) return null;

    return (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: -1, pointerEvents: "none" }}>
            <Particles
                id="tsparticles"
                options={{
                    background: { opacity: 0 },
                    particles: {
                        color: { value: "#F5F5DC" },
                        number: { value: 40, density: { enable: true, width: 800, height: 800 } },
                        opacity: { value: { min: 0.05, max: 0.15 } },
                        size: { value: { min: 0.5, max: 1.5 } },
                        move: {
                            enable: true,
                            speed: 0.2,
                            direction: "none",
                            random: true,
                            straight: false,
                            outModes: { default: "out" }
                        }
                    }
                }}
            />
        </div>
    );
}
