import { Route, Router, type RouteSectionProps } from '@solidjs/router'
import Footer from './components/Footer'
import Header from './components/Header'
import { GuestOnArrival, GuestOnly, RequireAuth } from './components/RouteGuards'
import Auth from './pages/auth/Auth'
import ExternalAuth from './pages/auth/ExternalAuth'
import Catalog from './pages/catalog/Catalog'
import Dashboard from './pages/dashboard/Dashboard'
import Landing from './pages/landing/Landing'
import NotFound from './pages/NotFound'
import Pricing from './pages/pricing/Pricing'

function Layout(props: RouteSectionProps) {
  return (
    <>
      <Header />
      {props.children}
      <Footer />
    </>
  )
}

function App() {
  return (
    <Router>
      {/* Auth pages are standalone: no header or footer. */}
      <Route component={GuestOnArrival}>
        <Route path={['/login', '/signup']} component={Auth} />
      </Route>
      <Route path="/external-auth" component={ExternalAuth} />
      <Route component={Layout}>
        <Route component={GuestOnly}>
          <Route path="/" component={Landing} />
          <Route path="/catalog" component={Catalog} />
          <Route path="/pricing" component={Pricing} />
        </Route>
        <Route component={RequireAuth}>
          <Route path="/dashboard" component={Dashboard} />
        </Route>
        <Route path="*" component={NotFound} />
      </Route>
    </Router>
  )
}

export default App
