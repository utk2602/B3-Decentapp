import Hero from "@/components/Hero";
import PerpetualEngine from "@/components/PerpetualEngine";
import Architecture from "@/components/Architecture";
import Treasury from "@/components/Treasury";
import Footer from "@/components/Footer";
import BackgroundParticles from "@/components/BackgroundParticles";

export default function Home() {
  return (
    <>
      <BackgroundParticles />
      <main>
        <Hero />
        <PerpetualEngine />
        <Architecture />
        <Treasury />
        <Footer />
      </main>
    </>
  );
}
