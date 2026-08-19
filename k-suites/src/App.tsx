import { Portal } from './components/Portal';
import { Nav } from './components/Nav';
import { Page } from './components/Page';
import { Footer } from './components/Footer';

export default function App() {
  return (
    <>
      <a className="skip" href="#suites">
        Aller aux suites
      </a>
      <Portal />
      <Nav />
      <Page />
      <Footer />
    </>
  );
}
