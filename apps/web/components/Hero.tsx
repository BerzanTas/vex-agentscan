import { SearchBar } from "./SearchBar";

export function Hero() {
  return (
    <section className="hero section-enter">
      <div className="flex flex-col items-center gap-6 px-6 py-16 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="hero-kicker">ON-CHAIN VERIFIED // VEX AGENTS</p>
          <h1 className="hero-title font-serif text-4xl text-text-primary sm:text-5xl">
            Vex agent activity,
            <br />
            verified on-chain
          </h1>
        </div>
        <SearchBar />
      </div>
    </section>
  );
}
