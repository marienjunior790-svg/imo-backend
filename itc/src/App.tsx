import { Stage } from './components/Stage';
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { Chapters } from './components/Chapters';
import { Footer } from './components/Footer';

export default function App() {
  return (
    <>
      <a className="skip" href="#explorer">
        Aller au contenu
      </a>
      <Stage />
      <Nav />
      <main>
        <Hero />
        <Chapters />
      </main>
      <Footer />
    </>
  );
}
