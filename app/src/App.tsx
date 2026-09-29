import { Route, Router, type RouteSectionProps } from '@solidjs/router'
import Footer from './components/Footer'
import Header from './components/Header'
import Landing from './pages/landing/Landing'
import NotFound from './pages/NotFound'

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
    <Router root={Layout}>
      <Route path="/" component={Landing} />
      <Route path="*" component={NotFound} />
    </Router>
  )
}

export default App
