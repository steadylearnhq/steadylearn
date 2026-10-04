import { Route, Router, type RouteSectionProps } from '@solidjs/router'
import CookieBanner from './components/CookieBanner'
import Footer from './components/Footer'
import Header from './components/Header'
import { GuestOnArrival, GuestOnly, RequireAuth } from './components/RouteGuards'
import Auth from './pages/auth/Auth'
import ExternalAuth from './pages/auth/ExternalAuth'
import Catalog from './pages/catalog/Catalog'
import CoursePage from './pages/course/Course'
import Dashboard from './pages/dashboard/Dashboard'
import Landing from './pages/landing/Landing'
import MyCourses from './pages/my-courses/MyCourses'
import NotFound from './pages/NotFound'
import Pricing from './pages/pricing/Pricing'
import Checkout from './pages/subscription/Checkout'
import Subscription from './pages/subscription/Subscription'
import { Privacy, Terms } from './pages/legal/Legal'

function Layout(props: RouteSectionProps) {
  return (
    <div class="shell">
      <Header />
      {props.children}
      <Footer />
    </div>
  )
}

/** Wraps every route, so the cookie sheet covers the standalone pages too. */
function Root(props: RouteSectionProps) {
  return (
    <>
      {props.children}
      <CookieBanner />
    </>
  )
}

function App() {
  return (
    <Router root={Root}>
      {/* Auth pages are standalone: no header or footer. */}
      <Route component={GuestOnArrival}>
        <Route path={['/login', '/signup']} component={Auth} />
      </Route>
      <Route path="/external-auth" component={ExternalAuth} />
      {/* The review before payment stands alone too. */}
      <Route component={RequireAuth}>
        <Route path="/subscription/checkout" component={Checkout} />
      </Route>
      <Route component={Layout}>
        <Route component={GuestOnly}>
          <Route path="/" component={Landing} />
          <Route path="/pricing" component={Pricing} />
        </Route>
        <Route component={RequireAuth}>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/my-courses" component={MyCourses} />
          <Route path="/courses/:id" component={CoursePage} />
          <Route path="/subscription" component={Subscription} />
        </Route>
        {/* Open to everyone: members see their progress on the catalog and need the terms as much as visitors do. */}
        <Route path="/catalog" component={Catalog} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="*" component={NotFound} />
      </Route>
    </Router>
  )
}

export default App
