"use client"

import { motion, AnimatePresence } from "framer-motion"
import { X, Apple, Smartphone, Globe } from "lucide-react"

interface TryKeyModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function TryKeyModal({ isOpen, onClose }: TryKeyModalProps) {
    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="modal-backdrop"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-40%" }}
                        animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                        exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-40%" }}
                        className="modal-container"
                    >
                        <button
                            onClick={onClose}
                            className="modal-close"
                        >
                            <X size={24} />
                        </button>

                        <h3 className="accent mb-2" style={{ textAlign: 'center', fontSize: '1.75rem' }}>Enter the Protocol</h3>
                        <p className="mono opacity-60 mb-8" style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                            Choose your gateway to sovereign communication.
                        </p>

                        <div className="modal-options">
                            {/* Apple - Active */}
                            <a
                                href="http://localhost:8081/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="modal-option"
                            >
                                <div className="option-icon">
                                    <Apple size={24} />
                                </div>
                                <div className="option-text">
                                    <div className="option-title">iOS / iPad / Mac</div>
                                    <div className="option-status">Available on App Store</div>
                                </div>
                            </a>

                            {/* Android - Disabled */}
                            <div className="modal-option disabled">
                                <div className="option-icon">
                                    <Smartphone size={24} />
                                </div>
                                <div className="option-text">
                                    <div className="option-title">Android</div>
                                    <div className="option-status" style={{ color: 'var(--ink)', opacity: 0.6 }}>Coming Soon</div>
                                </div>
                            </div>

                            {/* Web - Active */}
                            <a
                                href="https://web.trykey.app/onboarding"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="modal-option"
                            >
                                <div className="option-icon">
                                    <Globe size={24} />
                                </div>
                                <div className="option-text">
                                    <div className="option-title">Web Client</div>
                                    <div className="option-status">Available Now</div>
                                </div>
                            </a>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
