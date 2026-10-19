import { Intro } from './components/Intro';
import { Progress } from './components/Progress';
import { Cursor } from './components/Cursor';
import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { Residence } from './components/Residence';
import { Gallery } from './components/Gallery';
import { Amenities } from './components/Amenities';
import { Breath } from './components/Breath';
import { PointeNoire } from './components/PoinreNoire';
import { Booking } from './components/Booking';
import { Finale } from './components/Finale';
import { Footer } from './components/Footer';
import { WaFloat } from './components/WaFloat';

export default function App() {
  return (
    <>
      <a className="skip-link" href="#residence">Aller au contenu</a>
      <Intro />
      <Progress />
      <Cursor />
      <Nav />
      <main>
        <Hero />
        <Residence />
        <Gallery />
        <Amenities />
        <Breath />
        <PointeNoire />
        <Booking />
        <Finale />
      </main>
      <Footer />
      <WaFloat />
    </>
  );
}
