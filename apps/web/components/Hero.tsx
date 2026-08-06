import { SearchBar } from "./SearchBar";

export function Hero() {
  return (
    <section className="hero section-enter">
      <div className="flex flex-col items-center gap-6 px-6 py-16 text-center">
        <h1 className="font-serif text-4xl text-text-primary sm:text-5xl">
          Vex agent activity,
          <br />
          verified on-chain
        </h1>
        <SearchBar />
      </div>
    </section>
  );
}
