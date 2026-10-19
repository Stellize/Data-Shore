import { Component, useEffect } from 'react';
import { Route, Routes, Outlet, useLocation } from 'react-router-dom';
import TopBar from './components/TopBar.jsx';
import Footer from './components/Footer.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { HubContext, useHub } from './HubContext.js';
import { useFetch } from './hooks.js';
import Home from './pages/Home.jsx';
import Archives from './pages/Archives.jsx';
import Archive from './pages/Archive.jsx';
import SearchPage from './pages/SearchPage.jsx';
import About from './pages/About.jsx';
import NotFound from './pages/NotFound.jsx';
import ConsoleApp from './console/ConsoleApp.jsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [pathname]);
  return null;
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash">
          <span className="eyebrow">Unexpected weather</span>
          <h1>The shore lost the thread.</h1>
          <p>{this.state.error.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PublicLayout() {
  const hub = useHub();
  const announcement = hub.data?.settings?.announcement;
  return (
    <div className="site">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <TopBar />
      {announcement ? (
        <div className="site-announcement" role="status">
          <div className="site-announcement-inner">{announcement}</div>
        </div>
      ) : null}
      <main className="site-main" id="content">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  const hub = useFetch('/api/hub');
  return (
    <HubContext.Provider value={hub}>
      <ToastProvider>
        <ErrorBoundary>
          <ScrollToTop />
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
              <Route path="archives" element={<Archives />} />
              <Route path="archives/:slug" element={<Archive />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="about" element={<About />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="/console/*" element={<ConsoleApp />} />
          </Routes>
        </ErrorBoundary>
      </ToastProvider>
    </HubContext.Provider>
  );
}
