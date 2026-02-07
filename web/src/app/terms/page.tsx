"use client";

import BackgroundParticles from "@/components/BackgroundParticles";
import Footer from "@/components/Footer";
import { motion } from "framer-motion";

export default function TermsPage() {
    return (
        <>
            <BackgroundParticles />
            <main className="min-h-screen pt-32 pb-16 relative z-10">
                <article className="max-w-4xl mx-auto px-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <h1 className="title-large mb-12 text-left">Terms of Service</h1>

                        <div className="prose prose-invert max-w-none">
                            <section className="mb-12">
                                <p className="subtitle mb-8 text-left accent">
                                    LAST UPDATED: JANUARY 2026
                                </p>

                                <p className="font-serif text-xl leading-relaxed mb-8 opacity-90">
                                    By using Key, you agree to these terms. Key is a decentralized messaging protocol.
                                    Please read carefully.
                                </p>
                            </section>

                            <div className="space-y-12 font-serif">
                                <section className="engine-section !py-8 !border-0 !bg-transparent">
                                    <h2 className="text-2xl font-cinzel text-accent mb-4">1. Zero Tolerance Policy</h2>
                                    <p className="opacity-80 leading-relaxed">
                                        Key has absolutely no tolerance for objectionable content, abusive behavior, or illegal activities.
                                        This includes but is not limited to:
                                    </p>
                                    <ul className="list-disc pl-6 space-y-2 mt-4 opacity-70 font-mono text-sm">
                                        <li>Harassment, bullying, threats</li>
                                        <li>Hate speech, discrimination, racism</li>
                                        <li>Sexually explicit content</li>
                                        <li>Spam, scams, fraud</li>
                                        <li>Illegal activities</li>
                                        <li>Doxing or revealing private information</li>
                                    </ul>
                                    <p className="opacity-80 leading-relaxed mt-4">
                                        Violation of these terms will result in <strong>permanent removal</strong> from protocol.
                                    </p>
                                </section>

                                <section className="engine-section !py-8 !border-0 !bg-transparent">
                                    <h2 className="text-2xl font-cinzel text-accent mb-4">2. User Responsibilities</h2>
                                    <p className="opacity-80 leading-relaxed">
                                        As a user of Key, you agree to:
                                    </p>
                                    <ul className="list-disc pl-6 space-y-2 mt-4 opacity-70 font-mono text-sm">
                                        <li>Only share content you have rights to share</li>
                                        <li>Respect other users' privacy and boundaries</li>
                                        <li>Report objectionable content you encounter</li>
                                        <li>Not attempt to circumvent security measures</li>
                                        <li>Use protocol only for legal, legitimate purposes</li>
                                    </ul>
                                </section>

                                <section className="engine-section !py-8 !border-0 !bg-transparent">
                                    <h2 className="text-2xl font-cinzel text-accent mb-4">3. Content Moderation</h2>
                                    <p className="opacity-80 leading-relaxed">
                                        Key provides tools for users to protect themselves:
                                    </p>
                                    <ul className="list-disc pl-6 space-y-2 mt-4 opacity-70 font-mono text-sm">
                                        <li><strong>Block:</strong> Block any user to prevent them from messaging you</li>
                                        <li><strong>Report:</strong> Flag objectionable content for review within 24 hours</li>
                                        <li><strong>Encryption:</strong> All messages are end-to-end encrypted</li>
                                    </ul>
                                    <p className="opacity-80 leading-relaxed mt-4">
                                        <strong>Note:</strong> Messages are stored on-chain and cannot be deleted. 
                                        When a user is blocked, their messages are hidden from your view, 
                                        and they can no longer send you new messages.
                                    </p>
                                </section>

                                <section className="engine-section !py-8 !border-0 !bg-transparent">
                                    <h2 className="text-2xl font-cinzel text-accent mb-4">4. Enforcement</h2>
                                    <p className="opacity-80 leading-relaxed">
                                        We are committed to reviewing all content reports within 24 hours of submission.
                                        Upon verification of violations:
                                    </p>
                                    <ul className="list-disc pl-6 space-y-2 mt-4 opacity-70 font-mono text-sm">
                                        <li>Offending users will be permanently blocked from protocol</li>
                                        <li>Repeated violations from same user will result in immediate termination</li>
                                        <li>We reserve right to modify or terminate access at any time</li>
                                    </ul>
                                </section>

                                <section className="engine-section !py-8 !border-0 !bg-transparent">
                                    <h2 className="text-2xl font-cinzel text-accent mb-4">5. Liability & Disclaimer</h2>
                                    <p className="opacity-80 leading-relaxed">
                                        Key is provided "as is" without warranties. We are not responsible for:
                                    </p>
                                    <ul className="list-disc pl-6 space-y-2 mt-4 opacity-70 font-mono text-sm">
                                        <li>User-generated content</li>
                                        <li>Messages stored on-chain (cannot be deleted once confirmed)</li>
                                        <li>Third-party services or networks</li>
                                        <li>Lost access due to lost private keys</li>
                                    </ul>
                                </section>

                                <section className="engine-section !py-8 !border-0 !bg-transparent">
                                    <h2 className="text-2xl font-cinzel text-accent mb-4">6. Contact</h2>
                                    <p className="opacity-80 leading-relaxed">
                                        For questions or to report violations:
                                    </p>
                                    <p className="opacity-80 leading-relaxed mt-2">
                                        <strong>Email:</strong> support@trykey.app
                                    </p>
                                </section>
                            </div>
                        </div>
                    </motion.div>
                </article>
            </main>
            <Footer />
        </>
    );
}